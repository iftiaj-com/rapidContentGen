// The sync graphics plan for jobs/2026-10-08-script-1l-split, generated from the presenter's
// corrected word times (data/words.json, copied from the split job). Every entrance is tied to a
// spoken word. Windows (layouts) come from the split job's data/split-plan.json:
//   split  -> graphics in the top panel (y 220-960; the panel fades to black from y 1000)
//   bfull  -> full-frame graphics (y 220-1360; the caption card sits near y 1440)
//   afull  -> presenter full frame, graphics hidden (a plain ground only)
// Run: node jobs/2026-10-08-script-1l-graphics/data/make-plan.mjs  (writes data/style-plan.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const W = JSON.parse(readFileSync(join(here, 'words.json'), 'utf8')).words;
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, '').replace(/\.+$/, '');
const r2 = (n) => Math.round(n * 100) / 100;
/** Start of the first word matching `text` at or after `after` seconds. */
function at(text, after = 0) {
  const w = W.find((x) => norm(x.text) === norm(text) && x.start >= after - 1e-6);
  if (!w) throw new Error(`word "${text}" not found after ${after}`);
  return w.start;
}
const TC = 'tactile-collage';
const items = [];
const add = (it) => items.push(it);
const ground = (id, start, end, texture, enter = 'cut', tone = 'paper') => add({ style: TC, component: 'paper-ground', id, start: r2(start), duration: r2(end - start), texture, tone, enter, exit: 'cut' });
const times = (start, list) => list.map((t) => r2(t - start)).join(',');
const span = (start, end) => ({ start: r2(start), duration: r2(end - start) });
const D = 78.233;

// W1 0-4.7 split: the hook, word by word.
ground('g1', 0, 4.7, 'dots');
add({ component: 'stack', id: 'k1', ...span(0, 4.7), text: 'This one is|the single|*biggest*|tax move', heavy: true, on: 'light', align: 'left', step: 46, x: 482, y: 540, w: 800, h: 560, size: 118, times: times(0, [at('this'), at('one'), at('is'), at('the', 1), at('single'), at('biggest'), at('tax'), at('move')]), out: 'cut' });
add({ style: TC, component: 'file-tag', id: 't1', ...span(at('small') - 0.38, 4.7), text: 'small business owners', y: 900, w: 640, h: 120, size: 44, colour: 'spark', from: 'left', exit: 'out' });

// W2 4.7-18.733 b-full: never explained / S-Corp election / $40,000 / overpaying, a legal fix.
ground('g2a', 4.7, 9.45, 'grid');
add({ style: TC, component: 'paper-card', id: 'c2a', ...span(4.95, 9.22), variant: 'note', text: 'Most people have|*never* had this|explained', y: 700, w: 780, h: 440, size: 76, from: 'drop', exit: 'out' });
ground('g2b', 8.95, 12.25, 'dots', 'slide');
add({ style: TC, component: 'stamp', id: 'st2', ...span(at('s-corp') - 0.3, 12.25), text: 'S-CORP ELECTION', y: 640, w: 820, h: 260, size: 92, colour: 'signal', exit: 'out' });
add({ style: TC, component: 'file-tag', id: 't2', ...span(at("here's", 10) - 0.25, 12.25), text: 'what you need to know', y: 990, w: 660, h: 120, size: 42, colour: 'spark', from: 'right', exit: 'out' });
ground('g2c', 11.75, 16.1, 'grid', 'slide');
add({ component: 'counter', id: 'n2', ...span(12.25, 16.1), from: 0, to: 40000, sep: ',', prefix: '$', suffix: '+', label: 'net profit as a sole proprietor', on: 'light', y: 760, w: 820, h: 440, size: 220, countAt: r2(at('40,000') - 0.35 - 12.25), countDur: 0.9, out: 'cut' });
ground('g2d', 15.6, 18.733, 'dots', 'slide');
add({ style: TC, component: 'stamp', id: 'st2b', ...span(at('overpaying') - 0.3, 18.733), text: 'OVERPAYING', y: 560, w: 700, h: 230, size: 100, colour: 'signal', rotate: -5, exit: 'out' });
add({ style: TC, component: 'paper-card', id: 'c2b', ...span(at("there's", 17) - 0.25, 18.733), text: "There's a *legal* way|to fix it", y: 980, w: 780, h: 290, size: 70, accent: 'resolve', from: 'below', exit: 'out' });

// W3 18.733-19.9 split: here's how it works.
ground('g3', 18.733, 19.9, 'ruled');
add({ style: TC, component: 'headline', id: 'h3', ...span(18.75, 19.9), text: "Here's *how*|it works", y: 560, h: 500, size: 132, accent: 'signal', highlight: true });

// W4 19.9-28.033 b-full: 15.3% self-employment tax; employee + employer = you.
ground('g4a', 19.9, 25.95, 'grid');
add({ style: TC, component: 'file-tag', id: 't4', ...span(at('sole', 20) - 0.3, 25.95), text: 'Sole proprietor', y: 380, w: 560, h: 120, size: 44, colour: 'spark', from: 'left', exit: 'out' });
add({ component: 'counter', id: 'n4', ...span(21.0, 25.95), from: 0, to: 153, decimals: 1, suffix: '%', label: 'self-employment tax on every dollar of profit', on: 'light', y: 820, w: 820, h: 460, size: 290, countAt: r2(at('15.3') - 0.45 - 21.0), countDur: 0.9, out: 'cut' });
ground('g4b', 25.45, 28.033, 'dots', 'slide');
add({ component: 'equation', id: 'e4', ...span(25.95, 28.033), left: 'Employee|+ employer', op: '=', right: '*You*', chip: 'right', on: 'light', y: 800, h: 420, size: 128, times: times(25.95, [at('employee'), at('employer'), at('that', 27)]), out: 'cut' });

// W5 28.033-28.667 split: all of it.
ground('g5', 28.033, 28.667, 'plain', 'cut', 'sheet');
add({ style: TC, component: 'stamp', id: 'st5', ...span(28.04, 28.667), text: 'ALL OF IT', y: 560, w: 640, h: 250, size: 112, colour: 'signal', exit: 'out' });

// W6 28.667-33.78 b-full: with an S-Corp, a reasonable salary, payroll tax.
ground('g6', 28.667, 33.78, 'grid');
add({ component: 'stack', id: 'k6', ...span(28.7, 33.78), text: 'With an *S-Corp*', heavy: true, on: 'light', align: 'center', y: 400, w: 820, h: 220, size: 118, times: times(28.7, [at('with', 28.7), at('an', 28.9), at('s-corp', 29)]), out: 'cut' });
add({ style: TC, component: 'paper-card', id: 'c6', ...span(at('pay') - 0.2, 33.78), text: 'You pay yourself a|*reasonable salary*', y: 800, w: 800, h: 330, size: 72, from: 'drop', exit: 'out' });
add({ style: TC, component: 'stamp', id: 'st6', ...span(at('payroll') - 0.3, 33.78), text: 'PAYROLL TAX', y: 1150, w: 660, h: 220, size: 92, colour: 'signal', rotate: 6, exit: 'out' });

// W7 33.78-35.79 a-full (presenter): plain ground.
ground('g7', 33.78, 35.79, 'plain');

// W8 35.79-39.9 split: you, the owner: no payroll tax; the savings.
ground('g8', 35.79, 39.9, 'dots');
add({ style: TC, component: 'file-tag', id: 't8', ...span(35.8, 39.9), text: 'you, the owner', y: 320, w: 540, h: 120, size: 44, colour: 'spark', from: 'right', exit: 'out' });
add({ style: TC, component: 'stamp', id: 'st8', ...span(at('not', 37) - 0.3, 39.9), text: 'NO PAYROLL TAX', y: 570, w: 800, h: 240, size: 88, colour: 'resolve', rotate: -4, exit: 'out' });
add({ component: 'icon', id: 'i8', ...span(38.55, 39.9), name: 'piggy-bank', badge: 'disc', label: 'the savings', on: 'light', x: 482, y: 830, size: 118, at: r2(at('savings') - 38.55), out: 'cut' });

// W9 39.9-44.62 b-full: $100,000 net profit -> about $7,500 a year.
ground('g9', 39.9, 44.62, 'grid');
add({ component: 'counter', id: 'n9a', ...span(39.95, 44.62), from: 0, to: 100000, sep: ',', prefix: '$', label: 'net profit', on: 'light', y: 430, w: 760, h: 300, size: 150, countAt: 0.1, countDur: 0.8, out: 'cut' });
add({ style: TC, component: 'route', id: 'r9', ...span(at('difference') - 0.2, 44.62), x1: 482, y1: 610, x2: 482, y2: 790, bend: 0.35, draw: 0.5, colour: 'ink' });
add({ component: 'counter', id: 'n9b', ...span(42.0, 44.62), from: 0, to: 7500, sep: ',', prefix: '~$', suffix: '/yr', label: 'the difference, roughly', on: 'light', y: 1010, w: 820, h: 380, size: 220, countAt: r2(at('7,500') - 0.4 - 42.0), countDur: 0.9, out: 'cut' });

// W10 44.62-46.5 a-full: plain ground.
ground('g10', 44.62, 46.5, 'plain');

// W11 46.5-57.08 b-full: QBI <-> salary (no percentage on screen: user decision), then the gauge.
ground('g11a', 46.5, 52.95, 'grid');
add({ style: TC, component: 'file-tag', id: 't11', ...span(46.55, 52.95), text: '1 · QBI deduction', y: 380, w: 600, h: 120, size: 44, colour: 'spark', from: 'left', exit: 'out' });
add({ component: 'equation', id: 'e11', ...span(47.2, 52.95), left: 'QBI|deduction', op: '↔', right: 'Salary', chip: 'right', on: 'light', y: 820, h: 420, size: 120, times: times(47.2, [at('deduction', 47), at('interacts'), at('salary', 51)]), out: 'cut' });
ground('g11b', 52.45, 57.08, 'dots', 'slide');
add({ component: 'range', id: 'rg11', ...span(52.95, 57.08), title: 'Your salary decision', zones: 'Too low:IRS flags it:bad|Sweet spot::good|Too high:Smaller deduction:bad', knob: 'Salary', moves: `0.5@0.05,0.86@${r2(at('high', 53) - 52.95)},0.14@${r2(at('low', 55) - 52.95)}`, on: 'light', y: 820, w: 820, h: 460, label: 36, out: 'cut' });

// W12 57.08-61.367 split: no universal rule; modeled for your situation.
ground('g12', 57.08, 61.367, 'ruled');
add({ style: TC, component: 'stamp', id: 'st12', ...span(57.1, 61.367), text: 'NO UNIVERSAL RULE', y: 420, w: 820, h: 230, size: 76, colour: 'signal', exit: 'out' });
add({ style: TC, component: 'paper-card', id: 'c12', ...span(at('modeled') - 0.3, 61.367), variant: 'note', text: 'Modeled for *your*|specific situation', y: 770, w: 760, h: 300, size: 64, from: 'drop', exit: 'out' });

// W13 61.367-69.9 b-full: New York City, S-Corp not recognized; 8.85% general corporation tax.
ground('g13a', 61.367, 65.85, 'grid');
add({ style: TC, component: 'file-tag', id: 't13', ...span(61.4, 65.85), text: '2 · New York City', y: 320, w: 580, h: 120, size: 44, colour: 'spark', from: 'left', exit: 'out' });
add({ style: TC, component: 'taped-photo', id: 'ph13', ...span(at('new', 61) - 0.3, 65.85), src: 'assets/img/city.jpg', caption: 'New York City', y: 790, w: 540, ratio: 0.78, rotate: -3, from: 'drop', exit: 'out' });
add({ style: TC, component: 'stamp', id: 'st13', ...span(at('recognize') - 0.3, 65.85), text: 'S-CORP NOT RECOGNIZED', y: 800, w: 760, h: 210, size: 64, colour: 'signal', rotate: -6, exit: 'out' });
ground('g13b', 65.35, 69.9, 'dots', 'slide');
add({ style: TC, component: 'file-tag', id: 't13b', ...span(at('general') - 0.3, 69.9), text: 'General Corporation Tax', y: 400, w: 700, h: 120, size: 42, colour: 'spark', from: 'right', exit: 'out' });
add({ component: 'counter', id: 'n13', ...span(66.3, 69.9), from: 0, to: 885, decimals: 2, suffix: '%', label: "a layer most owners don't see coming", on: 'light', y: 860, w: 820, h: 460, size: 280, countAt: r2(at('8.85') - 0.45 - 66.3), countDur: 0.9, out: 'cut' });

// W14 69.9-74.38 split: don't see it coming; one of the highest-leverage moves.
ground('g14', 69.9, 74.38, 'dots');
add({ style: TC, component: 'paper-card', id: 'c14', ...span(69.95, 71.85), variant: 'note', text: "Most owners *don't*|see it coming", y: 560, w: 760, h: 320, size: 66, from: 'drop', exit: 'out' });
add({ style: TC, component: 'file-tag', id: 't14', ...span(71.85, 74.38), text: 'The S-Corp election', y: 300, w: 600, h: 120, size: 44, colour: 'spark', from: 'left', exit: 'out' });
add({ component: 'stack', id: 'k14', ...span(71.85, 74.38), text: 'One of the|*highest-leverage*|moves', heavy: true, on: 'light', align: 'left', step: 40, y: 660, w: 820, h: 440, size: 104, times: times(71.85, [at('one', 72), at('of', 72.9), at('the', 73), at('highest'), at('moves')]), out: 'cut' });

// W15 74.38-76.01 b-full: for small business owners.
ground('g15', 74.38, 76.01, 'grid');
add({ component: 'icon', id: 'i15', ...span(74.4, 76.01), name: 'storefront', badge: 'disc', label: 'Small business owners', on: 'light', x: 482, y: 700, size: 220, at: r2(at('small', 74) - 74.4), out: 'cut' });

// W16 76.01-78.233 a-full: plain ground.
ground('g16', 76.01, D, 'plain');

writeFileSync(join(here, 'style-plan.json'), `${JSON.stringify({ style: 'info-collage', items }, null, 2)}\n`);
console.log(`${items.length} items written to data/style-plan.json`);
