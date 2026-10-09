/**
 * vj-show.js — shared LIGHT SHOW brain + GLSL chunk for the Video Jockey deck. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * Same shape as vj-shake.js (string chunks an FX splices into its own shader,
 * plus the JS that binds them), but this one carries a whole subsystem rather
 * than a single displacement: the DMX-console effect vocabulary, and the audio
 * brain that drives it.
 *
 * ── Why this is NOT just another VJModulator channel ─────────────────────────
 * VJModulator resolves everything to five smoothed 0..1 values per frame. That
 * is exactly right for a POSITION (ScanFX's depth sweep) and exactly wrong for a
 * light show, which needs three things the channel bus structurally cannot
 * express:
 *
 *   · a hard SQUARE gate at an independent rate — the LFO shapes are ramp /
 *     ease / sine / pingpong, all continuous. There is no strobe in that set.
 *   · a BEAT INDEX. Alternate, Twinkle, Carousel and Colour Rotate are step
 *     patterns: they need "which beat is this" (parity, or a hash seed), not
 *     "how loud is it". VJModulator's `beat` band returns a decaying envelope
 *     and throws the count away.
 *   · a free-running HUE accumulator, so a rainbow keeps rolling across preset
 *     changes instead of restarting.
 *
 * So the volatility lives here, in JS, and reaches the shader as its own
 * uniforms. The five channels stay meaningful (dimmer, beam width, fixture
 * count…) instead of being fought over by the pattern generator.
 *
 * ── Provenance ───────────────────────────────────────────────────────────────
 * Ported from core/TunnelCorridor.js — `SHOW_COMMON` (its GLSL) and
 * `_updateShow()` (its audio brain). That file is deliberately left UNTOUCHED:
 * it is a working feature, and its version of showMod() is written against
 * corridor-Z world space while this one is written against screen-space rig
 * units. The signal processing ports verbatim (it makes no spatial assumptions);
 * the GLSL is the same function with generalized inputs:
 *
 *      showMod(li, z, camZ)   →   showMod(idx, axis, origin)
 *
 *   idx     which fixture (parity picks the left/right bank, hashes seed it)
 *   axis    where that fixture sits along the pattern's travel direction,
 *           in RIG UNITS — 1.0 ≈ one fixture spacing. Every distance constant
 *           below is expressed as a multiple of uShowSpread so a pattern reads
 *           the same whether a rig has 3 fixtures or 48.
 *   origin  the point radiating patterns bloom from, same units as `axis`.
 *
 * If TunnelCorridor is ever deduped against this file, this is the target — but
 * that is its own change, not this one.
 *
 * ── One upgrade over the corridor version ────────────────────────────────────
 * The corridor carries a private `tempoMode`/`bpm` pair. Here, when the deck's
 * VJBeatClock has a tapped tempo, beats are fired from THAT — so the light show
 * and every beat-synced channel run off one clock and cannot drift apart. With
 * no tempo tapped it falls back to the onset detector, which is the zero-setup
 * path and what a VJ gets by default.
 *
 * ── Time basis ───────────────────────────────────────────────────────────────
 * update() takes `dt` from the caller rather than reading performance.now()
 * itself. VJDeck derives that dt from MEDIA time during offline post-processing
 * (which renders frames as fast as it can, not in realtime), so an 8 Hz strobe
 * exports at 8 Hz instead of at whatever rate the encoder happened to run.
 *
 * NOTE: this file embeds a GLSL template literal — it is excluded from the prod
 * obfuscator in vite.config.mjs (same as vj-shake.js / ScanFX.js).
 */

export const SHOW_UNIFORM_NAMES = [
    'uShowMode', 'uShowAmt', 'uShowPhase', 'uShowFast',
    'uShowBeat', 'uShowEnv', 'uShowBeatIdx', 'uShowSpread', 'uShowHue',
];

export const SHOW_UNIFORMS = /* glsl */`
uniform float uShowMode;      // see SHOW_MODES — 0 is Off and early-outs
uniform float uShowAmt;       // dry/wet — 0 leaves the rig completely alone
uniform float uShowPhase;     // main pattern clock (free-running or beat-chased)
uniform float uShowFast;      // always-free clock, for strobe-rate work
uniform float uShowBeat;      // 0..1 decaying envelope of the latest onset
uniform float uShowEnv;       // 0..1 attack/release-smoothed band envelope
uniform float uShowBeatIdx;   // integer onset counter, for step patterns
uniform float uShowSpread;    // spatial period of axis-based patterns, rig units
uniform float uShowHue;       // accumulated hue rotation, 0..1
`;

export const SHOW_FUNCTIONS = /* glsl */`
float showHash(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

vec3 showHue2rgb(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

/**
 * Per-fixture, per-position show modulation.
 *
 * uShowMode is a UNIFORM, so every fragment in every warp takes the same branch:
 * the long if-chain costs one mode's arithmetic, not seventeen, and the early-out
 * makes the whole subsystem free when it is switched off.
 *
 * @param idx     fixture index (parity selects the left/right bank)
 * @param axis    fixture position along the pattern's travel axis, rig units
 * @param origin  where radiating patterns bloom from, same units as axis
 */
void showMod(float idx, float axis, float origin, out float gain, out vec3 tint) {
    gain = 1.0;
    tint = vec3(1.0);
    if (uShowAmt < 0.001 || uShowMode < 0.5) return;

    float sp   = max(uShowSpread, 0.001);
    float side = (mod(idx, 2.0) < 0.5) ? -1.0 : 1.0;   // even = left bank, odd = right
    float m    = uShowMode;
    float g    = 1.0;
    vec3  c    = vec3(1.0);

    if (m < 1.5) {
        // VU Pulse — the classic: brightness rides the smoothed band envelope.
        g = 0.15 + uShowEnv * 2.2;
    } else if (m < 2.5) {
        // Kick Bump — intensity bump on the transient, then a fast fall.
        g = 0.30 + uShowBeat * 2.8;
    } else if (m < 3.5) {
        // Strobe — hard square gate, held open only while there is energy.
        g = step(0.5, fract(uShowFast)) * (0.25 + uShowEnv * 2.2) * 2.0;
    } else if (m < 4.5) {
        // Chase — a lit block runs away along the rig.
        float p = fract(axis / sp + uShowPhase);
        g = 0.10 + pow(1.0 - p, 6.0) * 3.2;
    } else if (m < 5.5) {
        // Wave — the smooth cousin of the chase: a rolling sine along the axis.
        float w = 0.5 + 0.5 * sin((axis / sp - uShowPhase) * 6.2831853);
        g = 0.15 + w * w * 2.4;
    } else if (m < 6.5) {
        // Alternate — the two banks trade places on every onset.
        float on = step(mod(uShowBeatIdx + (side > 0.0 ? 1.0 : 0.0), 2.0), 0.5);
        g = 0.10 + on * 2.4;
    } else if (m < 7.5) {
        // Emergency — rapid triple-flash bursts alternating between the halves.
        // 2 steps per strobe unit: at 6 Hz that is 12 steps/sec, so each burst of
        // three reads as three distinct flashes rather than as a blur.
        float f  = mod(floor(uShowFast * 2.0), 8.0);
        float on = (side < 0.0) ? step(f, 2.5) : (step(3.5, f) * step(f, 6.5));
        g = 0.04 + on * 3.4;
    } else if (m < 8.5) {
        // Twinkle — a fresh random scatter of lit fixtures on every onset.
        float cell = floor(axis / sp);
        float r = showHash(cell * 13.7 + uShowBeatIdx * 7.31 + idx * 3.17);
        g = 0.10 + step(0.55, r) * (0.6 + uShowBeat * 2.4) * 2.0;
    } else if (m < 9.5) {
        // Carousel — fairground alternation: every other cell, flipping per beat,
        // each cell carrying its own hue.
        float cell = floor(axis / sp);
        float on = step(mod(cell + uShowBeatIdx, 2.0), 0.5);
        g = 0.15 + on * 2.2;
        c = showHue2rgb(fract(cell * 0.137 + uShowHue)) * 1.7;
    } else if (m < 10.5) {
        // Rainbow Roll — spectrum rolling along the rig (Spread = period).
        c = showHue2rgb(fract(axis / (sp * 4.0) + uShowHue)) * 1.7;
        g = 0.55 + uShowEnv * 1.4;
    } else if (m < 11.5) {
        // Colour Rotate — the whole rig steps to a new hue each beat.
        c = showHue2rgb(fract(uShowHue)) * 1.7;
        g = 0.45 + uShowBeat * 1.8;
    } else if (m < 12.5) {
        // Ring Pulse — concentric bright rings racing away from the origin.
        float d = abs(axis - origin);
        float r = fract(d / sp - uShowPhase);
        g = 0.10 + pow(1.0 - r, 8.0) * (1.0 + uShowBeat * 3.0) * 2.6;
    } else if (m < 13.5) {
        // Middle Out — light blooms outward from the origin on each hit. The
        // wavefront and its thickness are both scaled by Spread, so this reads
        // identically on a 3-fixture truss and a 48-cell tower.
        float d = abs(axis - origin);
        float front = uShowBeat * sp * 6.0;
        g = 0.08 + smoothstep(front + sp, front, d) * 2.8;
    } else if (m < 14.5) {
        // Blackout Drop — the room is dark; only the kick lights it. The auto-dim
        // trick VJs use so breakdowns go black and the drop slams.
        g = uShowBeat * uShowBeat * 3.4;
    } else if (m < 15.5) {
        // Warp Drive — hue-streaked light bands tearing past at speed.
        float p = fract(axis / (sp * 0.5) + uShowPhase * 2.0);
        g = 0.20 + pow(1.0 - p, 3.0) * 2.2 * (0.5 + uShowEnv);
        c = showHue2rgb(fract(uShowHue + axis * 0.08)) * 1.6;
    } else {
        // HyperX — chase × strobe × rainbow, stacked. For the drop.
        float p = fract(axis / sp + uShowPhase);
        float chase  = pow(1.0 - p, 5.0);
        float strobe = step(0.5, fract(uShowFast));
        g = 0.08 + chase * strobe * (1.0 + uShowEnv * 2.0) * 4.0 + uShowBeat * 0.6;
        c = showHue2rgb(fract(uShowHue + idx * 0.33)) * 1.8;
    }

    gain = mix(1.0, g, uShowAmt);
    tint = mix(vec3(1.0), c, uShowAmt);
}
`;

/** Drives the Pattern dropdown. Indices MUST match the branch order above. */
export const SHOW_MODES = [
    { value: 0,  label: 'Off (steady)' },
    { value: 1,  label: 'VU Pulse' },
    { value: 2,  label: 'Kick Bump' },
    { value: 3,  label: 'Strobe' },
    { value: 4,  label: 'Chase' },
    { value: 5,  label: 'Wave' },
    { value: 6,  label: 'Alternate' },
    { value: 7,  label: 'Emergency' },
    { value: 8,  label: 'Twinkle' },
    { value: 9,  label: 'Carousel' },
    { value: 10, label: 'Rainbow Roll' },
    { value: 11, label: 'Colour Rotate' },
    { value: 12, label: 'Ring Pulse' },
    { value: 13, label: 'Middle Out' },
    { value: 14, label: 'Blackout Drop' },
    { value: 15, label: 'Warp Drive' },
    { value: 16, label: 'HyperX' },
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The audio brain. Turns per-frame FFT bands into the two signals a light show
 * actually needs — a smoothed ENVELOPE and discrete ONSETS — plus the clocks the
 * step patterns count on.
 *
 * AudioEngine gives raw band levels only (its `rawPulse` is an alias for `bass`),
 * so gating on a level would retrigger every frame the bass is loud rather than
 * once per kick. Hence an envelope follower with separate attack/release, and a
 * real onset detector with an adaptive baseline and a refractory window.
 */
export class VJShowEngine {
    constructor() {
        this.env = 0;        // attack/release-smoothed band level
        this.beat = 0;       // decaying envelope of the latest onset
        this.beatIdx = 0;    // wrapped onset counter — patterns need parity/hash only
        this.phase = 0;      // main pattern clock
        this.fast = 0;       // strobe clock
        this.hue = 0;        // accumulated hue rotation

        this._base = 0;      // adaptive baseline the transient has to beat
        this._prevRaw = 0;
        this._refract = 0;
        this._lastClockPhase = 0;
    }

    /** Drop all running state — used on FX switch, preset change and deck reset,
     *  so a re-entered show starts from a clean bar instead of mid-chase. */
    reset() {
        this.env = this.beat = this.beatIdx = 0;
        this.phase = this.fast = this.hue = 0;
        this._base = this._prevRaw = this._refract = 0;
        this._lastClockPhase = 0;
    }

    /**
     * Advance one frame.
     *
     * @param {number} dt       seconds — MEDIA-time delta during offline export
     * @param {object} audio    AudioEngine.analyze() result (may be null)
     * @param {object} p        params: band, attack, release, sensitivity,
     *                          refractory, beatDecay, showSpeed, strobeHz,
     *                          hueSpeed, hueStep, beatSync
     * @param {object} beatClock VJBeatClock — used for onsets when it has a tempo
     * @param {number} clockDt  seconds fed to phase/fast/hue ONLY — defaults to
     *                          `dt`. VJDeck passes 0 here when the deck's
     *                          selected Control source (Audio Reactive /
     *                          Gesture) currently has no real signal, so a
     *                          Chase/Strobe/Wave freezes instead of continuing
     *                          to run off the wall clock alone. `dt` itself
     *                          keeps driving env/beat decay either way, so a
     *                          hit that lands right as the signal cuts out
     *                          still fades out correctly instead of sticking.
     * @returns {boolean} true on the frame an onset fired
     */
    update(dt, audio, p = {}, beatClock = null, clockDt = dt) {
        const band = p.band || 'bass';
        const raw = !audio ? 0 : (
            band === 'mid' ? (audio.mid || 0)
                : band === 'treble' ? (audio.treble || 0)
                    : band === 'vol' ? (audio.vol || 0)
                        : (audio.bass || 0));

        // Envelope: rise on attack, fall on release. Release is the single most
        // important control here — long release sticks through a breakdown, short
        // release snaps. Exponential form keeps it frame-rate independent.
        const tau = raw > this.env ? Math.max(0.001, p.attack ?? 0.02)
            : Math.max(0.001, p.release ?? 0.18);
        this.env += (raw - this.env) * (1 - Math.exp(-dt / tau));

        // Slow adaptive baseline, so the detector tracks quiet passages and loud
        // drops without anyone touching a threshold.
        this._base += (raw - this._base) * (1 - Math.exp(-dt / 0.5));
        this._refract = Math.max(0, this._refract - dt);

        let fired = false;
        if (beatClock?.running) {
            // A tapped tempo outranks the detector: the show and every
            // beat-synced channel then run off the SAME clock and cannot drift.
            const ph = beatClock.getInfo().beatPhase;
            if (ph < this._lastClockPhase) fired = true;
            this._lastClockPhase = ph;
        } else {
            // sens 0..1 → the transient must exceed the baseline by 90%..10%.
            const margin = 0.9 - 0.8 * clamp(p.sensitivity ?? 0.5, 0, 1);
            const thresh = this._base * (1 + margin) + 0.03;
            if (raw > thresh && raw > this._prevRaw && this._refract <= 0) {
                fired = true;
                this._refract = Math.max(0.06, p.refractory ?? 0.12);
            }
        }
        this._prevRaw = raw;

        if (fired) {
            this.beat = 1;
            this.beatIdx = (this.beatIdx + 1) % 4096;
        }
        this.beat *= Math.exp(-dt / Math.max(0.02, p.beatDecay ?? 0.18));

        // Clocks. The main phase either free-runs or chases the onset counter, so
        // a chase advances exactly one step per kick. Both wrap on an integer,
        // which fract() patterns cross seamlessly and which keeps float precision
        // stable indefinitely. Driven by `clockDt`, NOT `dt` — see the param doc.
        if (p.beatSync) this.phase += (this.beatIdx - this.phase) * (1 - Math.exp(-clockDt / 0.07));
        else this.phase = (this.phase + clockDt * (p.showSpeed ?? 1)) % 1024;

        this.fast = (this.fast + clockDt * Math.max(0.1, p.strobeHz ?? 8)) % 1024;
        this.hue = (this.hue + clockDt * (p.hueSpeed ?? 0.15) + (fired ? (p.hueStep ?? 0) : 0)) % 1;

        return fired;
    }

    /**
     * Write the show uniforms.
     * @param {WebGL2RenderingContext} gl
     * @param {object} u        uniform-location map from VJPass.use()
     * @param {object} p        params: showMode, showAmount, showSpread
     * @param {number} phaseOff extra phase from the deck's primary channel, so the
     *                          performer can scrub the chase by hand / audio / MIDI
     */
    bind(gl, u, p = {}, phaseOff = 0) {
        gl.uniform1f(u.uShowMode, p.showMode ?? 0);
        gl.uniform1f(u.uShowAmt, clamp(p.showAmount ?? 1, 0, 1));
        gl.uniform1f(u.uShowPhase, this.phase + phaseOff);
        gl.uniform1f(u.uShowFast, this.fast);
        gl.uniform1f(u.uShowBeat, this.beat);
        gl.uniform1f(u.uShowEnv, clamp(this.env, 0, 1.5));
        gl.uniform1f(u.uShowBeatIdx, this.beatIdx);
        gl.uniform1f(u.uShowSpread, Math.max(0.2, p.showSpread ?? 3));
        gl.uniform1f(u.uShowHue, this.hue);
    }
}
