// rcg marketing-pro: promo talking-head edits from ordinary footage (style pack marketing-pro,
// skill .claude/skills/style-marketing-pro). The camera rules are measured from the user's
// reference ad (Video-2306): eased 0.27 s zooms on clause starts 1.4-3.2 s apart alternating
// 1.3 / 1.0, hard punches to 1.6 on strong sentence starts, constant drift between events, the face
// at x 0.5 y 0.37; one hero keyword per sentence by meaning; a two-tier body caption.
//
//   node tools/recipes/marketing-pro.mjs prep  --job <dir> --src <clip> [--name main] [--trim] [--denoise 12] [--lufs -14]
//   node tools/recipes/marketing-pro.mjs plan  --job <dir> [--name main] [--seed 1] [--max-punch 1.6]
//        [--behind true|false] [--bloom 0|1|2] [--caption-y px]
//        [--caption-fx hollow,rgb,shadow [--caption-shadow-angle 45] [--caption-shadow-dist 4]] [--negative-heroes n]
//        [--fill-heroes] [--fills gold=<img>,pink=<img>,photo=<img>] [--clusters] [--cards "word:<img>,..."]
//        [--whips n] [--music <file>] [--strips "<clip>@<s>[:x],..."] [--leak <video>]
//   node tools/recipes/marketing-pro.mjs audio --job <dir>      (music bed + sounds from the plan; build runs it)
//   prep --intro s --outro s pads the clip (first / last frame held) and the voice (silence) for a
//   strip opener / closer (plan --strips); the words move with it.
//   node tools/recipes/marketing-pro.mjs commands|build --job <dir> [--dry-run]
//
// prep (--trim keeps 0.2 s before the first word and 0.5 s after the last): CFR 30 video (lanczos upscale + light denoise/sharpen when smaller than the output),
//   denoised and leveled voice, transcript (data/words.json: CORRECT IT before planning),
//   index.html scaffold (when still the template). plan: data/mp-plan.json, beat-sheet.json,
//   data/style-plan.json, the face-cue camera and the build steps. The camera runtime
//   (library/runtime/face-reframe.js) is reused unchanged; plan simulates it to check reach.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson, ROOT } from '../lib/config.mjs';
import { decodeMono, levelAudio, loudness, probe, run, runBuffer } from '../lib/ffmpeg.mjs';
import { rcg, runCommands } from '../lib/runner.mjs';
import { Reframe, subjectPath } from '../blocks/camera.mjs';
import { transitionIds } from '../blocks/transition.mjs';
import { mulberry32 } from './timeremap.mjs';
import { validateBeatSheet } from '../jobs/beat-sheet.mjs';
import { musicLane } from '../blocks/flythrough.mjs';

const f3 = (n) => +Number(n).toFixed(3);
const f2 = (n) => +Number(n).toFixed(2);

// Measured camera rules (references/camera-rules.md in the skill).
export const RULES = {
  wide: 1.0, base: 1.3, punch: 1.6,
  zoomD: 0.27, zoomEase: 'power2', lead: 0.1,
  minGap: 1.4, maxGap: 3.2, punchEvery: 8,
  subject: { x: 0.5, y: 0.37 },
  drift: [0.03, 0.06], driftX: 0.02, driftY: 0.015,
  pause: 0.25, snap: 0.15,
};

function rootGeometry(html) {
  const tag = html.match(/<[a-z]+\b[^>]*data-composition-id="main"[^>]*>/i)?.[0] || html.match(/<[a-z]+\b[^>]*data-composition-id[^>]*>/i)?.[0] || '';
  const num = (n) => Number(tag.match(new RegExp(`${n}="([^"]+)"`))?.[1]);
  return { width: num('data-width') || 1080, height: num('data-height') || 1920, duration: num('data-duration') || 0 };
}

const jobRel = (jobDir) => relative(ROOT, jobDir).split('\\').join('/');

// ── prep ──────────────────────────────────────────────────────────────────────

export async function prep(opts) {
  const jobDir = resolve(opts.job);
  const name = opts.name || 'main';
  const src = isAbsolute(opts.src) ? opts.src : join(jobDir, opts.src);
  if (!existsSync(src)) throw new Error(`--src not found: ${src}`);
  const indexPath = join(jobDir, 'index.html');
  const html0 = readFileSync(indexPath, 'utf8');
  const { width: W, height: H } = rootGeometry(html0);
  const info = await probe(src);
  if (!info.video) throw new Error(`${src}: no video stream`);
  if (!info.audio?.length) throw new Error(`${src}: no audio (marketing-pro edits are driven by speech)`);
  const assets = join(jobDir, 'assets');
  const data = join(jobDir, 'data');
  mkdirSync(assets, { recursive: true });
  mkdirSync(data, { recursive: true });
  const report = { src: opts.src, source: { width: info.video.width, height: info.video.height, fps: f2(info.video.fps), duration: f2(info.duration) } };

  // Audio first (the transcript decides any trim): high-pass, light FFT denoise, then level.
  const raw = join(assets, `${name}-voice.raw.wav`);
  const voice = join(assets, `${name}-voice.wav`);
  const nr = Number(opts.denoise ?? 12);
  await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vn', '-af', `highpass=f=70${nr > 0 ? `,afftdn=nr=${nr}:nf=-50` : ''}`, '-ar', '48000', '-ac', '2', raw]);
  const lv = await levelAudio(raw, voice, { lufs: Number(opts.lufs ?? -14), ceilingDb: Number(opts.ceiling ?? -3.6) });
  rmSync(raw, { force: true });
  report.audio = { before: (await loudness(src)), after: lv.after, gainDb: lv.gainDb, denoise: nr };
  report.audio.floorDb = await noiseFloor(voice);

  // Transcript of the leveled voice.
  const words = join(data, 'words.json');
  execFileSync(process.execPath, ['tools/rcg.mjs', 'voice', 'transcribe', voice, '--out', words], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  let doc = readJson(words);
  const ws = doc.words || [];
  if (!ws.length) throw new Error('The transcript has no words.');

  // Optional trim of dead air (an editorial change: reported).
  let t0 = 0;
  let t1 = info.duration;
  if (opts.trim) {
    t0 = Math.max(0, ws[0].start - 0.2);
    t1 = Math.min(info.duration, ws[ws.length - 1].end + 0.5); // room for the caption's hold and fade
    const cut = join(assets, `${name}-voice.cut.wav`);
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t0), '-to', String(t1), '-i', voice, '-c:a', 'pcm_s16le', cut]);
    copyFileSync(cut, voice);
    rmSync(cut, { force: true });
    doc = { ...doc, words: ws.map((w) => ({ ...w, start: f3(w.start - t0), end: f3(w.end - t0) })), trimmedFrom: f3(t0) };
    writeFileSync(words, `${JSON.stringify(doc, null, 2)}\n`);
  }
  report.trim = { start: f3(t0), end: f3(t1) };

  // Optional room for a strip opener / closer: silence on the voice, the first / last frame held.
  const intro = Math.max(0, Number(opts.intro ?? 0));
  const outro = Math.max(0, Number(opts.outro ?? 0));
  if (intro || outro) {
    const padded = join(assets, `${name}-voice.pad.wav`);
    await run('ffmpeg', ['-y', '-v', 'error', '-i', voice, '-af', `adelay=${Math.round(intro * 1000)}:all=1,apad=pad_dur=${outro}`, '-c:a', 'pcm_s16le', padded]);
    copyFileSync(padded, voice);
    rmSync(padded, { force: true });
    doc = { ...doc, words: doc.words.map((w) => ({ ...w, start: f3(w.start + intro), end: f3(w.end + intro) })), padded: { intro, outro } };
    writeFileSync(words, `${JSON.stringify(doc, null, 2)}\n`);
  }
  report.pad = { intro, outro };

  // Video: CFR 30 (WhatsApp-style sources are variable frame rate), upscale + clean when smaller.
  const prepV = join(assets, `${name}-prep.mp4`);
  const small = info.video.height < H && info.video.width < W;
  const vf = ['fps=30', small ? `scale=-2:${H}:flags=lanczos,hqdn3d=1.5:1.5:6:6,unsharp=5:5:0.55:5:5:0` : null,
    intro || outro ? `tpad=start_duration=${intro}:start_mode=clone:stop_duration=${outro}:stop_mode=clone` : null, 'format=yuv420p'].filter(Boolean).join(',');
  await run('ffmpeg', ['-y', '-v', 'error', ...(opts.trim ? ['-ss', String(t0), '-to', String(t1)] : []), '-i', src, '-an', '-vf', vf, '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', prepV]);
  const pv = await probe(prepV);
  report.prep = { file: `assets/${basename(prepV)}`, width: pv.video.width, height: pv.video.height, fps: f2(pv.video.fps), duration: f2(pv.duration), upscaled: small };
  const dur = f3(Math.min(pv.duration, (await probe(voice)).duration));
  report.duration = dur;

  // Scaffold index.html when it is still the template.
  const isTemplate = /src="assets\/main\.mp4"/.test(html0) || opts.scaffold;
  if (isTemplate) {
    // A re-scaffold keeps the head but not the old layer rules (rcg layer z-indexes of a former build).
    const head = html0.slice(0, html0.indexOf('  <body>')).replace(/\s*<style data-rcg="layers">[\s\S]*?<\/style>/, '');
    writeFileSync(indexPath, `${head}  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${dur}" data-width="${W}" data-height="${H}">
      <!-- Shot: one untimed wrapper; rcg camera animates it (face cues from rcg marketing-pro plan). -->
      <div id="w1" class="shot">
        <video id="v1" class="clip" src="assets/${basename(prepV)}" data-start="0" data-duration="${dur}" data-media-start="0" data-track-index="0" muted playsinline></video>
      </div>
      <!-- Voice: denoised and leveled by rcg marketing-pro prep. -->
      <audio id="voice" src="assets/${basename(voice)}" data-start="0" data-duration="${dur}" data-track-index="22"></audio>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`);
    report.scaffold = true;
  }
  writeFileSync(join(data, `mp-source-${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return { report, words: doc.words };
}

/** Noise floor: the 5th percentile of 50 ms RMS windows (dBFS), i.e. the gaps between words. */
export async function noiseFloor(file) {
  const pcm = await decodeMono(file, 16000);
  const n = 800;
  const rms = [];
  for (let i = 0; i + n <= pcm.length; i += n) {
    let s = 0;
    for (let k = i; k < i + n; k++) s += pcm[k] * pcm[k];
    rms.push(10 * Math.log10(s / n + 1e-12));
  }
  rms.sort((a, b) => a - b);
  return f2(rms[Math.floor(rms.length * 0.05)] ?? -120);
}

// ── plan: words -> clauses ────────────────────────────────────────────────────

/** Speech envelope of a file: smoothed dB per 10 ms, plus silences (runs well below the median). */
export async function speechEnvelope(voiceFile) {
  const sr = 16000;
  const pcm = await decodeMono(voiceFile, sr);
  const hop = 160; // 10 ms
  const env = [];
  for (let i = 0; i + hop <= pcm.length; i += hop) {
    let s = 0;
    for (let k = i; k < i + hop; k++) s += pcm[k] * pcm[k];
    env.push(10 * Math.log10(s / hop + 1e-10));
  }
  const sm = env.map((_, i) => { let s = 0; let n = 0; for (let j = Math.max(0, i - 2); j <= Math.min(env.length - 1, i + 2); j++) { s += env[j]; n++; } return s / n; });
  const sorted = sm.slice().sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  const silences = [];
  let run = null;
  sm.forEach((v, i) => {
    if (v < median - 15) { if (!run) run = { start: i / 100 }; run.end = (i + 1) / 100; }
    else if (run) { if (run.end - run.start >= 0.15) silences.push(run); run = null; }
  });
  if (run && run.end - run.start >= 0.15) silences.push(run);
  return { sm, median, silences };
}

const CONJ = new Set(['and', 'so', 'but', 'because', 'then', 'or', 'which', 'while', 'when', 'if']);
const SPLIT_BEFORE = new Set([...CONJ, 'to', 'for', 'with', 'that', 'who', 'where', 'into', 'from']);
const NO_SPLIT_AFTER = new Set(['a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'to', 'of', 'very', 'really']);

/**
 * Clauses: break at , ; : . ? !, at a word gap >= pause, at a silence in the audio, or before a
 * conjunction once the clause is >= 1.0 s; a clause still longer than 3.2 s splits at its largest
 * word gap near the middle (continuous speech has no silences). Beats (one hero each, "sentences" below): clauses
 * grouped into 1.5-4 s units that never cross a sentence end.
 */
export function clausesFromWords(words, { pause = RULES.pause, silences = [] } = {}) {
  const ws = words.filter((w) => String(w.text).trim()).map((w) => ({ text: String(w.text).trim(), start: +w.start, end: +w.end }));
  const silentAt = (t0, t1) => silences.some((s) => s.start <= t1 + 0.03 && s.end >= t0 - 0.03 && s.end - s.start >= 0.15);
  const clauses = [];
  let cur = [];
  ws.forEach((w, i) => {
    const next = ws[i + 1];
    cur.push(w);
    const dur = w.end - cur[0].start;
    const nextConj = next && CONJ.has(next.text.toLowerCase().replace(/[^a-z]/g, '')) && dur >= 1.0;
    const brk = /[.,;:!?]$/.test(w.text) || !next || next.start - w.end >= pause || (next && silentAt(w.end, next.start)) || nextConj;
    if (brk) {
      clauses.push({ words: cur, start: cur[0].start, end: w.end, sentenceEnd: /[.!?]$/.test(w.text) || !next });
      cur = [];
    }
  });
  // Long clauses: split at the largest word gap in their middle half, until none is over 3.2 s.
  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    if (c.end - c.start <= 3.2 || c.words.length < 4) continue;
    let best = null;
    for (let k = 1; k < c.words.length; k++) {
      const t0 = c.words[k].start;
      if (t0 - c.start < (c.end - c.start) * 0.25 || c.end - t0 < (c.end - c.start) * 0.25) continue;
      // Prefer a gap before a function word ("to use", "for you") and never after a determiner
      // ("this | system").
      const lw = (x) => String(x.text).toLowerCase().replace(/[^a-z']/g, '');
      const gap = t0 - c.words[k - 1].end + (SPLIT_BEFORE.has(lw(c.words[k])) ? 0.2 : 0) - (NO_SPLIT_AFTER.has(lw(c.words[k - 1])) ? 0.5 : 0);
      if (!best || gap > best.gap) best = { k, gap };
    }
    if (!best) continue;
    const a = c.words.slice(0, best.k);
    const b = c.words.slice(best.k);
    clauses.splice(i, 1, { words: a, start: a[0].start, end: a[a.length - 1].end, sentenceEnd: false }, { words: b, start: b[0].start, end: c.end, sentenceEnd: c.sentenceEnd });
    i--;
  }
  const sentences = [];
  let s = [];
  const close = () => { if (s.length) sentences.push({ clauses: s, start: s[0].start, end: s[s.length - 1].end, words: s.flatMap((x) => x.words) }); s = []; };
  for (const c of clauses) {
    if (s.length && c.end - s[0].start > 4 && s[s.length - 1].end - s[0].start >= 1.5) close();
    s.push(c);
    if (c.sentenceEnd || c.end - s[0].start >= 1.5) close();
  }
  close();
  // A beat shorter than 0.9 s joins the one before it.
  for (let i = sentences.length - 1; i > 0; i--) {
    if (sentences[i].end - sentences[i].start < 0.9) {
      const p = sentences[i - 1];
      p.clauses.push(...sentences[i].clauses); p.words.push(...sentences[i].words); p.end = sentences[i].end;
      sentences.splice(i, 1);
    }
  }
  return { words: ws, clauses, sentences };
}

/** Snap each clause start to the speech onset (largest energy rise) within +-snap s. */
export function snapOnsets(clauses, envelope, { snap = RULES.snap } = {}) {
  const sm = envelope.sm;
  return clauses.map((c) => {
    const a = Math.max(1, Math.floor((c.start - snap) * 100));
    const b = Math.min(sm.length - 4, Math.ceil((c.start + snap) * 100));
    let best = null;
    for (let i = a; i <= b; i++) {
      const rise = sm[i + 3] - sm[i - 1];
      if (!best || rise > best.rise) best = { i, rise };
    }
    const snapped = best && best.rise >= 6 ? f3(best.i / 100) : c.start;
    return { ...c, onset: snapped, snapped: snapped !== c.start };
  });
}

// ── plan: hero keywords ───────────────────────────────────────────────────────

const STOP = new Set('a an the and or but so to of in on at for with by from as is are was were be been being i me my we our you your he she it they them this that these those there here what which who whom when where why how all any some can could will would shall should do does did have has had not just very really also than then into over out up down about only own same such too more most other its their his her am im ive id youre'.split(' '));
const NEGATION = new Set(["not", "never", "no", "nothing", "don't", "dont", "won't", "wont", "can't", "cant", "isn't", "isnt", "aren't", "arent", "doesn't", "doesnt", "nobody", "none", "without"]);
const CONTRAST = new Set(['but', 'however', 'yet', 'instead', 'actually', 'although', 'though']);
const EMOTION = new Set(['honored', 'honoured', 'love', 'grateful', 'thank', 'thanks', 'family', 'heart', 'proud', 'dream', 'together', 'trust', 'care', 'happy', 'excited', 'blessed', 'forever']);
const POWER = new Set(['best', 'top', 'free', 'transparency', 'results', 'success', 'investment', 'guaranteed', 'exclusive', 'secret', 'proven', 'expert', 'system', 'engineer', 'growth', 'million', 'first', 'only', 'whatever', 'everything', 'built', 'integrity', 'character', 'visible', 'maximum', 'internal', 'skills', 'strategy', 'exposure', 'quality', 'premium', 'fast', 'easy', 'simple', 'today', 'now']);
const CTA = /\b(link|bio|follow|subscribe|call|dm|message|book|visit|click|comment|share)\b/i;
// Fill heroes (reference Video-54041): scarcity words in solid red, action / value words in gold.
const URGENCY = new Set(['limited', 'full', 'last', 'hurry', 'deadline', 'capacity', 'sold', 'ends', 'closing', 'spots', 'urgent']);
const GOLD = new Set(['start', 'started', 'starting', 'sign', 'link', 'join', 'launch', 'win', 'gold', 'free', 'best', 'night', 'success', 'money', 'spot', 'reserve', 'premium', 'exclusive', 'today']);
const clean = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}'%$-]+/gu, '');

/** Pick one hero per sentence: { words: [i..j] in the sentence, role }. */
export function pickHero(sentence, { first = false, last = false, exclude = new Set(), urgency = false } = {}) {
  const ws = sentence.words;
  let best = null;
  ws.forEach((w, i) => {
    const t = clean(w.text);
    if (!t || exclude.has(t.replace(/[^\p{L}\p{N}%$]/gu, ''))) return;
    let score = 0;
    let role = 'wide';
    if (/\d|%|\$/.test(t) || ['percent', 'million', 'thousand', 'hundred', 'billion'].includes(t)) { score += 5; role = 'neon'; }
    else if (NEGATION.has(t)) { score += 4.5; role = 'strike'; }
    else if (urgency && URGENCY.has(t)) { score += 4.2; role = 'alert'; }
    else if (CONTRAST.has(t) && (i === 0 || /,$/.test(ws[i - 1]?.text || ''))) { score += 4; role = 'focus'; }
    else if (EMOTION.has(t)) { score += 3.5; role = 'italic'; }
    else if (/^\p{Lu}/u.test(w.text) && t.length >= 2 && i > 0 && t !== 'i' && !/[.!?]$/.test(ws[i - 1]?.text || '')) { score += 3; role = 'serif-caps'; }
    else if (POWER.has(t)) score += 2.5;
    else if (!STOP.has(t) && t.length >= 7) score += 1.5;
    else if (!STOP.has(t) && t.length >= 4) score += 0.5;
    else return;
    score += i / (ws.length * 10); // later in the sentence breaks ties (the payoff word)
    if (!best || score > best.score) best = { i, score, role };
  });
  if (!best) best = { i: 0, score: 0, role: 'wide' };
  let a = best.i;
  let b = best.i;
  const tA = (k) => clean(ws[k]?.text || '');
  if (best.role === 'neon') {
    while (b + 1 < ws.length && /^[%$]|^percent$/.test(tA(b + 1))) b++;
    if (a > 0 && POWER.has(tA(a - 1))) a--;
  } else if (best.role === 'strike') {
    if (a > 0 && ['is', 'are', 'was', 'do', 'does', 'did', 'will', 'can'].includes(tA(a - 1))) a--;
  } else if (best.role === 'serif-caps') {
    while (b + 1 < ws.length && /^\p{Lu}/u.test(ws[b + 1].text)) b++;
  }
  let role = best.role;
  if (first && role === 'wide') role = 'serif-caps';
  if (last && role === 'wide') role = 'italic';
  return { a, b, role, score: f2(best.score) };
}

// ── plan: camera ──────────────────────────────────────────────────────────────

/** The face-cue camera from clause onsets: events, levels and drift cues (seeded). */
export function planCamera(clauses, sentences, heroes, { duration, seed = 1, maxPunch = RULES.punch, overrides = {} } = {}) {
  const rnd = mulberry32(seed * 7919 + 13);
  const R = RULES;
  const beatFirst = new Set(sentences.map((s) => s.clauses[0]));
  const cands = clauses.map((c, ci) => ({ t: Math.max(0, f3(c.onset - R.lead)), clause: ci, sentenceStart: ci === 0 || beatFirst.has(c) }));
  const events = [];
  for (const c of cands) {
    const last = events[events.length - 1];
    if (!last || c.t - last.t >= R.minGap) events.push({ ...c });
    else if (c.sentenceStart && !last.sentenceStart) events[events.length - 1] = { ...c }; // prefer sentence starts
  }
  // Fill long gaps at the largest word pause inside them.
  const words = clauses.flatMap((c) => c.words);
  const filled = [];
  for (let i = 0; i < events.length; i++) {
    filled.push(events[i]);
    const end = i + 1 < events.length ? events[i + 1].t : Math.min(duration, words[words.length - 1].end);
    let from = events[i].t;
    while (end - from > R.maxGap) {
      const inside = words.filter((w) => w.start - R.lead > from + R.minGap && w.start - R.lead < end - R.minGap * 0.7);
      if (!inside.length) break;
      const pick = inside.reduce((p, w) => { const k = words.indexOf(w); const gap = k > 0 ? w.start - words[k - 1].end : 0; return !p || gap > p.gap ? { w, gap } : p; }, null);
      const t = f3(pick.w.start - R.lead);
      filled.push({ t, clause: null, sentenceStart: false, mid: true });
      from = t;
    }
  }
  filled.sort((x, y) => x.t - y.t);
  // Levels: alternate base and wide; punches on strong sentence starts.
  // Strong beats get the punch: a stat, negation or contrast hero, the CTA, else the best-scoring
  // beat (score >= 2.5) in each 8 s stretch. Never the opening beat.
  const strong = new Set(heroes.filter((h) => h.sentence > 0 && (['neon', 'strike', 'focus'].includes(h.look) || h.cta)).map((h) => h.sentence));
  for (const h of heroes.slice().sort((x, y) => y.score - x.score)) {
    if (h.sentence === 0 || h.score < 2.5 || strong.has(h.sentence)) continue;
    const t0 = sentences[h.sentence].start;
    if ([...strong].every((si) => Math.abs(sentences[si].start - t0) >= R.punchEvery)) strong.add(h.sentence);
  }
  let level = R.base;
  let lastPunch = -Infinity;
  let sIdx = -1;
  const sentenceOf = (t) => sentences.findIndex((s) => t + R.lead + 0.2 >= s.start && t + R.lead <= s.end + 0.05);
  const evs = filled.map((e, i) => {
    sIdx = sentenceOf(e.t);
    let kind = 'zoom';
    let z;
    if (i === 0) z = R.base;
    else if (e.sentenceStart && strong.has(sIdx) && e.t - lastPunch >= R.punchEvery && level !== maxPunch) { kind = 'punch'; z = maxPunch; lastPunch = e.t; }
    else z = level === R.base ? R.wide : R.base;
    level = z;
    const zz = overrides[i] != null ? overrides[i] : z;
    return { at: e.t, kind, z: zz, nominal: z, sentence: sIdx, mid: Boolean(e.mid) };
  });
  // Face cues: an opening slow push, each event, then a linear drift to the next event.
  const cues = [];
  const first = evs[0];
  const S = R.subject;
  cues.push({ at: 0, move: 'face.zoom', z: R.wide, x: S.x, y: S.y, k: 1, d: 0, ease: 'linear' });
  if (first && first.at > 0.4) cues.push({ at: 0.001, move: 'face.zoom', z: f3(R.wide * 1.06), x: S.x, y: S.y, k: 1, d: f3(first.at - 0.001), ease: 'linear' });
  evs.forEach((e, i) => {
    const d = e.kind === 'punch' ? 0 : R.zoomD;
    cues.push({ at: e.at, move: e.kind === 'punch' ? 'face.punch' : 'face.zoom', z: e.z, x: S.x, y: S.y, k: 1, d, ease: R.zoomEase });
    const dStart = f3(e.at + d);
    const dEnd = i + 1 < evs.length ? evs[i + 1].at : duration;
    if (dEnd - dStart > 0.2) {
      const grow = R.drift[0] + rnd() * (R.drift[1] - R.drift[0]);
      cues.push({
        at: dStart, move: 'face.zoom', z: f3(e.z * (1 + grow)),
        x: f3(S.x + (rnd() * 2 - 1) * R.driftX), y: f3(S.y + (rnd() * 2 - 1) * R.driftY), k: 1,
        d: f3(dEnd - dStart), ease: 'linear',
      });
    }
  });
  return { events: evs, cues };
}

export const cueSpec = (c) => `${c.at}:${c.move}:z=${c.z}:x=${c.x}:y=${c.y}:k=${c.k}:d=${c.d}:ease=${c.ease}`;

/** Simulate the camera exactly as rcg camera will (face-reframe.js) for reach and placement. */
export function simulator(track, cues, { W, H }) {
  const k = Math.max(W / track.width, H / track.height);
  const dw = track.width * k;
  const dh = track.height * k;
  const uncrop = dw > W + 0.5 || dh > H + 0.5;
  const map = { W, H, dw, dh, cw: uncrop ? dw : W, ch: uncrop ? dh : H };
  const path = subjectPath(track, { anchor: 'face', smooth: 0.25 });
  const clip = { start: 0, mediaStart: 0 };
  const fi = (t) => Math.max(0, Math.min(track.face.cx.length - 1, Math.round((t - (track.start || 0)) * track.fps)));
  return {
    map,
    at(t) {
      const st = Reframe.stateAt(cues, t);
      const r = Reframe.reframe(cues, t, path, map, clip);
      const i = fi(t);
      const fw = (track.face.w[i] ?? 0.1) * dw;
      const fh = (track.face.h[i] ?? 0.1) * dh;
      // Screen position of a cover-space point p (relative to the centre): C + T + z*p.
      const sx = W / 2 + r.tx + r.z * r.subject[0];
      const sy = H / 2 + r.ty + r.z * r.subject[1];
      return { t, z: r.z, tx: r.tx, ty: r.ty, st, face: { x: sx, y: sy, w: fw * r.z, h: fh * r.z }, target: { x: st.x * W, y: st.y * H } };
    },
    /** Source-pixel rect behind a screen rect at time t (for tone sampling). */
    sourceRect(t, box, srcW, srcH) {
      const r = Reframe.reframe(cues, t, path, map, clip);
      const toQ = (sx, sy) => [(sx - W / 2 - r.tx) / r.z, (sy - H / 2 - r.ty) / r.z];
      const [qx0, qy0] = toQ(box.x, box.y);
      const [qx1, qy1] = toQ(box.x + box.w, box.y + box.h);
      const ox = (map.cw - W) / 2;
      const sxf = srcW / map.cw;
      const syf = srcH / map.ch;
      const x0 = Math.max(0, Math.round((qx0 + W / 2 + ox) * sxf));
      const y0 = Math.max(0, Math.round((qy0 + H / 2 + (map.ch - H) / 2) * syf));
      const x1 = Math.min(srcW, Math.round((qx1 + W / 2 + ox) * sxf));
      const y1 = Math.min(srcH, Math.round((qy1 + H / 2 + (map.ch - H) / 2) * syf));
      return { x: x0, y: y0, w: Math.max(4, x1 - x0), h: Math.max(4, y1 - y0) };
    },
  };
}

/** Median luminance (0-255) of a source rect at time t, from the prepped clip. */
async function luminanceAt(video, t, rect) {
  const buf = await runBuffer(['-v', 'error', '-ss', String(f3(t)), '-i', video, '-frames:v', '1', '-vf', `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},scale=48:-2`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const a = Array.from(buf).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 128;
}

// ── plan ──────────────────────────────────────────────────────────────────────

export async function plan(opts) {
  const jobDir = resolve(opts.job);
  const J = jobRel(jobDir);
  const name = opts.name || 'main';
  const seed = Number(opts.seed ?? 1);
  const maxPunch = Number(opts['max-punch'] ?? RULES.punch);
  const behind = String(opts.behind ?? 'true') !== 'false';
  const html = readFileSync(join(jobDir, 'index.html'), 'utf8');
  const root = rootGeometry(html);
  const W = root.width;
  const H = root.height;
  const D = root.duration;
  const source = readJson(join(jobDir, 'data', `mp-source-${name}.json`));
  const video = join(jobDir, source.prep.file);
  const voice = join(jobDir, 'assets', `${name}-voice.wav`);
  const words = readJson(join(jobDir, 'data', 'words.json')).words;
  const warnings = [];

  // Track the prepped clip (face), once.
  const trackFile = join(jobDir, 'data', `track-${name}.json`);
  if (!existsSync(trackFile)) {
    execFileSync(process.execPath, ['tools/rcg.mjs', 'track', '--job', J, '--src', source.prep.file, '--name', name, '--no-hands'], { cwd: ROOT, stdio: 'inherit' });
  }
  const track = readJson(trackFile);
  const facePct = track.summary?.faceFrames / Math.max(1, track.frames);
  if (facePct < 0.8) warnings.push(`A face was found on only ${(facePct * 100).toFixed(0)}% of frames; the camera holds the last position elsewhere (check rcg track --debug).`);

  const envelope = await speechEnvelope(voice);
  const { clauses: rawClauses, sentences } = clausesFromWords(words, { silences: envelope.silences });
  const clauses = snapOnsets(rawClauses, envelope);
  sentences.forEach((s) => { s.clauses = s.clauses.map((c) => clauses[rawClauses.indexOf(c)]); });

  // Heroes: one per beat, looks by meaning, never the same look twice running. A weak beat
  // (score < 1.5) gets none unless 4 s have passed since the last hero; a word already used as a
  // hero is not used again.
  const heroes = [];
  let prevLook = null;
  const used = new Set();
  const fillHeroes = Boolean(opts['fill-heroes']);
  const clusters = Boolean(opts.clusters);
  const fills = Object.fromEntries(String(opts.fills || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.split('=').map((y) => y.trim())));
  for (const [k, f] of Object.entries(fills)) if (!existsSync(join(jobDir, f))) throw new Error(`--fills ${k}: ${f} not found in the job`);
  let prevFill = null;
  let gradTurn = 0;
  sentences.forEach((s, si) => {
    const pick = pickHero(s, { first: si === 0, last: si === sentences.length - 1, exclude: used, urgency: fillHeroes });
    const lastHero = heroes[heroes.length - 1];
    if (pick.score < 1.5 && lastHero && s.start - lastHero.start < 4) return;
    let look = pick.role;
    const ORDER = ['wide', 'serif-caps', 'italic'];
    if (look === 'alert') look = 'fill';
    else if (look === prevLook) look = ORDER.find((l) => l !== prevLook && l !== pick.role) || 'wide';
    const kw = s.words.slice(pick.a, pick.b + 1);
    // Fill heroes: every look but strike becomes a filled word; the fill follows the meaning
    // (urgency red, action / value gold, a name or place the photo fill, else the gradient), and
    // never the same fill twice running when another fits.
    let fill = null;
    if (fillHeroes && look !== 'strike') {
      const k0 = clean(kw[0].text).replace(/[^\p{L}\p{N}%$]/gu, '');
      let kind = pick.role === 'alert' ? 'red' : GOLD.has(k0) ? 'gold' : fills.photo && pick.a > 0 && /^\p{Lu}/u.test(kw[0].text) ? 'photo' : 'gradient';
      if (kind === prevFill && kind !== 'red') kind = kind === 'gold' ? 'gradient' : 'gold';
      prevFill = kind;
      fill = kind === 'red' ? 'red' : kind === 'gold' ? (fills.gold || 'gold') : kind === 'photo' ? fills.photo : (fills.pink && gradTurn++ % 2 ? fills.pink : 'gradient');
      look = 'fill';
    }
    prevLook = look;
    for (const w of kw) used.add(clean(w.text).replace(/[^\p{L}\p{N}%$]/gu, ''));
    let text = kw.map((w) => w.text.replace(/[,.;:!?]+$/, '')).join(' ');
    if (look === 'neon') text = text.replace(/\s+%/, '%');
    const leadSrc = s.words.slice(Math.max(0, pick.a - 3), pick.a);
    const leadWords = leadSrc.map((w) => w.text.replace(/[,.;:!?]+$/, ''));
    // Clusters: the lead line comes in on its own spoken words, the keyword on its own, and up to
    // three words after the keyword (to the clause end) trail below; those words leave the body caption.
    let tailSrc = [];
    if (clusters) for (let k = pick.b + 1; k < s.words.length && tailSrc.length < 3; k++) {
      if (/[,.;:!?]$/.test(s.words[k - 1].text) && k > pick.b + 1) break;
      tailSrc.push(s.words[k]);
      if (/[,.;:!?]$/.test(s.words[k].text)) break;
    }
    if (tailSrc.map((w) => w.text).join(' ').length > 22) tailSrc = tailSrc.slice(0, 1);
    if (/[,.;:!?]$/.test(kw[kw.length - 1].text)) tailSrc = [];
    const useLead = clusters ? (leadWords.length && leadWords.join(' ').length <= 24) : ['wide', 'italic'].includes(look) && leadWords.length;
    const lead = useLead ? leadWords.join(' ') : '';
    if (look === 'italic') text = `*${text}*`;
    const first = clusters && lead ? leadSrc[0].start : kw[0].start;
    const start = Math.max(0, f3(first - 0.05));
    const lastSpoken = (tailSrc.length ? tailSrc[tailSrc.length - 1] : kw[kw.length - 1]).end;
    const end = Math.min(Math.max(start + 2.6, lastSpoken + 0.7), D); // clamped to the next hero's start below
    heroes.push({
      sentence: si, look, text, lead, start, end: f3(end), role: pick.role, score: pick.score,
      times: look === 'serif-caps' ? kw.map((w) => f2(Math.max(0, w.start - start))).join(',') : '',
      cta: si === sentences.length - 1 && CTA.test(s.words.map((w) => w.text).join(' ')),
      ...(fill ? { fill } : {}),
      ...(clusters ? { textAt: f2(Math.max(0, kw[0].start - start)), tailWords: tailSrc.map((w) => ({ text: w.text.replace(/[,.;:!?]+$/, ''), start: w.start })), used: [...(lead ? leadSrc : []), ...kw, ...tailSrc] } : {}),
    });
  });

  for (let i = 0; i < heroes.length; i++) {
    const next = heroes[i + 1];
    let end = Math.min(heroes[i].end, next ? next.start - 0.05 : D);
    if (end - heroes[i].start < 1.2) end = Math.min(D, next ? Math.max(next.start - 0.05, heroes[i].start + 0.8) : heroes[i].start + 1.2);
    heroes[i].end = f3(end);
  }

  // Camera, then the reach fix: on base/punch segments where the clamp keeps the face more than 3%
  // of the frame from its target on over 15% of frames, raise that segment's zoom in 0.05 steps
  // (at most +0.2), re-simulating face-reframe.js each time.
  const speech = (t) => words.some((w) => t >= w.start && t <= w.end + 0.15);
  const overrides = {};
  let cam = planCamera(clauses, sentences, heroes, { duration: D, seed, maxPunch });
  const segOff = (c, i) => {
    const s0 = simulator(track, c.cues, { W, H });
    const e = c.events[i];
    const t0 = e.at + (e.kind === 'punch' ? 0 : RULES.zoomD);
    const t1 = i + 1 < c.events.length ? c.events[i + 1].at : D;
    let n = 0; let off = 0;
    for (let t = t0; t < t1; t += 1 / 15) {
      if (!speech(t)) continue;
      const s = s0.at(t); n++;
      if (Math.hypot(s.face.x - s.target.x, s.face.y - s.target.y) / H > 0.03) off++;
    }
    return n ? off / n : 0;
  };
  const fixes = [];
  for (let i = 0; i < cam.events.length; i++) {
    if (cam.events[i].nominal < RULES.base - 1e-6) continue;
    const before = segOff(cam, i);
    let share = before;
    for (let bump = 0.05; share > 0.15 && bump <= 0.2 + 1e-9; bump += 0.05) {
      overrides[i] = f2(cam.events[i].nominal + bump);
      cam = planCamera(clauses, sentences, heroes, { duration: D, seed, maxPunch, overrides });
      share = segOff(cam, i);
    }
    if (overrides[i] != null) fixes.push({ at: cam.events[i].at, from: cam.events[i].nominal, to: overrides[i], offBefore: f2(before), offAfter: f2(share) });
  }
  const { events, cues } = cam;
  const sim = simulator(track, cues, { W, H });

  // Reach: how far the clamp keeps the face from its target while z >= base, during speech.
  const reach = { frames: 0, off: 0, worst: 0 };
  for (let t = 0; t < D; t += 1 / 15) {
    const s = sim.at(t);
    if (!speech(t) || s.z < RULES.base - 1e-6) continue;
    reach.frames++;
    const dev = Math.hypot(s.face.x - s.target.x, s.face.y - s.target.y) / H;
    reach.worst = Math.max(reach.worst, dev);
    if (dev > 0.03) reach.off++;
  }
  reach.worst = f3(reach.worst);
  reach.offShare = reach.frames ? f2(reach.off / reach.frames) : 0;
  if (reach.offShare > 0.25) warnings.push(`The face is more than 3% of the frame from its target on ${(reach.offShare * 100).toFixed(0)}% of base/punch speech frames (the clamp: the source has little room there). Consider a higher base zoom for this clip.`);

  // Upscale: effective = z x max(W/srcW, H/srcH) on the ORIGINAL source (prep adds no detail).
  const cover = Math.max(W / source.source.width, H / source.source.height);
  const upscale = { wide: f2(RULES.wide * cover), base: f2(RULES.base * cover), punch: f2(maxPunch * cover) };
  if (upscale.punch > 3) warnings.push(`Punch zoom is ${upscale.punch}x the source resolution (soft). Lower it per job with --max-punch (e.g. 1.45 -> ${f2(1.45 * cover)}x).`);

  // Hero placement and tone from the simulated framing.
  const safe = { left: 64, right: 900, top: 192, bottom: 1536 };
  const hw = 720;
  for (const h of heroes) {
    const mid = (h.start + h.end) / 2;
    const s = sim.at(mid);
    const eyesY = s.face.y - s.face.h * 0.1;
    let hh = 280;
    let y = eyesY - 0.19 * H;
    y = Math.max(safe.top + hh / 2, y);
    const x = Math.max(safe.left + hw / 2, Math.min(safe.right - hw / 2, s.face.x));
    // Behind the head: keep ~60% of the word clear of the head box (hair included).
    const head = { l: s.face.x - s.face.w * 0.75, r: s.face.x + s.face.w * 0.75, t: s.face.y - s.face.h * 1.0, b: s.face.y + s.face.h * 0.6 };
    const box = { l: x - hw / 2, r: x + hw / 2, t: y - hh / 2, b: y + hh / 2 };
    const ov = Math.max(0, Math.min(box.r, head.r) - Math.max(box.l, head.l)) * Math.max(0, Math.min(box.b, head.b) - Math.max(box.t, head.t));
    const share = ov / (hw * hh);
    h.behind = behind && share <= 0.4;
    if (behind && !h.behind) warnings.push(`Hero "${h.text}" would hide ${(share * 100).toFixed(0)}% behind the head; it goes in front.`);
    h.x = Math.round(x);
    h.y = Math.round(y);
    h.w = hw;
    h.h = hh;
    // Cluster tail: split around the head when the hero sits behind it and the tail has 2+ words.
    if (h.tailWords?.length) {
      const tw = h.tailWords;
      if (h.behind && tw.length >= 2) {
        const cut = Math.ceil(tw.length / 2);
        h.tail = `${tw.slice(0, cut).map((w) => w.text).join(' ')}|${tw.slice(cut).map((w) => w.text).join(' ')}`;
        h.gap = Math.round(Math.min(hw * 0.5, s.face.w * 1.5));
        h.tailAt = [tw[0], tw[cut]].map((w) => f2(Math.max(0, w.start - h.start))).join(',');
      } else {
        h.tail = tw.map((w) => w.text).join(' ');
        h.gap = 0;
        h.tailAt = f2(Math.max(0, tw[0].start - h.start)).toString();
      }
    }
    const rect = sim.sourceRect(mid, { x: box.l, y: box.t, w: hw, h: hh }, source.prep.width, source.prep.height);
    h.bg = await luminanceAt(video, mid, rect);
    h.tone = h.bg > 140 ? 'dark' : 'light';
  }

  // Negative heroes (opt-in, --negative-heroes N): up to N heroes already behind the head become
  // inverted keyword captions (rcg captions --negative --behind p1). Only where the background is far
  // from mid-grey (|luminance - 128| >= 60): a difference blend over mid-grey all but vanishes. The
  // strongest backgrounds first, never two in a row.
  const nNeg = Math.max(0, Number(opts['negative-heroes'] ?? 0));
  if (nNeg) {
    const cands = heroes.map((h, i) => ({ h, i, d: Math.abs(h.bg - 128) })).filter((c) => c.h.behind && c.d >= 60).sort((a, b) => b.d - a.d);
    for (const c of cands) {
      if (heroes.filter((h) => h.negative).length >= nNeg) break;
      if (heroes[c.i - 1]?.negative || heroes[c.i + 1]?.negative) continue;
      c.h.negative = true;
    }
    const got = heroes.filter((h) => h.negative).length;
    if (got < nNeg) warnings.push(`--negative-heroes ${nNeg}: only ${got} hero(es) sit behind the head on a background far enough from mid-grey (and not next to another negative one).`);
  }

  // Body caption text controls (rcg captions --hollow / --rgb / --shadow). Negative is refused here:
  // the body caption sits in front of the chest, and negative text goes behind the subject.
  const fxList = String(opts['caption-fx'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const badFx = fxList.filter((f) => !['hollow', 'rgb', 'shadow'].includes(f));
  if (badFx.includes('negative')) throw new Error('--caption-fx negative is not allowed: body captions sit in front of the body. Use --negative-heroes N for inverted words behind the head.');
  if (badFx.length) throw new Error(`--caption-fx takes hollow, rgb, shadow (got ${badFx.join(', ')})`);
  const capFx = fxList.length ? {
    hollow: fxList.includes('hollow'), rgb: fxList.includes('rgb'),
    shadow: fxList.includes('shadow') ? { angle: Number(opts['caption-shadow-angle'] ?? 45), dist: Number(opts['caption-shadow-dist'] ?? 4) } : null,
  } : null;

  // Photo cards (--cards "word:img,..."): on the first time the word is spoken, 2.4 s, beside the
  // head below the hero band, on the side with more room, behind the cut-out.
  const cards = [];
  for (const spec of String(opts.cards || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const [word, src] = spec.split(':').map((x) => x.trim());
    if (!src || !existsSync(join(jobDir, src))) throw new Error(`--cards ${spec}: the image is missing in the job`);
    const w = words.find((x) => clean(x.text).replace(/[^\p{L}\p{N}]/gu, '') === word.toLowerCase());
    if (!w) { warnings.push(`--cards: "${word}" is not spoken; card skipped.`); continue; }
    const start = f3(Math.max(0, w.start - 0.1));
    const dur = f3(Math.min(2.4, D - start - 0.05));
    const sAt = sim.at(start + dur / 2);
    const cw = 340; const ch = 420;
    const side = sAt.face.x >= W / 2 ? 'left' : 'right';
    const x = side === 'left' ? safe.left + cw / 2 : safe.right - cw / 2;
    const band = heroes.find((h) => h.start < start + dur && h.end > start);
    const y = Math.round(Math.min(safe.bottom - ch / 2 - 300, Math.max(safe.top + ch / 2, (band ? band.y + band.h / 2 : sAt.face.y - ch / 2) + ch / 2 + 10)));
    cards.push({ word, src, start, duration: dur, x: Math.round(x), y, w: cw, h: ch, side: side === 'left' ? 'right' : 'left' });
  }

  // Body caption: chest height below the chin at the tightest framing; tone from the chest area.
  const capY = Number(opts['caption-y']) || Math.round(0.56 * H);
  const lums = [];
  for (const s of sentences) {
    const t = (s.start + s.end) / 2;
    lums.push(await luminanceAt(video, t, sim.sourceRect(t, { x: 240, y: capY - 60, w: 600, h: 120 }, source.prep.width, source.prep.height)));
  }
  lums.sort((a, b) => a - b);
  const capLum = lums[Math.floor(lums.length / 2)] ?? 100;
  const captionStyle = capLum > 140 ? 'mp-body-dark' : 'mp-body';

  // Optional bloom flashes at strong sentence starts (never at the first).
  const blooms = [];
  const nb = Number(opts.bloom ?? (D > 15 ? 1 : 0));
  for (const e of events.filter((x) => x.kind === 'punch' || (x.sentence > 0 && !x.mid))) {
    if (blooms.length >= nb) break;
    if (blooms.length && e.at - blooms[blooms.length - 1] < 15) continue;
    if (e.sentence > 0) blooms.push(e.at);
  }

  // Mirror whips (--whips N): at sentence starts (the cut between beats, as in the reference), 3 s
  // apart, not within 1 s of a bloom; plus one at the end of a strip opener. The hero before a
  // whip ends 0.2 s before it, so the words clear first. Directions alternate up / left.
  const pad = source.pad || { intro: 0, outro: 0 };
  const whips = [];
  const nWhip = Math.max(0, Number(opts.whips ?? 0));
  const near = (t, list, gap) => list.some((x) => Math.abs(x - t) < gap);
  const whipCands = sentences.slice(1).map((x) => f3(x.start - 0.05));
  for (const t of whipCands) {
    if (whips.length >= nWhip) break;
    if (t <= pad.intro + 0.5 || t >= D - pad.outro - 0.5 || near(t, whips.map((w) => w.at), 3) || near(t, blooms, 1)) continue;
    // Never cut a hero so its main word shows for under 1 s.
    if (heroes.some((h) => h.start < t && h.end > t - 0.2 && t - 0.2 - (h.start + (h.textAt || 0)) < 1.0)) continue;
    whips.push({ at: f3(t) });
  }
  const stripClips = String(opts.strips || '').trim();
  if (stripClips && pad.intro >= 1) whips.push({ at: f3(pad.intro) });
  whips.sort((a, b) => a.at - b.at).forEach((w, i) => { w.dir = i % 2 ? 'left' : 'up'; w.d = 0.32; });
  for (const w of whips) for (const h of heroes) if (h.start < w.at && h.end > w.at - 0.2) h.end = f3(Math.max(h.start + 0.8, w.at - 0.2));
  if (stripClips && !(pad.intro >= 1 || pad.outro >= 1)) warnings.push('--strips needs room: prep with --intro / --outro (seconds) first; no strips planned.');
  const strips = stripClips && (pad.intro >= 1 || pad.outro >= 1) ? {
    clips: stripClips, leak: opts.leak || null,
    ...(pad.intro >= 1 ? { open: { start: 0, duration: pad.intro } } : {}),
    ...(pad.outro >= 1 ? { close: { start: f3(D - pad.outro), duration: pad.outro } } : {}),
  } : null;
  if (opts.leak && !existsSync(join(jobDir, opts.leak))) throw new Error(`--leak ${opts.leak} not found in the job`);
  // Sounds: a whoosh on each whip (crest on the cut), a soft click per opener strip, a cinematic
  // whoosh on the closer's flash. Placed by the measured crest (library/sfx/manifest.json).
  const sfx = whips.map((w, i) => ({ id: `whip${i + 1}-sfx`, name: 'whoosh-short', at: w.at, volume: 0.16 }));
  if (strips?.open) parseStripCount(stripClips).forEach((_, i) => sfx.push({ id: `strip${i + 1}-sfx`, name: 'click-soft', at: f3(0.05 + i * 0.53), volume: 0.12 }));
  if (strips?.close) sfx.push({ id: 'close-sfx', name: 'whoosh-cinematic', at: f3(strips.close.start + Math.min(0.4, pad.outro * 0.15)), volume: 0.16 });
  const music = opts.music ? { src: opts.music, limited: `assets/music-limited.wav`, volume: Number(opts['music-volume'] ?? 0.5), duck: Number(opts.duck ?? 0.35) } : null;
  if (music && !existsSync(join(jobDir, music.src))) throw new Error(`--music ${music.src} not found in the job`);

  // Style plan (one host per hero, so each can be layered on its own). Negative heroes are caption
  // blocks instead (build), with one words file each: the keyword as a single entry, held for the
  // hero window (the caption group adds a 0.35 s hold). Word times are relative to the hero start.
  const items = heroes.map((h, i) => (h.negative ? null : {
    component: 'hero', id: `hero${i + 1}`, start: h.start, duration: f3(h.end - h.start),
    text: h.text, lead: h.lead, look: h.look, tone: h.tone, accent: i % 2 ? 'teal' : 'purple',
    x: h.x, y: h.y, w: h.w, h: h.h, ...(h.times ? { times: h.times } : {}),
    ...(h.fill ? { fill: h.fill } : {}),
    ...(h.textAt != null ? { textAt: h.textAt } : {}),
    ...(h.tail ? { tail: h.tail, gap: h.gap, tailAt: h.tailAt } : {}),
  })).filter(Boolean);
  cards.forEach((c, i) => items.push({ component: 'card', id: `card${i + 1}`, start: c.start, duration: c.duration, src: c.src, x: c.x, y: c.y, w: c.w, h: c.h, side: c.side }));
  heroes.forEach((h, i) => {
    if (!h.negative) return;
    const text = h.text.replace(/\*/g, '').toUpperCase();
    writeFileSync(join(jobDir, 'data', `words-hero${i + 1}.json`), `${JSON.stringify({ words: [{ text, start: 0, end: f3(Math.max(0.3, h.end - h.start - 0.35)) }] }, null, 2)}\n`);
  });
  const last = sentences[sentences.length - 1];
  if (heroes[heroes.length - 1]?.cta) {
    const ctaText = last.words.map((w) => w.text).join(' ').replace(/[.!?]+$/, '');
    items.push({ component: 'cta', id: 'cta1', start: f3(last.start), duration: f3(Math.max(1.2, D - last.start - 0.05)), text: ctaText.length <= 34 ? ctaText : 'Link in my bio', y: 1380 });
  }
  writeFileSync(join(jobDir, 'data', 'style-plan.json'), `${JSON.stringify({ style: 'marketing-pro', items }, null, 2)}\n`);

  // Beat sheet: one row per sentence (the approval table).
  const beatSheet = {
    version: 1, title: `Marketing Pro: ${basename(jobDir)}`, mode: opts.mode || undefined,
    format: { width: W, height: H, fps: 30, duration: D },
    summary: `Promo reframe of ${source.src}: ${events.length} camera events, ${heroes.length} hero keywords, ${captionStyle} captions.`,
    beats: sentences.map((s, si) => {
      const h = heroes.find((x) => x.sentence === si);
      const evIn = events.filter((e) => e.sentence === si).map((e) => `${e.kind === 'punch' ? 'punch' : 'zoom'} ${e.z}x @${e.at}`);
      return {
        start: f3(si === 0 ? 0 : s.start - RULES.lead), end: f3(si + 1 < sentences.length ? sentences[si + 1].start - RULES.lead : D),
        words: s.words.map((w) => w.text).join(' '),
        onScreen: `Camera: ${evIn.join(', ') || 'drift'}. ${h ? `Hero "${h.text.replace(/\*/g, '')}" (${h.negative ? 'negative, inverted' : `${h.look}, ${h.tone} text`}, ${h.behind ? 'behind the head' : 'in front'}).` : 'No hero (weak beat).'}`,
        text: h ? [{ content: h.text.replace(/\*/g, ''), position: 'custom', at: h.start, box: { x: Math.round(h.x - h.w / 2), y: Math.round(h.y - h.h / 2), w: h.w, h: h.h } }] : [],
        sound: 'voice',
      };
    }),
    notes: [
      `Words from data/words.json (correct them before building).`,
      `Upscale at wide / base / punch: ${upscale.wide}x / ${upscale.base}x / ${upscale.punch}x.`,
      ...warnings,
    ],
  };
  if (beatSheet.beats.length) beatSheet.beats[0].start = 0;
  const problems = validateBeatSheet(beatSheet);
  writeFileSync(join(jobDir, 'beat-sheet.json'), `${JSON.stringify(beatSheet, null, 2)}\n`);

  const mp = {
    version: 1, name, seed, rules: { ...RULES, punch: maxPunch }, duration: D,
    clauses: clauses.map((c) => ({ start: c.start, onset: c.onset, snapped: c.snapped, end: c.end, text: c.words.map((w) => w.text).join(' ') })),
    events, cues: cues.map(cueSpec), heroes, caption: { style: captionStyle, y: capY, luminance: capLum, ...(capFx ? { fx: capFx } : {}) },
    blooms, behind: behind && heroes.some((h) => h.behind), reach, reachFixes: fixes, upscale, warnings,
    cards, whips, strips, sfx, music, pad, sentences: sentences.map((x) => ({ start: x.start, end: x.end })),
  };
  writeFileSync(join(jobDir, 'data', 'mp-plan.json'), `${JSON.stringify(mp, null, 2)}\n`);
  // Caption words with the planner's clause breaks (brk), so the tier groups follow the beats.
  const ends = new Set(clauses.map((c) => c.words[c.words.length - 1]));
  const inCluster = new Set(heroes.flatMap((h) => h.used || []));
  const capWords = clauses.flatMap((c) => c.words).filter((w) => !inCluster.has(w)).map((w) => ({ text: w.text, start: w.start, end: w.end, ...(ends.has(w) ? { brk: true } : {}) }));
  for (const h of heroes) delete h.used;
  writeFileSync(join(jobDir, 'data', 'words-captions.json'), `${JSON.stringify({ words: capWords }, null, 2)}\n`);
  return { mp, problems, warnings };
}

/** Clip count of a --strips spec. */
function parseStripCount(spec) { return String(spec || '').split(',').map((x) => x.trim()).filter(Boolean); }

// ── audio: music bed + sounds from the plan ───────────────────────────────────

/** Writes the music bed (ducked under each sentence) and the plan's sounds into index.html. */
export async function writeAudio(jobDir) {
  const mp = readJson(join(jobDir, 'data', 'mp-plan.json'));
  const indexPath = join(jobDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  html = html.replace(/\s*<!-- rcg:mp-audio begin[\s\S]*?<!-- rcg:mp-audio end -->/, '');
  const manifest = readJson(join(ROOT, 'library', 'sfx', 'manifest.json'));
  const parts = [];
  if (mp.music) {
    if (!existsSync(join(jobDir, mp.music.limited))) throw new Error(`${mp.music.limited} is missing: run rcg limit first (build does)`);
    // A bed shorter than the edit loops (back to back) to cover it.
    let bed = mp.music.limited;
    const len = (await probe(join(jobDir, bed))).duration;
    if (len < mp.duration - 0.05) {
      bed = bed.replace(/\.wav$/, '-loop.wav');
      await run('ffmpeg', ['-y', '-v', 'error', '-stream_loop', '-1', '-i', join(jobDir, mp.music.limited), '-t', String(mp.duration), '-c:a', 'pcm_s16le', join(jobDir, bed)]);
    }
    const lane = musicLane({
      total: mp.duration, fadeIn: 0.3, fadeOut: 0.8, volume: mp.music.volume,
      ducks: mp.sentences.map((x) => ({ start: x.start, duration: x.end - x.start })), duckLevel: mp.music.duck,
    });
    parts.push(`<audio id="music" src="${bed}" data-start="0" data-duration="${mp.duration}" data-media-start="0" data-track-index="21" data-automation='${JSON.stringify({ version: 1, lanes: [{ target: 'volume', points: lane }] })}'></audio>`);
  }
  // Lanes 50-57 (the style pack's own sounds use 40-47): no two overlapping clips on one track.
  const lanes = [];
  for (const x of mp.sfx || []) {
    const e = manifest[x.name];
    if (!e) throw new Error(`sfx "${x.name}" is not in library/sfx/manifest.json`);
    mkdirSync(join(jobDir, 'assets', 'sfx'), { recursive: true });
    if (!existsSync(join(jobDir, 'assets', 'sfx', e.file))) copyFileSync(join(ROOT, 'library', 'sfx', e.file), join(jobDir, 'assets', 'sfx', e.file));
    const start = f3(Math.max(0, x.at - (e.crestStartS ?? e.peakS ?? 0)));
    const dur = f3(Math.min(e.durationS ?? e.duration ?? 1, mp.duration - start));
    let lane = lanes.findIndex((end) => end <= start + 1e-3);
    if (lane < 0) { lane = lanes.length; lanes.push(0); }
    if (lane > 7) throw new Error('more than 8 overlapping sounds');
    lanes[lane] = start + dur;
    parts.push(`<audio id="${x.id}" src="assets/sfx/${e.file}" data-start="${start}" data-duration="${dur}" data-volume="${x.volume}" data-track-index="${50 + lane}"></audio>`);
  }
  if (parts.length) {
    const rootEnd = html.lastIndexOf('</div>', html.lastIndexOf('<script>'));
    html = `${html.slice(0, rootEnd)}  <!-- rcg:mp-audio begin (music bed and sounds, tools/recipes/marketing-pro.mjs audio) -->\n      ${parts.join('\n      ')}\n      <!-- rcg:mp-audio end -->\n    ${html.slice(rootEnd)}`;
  }
  writeFileSync(indexPath, html);
  return { music: Boolean(mp.music), sounds: (mp.sfx || []).length };
}

// ── commands / build ──────────────────────────────────────────────────────────

export function buildCommands(jobDir) {
  const J = jobRel(jobDir);
  const mp = readJson(join(jobDir, 'data', 'mp-plan.json'));
  const source = readJson(join(jobDir, 'data', `mp-source-${mp.name}.json`));
  const cmds = [];
  // Blooms from an earlier plan that this one dropped: their scripts point at wrappers the PNP rebuild removes.
  const keep = new Set(mp.blooms.map((_, i) => `bloom${i + 1}`));
  const html = readFileSync(join(jobDir, 'index.html'), 'utf8');
  for (const id of transitionIds(html)) if (/^bloom\d+$/.test(id) && !keep.has(id)) cmds.push(rcg('transition', '--job', J, '--remove', id));
  cmds.push(rcg('style', 'apply', '--job', J, '--style', 'marketing-pro'));
  cmds.push(rcg('camera', '--job', J, '--target', '#w1', '--track', `data/track-${mp.name}.json`, '--id', 'cam-w1', ...mp.cues.flatMap((c) => ['--cue', c])));
  if (mp.behind) {
    if (!existsSync(join(jobDir, 'assets', 'matte', `${mp.name}-fg.webm`))) {
      cmds.push(rcg('matte', '--job', J, '--src', source.prep.file, '--name', mp.name, '--choke', 6, '--sheet'));
    }
    cmds.push(rcg('pnp', '--job', J, '--base', '#v1', '--cutout', `assets/matte/${mp.name}-fg.webm`, '--id', 'p1', '--enter', 'none', '--exit', 'none'));
  }
  cmds.push(rcg('style', 'build', '--job', J, '--spec', `${J}/data/style-plan.json`, '--sfx', '--insert'));
  const fx = mp.caption.fx;
  const fxArgs = fx ? [
    ...(fx.hollow ? ['--hollow'] : []), ...(fx.rgb ? ['--rgb'] : []),
    ...(fx.shadow ? ['--shadow', '--shadow-angle', fx.shadow.angle, '--shadow-dist', fx.shadow.dist] : []),
  ] : [];
  cmds.push(rcg('captions', '--job', J, '--words', `${J}/data/words-captions.json`, '--style', mp.caption.style, '--mode', '2word', '--y', mp.caption.y, '--id', 'cap-body', ...fxArgs, '--insert'));
  // Negative heroes: inverted keyword captions behind the cut-out (white, heavy, no background).
  mp.heroes.forEach((h, i) => {
    if (h.negative) cmds.push(rcg('captions', '--job', J, '--words', `${J}/data/words-hero${i + 1}.json`, '--style', 'modern', '--mode', 'phrase', '--y', h.y, '--size', 150, '--id', `hero${i + 1}`, '--start', h.start, '--track', 31, '--negative', '--insert', '--behind', 'p1'));
  });
  if (mp.behind) {
    // Behind heroes go under the cut-out; front heroes need an explicit z over it (the PNP sits at z 30).
    mp.heroes.forEach((h, i) => { if (!h.negative) cmds.push(rcg('layer', '--job', J, '--id', `hero${i + 1}`, ...(h.behind ? ['--behind', 'p1'] : ['--z', 40]))); });
    cmds.push(rcg('layer', '--job', J, '--id', 'cap-body', '--z', 40));
    if (mp.heroes[mp.heroes.length - 1]?.cta) cmds.push(rcg('layer', '--job', J, '--id', 'cta1', '--z', 40));
  }
  (mp.cards || []).forEach((c, i) => { if (mp.behind) cmds.push(rcg('layer', '--job', J, '--id', `card${i + 1}`, '--behind', 'p1')); });
  mp.blooms.forEach((t, i) => cmds.push(rcg('transition', '--job', J, '--at', t, '--style', 'flash_bloom', '--to', '#w1', '--d', 0.45, '--id', `bloom${i + 1}`)));
  (mp.whips || []).forEach((w, i) => cmds.push(rcg('transition', '--job', J, '--at', w.at, '--style', 'mirror_whip', '--to', '#w1', '--d', w.d, '--dir', w.dir, '--id', `whip${i + 1}`)));
  if (mp.strips?.open) cmds.push(rcg('strips', '--job', J, '--mode', 'open', '--start', mp.strips.open.start, '--duration', mp.strips.open.duration, '--clips', mp.strips.clips, '--id', 'strips-open'));
  if (mp.strips?.close) cmds.push(rcg('strips', '--job', J, '--mode', 'close', '--start', mp.strips.close.start, '--duration', mp.strips.close.duration, '--clips', mp.strips.clips, ...(mp.strips.leak ? ['--leak', mp.strips.leak] : []), '--id', 'strips-close'));
  if (mp.music) cmds.push(rcg('limit', `${J}/${mp.music.src}`, `${J}/${mp.music.limited}`, '--ceiling', -2.5));
  if (mp.music || (mp.sfx || []).length) cmds.push(rcg('marketing-pro', 'audio', '--job', J));
  cmds.push(rcg('mix-check', `${J}/index.html`));
  cmds.push(rcg('hf', '--cwd', J, 'check'));
  return cmds;
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const cmd = a._[0];
  const fail = (m) => { console.error(m); process.exit(2); };
  try {
    if (cmd === 'prep') {
      if (!a.job || !a.src) fail('Usage: marketing-pro.mjs prep --job <dir> --src <clip> [--name main] [--trim] [--intro s] [--outro s] [--denoise 12] [--lufs -14]');
      const { report, words } = await prep({ ...a, trim: Boolean(a.trim), scaffold: Boolean(a.scaffold) });
      console.log(`Source ${report.source.width}x${report.source.height} @ ${report.source.fps} fps -> ${report.prep.file} ${report.prep.width}x${report.prep.height} @ ${report.prep.fps} fps${report.prep.upscaled ? ' (upscaled, denoised, sharpened)' : ''}`);
      console.log(`Voice: ${report.audio.before.integratedLufs} -> ${report.audio.after.integratedLufs} LUFS, true peak ${report.audio.after.truePeakDb} dBTP, noise floor ${report.audio.floorDb} dBFS (denoise nr=${report.audio.denoise})`);
      console.log(`Trim ${report.trim.start}-${report.trim.end} s; duration ${report.duration} s${report.scaffold ? '; index.html scaffolded' : ''}`);
      console.log(`Transcript (${words.length} words): ${words.map((w) => w.text).join(' ')}`);
      console.log('Next: correct data/words.json, then rcg marketing-pro plan');
    } else if (cmd === 'plan') {
      if (!a.job) fail('Usage: marketing-pro.mjs plan --job <dir> [--name main] [--seed 1] [--max-punch 1.6] [--behind true|false] [--bloom n] [--caption-y px] [--caption-fx hollow,rgb,shadow [--caption-shadow-angle 45] [--caption-shadow-dist 4]] [--negative-heroes n] [--fill-heroes] [--fills k=img,...] [--clusters] [--cards "word:img,..."] [--whips n] [--music file] [--strips "clip@s[:x],..."] [--leak video]');
      const { mp, problems } = await plan(a);
      execFileSync(process.execPath, [join(ROOT, 'tools', 'jobs', 'beat-sheet.mjs'), 'md', join(resolve(a.job), 'beat-sheet.json'), join(resolve(a.job), 'beat-sheet.md')], { stdio: 'inherit' });
      console.log(`Camera: ${mp.events.length} events (${mp.events.filter((e) => e.kind === 'punch').length} punches), ${mp.cues.length} cues; clause onsets snapped: ${mp.clauses.filter((c) => c.snapped).length}/${mp.clauses.length}`);
      for (const e of mp.events) console.log(`  ${String(e.at).padStart(6)} s  ${e.kind.padEnd(5)} ${e.z}x${e.mid ? ' (mid-sentence)' : ''}`);
      console.log(`Heroes: ${mp.heroes.map((h) => `"${h.text.replace(/\*/g, '')}" ${h.negative ? 'negative' : `${h.look}/${h.tone}`}${h.behind ? '/behind' : ''} ${h.start}-${h.end} (bg ${h.bg})`).join('; ')}`);
      const cfx = mp.caption.fx ? ['hollow', 'rgb'].filter((k) => mp.caption.fx[k]).concat(mp.caption.fx.shadow ? [`shadow ${mp.caption.fx.shadow.angle}deg/${mp.caption.fx.shadow.dist}px`] : []) : [];
      console.log(`Captions: ${mp.caption.style} at y ${mp.caption.y} (chest luminance ${mp.caption.luminance})${cfx.length ? `, ${cfx.join(', ')}` : ''}; blooms: ${mp.blooms.join(', ') || 'none'}`);
      console.log(`Reach: ${mp.reach.off}/${mp.reach.frames} base/punch speech frames off target (worst ${mp.reach.worst} of H); upscale ${mp.upscale.wide}/${mp.upscale.base}/${mp.upscale.punch}x`);
      for (const x of mp.reachFixes) console.log(`  reach fix at ${x.at} s: zoom ${x.from} -> ${x.to} (off-target ${x.offBefore} -> ${x.offAfter})`);
      for (const w of mp.warnings) console.log(`WARNING: ${w}`);
      for (const p of problems.errors || []) console.log(`BEAT SHEET ERROR: ${p}`);
      console.log('Next: review beat-sheet.md, then rcg marketing-pro build --job ' + a.job);
    } else if (cmd === 'audio') {
      if (!a.job) fail('Usage: marketing-pro.mjs audio --job <dir>');
      const r = await writeAudio(resolve(a.job));
      console.log(`Audio: ${r.music ? 'music bed ducked under each sentence, ' : ''}${r.sounds} sound(s)`);
    } else if (cmd === 'commands' || cmd === 'build') {
      if (!a.job) fail('Usage: marketing-pro.mjs commands|build --job <dir> [--dry-run]');
      runCommands(buildCommands(resolve(a.job)), { dryRun: cmd === 'commands' || Boolean(a['dry-run']) });
    } else {
      fail('Usage: marketing-pro.mjs prep | plan | commands | build --job <dir> ...');
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}
