"""Preprocess scan data into a single optimized file for the web viewer.

Moves all heavy computation (diffing, ordering, interpolation, player positions,
activity text) to this offline step. The webapp just loads and renders.

Output format: single JSON with:
- events: [{t, action, key, name, x, y, dir, product, belt_type}]
- water: [[x,y], ...]
- playerPositions: [{t, x, y, real}]
- activities: [{t, text}]
- meta: {totalTicks, firstTick, lastTick, snapshotCount}
- checkpoints: [{t, entities: {key: {name,x,y,dir,product,belt_type}}}]
"""

import argparse
import json
import math
import re
from pathlib import Path
from collections import Counter


INSTANT_CATEGORIES = {"enemy", "resource"}

ENTITY_CATEGORIES = {}
def _init_categories():
    m = {
        "belt": ["transport-belt","fast-transport-belt","express-transport-belt","turbo-transport-belt",
                 "underground-belt","fast-underground-belt","express-underground-belt","turbo-underground-belt",
                 "splitter","fast-splitter","express-splitter","turbo-splitter","loader","fast-loader","express-loader","turbo-loader"],
        "inserter": ["burner-inserter","inserter","long-handed-inserter","fast-inserter","bulk-inserter","stack-inserter"],
        "assembler": ["assembling-machine-1","assembling-machine-2","assembling-machine-3","chemical-plant",
                       "oil-refinery","centrifuge","electromagnetic-plant","biochamber","cryogenic-plant","foundry","recycler","rocket-silo"],
        "furnace": ["stone-furnace","steel-furnace","electric-furnace"],
        "mining": ["burner-mining-drill","electric-mining-drill","big-mining-drill","pumpjack","agricultural-tower"],
        "power": ["boiler","steam-engine","solar-panel","accumulator","nuclear-reactor","heat-exchanger","steam-turbine",
                  "fusion-reactor","fusion-generator","small-electric-pole","medium-electric-pole","big-electric-pole","substation","lightning-rod"],
        "pipe": ["pipe","pipe-to-ground","pump"],"fluid": ["offshore-pump","storage-tank"],
        "storage": ["wooden-chest","iron-chest","steel-chest"],
        "logistics": ["active-provider-chest","passive-provider-chest","storage-chest","buffer-chest","requester-chest","roboport","cargo-landing-pad"],
        "rail": ["straight-rail","curved-rail-a","curved-rail-b","half-diagonal-rail","rail-signal","rail-chain-signal","train-stop",
                 "cargo-wagon","locomotive","fluid-wagon","artillery-wagon"],
        "wall": ["stone-wall","gate","gun-turret","laser-turret","flamethrower-turret","artillery-turret","radar","land-mine"],
        "combinator": ["arithmetic-combinator","decider-combinator","constant-combinator","selector-combinator","power-switch","programmable-speaker"],
        "lab": ["lab","biolab"],
        "enemy": ["small-biter","medium-biter","big-biter","behemoth-biter","small-spitter","medium-spitter","big-spitter","behemoth-spitter",
                  "biter-spawner","spitter-spawner","small-worm-turret","medium-worm-turret","big-worm-turret","behemoth-worm-turret"],
        "resource": ["iron-ore","copper-ore","coal","stone","uranium-ore","crude-oil"],
    }
    for cat, names in m.items():
        for n in names:
            ENTITY_CATEGORIES[n] = cat

_init_categories()

def get_category(name):
    if name in ENTITY_CATEGORIES:
        return ENTITY_CATEGORIES[name]
    if any(x in name for x in ("biter","spitter","worm","spawner")):
        return "enemy"
    if any(x in name for x in ("ore","crude")) or name in ("coal","stone"):
        return "resource"
    return "other"


# Direction vectors (Factorio 2.0: 16-direction)
import math as _math
_DIR_DX = [0]*16
_DIR_DY = [0]*16
for _i in range(16):
    _a = (_i/16)*_math.pi*2 - _math.pi/2
    _DIR_DX[_i] = round(_math.cos(_a + _math.pi/2), 3)
    _DIR_DY[_i] = round(_math.sin(_a + _math.pi/2), 3)
_DIR_DX[0]=0;_DIR_DY[0]=-1; _DIR_DX[4]=1;_DIR_DY[4]=0; _DIR_DX[8]=0;_DIR_DY[8]=1; _DIR_DX[12]=-1;_DIR_DY[12]=0

BELT_NAMES = {
    "transport-belt","fast-transport-belt","express-transport-belt","turbo-transport-belt",
}
UNDERGROUND_NAMES = {
    "underground-belt","fast-underground-belt","express-underground-belt","turbo-underground-belt",
    "loader","fast-loader","express-loader","turbo-loader",
}
SPLITTER_NAMES = {
    "splitter","fast-splitter","express-splitter","turbo-splitter",
}
PIPE_NAMES = {"pipe", "pipe-to-ground"}
FLUID_NAMES = {"offshore-pump", "storage-tank", "pump"}


def _compute_connections(entities):
    """Compute belt and pipe connections from position + direction data.

    Only fills in 'bn' for entities that don't already have it from the API.
    Also computes 'pn' (pipe neighbours) for pipe entities.
    """
    # Build position lookup: rounded (x,y) -> entity dict
    pos_lookup = {}
    for key, e in entities.items():
        px = round(e["x"] * 2) / 2
        py = round(e["y"] * 2) / 2
        pos_lookup[(px, py)] = e

    for key, e in entities.items():
        name = e["name"]

        # Belt connections
        if name in BELT_NAMES and not e.get("bn"):
            d = e["dir"] % 16
            dx = round(_DIR_DX[d]) if d < len(_DIR_DX) else 0
            dy = round(_DIR_DY[d]) if d < len(_DIR_DY) else 0
            bn = []

            # Output: in the facing direction (only connect to belts, splitters, undergrounds)
            out_pos = (round((e["x"] + dx) * 2) / 2, round((e["y"] + dy) * 2) / 2)
            out_n = pos_lookup.get(out_pos)
            if out_n and (out_n["name"] in BELT_NAMES or out_n["name"] in SPLITTER_NAMES or out_n["name"] in UNDERGROUND_NAMES):
                bn.append({"d": "o", "x": out_n["x"], "y": out_n["y"]})

            # Input: from behind
            in_pos = (round((e["x"] - dx) * 2) / 2, round((e["y"] - dy) * 2) / 2)
            in_n = pos_lookup.get(in_pos)
            if in_n and (in_n["name"] in BELT_NAMES or in_n["name"] in SPLITTER_NAMES):
                # Check it's actually pointing toward us
                ind = in_n["dir"] % 16
                indx = round(_DIR_DX[ind]) if ind < len(_DIR_DX) else 0
                indy = round(_DIR_DY[ind]) if ind < len(_DIR_DY) else 0
                if indx == dx and indy == dy:
                    bn.append({"d": "i", "x": in_n["x"], "y": in_n["y"]})

            # Side inputs: belts pointing at us from the side
            for sdx, sdy in [(0,-1),(1,0),(0,1),(-1,0)]:
                if (sdx == dx and sdy == dy) or (sdx == -dx and sdy == -dy):
                    continue
                s_pos = (round((e["x"] + sdx) * 2) / 2, round((e["y"] + sdy) * 2) / 2)
                s_n = pos_lookup.get(s_pos)
                if s_n and s_n["name"] in BELT_NAMES:
                    sd = s_n["dir"] % 16
                    sdirx = round(_DIR_DX[sd]) if sd < len(_DIR_DX) else 0
                    sdiry = round(_DIR_DY[sd]) if sd < len(_DIR_DY) else 0
                    if sdirx == -sdx and sdiry == -sdy:
                        bn.append({"d": "i", "x": s_n["x"], "y": s_n["y"]})

            if bn:
                e["bn"] = bn

        # Underground belt connections
        elif name in UNDERGROUND_NAMES and not e.get("bn"):
            d = e["dir"] % 16
            dx = round(_DIR_DX[d]) if d < len(_DIR_DX) else 0
            dy = round(_DIR_DY[d]) if d < len(_DIR_DY) else 0
            bn = []

            # Check behind for input belt — must be pointing same direction as us
            in_pos = (round((e["x"] - dx) * 2) / 2, round((e["y"] - dy) * 2) / 2)
            in_n = pos_lookup.get(in_pos)
            if in_n and in_n["name"] in BELT_NAMES:
                ind = in_n["dir"] % 16
                indx = round(_DIR_DX[ind]) if ind < len(_DIR_DX) else 0
                indy = round(_DIR_DY[ind]) if ind < len(_DIR_DY) else 0
                if indx == dx and indy == dy:
                    bn.append({"d": "i", "x": in_n["x"], "y": in_n["y"]})

            # Check ahead for output belt — must be pointing same direction as us
            out_pos = (round((e["x"] + dx) * 2) / 2, round((e["y"] + dy) * 2) / 2)
            out_n = pos_lookup.get(out_pos)
            if out_n and out_n["name"] in BELT_NAMES:
                ond = out_n["dir"] % 16
                ondx = round(_DIR_DX[ond]) if ond < len(_DIR_DX) else 0
                ondy = round(_DIR_DY[ond]) if ond < len(_DIR_DY) else 0
                if ondx == dx and ondy == dy:
                    bn.append({"d": "o", "x": out_n["x"], "y": out_n["y"]})

            if bn:
                e["bn"] = bn

        # Pipe connections
        elif name in PIPE_NAMES and not e.get("pn"):
            pn = []
            for pdx, pdy in [(0,-1),(1,0),(0,1),(-1,0)]:
                p_pos = (round((e["x"] + pdx) * 2) / 2, round((e["y"] + pdy) * 2) / 2)
                p_n = pos_lookup.get(p_pos)
                if p_n and (p_n["name"] in PIPE_NAMES or p_n["name"] in FLUID_NAMES
                            or get_category(p_n["name"]) == "pipe"
                            or get_category(p_n["name"]) == "fluid"):
                    pn.append({"x": p_n["x"], "y": p_n["y"]})
            if pn:
                e["pn"] = pn

    # Rail connections: build a proper rail graph
    # Instead of per-entity connections, store edges as a separate structure
    RAIL_NAMES_SET = {"straight-rail", "curved-rail-a", "curved-rail-b", "half-diagonal-rail"}
    rail_entities = [(key, e) for key, e in entities.items()
                     if e["name"] in RAIL_NAMES_SET]

    if rail_entities:
        _compute_rail_graph(entities, rail_entities)


def _compute_rail_graph(entities, rail_entities):
    """Compute rail connections by building a graph.

    For straight rails: connect to next/prev straight rail along axis (2 tiles apart).
    For all rails: also connect to the single nearest rail in each quadrant
    that isn't already connected, to handle curves and junctions.
    """
    # Position lookup
    pos_map = {}
    for key, e in rail_entities:
        pos_map[(round(e["x"], 1), round(e["y"], 1))] = e

    for key, e in rail_entities:
        if e.get("conn"):
            continue  # already has API-provided connections

        d = e["dir"] % 16
        dx = round(_DIR_DX[d]) if d < len(_DIR_DX) else 0
        dy = round(_DIR_DY[d]) if d < len(_DIR_DY) else 0
        conn = set()

        if e["name"] == "straight-rail":
            # Connect to adjacent straight rails along axis (2 tiles apart)
            for mult in (-2, 2):
                nx = round(e["x"] + dx * mult, 1)
                ny = round(e["y"] + dy * mult, 1)
                if (nx, ny) in pos_map:
                    conn.add((pos_map[(nx, ny)]["x"], pos_map[(nx, ny)]["y"]))

        # For any rail with < 2 connections: find nearest in forward/backward direction
        if len(conn) < 2:
            # Collect all nearby rails with distances
            candidates = []
            for rkey, re in rail_entities:
                if re is e:
                    continue
                rdx = re["x"] - e["x"]
                rdy = re["y"] - e["y"]
                dist_sq = rdx * rdx + rdy * rdy
                if dist_sq <= 400 and dist_sq > 0:  # within 20 tiles
                    candidates.append((dist_sq, re["x"], re["y"], rdx, rdy))

            candidates.sort()

            # For each candidate, only add if it's in a direction we don't already cover
            for dist_sq, cx, cy, rdx, rdy in candidates:
                if len(conn) >= 2:
                    break
                ckey = (cx, cy)
                if ckey in conn:
                    continue

                # Check if this direction is different from existing connections
                is_new_direction = True
                for ex_x, ex_y in conn:
                    # Dot product: if both in same direction, skip
                    edx = ex_x - e["x"]
                    edy = ex_y - e["y"]
                    dot = rdx * edx + rdy * edy
                    elen = (edx*edx + edy*edy) ** 0.5
                    rlen = (rdx*rdx + rdy*rdy) ** 0.5
                    if elen > 0 and rlen > 0:
                        cos_angle = dot / (elen * rlen)
                        if cos_angle > 0.7:  # same general direction
                            is_new_direction = False
                            break

                if is_new_direction:
                    conn.add((cx, cy))

        if conn:
            e["conn"] = [[c[0], c[1]] for c in conn]


def parse_live_events(events_path):
    """Parse live mode events.jsonl, handling save reloads.

    When a session_start event has a tick <= the previous session's last tick,
    all events from the previous session after the reload point are discarded.
    """
    import json

    raw_events = []
    with open(events_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                raw_events.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    if not raw_events:
        return []

    # Find session boundaries
    sessions = []  # list of (start_idx, start_tick)
    for i, ev in enumerate(raw_events):
        if ev.get("action") == "session_start":
            sessions.append((i, ev["tick"]))

    if not sessions:
        # No session markers — return all events as-is
        return [ev for ev in raw_events if ev.get("action") in ("built", "removed")]

    # Process sessions: later sessions override earlier ones if ticks overlap
    # Walk backwards through sessions to find the "winning" timeline
    # The last session always wins. For each earlier session, only keep events
    # before the next session's start tick.
    kept_events = []
    for si in range(len(sessions)):
        sess_start_idx, sess_start_tick = sessions[si]
        # End of this session: either next session start or end of file
        if si < len(sessions) - 1:
            sess_end_idx = sessions[si + 1][0]
            next_sess_tick = sessions[si + 1][1]
        else:
            sess_end_idx = len(raw_events)
            next_sess_tick = float("inf")

        # If next session starts at a tick <= our events, this session gets truncated
        for i in range(sess_start_idx, sess_end_idx):
            ev = raw_events[i]
            if ev.get("action") == "session_start":
                continue
            if ev.get("action") not in ("built", "removed"):
                continue
            # Only keep if this event's tick is before the next session's reload point
            if ev["tick"] < next_sess_tick:
                kept_events.append(ev)

    # Deduplicate: if a reload happened, we might have the same tick/position twice
    # Keep the LAST occurrence (from the latest session)
    seen = {}
    final_events = []
    for ev in reversed(kept_events):
        key = f"{ev.get('tick',0)}|{ev.get('action','')}|{ev.get('name','')}|{ev.get('position',{}).get('x',0):.1f}|{ev.get('position',{}).get('y',0):.1f}"
        if key not in seen:
            seen[key] = True
            final_events.append(ev)

    final_events.reverse()
    final_events.sort(key=lambda e: e.get("tick", 0))

    print(f"[live] Parsed {len(raw_events)} raw events, {len(sessions)} sessions, kept {len(final_events)} events")
    return final_events


def main():
    parser = argparse.ArgumentParser(description="Preprocess scan data for web viewer")
    parser.add_argument("--input", "-i", required=True, help="Directory with scan_*.json files or live mode data (baseline.json + events.jsonl)")
    parser.add_argument("--output", "-o", default="viewer_data.json", help="Output file (default: viewer_data.json)")
    parser.add_argument("--first", "-n", type=int, default=None, help="Only use first N scans")
    parser.add_argument("--factorio-data", "-d", default=None, help="Path to Factorio data/ dir for icon sprite atlas")
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_path = Path(args.output)

    # Detect mode: live (baseline.json + events.jsonl) or scan (scan_*.json)
    live_events_path = input_dir / "events.jsonl"
    baseline_path = input_dir / "baseline.json"
    is_live = live_events_path.exists()

    if is_live:
        print("[1/6] Loading live mode data...")
        live_events = parse_live_events(live_events_path)
        # TODO: full live mode preprocessing (baseline + events -> viewer_data.json)
        # For now, just report what we found
        print(f"  {len(live_events)} clean events from live capture")
        if not live_events:
            print("  No usable events found.")
            return

    # Load scans
    print("[1/6] Loading scan files...")
    scan_files = sorted(input_dir.glob("scan_*.json"),
                        key=lambda p: int(re.sub(r"[^\d]", "", p.stem) or "0"))
    if args.first:
        scan_files = scan_files[:args.first]
    print(f"  {len(scan_files)} scan files")

    snapshots = []
    water = None
    for i, f in enumerate(scan_files):
        if i % 10 == 0:
            print(f"  Loading {i+1}/{len(scan_files)}...", end="\r")
        data = json.loads(f.read_text(encoding="utf-8"))

        if "entities" not in data:
            print(f"  WARNING: {f.name} has no 'entities' key, skipping")
            continue

        # Entities to skip in preprocessing (mobile/transient)
        SKIP_NAMES = {"locomotive","cargo-wagon","fluid-wagon","artillery-wagon",
                      "car","tank","spider-vehicle","item-on-ground","entity-ghost",
                      "defender","destroyer","distractor"}

        entities = {}
        for e in data["entities"]:
            if e["name"] in SKIP_NAMES:
                continue
            key = f"{e['name']}|{e['position']['x']:.1f}|{e['position']['y']:.1f}"
            ent = {
                "name": e["name"],
                "x": e["position"]["x"],
                "y": e["position"]["y"],
                "dir": e.get("direction", 0),
                "product": e.get("product", ""),
                "belt_type": e.get("belt_type", ""),
            }
            if e.get("conn"):
                ent["conn"] = e["conn"]
            if e.get("bn"):
                ent["bn"] = e["bn"]
            entities[key] = ent

        # Compute belt/pipe connections for entities that don't have API data
        _compute_connections(entities)

        if data.get("water") and (water is None or len(data["water"]) > len(water)):
            water = data["water"]

        players = data.get("players", [])
        player_pos = None
        if players:
            player_pos = {"x": players[0]["position"]["x"], "y": players[0]["position"]["y"]}

        snapshots.append({
            "tick": data["tick"],
            "entities": entities,
            "playerPos": player_pos,
        })
    print(f"  Loaded {len(snapshots)} snapshots" + " " * 20)

    # Compute diffs and build event list
    print("[2/6] Computing diffs and build order...")
    total_tick = (snapshots[-1]["tick"] - snapshots[0]["tick"]) or 1
    first_tick = snapshots[0]["tick"]

    events = []
    player_positions = []
    activities = []

    # First snapshot
    for key, e in snapshots[0]["entities"].items():
        events.append({"t": 0, "a": "b", "k": key, **e})
    if snapshots[0]["playerPos"]:
        player_positions.append({"t": 0, **snapshots[0]["playerPos"], "real": True})

    for i in range(1, len(snapshots)):
        prev, curr = snapshots[i-1], snapshots[i]
        base_frac = (curr["tick"] - first_tick) / total_tick
        gap_frac = (curr["tick"] - prev["tick"]) / total_tick
        start_t = base_frac - gap_frac

        # Diff
        added_keys, removed_keys = set(), set()
        added, removed = [], []
        for key, e in curr["entities"].items():
            if key not in prev["entities"]:
                added.append((key, e))
                added_keys.add(key)
        for key, e in prev["entities"].items():
            if key not in curr["entities"]:
                removed.append((key, e))
                removed_keys.add(key)

        # Detect upgrades: same position, different name (e.g. belt tier upgrade)
        # These should be instant swaps, not separate remove + animated build
        upgrades = []
        remaining_added = []
        remaining_removed = []

        # Build position -> entity maps for matching
        added_by_pos = {}
        for key, e in added:
            pos = (round(e["x"], 1), round(e["y"], 1))
            added_by_pos.setdefault(pos, []).append((key, e))

        removed_by_pos = {}
        for key, e in removed:
            pos = (round(e["x"], 1), round(e["y"], 1))
            removed_by_pos.setdefault(pos, []).append((key, e))

        upgrade_added_keys = set()
        upgrade_removed_keys = set()
        for pos, rem_list in removed_by_pos.items():
            if pos in added_by_pos:
                add_list = added_by_pos[pos]
                # Match removals with additions at same position
                for rk, r_ent in rem_list:
                    for ak, ae in add_list:
                        if ak not in upgrade_added_keys:
                            # Same category = upgrade (e.g. belt -> fast-belt)
                            if get_category(r_ent["name"]) == get_category(ae["name"]):
                                upgrades.append((rk, r_ent, ak, ae))
                                upgrade_added_keys.add(ak)
                                upgrade_removed_keys.add(rk)
                                break

        for key, e in added:
            if key not in upgrade_added_keys:
                remaining_added.append((key, e))
        for key, e in removed:
            if key not in upgrade_removed_keys:
                remaining_removed.append((key, e))

        # Activity
        act = _describe_diff(prev["entities"], curr["entities"])
        if act:
            activities.append({"t": round(start_t, 6), "text": act})

        # Upgrades: instant swap (remove old + add new at same time)
        for rk, r_ent, ak, ae in upgrades:
            t_upgrade = round(start_t, 6)
            events.append({"t": t_upgrade, "a": "r", "k": rk, **r_ent})
            events.append({"t": t_upgrade, "a": "b", "k": ak, **ae})

        # Remaining removals at start
        for key, e in remaining_removed:
            events.append({"t": round(start_t, 6), "a": "r", "k": key, **e})

        # Separate instant vs animated
        instant = [(k, e) for k, e in remaining_added if get_category(e["name"]) in INSTANT_CATEGORIES]
        animated = [(k, e) for k, e in remaining_added if get_category(e["name"]) not in INSTANT_CATEGORIES]

        for key, e in instant:
            events.append({"t": round(start_t, 6), "a": "b", "k": key, **e})

        # Order animated entities: cluster nearby builds, walk between clusters
        animated = _order_animated(animated)

        for j, (key, e) in enumerate(animated):
            frac = j / max(1, len(animated) - 1) if len(animated) > 1 else 0
            t = round(start_t + gap_frac * frac, 6)
            events.append({"t": t, "a": "b", "k": key, **e})
            player_positions.append({"t": t, "x": e["x"], "y": e["y"], "real": False})

        if curr["playerPos"]:
            player_positions.append({"t": round(base_frac, 6), **curr["playerPos"], "real": True})

        if i % 10 == 0:
            print(f"  Processing {i}/{len(snapshots)}...", end="\r")

    events.sort(key=lambda e: e["t"])
    player_positions.sort(key=lambda p: p["t"])
    print(f"  {len(events)} events, {len(player_positions)} player positions" + " " * 20)

    # Back-fill missing product data from later snapshots
    # Build a lookup: position -> latest known product
    print("  Back-filling missing products...")
    product_lookup = {}  # (round_x, round_y) -> product
    for snap in snapshots:
        for key, e in snap["entities"].items():
            if e.get("product"):
                pos = (round(e["x"], 1), round(e["y"], 1))
                product_lookup[pos] = e["product"]

    filled = 0
    for ev in events:
        if ev["a"] == "b" and not ev.get("product"):
            pos = (round(ev["x"], 1), round(ev["y"], 1))
            if pos in product_lookup:
                ev["product"] = product_lookup[pos]
                filled += 1
    if filled:
        print(f"  Filled {filled} missing products from later snapshots")

    # Build checkpoints
    print("[3/6] Building checkpoints...")
    checkpoints = []
    INTERVAL = 0.02
    next_cp = 0
    world = {}
    for ev in events:
        if ev["a"] == "b":
            wd = {k: ev[k] for k in ("name","x","y","dir","product","belt_type") if k in ev}
            if "conn" in ev:
                wd["conn"] = ev["conn"]
            if "bn" in ev:
                wd["bn"] = ev["bn"]
            if "pn" in ev:
                wd["pn"] = ev["pn"]
            world[ev["k"]] = wd
        else:
            world.pop(ev["k"], None)
        if ev["t"] >= next_cp:
            checkpoints.append({"t": ev["t"], "w": dict(world)})
            next_cp += INTERVAL
    print(f"  {len(checkpoints)} checkpoints")

    # Compact events (remove redundant fields)
    print("[4/6] Compacting events...")
    compact_events = []
    for ev in events:
        ce = {"t": ev["t"], "a": ev["a"], "k": ev["k"],
              "n": ev["name"], "x": ev["x"], "y": ev["y"]}
        if ev["dir"]:
            ce["d"] = ev["dir"]
        if ev.get("product"):
            ce["p"] = ev["product"]
        if ev.get("belt_type"):
            ce["bt"] = ev["belt_type"]
        if ev.get("conn"):
            ce["cn"] = ev["conn"]
        if ev.get("bn"):
            ce["bn"] = ev["bn"]
        if ev.get("pn"):
            ce["pn"] = ev["pn"]
        compact_events.append(ce)

    # Compact checkpoints
    print("[5/6] Compacting checkpoints...")
    compact_checkpoints = []
    for cp in checkpoints:
        cw = {}
        for k, e in cp["w"].items():
            ce = {"n": e["name"], "x": e["x"], "y": e["y"]}
            if e["dir"]:
                ce["d"] = e["dir"]
            if e.get("product"):
                ce["p"] = e["product"]
            if e.get("belt_type"):
                ce["bt"] = e["belt_type"]
            if e.get("conn"):
                ce["cn"] = e["conn"]
            if e.get("bn"):
                ce["bn"] = e["bn"]
            if e.get("pn"):
                ce["pn"] = e["pn"]
            cw[k] = ce
        compact_checkpoints.append({"t": cp["t"], "w": cw})

    # Write output
    print("[6/6] Writing output...")
    output = {
        "meta": {
            "firstTick": first_tick,
            "lastTick": snapshots[-1]["tick"],
            "totalTicks": total_tick,
            "snapshotCount": len(snapshots),
            "eventCount": len(compact_events),
        },
        "events": compact_events,
        "checkpoints": compact_checkpoints,
        "water": water,
        "playerPositions": player_positions,
        "activities": activities,
    }

    json_str = json.dumps(output, separators=(",", ":"))
    output_path.write_text(json_str, encoding="utf-8")

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\nDone: {output_path} ({size_mb:.1f} MB)")
    print(f"  {len(compact_events)} events, {len(compact_checkpoints)} checkpoints")
    print(f"  {len(water or [])} water tiles, {len(player_positions)} player positions")
    print(f"  {len(activities)} activity descriptions")

    # Build icon sprite atlas
    if args.factorio_data:
        build_sprite_atlas(args.factorio_data, compact_events, compact_checkpoints, output_path.parent)


ICON_SUBDIRS = [
    "base/graphics/icons", "base/graphics/icons/fluid",
    "space-age/graphics/icons", "space-age/graphics/icons/fluid",
    "quality/graphics/icons", "elevated-rails/graphics/icons",
]

def build_sprite_atlas(factorio_data_dir, events, checkpoints, output_dir):
    """Build a sprite atlas PNG + JSON index for all product icons used."""
    try:
        from PIL import Image
    except ImportError:
        print("\n[sprites] Pillow not available, skipping sprite atlas")
        return

    data_dir = Path(factorio_data_dir)
    icon_dirs = [data_dir / s for s in ICON_SUBDIRS if (data_dir / s).exists()]
    if not icon_dirs:
        print(f"\n[sprites] No icon directories found in {data_dir}")
        return

    # Collect all unique product names
    products = set()
    for ev in events:
        if ev.get("p"):
            products.add(ev["p"])
    for cp in checkpoints:
        for e in cp["w"].values():
            if e.get("p"):
                products.add(e["p"])

    print(f"\n[sprites] Building sprite atlas for {len(products)} products...")

    # Name mappings for icons that don't match the product name
    ICON_NAME_MAP = {
        "stone-wall": "wall",
        "barrel": "barrel-empty",  # in fluid/barreling subdir
    }

    # Find icon files
    ICON_SIZE = 32
    found = {}
    for name in sorted(products):
        # Try exact name, then mapped name, then with common prefixes stripped
        candidates = [name]
        if name in ICON_NAME_MAP:
            candidates.append(ICON_NAME_MAP[name])
        # Try stripping common prefixes (e.g. "fast-" from "fast-transport-belt")
        for prefix in ("fast-", "express-", "turbo-", "big-", "small-", "medium-"):
            if name.startswith(prefix):
                candidates.append(name[len(prefix):])

        for candidate in candidates:
            for d in icon_dirs:
                p = d / f"{candidate}.png"
                if p.exists():
                    found[name] = p
                    break
                # Also search subdirectories
                for sub in d.iterdir():
                    if sub.is_dir():
                        p = sub / f"{candidate}.png"
                        if p.exists():
                            found[name] = p
                            break
            if name in found:
                break

    not_found = sorted(products - set(found.keys()))
    if not_found:
        print(f"[sprites] Missing icons: {not_found}")

    if not found:
        print("[sprites] No icons found")
        return

    # Build atlas
    cols = math.ceil(math.sqrt(len(found)))
    rows = math.ceil(len(found) / cols)
    atlas_w = cols * ICON_SIZE
    atlas_h = rows * ICON_SIZE

    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    index = {}

    for i, (name, path) in enumerate(sorted(found.items())):
        col = i % cols
        row = i // cols
        try:
            icon = Image.open(path).convert("RGBA").resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
            atlas.paste(icon, (col * ICON_SIZE, row * ICON_SIZE))
            index[name] = {"x": col * ICON_SIZE, "y": row * ICON_SIZE, "s": ICON_SIZE}
        except Exception:
            pass

    atlas_path = output_dir / "icons_atlas.png"
    atlas.save(atlas_path, "PNG")

    index_path = output_dir / "icons_index.json"
    index_path.write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")

    atlas_kb = atlas_path.stat().st_size / 1024
    print(f"[sprites] Atlas: {atlas_path} ({atlas_kb:.0f} KB, {len(found)} icons, {atlas_w}x{atlas_h})")
    print(f"[sprites] Index: {index_path}")


# ── Build-order inference ──
# Cluster nearby entities, order clusters by walking path,
# order within clusters by type (belts traced, buildings center-out)

LINEAR_CATEGORIES = {"belt", "pipe", "rail"}
# Entities that should be traced as chains even if not in a linear category
LINEAR_NAMES = {
    "small-electric-pole", "medium-electric-pole", "big-electric-pole", "substation",
    "stone-wall", "gate",  # walls are also placed in lines
}

def _order_animated(items):
    """Order a list of (key, entity_dict) for natural-looking build animation."""
    if len(items) <= 3:
        return items

    # Separate pole/wall runs from other entities — they need larger clustering
    pole_items = [item for item in items if item[1]["name"] in LINEAR_NAMES]
    other_items = [item for item in items if item[1]["name"] not in LINEAR_NAMES]

    # Cluster poles with larger cell size (they span big distances)
    pole_clusters = _cluster_by_grid(pole_items, cell_size=35) if pole_items else []
    # Cluster other entities normally
    other_clusters = _cluster_by_grid(other_items, cell_size=10) if other_items else []

    # Merge all clusters and order by walking path
    all_clusters = pole_clusters + other_clusters

    # Order clusters by nearest-neighbor walk
    ordered_clusters = _order_clusters_nn(all_clusters)

    # Within each cluster, order by type
    result = []
    for cluster in ordered_clusters:
        result.extend(_order_within_cluster(cluster))
    return result


def _cluster_by_grid(items, cell_size=10):
    """Group items into clusters based on grid proximity."""
    from collections import defaultdict

    # Assign each item to a grid cell
    cells = defaultdict(list)
    for item in items:
        e = item[1]
        cx = int(e["x"] // cell_size)
        cy = int(e["y"] // cell_size)
        cells[(cx, cy)].append(item)

    # Merge adjacent cells into clusters using flood fill
    visited = set()
    clusters = []

    for cell_key in cells:
        if cell_key in visited:
            continue
        # BFS to find all connected cells
        cluster_items = []
        queue = [cell_key]
        while queue:
            ck = queue.pop(0)
            if ck in visited:
                continue
            visited.add(ck)
            if ck in cells:
                cluster_items.extend(cells[ck])
                # Check 8 neighbors
                cx, cy = ck
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nk = (cx + dx, cy + dy)
                        if nk not in visited and nk in cells:
                            queue.append(nk)
        if cluster_items:
            clusters.append(cluster_items)

    return clusters


def _cluster_centroid(cluster):
    """Get the center position of a cluster."""
    cx = sum(item[1]["x"] for item in cluster) / len(cluster)
    cy = sum(item[1]["y"] for item in cluster) / len(cluster)
    return cx, cy


def _order_clusters_nn(clusters):
    """Order clusters by nearest-neighbor starting from the one closest to origin."""
    if len(clusters) <= 1:
        return clusters

    centroids = [_cluster_centroid(c) for c in clusters]
    visited = [False] * len(clusters)
    order = []

    # Start from cluster nearest to origin
    current = min(range(len(clusters)),
                  key=lambda i: centroids[i][0]**2 + centroids[i][1]**2)

    for _ in range(len(clusters)):
        visited[current] = True
        order.append(clusters[current])
        cx, cy = centroids[current]

        best_dist = float("inf")
        best_idx = -1
        for j in range(len(clusters)):
            if not visited[j]:
                d = (centroids[j][0] - cx)**2 + (centroids[j][1] - cy)**2
                if d < best_dist:
                    best_dist = d
                    best_idx = j
        if best_idx >= 0:
            current = best_idx

    return order


def _is_linear(name):
    """Check if an entity should be traced as a linear chain."""
    return get_category(name) in LINEAR_CATEGORIES or name in LINEAR_NAMES


def _order_within_cluster(cluster):
    """Order entities within a cluster: linear entities traced, buildings center-out."""
    if len(cluster) <= 2:
        return cluster

    linear = [item for item in cluster if _is_linear(item[1]["name"])]
    buildings = [item for item in cluster if not _is_linear(item[1]["name"])]

    result = []

    # Trace linear entities by nearest-neighbor chain
    if linear:
        result.extend(_trace_chain(linear))

    # Buildings: center-out
    if buildings:
        cx = sum(item[1]["x"] for item in buildings) / len(buildings)
        cy = sum(item[1]["y"] for item in buildings) / len(buildings)
        buildings.sort(key=lambda item: (item[1]["x"] - cx)**2 + (item[1]["y"] - cy)**2)
        result.extend(buildings)

    return result


def _trace_chain(items):
    """Trace linear entities by nearest-neighbor chain from an endpoint."""
    if len(items) <= 2:
        return items

    positions = [(item[1]["x"], item[1]["y"]) for item in items]

    # Determine neighbor radius based on entity types
    # Power poles can be up to 30 tiles apart, belts are 1 tile
    has_poles = any(item[1]["name"] in LINEAR_NAMES for item in items)
    neighbor_radius = 30.0 if has_poles else 2.0

    # Find endpoint: entity with fewest close neighbors
    neighbor_counts = []
    for i, (x, y) in enumerate(positions):
        count = sum(1 for j, (nx, ny) in enumerate(positions)
                    if j != i and (nx - x)**2 + (ny - y)**2 <= neighbor_radius**2)
        neighbor_counts.append(count)

    # Start from the entity with fewest neighbors (likely an endpoint)
    start = min(range(len(items)), key=lambda i: (neighbor_counts[i], positions[i][0] + positions[i][1]))

    visited = set()
    order = []

    current = start
    while len(order) < len(items):
        visited.add(current)
        order.append(items[current])

        # Find nearest unvisited
        cx, cy = positions[current]
        best_dist = float("inf")
        best_idx = -1
        for j in range(len(items)):
            if j not in visited:
                d = (positions[j][0] - cx)**2 + (positions[j][1] - cy)**2
                if d < best_dist:
                    best_dist = d
                    best_idx = j

        if best_idx < 0:
            break
        current = best_idx

    # Pick up any missed items
    for i in range(len(items)):
        if i not in visited:
            order.append(items[i])

    return order


def _describe_diff(prev_entities, curr_entities):
    added = Counter()
    removed = Counter()
    for key, e in curr_entities.items():
        if key not in prev_entities:
            added[get_category(e["name"])] += 1
    for key, e in prev_entities.items():
        if key not in curr_entities:
            removed[get_category(e["name"])] += 1
    parts = []
    er = removed.get("enemy", 0)
    if er > 10: parts.append(f"Clearing enemies ({er})")
    ea = added.get("enemy", 0)
    if ea > 20: parts.append(f"Enemy expansion ({ea})")
    if added.get("mining", 0) > 0: parts.append(f"Mining (+{added['mining']})")
    if added.get("furnace", 0) >= 3: parts.append(f"Smelting (+{added['furnace']})")
    if added.get("assembler", 0) >= 2: parts.append(f"Production (+{added['assembler']})")
    if added.get("belt", 0) >= 10: parts.append(f"Belts (+{added['belt']})")
    if added.get("power", 0) >= 3: parts.append(f"Power (+{added['power']})")
    if added.get("rail", 0) >= 5: parts.append(f"Tracks (+{added['rail']})")
    if added.get("wall", 0) >= 5: parts.append(f"Defense (+{added['wall']})")
    if not parts:
        t = sum(v for k, v in added.items() if k not in ("enemy", "resource"))
        if t > 0: parts.append(f"Building (+{t})")
    return " | ".join(parts[:3])


if __name__ == "__main__":
    main()
