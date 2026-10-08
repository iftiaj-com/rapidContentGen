// CutoutCollage.js — screen-space "cutout collage" overlay for the AnamorphicCamera.
//
// Port of the Codrops "Cutout Collage Layout" demo (cutout-demo/): there the look is
// pure CSS — copies of one portrait placed on a 12×12 CSS grid, each clipped by an
// irregular `clip-path: polygon(…)` and given its own Rellax scroll-parallax speed.
// This module recreates that recipe on the output canvas: each frame it snapshots the
// FINISHED composited frame (background video/image/webcam + any 3D model / planet +
// rain + bloom), then redraws N polygon-clipped pieces of that snapshot with per-piece
// offset / scale / rotation / tint. Because the pieces are cut from the final frame,
// the effect works identically over flat media and over 3D content — no special cases.
//
// Everything is Canvas2D: no three.js, no GLSL (nothing to add to the prod obfuscator
// exclude list), and no getImageData — the snapshot is a plain canvas→canvas drawImage
// and all colour comes from ctx.filter strings and blend-mode fills.
//
// Layout generation is seeded (mulberry32) so a "Shuffle" reroll is reproducible for a
// given seed. A piece's polygon is FIXED at generate() time; how far it moves / scales
// / rotates is read live from the sliders in composite(), all scaled by the host-eased
// spread progress: 0 = intact frame (the pass is invisible), 1 = fully cut apart.

/** Tiny seeded PRNG — plenty for layout jitter (one imul + shifts per draw). */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Classic Collage — the demo's exact grid cells + clip-path polygons, normalised from
// its 12×12 CSS grid (cutout-demo/styles.css). `r` = [x, y, w, h] frame region, `poly`
// verts are % of that region, `z` is the CSS z-index and `par` its data-rellax-speed
// divided by 8 (the demo's largest speed) so it lands in this module's −1..1 range.
const CLASSIC_PIECES = [
    // portrait-half — the big right-hand slab of the face
    { r: [5 / 12, 0, 6 / 12, 1], poly: [[5, 10], [27, 3], [94, 25], [84, 98], [39, 98], [11, 98], [4, 66], [4, 34]], z: 2, par: 0.375 },
    // portrait-neck
    { r: [4 / 12, 5 / 12, 4 / 12, 5 / 12], poly: [[5, 3], [96, 4], [95, 95], [6, 95], [20, 30]], z: 3, par: -0.625 },
    // portrait-left
    { r: [1 / 12, 5 / 12, 4 / 12, 6 / 12], poly: [[10, 19], [93, 15], [90, 88], [13, 92]], z: 4, par: 0.5 },
    // portrait-eye (cell shrunk to 70% + nudged, like the demo's width/margin overrides)
    { r: [0.275, 0.2, 0.117, 0.117], poly: [[4, 13], [84, 12], [86, 34], [80, 45], [80, 76], [10, 90]], z: 5, par: 0.125 },
    // portrait-shirt
    { r: [0, 10 / 12, 2 / 12, 2 / 12], poly: [[3, 2], [50, 25], [97, 8], [97, 97], [3, 98]], z: 6, par: 0.5 },
    // bg-1 … bg-4 accent chips
    { r: [0, 0, 2 / 12, 3 / 12], poly: [[14, 13], [84, 12], [86, 34], [90, 66], [30, 76], [10, 79]], z: 8, par: -0.25 },
    { r: [10 / 12, 1 / 12, 2 / 12, 5 / 12], poly: [[9, 4], [80, 0], [100, 100], [0, 100]], z: 8, par: 0.375 },
    { r: [0, 3 / 12, 3 / 12, 3 / 12], poly: [[9, 4], [80, 0], [100, 100], [0, 100]], z: 4, par: 0.375 },
    { r: [9 / 12, 0, 2 / 12, 5 / 12], poly: [[5, 4], [94, 3], [97, 96], [13, 96]], z: 1, par: -1 },
];

export class CutoutCollage {
    constructor() {
        this._pieces = [];
        this._snap = null;        // offscreen copy of the pre-collage frame (pieces sample this)
        this._snapCtx = null;
        this._parX = 0;           // smoothed tracking parallax — eases to rest when tracking drops
        this._parY = 0;
    }

    /**
     * (Re)build the piece layout from a seed.
     * @param {object} o { preset, count, size, sizeJitter, edge, seed }
     */
    generate(o = {}) {
        const rng = mulberry32((o.seed ?? 1) >>> 0);
        const count = Math.max(2, Math.min(24, Math.round(o.count ?? 9)));
        const size = Math.max(0.05, Math.min(0.6, o.size ?? 0.3));
        const jit = Math.max(0, Math.min(1, o.sizeJitter ?? 0.5));
        const edge = o.edge || 'poly';
        let pieces;
        switch (o.preset || 'classic') {
            case 'collage': pieces = this._genCollage(rng, count, size, jit, edge); break;
            case 'strips_v': pieces = this._genStrips(rng, count, edge, true); break;
            case 'strips_h': pieces = this._genStrips(rng, count, edge, false); break;
            case 'grid': pieces = this._genGrid(rng, count, edge); break;
            case 'shards': pieces = this._genShards(rng, count, size, jit, edge); break;
            case 'shattered': pieces = this._genShattered(rng, count, edge); break;
            case 'focus': pieces = this._genFocus(rng, count, size, edge); break;
            default: pieces = this._genClassic(rng, edge); break;
        }
        // Per-piece randoms every preset shares (motion / colour seeds). Presets may
        // pre-set fields — classic keeps the demo's z-order and parallax speeds.
        for (const pc of pieces) {
            pc.dirX ??= (rng() - 0.5) * 2;        // spread direction (unit-ish, signed)
            pc.dirY ??= (rng() - 0.5) * 2;
            pc.sJit ??= (rng() - 0.5) * 2;        // zoom-jitter sign+magnitude
            pc.rotJit ??= (rng() - 0.5) * 2;      // rotation sign+magnitude
            pc.par ??= (rng() - 0.5) * 2;         // parallax speed (Rellax-style, −1..1)
            pc.z ??= rng();                        // draw order
            pc.hue = rng();                        // colour-mode seed
            pc.phase = rng() * Math.PI * 2;        // drift oscillation phase
            pc.speed = 0.4 + rng() * 0.8;          // drift oscillation rate
            // Centroid = rotation/scale pivot + offset anchor.
            let cx = 0, cy = 0;
            for (const v of pc.poly) { cx += v[0]; cy += v[1]; }
            pc.cx = cx / pc.poly.length;
            pc.cy = cy / pc.poly.length;
        }
        pieces.sort((a, b) => a.z - b.z);          // higher z draws last (on top)
        this._pieces = pieces;
    }

    /**
     * Draw the collage over the finished frame.
     * @param {CanvasRenderingContext2D} ctx output context (frame already fully drawn)
     * @param {number} w  frame width   @param {number} h frame height
     * @param {object} o live params from the host:
     *   progress 0..1 (eased spread), spread/zoom/rotate/shadow/drift/parallax/
     *   colorStrength 0..1, border px, track {x,y,has}, audio 0..1, time s,
     *   colorMode int, customColor, bgMode, bgColor
     */
    composite(ctx, w, h, o = {}) {
        const p = Math.max(0, Math.min(1, o.progress ?? 0));
        if (!this._pieces.length || p <= 0.001) return;   // assembled — pass is invisible

        // Smoothed tracking parallax: ease toward the viewer position while tracked,
        // back to rest when tracking drops (same gating convention as the particle repel).
        const tx = o.track?.has ? (o.track.x || 0) : 0;
        const ty = o.track?.has ? (o.track.y || 0) : 0;
        this._parX += (tx - this._parX) * 0.10;
        this._parY += (ty - this._parY) * 0.10;

        // 1 — snapshot the finished frame; every piece samples this pre-collage copy so
        // pieces never re-cut each other (no feedback smear).
        if (!this._snap) {
            this._snap = document.createElement('canvas');
            this._snapCtx = this._snap.getContext('2d');
        }
        if (this._snap.width !== w || this._snap.height !== h) {
            this._snap.width = w; this._snap.height = h;
        }
        this._snapCtx.drawImage(ctx.canvas, 0, 0);

        // 2 — backdrop under the pieces (ramps with progress so assembling stays clean).
        const bg = o.bgMode || 'original';
        if (bg === 'dim') {
            ctx.fillStyle = `rgba(0,0,0,${(0.6 * p).toFixed(3)})`;
            ctx.fillRect(0, 0, w, h);
        } else if (bg === 'blur') {
            ctx.save();
            ctx.filter = `blur(${(10 * p).toFixed(1)}px)`;
            ctx.drawImage(this._snap, 0, 0);
            ctx.restore();
        } else if (bg === 'color') {
            ctx.save();
            ctx.globalAlpha = p;
            ctx.fillStyle = o.bgColor || '#000000';
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // 3 — the pieces (already z-sorted at generate time).
        const scl = h / 1080;                        // resolution-independent px scaling
        const time = o.time || 0;
        const cm = o.colorMode | 0;
        const st = Math.max(0, Math.min(1, o.colorStrength ?? 0.7)) * p;
        for (const pc of this._pieces) {
            const audioK = (o.audio || 0) * (0.4 + 0.6 * pc.hue);   // per-piece pulse depth
            // Positive jitter zooms in harder than negative shrinks — duplicated zoomed
            // features (the demo's big eye) read better than tiny slivers.
            const s = Math.max(0.3, 1 + (pc.sJit * (o.zoom ?? 0) * (pc.sJit > 0 ? 0.9 : 0.45) + audioK * 0.15) * p);
            const rot = pc.rotJit * (o.rotate ?? 0) * 0.6 * p;
            const dx = (pc.dirX * (o.spread ?? 0) * 0.35
                + Math.sin(time * pc.speed + pc.phase) * (o.drift ?? 0) * 0.03
                + pc.par * this._parX * (o.parallax ?? 0) * 0.12) * p;
            const dy = (pc.dirY * (o.spread ?? 0) * 0.35
                + Math.cos(time * pc.speed * 0.83 + pc.phase) * (o.drift ?? 0) * 0.022
                + pc.par * this._parY * (o.parallax ?? 0) * 0.12) * p;

            ctx.save();
            // Move/scale/rotate about the piece centroid, then draw the source frame
            // through that transform — the clip below reveals only this piece's polygon.
            ctx.translate((pc.cx + dx) * w, (pc.cy + dy) * h);
            ctx.rotate(rot);
            ctx.scale(s, s);
            if (pc.tilt) {
                // Fake 3D (Shattered): an affine approximation of a plane tilted about
                // tiltAxis — compress perpendicular to the axis plus a small shear.
                // Canvas2D has no real perspective, but at shard scale this reads as it.
                // The Rotation slider doubles as the tilt amount for these pieces.
                const t = Math.min(1.2, pc.tilt * (o.rotate ?? 0) * 2.2) * p;
                ctx.rotate(pc.tiltAxis);
                ctx.transform(1, 0, Math.sin(t * 0.9) * 0.35, Math.max(0.25, 1 - t * 0.55), 0, 0);
                ctx.rotate(-pc.tiltAxis);
            }
            ctx.translate(-pc.cx * w, -pc.cy * h);
            this._tracePath(ctx, pc, w, h);
            if ((o.shadow ?? 0) > 0.01) {
                // Paint the drop shadow with a solid fill BEFORE clipping — a shadow cast
                // by a clipped draw would itself be clipped away. The image covers the fill.
                ctx.save();
                ctx.shadowColor = `rgba(0,0,0,${(0.55 * o.shadow * p).toFixed(3)})`;
                ctx.shadowBlur = 26 * o.shadow * scl;
                ctx.shadowOffsetX = 6 * o.shadow * scl;
                ctx.shadowOffsetY = 10 * o.shadow * scl;
                ctx.fillStyle = '#000';
                ctx.fill();
                ctx.restore();
            }
            ctx.clip();
            const filt = this._pieceFilter(pc, cm, st, time);
            if (filt) ctx.filter = filt;
            ctx.drawImage(this._snap, 0, 0);
            if (filt) ctx.filter = 'none';
            this._pieceTint(ctx, pc, cm, st, o, w, h);
            if (pc.shade) {
                // Facet shading (Shattered): darken / lighten each shard as if the
                // tilted glass pane catches the light differently.
                ctx.save();
                ctx.globalAlpha = Math.min(0.85, Math.abs(pc.shade) * p);
                ctx.fillStyle = pc.shade < 0 ? '#000' : '#fff';
                ctx.fillRect(0, 0, w, h);        // the piece clip limits this to the shard
                ctx.restore();
            }
            if ((o.border ?? 0) > 0.01) {
                // Stroke inside the clip at double width → a crisp ~`border` px edge.
                ctx.lineWidth = o.border * 2 * Math.max(0.5, scl);
                ctx.strokeStyle = `rgba(255,255,255,${(0.9 * p).toFixed(3)})`;
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    dispose() {
        this._pieces = [];
        this._snap = null;       // release the snapshot buffer
        this._snapCtx = null;
        this._parX = 0; this._parY = 0;
    }

    // ── drawing helpers ──────────────────────────────────────────────────────

    /** Set the current path to the piece outline (in frame-pixel coords). */
    _tracePath(ctx, pc, w, h) {
        if (pc.round && pc.rect && ctx.roundRect) {
            const [x, y, pw, ph] = pc.rect;
            ctx.beginPath();
            ctx.roundRect(x * w, y * h, pw * w, ph * h, Math.min(pw * w, ph * h) * 0.12);
            return;
        }
        ctx.beginPath();
        ctx.moveTo(pc.poly[0][0] * w, pc.poly[0][1] * h);
        for (let i = 1; i < pc.poly.length; i++) ctx.lineTo(pc.poly[i][0] * w, pc.poly[i][1] * h);
        ctx.closePath();
    }

    /** ctx.filter string for the piece's colour mode (colour-only filters). */
    _pieceFilter(pc, cm, st, time) {
        if (st <= 0.01) return null;
        switch (cm) {
            case 1:   // Random Tint — each piece gets its own hue cast
                return `hue-rotate(${Math.round(pc.hue * 360 * st)}deg) saturate(${(1 + st * 0.8).toFixed(2)})`;
            case 2:   // Duotone — two alternating inks over a desaturated base
                return `grayscale(${st.toFixed(2)}) sepia(${st.toFixed(2)}) hue-rotate(${pc.hue > 0.5 ? 275 : 155}deg) saturate(${(1 + st * 2).toFixed(2)})`;
            case 4:   // Hue Cycle — slow animated sweep, offset per piece
                return `hue-rotate(${Math.round(((time * 45 + pc.hue * 360) % 360) * st)}deg)`;
            case 5:   // B&W Mix — roughly half the pieces go mono
                return pc.hue < 0.5 ? `grayscale(${st.toFixed(2)})` : null;
            default: return null;
        }
    }

    /** Multiply-fill tints (RGB Split / Custom colour) — drawn inside the piece clip. */
    _pieceTint(ctx, pc, cm, st, o, w, h) {
        if (st <= 0.01) return;
        let color = null;
        if (cm === 3) color = ['#ff5b5b', '#5bff7a', '#5b8cff'][Math.min(2, (pc.hue * 3) | 0)];
        else if (cm === 6) color = o.customColor || '#ff70b8';
        if (!color) return;
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.75 * st;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);        // the piece clip limits this to the polygon
        ctx.restore();
    }

    // ── layout generators (all seeded — Shuffle rerolls the seed) ────────────

    _genClassic(rng, edge) {
        return CLASSIC_PIECES.map((c) => {
            const [x, y, cw, ch] = c.r;
            let poly = c.poly.map(([px, py]) => [x + (px / 100) * cw, y + (py / 100) * ch]);
            let round = false;
            if (edge === 'rect') poly = [[x, y], [x + cw, y], [x + cw, y + ch], [x, y + ch]];
            else if (edge === 'round') { poly = [[x, y], [x + cw, y], [x + cw, y + ch], [x, y + ch]]; round = true; }
            else if (edge === 'tri') poly = this._triFromQuad(rng, [[x, y], [x + cw, y], [x + cw, y + ch], [x, y + ch]]);
            else if (edge === 'torn') poly = this._torn(rng, poly);
            return {
                poly, rect: c.r.slice(), round,
                z: c.z, par: c.par,
                // Modest spread — the demo pieces drift apart subtly, they don't explode.
                dirX: (rng() - 0.5) * 1.2,
                dirY: (rng() - 0.5) * 1.2,
                sJit: (rng() - 0.35) * 1.2,      // biased toward zoom-IN duplicates (demo look)
                rotJit: (rng() - 0.5) * 0.8,
            };
        });
    }

    _genCollage(rng, n, size, jit, edge) {
        const pieces = [];
        for (let i = 0; i < n; i++) {
            // Sum of two rands biases positions toward the centre (where the subject is).
            const cx = 0.5 + (rng() + rng() - 1) * 0.42;
            const cy = 0.5 + (rng() + rng() - 1) * 0.42;
            const base = size * (1 + (rng() - 0.5) * 2 * jit);
            const rx = Math.max(0.03, base * (0.5 + rng() * 0.45));
            const ry = Math.max(0.03, base * (0.5 + rng() * 0.45));
            pieces.push(this._blobPiece(rng, cx, cy, rx, ry, edge));
        }
        return pieces;
    }

    _genStrips(rng, n, edge, vertical) {
        const pieces = [];
        for (let i = 0; i < n; i++) {
            const t0 = i / n, t1 = (i + 1) / n;
            const rect = vertical ? [t0, 0, t1 - t0, 1] : [0, t0, 1, t1 - t0];
            let poly = this._quad(rng, rect, edge === 'poly' ? 0.06 : 0);
            if (edge === 'tri') poly = this._triFromQuad(rng, poly);
            else if (edge === 'torn') poly = this._torn(rng, poly);
            pieces.push({
                poly, rect, round: edge === 'round',
                // Strips slide along their long axis, alternating direction.
                dirX: vertical ? 0 : (i % 2 ? 1 : -1) * (0.4 + rng() * 0.6),
                dirY: vertical ? (i % 2 ? 1 : -1) * (0.4 + rng() * 0.6) : 0,
                rotJit: (rng() - 0.5) * 0.25,     // strips stay mostly straight
                par: (i % 2 ? 1 : -1) * (0.3 + rng() * 0.7),
            });
        }
        return pieces;
    }

    _genGrid(rng, n, edge) {
        const cols = Math.max(2, Math.round(Math.sqrt(n * 1.4)));   // wider than tall
        const rows = Math.max(2, Math.ceil(n / cols));
        const pieces = [];
        for (let r = 0; r < rows && pieces.length < n; r++) {
            for (let c = 0; c < cols && pieces.length < n; c++) {
                const cw = 1 / cols, ch = 1 / rows, pad = 0.08;   // inset → gaps when spread
                const rect = [c * cw + cw * pad, r * ch + ch * pad, cw * (1 - 2 * pad), ch * (1 - 2 * pad)];
                let poly = this._quad(rng, rect, edge === 'poly' ? 0.05 : 0);
                if (edge === 'tri') poly = this._triFromQuad(rng, poly);
                else if (edge === 'torn') poly = this._torn(rng, poly);
                pieces.push({ poly, rect, round: edge === 'round' });
            }
        }
        return pieces;
    }

    _genShards(rng, n, size, jit, edge) {
        const pieces = [];
        for (let i = 0; i < n; i++) {
            const cx = 0.5 + (rng() - 0.5) * 0.9;
            const cy = 0.5 + (rng() - 0.5) * 0.9;
            const base = size * 0.5 * (1 + (rng() - 0.5) * 2 * jit);
            const rx = Math.max(0.02, base * (0.4 + rng() * 0.5));
            const ry = Math.max(0.02, base * (0.4 + rng() * 0.5));
            const pc = this._blobPiece(rng, cx, cy, rx, ry, edge, 3, 4);   // angular shards
            // Radial spread — shards fly outward from the frame centre.
            const mag = 0.6 + rng() * 0.8;
            const ang = Math.atan2(cy - 0.5, cx - 0.5) + (rng() - 0.5) * 0.6;
            pc.dirX = Math.cos(ang) * mag;
            pc.dirY = Math.sin(ang) * mag;
            pieces.push(pc);
        }
        return pieces;
    }

    _genShattered(rng, n, edge) {
        // Full-frame broken-glass shatter: a jittered grid triangulated into shards that
        // tile the whole frame, each inset toward its centroid so dark cracks open up
        // between pieces. Every shard carries a fake-3D tilt + facet shade (see
        // composite()) so the panes read as angled glass catching the light.
        const cols = Math.max(2, Math.ceil(Math.sqrt((n / 2) * 1.6)));
        const rows = Math.max(2, Math.ceil(n / (2 * cols)));
        // Grid vertices, jittered — interior points roam, border points only slide
        // along their edge (so the shards still cover the frame out to the borders).
        const pts = [];
        for (let r = 0; r <= rows; r++) {
            for (let c = 0; c <= cols; c++) {
                let x = c / cols, y = r / rows;
                if (c > 0 && c < cols) x += (rng() - 0.5) * 0.7 / cols;
                if (r > 0 && r < rows) y += (rng() - 0.5) * 0.7 / rows;
                pts.push([x, y]);
            }
        }
        const at = (r, c) => pts[r * (cols + 1) + c];
        const inset = (tri) => {
            const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
            const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
            return tri.map(([x, y]) => [cx + (x - cx) * 0.94, cy + (y - cy) * 0.94]);
        };
        const pieces = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // Split each cell along a random diagonal → two irregular triangles.
                const p00 = at(r, c), p10 = at(r, c + 1), p01 = at(r + 1, c), p11 = at(r + 1, c + 1);
                const tris = rng() < 0.5
                    ? [[p00, p10, p11], [p00, p11, p01]]
                    : [[p10, p11, p01], [p10, p01, p00]];
                for (let tri of tris) {
                    let poly = inset(tri);
                    if (edge === 'torn') poly = this._torn(rng, poly);   // jagged glass
                    const cx = (poly[0][0] + poly[1][0] + poly[2][0]) / 3;
                    const cy = (poly[0][1] + poly[1][1] + poly[2][1]) / 3;
                    // Shards push gently outward from the impact centre (frame middle).
                    const ang = Math.atan2(cy - 0.5, cx - 0.5) + (rng() - 0.5) * 0.5;
                    const mag = 0.25 + rng() * 0.5;
                    pieces.push({
                        poly,
                        dirX: Math.cos(ang) * mag,
                        dirY: Math.sin(ang) * mag,
                        sJit: (rng() - 0.5) * 0.5,        // subtle scale variety only
                        rotJit: (rng() - 0.5) * 0.7,
                        tilt: 0.35 + rng() * 0.65,        // fake-3D tilt magnitude
                        tiltAxis: rng() * Math.PI,        // axis the pane tilts about
                        shade: (rng() - 0.55) * 0.7,      // facet light: mostly dark, some lit
                    });
                }
            }
        }
        return pieces;
    }

    _genFocus(rng, n, size, edge) {
        // Concentric stack over the subject area (upper-centre): each layer is a tighter
        // region drawn progressively more zoomed-IN — the demo's duplicated-eye look.
        const pieces = [];
        const layers = Math.max(3, Math.min(8, Math.round(n / 2) + 1));
        for (let i = 0; i < layers; i++) {
            const f = 1 - i / layers;                     // 1 = outer layer … → 0 inner
            const rx = Math.max(0.05, size * (0.55 + 0.9 * f));
            const ry = rx * (0.8 + rng() * 0.4);
            const pc = this._blobPiece(rng, 0.5 + (rng() - 0.5) * 0.1, 0.42 + (rng() - 0.5) * 0.1, rx, ry, edge);
            pc.sJit = 0.35 + (i / layers) * 0.9;          // inner layers zoom harder
            pc.dirX = (rng() - 0.5) * 0.5;
            pc.dirY = (rng() - 0.5) * 0.5;
            pc.z = i;                                      // inner (smaller) layers on top
            pieces.push(pc);
        }
        return pieces;
    }

    // ── shape helpers ────────────────────────────────────────────────────────

    /** Irregular blob (or rect/rounded) piece centred at cx,cy with radii rx,ry. */
    _blobPiece(rng, cx, cy, rx, ry, edge, kMin = 5, kMax = 8) {
        const rect = [cx - rx, cy - ry, rx * 2, ry * 2];
        let poly, round = false;
        if (edge === 'rect') poly = this._quad(rng, rect, 0);
        else if (edge === 'round') { poly = this._quad(rng, rect, 0); round = true; }
        else {
            const k = edge === 'tri' ? 3 : kMin + Math.floor(rng() * (kMax - kMin + 1));
            const a0 = rng() * Math.PI * 2;
            poly = [];
            for (let j = 0; j < k; j++) {
                const a = a0 + (j / k) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / k);
                const rr = 0.68 + rng() * 0.37;           // radial jitter → irregular outline
                poly.push([cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr]);
            }
            if (edge === 'torn') poly = this._torn(rng, poly);
        }
        return { poly, rect, round };
    }

    /** Drop one corner of a quad → an inscribed triangle (random orientation). */
    _triFromQuad(rng, quad) {
        const drop = Math.floor(rng() * 4);
        return quad.filter((_, i) => i !== drop);
    }

    /** Rect corners with optional jitter j (fraction of the rect's own size). */
    _quad(rng, [x, y, w, h], j) {
        const jx = () => (rng() - 0.5) * 2 * j * w;
        const jy = () => (rng() - 0.5) * 2 * j * h;
        return [
            [x + jx(), y + jy()], [x + w + jx(), y + jy()],
            [x + w + jx(), y + h + jy()], [x + jx(), y + h + jy()],
        ];
    }

    /** Two rounds of midpoint displacement → ragged torn-paper edges. */
    _torn(rng, poly) {
        let verts = poly;
        for (let r = 0; r < 2; r++) {
            const out = [];
            for (let i = 0; i < verts.length; i++) {
                const a = verts[i], b = verts[(i + 1) % verts.length];
                out.push(a);
                out.push([
                    (a[0] + b[0]) / 2 + (rng() - 0.5) * 0.02,
                    (a[1] + b[1]) / 2 + (rng() - 0.5) * 0.02,
                ]);
            }
            verts = out;
        }
        return verts;
    }
}
