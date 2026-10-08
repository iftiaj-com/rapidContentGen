// Adits CutoutCollage (core/anam/CutoutCollage.js, unmodified) driven the way AnamorphicCamera
// drives it: _buildCutout / _regenCutout (layout from the controls and the layout seed), the
// enable handler (cut apart from the start: latch 1, progress 0, timer cycle restarted), then
// _tickCutout + _computeCutoutProgress over the finished frame, on the 60 Hz host clock. Each
// tick composites the current footage frame, so the piece easing and the parallax run at the
// live rate; the output frame keeps the last tick's composite.
//
// rcg params: rcgCutoutAt = "t:1;t:0" (seconds of the output clip) sets the Manual latch, as the
// Cut Apart / Assemble button does; rcgCutoutSeed = the layout seed (Shuffle), empty = random
// from the harness seed. The Gesture trigger (fist / palm events) is not wired here.

import { bandLevel, makeAudio, makeTicker, makeTrack } from './anam-host.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const domProxy = () => new Proxy({}, { get: (_, id) => (typeof id === 'string' ? document.getElementById(id) : undefined) });

export async function create(CutoutCollage, env) {
  const { width: W, height: H } = env.job;
  const dom = domProxy();
  const ticker = makeTicker(env);
  const audio = makeAudio(env);
  // CutoutCollage parallaxes by the raw track (screen-normalized, -1..1).
  const tr = makeTrack(env, (sx, sy, z) => ({ x: (sx - 0.5) * 2, y: (sy - 0.5) * 2, z }));
  const seedText = String(dom.rcgCutoutSeed?.value ?? '').trim();
  const seed = seedText !== '' && Number.isFinite(Number(seedText)) ? Number(seedText) >>> 0 : (Math.random() * 0xffffffff) >>> 0;
  const cut = new CutoutCollage();
  cut.generate({
    preset: dom.cutoutPreset?.value || 'classic',
    count: parseInt(dom.cutoutPieces?.value ?? 9),
    size: parseFloat(dom.cutoutSize?.value ?? 30) / 100,
    sizeJitter: parseFloat(dom.cutoutSizeJitter?.value ?? 50) / 100,
    edge: dom.cutoutEdgeStyle?.value || 'poly',
    seed,
  });
  const pre = ((env.job.skip || 0) / env.job.fps) * 1000;
  const latches = String(dom.rcgCutoutAt?.value || '').split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [t, v] = s.split(':').map(Number);
    if (!Number.isFinite(t) || !Number.isFinite(v)) throw new Error(`rcgCutoutAt: cannot read "${s}" (want t:1 or t:0)`);
    return { ms: t * 1000 + pre, v: v > 0.5 ? 1 : 0 };
  }).sort((a, b) => a.ms - b.ms);
  const s = { progress: 0, burst: 1, t0: performance.now(), audioEMA: 0, reactEMA: 0 };
  let ctx = null;

  function computeProgress() {
    const trigger = dom.cutoutTrigger?.value || 'manual';
    if (trigger === 'timer') {
      const dur = Math.max(0.5, parseFloat(dom.cutoutDuration?.value ?? 4));
      const t = (performance.now() - (s.t0 ?? 0)) * 0.001;
      const phase = (t % (2 * dur)) / dur;
      const tri = phase <= 1 ? phase : 2 - phase;
      return tri * tri * (3 - 2 * tri);
    }
    s.audioEMA = s.audioEMA * 0.6 + bandLevel(audio.features, dom.cutoutBand?.value || 'all') * 0.4;
    return clamp01(s.audioEMA);
  }

  let react = 0;
  function hostTick(k, ms) {
    audio.at(k);
    tr.at(ms);
    while (latches.length && latches[0].ms <= ms + 1e-6) s.burst = latches.shift().v;
    const trigger = dom.cutoutTrigger?.value || 'manual';
    if (trigger === 'timer') s.progress = computeProgress();
    else {
      const target = trigger === 'beat' ? computeProgress() : s.burst;
      const kk = trigger === 'beat' ? 0.4 : 0.10;
      s.progress += (target - s.progress) * kk;
      if (Math.abs(target - s.progress) < 0.001) s.progress = target;
    }
    s.progress = clamp01(s.progress);
    react = 0;
    if (dom.cutoutAudio?.checked) {
      s.reactEMA = s.reactEMA * 0.55 + bandLevel(audio.features, dom.cutoutAudioBand?.value || 'all') * 0.45;
      react = clamp01(s.reactEMA);
    }
    draw();
  }

  function draw() {
    const pr = s.progress;
    ctx.drawImage(env.media, 0, 0, W, H); // the finished frame the pieces are cut from
    cut.composite(ctx, W, H, {
      progress: pr * pr * (3 - 2 * pr),
      spread: parseFloat(dom.cutoutSpread?.value ?? 35) / 100,
      zoom: parseFloat(dom.cutoutZoom?.value ?? 30) / 100,
      rotate: parseFloat(dom.cutoutRotate?.value ?? 15) / 100,
      border: parseFloat(dom.cutoutBorder?.value ?? 0),
      shadow: parseFloat(dom.cutoutShadow?.value ?? 35) / 100,
      drift: parseFloat(dom.cutoutDrift?.value ?? 20) / 100,
      parallax: parseFloat(dom.cutoutParallax?.value ?? 40) / 100,
      track: tr.track,
      audio: react,
      time: performance.now() * 0.001,
      colorMode: parseInt(dom.cutoutColorMode?.value ?? 0),
      colorStrength: parseFloat(dom.cutoutColorStrength?.value ?? 70) / 100,
      customColor: dom.cutoutCustomColor?.value || '#ff70b8',
      bgMode: dom.cutoutBgMode?.value || 'original',
      bgColor: dom.cutoutBgColor?.value || '#000000',
    });
  }

  return {
    render(c) {
      ctx = c;
      if (!ticker.run(hostTick)) draw();
    },
  };
}
