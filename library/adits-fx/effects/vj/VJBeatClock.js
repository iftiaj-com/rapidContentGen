/**
 * VJBeatClock.js — shared musical clock for the Video Jockey deck. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * The feature that separates "audio-reactive" from "beat-synced": every VJ
 * control up to now reads instantaneous audio levels (bass/mid/treble this
 * frame). That drifts against the music the moment the track has any dynamics.
 * A real show runs on a musical clock — bar/beat/phase — so a working VJ's
 * visuals stay locked to the DJ instead of merely wobbling with the volume.
 *
 * Tap tempo is the reliable primary input (the same 4-tap rolling-average
 * technique every VJ rig — Resolume, VDMX, Ableton — uses); auto BPM detection
 * from bass-onset intervals is an ASSIST only, surfaced as `suggestedBpm` for
 * the UI to offer as a one-click "Use Detected: 128?" — it never overwrites a
 * tapped/typed tempo on its own. Auto onset-interval estimation is inherently
 * noisy (half/double-tempo confusion, syncopation); a VJ trusts their own ears
 * and thumb over an algorithm, so this stays opt-in by design.
 *
 * Phase is derived from a re-anchored origin timestamp rather than accumulated
 * per-frame, so it is exact regardless of render fps and never drifts: calling
 * setBpm() mid-show preserves the CURRENT beat phase and re-anchors forward,
 * instead of snapping the grid back to "beat 1" under a live audience.
 *
 * Pure logic — no DOM, no GL, no allocation in the per-frame path. Consumed by
 * VJDeck (which owns the UI + `tick()` cadence) and read by VJModulator (which
 * resolves an `auto` channel's phase from this clock when `syncDivision` is set,
 * instead of free-running its own LFO).
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const MIN_BPM = 40;
const MAX_BPM = 220;
const TAP_RESET_MS = 2200;   // a gap this long starts a fresh tap sequence
const TAP_WINDOW = 8;        // rolling average over up to this many taps

export class VJBeatClock {
    constructor() {
        this.bpm = 120;
        this.beatsPerBar = 4;
        this.running = false;      // true once a real tempo has been set (tap/manual)
        this.suggestedBpm = null;  // onset-interval assist, UI-offered only

        this._phaseOrigin = 0;     // performance.now() at beat 0
        this._taps = [];           // recent tap timestamps (ms)
        this._lastBeatsElapsed = 0;
        this._queue = [];          // pending quantized callbacks: { division, fn }

        // Lightweight onset-interval BPM suggestion — same rolling-average +
        // refractory shape as VJModulator's beat channel, kept independent so
        // it always runs regardless of what any FX channel is bound to.
        this._onsetAvg = 0;
        this._onsetCooldown = 0;
        this._onsetIntervals = [];
        this._lastOnset = 0;
        this._lastSuggestTime = 0;
        this._prevKick = 0;        // rising-edge memory for the shared kick pulse
    }

    // ── Tempo input ──────────────────────────────────────────────────────────

    /** Call on every tap of the TAP button. Returns the current bpm estimate. */
    tapTempo() {
        const now = performance.now();
        if (this._taps.length && now - this._taps[this._taps.length - 1] > TAP_RESET_MS) {
            this._taps.length = 0;
        }
        this._taps.push(now);
        if (this._taps.length > TAP_WINDOW) this._taps.shift();

        if (this._taps.length >= 2) {
            let sum = 0;
            for (let i = 1; i < this._taps.length; i++) sum += this._taps[i] - this._taps[i - 1];
            const avgMs = sum / (this._taps.length - 1);
            this.setBpm(60000 / avgMs, now);
        }
        return this.bpm;
    }

    /** Manual/programmatic tempo set (typed BPM, or "Use Detected"). Re-anchors
     *  the phase origin so the CURRENT beat position is preserved — the grid
     *  keeps moving forward, it doesn't snap back to beat 1. */
    setBpm(bpm, atTime = performance.now()) {
        bpm = clamp(bpm, MIN_BPM, MAX_BPM);
        const prevBeatsElapsed = this.running ? this._beatsElapsedAt(atTime) : 0;
        this.bpm = bpm;
        this.running = true;
        const beatMs = 60000 / bpm;
        this._phaseOrigin = atTime - prevBeatsElapsed * beatMs;
    }

    setBeatsPerBar(n) { this.beatsPerBar = clamp(Math.round(n), 1, 12); }

    /** Full reset — used by the deck's "Reset Video Jockey" button. */
    reset() {
        this.bpm = 120;
        this.beatsPerBar = 4;
        this.running = false;
        this.suggestedBpm = null;
        this._taps.length = 0;
        this._queue.length = 0;
        this._lastBeatsElapsed = 0;
        this._onsetIntervals.length = 0;
        this._lastOnset = 0;
        this._prevKick = 0;
    }

    // ── Query ────────────────────────────────────────────────────────────────

    _beatsElapsedAt(t) {
        const beatMs = 60000 / this.bpm;
        return Math.max(0, (t - this._phaseOrigin) / beatMs);
    }

    /** 0..1 phase within `divisionBeats` beats (1 = a quarter/beat, 4 = one bar
     *  in 4/4, 0.5 = an eighth note). Returns 0 while the clock isn't running. */
    getPhase(divisionBeats, t = performance.now()) {
        if (!this.running || !divisionBeats) return 0;
        const be = this._beatsElapsedAt(t);
        return (be % divisionBeats) / divisionBeats;
    }

    /** Snapshot for the UI's beat-pulse indicator and status line. */
    getInfo(t = performance.now()) {
        const be = this._beatsElapsedAt(t);
        const beatIndex = Math.floor(be);
        return {
            bpm: this.bpm,
            running: this.running,
            beatsPerBar: this.beatsPerBar,
            bar: Math.floor(beatIndex / this.beatsPerBar) + 1,
            beatInBar: (beatIndex % this.beatsPerBar) + 1,
            beatPhase: be % 1,
        };
    }

    // ── Quantized scheduling ─────────────────────────────────────────────────

    /** Fire `fn` the next time a `divisionBeats` boundary is crossed — the
     *  "launch on the next beat/bar" behavior every clip-based VJ rig offers.
     *  Falls back to firing immediately when the clock has no tempo yet, so a
     *  preset change is never silently swallowed before a BPM is set. */
    scheduleQuantized(divisionBeats, fn) {
        if (!this.running || !divisionBeats) { fn(); return; }
        this._queue.push({ division: divisionBeats, fn });
    }

    /** Called once per frame by VJDeck.render(). Advances the onset-based BPM
     *  suggestion and fires any quantized callbacks whose boundary was crossed
     *  since the last tick. */
    tick(audioFeatures) {
        const now = performance.now();
        this._updateSuggestion(now, audioFeatures);

        if (!this.running || !this._queue.length) {
            this._lastBeatsElapsed = this._beatsElapsedAt(now);
            return;
        }
        const be = this._beatsElapsedAt(now);
        const due = [];
        const keep = [];
        for (const item of this._queue) {
            const prevMod = this._lastBeatsElapsed % item.division;
            const curMod = be % item.division;
            if (curMod < prevMod) due.push(item); else keep.push(item);
        }
        this._queue = keep;
        this._lastBeatsElapsed = be;
        for (const item of due) item.fn();
    }

    /**
     * Estimate a tempo from the spacing between drum hits, for the one-click
     * "Use Detected" chip. Advisory only — it never writes `bpm` itself.
     *
     * Onsets come from the SHARED kick pulse when it is available
     * (`audio-engine.js`, `// SHAREDONSET`): real spectral flux in the kick's
     * own band, already refractory-gated, which separates a kick from a loud
     * sustained bass note. The level gate below cannot do that — it fires on
     * any loud moment — and it stays only as the fallback for an audio
     * document recorded by a build from before those fields existed.
     */
    _updateSuggestion(now, audioFeatures) {
        const dt = this._lastSuggestTime ? Math.min(0.25, (now - this._lastSuggestTime) / 1000) : 1 / 60;
        this._lastSuggestTime = now;

        const kick = audioFeatures?.kick;
        let fired;

        if (typeof kick === 'number') {
            // Rising edge across the midpoint of the pulse's decay. The pulse
            // snaps to 1 and falls with its own time constant, so one hit
            // produces exactly one crossing.
            fired = kick > 0.6 && this._prevKick <= 0.6;
            this._prevKick = kick;
        } else {
            const lvl = (audioFeatures?.bass || 0) * 0.6 + (audioFeatures?.vol || 0) * 0.4;
            this._onsetAvg = this._onsetAvg * 0.92 + lvl * 0.08;
            this._onsetCooldown = Math.max(0, this._onsetCooldown - dt);
            fired = this._onsetCooldown === 0 && lvl > this._onsetAvg * 1.35 && lvl > 0.04;
            if (fired) this._onsetCooldown = 0.2;
        }

        if (!fired) return;

        if (this._lastOnset) {
            const interval = now - this._lastOnset;
            if (interval > 250 && interval < 1500) {   // ~40–240 BPM window
                this._onsetIntervals.push(interval);
                if (this._onsetIntervals.length > 12) this._onsetIntervals.shift();
            }
        }
        this._lastOnset = now;

        if (this._onsetIntervals.length >= 6) {
            // Median, not mean: one syncopated hit shifts a mean permanently
            // but moves a median by one slot.
            const sorted = [...this._onsetIntervals].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            this.suggestedBpm = Math.round(clamp(60000 / median, MIN_BPM, MAX_BPM));
        }
    }
}
