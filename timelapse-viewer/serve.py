"""Simple HTTP server to serve the interactive timelapse viewer + scan data + icons."""

import argparse
import http.server
import json
import re
from pathlib import Path
from functools import partial


# Icon search paths within Factorio's data directory
ICON_SUBDIRS = [
    "base/graphics/icons",
    "base/graphics/icons/fluid",
    "space-age/graphics/icons",
    "space-age/graphics/icons/fluid",
    "quality/graphics/icons",
    "elevated-rails/graphics/icons",
]


class ViewerHandler(http.server.SimpleHTTPRequestHandler):
    """Serves viewer files + scan data + Factorio icons with CORS headers."""

    def __init__(self, *args, scan_dir: Path = None, viewer_dir: Path = None,
                 icon_dirs: list[Path] = None, **kwargs):
        self.scan_dir = scan_dir
        self.viewer_dir = viewer_dir
        self.icon_dirs = icon_dirs or []
        super().__init__(*args, **kwargs)

    def translate_path(self, path):
        """Route requests to appropriate directories."""
        # Strip query string
        path = path.split("?")[0]
        if path.startswith("/data/"):
            rel = path[6:]
            return str(self.scan_dir / rel)
        elif path == "/data" or path == "/data/":
            return str(self.scan_dir)
        elif path.startswith("/icons/"):
            # Search for icon in Factorio data directories
            icon_name = path[7:]  # strip /icons/
            for icon_dir in self.icon_dirs:
                icon_path = icon_dir / icon_name
                if icon_path.exists():
                    return str(icon_path)
            # Not found — return a path that won't exist (404)
            return str(self.viewer_dir / "nonexistent_icon")
        else:
            rel = path.lstrip("/")
            return str(self.viewer_dir / rel) if rel else str(self.viewer_dir / "index.html")

    def do_GET(self):
        if self.path == "/api/scans":
            self._serve_scan_list()
            return
        super().do_GET()

    def _serve_scan_list(self):
        """Return list of scan files with metadata."""
        def numeric_key(p):
            digits = re.sub(r"[^\d]", "", p.stem)
            return int(digits) if digits else 0

        scan_files = sorted(self.scan_dir.glob("scan_*.json"), key=numeric_key)
        files = [{"name": f.name, "url": f"/data/{f.name}",
                  "size": f.stat().st_size} for f in scan_files]

        data = json.dumps({"scans": files, "hasIcons": len(self.icon_dirs) > 0}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(data))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        # Cache icons aggressively
        if self.path.startswith("/icons/"):
            self.send_header("Cache-Control", "max-age=86400")
        super().end_headers()

    def log_message(self, format, *args):
        req = str(args[0]) if args else ""
        if "/api/" in req or req.endswith(".json") or req.startswith("GET /icons/"):
            pass
        else:
            super().log_message(format, *args)


def main():
    parser = argparse.ArgumentParser(description="Serve interactive Factorio timelapse viewer")
    parser.add_argument("--input", "-i", required=True, help="Directory containing scan_*.json files")
    parser.add_argument("--port", "-p", type=int, default=8090, help="Port (default: 8090)")
    parser.add_argument("--factorio-data", "-d", default=None,
                        help="Path to Factorio's data/ directory for item icons")
    args = parser.parse_args()

    scan_dir = Path(args.input).resolve()
    viewer_dir = Path(__file__).parent.resolve()

    if not scan_dir.exists():
        print(f"ERROR: {scan_dir} does not exist")
        return

    # Find icon directories
    icon_dirs = []
    if args.factorio_data:
        data_dir = Path(args.factorio_data).resolve()
        for subdir in ICON_SUBDIRS:
            p = data_dir / subdir
            if p.exists():
                icon_dirs.append(p)
        if icon_dirs:
            total_icons = sum(len(list(d.glob("*.png"))) for d in icon_dirs)
            print(f"Icons:      {len(icon_dirs)} directories, {total_icons} icons")
        else:
            print(f"Icons:      WARNING - no icon dirs found in {data_dir}")
    else:
        print("Icons:      disabled (use --factorio-data to enable)")

    scan_count = len(list(scan_dir.glob("scan_*.json")))
    print(f"Scan data:  {scan_dir} ({scan_count} files)")
    print(f"Viewer:     {viewer_dir}")
    print(f"Open:       http://localhost:{args.port}")
    print()

    handler = partial(ViewerHandler, scan_dir=scan_dir, viewer_dir=viewer_dir, icon_dirs=icon_dirs)
    server = http.server.HTTPServer(("", args.port), handler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
