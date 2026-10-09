/**
 * AudioEngine - Handles Web Audio context, routing, and frequency analysis
 */

// SHAREDONSET - spectral-flux kick / snare / hi-hat detection.
//
// Ported from core/anam/ShaderAudio.js so EVERY feature can read a real drum
// onset instead of re-deriving one from the band levels. Before this, four
// modules each carried a private detector and only shader objects got the good
// one; analyze() returned band levels alone, so anything wanting "the beat" had
// to gate on how loud the bass happened to be that frame.
//
// ShaderAudio and ParticleSystem deliberately KEEP their own copies: each owns
// per-instance state advanced from its own tick, and a shader can be the model
// while a particle cloud is also live, so calling one of them twice in a frame
// would double-advance its baselines and corrupt onsets for both. The duplicate
// cost is one extra pass over ~120 bins per frame.
//
// Every smoother uses the tau form and every refractory window is counted in
// SECONDS, so the same audio produces the same onsets at 30 fps, at 60 fps, and
// during the 1x analysis pre-pass that records preAnalyzedAudio.
const ONSET_BIN_LO = 1;        // skip bin 0 (DC)
const ONSET_BIN_HI = 120;      // bins 120..127 carry almost nothing
const ONSET_SPLIT_LOW = 8;     // bins 1..7 -> kick
const ONSET_SPLIT_MID = 40;    // bins 8..39 -> snare, 40..119 -> hat
const TAU_PULSE = 0.11;        // onset decay (~0.33s to visually vanish)
const TAU_BASELINE = 1.0;      // flux baseline tracking
const TAU_BEAT_AVG = 1.2;      // beat gate rolling average
const TAU_AGC = 2.0;           // level auto-gain peak decay
const REFRACTORY = { kick: 0.10, snare: 0.08, hat: 0.05, beat: 0.12 };

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.mainMix = null;
        this.streamDest = null;
        this.recordBus = null; // DIRECTREC
        this.analyser = null;
        this.freqData = null;
        this.initialized = false;
        // Every field is declared here so the object shape never changes at
        // runtime - main.js spreads this per frame into preAnalyzedAudio, and a
        // late-added key would give every record a different hidden class.
        this.features = {
            bass: 0, mid: 0, treble: 0, vol: 0, rawVol: 0, rawPulse: 0,
            kick: 0, snare: 0, hat: 0, beat: 0, level: 0,   // SHAREDONSET
        };

        // SHAREDONSET state. _prevSpec is sized in init() from the real bin
        // count rather than assuming 128.
        this._prevSpec = null;
        this._fluxAvg = { low: 0, mid: 0, high: 0 };
        this._cd = { kick: 0, snare: 0, hat: 0, beat: 0 };
        this._beatAvg = 0;
        this._agcPeak = 0.06;
        this._lastAnalyzeT = 0;
    }

    init() {
        if (this.initialized) {
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }

        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.mainMix = this.ctx.createGain();
        this.speakerGain = this.ctx.createGain();
        this.mainMix.connect(this.speakerGain);
        this.speakerGain.connect(this.ctx.destination);
        
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256; 
        this.mainMix.connect(this.analyser);
        
        // DIRECTREC — recordBus is the single point everything that should be
        // recorded flows through (mainMix here, the mic in attachAnalysisStream).
        // streamDest stays fed for the MediaRecorder fallback and the Automation
        // Studio contract; the direct recorder's worklet tap hangs off recordBus.
        this.recordBus = this.ctx.createGain();
        this.recordBus.channelCount = 2;
        this.recordBus.channelCountMode = 'explicit';
        this.mainMix.connect(this.recordBus);
        this.streamDest = this.ctx.createMediaStreamDestination();
        this.recordBus.connect(this.streamDest);
        
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this._prevSpec = new Float32Array(this.analyser.frequencyBinCount); // SHAREDONSET
        this.initialized = true;
    }

    setSpeakerVolume(val) {
        if (this.speakerGain) {
            this.speakerGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.02);
        }
    }

    /**
     * Route a live MediaStream (microphone) into the analyser + recording
     * destination ONLY — never speakerGain, so there is no feedback loop.
     * Used by CameraEngine for mic-driven audio reactivity.
     */
    attachAnalysisStream(stream) {
        if (!this.initialized) this.init();
        this.detachAnalysisStream();
        try {
            this._micSource = this.ctx.createMediaStreamSource(stream);
            this._micGain = this.ctx.createGain();
            this._micGain.gain.value = 1;
            this._micSource.connect(this._micGain);
            this._micGain.connect(this.analyser);
            this._micGain.connect(this.recordBus); // DIRECTREC — reaches streamDest through recordBus
        } catch (e) {
            console.warn('Mic analysis route error', e);
        }
    }

    detachAnalysisStream() {
        try { this._micSource?.disconnect(); } catch (e) { }
        try { this._micGain?.disconnect(); } catch (e) { }
        this._micSource = null;
        this._micGain = null;
    }

    setupNode(mediaEl, volumeSlider, muteCheckbox) {
        if (!mediaEl || mediaEl.tagName === 'IMG' || !this.initialized) return;
        try {
            const src = this.ctx.createMediaElementSource(mediaEl);
            const gain = this.ctx.createGain();
            src.connect(gain);
            gain.connect(this.mainMix);

            const update = () => {
                gain.gain.value = muteCheckbox?.checked ? 0 : ((volumeSlider?.value || 100) / 100);
            };

            volumeSlider?.addEventListener('input', update);
            muteCheckbox?.addEventListener('change', update);
            update();
            return gain;
        } catch (e) {
            console.warn("Audio route error (already connected?)", e);
        }
    }

    analyze(smoothing, threshold, sensitivity) {
        // Always return a features object — callers read .bass/.mid/.treble directly,
        // and an undefined return before init() would throw mid-render.
        if (!this.initialized) return this.features;
        
        const sm = smoothing / 100;
        if (this.analyser.smoothingTimeConstant !== sm) {
            this.analyser.smoothingTimeConstant = sm;
        }
        
        this.analyser.getByteFrequencyData(this.freqData);
        
        let bassSum = 0, midSum = 0, trebSum = 0, volSum = 0;
        const data = this.freqData;
        for (let i = 0; i < 128; i++) {
            const v = data[i];
            volSum += v;
            if (i < 10) bassSum += v;
            else if (i < 50) midSum += v;
            else if (i < 120) trebSum += v;
        }

        const rawBass = (bassSum / 10);
        const rawMid = (midSum / 40);
        const rawTreb = (trebSum / 70);
        const avgVol = (volSum / 128);
        
        const norm = (val) => Math.max(0, (val - threshold) / (255 - threshold));

        this.features.bass = norm(rawBass) * sensitivity;
        this.features.mid = norm(rawMid) * sensitivity;
        this.features.treble = norm(rawTreb) * sensitivity;
        this.features.vol = norm(avgVol) * sensitivity;
        this.features.rawVol = avgVol / 255;
        this.features.rawPulse = this.features.bass;

        // SHAREDONSET - runs last: the beat gate reads the normalized bands set
        // just above, and level reads rawVol.
        this._detectOnsets(data, this.features);

        return this.features;
    }

    /**
     * SHAREDONSET - spectral flux over the live FFT, split three ways into
     * kick / snare / hi-hat pulses, plus a beat envelope and an auto-gained
     * level. Mutates `f` in place; allocates nothing.
     *
     * @param {Uint8Array} data  this frame's spectrum, already filled
     * @param {object} f         the features object being written
     */
    _detectOnsets(data, f) {
        const prev = this._prevSpec;
        if (!prev) return;

        // dt comes from the audio clock, which is monotonic and independent of
        // how fast frames are rendering.
        const now = this.ctx.currentTime;
        const d = this._lastAnalyzeT
            ? Math.min(0.1, Math.max(1 / 240, now - this._lastAnalyzeT))
            : 1 / 60;
        this._lastAnalyzeT = now;

        // Spectral flux: only RISING bins count, so sustained tones sit out and
        // a transient stands proud of them.
        let fLow = 0, fMid = 0, fHigh = 0;
        const hi = Math.min(ONSET_BIN_HI, data.length);
        for (let i = ONSET_BIN_LO; i < hi; i++) {
            const diff = data[i] - prev[i];
            if (diff > 0) {
                if (i < ONSET_SPLIT_LOW) fLow += diff;
                else if (i < ONSET_SPLIT_MID) fMid += diff;
                else fHigh += diff;
            }
            prev[i] = data[i];
        }
        fLow /= 7 * 255; fMid /= 32 * 255; fHigh /= 80 * 255;

        // Each band is judged against its OWN rolling baseline, so a dense mix
        // and a sparse one both need a real jump to fire - no threshold to set.
        const kBase = 1 - Math.exp(-d / TAU_BASELINE);
        const avg = this._fluxAvg;
        avg.low += (fLow - avg.low) * kBase;
        avg.mid += (fMid - avg.mid) * kBase;
        avg.high += (fHigh - avg.high) * kBase;

        // Decay last frame's pulses BEFORE firing, or a fresh hit would be
        // damped on the very frame it lands.
        const k = Math.exp(-d / TAU_PULSE);
        f.kick *= k; f.snare *= k; f.hat *= k; f.beat *= k;

        this._fire(f, 'kick', fLow > avg.low * 1.5 + 0.012, d);
        this._fire(f, 'snare', fMid > avg.mid * 1.6 + 0.010, d);
        this._fire(f, 'hat', fHigh > avg.high * 1.7 + 0.008, d);

        // Beat keeps the bass * 0.6 + vol * 0.4 gate that VJModulator,
        // VJBeatClock, ParticleSystem and ShaderAudio all already use, so "the
        // beat" means one thing across the whole app.
        const lvl = f.bass * 0.6 + f.vol * 0.4;
        this._beatAvg += (lvl - this._beatAvg) * (1 - Math.exp(-d / TAU_BEAT_AVG));
        this._fire(f, 'beat', lvl > this._beatAvg * 1.35 && lvl > 0.04, d);

        // level is auto-gained, so quiet and loud material both reach full
        // travel. Unlike vol it ignores the Threshold and Sensitivity sliders.
        this._agcPeak = Math.max(f.rawVol, this._agcPeak * Math.exp(-d / TAU_AGC));
        f.level = Math.min(1, f.rawVol / Math.max(0.08, this._agcPeak));
    }

    /** SHAREDONSET - set a pulse to 1 if its refractory window has elapsed, so
     *  one kick registers once rather than on every frame it stays loud. */
    _fire(f, key, condition, d) {
        const cd = this._cd;
        cd[key] = Math.max(0, cd[key] - d);
        if (condition && cd[key] <= 0) {
            f[key] = 1;
            cd[key] = REFRACTORY[key];
        }
    }

    fadeIn(durationS) {
        if (!this.initialized || !this.mainMix) return;
        const now = this.ctx.currentTime;
        this.mainMix.gain.cancelScheduledValues(now);
        // Linear amplitude ramp from silence, mirroring fadeOut(). A linear ramp rises
        // evenly across the whole duration instead of staying near-silent then rushing
        // up at the end (which is how an exponential ramp behaves).
        this.mainMix.gain.setValueAtTime(0, now);
        this.mainMix.gain.linearRampToValueAtTime(1, now + durationS);
    }

    fadeOut(durationS) {
        if (!this.initialized || !this.mainMix) return;
        const now = this.ctx.currentTime;
        this.mainMix.gain.cancelScheduledValues(now);
        this.mainMix.gain.setValueAtTime(this.mainMix.gain.value, now);
        // Linear amplitude ramp to silence. An exponential ramp is linear-in-dB,
        // so it front-loads the entire audible drop into the first fraction of a
        // second and feels like a hard cut. A linear ramp stays audible across the
        // whole duration (−6 dB at the midpoint), giving a gradual fade-out.
        this.mainMix.gain.linearRampToValueAtTime(0, now + durationS);
    }

    setVolume(val) {
        if (!this.initialized || !this.mainMix) return;
        const now = this.ctx.currentTime;
        this.mainMix.gain.cancelScheduledValues(now);
        this.mainMix.gain.setValueAtTime(this.mainMix.gain.value, now);
        this.mainMix.gain.setTargetAtTime(val, now, 0.05);
    }
}
