"""Generate a showcase GIF from preprocessed viewer data."""

import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# Entity colors (matching viewer.js)
ENTITY_COLORS = {
    "transport-belt": (230,195,50), "fast-transport-belt": (210,50,50),
    "express-transport-belt": (50,130,210), "turbo-transport-belt": (130,210,50),
    "underground-belt": (230,195,50), "fast-underground-belt": (210,50,50),
    "splitter": (230,195,50), "fast-splitter": (210,50,50),
    "inserter": (220,200,60), "burner-inserter": (180,160,50),
    "long-handed-inserter": (200,60,60), "fast-inserter": (60,120,210),
    "bulk-inserter": (60,180,60), "stack-inserter": (60,180,60),
    "assembling-machine-1": (160,160,170), "assembling-machine-2": (130,175,220),
    "assembling-machine-3": (100,180,255),
    "stone-furnace": (170,100,30), "steel-furnace": (200,140,50), "electric-furnace": (230,180,80),
    "burner-mining-drill": (130,90,40), "electric-mining-drill": (160,120,60),
    "lab": (180,180,220), "solar-panel": (50,60,80), "accumulator": (60,60,60),
    "small-electric-pole": (210,60,60), "medium-electric-pole": (210,60,60),
    "big-electric-pole": (210,60,60), "substation": (210,60,60),
    "stone-wall": (100,100,100), "gun-turret": (100,100,100), "laser-turret": (100,100,100),
    "pipe": (120,180,180), "pipe-to-ground": (120,180,180),
    "storage-tank": (60,160,180), "roboport": (170,80,200),
    "straight-rail": (140,140,140), "curved-rail-a": (140,140,140),
    "curved-rail-b": (140,140,140), "half-diagonal-rail": (140,140,140),
    "nuclear-reactor": (180,220,60),
}

CATEGORY_COLORS = {
    "belt": (230,195,50), "inserter": (220,200,60), "assembler": (130,175,220),
    "power": (210,60,60), "mining": (160,120,60), "logistics": (170,80,200),
    "pipe": (120,180,180), "storage": (200,160,60), "rail": (140,140,140),
    "wall": (100,100,100), "furnace": (200,140,50), "lab": (180,180,220),
    "enemy": (180,40,40), "resource": (45,45,50), "other": (150,150,150),
}

ENTITY_CATEGORIES = {}
def _init():
    m = {
        "belt": ["transport-belt","fast-transport-belt","express-transport-belt","turbo-transport-belt",
                 "underground-belt","fast-underground-belt","splitter","fast-splitter","express-splitter"],
        "inserter": ["burner-inserter","inserter","long-handed-inserter","fast-inserter","bulk-inserter","stack-inserter"],
        "assembler": ["assembling-machine-1","assembling-machine-2","assembling-machine-3","chemical-plant","oil-refinery"],
        "furnace": ["stone-furnace","steel-furnace","electric-furnace"],
        "mining": ["burner-mining-drill","electric-mining-drill","big-mining-drill","pumpjack"],
        "power": ["boiler","steam-engine","solar-panel","accumulator","nuclear-reactor","small-electric-pole",
                  "medium-electric-pole","big-electric-pole","substation"],
        "pipe": ["pipe","pipe-to-ground","pump","offshore-pump","storage-tank"],
        "rail": ["straight-rail","curved-rail-a","curved-rail-b","half-diagonal-rail","rail-signal","rail-chain-signal","train-stop"],
        "wall": ["stone-wall","gate","gun-turret","laser-turret","flamethrower-turret","radar"],
        "lab": ["lab"], "logistics": ["roboport","active-provider-chest","passive-provider-chest","requester-chest"],
        "enemy": ["small-biter","medium-biter","big-biter","behemoth-biter","small-spitter","medium-spitter",
                  "big-spitter","behemoth-spitter","biter-spawner","spitter-spawner",
                  "small-worm-turret","medium-worm-turret","big-worm-turret"],
        "resource": ["iron-ore","copper-ore","coal","stone","uranium-ore","crude-oil"],
    }
    for cat, names in m.items():
        for n in names: ENTITY_CATEGORIES[n] = cat
_init()

def get_color(name):
    if name in ENTITY_COLORS: return ENTITY_COLORS[name]
    cat = ENTITY_CATEGORIES.get(name, "other")
    return CATEGORY_COLORS.get(cat, (150,150,150))

SIZES = {
    "assembling-machine-1":(3,3),"assembling-machine-2":(3,3),"assembling-machine-3":(3,3),
    "chemical-plant":(3,3),"oil-refinery":(5,5),"stone-furnace":(2,2),"steel-furnace":(2,2),
    "electric-furnace":(3,3),"electric-mining-drill":(3,3),"burner-mining-drill":(2,2),
    "boiler":(3,2),"steam-engine":(3,5),"solar-panel":(3,3),"accumulator":(2,2),
    "nuclear-reactor":(5,5),"roboport":(4,4),"storage-tank":(3,3),"radar":(3,3),
    "gun-turret":(2,2),"laser-turret":(2,2),"lab":(3,3),"rocket-silo":(9,9),
    "biter-spawner":(4,4),"spitter-spawner":(4,4),
}


def main():
    parser = argparse.ArgumentParser(description="Generate showcase GIF from preprocessed data")
    parser.add_argument("--input", "-i", required=True, help="viewer_data.json file")
    parser.add_argument("--output", "-o", default="showcase.gif", help="Output GIF path")
    parser.add_argument("--width", type=int, default=800, help="GIF width (default: 800)")
    parser.add_argument("--height", type=int, default=450, help="GIF height (default: 450)")
    parser.add_argument("--frames", type=int, default=200, help="Number of frames (default: 200)")
    parser.add_argument("--fps", type=int, default=15, help="Frames per second (default: 15)")
    parser.add_argument("--skip-resources", action="store_true", help="Skip resource patches for speed")
    args = parser.parse_args()

    print(f"Loading {args.input}...")
    data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    events = data["events"]
    water = data.get("water")
    print(f"  {len(events)} events")

    W, H = args.width, args.height
    BG = (25, 25, 30)
    WATER = (28, 40, 58)

    # Build world states at evenly spaced time points
    world = {}  # key -> {n, x, y, d, ...}
    frames = []
    total_frames = args.frames
    ei = 0

    # Pre-compute camera path by sampling world at key points
    print("Computing camera path...")
    sample_world = {}
    camera_samples = []
    sei = 0
    for t_frac in [i / 20 for i in range(21)]:
        while sei < len(events) and events[sei]["t"] <= t_frac:
            ev = events[sei]
            if ev["a"] == "b":
                sample_world[ev["k"]] = ev
            else:
                sample_world.pop(ev["k"], None)
            sei += 1
        # Compute bbox excluding resources
        xs = [e["x"] for e in sample_world.values()
              if ENTITY_CATEGORIES.get(e["n"], "other") not in ("resource", "enemy")]
        ys = [e["y"] for e in sample_world.values()
              if ENTITY_CATEGORIES.get(e["n"], "other") not in ("resource", "enemy")]
        if xs and ys:
            camera_samples.append((min(xs), max(xs), min(ys), max(ys)))

    print(f"Rendering {total_frames} frames at {W}x{H}...")

    try:
        font = ImageFont.truetype("consola.ttf", 14)
        font_small = ImageFont.truetype("consola.ttf", 11)
    except:
        font = ImageFont.load_default()
        font_small = font

    for frame_num in range(total_frames):
        t = frame_num / (total_frames - 1) if total_frames > 1 else 0

        # Apply events up to this time
        while ei < len(events) and events[ei]["t"] <= t:
            ev = events[ei]
            if ev["a"] == "b":
                world[ev["k"]] = ev
            else:
                world.pop(ev["k"], None)
            ei += 1

        # Camera: smooth interpolation through samples
        sample_idx = t * (len(camera_samples) - 1) if camera_samples else 0
        si = int(sample_idx)
        sf = sample_idx - si
        if si >= len(camera_samples) - 1:
            si = len(camera_samples) - 2
            sf = 1.0
        if si < 0: si = 0

        if camera_samples:
            s0 = camera_samples[min(si, len(camera_samples)-1)]
            s1 = camera_samples[min(si+1, len(camera_samples)-1)]
            minx = s0[0] + (s1[0] - s0[0]) * sf
            maxx = s0[1] + (s1[1] - s0[1]) * sf
            miny = s0[2] + (s1[2] - s0[2]) * sf
            maxy = s0[3] + (s1[3] - s0[3]) * sf
        else:
            minx, maxx, miny, maxy = -50, 50, -50, 50

        bw = max(maxx - minx, 20)
        bh = max(maxy - miny, 20)
        cx = (minx + maxx) / 2
        cy = (miny + maxy) / 2
        zoom = min(W / (bw * 1.3), H / (bh * 1.3))
        zoom = max(1.5, min(zoom, 40))

        # Render frame
        img = Image.new("RGB", (W, H), BG)
        draw = ImageDraw.Draw(img)

        def w2s(wx, wy):
            return (int((wx - cx) * zoom + W/2), int((wy - cy) * zoom + H/2))

        # Water
        if water and zoom >= 1:
            for wt in water[::max(1, int(4/zoom))]:
                sx, sy = w2s(wt[0], wt[1])
                if 0 <= sx < W and 0 <= sy < H:
                    s = max(1, int(zoom))
                    draw.rectangle([sx, sy, sx+s, sy+s], fill=WATER)

        # Entities
        for ev in world.values():
            name = ev["n"]
            cat = ENTITY_CATEGORIES.get(name, "other")
            if args.skip_resources and cat == "resource":
                continue

            ex, ey = ev["x"], ev["y"]
            sx, sy = w2s(ex, ey)
            if sx < -20 or sx > W+20 or sy < -20 or sy > H+20:
                continue

            color = get_color(name)
            w, h = SIZES.get(name, (1, 1))
            pw, ph = max(1, int(w * zoom)), max(1, int(h * zoom))

            if cat == "resource":
                draw.rectangle([sx, sy, sx+max(1,int(zoom)), sy+max(1,int(zoom))], fill=color)
            elif cat in ("belt", "pipe"):
                draw.rectangle([sx-pw//2, sy-ph//2, sx+pw//2, sy+ph//2], fill=color)
            else:
                draw.rectangle([sx-pw//2, sy-ph//2, sx+pw//2, sy+ph//2], fill=color)
                if pw > 4:
                    dc = tuple(max(0, c-40) for c in color)
                    draw.rectangle([sx-pw//2, sy-ph//2, sx+pw//2, sy+ph//2], outline=dc)

        # HUD
        entity_count = sum(1 for e in world.values() if ENTITY_CATEGORIES.get(e["n"], "other") not in ("resource", "enemy"))
        tick = data["meta"]["firstTick"] + t * data["meta"]["totalTicks"]
        secs = int(tick / 60)
        hrs, mins, s = secs // 3600, (secs % 3600) // 60, secs % 60
        time_str = f"{hrs}:{mins:02d}:{s:02d}" if hrs else f"{mins}:{s:02d}"

        # Clock
        draw.rectangle([8, 8, 100, 26], fill=(0,0,0))
        draw.text((12, 9), time_str, fill=(220,220,220), font=font_small)

        # Entity count
        draw.rectangle([W-130, 8, W-8, 26], fill=(0,0,0))
        draw.text((W-126, 9), f"{entity_count} entities", fill=(180,180,180), font=font_small)

        # Progress bar
        draw.rectangle([0, H-3, W, H], fill=(60,60,60))
        draw.rectangle([0, H-3, int(W*t), H], fill=(100,180,100))

        frames.append(img)

        if frame_num % 20 == 0:
            print(f"  Frame {frame_num}/{total_frames} | {len(world)} entities | zoom={zoom:.1f}")

    # Save as GIF
    print(f"Saving {args.output}...")
    duration = int(1000 / args.fps)
    frames[0].save(
        args.output,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        optimize=True,
    )

    size_mb = Path(args.output).stat().st_size / (1024 * 1024)
    print(f"Done: {args.output} ({size_mb:.1f} MB, {len(frames)} frames, {len(frames)/args.fps:.1f}s)")


if __name__ == "__main__":
    main()
