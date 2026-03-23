// Factorio Timelapse Interactive Viewer — Optimized

// ── roundRect polyfill for browsers without native support ──
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
        r = Math.min(r, w/2, h/2);
        this.moveTo(x+r, y);
        this.arcTo(x+w, y, x+w, y+h, r);
        this.arcTo(x+w, y+h, x, y+h, r);
        this.arcTo(x, y+h, x, y, r);
        this.arcTo(x, y, x+w, y, r);
        this.closePath();
    };
}

// ── Entity colors ──
const CATEGORY_COLORS = {
    belt:[230,195,50],inserter:[80,190,80],assembler:[70,130,210],power:[210,60,60],
    mining:[160,110,50],logistics:[170,80,200],pipe:[120,180,180],storage:[200,160,60],
    rail:[140,140,140],wall:[100,100,100],furnace:[200,120,40],lab:[180,180,220],
    fluid:[60,160,180],combinator:[80,160,80],enemy:[180,40,40],resource:[60,60,60],
    other:[180,180,180],
};

const ENTITY_CATEGORIES = {};
(function() {
    const m = {
        belt:["transport-belt","fast-transport-belt","express-transport-belt","turbo-transport-belt",
              "underground-belt","fast-underground-belt","express-underground-belt","turbo-underground-belt",
              "splitter","fast-splitter","express-splitter","turbo-splitter","loader","fast-loader","express-loader","turbo-loader"],
        inserter:["burner-inserter","inserter","long-handed-inserter","fast-inserter","bulk-inserter","stack-inserter"],
        assembler:["assembling-machine-1","assembling-machine-2","assembling-machine-3","chemical-plant",
                    "oil-refinery","centrifuge","electromagnetic-plant","biochamber","cryogenic-plant","foundry","recycler","rocket-silo"],
        furnace:["stone-furnace","steel-furnace","electric-furnace"],
        mining:["burner-mining-drill","electric-mining-drill","big-mining-drill","pumpjack","agricultural-tower"],
        power:["boiler","steam-engine","solar-panel","accumulator","nuclear-reactor","heat-exchanger","steam-turbine",
               "fusion-reactor","fusion-generator","small-electric-pole","medium-electric-pole","big-electric-pole","substation","lightning-rod"],
        pipe:["pipe","pipe-to-ground","pump"],fluid:["offshore-pump","storage-tank"],
        storage:["wooden-chest","iron-chest","steel-chest"],
        logistics:["active-provider-chest","passive-provider-chest","storage-chest","buffer-chest","requester-chest","roboport","cargo-landing-pad"],
        rail:["straight-rail","curved-rail-a","curved-rail-b","half-diagonal-rail","rail-signal","rail-chain-signal","train-stop",
              "cargo-wagon","locomotive","fluid-wagon","artillery-wagon"],
        wall:["stone-wall","gate","gun-turret","laser-turret","flamethrower-turret","artillery-turret","radar","land-mine"],
        combinator:["arithmetic-combinator","decider-combinator","constant-combinator","selector-combinator","power-switch","programmable-speaker"],
        lab:["lab","biolab"],
        enemy:["small-biter","medium-biter","big-biter","behemoth-biter","small-spitter","medium-spitter","big-spitter","behemoth-spitter",
               "biter-spawner","spitter-spawner","small-worm-turret","medium-worm-turret","big-worm-turret","behemoth-worm-turret"],
        resource:["iron-ore","copper-ore","coal","stone","uranium-ore","crude-oil"],
    };
    for (const [cat,names] of Object.entries(m)) for (const n of names) ENTITY_CATEGORIES[n]=cat;
})();

const ENTITY_SIZES = {
    "assembling-machine-1":[3,3],"assembling-machine-2":[3,3],"assembling-machine-3":[3,3],
    "chemical-plant":[3,3],"oil-refinery":[5,5],"centrifuge":[3,3],"cryogenic-plant":[5,5],"foundry":[4,4],
    "stone-furnace":[2,2],"steel-furnace":[2,2],"electric-furnace":[3,3],
    "electric-mining-drill":[3,3],"big-mining-drill":[5,5],"pumpjack":[3,3],"burner-mining-drill":[2,2],
    "boiler":[3,2],"steam-engine":[3,5],"solar-panel":[3,3],"accumulator":[2,2],
    "nuclear-reactor":[5,5],"heat-exchanger":[3,2],"steam-turbine":[3,5],
    "big-electric-pole":[2,2],"substation":[2,2],
    "splitter":[2,1],"fast-splitter":[2,1],"express-splitter":[2,1],
    "roboport":[4,4],"storage-tank":[3,3],"radar":[3,3],
    "gun-turret":[2,2],"laser-turret":[2,2],"flamethrower-turret":[2,3],"artillery-turret":[3,3],
    "straight-rail":[2,2],"train-stop":[2,2],
    "arithmetic-combinator":[1,2],"decider-combinator":[1,2],"pump":[1,2],
    "lab":[3,3],"biolab":[5,5],"rocket-silo":[9,9],
    "biter-spawner":[4,4],"spitter-spawner":[4,4],
    "big-worm-turret":[3,3],"behemoth-worm-turret":[3,3],
    "small-worm-turret":[2,2],"medium-worm-turret":[2,2],
    "big-biter":[2,2],"behemoth-biter":[2,2],"big-spitter":[2,2],"behemoth-spitter":[2,2],
    "beacon":[3,3],"cargo-landing-pad":[4,4],"agricultural-tower":[3,3],
    // Space Age
    "electromagnetic-plant":[3,3],"biochamber":[3,3],"cryogenic-plant":[5,5],
    "foundry":[4,4],"recycler":[3,3],"heating-tower":[3,3],
    "lightning-rod":[2,2],"lightning-collector":[2,2],
    "thruster":[3,3],"asteroid-collector":[3,3],
    "heat-pipe":[1,1],"display-panel":[1,1],
    "car":[2,2],"tank":[3,3],
};

const INSTANT_CATEGORIES = new Set(["enemy","resource"]);

// Per-entity color overrides (belt tiers, etc.)
const ENTITY_COLORS = {
    "transport-belt": [230,195,50], "underground-belt": [230,195,50], "splitter": [230,195,50],
    "fast-transport-belt": [210,50,50], "fast-underground-belt": [210,50,50], "fast-splitter": [210,50,50],
    "express-transport-belt": [50,130,210], "express-underground-belt": [50,130,210], "express-splitter": [50,130,210],
    "turbo-transport-belt": [130,210,50], "turbo-underground-belt": [130,210,50], "turbo-splitter": [130,210,50],
    "burner-inserter": [180,160,50],
    "inserter": [220,200,60],
    "long-handed-inserter": [200,60,60],
    "fast-inserter": [60,120,210],
    "bulk-inserter": [60,180,60],
    "stack-inserter": [60,180,60],
    // Assembler tiers
    "assembling-machine-1": [160,160,170],
    "assembling-machine-2": [130,175,220],
    "assembling-machine-3": [100,180,255],
    // Furnace tiers
    "stone-furnace": [170,100,30],
    "steel-furnace": [200,140,50],
    "electric-furnace": [230,180,80],
    // Mining tiers
    "burner-mining-drill": [130,90,40],
    "electric-mining-drill": [160,120,60],
    "big-mining-drill": [190,150,80],
    "wooden-chest": [160,120,50], "iron-chest": [180,180,180], "steel-chest": [220,220,220],
    "active-provider-chest": [170,50,200], "passive-provider-chest": [200,50,50],
    "storage-chest": [200,180,50], "buffer-chest": [50,180,50], "requester-chest": [50,130,210],
    // Space Age
    "electromagnetic-plant": [100,100,220], "biochamber": [60,180,60], "cryogenic-plant": [100,200,220],
    "foundry": [200,100,40], "recycler": [150,200,150], "heating-tower": [220,120,40],
    // Vehicles
    "car": [150,150,150], "tank": [120,130,120],
    // Nuclear
    "nuclear-reactor": [180,220,60], "heat-exchanger": [200,100,60], "heat-pipe": [200,80,40],
};

// Precomputed color strings per entity name
const colorStringCache = new Map();
function getColorStr(name) {
    let s = colorStringCache.get(name);
    if (s) return s;
    const c = ENTITY_COLORS[name] || getColor(name);
    s = `rgb(${c[0]},${c[1]},${c[2]})`;
    colorStringCache.set(name, s);
    return s;
}
function getDarkColorStr(name) {
    const key = name + "_dark";
    let s = colorStringCache.get(key);
    if (s) return s;
    const [r,g,b] = getColor(name);
    s = `rgb(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,b-40)})`;
    colorStringCache.set(key, s);
    return s;
}

function getCategory(name) {
    return ENTITY_CATEGORIES[name] ||
        (name.includes("biter")||name.includes("spitter")||name.includes("worm")||name.includes("spawner") ? "enemy" :
         name.includes("ore")||name==="coal"||name==="stone"||name.includes("crude") ? "resource" : "other");
}
function getSize(name) { return ENTITY_SIZES[name] || [1,1]; }
function getColor(name) { return ENTITY_COLORS[name] || CATEGORY_COLORS[getCategory(name)] || CATEGORY_COLORS.other; }

// ── Direction vectors (Factorio 2.0: 16-direction) ──
const DIR_DX = [], DIR_DY = [];
for (let i = 0; i < 16; i++) {
    const a = (i/16)*Math.PI*2 - Math.PI/2;
    DIR_DX[i] = Math.round(Math.cos(a+Math.PI/2)*1000)/1000;
    DIR_DY[i] = Math.round(Math.sin(a+Math.PI/2)*1000)/1000;
}
DIR_DX[0]=0;DIR_DY[0]=-1; DIR_DX[4]=1;DIR_DY[4]=0; DIR_DX[8]=0;DIR_DY[8]=1; DIR_DX[12]=-1;DIR_DY[12]=0;

// ── State ──
let events = [];
let snapshotTicks = [];
let snapshotBoundaries = []; // normalized t values where real save data exists
let snapshotActivities = [];
let waterData = null;

// Playback
let currentT = 0;
let playing = false;
let speed = 0.02;
let lastFrameTime = 0;

// World state
let world = new Map();
let eventIdx = 0;

// Player
let playerPositions = [];
let currentPlayerPos = null;
let playerTrail = [];

// Toggles
let showPlayer = true;
let showPlayerTrail = false;
let showWater = true;
let showResourceIcons = false;
let showProductIcons = true;

// Icons
let hasIcons = false;
const iconCache = new Map();
const iconLoading = new Set();

// Camera
let camX = 0, camY = 0, zoom = 8;
let dragging = false, dragStartX, dragStartY, camStartX, camStartY;
let hiddenCategories = new Set();
let hoveredEntity = null;
let activityList = [];

// Snapshot checkpoints for fast seeking
let checkpoints = []; // [{t, world: Map, eventIdx}] every ~5% of timeline

// Entity lookup
let entityPosLookup = new Map();
let posLookupVersion = 0;

// Rail neighbor cache
let railNeighborCache = null;
let railCacheVersion = -1;

// ── Canvas ──
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 48;
    render();
}
window.addEventListener("resize", resizeCanvas);

// ── Icon loading (sprite atlas or individual) ──
let atlasImg = null;
let atlasIndex = null;

async function loadIconAtlas() {
    try {
        const idxResp = await fetch("/data/icons_index.json");
        if (!idxResp.ok) return false;
        atlasIndex = await idxResp.json();

        return new Promise((resolve) => {
            atlasImg = new Image();
            atlasImg.onload = () => { hasIcons = true; resolve(true); };
            atlasImg.onerror = () => { atlasImg = null; resolve(false); };
            atlasImg.src = "/data/icons_atlas.png";
        });
    } catch { return false; }
}

function drawIcon(ctx, name, dx, dy, size) {
    if (!atlasIndex || !atlasImg) {
        // Fallback to individual icon loading
        return drawIconFallback(ctx, name, dx, dy, size);
    }
    const entry = atlasIndex[name];
    if (!entry) return;
    ctx.drawImage(atlasImg, entry.x, entry.y, entry.s, entry.s, dx, dy, size, size);
}

function drawIconFallback(ctx, name, dx, dy, size) {
    if (!hasIcons || !name) return;
    let img = iconCache.get(name);
    if (img === null) return; // known missing
    if (img) { ctx.drawImage(img, dx, dy, size, size); return; }
    if (iconLoading.has(name)) return;
    iconLoading.add(name);
    const newImg = new Image();
    newImg.onload = () => { iconCache.set(name, newImg); iconLoading.delete(name); if (!playing) render(); };
    newImg.onerror = () => { iconCache.set(name, null); iconLoading.delete(name); };
    newImg.src = `/icons/${name}.png`;
}

// ── Data loading ──
async function loadData() {
    const loadingEl = document.getElementById("loading");
    const resp = await fetch("/api/scans");
    const scanData = await resp.json();
    hasIcons = scanData.hasIcons || false;

    // Try loading sprite atlas
    loadingEl.textContent = "Loading icons...";
    await loadIconAtlas();

    // Try preprocessed data first (much faster)
    loadingEl.textContent = "Loading preprocessed data...";
    try {
        const ppResp = await fetch("/data/viewer_data.json");
        if (ppResp.ok) {
            const pp = await ppResp.json();
            loadPreprocessed(pp);
            loadingEl.classList.add("done");
            buildLegend();
            seekTo(0);
            fitCamera();
            render();
            console.log("Loaded preprocessed data");
            return;
        }
    } catch (e) { /* fall through to raw loading */ }

    // Fallback: load raw scan files
    console.log("No preprocessed data, loading raw scans...");
    const scans = scanData.scans;

    loadingEl.textContent = `Loading ${scans.length} snapshots...`;
    const BATCH = 10;
    const allData = new Array(scans.length);
    for (let b = 0; b < scans.length; b += BATCH) {
        const batch = scans.slice(b, b + BATCH);
        const promises = batch.map((s, i) => fetch(s.url).then(r => r.json()).then(d => { allData[b + i] = d; }));
        await Promise.all(promises);
        loadingEl.textContent = `Loading ${Math.min(b + BATCH, scans.length)}/${scans.length}...`;
    }

    const snapshots = [];
    for (let i = 0; i < allData.length; i++) {
        const data = allData[i];
        const entities = new Map();
        for (const e of data.entities) {
            const key = `${e.name}|${e.position.x.toFixed(1)}|${e.position.y.toFixed(1)}`;
            entities.set(key, {
                name: e.name, x: e.position.x, y: e.position.y,
                direction: e.direction || 0, product: e.product || "",
                belt_type: e.belt_type || "", conn: e.conn || null,
                bn: e.bn || null, pn: e.pn || null,
            });
        }
        if (data.water && data.water.length > (waterData ? waterData.length : 0)) {
            waterData = data.water;
        }
        const players = data.players || [];
        const playerPos = players.length > 0 ? { x: players[0].position.x, y: players[0].position.y } : null;
        snapshots.push({ tick: data.tick, entities, playerPos });
    }

    loadingEl.textContent = "Building event list...";
    await new Promise(r => setTimeout(r, 10));
    buildEventList(snapshots);
    buildCheckpoints();

    document.getElementById("timeline").max = 10000;
    document.getElementById("timeline").value = 0;
    loadingEl.classList.add("done");
    buildLegend();
    seekTo(0);
    fitCamera();
    render();
}

// ── Load preprocessed data (instant) ──
function loadPreprocessed(pp) {
    // Events
    events = pp.events.map(e => ({
        t: e.t,
        action: e.a === "b" ? "built" : "removed",
        key: e.k,
        entity: { name: e.n, x: e.x, y: e.y, direction: e.d || 0, product: e.p || "", belt_type: e.bt || "", conn: e.cn || null, bn: e.bn || null, pn: e.pn || null },
    }));

    // Checkpoints (pre-built world state snapshots)
    checkpoints = pp.checkpoints.map(cp => {
        const w = new Map();
        for (const [k, e] of Object.entries(cp.w)) {
            w.set(k, { name: e.n, x: e.x, y: e.y, direction: e.d || 0, product: e.p || "", belt_type: e.bt || "", conn: e.cn || null, bn: e.bn || null, pn: e.pn || null });
        }
        // Find the eventIdx for this checkpoint
        let idx = 0;
        for (let i = 0; i < events.length; i++) {
            if (events[i].t > cp.t) { idx = i; break; }
            idx = i + 1;
        }
        return { t: cp.t, world: w, eventIdx: idx };
    });

    // Water
    waterData = pp.water;

    // Player positions
    playerPositions = pp.playerPositions || [];

    // Activities
    snapshotActivities = [];
    const actList = pp.activities || [];
    // Store as lookup
    activityList = actList;

    // Meta
    snapshotTicks = [pp.meta.firstTick, pp.meta.lastTick];

    // Snapshot boundaries: activity times mark real save boundaries
    snapshotBoundaries = [0];
    for (const act of actList) {
        snapshotBoundaries.push(act.t);
    }
    snapshotBoundaries.push(1);

    document.getElementById("timeline").max = 10000;
    document.getElementById("timeline").value = 0;

    console.log(`Loaded: ${events.length} events, ${checkpoints.length} checkpoints, ${playerPositions.length} player pos`);
}

// ── Event list ──
function buildEventList(snapshots) {
    events = [];
    playerPositions = [];
    snapshotTicks = snapshots.map(s => s.tick);
    snapshotBoundaries = [];
    snapshotActivities = [];

    const totalTick = snapshots[snapshots.length-1].tick - snapshots[0].tick || 1;
    const firstTick = snapshots[0].tick;

    const first = snapshots[0];
    snapshotActivities.push("");
    for (const [key, e] of first.entities) {
        events.push({ t: 0, action: "built", key, entity: e });
    }
    if (first.playerPos) playerPositions.push({ t: 0, x: first.playerPos.x, y: first.playerPos.y, real: true });
    snapshotBoundaries.push(0);

    for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i-1], curr = snapshots[i];
        const baseFrac = (curr.tick - firstTick) / totalTick;
        snapshotBoundaries.push(baseFrac);
        const gapFrac = (curr.tick - prev.tick) / totalTick;
        const startT = baseFrac - gapFrac;

        const added = [], removed = [];
        for (const [key, e] of curr.entities) { if (!prev.entities.has(key)) added.push({ key, entity: e }); }
        for (const [key, e] of prev.entities) { if (!curr.entities.has(key)) removed.push({ key, entity: e }); }

        snapshotActivities.push(describeActivity(prev.entities, curr.entities));

        // Detect upgrades: same position, different name → instant swap
        const addedByPos = new Map();
        for (const a of added) {
            const pk = `${a.entity.x.toFixed(1)},${a.entity.y.toFixed(1)}`;
            if (!addedByPos.has(pk)) addedByPos.set(pk, []);
            addedByPos.get(pk).push(a);
        }
        const upgradeAddedKeys = new Set();
        const upgradeRemovedKeys = new Set();
        for (const r of removed) {
            const pk = `${r.entity.x.toFixed(1)},${r.entity.y.toFixed(1)}`;
            const candidates = addedByPos.get(pk);
            if (!candidates) continue;
            for (const a of candidates) {
                if (upgradeAddedKeys.has(a.key)) continue;
                if (getCategory(r.entity.name) === getCategory(a.entity.name)) {
                    // Upgrade: emit both at same time
                    events.push({ t: startT, action: "removed", key: r.key, entity: r.entity });
                    events.push({ t: startT, action: "built", key: a.key, entity: a.entity });
                    upgradeAddedKeys.add(a.key);
                    upgradeRemovedKeys.add(r.key);
                    break;
                }
            }
        }

        // Remaining removals
        for (const { key, entity } of removed) {
            if (!upgradeRemovedKeys.has(key)) events.push({ t: startT, action: "removed", key, entity });
        }

        // Remaining additions
        const remainingAdded = added.filter(a => !upgradeAddedKeys.has(a.key));
        const instant = remainingAdded.filter(a => INSTANT_CATEGORIES.has(getCategory(a.entity.name)));
        const animated = remainingAdded.filter(a => !INSTANT_CATEGORIES.has(getCategory(a.entity.name)));

        for (const { key, entity } of instant) events.push({ t: startT, action: "built", key, entity });

        const ordered = orderEntities(animated);
        for (let j = 0; j < ordered.length; j++) {
            const frac = ordered.length > 1 ? j / (ordered.length-1) : 0;
            const t = startT + gapFrac * frac;
            events.push({ t, action: "built", key: ordered[j].key, entity: ordered[j].entity });
            playerPositions.push({ t, x: ordered[j].entity.x, y: ordered[j].entity.y, real: false });
        }

        if (curr.playerPos) playerPositions.push({ t: baseFrac, x: curr.playerPos.x, y: curr.playerPos.y, real: true });
    }

    events.sort((a, b) => a.t - b.t);
    playerPositions.sort((a, b) => a.t - b.t);
    console.log(`${events.length} events, ${playerPositions.length} player positions`);
}

// ── Checkpoints for fast seeking ──
function buildCheckpoints() {
    checkpoints = [];
    const INTERVAL = 0.02; // every 2%
    let nextCheckpoint = 0;
    const w = new Map();
    let idx = 0;

    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.action === "built") w.set(ev.key, ev.entity);
        else w.delete(ev.key);

        if (ev.t >= nextCheckpoint) {
            checkpoints.push({ t: ev.t, world: new Map(w), eventIdx: i + 1 });
            nextCheckpoint += INTERVAL;
        }
    }
    console.log(`${checkpoints.length} checkpoints built`);
}

// ── Ordering ──
function orderEntities(items) {
    if (items.length <= 3) return items;
    const linearCats = new Set(["belt","pipe","rail"]);
    const linear = items.filter(a => linearCats.has(getCategory(a.entity.name)));
    const others = items.filter(a => !linearCats.has(getCategory(a.entity.name)));
    const result = [];
    if (linear.length > 0) result.push(...traceChain(linear));
    if (others.length > 0) {
        const cx = others.reduce((s,a)=>s+a.entity.x,0)/others.length;
        const cy = others.reduce((s,a)=>s+a.entity.y,0)/others.length;
        others.sort((a,b) => ((a.entity.x-cx)**2+(a.entity.y-cy)**2) - ((b.entity.x-cx)**2+(b.entity.y-cy)**2));
        result.push(...others);
    }
    return result;
}

function traceChain(items) {
    if (items.length <= 2) return items;
    const posMap = new Map();
    for (let i = 0; i < items.length; i++) {
        const e = items[i].entity;
        posMap.set(`${Math.round(e.x*2)/2},${Math.round(e.y*2)/2}`, i);
    }
    const adj = new Map();
    for (let i = 0; i < items.length; i++) {
        adj.set(i, []);
        const e = items[i].entity;
        const ex = Math.round(e.x*2)/2, ey = Math.round(e.y*2)/2;
        for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
            const j = posMap.get(`${ex+dx},${ey+dy}`);
            if (j !== undefined && j !== i) adj.get(i).push(j);
        }
    }
    let start = 0;
    for (let i = 0; i < items.length; i++) { if (adj.get(i).length <= 1) { start = i; break; } }
    const visited = new Set(), order = [];
    function walk(n) { visited.add(n); order.push(n); for (const nb of adj.get(n)) { if (!visited.has(nb)) walk(nb); } }
    walk(start);
    for (let i = 0; i < items.length; i++) { if (!visited.has(i)) walk(i); }
    return order.map(i => items[i]);
}

// ── Activity ──
function describeActivity(before, after) {
    const added = new Map(), removed = new Map();
    for (const [key,e] of after) { if (!before.has(key)) { const c=getCategory(e.name); added.set(c,(added.get(c)||0)+1); } }
    for (const [key,e] of before) { if (!after.has(key)) { const c=getCategory(e.name); removed.set(c,(removed.get(c)||0)+1); } }
    const p = [];
    const er=removed.get("enemy")||0; if(er>10) p.push(`Clearing enemies (${er})`);
    const ea=added.get("enemy")||0; if(ea>20) p.push(`Enemy expansion (${ea})`);
    if((added.get("mining")||0)>0) p.push(`Mining (+${added.get("mining")})`);
    if((added.get("furnace")||0)>=3) p.push(`Smelting (+${added.get("furnace")})`);
    if((added.get("assembler")||0)>=2) p.push(`Production (+${added.get("assembler")})`);
    if((added.get("belt")||0)>=10) p.push(`Belts (+${added.get("belt")})`);
    if((added.get("power")||0)>=3) p.push(`Power (+${added.get("power")})`);
    if((added.get("rail")||0)>=5) p.push(`Tracks (+${added.get("rail")})`);
    if((added.get("wall")||0)>=5) p.push(`Defense (+${added.get("wall")})`);
    if(p.length===0) { let t=0; for(const[c,n]of added){if(c!=="enemy"&&c!=="resource")t+=n;} if(t>0)p.push(`Building (+${t})`); }
    return p.slice(0,3).join(" | ");
}

// ── Player position ──
function getPlayerPosAt(t) {
    if (!playerPositions.length) return null;
    // Binary search for surrounding positions
    let lo = 0, hi = playerPositions.length - 1;
    if (t <= playerPositions[0].t) return playerPositions[0];
    if (t >= playerPositions[hi].t) return playerPositions[hi];
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (playerPositions[mid].t <= t) lo = mid; else hi = mid;
    }
    const before = playerPositions[lo], after = playerPositions[hi];
    if (before.t === after.t) return before;
    const frac = (t - before.t) / (after.t - before.t);
    return { x: before.x + (after.x - before.x) * frac, y: before.y + (after.y - before.y) * frac, real: before.real && after.real };
}

function updatePlayerTrail(t) {
    if (!showPlayerTrail) { playerTrail = []; currentPlayerPos = getPlayerPosAt(t); return; }
    const TRAIL_COUNT = 80;
    const trailSpan = 0.02;
    playerTrail = [];
    const step = trailSpan / TRAIL_COUNT;
    for (let i = 0; i < TRAIL_COUNT; i++) {
        const tt = t - trailSpan + i * step;
        if (tt < 0) continue;
        const pos = getPlayerPosAt(tt);
        if (pos) playerTrail.push(pos);
    }
    currentPlayerPos = getPlayerPosAt(t);
}

// ── Seek (with checkpoint acceleration) ──
function seekTo(t) {
    t = Math.max(0, Math.min(t, 1));
    currentT = t;

    // Find nearest checkpoint before t
    let best = null;
    for (const cp of checkpoints) {
        if (cp.t <= t) best = cp;
        else break;
    }

    if (best) {
        world = new Map(best.world);
        eventIdx = best.eventIdx;
    } else {
        world.clear();
        eventIdx = 0;
    }

    // Replay remaining events
    while (eventIdx < events.length && events[eventIdx].t <= t) {
        const ev = events[eventIdx];
        if (ev.action === "built") world.set(ev.key, ev.entity);
        else world.delete(ev.key);
        eventIdx++;
    }
    rebuildPosLookup();
    updatePlayerTrail(t);
}

function advanceTo(t) {
    t = Math.max(0, Math.min(t, 1));
    if (t < currentT) { seekTo(t); return; }
    while (eventIdx < events.length && events[eventIdx].t <= t) {
        const ev = events[eventIdx];
        if (ev.action === "built") world.set(ev.key, ev.entity);
        else world.delete(ev.key);
        eventIdx++;
    }
    currentT = t;
    rebuildPosLookup();
    updatePlayerTrail(t);
}

function getCurrentActivity() {
    // Preprocessed mode: use activity list
    if (activityList && activityList.length > 0) {
        for (let i = activityList.length - 1; i >= 0; i--) {
            if (activityList[i].t <= currentT) return activityList[i].text;
        }
        return "";
    }
    // Fallback: raw mode
    if (snapshotTicks.length < 2) return snapshotActivities[0] || "";
    const totalTick = snapshotTicks[snapshotTicks.length-1] - snapshotTicks[0] || 1;
    const gameTick = snapshotTicks[0] + currentT * totalTick;
    for (let i = snapshotTicks.length-1; i >= 0; i--) {
        if (snapshotTicks[i] <= gameTick) return snapshotActivities[i] || "";
    }
    return "";
}

function getGameTick() {
    if (snapshotTicks.length < 2) return 0;
    return snapshotTicks[0] + currentT * (snapshotTicks[snapshotTicks.length-1] - snapshotTicks[0]);
}

// ── Camera ──
function fitCamera() {
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for (const e of world.values()) {
        if (getCategory(e.name)==="resource") continue;
        if (e.x<minX)minX=e.x; if(e.x>maxX)maxX=e.x;
        if (e.y<minY)minY=e.y; if(e.y>maxY)maxY=e.y;
    }
    if (!isFinite(minX)) { camX=0;camY=0;zoom=8; return; }
    const bw=Math.max(maxX-minX,20),bh=Math.max(maxY-minY,20);
    camX=(minX+maxX)/2; camY=(minY+maxY)/2;
    zoom=Math.min(canvas.width/(bw*1.3),canvas.height/(bh*1.3));
    zoom=Math.max(1,Math.min(zoom,64));
}

function worldToScreen(x, y) {
    return [(x-camX)*zoom+canvas.width/2, (y-camY)*zoom+canvas.height/2];
}
function screenToWorld(sx, sy) {
    return [(sx-canvas.width/2)/zoom+camX, (sy-canvas.height/2)/zoom+camY];
}

// ── Entity lookup ──
function rebuildPosLookup() {
    entityPosLookup.clear();
    for (const e of world.values()) {
        entityPosLookup.set(`${Math.round(e.x*2)/2},${Math.round(e.y*2)/2}`, e);
    }
    posLookupVersion++;
}

function hasNeighbor(x, y, cat) {
    const e = entityPosLookup.get(`${Math.round(x*2)/2},${Math.round(y*2)/2}`);
    return e && getCategory(e.name) === cat;
}

// ── Rail neighbor cache (spatial hash) ──
function getRailNeighborIndex() {
    if (railCacheVersion === posLookupVersion) return railNeighborCache;
    railNeighborCache = new Map();

    // Spatial hash: bucket rails into grid cells
    const CELL = 8;
    const grid = new Map();
    const railList = [];
    for (const e of world.values()) {
        if (getCategory(e.name) !== "rail") continue;
        railList.push(e);
        const gx = Math.floor(e.x / CELL), gy = Math.floor(e.y / CELL);
        const gk = `${gx},${gy}`;
        if (!grid.has(gk)) grid.set(gk, []);
        grid.get(gk).push(e);
    }

    for (const e of railList) {
        const gx = Math.floor(e.x / CELL), gy = Math.floor(e.y / CELL);
        const neighbors = [];
        // Check 3x3 grid neighborhood
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const cell = grid.get(`${gx+dx},${gy+dy}`);
                if (!cell) continue;
                for (const n of cell) {
                    if (n === e) continue;
                    const d = (n.x-e.x)**2 + (n.y-e.y)**2;
                    if (d <= 144) neighbors.push({ entity: n, dist: d });
                }
            }
        }
        neighbors.sort((a,b) => a.dist - b.dist);
        railNeighborCache.set(`${e.x},${e.y}`, neighbors.slice(0,2).map(n => n.entity));
    }
    railCacheVersion = posLookupVersion;
    return railNeighborCache;
}

// ── Specialized drawing functions ──
function drawBelt(ctx, e, sx, sy, zoom, colorStr) {
    const dir = (e.direction||0)%16;
    const beltWidth = zoom * 0.55;
    const halfTile = zoom / 2;

    ctx.strokeStyle = colorStr;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = beltWidth;

    // Use real belt connections if available
    if (e.bn && e.bn.length > 0) {
        let hasOutput = false, hasInput = false;
        for (const nb of e.bn) {
            const dx = nb.x - e.x, dy = nb.y - e.y;
            if (nb.d === "i") {
                ctx.beginPath();
                ctx.moveTo(sx + dx * zoom / 2, sy + dy * zoom / 2);
                ctx.lineTo(sx, sy);
                ctx.stroke();
                hasInput = true;
            } else {
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx + dx * zoom / 2, sy + dy * zoom / 2);
                ctx.stroke();
                hasOutput = true;
            }
        }
        // Always extend in flow direction if no explicit output/input found
        const fdx = DIR_DX[dir]||0, fdy = DIR_DY[dir]||0;
        const outDx = Math.round(fdx), outDy = Math.round(fdy);
        if (!hasOutput) {
            ctx.beginPath(); ctx.moveTo(sx, sy);
            ctx.lineTo(sx + outDx * halfTile, sy + outDy * halfTile); ctx.stroke();
        }
        if (!hasInput) {
            ctx.beginPath(); ctx.moveTo(sx - outDx * halfTile, sy - outDy * halfTile);
            ctx.lineTo(sx, sy); ctx.stroke();
        }
        return;
    }

    // Fallback: infer connections from direction + neighbors
    const fdx = DIR_DX[dir]||0, fdy = DIR_DY[dir]||0;
    const outDx = Math.round(fdx), outDy = Math.round(fdy);
    const inDx = -outDx, inDy = -outDy;

    let hasInput = false;
    const inN = entityPosLookup.get(`${Math.round((e.x+inDx)*2)/2},${Math.round((e.y+inDy)*2)/2}`);
    if (inN && (BELT_NAMES.has(inN.name) || SPLITTER_NAMES.has(inN.name))) hasInput = true;

    const sideInputs = [];
    for (const [sdx,sdy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        if ((sdx===outDx&&sdy===outDy)||(sdx===inDx&&sdy===inDy)) continue;
        const sN = entityPosLookup.get(`${Math.round((e.x+sdx)*2)/2},${Math.round((e.y+sdy)*2)/2}`);
        // Only count actual transport belts as side inputs (not underground/splitter)
        if (sN && BELT_NAMES.has(sN.name)) {
            const sd=(sN.direction||0)%16;
            if (Math.round(DIR_DX[sd]||0)===-sdx && Math.round(DIR_DY[sd]||0)===-sdy) sideInputs.push([sdx,sdy]);
        }
    }

    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(sx + outDx*halfTile, sy + outDy*halfTile); ctx.stroke();

    if (hasInput) { ctx.beginPath(); ctx.moveTo(sx+inDx*halfTile,sy+inDy*halfTile); ctx.lineTo(sx,sy); ctx.stroke(); }
    for (const [sdx,sdy] of sideInputs) { ctx.beginPath(); ctx.moveTo(sx+sdx*halfTile,sy+sdy*halfTile); ctx.lineTo(sx,sy); ctx.stroke(); }
    if (!hasInput && sideInputs.length===0) { ctx.beginPath(); ctx.moveTo(sx+inDx*halfTile,sy+inDy*halfTile); ctx.lineTo(sx,sy); ctx.stroke(); }
}

function drawUndergroundBelt(ctx, e, sx, sy, zoom, colorStr) {
    const dir = (e.direction||0)%16;
    const beltWidth = zoom*0.55, halfTile = zoom/2;
    const dx = Math.round(DIR_DX[dir]||0), dy = Math.round(DIR_DY[dir]||0);

    let isEntrance = e.belt_type === "input";
    let isExit = e.belt_type === "output";
    if (!e.belt_type) {
        const bk = `${Math.round((e.x-dx)*2)/2},${Math.round((e.y-dy)*2)/2}`;
        const ak = `${Math.round((e.x+dx)*2)/2},${Math.round((e.y+dy)*2)/2}`;
        const behind = entityPosLookup.get(bk), ahead = entityPosLookup.get(ak);
        isEntrance = (behind && getCategory(behind.name)==="belt") && !(ahead && getCategory(ahead.name)==="belt");
        isExit = !isEntrance;
    }

    ctx.strokeStyle = colorStr; ctx.lineWidth = beltWidth;
    const [r,g,b] = getColor(e.name);
    if (isEntrance) {
        ctx.lineCap="butt"; ctx.beginPath(); ctx.moveTo(sx-dx*halfTile,sy-dy*halfTile); ctx.lineTo(sx,sy); ctx.stroke();
    } else {
        ctx.lineCap="butt"; ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+dx*halfTile,sy+dy*halfTile); ctx.stroke();
    }
    ctx.fillStyle = colorStr; ctx.beginPath(); ctx.arc(sx,sy,beltWidth*0.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgb(${Math.max(0,r-80)},${Math.max(0,g-80)},${Math.max(0,b-80)})`;
    ctx.beginPath(); ctx.arc(sx,sy,beltWidth*0.28,0,Math.PI*2); ctx.fill();
}

function drawSplitter(ctx, e, sx, sy, zoom, colorStr) {
    const dir = (e.direction||0)%16;
    const beltWidth = zoom*0.55;
    const dx = DIR_DX[dir]||0, dy = DIR_DY[dir]||0;
    const px=-dy, py=dx;

    ctx.strokeStyle = colorStr; ctx.lineCap="butt"; ctx.lineWidth=beltWidth;
    for (const off of [-0.5,0.5]) {
        const ox=sx+px*off*zoom, oy=sy+py*off*zoom;
        ctx.beginPath(); ctx.moveTo(ox-dx*zoom*0.5,oy-dy*zoom*0.5); ctx.lineTo(ox+dx*zoom*0.5,oy+dy*zoom*0.5); ctx.stroke();
    }
    const [r,g,b] = getColor(e.name);
    ctx.strokeStyle=`rgb(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,b-30)})`;
    ctx.lineWidth=Math.max(1,beltWidth*0.4);
    ctx.beginPath(); ctx.moveTo(sx+px*0.5*zoom,sy+py*0.5*zoom); ctx.lineTo(sx-px*0.5*zoom,sy-py*0.5*zoom); ctx.stroke();
}

function drawPipe(ctx, e, sx, sy, zoom, colorStr) {
    const pipeWidth = zoom*0.35, halfTile = zoom/2;
    ctx.strokeStyle = colorStr; ctx.lineCap="round"; ctx.lineWidth=pipeWidth;

    // Use precomputed connections if available
    if (e.pn && e.pn.length > 0) {
        for (const nb of e.pn) {
            const dx = nb.x - e.x, dy = nb.y - e.y;
            ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+dx*halfTile,sy+dy*halfTile); ctx.stroke();
        }
        return;
    }

    // Fallback: probe neighbors
    let conns = 0;
    for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        if (hasNeighbor(e.x+dx,e.y+dy,"pipe")||hasNeighbor(e.x+dx,e.y+dy,"fluid")) {
            ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+dx*halfTile,sy+dy*halfTile); ctx.stroke(); conns++;
        }
    }
    if (conns===0) { ctx.fillStyle=colorStr; ctx.beginPath(); ctx.arc(sx,sy,pipeWidth*0.5,0,Math.PI*2); ctx.fill(); }
}

function drawRailConnected(ctx, e, sx, sy, zoom, colorStr) {
    const trackWidth = Math.max(2, zoom*0.5);
    ctx.strokeStyle = colorStr; ctx.lineCap="round"; ctx.lineWidth=trackWidth;

    const conns = e.conn;
    if (!conns || conns.length === 0) {
        // Fallback: proximity-based
        const index = getRailNeighborIndex();
        const neighbors = index.get(`${e.x},${e.y}`) || [];
        if (neighbors.length === 0) {
            ctx.fillStyle = colorStr; ctx.beginPath(); ctx.arc(sx,sy,trackWidth/2,0,Math.PI*2); ctx.fill();
            return;
        }
        for (const n of neighbors) {
            const [nx,ny] = worldToScreen(n.x, n.y);
            ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(nx,ny); ctx.stroke();
        }
        return;
    }

    // Draw full lines to each connection
    for (const c of conns) {
        const [nx, ny] = worldToScreen(c[0], c[1]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(nx, ny);
        ctx.stroke();
    }
}

function drawPole(ctx, e, sx, sy, zoom) {
    const [r, g, b] = getColor(e.name);
    const isBig = e.name === "big-electric-pole" || e.name === "substation";
    const poleR = isBig ? Math.max(2.5, zoom * 0.3) : Math.max(1.5, zoom * 0.18);

    // Outer ring
    ctx.fillStyle = `rgb(${Math.min(255,r+40)},${Math.min(255,g+40)},${Math.min(255,b+40)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, poleR, 0, Math.PI * 2);
    ctx.fill();

    // Inner dot
    ctx.fillStyle = `rgb(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,b-40)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, poleR * 0.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawInserter(ctx, e, sx, sy, zoom, colorStr) {
    const dir = (e.direction || 0) % 16;
    const [r, g, b] = getColor(e.name);
    const halfTile = zoom / 2;
    const dx = Math.round(DIR_DX[dir] || 0);
    const dy = Math.round(DIR_DY[dir] || 0);

    // Arm reach depends on inserter type
    const isLong = e.name === "long-handed-inserter";
    const armLen = isLong ? halfTile * 1.8 : halfTile * 1.2;

    // Base square
    const baseSize = zoom * 0.35;
    ctx.fillStyle = `rgb(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,b-30)})`;
    ctx.fillRect(sx - baseSize/2, sy - baseSize/2, baseSize, baseSize);

    // Arm: line from behind (pickup) through center to front (dropoff)
    const tipX = sx + dx * armLen;
    const tipY = sy + dy * armLen;

    ctx.strokeStyle = colorStr;
    ctx.lineWidth = Math.max(1, zoom * 0.1);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx - dx * halfTile * 0.3, sy - dy * halfTile * 0.3);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Grabber circle at tip
    const grabR = Math.max(1.5, zoom * 0.12);
    ctx.fillStyle = colorStr;
    ctx.beginPath();
    ctx.arc(tipX, tipY, grabR, 0, Math.PI * 2);
    ctx.fill();
}

function drawChest(ctx, e, sx, sy, zoom) {
    const s = zoom * 0.7;
    const [r, g, b] = getColor(e.name);

    // Body
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.roundRect(sx - s/2, sy - s/2, s, s, Math.max(1, s * 0.15));
    ctx.fill();

    // Lid line
    ctx.strokeStyle = `rgb(${Math.max(0,r-50)},${Math.max(0,g-50)},${Math.max(0,b-50)})`;
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.beginPath();
    ctx.moveTo(sx - s * 0.35, sy - s * 0.1);
    ctx.lineTo(sx + s * 0.35, sy - s * 0.1);
    ctx.stroke();

    // Latch dot
    if (zoom > 6) {
        ctx.fillStyle = `rgb(${Math.min(255,r+60)},${Math.min(255,g+60)},${Math.min(255,b+60)})`;
        ctx.beginPath();
        ctx.arc(sx, sy + s * 0.05, Math.max(1, s * 0.08), 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawLamp(ctx, e, sx, sy, zoom) {
    const r = Math.max(2, zoom * 0.3);

    // Outer glow
    ctx.fillStyle = "rgba(255,240,150,0.15)";
    ctx.beginPath();
    ctx.arc(sx, sy, r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Lamp body
    ctx.fillStyle = "rgb(255,240,150)";
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // Bright center
    ctx.fillStyle = "rgb(255,255,220)";
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
}

function drawTurret(ctx, e, sx, sy, zoom) {
    const [r, g, b] = getColor(e.name);
    let [w, h] = getSize(e.name);
    const s = Math.min(w, h) * zoom;

    // Base (dark square)
    ctx.fillStyle = `rgb(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,b-30)})`;
    ctx.fillRect(sx - s/2, sy - s/2, s, s);

    // Turret barrel (line from center outward in direction)
    const dir = (e.direction || 0) % 16;
    const dx = DIR_DX[dir] || 0, dy = DIR_DY[dir] || 0;
    const barrelLen = s * 0.6;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = Math.max(2, s * 0.15);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + dx * barrelLen, sy + dy * barrelLen);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = `rgb(${Math.min(255,r+40)},${Math.min(255,g+40)},${Math.min(255,b+40)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1.5, s * 0.12), 0, Math.PI * 2);
    ctx.fill();
}

function drawLab(ctx, e, sx, sy, zoom) {
    const s = 3 * zoom; // labs are 3x3
    const [r, g, b] = [180, 180, 220]; // light blue-gray

    // Hexagonal shape (6 sides)
    const radius = s / 2;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
        const px = sx + Math.cos(angle) * radius;
        const py = sy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Border
    ctx.strokeStyle = `rgb(${r-40},${g-40},${b-40})`;
    ctx.lineWidth = Math.max(1, zoom * 0.08);
    ctx.stroke();

    // Flask symbol in center (if zoomed enough)
    if (zoom > 5) {
        ctx.fillStyle = `rgb(${r-60},${g-60},${b})`;
        const fs = radius * 0.35;
        // Flask body
        ctx.beginPath();
        ctx.moveTo(sx - fs * 0.3, sy - fs);
        ctx.lineTo(sx + fs * 0.3, sy - fs);
        ctx.lineTo(sx + fs * 0.6, sy + fs * 0.5);
        ctx.lineTo(sx - fs * 0.6, sy + fs * 0.5);
        ctx.closePath();
        ctx.fill();
    }
}

function drawStorageTank(ctx, e, sx, sy, zoom) {
    const s = 3 * zoom; // 3x3
    const [r, g, b] = getColor(e.name);
    const radius = s / 2 * 0.85;

    // Circular tank body
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Border ring
    ctx.strokeStyle = `rgb(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,b-40)})`;
    ctx.lineWidth = Math.max(1, zoom * 0.1);
    ctx.stroke();

    // Inner circle highlight
    if (zoom > 5) {
        ctx.strokeStyle = `rgb(${Math.min(255,r+30)},${Math.min(255,g+30)},${Math.min(255,b+30)})`;
        ctx.lineWidth = Math.max(1, zoom * 0.06);
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 0.6, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawMiner(ctx, e, sx, sy, zoom, colorStr) {
    const [r, g, b] = getColor(e.name);
    let [w, h] = getSize(e.name);
    const pw = w * zoom, ph = h * zoom;
    const hw = pw / 2, hh = ph / 2;

    // U-shape: three sides of a rectangle (open at top)
    const wallW = Math.max(2, pw * 0.18);
    ctx.fillStyle = colorStr;
    // Left wall
    ctx.fillRect(sx - hw, sy - hh * 0.3, wallW, hh * 1.3);
    // Right wall
    ctx.fillRect(sx + hw - wallW, sy - hh * 0.3, wallW, hh * 1.3);
    // Bottom
    ctx.fillRect(sx - hw, sy + hh - wallW, pw, wallW);
    // Small top shoulders
    ctx.fillRect(sx - hw, sy - hh * 0.3, pw * 0.25, wallW);
    ctx.fillRect(sx + hw - pw * 0.25, sy - hh * 0.3, pw * 0.25, wallW);

    // Product icon in the center opening
    if (showProductIcons && e.product && pw > 8 && ph > 8) {
        const isz = Math.min(pw, ph) * 0.5;
        drawIcon(ctx, e.product, sx - isz/2, sy - isz/4, isz);
    }
}

const RESOURCE_ICONS = {
    "iron-ore":{symbol:"Fe",color:"#4a5066"},"copper-ore":{symbol:"Cu",color:"#5a3c28"},
    "coal":{symbol:"C",color:"#333"},"stone":{symbol:"St",color:"#504b3c"},
    "uranium-ore":{symbol:"U",color:"#325020"},"crude-oil":{symbol:"Oil",color:"#222"},
};

// ── Entity type sets ──
const BELT_NAMES = new Set(["transport-belt","fast-transport-belt","express-transport-belt","turbo-transport-belt"]);
const UNDERGROUND_NAMES = new Set(["underground-belt","fast-underground-belt","express-underground-belt","turbo-underground-belt","loader","fast-loader","express-loader","turbo-loader"]);
const SPLITTER_NAMES = new Set(["splitter","fast-splitter","express-splitter","turbo-splitter"]);
const PIPE_NAMES = new Set(["pipe","pipe-to-ground"]);
const RAIL_NAMES = new Set(["straight-rail","curved-rail-a","curved-rail-b","half-diagonal-rail"]);

// ── Rendering ──
function render() {
    ctx.fillStyle = "#191920";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Viewport bounds for culling
    const [vMinX, vMinY] = screenToWorld(0, 0);
    const [vMaxX, vMaxY] = screenToWorld(canvas.width, canvas.height);
    const margin = 10; // tiles

    // Water
    if (showWater && waterData && zoom >= 0.5) {
        ctx.fillStyle = "rgb(28,40,58)";
        const tilePx = zoom;
        for (const wt of waterData) {
            const wx = wt[0], wy = wt[1];
            if (wx < vMinX-margin || wx > vMaxX+margin || wy < vMinY-margin || wy > vMaxY+margin) continue;
            const sx = (wx-camX)*zoom+canvas.width/2;
            const sy = (wy-camY)*zoom+canvas.height/2;
            ctx.fillRect(sx, sy, tilePx, tilePx);
        }
    }

    // Resource patches for labels
    const resourcePatches = showResourceIcons ? new Map() : null;

    // LOD: when zoomed out far, use simple rectangles for everything
    const useSimple = zoom < 4;

    // Entities: resources first, then foreground
    for (const pass of ["resource","foreground"]) {
        for (const e of world.values()) {
            const cat = getCategory(e.name);
            if (hiddenCategories.has(cat)) continue;
            const isResource = cat === "resource";
            if (pass==="resource" && !isResource) continue;
            if (pass==="foreground" && isResource) continue;

            // Viewport culling
            if (e.x < vMinX-margin || e.x > vMaxX+margin || e.y < vMinY-margin || e.y > vMaxY+margin) continue;

            const sx = (e.x-camX)*zoom+canvas.width/2;
            const sy = (e.y-camY)*zoom+canvas.height/2;
            const colorStr = getColorStr(e.name);

            // Simple mode: just colored rectangles/dots
            if (useSimple) {
                let [w,h] = getSize(e.name);
                if (e.direction===4||e.direction===12) [w,h]=[h,w];
                const pw = Math.max(1, w*zoom), ph = Math.max(1, h*zoom);
                ctx.fillStyle = colorStr;
                ctx.fillRect(sx-pw/2, sy-ph/2, pw, ph);
                if (isResource && resourcePatches) {
                    if (!resourcePatches.has(e.name)) resourcePatches.set(e.name,{sumX:0,sumY:0,count:0});
                    const p=resourcePatches.get(e.name); p.sumX+=e.x; p.sumY+=e.y; p.count++;
                }
                continue;
            }

            // Detailed mode
            if (BELT_NAMES.has(e.name)) {
                drawBelt(ctx, e, sx, sy, zoom, colorStr);
            } else if (UNDERGROUND_NAMES.has(e.name)) {
                drawUndergroundBelt(ctx, e, sx, sy, zoom, colorStr);
            } else if (SPLITTER_NAMES.has(e.name)) {
                drawSplitter(ctx, e, sx, sy, zoom, colorStr);
            } else if (e.name === "lamp" || e.name === "small-lamp") {
                drawLamp(ctx, e, sx, sy, zoom);
            } else if (e.name === "storage-tank") {
                drawStorageTank(ctx, e, sx, sy, zoom);
            } else if (cat === "storage" || (cat === "logistics" && e.name.includes("chest"))) {
                drawChest(ctx, e, sx, sy, zoom);
            } else if (e.name.includes("pole") || e.name === "substation") {
                drawPole(ctx, e, sx, sy, zoom);
            } else if (e.name.includes("turret") && cat === "wall") {
                drawTurret(ctx, e, sx, sy, zoom);
            } else if (cat === "inserter") {
                drawInserter(ctx, e, sx, sy, zoom, colorStr);
            } else if (e.name === "lab" || e.name === "biolab") {
                drawLab(ctx, e, sx, sy, zoom);
            } else if (cat === "mining") {
                drawMiner(ctx, e, sx, sy, zoom, colorStr);
            } else if (PIPE_NAMES.has(e.name)) {
                drawPipe(ctx, e, sx, sy, zoom, colorStr);
            } else if (RAIL_NAMES.has(e.name)) {
                drawRailConnected(ctx, e, sx, sy, zoom, colorStr);
            } else {
                let [w,h] = getSize(e.name);
                if (e.direction===4||e.direction===12) [w,h]=[h,w];
                const pw=w*zoom, ph=h*zoom;
                ctx.fillStyle = colorStr;
                ctx.fillRect(sx-pw/2, sy-ph/2, pw, ph);
                if (!isResource && pw > 6 && ph > 6) {
                    ctx.strokeStyle = getDarkColorStr(e.name);
                    ctx.lineWidth = 1;
                    ctx.strokeRect(sx-pw/2, sy-ph/2, pw, ph);
                }
                // Product icon
                if (showProductIcons && e.product && pw > 8 && ph > 8) {
                    const isz = Math.min(pw,ph)*0.65;
                    drawIcon(ctx, e.product, sx-isz/2, sy-isz/2, isz);
                }
            }

            if (isResource && resourcePatches) {
                if (!resourcePatches.has(e.name)) resourcePatches.set(e.name, {sumX:0,sumY:0,count:0});
                const p = resourcePatches.get(e.name); p.sumX+=e.x; p.sumY+=e.y; p.count++;
            }
        }
    }

    // Resource labels
    if (resourcePatches && resourcePatches.size > 0) {
        ctx.font = `bold ${Math.max(10,Math.min(zoom*2,16))}px Consolas,monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (const [name,patch] of resourcePatches) {
            const icon = RESOURCE_ICONS[name];
            if (!icon || patch.count < 5) continue;
            const [sx,sy] = worldToScreen(patch.sumX/patch.count, patch.sumY/patch.count);
            const m = ctx.measureText(icon.symbol);
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.beginPath(); ctx.roundRect(sx-m.width/2-4,sy-8,m.width+8,16,4); ctx.fill();
            ctx.fillStyle = "#ccc"; ctx.fillText(icon.symbol, sx, sy);
        }
    }

    // Player trail
    if (showPlayerTrail && playerTrail.length >= 2) {
        for (let i = 1; i < playerTrail.length; i++) {
            const [x0,y0]=worldToScreen(playerTrail[i-1].x,playerTrail[i-1].y);
            const [x1,y1]=worldToScreen(playerTrail[i].x,playerTrail[i].y);
            const v = Math.min(255, Math.floor((40+80*i/playerTrail.length)*(playerTrail[i].real?1.5:1)));
            ctx.strokeStyle=`rgb(${v},${v},${v})`; ctx.lineWidth=1;
            ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
        }
    }

    // Player marker
    if (showPlayer && currentPlayerPos) {
        const [px,py]=worldToScreen(currentPlayerPos.x,currentPlayerPos.y);
        ctx.beginPath(); ctx.arc(px,py,6,0,Math.PI*2);
        ctx.fillStyle = currentPlayerPos.real ? "#fff" : "#ffe080"; ctx.fill();
        ctx.strokeStyle="#888"; ctx.lineWidth=1; ctx.stroke();
        ctx.beginPath(); ctx.arc(px,py,2,0,Math.PI*2); ctx.fillStyle="#333"; ctx.fill();
    }

    // Hover highlight
    if (hoveredEntity) {
        const e = hoveredEntity;
        let [w,h]=getSize(e.name); if(e.direction===4||e.direction===12)[w,h]=[h,w];
        const [sx,sy]=worldToScreen(e.x,e.y);
        ctx.strokeStyle="#fff"; ctx.lineWidth=2;
        ctx.strokeRect(sx-w*zoom/2-2,sy-h*zoom/2-2,w*zoom+4,h*zoom+4);
    }

    updateUI();
}

// ── UI ──
function updateUI() {
    const gameTick = getGameTick();
    const totalSec = Math.floor(gameTick/60);
    const hrs=Math.floor(totalSec/3600), mins=Math.floor((totalSec%3600)/60), secs=totalSec%60;
    const ts = hrs>0 ? `${hrs}:${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}` : `${mins}:${String(secs).padStart(2,"0")}`;

    document.getElementById("clock").textContent = ts;
    document.getElementById("snapshot-info").textContent = `${world.size} entities | ${eventIdx}/${events.length} events`;
    document.getElementById("activity").textContent = getCurrentActivity();
    document.getElementById("time-label").textContent = `${(currentT*100).toFixed(1)}% | ${ts}`;

    // Data source indicator: are we at a real snapshot or interpolating?
    const dsEl = document.getElementById("data-source");
    if (dsEl && snapshotBoundaries.length > 0) {
        const SNAP_THRESHOLD = 0.002; // within 0.2% of a boundary = "at snapshot"
        let nearestDist = Infinity;
        let nearestIdx = -1;
        for (let i = 0; i < snapshotBoundaries.length; i++) {
            const d = Math.abs(currentT - snapshotBoundaries[i]);
            if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
        }
        if (nearestDist <= SNAP_THRESHOLD) {
            dsEl.innerHTML = `<span class="real">&#x25cf; Save ${nearestIdx + 1}/${snapshotBoundaries.length}</span>`;
        } else {
            // Find which two snapshots we're between
            let before = 0, after = snapshotBoundaries.length - 1;
            for (let i = 0; i < snapshotBoundaries.length; i++) {
                if (snapshotBoundaries[i] <= currentT) before = i;
                if (snapshotBoundaries[i] > currentT && after === snapshotBoundaries.length - 1) after = i;
            }
            const pct = snapshotBoundaries[after] !== snapshotBoundaries[before]
                ? Math.round((currentT - snapshotBoundaries[before]) / (snapshotBoundaries[after] - snapshotBoundaries[before]) * 100)
                : 0;
            dsEl.innerHTML = `<span class="interpolated">&#x25cb; Interpolating ${before + 1}\u2192${after + 1} (${pct}%)</span>`;
        }
    }
    document.getElementById("timeline").value = Math.round(currentT*10000);
    updateLegendCounts();
}

function buildLegend() {
    const oc = document.getElementById("overlay-toggles"); oc.innerHTML = "";
    const overlays = [
        {label:"Player marker",color:"#fff",get:()=>showPlayer,set:v=>showPlayer=v},
        {label:"Player trail",color:"#888",get:()=>showPlayerTrail,set:v=>showPlayerTrail=v},
        {label:"Water",color:"#1c283a",get:()=>showWater,set:v=>showWater=v},
        {label:"Product icons",color:"#f0dc8c",get:()=>showProductIcons,set:v=>showProductIcons=v},
        {label:"Resource labels",color:"#505050",get:()=>showResourceIcons,set:v=>showResourceIcons=v},
    ];
    for (const ov of overlays) {
        const item = document.createElement("label"); item.className="legend-item";
        const cb = document.createElement("input"); cb.type="checkbox"; cb.checked=ov.get();
        cb.addEventListener("change",()=>{ov.set(cb.checked);render();});
        const sw = document.createElement("div"); sw.className="legend-swatch"; sw.style.background=ov.color;
        const lb = document.createElement("span"); lb.className="legend-label"; lb.textContent=ov.label;
        item.append(cb,sw,lb); oc.appendChild(item);
    }

    const c = document.getElementById("legend-items"); c.innerHTML = "";
    for (const [cat,color] of Object.entries(CATEGORY_COLORS)) {
        const item = document.createElement("label"); item.className="legend-item"; item.dataset.cat=cat;
        const cb = document.createElement("input"); cb.type="checkbox"; cb.checked=!hiddenCategories.has(cat);
        cb.addEventListener("change",()=>{
            if(cb.checked){hiddenCategories.delete(cat);item.classList.remove("hidden");}
            else{hiddenCategories.add(cat);item.classList.add("hidden");}
            render();
        });
        const sw = document.createElement("div"); sw.className="legend-swatch"; sw.style.background=`rgb(${color.join(",")})`;
        const lb = document.createElement("span"); lb.className="legend-label"; lb.textContent=cat;
        const ct = document.createElement("span"); ct.className="legend-count"; ct.id=`legend-count-${cat}`; ct.textContent="0";
        item.append(cb,sw,lb,ct); c.appendChild(item);
    }
}

function updateLegendCounts() {
    const counts = {};
    for (const e of world.values()) { const c=getCategory(e.name); counts[c]=(counts[c]||0)+1; }
    for (const cat of Object.keys(CATEGORY_COLORS)) {
        const el = document.getElementById(`legend-count-${cat}`);
        if (el) el.textContent = counts[cat] || 0;
    }
}

// ── Playback ──
function togglePlay() {
    playing = !playing;
    document.getElementById("btn-play").textContent = playing ? "⏸ Pause" : "▶ Play";
    document.getElementById("btn-play").classList.toggle("active", playing);
    if (playing) { lastFrameTime = performance.now(); requestAnimationFrame(playbackLoop); }
}

function playbackLoop(now) {
    if (!playing) return;
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    const newT = currentT + dt * speed;
    if (newT >= 1) { advanceTo(1); render(); togglePlay(); return; }
    advanceTo(newT);
    render();
    requestAnimationFrame(playbackLoop);
}

function setSpeed(s) {
    speed = Math.max(0.001, Math.min(s, 5));
    document.getElementById("speed-label").textContent = speed >= 0.1 ? `${speed.toFixed(2)}x` : `${speed.toFixed(3)}x`;
}

// ── Render throttling ──
let renderScheduled = false;
function scheduleRender() {
    if (!renderScheduled) {
        renderScheduled = true;
        requestAnimationFrame(() => { renderScheduled = false; render(); });
    }
}

// ── Mouse ──
canvas.addEventListener("mousedown", e => {
    dragging=true; dragStartX=e.clientX; dragStartY=e.clientY; camStartX=camX; camStartY=camY;
    canvas.classList.add("dragging");
});
window.addEventListener("mousemove", e => {
    if (dragging) {
        camX=camStartX-(e.clientX-dragStartX)/zoom;
        camY=camStartY-(e.clientY-dragStartY)/zoom;
        scheduleRender();
    } else if (!playing) {
        updateHover(e.clientX, e.clientY);
    }
});
window.addEventListener("mouseup", () => { dragging=false; canvas.classList.remove("dragging"); });
canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const [wx,wy]=screenToWorld(e.clientX,e.clientY);
    zoom *= e.deltaY<0 ? 1.15 : 1/1.15;
    zoom = Math.max(0.5,Math.min(zoom,200));
    camX = wx-(e.clientX-canvas.width/2)/zoom;
    camY = wy-(e.clientY-canvas.height/2)/zoom;
    scheduleRender();
}, {passive:false});

function updateHover(mx, my) {
    const [wx,wy]=screenToWorld(mx,my);
    const tooltip = document.getElementById("tooltip");
    let found=null, bestDist=Infinity;
    // Only search entities near the cursor (within ~5 tiles)
    const searchR = Math.max(5, 30/zoom);
    for (const e of world.values()) {
        if (Math.abs(e.x-wx) > searchR || Math.abs(e.y-wy) > searchR) continue;
        if (hiddenCategories.has(getCategory(e.name))) continue;
        let [w,h]=getSize(e.name); if(e.direction===4||e.direction===12)[w,h]=[h,w];
        if (wx>=e.x-w/2 && wx<=e.x+w/2 && wy>=e.y-h/2 && wy<=e.y+h/2) {
            const d=(wx-e.x)**2+(wy-e.y)**2;
            if (d<bestDist){bestDist=d;found=e;}
        }
    }
    if (found!==hoveredEntity){hoveredEntity=found;render();}
    if (found) {
        tooltip.style.display="block"; tooltip.style.left=(mx+14)+"px"; tooltip.style.top=(my+14)+"px";
        tooltip.querySelector(".tt-name").textContent=found.name;
        tooltip.querySelector(".tt-product").textContent=found.product?`→ ${found.product}`:"";
        tooltip.querySelector(".tt-pos").textContent=`(${found.x.toFixed(1)}, ${found.y.toFixed(1)})`;
    } else tooltip.style.display="none";
}

// ── Keyboard ──
window.addEventListener("keydown", e => {
    switch(e.key) {
        case " ": e.preventDefault(); togglePlay(); break;
        case "ArrowRight": advanceTo(currentT+0.01); render(); break;
        case "ArrowLeft": seekTo(currentT-0.01); render(); break;
        case "ArrowUp": setSpeed(speed*1.5); break;
        case "ArrowDown": setSpeed(speed/1.5); break;
        case "f": fitCamera(); render(); break;
        case "Home": seekTo(0); render(); break;
        case "End": advanceTo(1); render(); break;
    }
});

// ── Controls ──
document.getElementById("btn-play").addEventListener("click", togglePlay);
document.getElementById("btn-slower").addEventListener("click", () => setSpeed(speed/1.5));
document.getElementById("btn-faster").addEventListener("click", () => setSpeed(speed*1.5));
document.getElementById("timeline").addEventListener("input", e => { seekTo(parseInt(e.target.value)/10000); render(); });

// ── Init ──
resizeCanvas();
loadData();
