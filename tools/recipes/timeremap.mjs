// Where in the source each shot starts. Port of Adits effects/auto/TimeRemap.js
// pickSeekTime (see docs/PROVENANCE.md). The logic and constants are unchanged;
// Math.random() became a seeded generator, so a plan picks the same shots every
// run (the render must not depend on when it was planned).
//
// Modes: 'linear' -> null (the shot continues where the previous one stopped);
// 'fixed' -> seekSeconds clamped into the media; 'random' -> a seeded pick that
// leaves room for the whole shot and avoids landing near the previous pick.

const REPEAT_GUARD_FRACTION = 0.05;
const REPEAT_GUARD_MAX = 1.0;
const MAX_REROLLS = 8;
const END_MARGIN = 0.05;

/** mulberry32: small seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {{mode?: 'linear'|'fixed'|'random', seekSeconds?: number, avoidRepeat?: boolean}} timefx
 * @param {number|null} mediaDuration  source duration in seconds
 * @param {number|null} segmentSpan    seconds of source the shot consumes
 * @param {number|null} lastTarget     the previous random pick for this source
 * @param {() => number} rand          seeded generator (mulberry32)
 * @returns {number|null}
 */
export function pickSeekTime(timefx, mediaDuration, segmentSpan, lastTarget, rand) {
  const mode = timefx?.mode || 'linear';
  if (mode === 'linear') return null;
  const total = Number.isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : null;
  if (mode === 'fixed') {
    const raw = Number.isFinite(timefx?.seekSeconds) ? timefx.seekSeconds : 0;
    const t = Math.max(0, raw);
    return total == null ? t : Math.min(t, Math.max(0, total - END_MARGIN));
  }
  if (mode === 'random') {
    if (total == null) return null;
    const span = Number.isFinite(segmentSpan) && segmentSpan > 0 ? segmentSpan : 0;
    const upper = Math.max(0, total - Math.min(span, total) - END_MARGIN);
    if (upper <= 0) return 0;
    const guard = Math.min(REPEAT_GUARD_MAX, upper * REPEAT_GUARD_FRACTION);
    let target = rand() * upper;
    if (timefx?.avoidRepeat !== false && lastTarget != null) {
      for (let i = 0; i < MAX_REROLLS && Math.abs(target - lastTarget) < guard; i++) target = rand() * upper;
    }
    return target;
  }
  return null;
}
