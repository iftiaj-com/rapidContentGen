// Adits' Global Post-Processing block offline: core/main.js drawFrameSingle() 9595-9686, the part
// that runs on the finished frame. In Adits order:
//   RGB Colors -> Neon -> BnW / Negative -> Video Jockey deck -> Fisheye -> Global Opacity
// The Adits classes run unmodified: VideoEngine (core/video-engine.js: the BnW / Negative and
// Fisheye WGSL passes), VJDeck (effects/vj/, the whole deck: VJModulator,
// VJBeatClock, VJPass, the FX and the presets) and AudioEngine (core/audio-engine.js: analyze()
// and its SHAREDONSET kick / snare / hat / beat detector). The RGB, Neon and Opacity code lives
// inline in drawFrameSingle(), so those lines are ported verbatim below (same constants, same
// composite operations, same clocks: Date.now() and performance.now() are the harness's frame
// clock). Cinema Frames (drawn after this block) are a HyperFrames block instead: rcg cinema.
//
// Host differences, all forced by rendering offline:
//  * Audio. Adits exports with state.preAnalyzedAudio: a 1x pre-pass records analyze() once per
//    display frame (60 Hz) keyed by media ms, and each export frame takes the nearest record
//    (getClosestAudioFeature). Here analyze() runs on the emulated AnalyserNode bins
//    (tools/audio/analyser.mjs) at 60 Hz from the start of the music (options.audioHistory), so
//    the onset baselines have the history they would have in Adits, and each frame takes the
//    nearest record the same way. No --audio: every feature is 0, as with a silent track.
//  * The deck is not init()ed: init() wires the deck's own panel (vj* DOM ids), which does not
//    exist here. The shim sets the deck's app reference and applies the preset with
//    applyPreset(key, false), the path the deck's own preset dropdown takes, then turns it on.
//  * Gesture control (Subject Reveal) reads hand landmarks from app.visionEngine. Offline the hand
//    is the tracked subject (rcg fx --track / --point): one hand whose palm centre is the point.
//    The deck mirrors x when it follows a hand (GESTURE_FOLLOW_MIRROR, a selfie webcam), so the
//    point goes in as 1 - x to land on the hand on screen. app.state.isLiveMode is set so the
//    deck never opens its hidden webcam.
//  * The pointer (Beat Wash "Light From: Pointer", parallax) is Adits' mouse over the output
//    canvas; offline it is the --track / --point point, 0..1 over the output frame.
//  * No post chain: Adits batches BnW / Negative and Fisheye into one GPU chain when the deck is
//    off, and that chain fails on a bgra8unorm canvas (see the BnW block below); the two passes
//    run standalone instead.
//  * Subject Depth (AI) runs MediaPipe's selfie segmenter in Adits (ARBackgroundRemoval, about
//    12 fps, a white matte with the mask in alpha). Offline the matte is an rcg matte cut-out
//    (rcg fx --subject), one per output frame, drawn white with its alpha.
//
// Params (DOM inputs, as in the Adits panel): fxRgbColors, fxNeonMode, fxBnwMode, fxNegativeMode,
// fxFisheyeEnabled, fxFisheyeIntensity, globalOpacityEnabled, globalOpacitySlider; vjPreset (a
// key from effects/vj/vj-presets.js, '' = deck off). Overrides of the preset: --param vj.<key>=v
// sets a deck param (tint, pattern, glow, ...), --param vj.<channel>.<field>=v a channel field
// (progress.rate, intensity.manual, ...).

const LIB = '/lib/adits-fx/';
const pad = (n) => String(n).padStart(6, '0');

/** Adits' preAnalyzedAudio, built the way its analysis pre-pass builds it. */
function preAnalyze(AudioEngine, a) {
  const engine = new AudioEngine();
  const n = a.fftSize / 2;
  const bins = new Uint8Array(n);
  // What init() builds, minus the Web Audio graph: an analyser to read bins from and the clock
  // _detectOnsets() takes its dt from.
  engine.analyser = { smoothingTimeConstant: a.smoothing, frequencyBinCount: n, getByteFrequencyData: (out) => out.set(bins) };
  engine.freqData = new Uint8Array(n);
  engine._prevSpec = new Float32Array(n);
  engine.ctx = { currentTime: 0 };
  engine.initialized = true;
  const times = new Float64Array(a.ticks);
  const recs = new Array(a.ticks);
  for (let k = 0; k < a.ticks; k++) {
    const s = atob(a.freq[k]);
    for (let j = 0; j < n; j++) bins[j] = s.charCodeAt(j);
    const t = a.offset + k / a.hz;
    engine.ctx.currentTime = t;
    const f = engine.analyze(a.smoothing * 100, a.threshold, a.sensitivity); // fxSmooth, fxThresh, fxSens
    times[k] = Math.round(t * 1000);
    recs[k] = { ...f };
  }
  return { times, recs };
}

/** getClosestAudioFeature(ms) (main.js 9727-9753): the nearest record, the earlier one on a tie. */
function closest(pre, ms) {
  const { times } = pre;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < ms) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(times[lo - 1] - ms) < Math.abs(times[lo] - ms)) lo -= 1;
  return pre.recs[lo];
}

export async function create(_Cls, env) {
  const { job } = env;
  const [{ VideoEngine }, { AudioEngine }] = await Promise.all([
    import(`${LIB}core/video-engine.js`), import(`${LIB}core/audio-engine.js`),
  ]);
  // Adits' engine owns the output canvas (same canvas, so the same 2D context as the harness's).
  const ve = new VideoEngine(env.out);
  const app = window.app;
  app.videoEngine = ve;
  app.state.isLiveMode = true; // the deck's hidden gesture webcam stays closed (_puppeteerNeeded)
  const pre = job.analyser ? preAnalyze(AudioEngine, job.analyser) : null;
  const features = { bass: 0, mid: 0, treble: 0, vol: 0, rawVol: 0, rawPulse: 0, kick: 0, snare: 0, hat: 0, beat: 0, level: 0 };

  let deck = null;
  const presetKey = String(job.params?.vjPreset || '');
  if (presetKey) {
    const [{ VJDeck }, { VJ_PRESETS }] = await Promise.all([import(`${LIB}effects/vj/VJDeck.js`), import(`${LIB}effects/vj/vj-presets.js`)]);
    const preset = VJ_PRESETS.find((p) => p.key === presetKey);
    if (!preset) throw new Error(`Unknown VJ preset "${presetKey}"`);
    if (preset.depth?.subject && !job.subject) throw new Error(`VJ preset ${presetKey} uses Subject Depth (AI): pass --subject <rcg matte cut-out>`);
    deck = new VJDeck();
    deck._app = app;
    if (job.subject) {
      // Stands in for ARBackgroundRemoval (constructed only when the preset turns Subject Depth on).
      const c = document.createElement('canvas');
      c.width = job.width; c.height = job.height;
      deck._bgRemoval = { matteCanvas: c, _lastInferTime: 0, setEnabled() {}, update() {}, dispose() {} };
    }
    deck.applyPreset(presetKey, false);
    // Preset overrides, then the three lines applyPreset() derives from the primary channel.
    for (const [k, v] of Object.entries(job.vparams?.vj || {})) {
      if (v && typeof v === 'object' && deck.channels[k]) Object.assign(deck.channels[k], v);
      else deck.params[k] = v;
    }
    deck.controlSource = deck.channels.progress?.source || 'auto';
    deck.autoRate = deck.channels.progress?.rate ?? 0.33;
    deck.audioBand = deck.channels.progress?.band || 'bass';
    if (job.track && deck.controlSource === 'gesture') app.visionEngine = { enabled: true, activeModule: 'hand_landmarker', lastResults: null, options: {} };
    deck.enabled = true;
  }

  return { ve, deck, pre, features, $: (id) => document.getElementById(id) };
}

export async function setup(host, env) {
  const { ve } = host;
  const $ = host.$;
  const needGpu = ['fxBnwMode', 'fxNegativeMode', 'fxFisheyeEnabled'].some((id) => $(id)?.checked);
  const ok = await ve.initGPU();
  if (!ok && needGpu) throw new Error('BnW / Negative / Fisheye need WebGPU (an installed Chrome; see tools/fx/chrome.mjs)');
  // initGPU() starts the fisheye, global-visuals and blit pipelines compiling; Adits skips the pass
  // (or uses the 2D fallback) until they exist, so wait for them before frame 0.
  for (let k = 0; ok && k < 1000 && !ve.postChainReady(); k++) await new Promise((r) => setTimeout(r, 10));
  if (ok && !ve.postChainReady()) throw new Error('WebGPU post pipelines did not build');
  env.log(`adits-post: webgpu ${ok}, deck ${host.deck ? host.deck.presetKey : 'off'}, audio ${host.pre ? `${host.pre.recs.length} records` : 'none'}`);
}

export async function beforeFrame(host, i, env) {
  const { job } = env;
  const deck = host.deck;
  if (!deck) return;
  if (job.subject) {
    const img = await env.loadImage(`/work/subject/${pad(i + 1)}.png`);
    const c = deck._bgRemoval.matteCanvas;
    const m = c.getContext('2d');
    m.globalCompositeOperation = 'copy';
    m.drawImage(img, 0, 0, c.width, c.height);
    m.globalCompositeOperation = 'source-in';
    m.fillStyle = '#ffffff';
    m.fillRect(0, 0, c.width, c.height);
    m.globalCompositeOperation = 'source-over';
    deck._bgRemoval._lastInferTime = i + 1;
  }
  const p = job.track?.[i];
  if (!p) return;
  if (window.app.visionEngine) {
    const lm = Array.from({ length: 21 }, () => ({ x: 1 - p.x, y: p.y, z: 0 }));
    window.app.visionEngine.lastResults = p.has ? { landmarks: [lm] } : null;
  } else deck._pointer = p.has ? { x: p.x, y: p.y } : null;
}

export function render(host, i, env) {
  const { ve, deck, $ } = host;
  const { job } = env;
  const videoEngine = ve;
  const state = window.app.state;

  // The frame, as main.js's render block leaves it on the canvas (the harness frame is already cover-cropped).
  videoEngine.ctx.drawImage(env.media, 0, 0, videoEngine.targetW, videoEngine.targetH);

  // main.js 8161-8187: the replayed record copied into the features singleton.
  const audioFeatures = host.features;
  for (const k of Object.keys(audioFeatures)) audioFeatures[k] = 0;
  if (host.pre) Object.assign(audioFeatures, closest(host.pre, Math.round(((job.audioOffset || 0) + i / job.fps) * 1000)));

  // ── main.js 9595-9686 (Global Post-Processing), ported ──
  const hasBnw = $('fxBnwMode')?.checked;
  const hasNegative = $('fxNegativeMode')?.checked;
  const hasRgbColors = $('fxRgbColors')?.checked;
  const hasNeonMode = $('fxNeonMode')?.checked;
  const gCtx = videoEngine.ctx;
  const gW = videoEngine.targetW;
  const gH = videoEngine.targetH;
  const gBass = audioFeatures.bass || 0;
  const gMid = audioFeatures.mid || 0;
  const gTreble = audioFeatures.treble || 0;

  // RGB Colors: cycles through R/B/G/Y overlays on beat (same as ARNegativeFlash effect)
  if (hasRgbColors && (gBass > 0.05 || gTreble > 0.05)) {
    const colors = [
      'rgba(255, 0,   0,   0.65)', // Red
      'rgba(0,   0,   255, 0.65)', // Blue
      'rgba(0,   255, 0,   0.65)', // Green
      'rgba(255, 255, 0,   0.65)', // Yellow
    ];
    const colorIdx = Math.floor(Date.now() / 100) % 4;
    gCtx.save();
    gCtx.globalCompositeOperation = 'color';
    gCtx.fillStyle = colors[colorIdx];
    gCtx.fillRect(0, 0, gW, gH);
    gCtx.globalCompositeOperation = 'source-over';
    gCtx.restore();
  }

  // Neon: GlitchBeat hue+glow overlay (no scanlines). Hue cycles with time+bass; overlay tints, screen glows
  if (hasNeonMode) {
    const neonTime = (performance.now() / 1000);
    const hue = (neonTime * 80 + gBass * 200) % 360;
    gCtx.save();
    gCtx.globalCompositeOperation = 'overlay';
    gCtx.globalAlpha = 0.20 + gBass * 0.30;
    gCtx.fillStyle = `hsl(${hue}, 100%, 55%)`;
    gCtx.fillRect(0, 0, gW, gH);
    gCtx.globalCompositeOperation = 'screen';
    gCtx.globalAlpha = 0.12 + gMid * 0.18;
    gCtx.fillStyle = `hsl(${(hue + 120) % 360}, 100%, 50%)`;
    gCtx.fillRect(0, 0, gW, gH);
    gCtx.globalCompositeOperation = 'source-over';
    gCtx.globalAlpha = 1.0;
    gCtx.restore();
  }

  // BnW + Negative: GPU single-pass shader. Adits runs it and Fisheye as one post chain when the
  // deck is off (beginPostChain / endPostChain); not here: the chain renders into rgba8unorm
  // textures with pipelines built for the canvas format (bgra8unorm on Windows), the command
  // buffer is invalid and the frame comes out untouched. Standalone, the passes give the result
  // the chain was an optimisation of (video-engine.js: "Passes called outside a chain behave
  // exactly as before").
  const wantGlobals = !!(hasBnw || hasNegative);
  const wantFisheye = !!$('fxFisheyeEnabled')?.checked;
  const vjOn = !!deck?.enabled;
  if (wantGlobals) {
    videoEngine.applyGlobalVisuals({ bnw: !!hasBnw, negative: !!hasNegative, rgbColors: false });
  }

  // VJ: after the global colour grades, before Fisheye.
  if (vjOn) {
    deck.render(videoEngine.ctx, videoEngine.targetW, videoEngine.targetH, state.activeMedia, audioFeatures);
  }

  // Universal Fisheye, last.
  if (wantFisheye) {
    const fisheyeIntens = parseFloat($('fxFisheyeIntensity')?.value || 0.5);
    videoEngine.applyFisheye(fisheyeIntens);
  }

  // Global Opacity: the frame drawn at the slider's alpha over solid black.
  if ($('globalOpacityEnabled')?.checked) {
    const opacityVal = parseFloat($('globalOpacitySlider')?.value || 0.5);
    const ctx = videoEngine.ctx;
    const w = videoEngine.targetW;
    const h = videoEngine.targetH;
    if (videoEngine.offCanvas.width !== w || videoEngine.offCanvas.height !== h) {
      videoEngine.offCanvas.width = w;
      videoEngine.offCanvas.height = h;
    }
    videoEngine.offCtx.clearRect(0, 0, w, h);
    videoEngine.offCtx.drawImage(videoEngine.canvas, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = opacityVal;
    ctx.drawImage(videoEngine.offCanvas, 0, 0);
    ctx.restore();
  }
}
