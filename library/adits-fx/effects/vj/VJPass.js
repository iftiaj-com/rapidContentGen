/**
 * VJPass.js — reusable offscreen WebGL2 fullscreen-quad pass for the Video
 * Jockey deck. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the shared plumbing every VJ FX rides on, so a new FX costs one file
 * (a fragment shader + a param table) instead of a new GL bootstrap:
 *
 *   pass.ensure(w, h)                    → lazily builds canvas + context, resizes
 *   pass.buildProgram(key, frag, names)  → compiles/links once (off the frame), caches uniform locs
 *   pass.use(key)                        → binds the program, returns its uniform map
 *   pass.uploadFrame(sourceCanvas)       → unit 0 ← the already-composited frame
 *   pass.uploadAux(unit, source, key)    → unit N ← depth map / matte (change-tracked)
 *   pass.bindBlank(unit)                 → keeps a sampler legal when its source is off
 *   pass.draw()  /  pass.blit(ctx, w, h) → render, then composite back
 *
 * Why vanilla WebGL2 and not the shared WebGPU device: this runs as a GLOBAL
 * post-pass, after the active effect has already drawn. A WebGPU effect may own
 * `videoEngine.gpuDevice` and `gpuCanvas` mid-frame, so borrowing them here would
 * mean contending for another feature's surface. An independent GL context is
 * conflict-free and universally available — same reasoning (and same shape) as
 * effects/video/SplitScreen.js.
 *
 * Zero-cost contract: nothing is allocated until the first ensure() call, and
 * dispose() drops the context entirely so a disabled deck has no GPU footprint.
 *
 * NOTE: this file embeds a GLSL template literal — it is excluded from the prod
 * obfuscator in vite.config.mjs (same as SplitScreen.js / AnamorphicCamera.js).
 */

import { buildProgramDeferred } from '../../shared/gl-link.js';

/** Fullscreen triangle from gl_VertexID — no vertex buffers at all.
 *  vUv is flipped in V so (0,0) is the TOP-left, matching canvas space. */
const VERT_SRC = /* glsl */`#version 300 es
precision highp float;
out vec2 vUv;
void main() {
    vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = vec2(pos.x, 1.0 - pos.y);
    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

export class VJPass {
    /** @param {string} label — used only in console diagnostics. */
    constructor(label = 'VJPass') {
        this._label = label;
        this._canvas = null;
        this._gl = null;
        this._failed = false;

        this._programs = new Map();   // key → { program, u: {name→loc} }
        this._pending = new Set();    // keys whose program is still linking (shared/gl-link.js)
        this._activeKey = null;

        this._textures = new Map();   // unit → WebGLTexture
        this._auxState = new Map();   // unit → last-uploaded identity token
        this._blankUnits = new Set(); // units currently holding the 1×1 placeholder
    }

    get gl() { return this._gl; }
    get failed() { return this._failed; }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /** Create (once) and size the GL surface. Returns false if WebGL2 is
     *  unavailable — callers must treat that as "skip this pass entirely". */
    ensure(w, h) {
        if (this._failed) return false;
        if (!w || !h) return false;

        if (!this._gl) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            // Alpha-capable on purpose, and permanently rather than per-FX:
            // LightsFX emits a < 1 for its transparent void, and the context's
            // alpha flag is fixed at creation, so a runtime toggle would mean
            // tearing the context down and rebuilding every cached program and
            // texture on every toggle.
            //
            // premultipliedAlpha stays at its DEFAULT (true) — the canvas-native
            // format — so blit()'s drawImage never has to convert the whole
            // buffer. An FX that emits a < 1 must therefore output premultiplied
            // colour (`vec4(rgb * a, a)`). ScanFX and LumNetworkFX both end with
            // `vec4(final, 1.0)`, where premultiplying is the identity, so they
            // are byte-identical under this change. // VJ
            const gl = canvas.getContext('webgl2', {
                alpha: true,
                antialias: false,
                depth: false,
                stencil: false,
                preserveDrawingBuffer: false,
                powerPreference: 'high-performance',
            });
            if (!gl) { this._failed = true; return false; }

            // Context loss → drop every cached GPU object; the next ensure()
            // rebuilds from scratch on a fresh canvas.
            canvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                this._gl = null;
                this._canvas = null;
                this._programs.clear();
                this._pending.clear();
                this._textures.clear();
                this._auxState.clear();
                this._blankUnits.clear();
                this._activeKey = null;
            });

            this._canvas = canvas;
            this._gl = gl;
        }

        if (this._canvas.width !== w || this._canvas.height !== h) {
            this._canvas.width = w;
            this._canvas.height = h;
        }
        this._gl.viewport(0, 0, w, h);
        return true;
    }

    // ── Programs ─────────────────────────────────────────────────────────────

    /** Compile + link a fragment shader against the shared vertex shader and
     *  cache it under `key`. Safe to call every frame — it returns the cached
     *  program on every call after the first, and null while the program is
     *  still linking in the background (the FX then skips its draw for that
     *  frame and the composited frame passes through untouched). */
    buildProgram(key, fragSrc, uniformNames) {
        if (this._programs.has(key)) return this._programs.get(key);
        const gl = this._gl;
        if (!gl || this._pending.has(key)) return null;

        this._pending.add(key);
        buildProgramDeferred(gl, VERT_SRC, fragSrc, {
            label: `[${this._label}:${key}]`,
            onReady: (program) => {
                this._pending.delete(key);
                if (this._gl !== gl) return; // context lost / rebuilt meanwhile
                const u = {};
                for (const n of uniformNames) u[n] = gl.getUniformLocation(program, n);
                this._programs.set(key, { program, u });
            },
            onFail: () => {
                this._pending.delete(key);
                if (this._gl === gl) this._failed = true;
            },
        });
        return this._programs.get(key) || null; // set synchronously when the extension is absent
    }

    /** Bind a previously built program. Returns its uniform-location map. */
    use(key) {
        const entry = this._programs.get(key);
        if (!entry || !this._gl) return null;
        if (this._activeKey !== key) {
            this._gl.useProgram(entry.program);
            this._activeKey = key;
        }
        return entry.u;
    }

    // ── Textures ─────────────────────────────────────────────────────────────

    _texture(unit) {
        let t = this._textures.get(unit);
        if (t) return t;
        const gl = this._gl;
        t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this._textures.set(unit, t);
        return t;
    }

    /** Upload the already-composited frame to unit 0. This is the one upload
     *  that genuinely has to happen every frame — the frame changed. */
    uploadFrame(source, unit = 0) {
        const gl = this._gl;
        if (!gl || !source) return false;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, this._texture(unit));
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        this._blankUnits.delete(unit);
        return true;
    }

    /** Upload a secondary texture (depth map, subject matte) only when its
     *  identity token changes — a still depth map uploads exactly once, and a
     *  12 fps matte uploads at 12 fps, not at render fps. */
    uploadAux(unit, source, token) {
        const gl = this._gl;
        if (!gl || !source) return false;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, this._texture(unit));
        if (this._auxState.get(unit) !== token || this._blankUnits.has(unit)) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            this._auxState.set(unit, token);
            this._blankUnits.delete(unit);
        }
        return true;
    }

    /** Bind a 1×1 transparent placeholder so a sampler stays legal while its
     *  feature is switched off (an unbound sampler is undefined behaviour). */
    bindBlank(unit) {
        const gl = this._gl;
        if (!gl) return;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, this._texture(unit));
        if (!this._blankUnits.has(unit)) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
            this._blankUnits.add(unit);
            this._auxState.delete(unit);
        }
    }

    // ── Render ───────────────────────────────────────────────────────────────

    draw() {
        if (!this._gl) return;
        this._gl.drawArrays(this._gl.TRIANGLES, 0, 3);
    }

    /** Composite the GL result back onto the 2D output canvas. */
    blit(ctx, w, h) {
        if (!this._canvas) return;
        ctx.drawImage(this._canvas, 0, 0, w, h);
    }

    dispose() {
        const gl = this._gl;
        if (gl) {
            for (const t of this._textures.values()) gl.deleteTexture(t);
            for (const { program } of this._programs.values()) gl.deleteProgram(program);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        this._textures.clear();
        this._programs.clear();
        this._auxState.clear();
        this._blankUnits.clear();
        this._activeKey = null;
        this._gl = null;
        this._canvas = null;
    }
}
