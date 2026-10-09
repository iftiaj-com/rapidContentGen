/**
 * VJModulator.js — the control router at the heart of the Video Jockey deck. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * Every VJ FX declares a set of named *channels* (ScanFX: progress / intensity /
 * band / tiling / dim). This module answers one question per channel per frame:
 *
 *      "what is this channel's value right now, 0..1?"
 *
 * …and the answer can come from any of five interchangeable sources:
 *
 *   auto     — a free-running LFO (ramp / eased ramp / sine / ping-pong). This is
 *              the GSAP `repeat:-1, ease:'power1.out'` loop from the reference
 *              demo, generalized and made rate-controllable.
 *   manual   — the slider value, straight through.
 *   audio    — a frequency band (bass / mid / treble / vol) as a continuous
 *              signal, or `beat` as a transient envelope with refractory + decay.
 *   gesture  — hand/face tracking, via whichever bus is already live.
 *   pointer  — the real mouse over the output canvas (the reference demo's own
 *              `uPointer`; the most practical source for a live VJ on a trackpad).
 *   midi     — a hardware knob/fader via VJMidi, bound by MIDI Learn. A peer of
 *              the others, not a special case.
 *
 * Because sources are per-channel and uniform in shape, a future FX gets all six
 * control modes for free just by naming its channels — that is the whole point of
 * the abstraction.
 *
 * BEAT SYNC: an `auto` channel with `syncDivision` set (in beats — 1 = a quarter
 * note, 4 = one bar in 4/4) reads its phase from `ctx.beatClock` (a VJBeatClock
 * instance, published by VJDeck) instead of free-running its own rate/dt LFO.
 * This is what turns "some Hz" into "locked to a 1/4 note" — the free-running
 * path stays exactly as-is for channels that aren't synced, and is also the
 * automatic fallback whenever the clock has no tempo set yet.
 *
 * The beat detector lives here rather than in an FX because Adits has no shared
 * one (DoodleOverlay and AnimeRedraw each carry a private copy of the same
 * rolling-average + refractory technique); putting it in the router means every
 * future VJ FX inherits it.
 *
 * FEEL: every channel can also be told HOW to move, independently of where its
 * value comes from. This is the "swells with the beat rather than flickering at
 * it" problem: a raw band level tracks loudness exactly, which is faithful and
 * usually ugly. A feel reshapes the same signal into something musical without
 * the performer wiring anything — it is one dropdown, not a chain of nodes.
 * `direct` is the untouched path and the default, so nothing changes until the
 * control is deliberately moved.
 *
 * Pure logic — no DOM, no GL, no allocation in the per-frame path.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// FEEL tuning. Every constant is a time in SECONDS or a rate per second, so a
// feel behaves identically at 30 fps, at 60 fps, and during an offline export.
const FEEL_RISE = 0.06;         // jump that counts as a "hit" for punch / step
const FEEL_PUNCH_TAU = 0.14;    // punch fall (~0.4s to vanish)
const FEEL_SWELL_ATK = 0.35;    // swell rise
const FEEL_SWELL_REL = 0.90;    // swell fall - long on purpose, so it cannot flicker
const FEEL_SPRING_K = 80;       // spring stiffness
const FEEL_SPRING_D = 11;       // spring damping (under-damped, so it overshoots once)
const FEEL_SPRING_MAX_DT = 1 / 30;  // integrate no coarser than this, or it blows up
const FEEL_STEP_COUNT = 8;      // notches before Step wraps
const FEEL_STEP_REFRACT = 0.12; // matches the shared onset refractory
// Flicker and Burst are HIT shapes measured off reference stage-light reels:
// a snap to full, then a 12 Hz flicker with linearly fading peaks (flicker), or
// a strobe under a hump envelope about a bar long (burst). The rate itself is
// the deck's Flicker Rate control (ctx.flickerHz), defaulting to 3 Hz for
// photosensitivity; these are the shapes around it.
const FEEL_FLICKER_COUNT = 6;    // flickers per hit before the tail
const FEEL_FLICKER_FADE = 0.65;  // peaks fall to 35 % by the last flicker
const FEEL_FLICKER_TROUGH = 0.2; // how dark the gaps between flickers get
const FEEL_FLICKER_TAIL = 0.12;  // exponential fade after the last flicker
const FEEL_BURST_LEN = 1.0;      // seconds, when no tempo is running (else one bar)
const FEEL_BURST_OFF = 0.4;      // OFF frames of the strobe keep this much light
const FEEL_HZ_DEFAULT = 3;       // used only if the deck passes no rate

/** Default per-channel config; VJDeck overrides fields from the DOM/presets. */
export const CHANNEL_DEFAULTS = {
    source: 'auto',    // auto | manual | audio | gesture | pointer | midi
    manual: 0.5,       // 0..1 — used by `manual`, and as the fallback when a
                       //        gesture/pointer source has no live input yet
    rate: 0.33,        // auto: cycles per second (0.33 ≈ the demo's 3s loop)
    shape: 'ease',     // auto: ramp | ease | sine | pingpong
    band: 'bass',      // audio: kick | snare | hat | beat | bass | mid | treble | vol
    feel: 'direct',    // direct | punch | swell | spring | step | flicker | burst
    gain: 1.0,         // audio: pre-clamp multiplier
    floor: 0.0,        // audio: value when the signal is silent
    axis: 'y',         // gesture/pointer: x | y | radius
    invert: false,
    smooth: 0.0,       // 0..1 EMA — 0 is instant, 0.8 is heavily damped
    syncDivision: null, // auto: beats per cycle when locked to VJBeatClock (null = free-running `rate`)
    midiTarget: null,  // midi: VJMidi target id (e.g. 'ch.intensity')
};

export class VJModulator {
    constructor() {
        this._phase = new Map();   // channel id → 0..1 LFO phase
        this._ema = new Map();     // channel id → smoothed output
        this._beats = new Map();   // channel id → { avg, env, cooldown }
        this._feel = new Map();    // channel id → feel shaper state
        this._time = 0;
    }

    /** Called once per frame by the deck, before any value() calls. */
    beginFrame(dt) {
        this._time += dt;
    }

    /** Drop all running state (used on disable / FX switch) so a re-enabled deck
     *  starts from a clean phase instead of resuming mid-sweep. */
    reset() {
        this._phase.clear();
        this._ema.clear();
        this._beats.clear();
        this._feel.clear();
        this._time = 0;
    }

    /**
     * Resolve one channel.
     * @param {string} id   stable channel key, e.g. 'scan.progress'
     * @param {object} cfg  merged over CHANNEL_DEFAULTS
     * @param {object} ctx  { dt, audio, track, pointer, beatClock, midi } — track/pointer/midi may be null
     * @returns {number} 0..1
     */
    value(id, cfg, ctx) {
        const c = cfg;
        let v;

        switch (c.source) {
            case 'manual':  v = c.manual; break;
            case 'audio':   v = this._audio(id, c, ctx); break;
            case 'gesture': v = this._fromAxis(ctx.track, c); break;
            case 'pointer': v = this._fromAxis(ctx.pointer, c); break;
            case 'midi':    v = ctx.midi?.getValue(c.midiTarget) ?? c.manual; break;
            case 'auto':
            default:        v = this._auto(id, c, ctx); break;
        }

        if (c.invert) v = 1 - v;
        v = clamp01(v);

        // FEEL runs before `smooth`, so the EMA still softens whatever the
        // shaper produced rather than fighting it. A `manual` channel is a
        // constant, and a constant has no motion to shape: the hit shapers
        // would trigger once from zero and then decay it to nothing, so a
        // manual Intensity of 0.7 under Punch would go dark. Skip it.
        if (c.feel && c.feel !== 'direct' && c.source !== 'manual') {
            v = clamp01(this._shapeFeel(id, c.feel, v, ctx));
        }

        if (c.smooth > 0) {
            const prev = this._ema.get(id);
            v = prev === undefined ? v : prev + (v - prev) * (1 - c.smooth);
            this._ema.set(id, v);
        }
        return v;
    }

    // ── Sources ──────────────────────────────────────────────────────────────

    /** Auto source: locked to VJBeatClock when `syncDivision` is set and the
     *  clock has a tempo running, otherwise a free-running dt-driven LFO
     *  (frame-rate independent, identical during offline post-processing). */
    _auto(id, c, ctx) {
        if (c.syncDivision && ctx.beatClock?.running) {
            return this._shapeValue(ctx.beatClock.getPhase(c.syncDivision), c.shape);
        }
        let p = this._phase.get(id) ?? 0;
        p += ctx.dt * c.rate;
        if (p >= 1) p -= Math.floor(p);   // wrap, preserving the fractional part
        this._phase.set(id, p);
        return this._shapeValue(p, c.shape);
    }

    _shapeValue(p, shape) {
        switch (shape) {
            case 'ramp':     return p;
            case 'sine':     return 0.5 + 0.5 * Math.sin(p * Math.PI * 2);
            case 'pingpong': return p < 0.5 ? p * 2 : 2 - p * 2;
            case 'ease':
            default: {
                // GSAP power1.out equivalent — fast start, settling finish. The
                // reference demo's scan uses exactly this feel.
                const inv = 1 - p;
                return 1 - inv * inv;
            }
        }
    }

    /** Continuous band level, or a beat envelope for `band === 'beat'`. */
    _audio(id, c, ctx) {
        const a = ctx.audio;
        if (!a) return c.floor;

        if (c.band === 'beat') return this._beat(id, c, ctx);

        // NOTE: AudioEngine.analyze() returns { bass, mid, treble, vol, rawVol,
        // rawPulse, kick, snare, hat, beat, level } — there is no `energy`
        // field. kick/snare/hat/level are the shared onsets (// SHAREDONSET).
        const raw = (c.band === 'vol' ? a.vol : a[c.band]) || 0;
        return Math.max(c.floor, raw * c.gain);
    }

    /** Transient detector: rolling average + refractory window, then a decaying
     *  envelope so the channel falls off smoothly instead of snapping. */
    _beat(id, c, ctx) {
        let s = this._beats.get(id);
        if (!s) { s = { avg: 0, env: 0, cooldown: 0 }; this._beats.set(id, s); }

        const a = ctx.audio;
        const lvl = (a?.bass || 0) * 0.6 + (a?.vol || 0) * 0.4;

        s.avg = s.avg * 0.92 + lvl * 0.08;
        s.cooldown = Math.max(0, s.cooldown - ctx.dt);

        // A hit is a level meaningfully above the running average, gated by a
        // refractory window so one kick doesn't register as three.
        if (s.cooldown === 0 && lvl > s.avg * 1.35 && lvl > 0.04) {
            s.env = Math.min(1, lvl * c.gain * 2.2);
            s.cooldown = 0.12;
        } else {
            s.env = Math.max(0, s.env - ctx.dt * 2.4);   // ~0.4s fall
        }
        return Math.max(c.floor, s.env);
    }

    /**
     * FEEL — reshape an already-resolved 0..1 value. State is per channel, so
     * two channels on the same source can carry different feels.
     *
     * @param {string} id    channel id, for state lookup
     * @param {string} feel  punch | swell | spring | step | flicker | burst
     *                       ('direct' never gets here)
     * @param {number} v     the resolved value, 0..1
     * @param {object} ctx   { dt, flickerHz, beatClock } — the deck's frame context
     */
    _shapeFeel(id, feel, v, ctx) {
        let s = this._feel.get(id);
        if (!s) { s = { env: 0, prev: 0, vel: 0, step: 0, cd: 0, t: -1, peak: 0, last: 0 }; this._feel.set(id, s); }
        const d = ctx.dt > 0 ? ctx.dt : 1 / 60;
        const hz = ctx.flickerHz > 0 ? ctx.flickerHz : FEEL_HZ_DEFAULT;

        switch (feel) {
            // Any upward move fires, then the fall is a fixed exponential. This
            // is what turns a continuous band into something that punches: the
            // source can swell slowly and the output still reads as a hit.
            case 'punch': {
                const rise = v - s.prev;
                s.prev = v;
                if (rise > FEEL_RISE) s.env = Math.max(s.env, v);
                else s.env *= Math.exp(-d / FEEL_PUNCH_TAU);
                return s.env;
            }

            // Slow both ways, and slower falling than rising, so the value
            // breathes with the music instead of chattering on every frame.
            case 'swell': {
                const tau = v > s.env ? FEEL_SWELL_ATK : FEEL_SWELL_REL;
                s.env += (v - s.env) * (1 - Math.exp(-d / tau));
                return s.env;
            }

            // Damped spring: overshoots once and settles, which reads as weight.
            // dt is capped because a long frame would make the integration
            // explode rather than merely lag.
            case 'spring': {
                const sd = d > FEEL_SPRING_MAX_DT ? FEEL_SPRING_MAX_DT : d;
                const accel = (v - s.env) * FEEL_SPRING_K - s.vel * FEEL_SPRING_D;
                s.vel += accel * sd;
                s.env += s.vel * sd;
                return s.env;
            }

            // One notch per hit, wrapping. Turns any source into a sequencer,
            // which is how a chase advances exactly once per kick.
            case 'step': {
                const rise = v - s.prev;
                s.prev = v;
                s.cd = Math.max(0, s.cd - d);
                if (rise > FEEL_RISE && s.cd <= 0) {
                    s.step = (s.step + 1) % FEEL_STEP_COUNT;
                    s.cd = FEEL_STEP_REFRACT;
                }
                return s.step / (FEEL_STEP_COUNT - 1);
            }

            // Snap to full on a hit, then flicker at the deck's rate with peaks
            // fading linearly, then a short exponential tail. The hit shape of
            // a hot light source flaring on a kick.
            case 'flicker': {
                const rise = v - s.prev;
                s.prev = v;
                // The trigger frame is evaluated AT t = 0 so the hit lands at
                // full peak; the clock only advances on the frames after it.
                if (rise > FEEL_RISE) { s.t = 0; s.peak = v; }
                else if (s.t >= 0) s.t += d;
                if (s.t < 0) return 0;
                const total = FEEL_FLICKER_COUNT / hz;
                if (s.t < total) {
                    const amp = s.peak * (1 - FEEL_FLICKER_FADE * (s.t / total));
                    // cos swings the gaps down to TROUGH of the current peak.
                    const osc = (1 - FEEL_FLICKER_TROUGH) * 0.5 * (1 + Math.cos(Math.PI * 2 * hz * s.t)) + FEEL_FLICKER_TROUGH;
                    s.last = amp * osc;
                    return s.last;
                }
                return s.last * Math.exp(-(s.t - total) / FEEL_FLICKER_TAIL);
            }

            // A strobe that only runs while a hit lasts, under a hump envelope
            // that rises to the middle and falls again. One bar long when a
            // tempo is running, so the burst ends on the next downbeat.
            case 'burst': {
                const rise = v - s.prev;
                s.prev = v;
                if (rise > FEEL_RISE) { s.t = 0; s.peak = v; }
                else if (s.t >= 0) s.t += d;
                if (s.t < 0) return 0;
                const bc = ctx.beatClock;
                const len = (bc?.running && bc.bpm > 0) ? (60 / bc.bpm) * (bc.beatsPerBar || 4) : FEEL_BURST_LEN;
                const u = s.t / len;
                if (u >= 1) return 0;
                const hump = Math.pow(Math.sin(Math.PI * u), 0.7);
                const gate = ((s.t * hz) % 1) < 0.5 ? 1 : FEEL_BURST_OFF;
                return s.peak * hump * gate;
            }
        }
        return v;
    }

    /** Map a normalized {x, y} input onto the channel's chosen axis. Falls back
     *  to the manual value when the source isn't producing anything — so an
     *  un-tracked hand parks the channel instead of snapping it to zero. */
    _fromAxis(pt, c) {
        if (!pt) return c.manual;
        switch (c.axis) {
            case 'x': return pt.x;
            case 'radius': {
                const dx = pt.x - 0.5, dy = pt.y - 0.5;
                return clamp01(Math.hypot(dx, dy) * 2);
            }
            case 'y':
            default: return pt.y;
        }
    }
}
