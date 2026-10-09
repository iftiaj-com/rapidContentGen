/**
 * VJDeck.js — the Video Jockey deck: host, UI, and per-frame driver. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * A GLOBAL post-pass feature, not a source effect. It runs after everything
 * Adits composites (source media → active effect → PnP → vision overlays →
 * AnamorphicCamera 3D model → global color grades), so a VJ FX treats the
 * finished frame as its input — which means it works *with* every other feature
 * instead of being mutually exclusive with them the way an EffectRegistry entry
 * would be.
 *
 * Follows the self-contained add-on pattern (InvisibilityCloak /
 * MotionExtraction / DoodleOverlay): it wires its own `vj*` DOM in init(app),
 * and main.js carries exactly four tagged touchpoints — import, construct,
 * init(), and one render() call in drawFrameSingle(). Delete this folder and
 * grep `// VJ` to remove the feature completely.
 *
 * A new FX writes effects/vj/fx/MyFX.js against a KEY / LABEL / CHANNELS /
 * PARAMS / render() contract and inherits the GL pass, all six control sources,
 * the beat clock, the beat detector and the depth pipeline for free.
 *
 *   VJPass.js       reusable offscreen WebGL2 fullscreen-quad pass
 *   VJModulator.js  auto / manual / audio / gesture / pointer / midi router
 *   VJBeatClock.js  tap-tempo + auto-detect musical clock, quantized launch
 *   VJMidi.js       Web MIDI control surface (MIDI Learn, persisted bindings)
 *   vj-presets.js   declarative preset data
 *   fx/vj-shake.js  shared Shake GLSL chunk
 *   fx/vj-show.js   shared light-show GLSL chunk + audio brain (VJShowEngine)
 *   fx/ScanFX.js        FX #1 — depth scan
 *   fx/LumNetworkFX.js  FX #2 — luminance-driven light network
 *   fx/LightsFX.js      FX #3 — luminance-keyed light isolation
 *   fx/LightshowFX.js   FX #4 — emitted stage rig (8 rigs × 17 DMX patterns)
 *   fx/BeamBloomFX.js   FX #5 — light shafts cast from the frame's own highlights
 *   fx/PulseGridFX.js   FX #6 — cell grid, ring travels outward on every hit
 *   fx/TileStormFX.js   FX #7 — tiles rearrange into ring / spiral / scatter
 *   fx/BeatWashFX.js    FX #8 — one point light washes the room, emitters survive
 *
 * ── PARAM DESCRIPTORS ────────────────────────────────────────────────────────
 * Adding an FX used to cost six hand-edited sites in this file plus a bespoke
 * `#vj<Fx>Params` block in index.html. As of FX #4 it costs ONE line
 * (FX_REGISTRY) — the FX declares `static PARAMS` and this file builds, binds,
 * writes, hides and randomizes it generically:
 *
 *   { key, type: 'select' | 'color' | 'range' | 'check', label, default,
 *     options?  select: [{ value, label }]
 *     min/max/step/digits?  range
 *     cols?     pack this and its neighbours into a 2- or 3-up grid row
 *     hint?     explanatory <p> under the control
 *     note?     inline caption beside a checkbox
 *     eyedrop?  colour input gets a screen-picker button
 *     showIf?   (params) => bool — hide the control while it would do nothing }
 *
 * The markup is generated into `#vjFxParams` with LITERAL Tailwind class strings,
 * which the purge scanner sees because effects/**\/*.js is in its content globs.
 *
 * `static RANDOM` does the same job for the Randomize button: lists pick one
 * value, `ranges` picks a number in a span, `channels` nudges channel sliders,
 * and an optional `after(params)` hook resolves any cross-param rule.
 *
 * Glow / Parallax / Shake / Depth are shared by every FX and stay in index.html.
 * The five channel sliders are shared too — FX declare the same channel KEYS and
 * only their LABELS differ, which is what lets a learned MIDI knob survive an FX
 * switch (`_writeChannelLabels`).
 *
 * ── SHOW CLOCK ───────────────────────────────────────────────────────────────
 * render() resolves ONE time basis per frame and hands it to the FX as `clock`.
 * During Adits' offline post-process, frames are re-rendered as fast as the
 * encoder allows, so wall time bears no relation to the timeline the viewer will
 * see — `state.postProcessCurrentTime` is the authority there. Without this a
 * LightshowFX strobe (and ScanFX's mote drift, and Shake, and every `auto`
 * channel LFO) would export at whatever rate the export happened to run at
 * rather than at the rate it was performed at.
 *
 * BEAT SYNC: the deck owns one VJBeatClock, ticked every render() call. The
 * primary (`progress`) channel can lock to it via a note-division selector
 * instead of the free-running Speed slider, and Preset/Randomize changes can be
 * queued to fire on the next beat/bar boundary (`vjQuantizeLaunch`) instead of
 * cutting instantly — the two things that read as "amateur" vs. "a real show"
 * on a club floor. No BPM set yet → everything behaves exactly as before
 * (free-running LFO, instant cuts); this is additive, not a behavior change.
 *
 * MIDI: the deck owns one VJMidi. Binding a `ch.*` target automatically flips
 * that channel's source to `midi` (and reverts it to `manual` when cleared), so
 * "learn a knob" is the whole interaction — there is no second step. Pad actions
 * (preset next/prev, randomize, tap, on/off) run through the SAME quantize path
 * as the dropdowns, so a pad press lands on the beat. Web MIDI access is only
 * requested when the toggle is switched on.
 *
 * DEPTH POLICY: luminance-derived depth is the only always-on path (9 GPU taps,
 * no model, no upload, no inference). The uploaded depth map and the MediaPipe
 * subject layer are opt-in and cost nothing when off — the segmenter task is not
 * even constructed until the toggle is switched on, and is freed the moment it
 * is switched off.
 *
 * ── TRUE TO ITS SOURCE (Control: Audio Reactive / Gesture) ───────────────────
 * Fixed 2026-07-26. Both used to silently keep animating with no real signal:
 * "Control" only ever rewired the PRIMARY (`progress`) channel — the show
 * pattern's own clocks (`phase`/`fast`/`hue` in fx/vj-show.js, driving Chase /
 * Strobe / Wave / Ring Pulse / Rainbow Roll / Warp Drive / HyperX) advance on
 * elapsed TIME unconditionally, regardless of the Control selector or of
 * whether there was any audio/gesture at all. Selecting "Audio Reactive" with
 * no track loaded, or "Gesture" with no camera ever turned on, still produced a
 * fully animated show — never gated, just never actually driven by the named
 * source either. That was a bug, not a design choice.
 *
 * The fix is a single per-frame "is the selected drive actually live" gate,
 * `_resolveDriveLive()`, computed only for `audio` (real energy above a small,
 * hysteresis-smoothed threshold — see `_audioActivity`) and `gesture` (a hand
 * genuinely tracked within the last ~300ms). Every other Control mode (auto /
 * manual / pointer / midi) is always "live" — Auto is explicitly a free-running
 * loop, and the rest already degrade sensibly on their own.
 *
 * `_resolveClock()` turns that into two concrete effects, both restricted to
 * the FX layer so nothing here silently blacks out the deck:
 *   · `time` (freezes, not resets) — this is what stops Shake and ScanFX's
 *     mote drift from animating on the wall clock alone; every FX already
 *     just consumes `clock.time` as-is, so this needed no per-FX changes.
 *   · `liveDt` (0 while not live) — fed to VJShowEngine's phase/fast/hue
 *     ONLY (LightshowFX.js), leaving env/beat decay on the real `dt` so a hit
 *     that lands right as the signal cuts out still fades out correctly
 *     rather than sticking.
 * Channel VALUES settle the same way they always have (VJModulator's own
 * `smooth` easing, floor now 0 for hand-picked Audio Reactive — see
 * AUDIO_CONTROL_TUNING) — nothing here forces a hard cut to black.
 *
 * GESTURE ALSO NEVER TURNED ON A CAMERA. `_track()` only ever read two buses
 * (`window._prismTrack`, `gestureEngine._signals`) that some UNRELATED feature
 * had to already be driving — selecting "Gesture / Face" here did not, by
 * itself, make gesture tracking exist. The deck now owns a fully self-contained
 * gesture pipeline (own hidden "puppeteer" webcam, own vision-module ownership,
 * own hand/pose extraction) — mirrors VCGestureController's exact pattern but
 * shares NO state with it, same as every other add-on in this codebase. The
 * hidden webcam opens ONLY while Control=Gesture is selected and the live
 * webcam isn't already the visible source, and is NEVER shown or recorded.
 *
 * GESTURE TRIGGERS (new): a customizable version of GestureEngine's Trigger
 * system — Open Palm / Closed Fist / Victory / Thumb Up / Pinch each get their
 * own `<select>` (not a hardcoded mapping) choosing a VJ action from the SAME
 * vocabulary MIDI pads use (`MIDI_TARGETS`, action kind), firing through the
 * same `_launch()` quantize path so a gesture-triggered preset change lands on
 * the beat exactly like a pad press does. Visible only while Control=Gesture.
 */

import { VJPass } from './VJPass.js';
import { VJModulator, CHANNEL_DEFAULTS } from './VJModulator.js';
import { VJBeatClock } from './VJBeatClock.js';
import { VJMidi, MIDI_TARGETS } from './VJMidi.js';
import { ScanFX } from './fx/ScanFX.js';
import { LumNetworkFX } from './fx/LumNetworkFX.js';
import { LightsFX } from './fx/LightsFX.js';
import { LightshowFX } from './fx/LightshowFX.js';
import { BeamBloomFX } from './fx/BeamBloomFX.js';
import { PulseGridFX } from './fx/PulseGridFX.js';
import { TileStormFX } from './fx/TileStormFX.js';
import { BeatWashFX } from './fx/BeatWashFX.js';
import { VJ_PRESETS, getPreset } from './vj-presets.js';

/** FX registry — string key → class (lazily instantiated), mirroring
 *  effects/video/registry.js. One line per future FX. */
const FX_REGISTRY = {
    [ScanFX.KEY]: ScanFX,
    [LumNetworkFX.KEY]: LumNetworkFX,
    [LightsFX.KEY]: LightsFX,
    [LightshowFX.KEY]: LightshowFX,
    [BeamBloomFX.KEY]: BeamBloomFX,
    [PulseGridFX.KEY]: PulseGridFX,
    [TileStormFX.KEY]: TileStormFX,
    [BeatWashFX.KEY]: BeatWashFX,
};

const DEFAULT_PRESET = 'pulse_scan';
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Shared params a preset may omit, merged UNDER the FX's own PARAM defaults and
 *  then under the preset's `params` — so a preset only names what it actually
 *  changes. Shake in particular is opt-in per look rather than something every
 *  preset has to spell out as 0. */
const SHARED_PARAM_DEFAULTS = {
    shake: 0, glow: 0.15, parallax: 0.02,
    depthSoften: 3.0, depthContrast: 1.2, depthInvert: false, subject: 0.70,
};

/** Tailwind class strings for the generated FX param controls. Hoisted to
 *  constants so each one appears exactly once as a literal the purge scanner
 *  can see, and so the generated markup cannot drift from index.html's. */
const CSS = {
    card:      'bg-zinc-800/50 rounded p-1.5 border border-zinc-700/40',
    checkCard: 'flex items-center gap-1.5 bg-zinc-800/50 rounded p-1.5 border border-zinc-700/40 cursor-pointer',
    row2:      'grid grid-cols-2 gap-1.5',
    row3:      'grid grid-cols-3 gap-1.5',
    label:     'text-[8px] text-zinc-400 font-semibold',
    labelBlock:'text-[8px] text-zinc-400 font-semibold block mb-1',
    labelRow:  'flex items-center justify-between mb-1',
    value:     'text-[7px] text-fuchsia-400 font-mono',
    note:      'text-[8px] text-zinc-500 leading-tight',
    hint:      'text-[8px] text-zinc-500 leading-tight mt-1',
    select:    'w-full bg-zinc-900 border border-zinc-700 rounded text-[9px] text-zinc-200 p-1',
    color:     'w-full h-6 bg-zinc-900 border border-zinc-700 rounded cursor-pointer',
    colorFlex: 'flex-1 h-6 bg-zinc-900 border border-zinc-700 rounded cursor-pointer',
    eyedrop:   'px-1.5 h-6 bg-zinc-900 border border-zinc-700 rounded text-[9px] text-zinc-300 hover:text-fuchsia-400',
    range:     'w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-fuchsia-500',
    check:     'w-3 h-3 accent-fuchsia-500 cursor-pointer',
    inline:    'flex items-center gap-1.5',
};

/** @returns {HTMLElement} */
function mk(tag, cls, parent, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.innerText = text;
    if (parent) parent.appendChild(el);
    return el;
}

/** Applied to the primary channel when Audio Reactive is chosen from the Control
 *  selector by hand. Mirrors the tuning the `neon_sweep` preset had to specify
 *  to make audio→position legible: lift the level and damp the jitter.
 *  `floor: 0` — was 0.12, which kept the channel elevated even in true silence;
 *  see the "TRUE TO ITS SOURCE" header note. `CHANNEL_DEFAULTS.floor` is
 *  already 0, so this now just matches what every preset's own audio-sourced
 *  channels already do. Presets that select `audio` themselves keep their own
 *  per-channel tuning, untouched by this constant. */
const AUDIO_CONTROL_TUNING = { gain: 1.6, floor: 0, smooth: 0.35 };

/** Hand-capable vision modules — a module carrying MediaPipe hand landmarks
 *  (native gesture categories only from `gesture_recognizer`; the rest need
 *  the geometric fallback classifier below). */
const GESTURE_HAND_MODULES = ['gesture_recognizer', 'hand_landmarker', 'holistic_landmarker'];
/** A native gesture must hold this long before it counts — same value
 *  GestureEngine and VCGestureController both already use, for a consistent feel. */
const GESTURE_TRIGGER_HOLD_MS = 120;
/** EMA factor for the deck's own tracked hand position / pinch amount. */
const GESTURE_SIGNAL_SMOOTH = 0.4;
/** GESTURE FOLLOW — the tracked hand is read from the camera IMAGE, where a
 *  hand the user moves to their right appears on the left. Mirror it so the
 *  effect moves the way the user does. One flag, so the direction can be
 *  flipped in one edit if a rig's camera is already mirrored. */
const GESTURE_FOLLOW_MIRROR = true;
/** How long a lost hand still counts as "tracked" before triggers/axis park —
 *  bridges a single missed inference frame without visibly flickering. */
const GESTURE_HOLD_MS = 300;

/** Sensible starting points for the five Gesture Trigger mappings — the whole
 *  point of the feature is that the user can point each one at a different
 *  action, so these are defaults, not a fixed design. Shared between
 *  _populateSelects() (initial fill) and _resetGestureTriggers() so the two
 *  can't drift apart. */
/** LOOKS — saved-look store. Same key shape and the same "validate on read,
 *  swallow on write" contract as VJMidi's binding store, so a corrupt or
 *  half-written blob degrades to "no saved looks" instead of breaking the deck. */
const LOOKS_KEY = 'adits.vj.looks.v1';
/** Prefix that distinguishes a saved look's key from a built-in preset's, so the
 *  two can share one dropdown and one applyPreset() path. */
const LOOK_PREFIX = 'user:';

/** Default dissolve length, seconds, for a preset / FX / randomize change.
 *  Long enough to read as a transition, short enough that a performer changing
 *  looks on the beat still lands on the beat. */
const BLEND_DEFAULT = 0.35;

/** Default rate for the Flicker and Burst feels, Hz. The reference reels this
 *  was measured from run at 12 Hz, which is inside the range commonly cited
 *  for photosensitive seizure risk on a full-frame flash. 3 Hz still reads as
 *  a flicker; the full range up to 12 is reachable on the slider, never the
 *  default. */
const FLICKER_HZ_DEFAULT = 3;

/** Channel meters repaint at this interval, not every frame. A meter is a
 *  glance, not an instrument, and 20 Hz is past the point anyone can read while
 *  still keeping five style writes off the per-frame path. */
const METER_INTERVAL_MS = 50;

const GESTURE_TRIGGER_DEFAULTS = {
    gestureTrigPalm: 'act.randomize',
    gestureTrigFist: 'act.presetNext',
    gestureTrigVictory: 'act.presetPrev',
    gestureTrigThumb: 'act.toggle',
    gestureTrigPinch: 'none',
};

/** Shared by the "Sync" (progress channel) and "Quantize Launch" selectors —
 *  both express musical positions in beats so any time signature (not just
 *  4/4) resolves correctly via the live `beatsPerBar`. */
function resolveSyncDivision(key, beatsPerBar) {
    switch (key) {
        case '1/16':   return 0.25;
        case '1/8':    return 0.5;
        case '1/4':    return 1;
        case '1/2bar': return beatsPerBar / 2;
        case '1bar':   return beatsPerBar;
        case '2bar':   return beatsPerBar * 2;
        case '4bar':   return beatsPerBar * 4;
        case 'free':
        default:       return null;
    }
}

export class VJDeck {
    constructor() {
        this.enabled = false;
        this._app = null;
        this._dom = {};

        this._pass = new VJPass('VJ');
        this._mod = new VJModulator();
        this._beatClock = new VJBeatClock();
        this._lastBeatFlashPhase = 0;
        this._pulseTimeout = null;
        // Constructed eagerly: it costs one localStorage read and requests no
        // MIDI access (and so triggers no permission prompt) until enabled.
        this._midi = new VJMidi();
        this._fx = new Map();          // key → instance (lazy)
        this._fxKey = ScanFX.KEY;
        this._presetListFx = null;     // FX the preset <select> was last built for
        this._paramEls = new Map();    // param key → { desc, el, valEl, wrap }
        this._paramsBuiltFor = null;   // FX the param block was last built for

        this.presetKey = DEFAULT_PRESET;
        this.controlSource = 'auto';   // master source for the primary channel
        this.audioBand = 'bass';       // band used when controlSource === 'audio'
        this.feel = 'direct';          // FEEL — how every channel moves (see VJModulator)
        this._lastMeterT = 0;          // METERS — throttle clock
        this.blend = BLEND_DEFAULT;    // BLEND — dissolve length in seconds (0 = hard cut)
        this.flickerHz = FLICKER_HZ_DEFAULT; // FEEL — rate for the Flicker / Burst shapes
        this._blendCanvas = null;      // BLEND — snapshot of the outgoing look
        this._blendT = 0;              // BLEND — elapsed seconds into the dissolve
        this._looks = this._loadLooks();  // LOOKS — user-saved presets
        this._presetListDirty = false;    // LOOKS — force a dropdown rebuild
        this.autoRate = 0.33;          // cycles/sec when controlSource === 'auto'

        this.channels = {};            // channel key → VJModulator cfg
        this.params = {};              // static shader params
        this.depthCfg = { source: 'luminance', subject: false, amount: 0.7 };

        // Optional depth-map upload (opt-in)
        this._depthImg = null;
        this._depthToken = 0;
        this._depthUrl = null;

        // Optional MediaPipe subject layer (opt-in, constructed on first enable)
        this._bgRemoval = null;
        this._bgLoading = false;

        // Pointer source — normalized 0..1 over the output canvas
        this._pointer = null;
        this._onPointerMove = null;
        this._onPointerLeave = null;

        // Show clock — see the SHOW CLOCK note in the header.
        this._lastTime = 0;        // wall-clock basis (live)
        this._lastMediaT = null;   // media-time basis (offline post-process)
        this._clockAccum = 0;      // freeze-capable time accumulator — see "TRUE TO ITS SOURCE"

        // Audio liveness (Control: Audio Reactive) — see "TRUE TO ITS SOURCE".
        this._audioActivity = 0;

        // Gesture tracking (Control: Gesture / Face) — see "TRUE TO ITS SOURCE".
        // Self-contained: own hidden webcam, own vision-module ownership, own
        // hand extraction. Mirrors VCGestureController's puppeteer pattern but
        // shares NO state with it.
        this._gestureAutoVision = { enabledByUs: false, prevModule: null };
        this._gestureCam = { video: null, stream: null, starting: false };
        this._gestureCanvas = null;
        this._gestureCtx = null;
        this._gestureSig = { handX: 0.5, handY: 0.5, pinch: 0.5, handsCount: 0, lastSeenAt: 0 };
        this._rawGesture = 'None';
        this._gestureSince = 0;
        this._gestureTrigEdge = {};   // gesture name → last rising-edge state
    }

    /** Read-only access to the deck's musical clock — for any future feature
     *  that wants to lock to the same tempo (e.g. `app.vjDeck.beatClock`). */
    get beatClock() { return this._beatClock; }

    /** Read-only access to the deck's MIDI surface (`app.vjDeck.midi`). */
    get midi() { return this._midi; }

    /** True while Gesture Control needs real hand tracking — main.js reads
     *  this to route MediaPipe at the right source (the `wantsRawInfer` gate
     *  in drawFrameSingle()). */
    get wantsGestureVision() { return this.enabled && this.controlSource === 'gesture'; }

    /** True once the pass has linked at least one WebGL program (or failed and never
     *  will). Off decks are trivially warm. Read by the recorder's pre-warm wait. */
    isWarm() {
        if (!this.enabled) return true;
        const p = this._pass;
        return !!(p?._failed || (p?._programs && p._programs.size > 0));
    }

    // ── Setup ────────────────────────────────────────────────────────────────

    init(app) {
        this._app = app;
        const $ = (id) => document.getElementById(id);
        this._dom = {
            toggleBtn: $('vjToggleBtn'), chevron: $('vjChevron'), content: $('vjContent'),
            enabled: $('vjEnabled'), status: $('vjStatus'),
            fx: $('vjFx'), preset: $('vjPreset'), random: $('vjRandom'),
            control: $('vjControlSource'),
            manual: $('vjManual'), manualVal: $('valVjManual'), manualRow: $('vjManualRow'),
            speed: $('vjSpeed'), speedVal: $('valVjSpeed'), speedRow: $('vjSpeedRow'),
            audioBand: $('vjAudioBand'), audioBandRow: $('vjAudioBandRow'),
            feel: $('vjFeel'),
            blend: $('vjBlend'), blendVal: $('valVjBlend'),
            flickerHz: $('vjFlickerHz'), flickerHzVal: $('valVjFlickerHz'),
            lookName: $('vjLookName'), lookSave: $('vjLookSave'), lookDelete: $('vjLookDelete'),
            mtrProgress: $('mtrVjProgress'), mtrIntensity: $('mtrVjIntensity'),
            mtrBand: $('mtrVjBand'), mtrTiling: $('mtrVjTiling'), mtrDim: $('mtrVjDim'),
            progressSync: $('vjProgressSync'), syncRow: $('vjSyncRow'),

            // Gesture Control status + Triggers — shown only when Control = Gesture
            gestureRow: $('vjGestureRow'), gestureStatus: $('vjGestureStatus'),
            gestureTrigEnabled: $('vjGestureTrigEnabled'),
            gestureTrigPalm: $('vjGestureTrigPalm'), gestureTrigFist: $('vjGestureTrigFist'),
            gestureTrigVictory: $('vjGestureTrigVictory'), gestureTrigThumb: $('vjGestureTrigThumb'),
            gestureTrigPinch: $('vjGestureTrigPinch'),

            bpmTap: $('vjBpmTap'), bpmInput: $('vjBpmInput'), beatPulse: $('vjBeatPulse'),
            bpmSuggestRow: $('vjBpmSuggestRow'), bpmSuggestBtn: $('vjBpmSuggestBtn'), bpmSuggestValue: $('vjBpmSuggestValue'),
            beatsPerBar: $('vjBeatsPerBar'), quantizeLaunch: $('vjQuantizeLaunch'),
            beatSyncReset: $('vjBeatSyncReset'),

            midiEnabled: $('vjMidiEnabled'), midiStatus: $('vjMidiStatus'), midiControls: $('vjMidiControls'),
            midiTarget: $('vjMidiTarget'), midiLearn: $('vjMidiLearn'),
            midiClear: $('vjMidiClear'), midiClearAll: $('vjMidiClearAll'), midiBindings: $('vjMidiBindings'),

            advToggle: $('vjAdvToggle'), advBody: $('vjAdvBody'), advChevron: $('vjAdvChevron'),

            // Host for the active FX's generated param block — see PARAM DESCRIPTORS
            fxParams: $('vjFxParams'),

            // Channel-slider label spans — re-texted per FX
            lblManual: $('lblVjManual'), lblIntensity: $('lblVjIntensity'),
            lblBand: $('lblVjBand'), lblTiling: $('lblVjTiling'), lblDim: $('lblVjDim'),

            intensity: $('vjIntensity'), intensityVal: $('valVjIntensity'),
            band: $('vjBand'), bandVal: $('valVjBand'),
            tiling: $('vjTiling'), tilingVal: $('valVjTiling'),
            dim: $('vjDim'), dimVal: $('valVjDim'),
            glow: $('vjGlow'), glowVal: $('valVjGlow'),
            parallax: $('vjParallax'), parallaxVal: $('valVjParallax'),
            shake: $('vjShake'), shakeVal: $('valVjShake'),

            depthSource: $('vjDepthSource'),
            depthFile: $('vjDepthFile'), depthFileRow: $('vjDepthFileRow'), depthFileName: $('vjDepthFileName'),
            depthContrast: $('vjDepthContrast'), depthContrastVal: $('valVjDepthContrast'),
            depthSoften: $('vjDepthSoften'), depthSoftenVal: $('valVjDepthSoften'),
            depthInvert: $('vjDepthInvert'),
            subject: $('vjSubjectEnabled'), subjectRow: $('vjSubjectRow'), subjectStatus: $('vjSubjectStatus'),
            subjectAmount: $('vjSubjectAmount'), subjectAmountVal: $('valVjSubjectAmount'),

            reset: $('vjReset'),
        };

        this._populateSelects();
        this._attach();
        this._initMidi();
        this.applyPreset(DEFAULT_PRESET, true);   // re-asserts MIDI bindings internally
        this._syncMidiUI();
    }

    /** FX + preset dropdowns are built at runtime so a new FX/preset never
     *  requires an index.html edit. */
    _populateSelects() {
        const fxSel = this._dom.fx;
        if (fxSel && !fxSel.options.length) {
            for (const [key, Cls] of Object.entries(FX_REGISTRY)) {
                const o = document.createElement('option');
                o.value = key;
                o.textContent = Cls.LABEL;
                fxSel.appendChild(o);
            }
        }
        // FX param selects are populated by _buildFxParams() from `static PARAMS`.
        const mSel = this._dom.midiTarget;
        if (mSel && !mSel.options.length) {
            for (const t of MIDI_TARGETS) {
                const o = document.createElement('option');
                o.value = t.id;
                o.textContent = t.kind === 'action' ? `⚡ ${t.label}` : t.label;
                mSel.appendChild(o);
            }
        }

        // Gesture Trigger action selects — same action vocabulary MIDI pads use
        // (MIDI_TARGETS' `action` kind), plus None. One shared option list built
        // once, cloned into each of the five per-gesture dropdowns. Keys match
        // this._dom directly (`gestureTrigPalm` ↔ id="vjGestureTrigPalm").
        const actionOpts = [{ id: 'none', label: '— None —' },
            ...MIDI_TARGETS.filter((t) => t.kind === 'action')];
        for (const [domKey, defaultId] of Object.entries(GESTURE_TRIGGER_DEFAULTS)) {
            const sel = this._dom[domKey];
            if (!sel || sel.options.length) continue;
            for (const t of actionOpts) {
                const o = document.createElement('option');
                o.value = t.id;
                o.textContent = t.label;
                sel.appendChild(o);
            }
            sel.value = defaultId;
        }

        this._rebuildPresetOptions();
    }

    /** Preset list is scoped to the active FX, so switching FX swaps the list
     *  rather than offering presets that don't apply. Guarded on the FX the list
     *  was last built for, so `_writeDom` can call it unconditionally — without
     *  that, a full Reset while a different FX is active would set the preset
     *  <select> to a value that isn't in its option list. */
    _rebuildPresetOptions() {
        const pSel = this._dom.preset;
        if (!pSel) return;
        if (this._presetListFx === this._fxKey && !this._presetListDirty) return;
        this._presetListFx = this._fxKey;
        this._presetListDirty = false;
        pSel.innerHTML = '';

        const opt = (p, parent) => {
            const o = document.createElement('option');
            o.value = p.key;
            o.textContent = p.label;
            parent.appendChild(o);
        };
        for (const p of VJ_PRESETS) {
            if (p.fx === this._fxKey) opt(p, pSel);
        }
        // Saved looks sit in their own group so a built-in and a user look with
        // the same name are still tellable apart.
        const mine = this._looks.filter((p) => p.fx === this._fxKey);
        if (mine.length) {
            const g = document.createElement('optgroup');
            g.label = 'My Looks';
            for (const p of mine) opt(p, g);
            pSel.appendChild(g);
        }
    }

    /** Every preset available for the ACTIVE FX, built-ins first. One list, so
     *  the dropdown, A/D stepping and the 1-9 keys can never disagree. */
    _presetsForFx() {
        return [
            ...VJ_PRESETS.filter((p) => p.fx === this._fxKey),
            ...this._looks.filter((p) => p.fx === this._fxKey),
        ];
    }

    /** Resolve a key against saved looks first, then the built-ins. */
    _findPreset(key) {
        if (typeof key === 'string' && key.startsWith(LOOK_PREFIX)) {
            const found = this._looks.find((p) => p.key === key);
            if (found) return found;
        }
        return getPreset(key);
    }

    // ── LOOKS ────────────────────────────────────────────────────────────────

    /** Capture the deck's CURRENT state as a preset record. Identical in shape
     *  to a built-in, which is what lets applyPreset() stay unaware that saved
     *  looks exist at all. */
    _saveLook() {
        const d = this._dom;
        const raw = (d.lookName?.value || '').trim();
        const label = raw || `${FX_REGISTRY[this._fxKey]?.LABEL || 'Look'} ${this._looks.length + 1}`;

        const channels = {};
        for (const key of Object.keys(this.channels)) channels[key] = { ...this.channels[key] };

        const look = {
            key: `${LOOK_PREFIX}${Date.now().toString(36)}`,
            label,
            fx: this._fxKey,
            params: { ...this.params },
            channels,
            depth: { ...this.depthCfg },
        };
        this._looks.push(look);
        this._saveLooks();

        if (d.lookName) d.lookName.value = '';
        this.presetKey = look.key;
        this._presetListDirty = true;
        this._rebuildPresetOptions();
        if (d.preset) d.preset.value = look.key;
        this._syncStatus();
        // `false` — without it a donation prompt replaces the message after 2.5s.
        this._app?.showToast?.('Look saved', label, false);
    }

    /** Remove the selected look. Built-ins are not deletable, so this is a
     *  no-op on them rather than an error. */
    _deleteLook() {
        const key = this.presetKey;
        if (typeof key !== 'string' || !key.startsWith(LOOK_PREFIX)) {
            this._app?.showToast?.('Not a saved look', 'Only looks under My Looks can be deleted.', false);
            return;
        }
        const i = this._looks.findIndex((p) => p.key === key);
        if (i < 0) return;
        const [gone] = this._looks.splice(i, 1);
        this._saveLooks();
        this._presetListDirty = true;

        const fallback = this._presetsForFx()[0];
        if (fallback) this.applyPreset(fallback.key, true);
        else this._rebuildPresetOptions();
        this._app?.showToast?.('Look deleted', gone?.label || '', false);
    }

    /** Read the store, dropping anything that no longer resolves to a live FX —
     *  a look saved against an effect that has since been removed would
     *  otherwise sit in the dropdown and apply nothing. */
    _loadLooks() {
        try {
            const raw = localStorage.getItem(LOOKS_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((p) => p && typeof p.key === 'string'
                && p.key.startsWith(LOOK_PREFIX) && typeof p.label === 'string'
                && FX_REGISTRY[p.fx] && p.params && p.channels);
        } catch (_) { return []; }
    }

    _saveLooks() {
        try {
            localStorage.setItem(LOOKS_KEY, JSON.stringify(this._looks));
        } catch (_) { /* private mode / quota — the look still works this session */ }
    }

    // ── FX param block (generated from `static PARAMS`) ───────────────────────

    /** Build the active FX's param controls into `#vjFxParams`, binding each one
     *  as it is created. Guarded on the FX it was last built for, so callers
     *  (`_writeDom`) can invoke it unconditionally every time. */
    _buildFxParams() {
        const host = this._dom.fxParams;
        const FxCls = FX_REGISTRY[this._fxKey];
        if (!host || !FxCls || this._paramsBuiltFor === this._fxKey) return;
        this._paramsBuiltFor = this._fxKey;

        host.innerHTML = '';
        this._paramEls.clear();

        // Consecutive descriptors declaring the same `cols` pack into one grid
        // row, up to that many per row; anything without `cols` is full width.
        const list = FxCls.PARAMS || [];
        let i = 0;
        while (i < list.length) {
            const d = list[i];
            if (!d.cols) { this._buildParamCard(d, host); i++; continue; }
            const row = mk('div', d.cols === 3 ? CSS.row3 : CSS.row2, host);
            let n = 0;
            while (i < list.length && list[i].cols === d.cols && n < d.cols) {
                this._buildParamCard(list[i], row);
                i++; n++;
            }
        }
    }

    /** One control + its binding. Any change that could flip another param's
     *  `showIf` re-runs the visibility pass, so conditional rows stay honest. */
    _buildParamCard(desc, parent) {
        const redraw = () => { if (this._app && !this._app.state.isPlaying) this._app.drawFrameSingle(); };
        const commit = (v) => {
            this.params[desc.key] = v;
            this._syncParamVisibility();
            redraw();
        };

        let wrap, el, valEl = null;

        if (desc.type === 'check') {
            wrap = mk('label', CSS.checkCard, parent);
            el = mk('input', CSS.check, wrap);
            el.type = 'checkbox';
            mk('span', CSS.label, wrap, desc.label);
            if (desc.note) mk('span', CSS.note, wrap, desc.note);
            el.addEventListener('change', (e) => commit(e.target.checked));

        } else if (desc.type === 'select') {
            wrap = mk('div', CSS.card, parent);
            mk('span', CSS.labelBlock, wrap, desc.label);
            el = mk('select', CSS.select, wrap);
            for (const opt of desc.options || []) {
                const o = document.createElement('option');
                o.value = String(opt.value);
                o.textContent = opt.label;
                el.appendChild(o);
            }
            el.addEventListener('change', (e) => commit(parseInt(e.target.value, 10)));

        } else if (desc.type === 'color') {
            wrap = mk('div', CSS.card, parent);
            mk('span', CSS.labelBlock, wrap, desc.label);
            if (desc.eyedrop && window.EyeDropper) {
                // Native picker only. main.js has a canvas-picker fallback for the
                // Color Mask button, but it is hard-wired to that feature's
                // setter; sharing it means generalizing it there, which is its own
                // change. Omit the button rather than ship a dead control — the
                // colour input stays usable either way.
                const inline = mk('div', CSS.inline, wrap);
                el = mk('input', CSS.colorFlex, inline);
                el.type = 'color';
                const btn = mk('button', CSS.eyedrop, inline, '◎');
                btn.title = 'Pick a color from the screen';
                btn.addEventListener('click', async () => {
                    try {
                        const result = await new window.EyeDropper().open();
                        el.value = result.sRGBHex;
                        commit(result.sRGBHex);
                    } catch (err) {
                        // User cancelled the native picker — no-op
                    }
                });
            } else {
                el = mk('input', CSS.color, wrap);
                el.type = 'color';
            }
            el.addEventListener('input', (e) => commit(e.target.value));

        } else {
            wrap = mk('div', CSS.card, parent);
            const head = mk('div', CSS.labelRow, wrap);
            mk('span', CSS.label, head, desc.label);
            valEl = mk('span', CSS.value, head, '');
            el = mk('input', CSS.range, wrap);
            el.type = 'range';
            el.min = desc.min ?? 0;
            el.max = desc.max ?? 1;
            el.step = desc.step ?? 0.01;
            if (desc.hint) mk('p', CSS.hint, wrap, desc.hint);
            el.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                if (valEl) valEl.innerText = v.toFixed(desc.digits ?? 2);
                commit(v);
            });
        }

        // Stable ids for the Advance schema (effects/auto/advance/schema/g-vj.js)
        // to address via document.getElementById — these controls otherwise have
        // NO id (only `_paramEls`, a runtime Map, ever pointed at them). Qualified
        // by FX key because param keys collide across FX (every FX declares
        // `tint`, several share `mode`/`accent`) and only the ACTIVE FX's block
        // exists in the DOM at a time, so the qualifier also naturally scopes a
        // schema write to the FX it was meant for — see g-vj.js's header comment.
        if (el) el.id = `vjp_${this._fxKey}_${desc.key}`;
        if (valEl) valEl.id = `vjpv_${this._fxKey}_${desc.key}`;

        this._paramEls.set(desc.key, { desc, el, valEl, wrap });
    }

    /** Hide any control whose `showIf` says it would currently do nothing —
     *  Lum's Labels selector off Detection HUD, Lights' focus colour before Hue
     *  Focus is armed. Tailwind's `hidden` outranks a card's own display utility,
     *  so this works for grid cells and flex labels alike. */
    _syncParamVisibility() {
        for (const { desc, wrap } of this._paramEls.values()) {
            if (desc.showIf) wrap.classList.toggle('hidden', !desc.showIf(this.params));
        }
    }

    _attach() {
        const d = this._dom;
        const redraw = () => { if (this._app && !this._app.state.isPlaying) this._app.drawFrameSingle(); };

        // Collapsible header
        d.toggleBtn?.addEventListener('click', () => {
            d.content?.classList.toggle('hidden');
            d.chevron?.classList.toggle('rotate-180');
        });
        d.advToggle?.addEventListener('click', () => {
            d.advBody?.classList.toggle('hidden');
            d.advChevron?.classList.toggle('rotate-180');
        });

        d.enabled?.addEventListener('change', (e) => { this.setEnabled(e.target.checked); redraw(); });

        d.fx?.addEventListener('change', (e) => { this.setFx(e.target.value); redraw(); });
        // The FX param block is generated from `static PARAMS` and binds itself
        // as it is built — see _buildFxParams(). Nothing FX-specific below.

        // Preset/Randomize honor the Quantize Launch selector — "Instant" fires
        // immediately (and whenever no tempo is set yet); any note/bar value
        // queues the change to fire on the next boundary, same as a clip-based
        // VJ rig's clip launch.
        d.preset?.addEventListener('change', (e) => {
            const key = e.target.value;
            this._launch(() => this.applyPreset(key, true));
        });
        d.random?.addEventListener('click', () => this._launch(() => this.randomize()));

        d.control?.addEventListener('change', (e) => { this.setControlSource(e.target.value); redraw(); });

        // Gesture Triggers — the panel is generated in index.html (five fixed
        // gesture rows, unlike the FX param block), so it only needs a plain
        // redraw binding; _applyGestureTriggers() reads the live DOM each frame.
        d.gestureTrigEnabled?.addEventListener('change', redraw);
        [d.gestureTrigPalm, d.gestureTrigFist, d.gestureTrigVictory,
            d.gestureTrigThumb, d.gestureTrigPinch].forEach((sel) => {
                sel?.addEventListener('change', redraw);
            });

        d.manual?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this._chan('progress').manual = v;
            if (d.manualVal) d.manualVal.innerText = v.toFixed(2);
            redraw();
        });
        d.speed?.addEventListener('input', (e) => {
            this.autoRate = parseFloat(e.target.value);
            this._chan('progress').rate = this.autoRate;
            if (d.speedVal) d.speedVal.innerText = `${this.autoRate.toFixed(2)}×`;
            redraw();
        });
        d.audioBand?.addEventListener('change', (e) => {
            this.audioBand = e.target.value;
            this._chan('progress').band = this.audioBand;
            redraw();
        });
        d.blend?.addEventListener('input', (e) => {
            this.blend = parseFloat(e.target.value);
            if (d.blendVal) d.blendVal.innerText = `${this.blend.toFixed(2)}s`;
        });
        d.flickerHz?.addEventListener('input', (e) => {
            this.flickerHz = parseFloat(e.target.value);
            if (d.flickerHzVal) d.flickerHzVal.innerText = `${this.flickerHz.toFixed(1)} Hz`;
        });
        d.feel?.addEventListener('change', (e) => {
            this.feel = e.target.value;
            // null: an explicit pick outranks any feel a preset pinned, until
            // the next preset change re-asserts it.
            this._applyFeel(null);
            redraw();
        });
        d.progressSync?.addEventListener('change', () => {
            this._syncControlRows();
            redraw();
        });

        // ── Beat Sync ────────────────────────────────────────────────────────
        d.bpmTap?.addEventListener('click', () => {
            const bpm = this._beatClock.tapTempo();
            if (d.bpmInput) d.bpmInput.value = bpm.toFixed(1);
            this._syncStatus();
            redraw();
        });
        d.bpmInput?.addEventListener('change', (e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isFinite(v)) return;
            this._beatClock.setBpm(v);
            e.target.value = this._beatClock.bpm.toFixed(1);
            this._syncStatus();
            redraw();
        });
        d.bpmSuggestBtn?.addEventListener('click', () => {
            if (!this._beatClock.suggestedBpm) return;
            this._beatClock.setBpm(this._beatClock.suggestedBpm);
            if (d.bpmInput) d.bpmInput.value = this._beatClock.bpm.toFixed(1);
            this._syncStatus();
            redraw();
        });
        d.beatsPerBar?.addEventListener('change', (e) => {
            this._beatClock.setBeatsPerBar(parseInt(e.target.value, 10));
            redraw();
        });
        d.beatSyncReset?.addEventListener('click', () => { this._resetBeatSync(); redraw(); });

        // ── MIDI ─────────────────────────────────────────────────────────────
        d.midiEnabled?.addEventListener('change', (e) => { this._midi.setEnabled(e.target.checked); });
        d.midiLearn?.addEventListener('click', () => {
            if (this._midi.learnTarget) this._midi.cancelLearn();
            else this._midi.startLearn(d.midiTarget?.value);
        });
        d.midiClear?.addEventListener('click', () => { this._midi.clearBinding(d.midiTarget?.value); });
        d.midiClearAll?.addEventListener('click', () => { this._midi.clearAll(); });

        // Advanced — each slider takes manual control of its own channel.
        this._bindChannelSlider(d.intensity, d.intensityVal, 'intensity', redraw);
        this._bindChannelSlider(d.band, d.bandVal, 'band', redraw);
        this._bindChannelSlider(d.tiling, d.tilingVal, 'tiling', redraw);
        this._bindChannelSlider(d.dim, d.dimVal, 'dim', redraw);

        // Shared by every FX
        this._bindParamSlider(d.glow, d.glowVal, 'glow', 2, redraw);
        this._bindParamSlider(d.parallax, d.parallaxVal, 'parallax', 3, redraw);
        this._bindParamSlider(d.shake, d.shakeVal, 'shake', 2, redraw);
        this._bindParamSlider(d.depthContrast, d.depthContrastVal, 'depthContrast', 2, redraw);
        this._bindParamSlider(d.depthSoften, d.depthSoftenVal, 'depthSoften', 1, redraw);
        d.depthInvert?.addEventListener('change', (e) => { this.params.depthInvert = e.target.checked; redraw(); });

        // Depth source
        d.depthSource?.addEventListener('change', (e) => {
            this.depthCfg.source = e.target.value;
            this._syncDepthRows();
            redraw();
        });
        d.depthFile?.addEventListener('change', (e) => this._loadDepthMap(e.target.files?.[0], redraw));

        // Optional MediaPipe subject layer
        d.subject?.addEventListener('change', (e) => {
            this.depthCfg.subject = e.target.checked;
            this._enableSubject(this.depthCfg.subject);
            this._syncDepthRows();
            redraw();
        });
        d.subjectAmount?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.depthCfg.amount = v;
            this.params.subject = v;
            if (d.subjectAmountVal) d.subjectAmountVal.innerText = v.toFixed(2);
            redraw();
        });

        d.lookSave?.addEventListener('click', () => this._saveLook());
        d.lookDelete?.addEventListener('click', () => { this._deleteLook(); redraw(); });

        d.reset?.addEventListener('click', () => { this.reset(); redraw(); });

        // KEYS — a performer needs their hands off the mouse. Registered on
        // document because the deck's own panel is often scrolled out of view
        // while performing; every path out is guarded below.
        this._onKeyDown = this._onKeyDown.bind(this);
        document.addEventListener('keydown', this._onKeyDown);

        // Pointer source — the reference demo's uPointer, and the most practical
        // live-control surface when there's no camera in the room.
        const canvas = this._app?.dom?.outputCanvas;
        if (canvas) {
            this._onPointerMove = (e) => {
                const r = canvas.getBoundingClientRect();
                if (!r.width || !r.height) return;
                this._pointer = {
                    x: clamp01((e.clientX - r.left) / r.width),
                    y: clamp01((e.clientY - r.top) / r.height),
                };
            };
            this._onPointerLeave = () => { this._pointer = null; };
            canvas.addEventListener('pointermove', this._onPointerMove, { passive: true });
            canvas.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
        }
    }

    /** Master enable. Kept as a method (not inline in the listener) because the
     *  MIDI `act.toggle` pad drives the same path and must stay in sync. */
    setEnabled(on) {
        this.enabled = !!on;
        if (this._dom.enabled) this._dom.enabled.checked = this.enabled;
        if (!this.enabled) {
            this._mod.reset();
            // Free the segmenter task rather than leaving it warm.
            this._bgRemoval?.setEnabled(this._app, false);
            this._releaseGestureVision();
            this._stopTrackCam();
        } else {
            if (this.depthCfg.subject) this._enableSubject(true);
            this._syncGestureVision();
            this._ensureTrackingCam();
        }
        this._syncStatus();
    }

    _bindChannelSlider(el, valEl, key, redraw) {
        el?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            const c = this._chan(key);
            c.manual = v;
            // Touching a slider takes manual control — EXCEPT when hardware owns
            // this channel. A learned knob outranks the on-screen slider, which
            // stays live as the fallback value; otherwise the slider would
            // silently steal a bound parameter mid-set.
            if (c.source !== 'midi') c.source = 'manual';
            if (valEl) valEl.innerText = v.toFixed(2);
            redraw();
        });
    }

    _bindParamSlider(el, valEl, key, digits, redraw) {
        el?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.params[key] = v;
            if (valEl) valEl.innerText = v.toFixed(digits);
            redraw();
        });
    }

    // ── Presets ──────────────────────────────────────────────────────────────

    /** Switch the active FX exactly as the Effect dropdown would: reset the
     *  modulator, rescope the preset list, and land on that FX's first preset
     *  (its `static PARAMS` defaults, since a preset only overrides what it
     *  names). Extracted out of the dropdown's own listener — the Advance
     *  schema's `vj.fx` field (effects/auto/advance/schema/g-vj.js) needs this
     *  same behavior without a real DOM event, per the "self-wired add-ons
     *  prefer their module API over a DOM event" convention every other
     *  add-on in this codebase already follows. No-op if already on this FX,
     *  same guard `_rebuildPresetOptions()`/`_buildFxParams()` already use. */
    setFx(key) {
        if (!FX_REGISTRY[key] || key === this._fxKey) return;
        this._fxKey = key;
        this._mod.reset();
        this._rebuildPresetOptions();
        const first = this._presetsForFx()[0];
        if (first) this.applyPreset(first.key, true);
    }

    /** Apply a preset to internal state, and (optionally) write it back into the
     *  real DOM controls — the same "drive the actual UI" approach
     *  effects/auto/auto-feature-driver.js uses, so what you see matches what
     *  renders and the Auto Effects pipeline can drive this later. */
    applyPreset(key, writeDom = false) {
        // Snapshot BEFORE any state moves: the output canvas still holds the
        // outgoing look at this instant, and this is the only moment it does.
        this._beginBlend();
        const preset = this._findPreset(key);
        this.presetKey = preset.key;
        this._fxKey = preset.fx;

        // Rebuilt from the FX's own PARAM defaults every time, so a preset only
        // needs to name what it actually changes AND switching FX can never leave
        // the previous FX's params behind in the bag.
        const defs = {};
        for (const d of FX_REGISTRY[this._fxKey]?.PARAMS || []) defs[d.key] = d.default;
        this.params = { ...SHARED_PARAM_DEFAULTS, ...defs, ...preset.params };
        this.depthCfg = { ...this.depthCfg, ...preset.depth };
        // The preset's `params.subject` is the authority on subject strength;
        // depthCfg.amount mirrors it so the slider and the shader agree.
        this.depthCfg.amount = preset.params.subject ?? this.depthCfg.amount;
        this.params.subject = this.depthCfg.amount;

        const FxCls = FX_REGISTRY[this._fxKey];
        this.channels = {};
        for (const ch of FxCls.CHANNELS) {
            this.channels[ch.key] = {
                ...CHANNEL_DEFAULTS,
                ...(ch.defaults || {}),
                ...(preset.channels?.[ch.key] || {}),
            };
        }

        // The master control selector always owns the primary channel.
        this.controlSource = this.channels.progress?.source || 'auto';
        this.autoRate = this.channels.progress?.rate ?? 0.33;
        this.audioBand = this.channels.progress?.band || 'bass';
        // Unconditional (not just from the DOM change handler) — a preset can
        // set controlSource to 'gesture' directly, and the hidden webcam must
        // open/close in step with it regardless of whether writeDom is true.
        this._syncGestureVision();
        this._ensureTrackingCam();

        this._applyFeel(preset);

        this._mod.reset();
        // An FX carrying running state (LightshowFX's show clock) starts on a
        // clean bar rather than resuming mid-chase under a new look.
        this._ensureFx()?.reset?.();
        this._enableSubject(this.depthCfg.subject);
        if (writeDom) this._writeDom();
        // A preset declares channel sources, but a learned knob outranks it —
        // re-asserting here keeps hardware bound across every preset change
        // (including MIDI-triggered ones). Also refreshes rows + status.
        this._applyMidiChannelBindings();
    }

    /**
     * FEEL is a DECK-level preference, not part of a look: pick "Swell" once and
     * every preset you flip through keeps swelling. That is the opposite of how
     * `params` and channel sources work, and it is deliberate — Feel answers
     * "how should this move", which a performer sets to taste and then leaves.
     *
     * A preset may still pin one channel's feel explicitly, and that wins while
     * the preset is loaded. No shipped preset does today.
     *
     * @param {object|null} preset  the preset being applied, or null when the
     *        user picked a Feel by hand (their pick then outranks any pin).
     */
    _applyFeel(preset) {
        for (const key of Object.keys(this.channels)) {
            const c = this.channels[key];
            if (!c) continue;
            c.feel = preset?.channels?.[key]?.feel || this.feel;
        }
    }

    /** The deck's musical clock, read-only. Auto Effects reads a tempo from
     *  here so its cuts can land on beats; nothing outside should drive it,
     *  because tap tempo and the quantize queue both live on this instance. */
    get beatClock() { return this._beatClock; }

    /** Public setter so the Advance schema can drive Feel without the DOM
     *  listener, mirroring setControlSource(). */
    setFeel(value) {
        this.feel = value;
        this._applyFeel(null);
    }

    /** Randomize within the ACTIVE FX's own `static RANDOM` pool. Each FX ships
     *  its own ranges because what reads as "good" differs: Scan tolerates fast
     *  sweeps, a network that assembles does not, and a lightshow that randomizes
     *  its stage to black reads as a broken deck.
     *
     *  The pool is data, not branches: every key naming a param is either a LIST
     *  (pick one) or lives under `ranges` (pick a number in the span). */
    randomize() {
        const FxCls = FX_REGISTRY[this._fxKey];
        const pool = FxCls?.RANDOM;
        if (!pool) return;
        this._beginBlend();
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const span = ([lo, hi]) => lo + Math.random() * (hi - lo);

        const RESERVED = new Set(['ranges', 'channels', 'shapes', 'rates', 'after']);
        for (const [key, val] of Object.entries(pool)) {
            if (!RESERVED.has(key) && Array.isArray(val)) this.params[key] = pick(val);
        }
        for (const [key, range] of Object.entries(pool.ranges || {})) {
            // Snapped to the control's own step, so the slider lands exactly on
            // the value rather than a hair off it.
            const step = (FxCls.PARAMS || []).find((d) => d.key === key)?.step ?? 0.01;
            this.params[key] = Number((Math.round(span(range) / step) * step).toFixed(4));
        }
        for (const [key, range] of Object.entries(pool.channels || {})) {
            this._chan(key).manual = Number(span(range).toFixed(2));
        }
        // Cross-param rules the lists can't express (e.g. Lum's labels only mean
        // anything on Detection HUD).
        pool.after?.(this.params);

        const c = this._chan('progress');
        c.shape = pick(pool.shapes);
        c.rate = pick(pool.rates);
        this.autoRate = c.rate;
        this._ensureFx()?.reset?.();
        this._writeDom();
        this._syncStatus();
    }

    /** Full-deck reset. MIDI bindings deliberately SURVIVE — a performer's
     *  hardware map is rig setup, not a look; clearing it is its own button. */
    reset() {
        this.controlSource = 'auto';
        this.feel = 'direct';
        this.blend = BLEND_DEFAULT;
        this.flickerHz = FLICKER_HZ_DEFAULT;
        this._resetBeatSync();
        this._resetGestureTriggers();
        this.applyPreset(DEFAULT_PRESET, true);   // re-asserts MIDI bindings internally
    }

    /** Reset ONLY the Gesture Trigger mappings — mirrors _resetBeatSync()'s
     *  scoped-reset pattern. Not preset state (like MIDI bindings, these are
     *  deck-level rig config), so applyPreset() never touches them. */
    _resetGestureTriggers() {
        const d = this._dom;
        if (d.gestureTrigEnabled) d.gestureTrigEnabled.checked = false;
        for (const [domKey, defaultId] of Object.entries(GESTURE_TRIGGER_DEFAULTS)) {
            if (d[domKey]) d[domKey].value = defaultId;
        }
        this._gestureTrigEdge = {};
    }

    // ── DOM sync ─────────────────────────────────────────────────────────────

    _writeDom() {
        const d = this._dom;
        const set = (el, v) => { if (el) el.value = v; };
        const txt = (el, v) => { if (el) el.innerText = v; };

        set(d.fx, this._fxKey);
        this._rebuildPresetOptions();   // no-op unless the FX actually changed
        set(d.preset, this.presetKey);
        set(d.control, this.controlSource);
        set(d.audioBand, this.audioBand);
        set(d.feel, this.feel);
        set(d.blend, this.blend);
        txt(d.blendVal, `${this.blend.toFixed(2)}s`);
        set(d.flickerHz, this.flickerHz);
        txt(d.flickerHzVal, `${this.flickerHz.toFixed(1)} Hz`);

        set(d.speed, this.autoRate);
        txt(d.speedVal, `${this.autoRate.toFixed(2)}×`);
        set(d.manual, this._chan('progress').manual);
        txt(d.manualVal, this._chan('progress').manual.toFixed(2));

        const chanPairs = [
            [d.intensity, d.intensityVal, 'intensity'],
            [d.band, d.bandVal, 'band'],
            [d.tiling, d.tilingVal, 'tiling'],
            [d.dim, d.dimVal, 'dim'],
        ];
        for (const [el, valEl, key] of chanPairs) {
            const v = this._chan(key).manual;
            set(el, v);
            txt(valEl, v.toFixed(2));
        }

        // FX-specific params — the block is rebuilt only when the FX actually
        // changed, then every control is written from its own descriptor. No
        // per-FX branch, and switching FX can never stamp `undefined` into a
        // control because applyPreset() rebuilds `params` from PARAM defaults.
        this._buildFxParams();
        for (const { desc, el, valEl } of this._paramEls.values()) {
            const v = this.params[desc.key];
            if (v === undefined || !el) continue;
            if (desc.type === 'check') el.checked = !!v;
            else if (desc.type === 'range') {
                el.value = v;
                txt(valEl, Number(v).toFixed(desc.digits ?? 2));
            } else el.value = String(v);
        }
        this._syncParamVisibility();

        set(d.glow, this.params.glow);       txt(d.glowVal, this.params.glow.toFixed(2));
        set(d.parallax, this.params.parallax); txt(d.parallaxVal, this.params.parallax.toFixed(3));
        const shake = this.params.shake ?? 0;
        set(d.shake, shake);                 txt(d.shakeVal, shake.toFixed(2));
        set(d.depthContrast, this.params.depthContrast); txt(d.depthContrastVal, this.params.depthContrast.toFixed(2));
        set(d.depthSoften, this.params.depthSoften);     txt(d.depthSoftenVal, this.params.depthSoften.toFixed(1));
        if (d.depthInvert) d.depthInvert.checked = !!this.params.depthInvert;

        set(d.depthSource, this.depthCfg.source);
        if (d.subject) d.subject.checked = !!this.depthCfg.subject;
        set(d.subjectAmount, this.depthCfg.amount);
        txt(d.subjectAmountVal, this.depthCfg.amount.toFixed(2));

        this._syncControlRows();
        this._syncDepthRows();
        this._writeChannelLabels();
    }

    /** Re-text the channel sliders from the active FX's own CHANNELS table. The
     *  channel KEYS are shared across FX on purpose (so MIDI bindings and slider
     *  values survive an FX switch) — only the wording changes. */
    _writeChannelLabels() {
        const FxCls = FX_REGISTRY[this._fxKey];
        if (!FxCls) return;
        const d = this._dom;
        const spans = {
            progress: d.lblManual, intensity: d.lblIntensity,
            band: d.lblBand, tiling: d.lblTiling, dim: d.lblDim,
        };
        for (const ch of FxCls.CHANNELS) {
            const el = spans[ch.key];
            if (el && ch.label) el.innerText = ch.label;
        }
    }

    /** Only the row relevant to the chosen control source is visible — this is
     *  what keeps the surface small despite five modes. When the primary
     *  channel is locked to the beat clock, the free-running Speed slider is
     *  moot and hides in favor of the Sync selector alone. */
    _syncControlRows() {
        const d = this._dom;
        const isAuto = this.controlSource === 'auto';
        const synced = isAuto && (d.progressSync?.value || 'free') !== 'free';
        d.manualRow?.classList.toggle('hidden', this.controlSource !== 'manual');
        d.syncRow?.classList.toggle('hidden', !isAuto);
        d.speedRow?.classList.toggle('hidden', !isAuto || synced);
        d.audioBandRow?.classList.toggle('hidden', this.controlSource !== 'audio');
        d.gestureRow?.classList.toggle('hidden', this.controlSource !== 'gesture');
        this._syncGestureStatusUI();
    }

    /** Beats for the Quantize Launch selector (Preset/Randomize), resolved
     *  against the live beats-per-bar so any time signature stays correct. */
    _quantizeDivisionBeats() {
        return resolveSyncDivision(this._dom.quantizeLaunch?.value || 'free', this._beatClock.beatsPerBar);
    }

    /**
     * Single launch path for every look-changing action (preset dropdown,
     * Randomize, MIDI pads) so they all obey Quantize Launch identically.
     *
     * The queue is only drained by `_beatClock.tick()`, which only runs inside
     * render() — which in turn only runs while the deck is enabled AND a frame
     * is being drawn. So when playback is stopped (or the deck is off) there is
     * no loop to reach the next boundary and a queued action would hang forever.
     * A VJ isn't performing while paused, so fire immediately in that case.
     */
    _launch(fn) {
        const run = () => {
            fn();
            if (this._app && !this._app.state.isPlaying) this._app.drawFrameSingle();
        };
        if (!this.enabled || !this._app?.state?.isPlaying) { run(); return; }
        this._beatClock.scheduleQuantized(this._quantizeDivisionBeats(), run);
    }

    /** Reset ONLY the Beat Sync block (tempo, meter, quantize, channel lock) —
     *  the ↺ next to the beat pulse. Full-deck reset() delegates here so the two
     *  can't drift apart. */
    _resetBeatSync() {
        const d = this._dom;
        this._beatClock.reset();
        if (d.bpmInput) d.bpmInput.value = '120';
        if (d.beatsPerBar) d.beatsPerBar.value = '4';
        if (d.quantizeLaunch) d.quantizeLaunch.value = '1/4';
        if (d.progressSync) d.progressSync.value = 'free';
        d.bpmSuggestRow?.classList.add('hidden');
        this._chan('progress').syncDivision = null;
        this._syncControlRows();
        this._syncStatus();
    }

    // ── MIDI ─────────────────────────────────────────────────────────────────

    _initMidi() {
        this._midi.onChange = () => {
            this._applyMidiChannelBindings();
            this._syncMidiUI();
        };
        this._midi.onAction = (id) => this._onMidiAction(id);
    }

    /** A bound `ch.*` target IS the channel's control source — binding a knob is
     *  the entire interaction, and clearing it hands the channel back to its
     *  slider. Keeps the Control selector in step for the primary channel. */
    _applyMidiChannelBindings() {
        for (const t of MIDI_TARGETS) {
            if (t.kind !== 'channel') continue;
            const c = this._chan(t.channelKey);
            if (this._midi.isBound(t.id)) {
                c.source = 'midi';
                c.midiTarget = t.id;
            } else if (c.source === 'midi') {
                c.source = 'manual';
                c.midiTarget = null;
            }
        }
        this.controlSource = this._chan('progress').source;
        if (this._dom.control) this._dom.control.value = this.controlSource;
        this._syncControlRows();
        this._syncStatus();
    }

    /**
     * Shared action dispatch — MIDI pads and Gesture Triggers both fire
     * through this one switch, so the two control surfaces can never drift
     * apart on what an action actually does.
     *
     * Preset/Randomize run through the SAME quantize path as the Preset
     * dropdown, so a pad press or a held gesture lands on the next beat/bar
     * rather than cutting instantly. Transport actions are NEVER quantized —
     * tapping is how the tempo gets defined in the first place, and a
     * kill/toggle has to be instant (a quantized toggle-ON could never fire
     * anyway, since the queue only drains while the deck is already running).
     */
    /**
     * KEYS — keyboard shortcuts, guarded the same way main.js guards its own
     * global map (modifier bail, repeat bail, then the four-way target check),
     * so typing in any field is never intercepted.
     *
     * `r` and `s` and Space are deliberately NOT used: main.js binds them to
     * Record, Snapshot and play/pause, it matches on `e.key` without checking
     * Shift, and the deck is normally enabled while recording. Randomize is on
     * `g` for that reason.
     *
     * Scope: every key needs a running deck, so a collapsed panel cannot
     * swallow keystrokes from the rest of the app. `v` is the exception, since
     * it is the way back on, and it additionally requires the panel to be open.
     */
    _onKeyDown(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;

        const k = e.key;
        if (k === 'v' || k === 'V') {
            if (!this.enabled && this._dom.content?.classList.contains('hidden')) return;
            e.preventDefault();
            this._fireAction('act.toggle');
            return;
        }
        if (!this.enabled) return;

        if (k >= '1' && k <= '9') {
            e.preventDefault();
            this._launch(() => this._presetByIndex(Number(k) - 1));
            return;
        }
        switch (k) {
            case 'a': case 'A': e.preventDefault(); this._fireAction('act.presetPrev'); break;
            case 'd': case 'D': e.preventDefault(); this._fireAction('act.presetNext'); break;
            case 't': case 'T': e.preventDefault(); this._fireAction('act.tapTempo'); break;
            case 'g': case 'G': e.preventDefault(); this._fireAction('act.randomize'); break;
            default: break;
        }
    }

    /** KEYS — jump straight to the Nth preset of the ACTIVE FX. Out-of-range
     *  digits do nothing rather than wrapping, so 7 always means the same look
     *  on a given effect however many presets it has. */
    _presetByIndex(i) {
        const p = this._presetsForFx()[i];
        if (p) this.applyPreset(p.key, true);
    }

    _fireAction(id) {
        switch (id) {
            case 'act.presetNext': this._launch(() => this._stepPreset(1)); break;
            case 'act.presetPrev': this._launch(() => this._stepPreset(-1)); break;
            case 'act.randomize':  this._launch(() => this.randomize()); break;

            case 'act.tapTempo': {
                const bpm = this._beatClock.tapTempo();
                if (this._dom.bpmInput) this._dom.bpmInput.value = bpm.toFixed(1);
                this._syncStatus();
                break;
            }
            case 'act.toggle': {
                this.setEnabled(!this.enabled);
                if (this._app && !this._app.state.isPlaying) this._app.drawFrameSingle();
                break;
            }
        }
    }

    _onMidiAction(id) { this._fireAction(id); }

    _stepPreset(dir) {
        const list = this._presetsForFx();
        if (!list.length) return;
        const idx = list.findIndex((p) => p.key === this.presetKey);
        const next = list[(((idx + dir) % list.length) + list.length) % list.length];
        if (next) this.applyPreset(next.key, true);
    }

    _syncMidiUI() {
        const d = this._dom;
        const m = this._midi;
        if (d.midiStatus) d.midiStatus.innerText = this._midiStatusText();
        d.midiControls?.classList.toggle('hidden', !m.enabled);
        if (d.midiEnabled) d.midiEnabled.checked = m.enabled;

        if (d.midiLearn) {
            const armed = !!m.learnTarget;
            d.midiLearn.innerText = armed ? 'Listening…' : 'Learn';
            d.midiLearn.classList.toggle('text-emerald-400', armed);
            d.midiLearn.classList.toggle('text-fuchsia-400', !armed);
        }
        this._renderMidiBindings();
    }

    _midiStatusText() {
        const m = this._midi;
        switch (m.status) {
            case 'unsupported': return 'not supported in this browser';
            case 'connecting':  return 'connecting…';
            case 'denied':      return 'permission denied';
            case 'no-devices':  return 'no devices found';
            case 'ready':       return m.deviceNames.join(', ');
            default:            return '';
        }
    }

    /** Compact list of live bindings. Labels are module constants, never user
     *  input, so the template interpolation carries no injection risk. */
    _renderMidiBindings() {
        const host = this._dom.midiBindings;
        if (!host) return;
        const bound = MIDI_TARGETS.filter((t) => this._midi.isBound(t.id));
        if (!bound.length) {
            host.innerHTML = '<p class="text-[8px] text-zinc-500 leading-tight">No bindings yet. Pick a target, hit Learn, then move a knob or press a pad.</p>';
            return;
        }
        host.innerHTML = bound.map((t) => (
            `<div class="flex items-center justify-between gap-1 py-0.5">
                <span class="text-[8px] text-zinc-400 truncate">${t.label}</span>
                <span class="text-[7px] text-fuchsia-400 font-mono shrink-0">${this._midi.describe(t.id)}</span>
            </div>`
        )).join('');
    }

    _syncDepthRows() {
        const d = this._dom;
        d.depthFileRow?.classList.toggle('hidden', this.depthCfg.source !== 'upload');
        d.subjectRow?.classList.toggle('hidden', !this.depthCfg.subject);
    }

    _syncStatus() {
        const d = this._dom;
        if (!d.status) return;
        if (!this.enabled) { d.status.innerText = 'Off'; return; }
        const labels = { auto: 'Auto', manual: 'Manual', audio: 'Audio', gesture: 'Gesture', pointer: 'Pointer' };
        const p = getPreset(this.presetKey);
        const bpmTxt = this._beatClock.running ? ` · ${this._beatClock.bpm.toFixed(0)} BPM` : '';
        d.status.innerText = `${p.label} · ${labels[this.controlSource] || this.controlSource}${bpmTxt}`;
    }

    /** Public entry point for the Control selector's change — extracted out of
     *  the DOM listener so the Advance schema's `vj.controlSource` field
     *  (g-vj.js) can drive the exact same side effects (channel tuning, the
     *  hidden gesture webcam, status text) without a real 'change' event. */
    setControlSource(value) {
        this.controlSource = value;
        this._applyControlSource();
        this._syncControlRows();
        // Opens/closes the hidden gesture webcam and claims/releases the vision
        // module immediately, rather than waiting for the next render() frame —
        // same responsiveness VCGestureController's own change handler gets.
        this._syncGestureVision();
        this._ensureTrackingCam();
        this._syncStatus();
    }

    _applyControlSource() {
        const c = this._chan('progress');
        c.source = this.controlSource;
        c.rate = this.autoRate;
        c.band = this.audioBand;
        // Selecting MIDI by hand points at the primary channel's target; until a
        // knob is learned, getValue() returns null and the manual value holds.
        if (this.controlSource === 'midi') c.midiTarget = 'ch.progress';
        // Raw band levels are too small and too jittery to drive a POSITION on
        // their own — the one preset that does it (neon_sweep) has to lift and
        // damp them the same way. Without this, hand-picking Audio Reactive
        // inherits gain 1.0 / no floor / no smoothing and barely moves.
        if (this.controlSource === 'audio') Object.assign(c, AUDIO_CONTROL_TUNING);
        this._mod.reset();
    }

    _chan(key) {
        if (!this.channels[key]) this.channels[key] = { ...CHANNEL_DEFAULTS };
        return this.channels[key];
    }

    // ── Optional depth inputs ────────────────────────────────────────────────

    _loadDepthMap(file, redraw) {
        if (!file) return;
        if (this._depthUrl) URL.revokeObjectURL(this._depthUrl);
        this._depthUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            this._depthImg = img;
            this._depthToken++;
            if (this._dom.depthFileName) this._dom.depthFileName.innerText = file.name;
            redraw?.();
        };
        img.onerror = () => {
            this._app?.showToast?.('Depth map failed to load', file.name);
        };
        img.src = this._depthUrl;
    }

    /** Construct the segmenter only on first enable, and free it on disable —
     *  the "zero cost while off" contract ARBackgroundRemoval documents. */
    async _enableSubject(on) {
        if (!on) {
            this._bgRemoval?.setEnabled(this._app, false);
            if (this._dom.subjectStatus) this._dom.subjectStatus.innerText = '';
            return;
        }
        if (!this._bgRemoval) {
            if (this._bgLoading) return;
            this._bgLoading = true;
            if (this._dom.subjectStatus) this._dom.subjectStatus.innerText = 'loading…';
            try {
                const { ARBackgroundRemoval } = await import('../../core/ARBackgroundRemoval.js');
                this._bgRemoval = new ARBackgroundRemoval();
            } catch (err) {
                console.error('[VJ] subject depth failed to load:', err?.message || err);
                this._app?.showToast?.('Subject Depth failed to load', String(err?.message || err));
                this.depthCfg.subject = false;
                if (this._dom.subject) this._dom.subject.checked = false;
                this._syncDepthRows();
                return;
            } finally {
                this._bgLoading = false;
            }
        }
        this._bgRemoval.setEnabled(this._app, true);
        if (this._dom.subjectStatus) this._dom.subjectStatus.innerText = 'on';
    }

    // ── Gesture: vision-module ownership ─────────────────────────────────────
    // Mirrors VCGestureController's _syncVisionModule()/_releaseAutoVision()
    // almost exactly (same courtesy check, same restore-on-release contract),
    // kept as VJDeck's own copy rather than a shared call — see the "TRUE TO
    // ITS SOURCE" header note on why every add-on in this codebase owns its
    // camera/vision lifecycle independently instead of sharing it.

    /** Claim gesture_recognizer while Control=Gesture is selected — unless
     *  another feature already provides hand landmarks, in which case we just
     *  consume those instead of fighting over the vision module. */
    _syncGestureVision() {
        if (!this._app) return;
        const app = this._app;
        const moduleSel = app.dom.visionModule;
        const enableCb = app.dom.visionEnabled;
        if (!this.wantsGestureVision) { this._releaseGestureVision(); return; }
        if (!moduleSel || !enableCb) return;

        if (enableCb.checked && GESTURE_HAND_MODULES.includes(moduleSel.value)) return;

        const required = 'gesture_recognizer';
        if (moduleSel.value !== required) {
            if (!this._gestureAutoVision.prevModule && !this._gestureAutoVision.enabledByUs && enableCb.checked) {
                this._gestureAutoVision.prevModule = moduleSel.value;
            }
            moduleSel.value = required;
            moduleSel.dispatchEvent(new Event('change'));
        }
        if (!enableCb.checked) {
            this._gestureAutoVision.enabledByUs = true;
            enableCb.checked = true;
            enableCb.dispatchEvent(new Event('change'));
        }
    }

    /** Undo our automatic vision changes: turn vision off if WE enabled it, or
     *  restore the user's previous module if they had vision on themselves. */
    _releaseGestureVision() {
        const app = this._app;
        if (!app) return;
        if (this._gestureAutoVision.enabledByUs) {
            const cb = app.dom.visionEnabled;
            if (cb?.checked) { cb.checked = false; cb.dispatchEvent(new Event('change')); }
            app.dom.visionTrackingOpacityEnabled?.dispatchEvent(new Event('change'));
        } else if (this._gestureAutoVision.prevModule) {
            const sel = app.dom.visionModule;
            if (sel && sel.value !== this._gestureAutoVision.prevModule) {
                sel.value = this._gestureAutoVision.prevModule;
                sel.dispatchEvent(new Event('change'));
            }
        }
        this._gestureAutoVision = { enabledByUs: false, prevModule: null };
    }

    // ── Gesture: hidden "puppeteer" webcam ───────────────────────────────────
    // Same pattern as VCGestureController's own puppeteer mode (a private,
    // never-displayed getUserMedia stream used ONLY for hand tracking), a
    // second independent copy rather than a shared instance — this is the
    // established convention in this codebase (AnamorphicCamera has its own
    // third copy of the same pattern). The minor cost — two features wanting
    // puppeteer tracking at once each open their own camera stream — is the
    // same tradeoff those two already accept.

    /** Puppeteer is needed only while gesture tracking is wanted AND the live
     *  webcam isn't already the visible source — if it is, main.js's existing
     *  raw-inference path already feeds MediaPipe that same feed directly. */
    _puppeteerNeeded() {
        return this.wantsGestureVision && !!this._app && !this._app.state.isLiveMode;
    }

    /** Open/close the hidden tracking webcam to match the current need.
     *  Safe to call every frame — cheap boolean check, early-returns when
     *  nothing changed. */
    _ensureTrackingCam() {
        const need = this._puppeteerNeeded();
        if (need) {
            if (!this._gestureCam.stream && !this._gestureCam.starting) this._startTrackCam();
        } else if (this._gestureCam.stream || this._gestureCam.starting) {
            this._stopTrackCam();
        }
    }

    async _startTrackCam() {
        if (!navigator.mediaDevices?.getUserMedia) return;
        this._gestureCam.starting = true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' }, audio: false,
            });
            // The user may have switched Control away from Gesture while the
            // permission prompt was pending.
            if (!this._puppeteerNeeded()) { stream.getTracks().forEach((t) => t.stop()); return; }
            let v = this._gestureCam.video;
            if (!v) {
                v = document.createElement('video');   // never attached to the DOM
                v.muted = true; v.autoplay = true; v.playsInline = true;
                v.setAttribute('playsinline', '');
            }
            v.srcObject = stream;
            await v.play().catch(() => {});
            this._gestureCam.video = v;
            this._gestureCam.stream = stream;
            this._app?.showToast?.('🖐 VJ gesture cam on', 'Hidden — used only for tracking, never shown or recorded');
        } catch (e) {
            this._app?.showToast?.('Gesture Control: webcam blocked', 'Allow camera access to use gesture control');
        } finally {
            this._gestureCam.starting = false;
            this._syncGestureStatusUI();
        }
    }

    _stopTrackCam() {
        if (this._gestureCam.stream) this._gestureCam.stream.getTracks().forEach((t) => t.stop());
        if (this._gestureCam.video) this._gestureCam.video.srcObject = null;
        this._gestureCam.stream = null;
        this._gestureCam.starting = false;
    }

    /** Mirrored, cover-fit copy of the hidden webcam for MediaPipe inference —
     *  identical framing convention to the live-webcam gesture path. Returns
     *  null when not puppeteering, so main.js's existing fallback chain feeds
     *  MediaPipe the ordinary source instead. */
    getTrackingSource() {
        if (!this._puppeteerNeeded()) return null;
        const v = this._gestureCam.video;
        if (!v || v.readyState < 2 || !v.videoWidth) return null;

        const w = this._app.videoEngine.targetW;
        const h = this._app.videoEngine.targetH;
        if (!this._gestureCanvas) {
            this._gestureCanvas = document.createElement('canvas');
            this._gestureCtx = this._gestureCanvas.getContext('2d');
        }
        if (this._gestureCanvas.width !== w || this._gestureCanvas.height !== h) {
            this._gestureCanvas.width = w;
            this._gestureCanvas.height = h;
        }
        const ctx = this._gestureCtx;
        const vw = v.videoWidth, vh = v.videoHeight;
        const scale = Math.max(w / vw, h / vh);          // cover-fit
        const dw = vw * scale, dh = vh * scale;
        const dx = (w - dw) / 2, dy = (h - dh) / 2;
        ctx.setTransform(-1, 0, 0, 1, w, 0);              // mirror X (selfie view)
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(v, dx, dy, dw, dh);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        return this._gestureCanvas;
    }

    // ── Gesture: per-frame signal extraction + triggers ──────────────────────

    /** Read visionEngine.lastResults into our own hand position + gesture
     *  category. 1-frame latency, same as GestureEngine/VCGestureController.
     *  Signals decay to "no hand" the instant tracking stops qualifying,
     *  rather than holding a stale reading. */
    _updateGestureSignals() {
        if (!this.wantsGestureVision) { this._gestureSig.handsCount = 0; this._setRawGesture('None'); return; }
        const ve = this._app.visionEngine;
        if (!ve.enabled || !GESTURE_HAND_MODULES.includes(ve.activeModule)) {
            this._gestureSig.handsCount = 0;
            this._setRawGesture('None');
            this._syncGestureStatusUI();
            return;
        }
        const r = ve.lastResults;
        const hand = r ? this._extractHand(r, ve.activeModule) : null;
        if (!hand) {
            this._gestureSig.handsCount = 0;
            this._setRawGesture('None');
        } else {
            this._gestureSig.handsCount = hand.count;
            this._gestureSig.handX += (hand.x - this._gestureSig.handX) * GESTURE_SIGNAL_SMOOTH;
            this._gestureSig.handY += (hand.y - this._gestureSig.handY) * GESTURE_SIGNAL_SMOOTH;
            this._gestureSig.pinch += (hand.pinch - this._gestureSig.pinch) * GESTURE_SIGNAL_SMOOTH;
            this._gestureSig.lastSeenAt = performance.now();
            this._setRawGesture(hand.gesture);
            // While WE own the vision module, hide its raw overlay so a stray
            // box/skeleton never leaks onto the visible output from a webcam
            // the user never sees or asked to see.
            if (this._gestureAutoVision.enabledByUs) ve.options.overlayAlpha = 0;
        }
        this._syncGestureStatusUI();
    }

    /** Renders the small status badge in the Gesture Control sub-panel —
     *  separate from _syncStatus() (the deck's main preset/control line). */
    _syncGestureStatusUI() {
        const el = this._dom.gestureStatus;
        if (!el) return;
        const COLORS = {
            off: 'bg-zinc-700 text-zinc-400',
            starting: 'bg-fuchsia-900/50 text-fuchsia-300',
            tracking: 'bg-emerald-900/50 text-emerald-300',
            nohand: 'bg-amber-900/50 text-amber-300',
            blocked: 'bg-red-900/50 text-red-300',
        };
        let key = 'off', text = 'Off';
        if (this.wantsGestureVision) {
            if (this._gestureCam.starting) { key = 'starting'; text = 'Starting…'; }
            else if (performance.now() - this._gestureSig.lastSeenAt < GESTURE_HOLD_MS) { key = 'tracking'; text = 'Tracking ✓'; }
            else if (this._puppeteerNeeded() && !this._gestureCam.stream) { key = 'blocked'; text = 'Camera blocked'; }
            else { key = 'nohand'; text = 'No hand'; }
        }
        const cls = `text-[7px] font-mono px-1.5 py-0.5 rounded-full ${COLORS[key]}`;
        if (el.className !== cls) el.className = cls;
        if (el.innerText !== text) el.innerText = text;
    }

    /** Pull one hand's geometry + gesture from the active module's results —
     *  same landmark math as VCGestureController's own _extractHand(), kept
     *  as an independent copy (see the vision-ownership note above). */
    _extractHand(r, module) {
        let lm = null, count = 0;
        if (module === 'holistic_landmarker') {
            const left = this._flatLm(r.leftHandLandmarks);
            const right = this._flatLm(r.rightHandLandmarks);
            lm = right || left;
            count = (left ? 1 : 0) + (right ? 1 : 0);
        } else {
            const hands = r.landmarks;
            if (hands && hands.length) { lm = hands[0]; count = hands.length; }
        }
        if (!lm || lm.length < 21) return null;

        const PALM_IDX = [0, 5, 9, 13, 17];
        let px = 0, py = 0;
        for (const i of PALM_IDX) { px += lm[i].x; py += lm[i].y; }
        px /= PALM_IDX.length; py /= PALM_IDX.length;

        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const handSize = dist(lm[0], lm[9]) || 0.001;
        const pinch = clamp01(dist(lm[4], lm[8]) / (handSize * 2));
        const gesture = (module === 'gesture_recognizer')
            ? (r.gestures?.[0]?.[0]?.categoryName || 'None')
            : this._classifyHandPose(lm, handSize);

        return { x: px, y: py, pinch, gesture, count };
    }

    _flatLm(list) {
        if (!list || !list.length) return null;
        return (typeof list[0]?.x === 'number') ? list : list[0];
    }

    /** Geometric fallback for modules without native gesture categories
     *  (own copy — same shape as GestureEngine's/VCGestureController's). */
    _classifyHandPose(lm, handSize) {
        const wrist = lm[0];
        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const ext = (tip, pip) => dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.25;
        const index = ext(8, 6), middle = ext(12, 10), ring = ext(16, 14), pinky = ext(20, 18);
        const extCount = [index, middle, ring, pinky].filter(Boolean).length;
        const thumbUp = lm[4].y < lm[3].y && lm[4].y < wrist.y - handSize * 0.6;
        if (extCount >= 4) return 'Open_Palm';
        if (index && middle && !ring && !pinky) return 'Victory';
        if (extCount === 0 && thumbUp) return 'Thumb_Up';
        if (extCount === 0) return 'Closed_Fist';
        return 'None';
    }

    _setRawGesture(name) {
        if (name !== this._rawGesture) { this._rawGesture = name; this._gestureSince = performance.now(); }
    }

    /** Gesture that has held stable for GESTURE_TRIGGER_HOLD_MS with a hand
     *  present — a flicker, or an empty frame, reads as 'None' and fires
     *  nothing (and releases anything a previous frame armed). */
    _stableGesture() {
        if (this._gestureSig.handsCount === 0 || this._rawGesture === 'None') return 'None';
        return (performance.now() - this._gestureSince >= GESTURE_TRIGGER_HOLD_MS) ? this._rawGesture : 'None';
    }

    /** Pinch has no native gesture_recognizer category — same landmark-distance
     *  test GestureEngine/VCGestureController use. Excluded while a full fist
     *  is held, since curled fingers also bring thumb and index close. */
    _pinchClosed() {
        const s = this._gestureSig;
        return s.handsCount > 0 && s.pinch < 0.22 && this._stableGesture() !== 'Closed_Fist';
    }

    /**
     * User-configurable gesture → action mapping, evaluated once per frame.
     * Modeled on GestureEngine's Trigger system (same hold-time debounce, same
     * five recognizable poses) but reassignable: each gesture's own `<select>`
     * picks any action from MIDI_TARGETS' vocabulary instead of a hardcoded
     * one-to-one mapping. Fires on the RISING edge only (holding a pose does
     * not retrigger every frame), through the same _launch() quantize path a
     * MIDI pad uses. Only active while Control=Gesture — the panel that
     * configures this is only visible there too (_syncControlRows()).
     */
    _applyGestureTriggers() {
        const d = this._dom;
        if (!d.gestureTrigEnabled?.checked || this.controlSource !== 'gesture') {
            this._gestureTrigEdge = {};
            return;
        }
        const g = this._stableGesture();
        const rows = [
            ['Open_Palm', d.gestureTrigPalm], ['Closed_Fist', d.gestureTrigFist],
            ['Victory', d.gestureTrigVictory], ['Thumb_Up', d.gestureTrigThumb],
            ['Pinch', d.gestureTrigPinch],
        ];
        for (const [name, sel] of rows) {
            const active = name === 'Pinch' ? this._pinchClosed() : g === name;
            const wasActive = !!this._gestureTrigEdge[name];
            if (active && !wasActive) {
                const actionId = sel?.value || 'none';
                if (actionId !== 'none') this._fireAction(actionId);
            }
            this._gestureTrigEdge[name] = active;
        }
    }

    // ── Per-frame drive ──────────────────────────────────────────────────────

    /** Normalized 0..1 tracking position, from whichever bus is already live.
     *  Priority: an explicit AnamorphicCamera tracking session (the user set
     *  that up on purpose) → our OWN tracked hand, only while genuinely fresh
     *  → GestureEngine's signals as a last resort, if some other feature
     *  happens to have them. Never forces a MediaPipe module on by itself —
     *  that is _syncGestureVision()'s job, driven by the Control selector. */
    _track(opts) {
        const t = window._prismTrack;   // published by AnamorphicCamera tracking (−1..1)
        if (t && typeof t.x === 'number') {
            return { x: clamp01(0.5 + t.x * 0.5), y: clamp01(0.5 + t.y * 0.5) };
        }
        if (performance.now() - this._gestureSig.lastSeenAt < GESTURE_HOLD_MS) {
            const hx = clamp01(this._gestureSig.handX);
            return { x: (opts?.mirror && GESTURE_FOLLOW_MIRROR) ? 1 - hx : hx, y: clamp01(this._gestureSig.handY) };
        }
        const s = this._app?.gestureEngine?.enabled ? this._app.gestureEngine._signals : null;
        if (s && s.handsCount > 0) return { x: clamp01(s.handX), y: clamp01(s.handY) };
        return null;
    }

    /**
     * GESTURE FOLLOW — the 2-D point every FX receives as `pointer`, in −1..1.
     *
     * Under Control = Gesture a tracked hand IS the pointer: the effect follows
     * the hand exactly as it follows the mouse. Parallax tracks it in every FX,
     * and FX with a "Light From" origin pin their light to it regardless of the
     * preset's own origin (`follow: true`), so every preset follows without
     * being edited. Otherwise: the mouse over the output canvas, then any live
     * tracking bus, then centre — the behaviour the deck always had.
     */
    _pointerVec() {
        if (this.controlSource === 'gesture') {
            const h = this._track({ mirror: true });
            if (h) return { x: h.x * 2 - 1, y: h.y * 2 - 1, follow: true };
        }
        const p = this._pointer || this._track();
        if (!p) return { x: 0, y: 0, follow: false };
        return { x: p.x * 2 - 1, y: p.y * 2 - 1, follow: false };
    }

    /** Beat-pulse dot + the "Use Detected: N?" chip — both purely cosmetic
     *  reads of the clock's own state, called once per render frame. */
    _updateBeatSyncUI() {
        const d = this._dom;
        const info = this._beatClock.getInfo();
        if (info.running) {
            if (info.beatPhase < this._lastBeatFlashPhase) this._flashBeatDot();
            this._lastBeatFlashPhase = info.beatPhase;
        }

        const sug = this._beatClock.suggestedBpm;
        const showSuggest = !!sug && Math.abs(sug - this._beatClock.bpm) >= 2;
        if (d.bpmSuggestRow) {
            const isHidden = d.bpmSuggestRow.classList.contains('hidden');
            if (showSuggest === isHidden) d.bpmSuggestRow.classList.toggle('hidden', !showSuggest);
            if (showSuggest && d.bpmSuggestValue) d.bpmSuggestValue.innerText = sug;
        }
    }

    /**
     * BLEND — start a dissolve from whatever is on screen right now.
     *
     * Deliberately NOT a two-framebuffer crossfade. VJPass has no render-target
     * support, and every FX ends with `pass.draw(); pass.blit(ctx, w, h)`, so a
     * real dual-FX fade would change the blit contract in all four FX files. A
     * frozen snapshot of the outgoing frame dissolving into the live incoming
     * one is indistinguishable over a third of a second, and costs one
     * drawImage at the moment of the switch plus one per frame while fading.
     *
     * Called from applyPreset() and randomize(), which covers the preset
     * dropdown, the FX dropdown, MIDI pads, gesture triggers, keyboard presets
     * and Advance timeline cuts, because all of them route through those two.
     */
    _beginBlend() {
        if (!this.enabled || this.blend <= 0) return;
        const src = this._app?.videoEngine?.canvas;
        if (!src || !src.width || !src.height) return;

        if (!this._blendCanvas) this._blendCanvas = document.createElement('canvas');
        const c = this._blendCanvas;
        if (c.width !== src.width || c.height !== src.height) {
            c.width = src.width;
            c.height = src.height;
        }
        const bctx = c.getContext('2d');
        if (!bctx) return;
        bctx.clearRect(0, 0, c.width, c.height);
        bctx.drawImage(src, 0, 0);
        this._blendT = 0;
    }

    /** BLEND — draw the outgoing snapshot over the freshly rendered frame at
     *  falling opacity. Driven by the show clock's `dt`, so an export dissolves
     *  over the same MEDIA time it did live rather than however fast the
     *  encoder happened to run. */
    _drawBlend(ctx, w, h, dt) {
        if (!this._blendCanvas || this._blendT >= this.blend) return;
        this._blendT += dt;
        const u = this._blendT / this.blend;
        if (u >= 1) return;

        // Smoothstep, so the dissolve eases at both ends instead of starting
        // and stopping abruptly.
        const alpha = 1 - (u * u * (3 - 2 * u));
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = alpha;
        ctx.drawImage(this._blendCanvas, 0, 0, w, h);
        ctx.globalAlpha = prev;
    }

    /**
     * METERS — show what each channel is ACTUALLY producing, which a slider
     * cannot: a channel bound to audio, MIDI or a gesture ignores its slider
     * entirely, and the Feel shapers change the value again after that. This is
     * the only way to see a Feel working without staring at the output.
     *
     * No canvas and no second animation loop: render() already runs per frame.
     * Style writes are skipped outright while the panel is collapsed.
     */
    _updateMeters(drive) {
        const d = this._dom;
        if (!d.content || d.content.classList.contains('hidden')) return;

        const now = performance.now();
        if (now - this._lastMeterT < METER_INTERVAL_MS) return;
        this._lastMeterT = now;

        const set = (el, v) => { if (el) el.style.width = `${Math.round(clamp01(v) * 100)}%`; };
        set(d.mtrProgress, drive.progress);
        set(d.mtrIntensity, drive.intensity);
        set(d.mtrBand, drive.band);
        set(d.mtrTiling, drive.tiling);
        set(d.mtrDim, drive.dim);
    }

    _flashBeatDot() {
        const el = this._dom.beatPulse;
        if (!el) return;
        el.classList.remove('bg-zinc-700');
        el.classList.add('bg-fuchsia-400');
        clearTimeout(this._pulseTimeout);
        this._pulseTimeout = setTimeout(() => {
            el.classList.remove('bg-fuchsia-400');
            el.classList.add('bg-zinc-700');
        }, 90);
    }

    /**
     * Is the deck's SELECTED Control source actually producing a signal right
     * now? Only `audio` and `gesture` can ever be non-live — every other mode
     * (auto/manual/pointer/midi) is either explicitly free-running or already
     * degrades sensibly on its own, so this always returns true for them. See
     * the "TRUE TO ITS SOURCE" header note — this is the fix for both reported
     * bugs (Audio Reactive and Gesture animating with no real input).
     */
    _resolveDriveLive(dt, audioFeatures) {
        if (this.controlSource === 'audio') {
            const raw = audioFeatures
                ? Math.max(audioFeatures.vol || 0, audioFeatures.bass || 0, audioFeatures.mid || 0, audioFeatures.treble || 0)
                : 0;
            // Fast attack so real energy wakes the show up immediately; slow
            // release so it still reads as "live" across ordinary gaps between
            // hits, and only genuinely goes still once the track actually
            // stops (or nothing is loaded at all).
            const tau = raw > this._audioActivity ? 0.05 : 0.6;
            this._audioActivity += (raw - this._audioActivity) * (1 - Math.exp(-dt / tau));
            return this._audioActivity > 0.02;
        }
        if (this.controlSource === 'gesture') {
            return performance.now() - this._gestureSig.lastSeenAt < GESTURE_HOLD_MS;
        }
        return true;
    }

    /**
     * The one time basis for the whole deck, resolved per frame.
     *
     * Offline post-processing re-renders frames as fast as the encoder allows, so
     * wall time there bears no relation to the timeline the viewer will see: a
     * LightshowFX strobe, ScanFX's mote drift, Shake and every `auto` channel LFO
     * would all export at whatever rate the export happened to run at.
     * `state.postProcessCurrentTime` is the media-time authority main.js already
     * uses elsewhere for exactly this reason.
     *
     * Each media/wall basis clears the OTHER's anchor as it takes over, so the
     * first frame after a mode change starts from a nominal 1/60 step instead
     * of a stale (and possibly huge or negative) delta.
     *
     * `time` itself only ADVANCES while `_resolveDriveLive()` says the selected
     * Control source is actually live — frozen (not reset) otherwise. That is
     * what stops Shake and ScanFX's mote drift animating on the wall clock
     * alone when Audio Reactive has no signal or Gesture has no hand; every FX
     * already just consumes `clock.time` as-is, so this needed no per-FX
     * changes. `liveDt` (0 while not live) is the matching value for
     * VJShowEngine's phase/fast/hue accumulators in LightshowFX — env/beat
     * decay keeps running on the real `dt` regardless, so a hit that lands
     * right as the signal cuts out still fades out instead of sticking.
     */
    _resolveClock(now, audioFeatures) {
        const st = this._app?.state;
        const mediaT = (st?.isPostProcessing && st.postProcessCurrentTime !== undefined)
            ? st.postProcessCurrentTime
            : null;

        let dt;
        if (mediaT !== null) {
            dt = this._lastMediaT === null
                ? 1 / 60
                : Math.min(0.1, Math.max(0, mediaT - this._lastMediaT));
            this._lastMediaT = mediaT;
            this._lastTime = 0;
        } else {
            dt = this._lastTime ? Math.min(0.1, Math.max(0, (now - this._lastTime) / 1000)) : 1 / 60;
            this._lastTime = now;
            this._lastMediaT = null;
        }

        const live = this._resolveDriveLive(dt, audioFeatures);
        this._clockAccum += live ? dt : 0;
        return { time: this._clockAccum, dt, liveDt: live ? dt : 0 };
    }

    _ensureFx() {
        const Cls = FX_REGISTRY[this._fxKey];
        if (!Cls) return null;
        let inst = this._fx.get(this._fxKey);
        if (!inst) { inst = new Cls(); this._fx.set(this._fxKey, inst); }
        return inst;
    }

    /**
     * One render hook, called from drawFrameSingle() after the global color
     * grades and before the Universal Fisheye — so VJ sees the fully graded
     * frame (including the Anamorphic 3D model) and fisheye/letterbox still wrap
     * everything. Lands in recordings for free because it draws on the output ctx.
     */
    render(ctx, w, h, media, audioFeatures) {
        if (!this.enabled || !w || !h) return;

        const fx = this._ensureFx();
        if (!fx) return;

        // WebGL2 unavailable → skip silently, leaving the frame untouched.
        if (!this._pass.ensure(w, h)) return;

        // Gesture: refresh our own tracked hand and fire any armed trigger
        // mapping BEFORE resolving the clock below, so a fresh "no hand"
        // reading this frame is what the liveness gate actually sees.
        this._ensureTrackingCam();
        this._updateGestureSignals();
        this._applyGestureTriggers();

        const now = performance.now();
        const { time, dt, liveDt } = this._resolveClock(now, audioFeatures);
        this._mod.beginFrame(dt);

        this._beatClock.tick(audioFeatures);
        this._updateBeatSyncUI();
        // The primary channel's beat-lock is resolved live (not cached) so a
        // Beats/Bar change immediately retunes an active "1 Bar" sync.
        this._chan('progress').syncDivision = resolveSyncDivision(this._dom.progressSync?.value || 'free', this._beatClock.beatsPerBar);

        // Opt-in subject matte — throttled internally to ~12 fps, no-op when off.
        let matteSource = null, matteToken = 0;
        if (this.depthCfg.subject && this._bgRemoval) {
            this._bgRemoval.update(media);
            matteSource = this._bgRemoval.matteCanvas;
            // Re-upload only when a fresh mask actually arrived. `_lastInferTime`
            // is the module's own inference clock; if it ever goes away, the
            // fallback simply re-uploads a 256px texture per frame (still cheap).
            matteToken = this._bgRemoval._lastInferTime ?? now;
        }

        // One pointer for the frame. When a hand is following, channels with
        // source 'pointer' read the hand too, so a preset built for the mouse
        // behaves the same under Gesture without a second mapping.
        const fxPointer = this._pointerVec();
        const drvCtx = {
            dt,
            flickerHz: this.flickerHz,
            audio: audioFeatures,
            track: this._track(),
            pointer: fxPointer.follow
                ? { x: (fxPointer.x + 1) * 0.5, y: (fxPointer.y + 1) * 0.5 }
                : this._pointer,
            beatClock: this._beatClock,
            midi: this._midi,
        };

        const drive = {};
        for (const ch of fx.constructor.CHANNELS) {
            drive[ch.key] = this._mod.value(`${this._fxKey}.${ch.key}`, this._chan(ch.key), drvCtx);
        }

        this._updateMeters(drive);

        const depth = {
            mode: this.depthCfg.source === 'upload' && this._depthImg ? 1 : 0,
            mapSource: this._depthImg,
            mapToken: this._depthToken,
            matteSource,
            matteToken,
        };

        fx.render(
            this._pass,
            ctx,
            this._app.videoEngine.canvas,
            w, h,
            drive,
            this.params,
            depth,
            fxPointer,
            { time, dt, liveDt, audio: audioFeatures, beatClock: this._beatClock }
        );

        this._drawBlend(ctx, w, h, dt);
    }

    dispose() {
        clearTimeout(this._pulseTimeout);
        this._blendCanvas = null;
        if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
        const canvas = this._app?.dom?.outputCanvas;
        if (canvas && this._onPointerMove) {
            canvas.removeEventListener('pointermove', this._onPointerMove);
            canvas.removeEventListener('pointerleave', this._onPointerLeave);
        }
        this._releaseGestureVision();
        this._stopTrackCam();
        this._midi.dispose();
        for (const fx of this._fx.values()) fx.dispose?.();
        this._fx.clear();
        this._bgRemoval?.dispose?.();
        this._bgRemoval = null;
        this._pass.dispose();
        if (this._depthUrl) { URL.revokeObjectURL(this._depthUrl); this._depthUrl = null; }
    }
}
