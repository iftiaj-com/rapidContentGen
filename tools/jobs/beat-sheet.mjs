// Beat sheet: the plan the user approves. The JSON is the source of truth; the
// markdown table shown to the user is generated from it so they never drift.
// Validation follows the Adits Advance timeline rules (effects/auto/advance/
// timeline.js): absolute seconds, start >= 0, end > start, rows sorted, no
// overlaps, and problems are reported, never silently dropped.
// Schema: docs/job-spec.md.
//
// Usage:
//   node tools/jobs/beat-sheet.mjs validate <beat-sheet.json>
//   node tools/jobs/beat-sheet.mjs md <beat-sheet.json> [out.md]   (validates first)

import { writeFileSync } from 'node:fs';
import { isMain, parseArgs } from '../lib/cli.mjs';
import { readJson } from '../lib/config.mjs';

export const TEXT_POSITIONS = {
  'none': 'No text',
  'top-band': 'Top band (y 220-420), centered in the safe box',
  'center': 'Center card (y 660-1060), centered in the safe box',
  'black-card': 'Full-frame black card, text centered in the safe box',
  'captions': 'Caption line (above the bottom 20%, clear of the right edge)',
  'custom': 'Custom box: give box {x,y,w,h}; it must stay inside the safe zone',
};

export function validateBeatSheet(doc) {
  const errors = [];
  const warnings = [];
  if (!doc || typeof doc !== 'object') return { errors: ['not an object'], warnings };
  const fmt = doc.format || {};
  for (const k of ['width', 'height', 'fps', 'duration']) {
    if (!Number.isFinite(Number(fmt[k]))) errors.push(`format.${k} is missing or not a number`);
  }
  const beats = Array.isArray(doc.beats) ? doc.beats : [];
  if (!beats.length) errors.push('beats: expected a non-empty array');
  const safe = doc.safeZones || { noTextBottomFrom: Math.round(fmt.height * 0.8), noTextRightFrom: fmt.width - 180, headerClearTo: 192 };
  let prevEnd = 0;
  beats.forEach((b, i) => {
    const tag = `beats[${i}]`;
    const s = Number(b.start);
    const e = Number(b.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s) {
      errors.push(`${tag}: invalid range start=${b.start} end=${b.end}`);
      return;
    }
    if (s < prevEnd - 1e-6) errors.push(`${tag}: starts at ${s}, before the previous beat ends (${prevEnd}). Overlaps are not allowed.`);
    else if (s > prevEnd + 1e-6) warnings.push(`${tag}: gap from ${prevEnd} to ${s}.`);
    prevEnd = Math.max(prevEnd, e);
    if (!b.onScreen) errors.push(`${tag}: onScreen is required (what the viewer sees).`);
    if (b.sound === undefined) errors.push(`${tag}: sound is required (write "none" for silence).`);
    for (const t of [].concat(b.text || [])) {
      const pos = t.position || 'none';
      if (!TEXT_POSITIONS[pos]) errors.push(`${tag}: unknown text position "${pos}".`);
      if (pos === 'custom') {
        const box = t.box || {};
        if ([box.x, box.y, box.w, box.h].some((v) => !Number.isFinite(Number(v)))) errors.push(`${tag}: custom text needs box {x,y,w,h}.`);
        else {
          if (box.y + box.h > safe.noTextBottomFrom) errors.push(`${tag}: text box reaches y=${box.y + box.h}, inside the bottom no-text zone (from ${safe.noTextBottomFrom}).`);
          if (box.x + box.w > safe.noTextRightFrom) errors.push(`${tag}: text box reaches x=${box.x + box.w}, inside the right-edge button zone (from ${safe.noTextRightFrom}).`);
          if (box.y < safe.headerClearTo) warnings.push(`${tag}: text starts at y=${box.y}, under the app header area.`);
        }
      }
      if (t.at != null && (t.at < s || t.at > e)) warnings.push(`${tag}: text appears at ${t.at}, outside the beat ${s}-${e}.`);
    }
  });
  if (Number.isFinite(Number(fmt.duration)) && Math.abs(prevEnd - Number(fmt.duration)) > 0.05) {
    warnings.push(`beats end at ${prevEnd}, but format.duration is ${fmt.duration}.`);
  }
  return { errors, warnings };
}

const t2 = (x) => {
  const v = Number(x);
  const m = Math.floor(v / 60);
  return `${m}:${(v - m * 60).toFixed(2).padStart(5, '0')}`;
};
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function beatSheetMarkdown(doc) {
  const f = doc.format;
  const lines = [
    `# Beat sheet${doc.title ? `: ${doc.title}` : ''}`,
    '',
    `${f.width}x${f.height} @ ${f.fps} fps, ${Number(f.duration).toFixed(2)} s${doc.mode ? `, mode (${doc.mode})` : ''}`,
    '',
  ];
  if (doc.summary) lines.push(doc.summary, '');
  lines.push('| # | Time | Spoken words | What appears on screen | Where the text sits | Sound |', '|---|---|---|---|---|---|');
  doc.beats.forEach((b, i) => {
    const texts = [].concat(b.text || []);
    const onScreen = [b.onScreen, ...texts.filter((t) => t.content).map((t) => `**"${t.content}"**${t.at != null ? ` at ${Number(t.at).toFixed(2)}` : ''}`)].join('. ');
    const where = texts.length ? texts.map((t) => (t.position === 'custom' ? `custom box ${JSON.stringify(t.box)}` : TEXT_POSITIONS[t.position || 'none'])).join('; ') : 'None';
    lines.push(`| ${i + 1} | ${t2(b.start)} to ${t2(b.end)} | ${cell(b.words || 'None')} | ${cell(onScreen)} | ${cell(where)} | ${cell(b.sound)} |`);
  });
  if (doc.notes?.length) lines.push('', '**Notes**', '', ...doc.notes.map((n) => `- ${n}`));
  return lines.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const a = parseArgs();
  const [cmd, file, out] = a._;
  if (!cmd || !file) {
    console.error('Usage: beat-sheet.mjs validate|md <beat-sheet.json> [out.md]');
    process.exit(2);
  }
  const doc = readJson(file);
  const { errors, warnings } = validateBeatSheet(doc);
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.log(`ERROR: ${e}`);
  if (errors.length) process.exit(1);
  if (cmd === 'md') {
    const md = beatSheetMarkdown(doc);
    if (out) { writeFileSync(out, md); console.log(`Wrote ${out}`); } else process.stdout.write(md);
  } else console.log(`Beat sheet OK (${doc.beats.length} beats)`);
}
