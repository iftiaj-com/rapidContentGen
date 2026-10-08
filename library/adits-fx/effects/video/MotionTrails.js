import { BaseEffect } from '../../shared/BaseEffect.js';

/**
 * MotionTrails — Computational ICM (Intentional Camera Movement) effect.
 *
 * Simulates long-exposure photography by blending a ring-buffer of recent
 * frames using one of three modes:
 *
 *  • darken  — min-pixel blend → dark-subject trails on bright backgrounds
 *  • lighten — max-pixel blend → light-subject trails on dark backgrounds
 *  • smear   — exponential-decay weighted blend → full-scene motion blur
 *
 * Supports: color modes (CSS-filter-based), Trails Only mode (solid bg),
 * Audio activation: Trail on Beat (audio gate), Auto Cycle (time-based gate),
 * and Beat Surge (per-beat trail explosion with exponential decay).
 */
export class MotionTrails extends BaseEffect {
    constructor() {
        super('Motion Trails');
        this._frameBuffer     = [];
        this._frameCounter    = 0;
        this._lastW           = 0;
        this._lastH           = 0;
        this._compCanvas      = null;
        this._compCtx         = null;
        // Auto Cycle state
        this._cycleActive      = true;   // true = effect rendering ON
        this._lastCycleFlip    = 0;      // ms timestamp of last cycle toggle
        this._cycleAccumulator = 0;      // for audio-sync cycle mode
        // Beat Surge state
        this._surgeLevel       = 0;      // 0..1, decays each frame
        // Live Hold state — burn canvas accumulates trails over live video
        this._burnCanvas       = null;
        this._burnCtx          = null;
        this._liveHoldActive   = false;  // tracks activation to detect fresh-start
        // Isolation Mode state — differential motion detection canvases
        this._prevFrameCanvas  = null;
        this._prevFrameCtx     = null;
        this._diffCanvas       = null;
        this._diffCtx          = null;
        this._accumCanvas      = null;
        this._accumCtx         = null;
        this._isolWasActive    = false;  // for fresh-start detection
    }

    /** Called by "Restart All" / "Record FX" — wipe accumulated state so
     *  Live Hold and Isolation Mode start from a clean canvas. */
    restart() {
        this._frameBuffer     = [];
        this._frameCounter    = 0;
        this._surgeLevel      = 0;
        this._cycleActive     = true;
        this._lastCycleFlip   = 0;
        this._cycleAccumulator = 0;
        // Clear Live Hold burn canvas so accumulated marks don't persist
        if (this._burnCtx) {
            this._burnCtx.clearRect(0, 0, this._lastW, this._lastH);
        }
        this._liveHoldActive = false;   // forces a fresh-start wipe on next frame
        // Clear Isolation Mode canvases too
        if (this._accumCtx) {
            this._accumCtx.clearRect(0, 0, this._lastW, this._lastH);
            this._accumCtx.fillStyle = '#000000';
            this._accumCtx.fillRect(0, 0, this._lastW, this._lastH);
        }
        if (this._prevFrameCtx) this._prevFrameCtx.clearRect(0, 0, this._lastW, this._lastH);
        this._isolWasActive = false;
    }

    /** Recreate canvases and flush the frame buffer on resize. */
    _ensureSize(dw, dh) {
        if (this._lastW !== dw || this._lastH !== dh) {
            this._lastW = dw;
            this._lastH = dh;
            this._frameBuffer  = [];
            this._frameCounter = 0;
            this._compCanvas   = document.createElement('canvas');
            this._compCanvas.width  = dw;
            this._compCanvas.height = dh;
            this._compCtx = this._compCanvas.getContext('2d');
            // Burn canvas (Live Hold)
            this._burnCanvas = document.createElement('canvas');
            this._burnCanvas.width  = dw;
            this._burnCanvas.height = dh;
            this._burnCtx = this._burnCanvas.getContext('2d');
            this._liveHoldActive = false;
            // Isolation Mode canvases — cleared on resize for a clean fresh start
            this._prevFrameCanvas = document.createElement('canvas');
            this._prevFrameCanvas.width  = dw;
            this._prevFrameCanvas.height = dh;
            this._prevFrameCtx = this._prevFrameCanvas.getContext('2d');
            this._diffCanvas = document.createElement('canvas');
            this._diffCanvas.width  = dw;
            this._diffCanvas.height = dh;
            this._diffCtx = this._diffCanvas.getContext('2d');
            this._accumCanvas = document.createElement('canvas');
            this._accumCanvas.width  = dw;
            this._accumCanvas.height = dh;
            this._accumCtx = this._accumCanvas.getContext('2d');
            this._isolWasActive = false;
        }
    }

    /**
     * Maps a color mode key to a CSS filter string for zero-getImageData
     * color grading. Animated modes use performance.now() in milliseconds.
     */
    _getColorFilter(colorMode, time) {
        const t = time * 0.001;
        switch (colorMode) {
            case 'bw':
                return 'grayscale(100%)';
            case 'rgb':
                return `hue-rotate(${(t * 80) % 360}deg) saturate(600%) contrast(120%)`;
            case 'rainbow':
                return `hue-rotate(${(t * 30) % 360}deg) saturate(300%)`;
            case 'threshold':
                return 'contrast(8000%) saturate(300%)';
            case 'chrome':
                return 'grayscale(100%) contrast(500%) brightness(108%)';
            case 'neon':
                return 'saturate(700%) contrast(130%) brightness(130%)';
            case 'thermal':
                return 'sepia(100%) saturate(800%) hue-rotate(-30deg) contrast(120%)';
            case 'cosmic_vibrant':
                return `hue-rotate(${(200 + (t * 25) % 60).toFixed(1)}deg) saturate(700%) contrast(118%)`;
            case 'cosmic_nebula':
                return `hue-rotate(${(250 + (t * 18) % 50).toFixed(1)}deg) saturate(500%) brightness(118%)`;
            case 'cosmic_supernova':
                return `sepia(100%) saturate(900%) hue-rotate(-20deg) contrast(138%)`;
            default:
                return null; // 'normal' (no filter) and 'custom' (solid fill below)
        }
    }

    render(ctx, videoEngine, activeMedia, crop, audioFeatures) {
        const p = videoEngine.params?.motionTrails || {};

        // ── Parameters ────────────────────────────────────────────────
        const blendMode     = p.blendMode     ?? 'darken';
        const trailLength   = Math.max(2,    Math.min(100,  parseInt(p.trailLength    ?? 20)));
        const persistence   = Math.max(0.30, Math.min(1.0,  parseFloat(p.persistence   ?? 0.85)));
        const trailStrength = Math.max(0.05, Math.min(1.0,  parseFloat(p.trailStrength ?? 0.90)));
        const frameStep     = Math.max(1,    Math.min(8,    parseInt(p.frameStep      ?? 1)));
        const preSmooth     = Math.max(0,    Math.min(6,    parseFloat(p.preSmooth    ?? 1.0)));
        const colorMode     = p.colorMode    ?? 'normal';
        const customColor   = p.customColor  ?? '#ff00ff';
        const trailsOnly    = p.trailsOnly   ?? false;
        const bgColor       = p.bgColor      ?? '#000000';
        // Isolation Mode advanced params (only used when trailsOnly is active)
        const isolTrailDuration    = Math.max(0,  Math.min(100, parseInt(p.isolTrailDuration    ?? 50)));
        const isolStrokeBrightness = Math.max(0,  Math.min(100, parseInt(p.isolStrokeBrightness ?? 70)));
        const isolMotionSensitivity= Math.max(0,  Math.min(100, parseInt(p.isolMotionSensitivity ?? 100)));
        const isolStrokeWeight     = Math.max(0,  Math.min(100, parseInt(p.isolStrokeWeight     ?? 30)));
        const isolDetailLevel      = Math.max(0,  Math.min(100, parseInt(p.isolDetailLevel      ?? 60)));
        const isolFlowTurbulence   = Math.max(0,  Math.min(100, parseInt(p.isolFlowTurbulence   ?? 20)));
        const audioReactive = p.audioReactive !== false;
        const targetFreq    = p.targetFreq   ?? 'bass';
        const trailOnBeat   = p.trailOnBeat  ?? false;
        const trailHold     = p.trailHold    ?? false;
        const liveHold      = p.liveHold     ?? false;
        const autoCycle     = p.autoCycle    ?? false;
        const cycleSpeed    = Math.max(0,   Math.min(8,   parseFloat(p.cycleSpeed  ?? 2.0)));
        const beatSurge     = p.beatSurge    ?? false;
        const surgeDepth    = Math.max(0,   Math.min(1,   parseFloat(p.surgeDepth  ?? 0.6)));

        const dw   = videoEngine.targetW;
        const dh   = videoEngine.targetH;
        const time = performance.now();

        this._ensureSize(dw, dh);

        // ── Audio modulation ──────────────────────────────────────────
        let audioVal = 0;
        if (audioFeatures) {
            if (targetFreq === 'bass')        audioVal = audioFeatures.bass   || 0;
            else if (targetFreq === 'mid')    audioVal = audioFeatures.mid    || 0;
            else if (targetFreq === 'treble') audioVal = audioFeatures.treble || 0;
            else audioVal = ((audioFeatures.bass || 0) + (audioFeatures.mid || 0) + (audioFeatures.treble || 0)) / 3;
        }

        let effectiveLength   = trailLength;
        let effectiveStrength = trailStrength;
        if (audioReactive && audioFeatures) {
            effectiveLength   = Math.min(100, trailLength   + Math.floor(audioVal * 18));
            effectiveStrength = Math.min(1.0, trailStrength + audioVal * 0.15);
        }

        // ── Auto Cycle state update ───────────────────────────────────
        if (autoCycle) {
            if (cycleSpeed <= 0) {
                // Audio Sync: accumulate beat energy to toggle cycle
                this._cycleAccumulator += audioVal * 0.12;
                if (this._cycleAccumulator >= 1.0) {
                    this._cycleActive       = !this._cycleActive;
                    this._cycleAccumulator %= 1.0;
                }
                if (audioVal < 0.02) this._cycleAccumulator = 0; // reset on silence
                this._lastCycleFlip = 0;
            } else {
                // Timer mode: toggle every cycleSpeed/2 seconds
                this._cycleAccumulator = 0;
                if (this._lastCycleFlip === 0) this._lastCycleFlip = time;
                if (time - this._lastCycleFlip >= cycleSpeed * 500) {
                    this._cycleActive   = !this._cycleActive;
                    this._lastCycleFlip  = time;
                }
            }
        } else {
            this._cycleActive      = true;
            this._lastCycleFlip    = 0;
            this._cycleAccumulator = 0;
        }

        // ── Beat Surge (audio-driven trail explosion) ─────────────────
        if (beatSurge && audioFeatures && audioVal > 0.55) {
            this._surgeLevel = Math.max(this._surgeLevel, audioVal * surgeDepth);
        }
        this._surgeLevel *= 0.88;   // decay ~12% per frame — fades in ~12–15 frames
        if (this._surgeLevel > 0.01) {
            effectiveLength   = Math.min(100, effectiveLength   + Math.floor(this._surgeLevel * 50));
            effectiveStrength = Math.min(1.0, effectiveStrength + this._surgeLevel * 0.35);
        }

        // Trails Hold: override strength to full — every buffered frame contributes at 100%
        if (trailHold) effectiveStrength = 1.0;

        // Active blend — Trail Style dropdown is the single source of truth
        const activeBlend = blendMode;

        // ── Frame capture ─────────────────────────────────────────────
        // Trails Hold freezes the buffer completely — no new frames in, no old frames out.
        // The composite locks on the exact moment Hold was activated.
        if (!trailHold) {
            this._frameCounter++;
            if (this._frameCounter % frameStep === 0 || this._frameBuffer.length === 0) {
                const cap    = document.createElement('canvas');
                cap.width    = dw;
                cap.height   = dh;
                const capCtx = cap.getContext('2d');
                if (preSmooth > 0) capCtx.filter = `blur(${preSmooth.toFixed(1)}px)`;
                capCtx.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);
                capCtx.filter = 'none';
                this._frameBuffer.push(cap);
                while (this._frameBuffer.length > effectiveLength) this._frameBuffer.shift();
            }
        } else if (this._frameBuffer.length === 0) {
            // Edge case: Hold activated before the buffer had any frames — capture one seed frame
            const cap    = document.createElement('canvas');
            cap.width    = dw;
            cap.height   = dh;
            const capCtx = cap.getContext('2d');
            capCtx.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);
            this._frameBuffer.push(cap);
        }

        if (this._frameBuffer.length === 0) {
            ctx.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);
            return;
        }

        // ── Auto Cycle gate: show live video in OFF phase ─────────────
        if (!this._cycleActive) {
            ctx.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);
            return;
        }

        // ── Trail on Beat: freeze the last composited trail when quiet ─
        // Skipped in Live Hold mode — live video always plays through there.
        if (!liveHold && trailOnBeat && audioVal < 0.25) {
            const filterStr = this._getColorFilter(colorMode, time);
            if (filterStr) ctx.filter = filterStr;
            ctx.drawImage(this._compCanvas, 0, 0);
            ctx.filter = 'none';
            if (colorMode === 'custom') {
                ctx.save();
                ctx.globalCompositeOperation = 'color';
                ctx.globalAlpha = 0.9;
                ctx.fillStyle   = customColor;
                ctx.fillRect(0, 0, dw, dh);
                ctx.restore();
            }
            return;
        }

        // ── Live Hold: burn trails into live video ────────────────────
        // Each frame is accumulated into _burnCanvas with the blend mode.
        // Output is the live video playing underneath the accumulated burns.
        // trailHold takes priority — if both are on, use frozen-buffer path.
        if (liveHold && !trailHold && this._burnCtx) {
            const op = (activeBlend === 'lighten') ? 'lighten' : 'darken';

            // Fresh activation: wipe the burn canvas so accumulation starts clean
            if (!this._liveHoldActive) {
                this._burnCtx.clearRect(0, 0, dw, dh);
                this._liveHoldActive = true;
            }

            // Accumulate current frame into burn canvas
            this._burnCtx.globalAlpha              = effectiveStrength;
            this._burnCtx.globalCompositeOperation = op;
            this._burnCtx.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);
            this._burnCtx.globalAlpha              = 1.0;
            this._burnCtx.globalCompositeOperation = 'source-over';

            // Output: live video as base, burn canvas as permanent trail overlay
            const filterStr = this._getColorFilter(colorMode, time);
            ctx.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);
            if (filterStr) ctx.filter = filterStr;
            ctx.globalCompositeOperation = op;
            ctx.drawImage(this._burnCanvas, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.filter = 'none';
            if (colorMode === 'custom') {
                ctx.save();
                ctx.globalCompositeOperation = 'color';
                ctx.globalAlpha = 0.9;
                ctx.fillStyle   = customColor;
                ctx.fillRect(0, 0, dw, dh);
                ctx.restore();
            }
            return;
        }
        // Not in Live Hold path — reset activation state so next enable is a fresh start
        this._liveHoldActive = false;

        // ── Isolation Mode: differential motion detection ─────────────
        // Compares each frame to the previous one pixel-by-pixel via Canvas2D
        // 'difference' blend. Where pixels changed → bright marks accumulate.
        // Marks dissolve back toward black over time. Only movement is visible.
        if (trailsOnly) {
            // Fresh activation: wipe canvases for a clean start
            if (!this._isolWasActive) {
                if (this._accumCtx) {
                    this._accumCtx.clearRect(0, 0, dw, dh);
                    this._accumCtx.fillStyle = '#000000';
                    this._accumCtx.fillRect(0, 0, dw, dh);
                }
                if (this._prevFrameCtx) this._prevFrameCtx.clearRect(0, 0, dw, dh);
                this._isolWasActive = true;
            }

            // ── Derived values ────────────────────────────────────────
            // Trail duration: 0 = fast flash (0.20/frame), 100 = near-permanent (0.004/frame)
            const fadeAlpha     = 0.20 - (isolTrailDuration / 100) * 0.196;
            // Motion sensitivity: 100 = any movement shows (low contrast), 0 = only big moves
            const contrastPct   = Math.round(150 + (1 - isolMotionSensitivity / 100) * 2850);
            // Stroke weight: how wide/spread each mark is (blur on diff)
            const strokeBlur    = (isolStrokeWeight / 100) * 6;
            // Detail level: crisp edges (100) vs smooth forms (0)
            const detailBlur    = (1 - isolDetailLevel / 100) * 3.5;
            // Draw alpha: how strongly each movement frame contributes
            const drawAlpha     = 0.05 + (isolStrokeBrightness / 100) * 0.75;
            // Flow turbulence: organic animated displacement
            const turbRadius    = (isolFlowTurbulence / 100) * 8;

            // ── Step 1: Fade accumulation canvas toward black ──────────
            const ac = this._accumCtx;
            ac.fillStyle = `rgba(0,0,0,${fadeAlpha.toFixed(4)})`;
            ac.fillRect(0, 0, dw, dh);

            // ── Step 2: Compute frame difference via 'difference' blend ─
            // Bright pixels = pixels that changed between frames (movement)
            const dc = this._diffCtx;
            dc.clearRect(0, 0, dw, dh);
            dc.globalAlpha = 1.0;
            dc.globalCompositeOperation = 'source-over';
            dc.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);
            dc.globalCompositeOperation = 'difference';
            dc.drawImage(this._prevFrameCanvas, 0, 0);
            dc.globalAlpha = 1.0;
            dc.globalCompositeOperation = 'source-over';

            // ── Step 3: Accumulate diff → bright marks build up ────────
            const totalBlur = strokeBlur + detailBlur;
            const filterParts = [];
            if (totalBlur > 0.1) filterParts.push(`blur(${totalBlur.toFixed(1)}px)`);
            filterParts.push(`contrast(${contrastPct}%)`);
            if (isolStrokeBrightness > 40) {
                filterParts.push(`brightness(${100 + (isolStrokeBrightness - 40) * 3}%)`);
            }
            ac.filter = filterParts.join(' ');
            ac.globalAlpha = drawAlpha;
            ac.globalCompositeOperation = 'screen';
            ac.drawImage(this._diffCanvas, 0, 0);

            // ── Step 4: Flow turbulence — animated offset copies ───────
            // Creates organic, flowing edges as if light is bending around movement
            if (turbRadius > 0.5) {
                const t      = time * 0.001;
                const tAlpha = drawAlpha * 0.30 * (isolFlowTurbulence / 100);
                const ox1 = Math.sin(t * 1.4)          * turbRadius;
                const oy1 = Math.cos(t * 0.8)          * turbRadius;
                const ox2 = Math.sin(t * 0.9 + 2.1)    * turbRadius * 0.55;
                const oy2 = Math.cos(t * 1.6 + 1.0)    * turbRadius * 0.55;
                ac.globalAlpha = tAlpha;
                ac.drawImage(this._diffCanvas, ox1, oy1, dw, dh);
                ac.drawImage(this._diffCanvas, ox2, oy2, dw, dh);
            }

            ac.globalAlpha = 1.0;
            ac.filter = 'none';
            ac.globalCompositeOperation = 'source-over';

            // ── Step 5: Store current frame as "previous" for next frame ─
            this._prevFrameCtx.clearRect(0, 0, dw, dh);
            this._prevFrameCtx.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);

            // ── Step 6: Output — background + accumulated marks + color ──
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, dw, dh);
            ctx.globalCompositeOperation = 'screen';
            const isoColorMode = (colorMode === 'normal') ? 'bw' : colorMode;
            const isoFilterStr = this._getColorFilter(isoColorMode, time);
            if (isoFilterStr) ctx.filter = isoFilterStr;
            ctx.drawImage(this._accumCanvas, 0, 0);
            ctx.filter = 'none';
            ctx.globalCompositeOperation = 'source-over';
            if (colorMode === 'custom') {
                ctx.save();
                ctx.globalCompositeOperation = 'color';
                ctx.globalAlpha = 0.9;
                ctx.fillStyle   = customColor;
                ctx.fillRect(0, 0, dw, dh);
                ctx.restore();
            }
            return;
        }
        // Not in isolation mode — reset so next activation starts clean
        this._isolWasActive = false;

        const n  = this._frameBuffer.length;
        const cc = this._compCtx;
        cc.clearRect(0, 0, dw, dh);

        // Trails Hold forces full persistence (all frames equal weight, no decay).
        // Smear caps at 0.99 to preserve source-over accumulation aesthetics.
        const effectivePersistence = trailHold
            ? (activeBlend === 'smear' ? 0.99 : 1.0)
            : (activeBlend === 'smear' ? Math.min(0.99, persistence) : persistence);

        // ── Compose trail to offscreen canvas ─────────────────────────
        if (activeBlend === 'smear') {
            // Exponential-decay smear: draw oldest to newest
            for (let i = 0; i < n; i++) {
                const age   = n - 1 - i;   // 0 = newest, n-1 = oldest
                const alpha = (i === n - 1) ? 1.0 : Math.pow(effectivePersistence, age) * effectiveStrength;
                cc.globalAlpha              = alpha;
                cc.globalCompositeOperation = 'source-over';
                cc.drawImage(this._frameBuffer[i], 0, 0);
            }
        } else {
            const op = activeBlend === 'lighten' ? 'lighten' : 'darken';
            // Normal: newest frame as clean base, older frames as trail overlay
            cc.globalAlpha              = 1.0;
            cc.globalCompositeOperation = 'source-over';
            cc.drawImage(this._frameBuffer[n - 1], 0, 0);
            for (let i = 0; i < n - 1; i++) {
                const age   = n - 1 - i;   // 1 = most recent, n-1 = oldest
                const alpha = Math.pow(effectivePersistence, age) * effectiveStrength;
                cc.globalAlpha              = alpha;
                cc.globalCompositeOperation = op;
                cc.drawImage(this._frameBuffer[i], 0, 0);
            }
        }
        cc.globalAlpha              = 1.0;
        cc.globalCompositeOperation = 'source-over';

        // ── Apply color mode and blit to output ───────────────────────
        const filterStr = this._getColorFilter(colorMode, time);
        if (filterStr) ctx.filter = filterStr;
        ctx.drawImage(this._compCanvas, 0, 0);
        ctx.filter = 'none';

        // Custom color: 'color' blend preserves luminance while shifting hue
        if (colorMode === 'custom') {
            ctx.save();
            ctx.globalCompositeOperation = 'color';
            ctx.globalAlpha = 0.9;
            ctx.fillStyle   = customColor;
            ctx.fillRect(0, 0, dw, dh);
            ctx.restore();
        }
    }
}
