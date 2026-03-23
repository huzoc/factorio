// Cinematic recording mode for Factory Timelapse viewer
// Activated via ?cinematic=true URL parameter
// Records the canvas to WebM using MediaRecorder API

(function() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("cinematic")) return;

    // Wait for data to load
    const waitForLoad = setInterval(() => {
        if (events && events.length > 0 && !document.getElementById("loading").classList.contains("done")) return;
        if (events && events.length > 0) {
            clearInterval(waitForLoad);
            setTimeout(startCinematic, 500);
        }
    }, 200);

    // Cinematic script: sequence of actions
    function buildScript() {
        return [
            // Opening: start at origin (0,0) — where the player spawns
            { action: "focus", x: 0, y: 0 },
            { action: "seek", t: 0, duration: 0 },
            { action: "fit", maxZoomOut: 10, duration: 0 },
            { action: "text", msg: "Factory Timelapse", sub: "Interactive visualization from your save files", duration: 3000 },
            { action: "wait", duration: 500 },

            // Early game around origin: first builds
            { action: "play", from: 0, to: 0.03, duration: 4000, minZoom: 8 },
            { action: "text", msg: "Watch your factory grow build by build", duration: 2500 },
            { action: "play", from: 0.03, to: 0.08, duration: 5000, minZoom: 6 },
            { action: "wait", duration: 300 },

            // Growing around origin
            { action: "play", from: 0.08, to: 0.18, duration: 5000, minZoom: 5 },
            { action: "wait", duration: 300 },

            // Smooth pan to factory center
            { action: "text", msg: "Following the factory expansion...", duration: 2000 },
            { action: "smoothPan", toX: 215.5, toY: -18.5, toZoom: 4, duration: 3000 },
            { action: "wait", duration: 300 },

            // Show belt upgrades
            { action: "text", msg: "Belt upgrades visible: yellow → red", duration: 2500 },
            { action: "play", from: 0.22, to: 0.30, duration: 4000, minZoom: 4 },
            { action: "wait", duration: 300 },

            // Rewind and forward — scrubbing demo
            { action: "text", msg: "Scrub forward and backward through time", duration: 2000 },
            { action: "play", from: 0.30, to: 0.24, duration: 1500, minZoom: 4 },
            { action: "play", from: 0.24, to: 0.32, duration: 1500, minZoom: 4 },
            { action: "wait", duration: 300 },

            // Toggle features demo
            { action: "text", msg: "Toggle entity categories on/off", duration: 2000 },
            { action: "wait", duration: 500 },
            { action: "toggle", category: "mining", duration: 1200 },
            { action: "text", msg: "Hide miners to see resource patches", duration: 1500 },
            { action: "toggle", category: "mining", duration: 800 },

            { action: "toggle", category: "resource", duration: 1000 },
            { action: "text", msg: "Hide resource patches", duration: 1200 },
            { action: "toggle", category: "resource", duration: 800 },

            { action: "toggle", category: "belt", duration: 1000 },
            { action: "text", msg: "Isolate specific entity types", duration: 1200 },
            { action: "toggle", category: "belt", duration: 800 },

            { action: "toggleOverlay", name: "showProductIcons", value: false, duration: 800 },
            { action: "text", msg: "Product icons on buildings", duration: 1500 },
            { action: "toggleOverlay", name: "showProductIcons", value: true, duration: 1200 },

            // Continue growing
            { action: "play", from: 0.40, to: 0.55, duration: 4000, minZoom: 4 },
            { action: "wait", duration: 300 },

            // Brief zoom out to show full scale
            { action: "seek", t: 0.90, duration: 0 },
            { action: "text", msg: "Zoom out — Level of Detail simplifies rendering", duration: 2500 },
            { action: "smoothZoom", targetZoom: 1.5, duration: 2500 },
            { action: "wait", duration: 1500 },

            // Zoom back in
            { action: "text", msg: "Zoom in for full detail", duration: 2000 },
            { action: "smoothZoom", targetZoom: 5, duration: 2000 },
            { action: "wait", duration: 1500 },

            // End card
            { action: "text", msg: "github.com/huzoc/factorio", sub: "Works retroactively with your existing save files", duration: 4000 },
            { action: "wait", duration: 2000 },
            { action: "stop" },
        ];
    }

    // Focus point for cinematic camera — transitions from origin to factory center
    let focusX = 0;
    let focusY = 0;

    function setCinematicFocus(x, y) { focusX = x; focusY = y; }

    // Fit camera centered on focus point, with minimum zoom
    function cinematicFitCamera(minZoom = 2.5) {
        camX = focusX;
        camY = focusY;
        // Compute zoom based on how many player entities are within view
        // Start tight, gradually widen as factory grows around focus
        let maxDist = 30; // minimum view radius in tiles
        const skipCats = new Set(["resource", "enemy"]);
        for (const e of world.values()) {
            const cat = ENTITY_CATEGORIES[e.name] ||
                (e.name && (e.name.includes("biter")||e.name.includes("spitter")||e.name.includes("worm")||e.name.includes("spawner")) ? "enemy" :
                 e.name && (e.name.includes("ore")||e.name==="coal"||e.name==="stone") ? "resource" : "other");
            if (skipCats.has(cat)) continue;
            const dx = Math.abs(e.x - focusX);
            const dy = Math.abs(e.y - focusY);
            const d = Math.max(dx, dy);
            if (d < 300) { // only consider entities within reasonable range of focus
                maxDist = Math.max(maxDist, d);
            }
        }
        const viewSize = maxDist * 2 * 1.3;
        zoom = Math.min(canvas.width / viewSize, canvas.height / viewSize);
        zoom = Math.max(minZoom, Math.min(zoom, 64));
    }

    let recorder = null;
    let chunks = [];
    let cinematicOverlay = null;
    let currentTextMsg = "";
    let currentTextSub = "";
    let textOpacity = 0;

    function startCinematic() {
        console.log("Starting cinematic recording...");

        // Hide HTML UI — we'll draw everything on canvas
        document.getElementById("info").style.display = "none";
        document.getElementById("legend").style.display = "none";
        document.getElementById("controls").style.display = "none";
        document.getElementById("tooltip").style.display = "none";
        // Make canvas fill entire window
        canvas.style.height = "100vh";
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Create overlay for cinematic text
        cinematicOverlay = document.createElement("div");
        cinematicOverlay.id = "cinematic-overlay";
        cinematicOverlay.style.cssText = `
            position: absolute; top: 0; left: 0; right: 0; bottom: 48px;
            pointer-events: none; display: flex; align-items: center;
            justify-content: center; flex-direction: column; z-index: 50;
        `;
        document.body.appendChild(cinematicOverlay);

        // Start recording
        const stream = canvas.captureStream(30);
        recorder = new MediaRecorder(stream, {
            mimeType: "video/webm;codecs=vp9",
            videoBitsPerSecond: 5000000,
        });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: "video/webm" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "factory-timelapse-showcase.webm";
            a.click();
            console.log("Recording saved!");
        };
        recorder.start();

        // Run script
        runScript(buildScript());
    }

    async function runScript(script) {
        for (const step of script) {
            switch (step.action) {
                case "seek":
                    seekTo(step.t);
                    render();
                    break;

                case "fit":
                    cinematicFitCamera(step.maxZoomOut || 2.5);
                    if (step.duration > 0) {
                        await animateFrames(step.duration);
                    }
                    render();
                    break;

                case "zoom":
                    zoom *= step.factor;
                    zoom = Math.max(zoom, 1.5);
                    render();
                    break;

                case "play": {
                    const frames = Math.max(1, Math.round(step.duration / (1000/30)));
                    const startT = step.from;
                    const endT = step.to;
                    const mz = step.minZoom || 2.5;
                    seekTo(startT);
                    for (let i = 0; i <= frames; i++) {
                        const t = startT + (endT - startT) * (i / frames);
                        if (t > currentT) advanceTo(t);
                        else seekTo(t);
                        cinematicFitCamera(mz);
                        renderWithOverlay();
                        await sleep(1000/30);
                    }
                    break;
                }

                case "text":
                    currentTextMsg = step.msg || "";
                    currentTextSub = step.sub || "";
                    textOpacity = 1;
                    renderWithOverlay();
                    if (step.duration > 0) {
                        // Fade in, hold, fade out
                        await sleep(step.duration - 500);
                        // Fade out
                        for (let i = 10; i >= 0; i--) {
                            textOpacity = i / 10;
                            renderWithOverlay();
                            await sleep(50);
                        }
                        currentTextMsg = "";
                        currentTextSub = "";
                    }
                    break;

                case "wait":
                    // Keep rendering current state
                    const waitFrames = Math.round(step.duration / (1000/30));
                    for (let i = 0; i < waitFrames; i++) {
                        renderWithOverlay();
                        await sleep(1000/30);
                    }
                    break;

                case "toggle": {
                    // Toggle a category visibility
                    const cat = step.category;
                    if (hiddenCategories.has(cat)) hiddenCategories.delete(cat);
                    else hiddenCategories.add(cat);
                    // Update legend checkbox
                    const legendItem = document.querySelector(`.legend-item[data-cat="${cat}"]`);
                    if (legendItem) {
                        legendItem.classList.toggle("hidden");
                        const cb = legendItem.querySelector("input[type=checkbox]");
                        if (cb) cb.checked = !hiddenCategories.has(cat);
                    }
                    renderWithOverlay();
                    if (step.duration > 0) await animateFrames(step.duration);
                    break;
                }

                case "toggleOverlay": {
                    // Toggle an overlay variable
                    if (step.name === "showProductIcons") showProductIcons = step.value;
                    else if (step.name === "showWater") showWater = step.value;
                    else if (step.name === "showPlayer") showPlayer = step.value;
                    else if (step.name === "showPlayerTrail") showPlayerTrail = step.value;
                    renderWithOverlay();
                    if (step.duration > 0) await animateFrames(step.duration);
                    break;
                }

                case "smoothZoom": {
                    // Smoothly animate zoom to target
                    const startZoom = zoom;
                    const targetZoom = step.targetZoom;
                    const frames = Math.max(1, Math.round(step.duration / (1000/30)));
                    for (let i = 0; i <= frames; i++) {
                        const frac = i / frames;
                        // Ease in-out
                        const ease = frac < 0.5 ? 2*frac*frac : 1 - Math.pow(-2*frac+2, 2)/2;
                        zoom = startZoom + (targetZoom - startZoom) * ease;
                        renderWithOverlay();
                        await sleep(1000/30);
                    }
                    break;
                }

                case "focus":
                    setCinematicFocus(step.x, step.y);
                    break;

                case "smoothPan": {
                    const startX = focusX, startY = focusY, startZoom = zoom;
                    const endX = step.toX, endY = step.toY, endZoom = step.toZoom || zoom;
                    const frames = Math.max(1, Math.round(step.duration / (1000/30)));
                    for (let i = 0; i <= frames; i++) {
                        const frac = i / frames;
                        // Ease in-out
                        const ease = frac < 0.5 ? 2*frac*frac : 1 - Math.pow(-2*frac+2, 2)/2;
                        setCinematicFocus(
                            startX + (endX - startX) * ease,
                            startY + (endY - startY) * ease
                        );
                        zoom = startZoom + (endZoom - startZoom) * ease;
                        camX = focusX;
                        camY = focusY;
                        renderWithOverlay();
                        await sleep(1000/30);
                    }
                    break;
                }

                case "stop":
                    if (recorder && recorder.state === "recording") {
                        recorder.stop();
                    }
                    if (cinematicOverlay) cinematicOverlay.remove();
                    console.log("Cinematic complete!");
                    return;
            }
        }
    }

    function renderWithOverlay() {
        render();
        drawHUD();
        if ((currentTextMsg || currentTextSub) && textOpacity > 0) {
            drawCinematicText();
        }
    }

    function drawHUD() {
        const c = canvas.getContext("2d");
        const W = canvas.width, H = canvas.height;

        try { var fnt = "13px Consolas, monospace"; var fntSm = "11px Consolas, monospace"; }
        catch(e) { var fnt = "13px monospace"; var fntSm = "11px monospace"; }

        // --- Info panel (top-left) ---
        const gameTick = getGameTick();
        const totalSec = Math.floor(gameTick / 60);
        const hrs = Math.floor(totalSec / 3600), mins = Math.floor((totalSec % 3600) / 60), secs = totalSec % 60;
        const timeStr = hrs > 0 ? `${hrs}:${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}` : `${mins}:${String(secs).padStart(2,"0")}`;
        const entityCount = world.size;
        const activity = getCurrentActivity();

        // Info background
        const infoLines = [timeStr, `${entityCount} entities`];
        if (activity) infoLines.push(activity);
        const lineH = 16;
        const infoH = infoLines.length * lineH + 12;
        const infoW = 280;

        c.fillStyle = "rgba(0,0,0,0.7)";
        c.beginPath();
        c.roundRect(10, 10, infoW, infoH, 6);
        c.fill();

        c.font = fnt;
        c.textAlign = "left";
        c.textBaseline = "top";
        c.fillStyle = "#ddd";
        c.fillText(timeStr, 18, 16);
        c.fillStyle = "#aaa";
        c.font = fntSm;
        c.fillText(`${entityCount} entities | ${eventIdx}/${events.length} events`, 18, 16 + lineH);
        if (activity) {
            c.fillStyle = "#f0dc8c";
            c.fillText(activity.substring(0, 40), 18, 16 + lineH * 2);
        }

        // --- Data source indicator ---
        const dsEl = document.getElementById("data-source");
        if (dsEl && dsEl.textContent) {
            c.fillStyle = "#aaa";
            c.font = fntSm;
            c.fillText(dsEl.textContent, 18, 16 + lineH * infoLines.length);
        }

        // --- Legend panel (top-right) ---
        const categories = {};
        for (const e of world.values()) {
            const cat = getCategory(e.name);
            categories[cat] = (categories[cat] || 0) + 1;
        }
        const sortedCats = Object.entries(categories).sort((a, b) => b[1] - a[1]);
        const legLineH = 15;
        const legH = sortedCats.length * legLineH + 30;
        const legW = 150;
        const legX = W - legW - 10;

        c.fillStyle = "rgba(0,0,0,0.7)";
        c.beginPath();
        c.roundRect(legX, 10, legW, legH, 6);
        c.fill();

        c.font = fnt;
        c.fillStyle = "#ccc";
        c.fillText("ENTITIES", legX + 10, 16);

        c.font = fntSm;
        let ly = 32;
        for (const [cat, count] of sortedCats) {
            const color = CATEGORY_COLORS[cat] || [180,180,180];
            const hidden = hiddenCategories.has(cat);

            // Checkbox
            c.fillStyle = hidden ? "rgba(60,60,60,0.5)" : `rgb(${color[0]},${color[1]},${color[2]})`;
            c.fillRect(legX + 10, ly, 10, 10);
            if (hidden) {
                c.strokeStyle = "#555";
                c.strokeRect(legX + 10, ly, 10, 10);
            }

            // Label
            c.fillStyle = hidden ? "#555" : "#bbb";
            c.fillText(`${cat}`, legX + 24, ly);
            c.fillStyle = hidden ? "#444" : "#888";
            c.textAlign = "right";
            c.fillText(`${count}`, legX + legW - 10, ly);
            c.textAlign = "left";
            ly += legLineH;
        }

        // --- Controls bar (bottom) ---
        const barH = 32;
        const barY = H - barH;
        c.fillStyle = "rgba(34,34,40,0.9)";
        c.fillRect(0, barY, W, barH);
        c.strokeStyle = "#333";
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, barY); c.lineTo(W, barY); c.stroke();

        // Play button
        c.fillStyle = "#5a7";
        c.beginPath();
        c.roundRect(12, barY + 5, 60, 22, 4);
        c.fill();
        c.fillStyle = "#fff";
        c.font = fnt;
        c.textAlign = "center";
        c.fillText("▶ Play", 42, barY + 11);

        // Speed
        c.fillStyle = "#888";
        c.font = fntSm;
        c.fillText("1x", 90, barY + 11);

        // Timeline bar
        const tlX = 110, tlW = W - 260;
        c.fillStyle = "#444";
        c.beginPath(); c.roundRect(tlX, barY + 13, tlW, 6, 3); c.fill();
        c.fillStyle = "#7a7";
        c.beginPath(); c.roundRect(tlX, barY + 13, tlW * currentT, 6, 3); c.fill();
        // Thumb
        const thumbX = tlX + tlW * currentT;
        c.fillStyle = "#7a7";
        c.beginPath(); c.arc(thumbX, barY + 16, 7, 0, Math.PI * 2); c.fill();

        // Time label
        c.fillStyle = "#aaa";
        c.font = fntSm;
        c.textAlign = "right";
        c.fillText(`${(currentT * 100).toFixed(1)}% | ${timeStr}`, W - 12, barY + 11);

        c.textAlign = "left"; // reset
    }

    function drawCinematicText() {
        const ctx2 = canvas.getContext("2d");
        const a = textOpacity;

        if (currentTextMsg) {
            ctx2.font = "bold 28px Consolas, monospace";
            ctx2.textAlign = "center";
            ctx2.textBaseline = "middle";
            const tw = ctx2.measureText(currentTextMsg).width;
            const y = canvas.height * 0.45;

            // Background
            ctx2.fillStyle = `rgba(0,0,0,${0.7 * a})`;
            ctx2.beginPath();
            ctx2.roundRect(canvas.width/2 - tw/2 - 20, y - 22, tw + 40, currentTextSub ? 64 : 44, 8);
            ctx2.fill();

            // Main text
            ctx2.fillStyle = `rgba(240,220,140,${a})`;
            ctx2.fillText(currentTextMsg, canvas.width/2, y);

            // Sub text
            if (currentTextSub) {
                ctx2.font = "16px Consolas, monospace";
                ctx2.fillStyle = `rgba(180,180,180,${a})`;
                ctx2.fillText(currentTextSub, canvas.width/2, y + 30);
            }
        }
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    async function animateFrames(duration) {
        const frames = Math.round(duration / (1000/30));
        for (let i = 0; i < frames; i++) {
            renderWithOverlay();
            await sleep(1000/30);
        }
    }
})();
