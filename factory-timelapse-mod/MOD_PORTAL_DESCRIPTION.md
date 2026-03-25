# Factory Timelapse

**Zero impact on game load time.** The mod only captures build/remove events during gameplay — no surface scanning on startup. The baseline state is read from your save file offline during timelapse generation.

**Turn your existing save files into interactive timelapse visualizations.** Watch your factory grow from the first stone furnace to a sprawling megabase — no recording needed, works retroactively with saves you already have.

![Showcase](https://raw.githubusercontent.com/huzoc/factorio/master/showcase.gif)

[Download full showcase video (MP4)](https://github.com/huzoc/factorio/raw/master/showcase.mp4)

## Create timelapses from existing saves

Have 50, 100, or even 200 save files from your playthrough? This mod can batch-process them all and generate a smooth, animated timelapse showing every belt placed, every smelter built, and every biter nest cleared.

The batch scanner loads each save via Factorio's headless mode, extracts all entity data, and an external tool diffs the snapshots to create a smooth animation with:

- **Intelligent build ordering** — entities appear in natural clusters (smelter arrays, belt lines, power setups) instead of random pops
- **Belt upgrades visible** — watch your yellow belts turn red, then blue as you progress
- **Enemy expansion & clearing** — see biters expand and get pushed back
- **Time-proportional pacing** — a 60-minute gap between saves gets 30x more animation time than a 2-minute gap

**Note:** Scanning saves takes some time — each save is loaded in headless benchmark mode (a few seconds for small factories, longer for large ones). Parallel scanning with multiple workers is supported to speed this up. This is a one-time cost per save.

## Live capture during gameplay

Install the mod and play normally. It silently records every build and remove event with near-zero performance impact (~1.5MB for an 8-hour session). No baseline scan on startup — the mod starts instantly. When generating the timelapse, you provide the starting save file and the tool reads it offline via benchmark mode.

## Interactive web viewer

The timelapse isn't a video — it's a fully **interactive web visualization** you can:

- **Pan and zoom** freely around your factory
- **Scrub the timeline** forward and backward
- **Toggle entity categories** (hide enemies, show only belts, etc.)
- **Hover for details** — see what each building is producing
- **View product icons** — actual Factorio item icons on assemblers and furnaces

## Specialized entity rendering

Not just colored rectangles — entities are drawn to resemble their Factorio counterparts:

- Belts as connected directional strips (color per tier)
- Inserters as arms with grabber dots
- Labs as hexagons, storage tanks as circles
- Turrets with directional barrels
- Miners as U-shapes with resource icons
- Rails as connected track networks
- Electric poles as dots, pipes as thin connected lines

## Features

- **Factorio 2.0 & Space Age** — supports all entities, multiple surfaces, space platforms
- **Multiplayer** — tracks all players with per-player colors
- **Upgrade detection** — belt/inserter/assembler upgrades shown as instant color swaps
- **Water & resources** — terrain features visible as background layers
- **Activity descriptions** — auto-generated text ("Expanding mining", "Building smelting array")
- **Game clock** — in-game elapsed time displayed
- **Data source indicator** — shows real snapshot vs interpolated data

## How it works

1. **Mod** captures entity data (this mod)
2. **Python tools** scan saves and preprocess data ([GitHub](https://github.com/huzoc/factorio))
3. **Web viewer** renders the interactive timelapse ([GitHub](https://github.com/huzoc/factorio))

Full documentation, source code, and tools: **https://github.com/huzoc/factorio**

## Performance

- **Live capture:** ~150 bytes per build event, player position logged every 5 seconds. No UPS impact. No startup delay — baseline is scanned offline.
- **Save scanning:** Each save loaded headless. ~5-30s per save depending on factory size. Use `--workers` for parallel scanning.
- **Viewer:** Runs at 60fps in the browser with LOD scaling. Preprocessed data loads near-instantly.
