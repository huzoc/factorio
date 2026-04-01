"""Automate scanning multiple Factorio saves using benchmark mode.

Uses --benchmark to load each save, run the auto-scan handler, then exit.
Supports parallel scanning with isolated write directories per worker.
"""

import argparse
import logging
import re
import subprocess
import shutil
import tempfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

logger = logging.getLogger(__name__)


def find_factorio() -> Path:
    """Try to find the Factorio executable."""
    common_paths = [
        Path("C:/Program Files/Factorio/bin/x64/factorio.exe"),
        Path("C:/Program Files (x86)/Steam/steamapps/common/Factorio/bin/x64/factorio.exe"),
        Path("D:/Steam/steamapps/common/Factorio/bin/x64/factorio.exe"),
        Path("D:/SteamLibrary/steamapps/common/Factorio/bin/x64/factorio.exe"),
    ]
    for p in common_paths:
        if p.exists():
            return p

    which = shutil.which("factorio")
    if which:
        return Path(which)

    return None


def find_script_output(factorio_exe: Path) -> Path:
    """Determine the script-output directory for the main Factorio install."""
    standalone_data = factorio_exe.parent.parent.parent
    standalone_indicators = ["data", "config", "mods", "saves", "script-output"]
    if any((standalone_data / d).exists() for d in standalone_indicators):
        return standalone_data / "script-output" / "factory-timelapse"
    return Path.home() / "AppData/Roaming/Factorio/script-output/factory-timelapse"


def _create_autoscan_settings(dst: Path):
    """Generate a minimal mod-settings.dat with factory-timelapse-autoscan enabled."""
    import struct

    buf = bytearray()
    buf += struct.pack('<4H', 2, 0, 76, 0)  # version 2.0.76.0
    buf += b'\x00'  # root flag

    def pack_str(s):
        b = s.encode('utf-8')
        return b'\x00' + struct.pack('B', len(b)) + b

    def pack_dict(n):
        return b'\x05\x00' + struct.pack('<I', n)

    buf += pack_dict(3)
    buf += pack_str("startup") + pack_dict(0)
    buf += pack_str("runtime-global") + pack_dict(1)
    buf += pack_str("factory-timelapse-autoscan") + pack_dict(1)
    buf += pack_str("value") + b'\x01\x00\x01'  # bool = true
    buf += pack_str("runtime-per-user") + pack_dict(0)

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(buf)


def _enable_autoscan_settings(worker_dir: Path, mod_dir: Path):
    """Create mod-settings.dat in worker dir with autoscan enabled.

    Copies existing settings and patches the flag, or generates a minimal
    settings file if the source is unavailable.
    """
    dst = worker_dir / "mods" / "mod-settings.dat"
    src = mod_dir / "mod-settings.dat"
    marker = b"factory-timelapse-autoscan"

    if src.exists():
        data = bytearray(src.read_bytes())
        idx = data.find(marker)
        if idx >= 0:
            # Bool value is 15 bytes after the end of the setting name:
            # dict(05 00) count(01 00 00 00) key_str(00 05 "value") bool(01 00 XX)
            val_offset = idx + len(marker) + 15
            if val_offset < len(data) and data[val_offset - 2] == 0x01:
                data[val_offset] = 0x01
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_bytes(data)
                return

    _create_autoscan_settings(dst)


def _create_worker_config(worker_dir: Path, factorio_exe: Path, mod_dir: Path) -> Path:
    """Create a minimal Factorio config pointing write-data to a worker-specific directory."""
    worker_dir.mkdir(parents=True, exist_ok=True)
    (worker_dir / "script-output").mkdir(exist_ok=True)
    (worker_dir / "script-output" / "factory-timelapse").mkdir(exist_ok=True)

    config_path = worker_dir / "config.ini"
    # Factorio config uses forward slashes and specific section names
    factorio_root = factorio_exe.parent.parent.parent
    config_path.write_text(
        f"[path]\n"
        f"read-data={factorio_root / 'data'}\n"
        f"write-data={worker_dir}\n",
        encoding="utf-8",
    )

    _enable_autoscan_settings(worker_dir, mod_dir)

    return config_path


def scan_single_save(
    factorio_exe: str,
    save_path: str,
    mod_dir: str,
    worker_base: str,
    save_index: int,
    timeout: int = 900,
) -> tuple[int, bool, str, float]:
    """Load a save via --benchmark, trigger the mod's auto-scan, collect output.

    Returns (save_index, success, message, size_kb, elapsed_s).
    Runs in a separate process for parallelism.
    """
    import time as _time
    t0 = _time.time()

    factorio_exe = Path(factorio_exe)
    save_path = Path(save_path)
    mod_dir = Path(mod_dir)
    worker_dir = Path(worker_base) / f"worker_{save_index}"

    try:
        config_path = _create_worker_config(worker_dir, factorio_exe, mod_dir)

        cmd = [
            str(factorio_exe),
            "--benchmark", str(save_path),
            "--benchmark-ticks", "3",
            "--config", str(config_path),
            "--mod-directory", str(mod_dir),
            "--disable-audio",
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        elapsed = _time.time() - t0

        if result.returncode != 0:
            lines = (result.stdout + result.stderr).strip().splitlines()
            last_lines = "\n".join(lines[-3:])
            return (save_index, False, f"exit code {result.returncode}: {last_lines}", 0, elapsed)

        # Collect the scan output — find the main nauvis scan (largest file)
        scan_dir = worker_dir / "script-output" / "factory-timelapse"
        output_files = sorted(scan_dir.glob("scan_*.json"), key=lambda f: f.stat().st_size, reverse=True) if scan_dir.exists() else []

        if not output_files:
            return (save_index, False, "no scan file produced", 0, elapsed)

        # Return all scan files as pipe-separated paths (largest/nauvis first)
        all_paths = "|".join(str(f) for f in output_files)
        size_kb = output_files[0].stat().st_size / 1024
        return (save_index, True, all_paths, size_kb, elapsed)

    except subprocess.TimeoutExpired:
        elapsed = _time.time() - t0
        return (save_index, False, "timeout", 0, elapsed)
    except Exception as e:
        elapsed = _time.time() - t0
        return (save_index, False, str(e), 0, elapsed)


def _inject_save_name(path: Path, save_name: str):
    """Add the source save filename into the scan JSON."""
    import json
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        data["save"] = save_name
        path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    except Exception as exc:
        logger.warning("Failed to inject save name into %s: %s", path, exc)


def _strip_water(path: Path):
    """Remove water data from a scan JSON to save space."""
    import json
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if "water" in data:
            del data["water"]
            path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    except Exception as exc:
        logger.warning("Failed to strip water from %s: %s", path, exc)


def main():
    parser = argparse.ArgumentParser(
        description="Batch-scan Factorio saves for timelapse data using benchmark mode."
    )
    parser.add_argument(
        "--saves", "-s", required=True,
        help="Directory containing save files (.zip)"
    )
    parser.add_argument(
        "--output", "-o", default="./scan_output",
        help="Directory to collect scan JSON files (default: ./scan_output)"
    )
    parser.add_argument(
        "--factorio", "-f", default=None,
        help="Path to factorio.exe (auto-detected if not specified)"
    )
    parser.add_argument(
        "--mod-dir", "-m", default=None,
        help="Path to Factorio mods directory (must contain factory-timelapse mod)"
    )
    parser.add_argument(
        "--start", type=int, default=0,
        help="Start from the Nth save (0-indexed, default: 0)"
    )
    parser.add_argument(
        "--first", "-n", type=int, default=None,
        help="Only process up to the first N saves (for testing)"
    )
    parser.add_argument(
        "--workers", "-w", type=int, default=1,
        help="Number of parallel Factorio instances (default: 1)"
    )
    parser.add_argument(
        "--timeout", type=int, default=900,
        help="Timeout per save in seconds (default: 900 = 15 min)"
    )
    parser.add_argument(
        "--skip-done", action="store_true",
        help="Skip saves that already have output files in the output directory"
    )

    args = parser.parse_args()

    # Find Factorio
    if args.factorio:
        factorio_exe = Path(args.factorio.strip().strip('"'))
        if factorio_exe.is_dir():
            factorio_exe = factorio_exe / "factorio.exe"
    else:
        factorio_exe = find_factorio()
    if not factorio_exe or not factorio_exe.exists():
        print(f"ERROR: Cannot find factorio.exe at: {factorio_exe}")
        return

    print(f"Factorio:  {factorio_exe}")

    # Find mod directory
    if args.mod_dir:
        mod_dir = Path(args.mod_dir)
    else:
        mod_dir = Path.home() / "AppData/Roaming/Factorio/mods"
    print(f"Mod dir:   {mod_dir}")

    # Find saves (sort numerically)
    def numeric_sort_key(p: Path) -> int:
        digits = re.sub(r"[^\d]", "", p.stem)
        return int(digits) if digits else 0

    saves_path = Path(args.saves)
    if saves_path.is_dir():
        saves = sorted(saves_path.glob("*.zip"), key=numeric_sort_key)
    else:
        saves = sorted(Path(".").glob(args.saves), key=numeric_sort_key)

    if not saves:
        print(f"ERROR: No save files found in {args.saves}")
        return

    if args.first:
        saves = saves[:args.first]
    if args.start:
        saves = saves[args.start:]

    print(f"Saves:     {len(saves)} (index {args.start}-{args.start + len(saves) - 1})")
    print(f"Workers:   {args.workers}")

    # Output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Temp directory for worker isolation
    worker_base = tempfile.mkdtemp(prefix="factorio_scan_")
    print(f"Work dir:  {worker_base}")
    print()

    # Check which saves already have output (for --skip-done)
    skipped = 0
    to_process = []
    for i, save in enumerate(saves):
        dest = output_dir / f"scan_{i:04d}.json"
        if args.skip_done and dest.exists() and dest.stat().st_size > 100:
            skipped += 1
        else:
            to_process.append((i, save))

    if skipped:
        print(f"Skipping {skipped} already-done saves.")
    print(f"To scan:   {len(to_process)}")
    print()

    # Water is static terrain — only keep it on every 10th save
    WATER_INTERVAL = 10

    def _collect_result(idx, save, ok, msg, size_kb):
        nonlocal success
        if ok:
            paths = [Path(p) for p in msg.split("|")]
            # First file is the largest (nauvis) — save as scan_NNNN.json
            dest = output_dir / f"scan_{idx:04d}.json"
            shutil.move(str(paths[0]), str(dest))
            _inject_save_name(dest, save.name)
            if idx % WATER_INTERVAL != 0:
                _strip_water(dest)
                size_kb = dest.stat().st_size / 1024
            # Copy extra surfaces (platforms, planets) with suffix
            for extra in paths[1:]:
                # Extract surface name from filename: scan_TICK_SURFACE.json
                parts = extra.stem.split("_", 2)
                suffix = parts[2] if len(parts) > 2 else extra.stem
                extra_dest = output_dir / f"scan_{idx:04d}_{suffix}.json"
                shutil.move(str(extra), str(extra_dest))
                _inject_save_name(extra_dest, save.name)
            success += 1
            return True, size_kb
        return False, 0

    def _fmt_time(s):
        if s < 60: return f"{s:.0f}s"
        return f"{int(s)//60}m{int(s)%60:02d}s"

    if args.workers <= 1:
        # Sequential mode
        success = 0
        for i, save in to_process:
            print(f"[{i:3d}/{len(saves)}] {save.name}", end=" ... ", flush=True)
            idx, ok, msg, size_kb, elapsed = scan_single_save(
                str(factorio_exe), str(save), str(mod_dir), worker_base, i,
                timeout=args.timeout,
            )
            ok2, size_kb2 = _collect_result(idx, save, ok, msg, size_kb)
            if ok2:
                water_tag = " +water" if i % WATER_INTERVAL == 0 else ""
                print(f"OK ({size_kb2:.0f} KB{water_tag}) [{_fmt_time(elapsed)}]")
            else:
                print(f"FAILED ({msg}) [{_fmt_time(elapsed)}]")
    else:
        # Parallel mode
        success = 0
        pending = len(to_process)
        with ProcessPoolExecutor(max_workers=args.workers) as pool:
            futures = {
                pool.submit(
                    scan_single_save,
                    str(factorio_exe), str(save), str(mod_dir), worker_base, i,
                    args.timeout,
                ): (i, save)
                for i, save in to_process
            }

            for future in as_completed(futures):
                i, save = futures[future]
                try:
                    idx, ok, msg, size_kb, elapsed = future.result()
                    ok2, size_kb2 = _collect_result(idx, save, ok, msg, size_kb)
                    if ok2:
                        water_tag = " +water" if idx % WATER_INTERVAL == 0 else ""
                        print(f"[{idx:3d}] {save.name} — OK ({size_kb2:.0f} KB{water_tag}) [{_fmt_time(elapsed)}]  [{success}/{pending}]")
                    else:
                        print(f"[{idx:3d}] {save.name} — FAILED ({msg}) [{_fmt_time(elapsed)}]")
                except Exception as e:
                    print(f"[{i:3d}] {save.name} — ERROR ({e})")

    # Cleanup
    shutil.rmtree(worker_base, ignore_errors=True)

    print(f"\n=== Done: {success}/{len(saves)} saves scanned ===")
    print(f"Output: {output_dir}")
    if success > 0:
        print(f"\nNext: python main.py --input {output_dir} --output timelapse.mp4")


if __name__ == "__main__":
    main()
