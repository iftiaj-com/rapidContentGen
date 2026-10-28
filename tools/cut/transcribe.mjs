// rcg cut transcribe: the raw take's words, with fillers and restarts kept (voice_cli.py
// transcribe-cut), cached by the source's sha256. Then a re-check pass, in one more Whisper run:
//   - a word label holding far more speech than its word (Whisper folded a repeat into it) is
//     transcribed again on its own (design ported from ai-video-editor's transcribe.py, MIT,
//     docs/PROVENANCE.md);
//   - a stretch of 1.5 s or more with no words but 1 s or more of voiced sound (Whisper skipped
//     it: 18 s of a test take came back empty) is transcribed again too.
// What still cannot be heard is marked in transcript.txt, so the cut can see the gap.

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadConfig } from '../lib/config.mjs';
import { WIN_S, deriveNoise, unheard, voicedGaps, windowLevels } from './levels.mjs';
import { readJson, sha256File } from './job.mjs';

// Bump when the transcription settings change, so cached transcripts are made again.
export const SETTINGS = 'cut-v1: filler prompt, vad 500 ms, no previous-text conditioning, beam 5, re-check';

/** Run voice_cli.py transcribe-cut; returns its JSON. */
export function whisperCut(media, out, { model, lang, clips } = {}) {
  const py = loadConfig().bin.voicePython;
  if (!py || !existsSync(py)) throw new Error('Voice venv not found (rcg doctor): the cut transcriber runs in it.');
  const args = [join(ROOT, 'tools', 'voice', 'voice_cli.py'), 'transcribe-cut', media, '--out', out, '--model', model];
  if (lang) args.push('--lang', lang);
  if (clips) args.push('--clips', clips.map(([a, b]) => `${a.toFixed(3)}-${b.toFixed(3)}`).join(','));
  execFileSync(py, args, { stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  return readJson(out);
}

/** Whole-word, case-insensitive replace that keeps the word's punctuation. */
export function swap(text, oldWord, newWord) {
  const esc = oldWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}'])${esc}(?![\\p{L}\\p{N}'])`, 'giu'), newWord);
}

/** fixes.json ({old: new}) applied to a word list in place. Returns the number of words changed. */
export function applyFixes(words, fixes) {
  let n = 0;
  for (const w of words) {
    for (const [o, v] of Object.entries(fixes)) {
      const s = swap(w.text, o, v);
      if (s !== w.text) { w.text = s; n++; }
    }
  }
  return n;
}

/**
 * Words for `media`: Whisper, then the re-check pass. Returns { words, language, seconds, rechecked }.
 * scratch: a file path for the transcriber's raw output (deleted afterwards).
 */
export async function transcribeTake(media, scratch, { model, lang }) {
  const t0 = Date.now();
  const full = whisperCut(media, scratch, { model, lang });
  const pick = ({ text, start, end, probability }) => ({ text, start, end, probability });
  let words = full.words.map(pick);
  const { rms: lvl } = await windowLevels(media);
  const { noise } = deriveNoise(lvl);
  const labels = noise == null ? [] : unheard(words, lvl, noise);
  const gaps = noise == null || !words.length ? [] : voicedGaps(words, lvl, noise, lvl.length * WIN_S);
  if (labels.length || gaps.length) {
    const clips = [...labels.map(([i]) => [words[i].start, words[i].end]), ...gaps.map((g) => [g.start, g.end])];
    const again = whisperCut(media, scratch, { model, lang: full.language || lang, clips }).clips.map((c) => c.words.map(pick));
    const n = { filled: 0, marked: 0, gapsFilled: 0, gapsMarked: 0 };
    const replace = new Map();
    labels.forEach(([i, voiced], k) => {
      const got = again[k];
      if (got.length > 1) { replace.set(i, got); n.filled++; }
      else if (!got.length) { replace.set(i, [{ ...words[i], unheardS: voiced }]); n.marked++; }
      // one word back: a drawn-out word, nothing hidden
    });
    const insert = new Map(); // word index -> recovered words that follow it
    const before = new Map(); // word index -> voiced seconds of a gap marked before it / after it
    const after = new Map();
    gaps.forEach((g, k) => {
      const got = again[labels.length + k];
      const probs = got.map((w) => w.probability).sort((x, y) => x - y);
      const median = probs.length ? probs[Math.floor(probs.length / 2)] : 0;
      // Inside the talk, recovered words go in. Before the first or after the last word (an intro or an
      // outro jingle), and when Whisper is unsure (it invents words over music), the gap is only marked.
      if (!g.edge && got.length && median >= 0.5) { insert.set(g.after, got); n.gapsFilled++; return; }
      if (g.after === -1) before.set(0, g.voiced);
      else after.set(g.after, g.voiced);
      n.gapsMarked++;
    });
    const out = [];
    words.forEach((w, i) => {
      const ws = [...(replace.get(i) || [w])];
      if (before.has(i)) ws[0] = { ...ws[0], gapBeforeS: before.get(i) };
      if (after.has(i)) ws[ws.length - 1] = { ...ws[ws.length - 1], gapAfterS: after.get(i) };
      out.push(...ws, ...(insert.get(i) || []));
    });
    words = out;
    const parts = [];
    if (labels.length) parts.push(`${labels.length} word label(s) held more speech: ${n.filled} heard again${n.marked ? `, ${n.marked} marked` : ''}`);
    if (gaps.length) parts.push(`${gaps.length} stretch(es) of untranscribed sound: ${n.gapsFilled} heard again${n.gapsMarked ? `, ${n.gapsMarked} marked in transcript.txt` : ''}`);
    console.log(`re-check   ${parts.join('; ')}`);
  }
  rmSync(scratch, { force: true });
  return { words, language: full.language || lang || null, seconds: +((Date.now() - t0) / 1000).toFixed(1), rechecked: labels.length + gaps.length };
}

export { sha256File };
