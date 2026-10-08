/**
 * anam-utils.js — pure, stateless helpers shared across AnamorphicCamera.js and
 * its extracted core/anam/ sibling modules. Moved verbatim from AnamorphicCamera.js
 * (masterplan.md Phase 0) — no logic changed, only the export shape.
 *
 * NOTE: hexToHue01 (ex-`_cloudsHue`) returns 0–1. It is NOT the same as the
 * host's existing `_hexToHue`, which returns degrees — do not merge them.
 */

export function hexToVec3(hex) {
    return [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
    ];
}

export function hexToHue01(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.001) return 0;
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0)
            : max === g ? (b - r) / d + 2
            :             (r - g) / d + 4;
    return h / 6;
}

export function clamp01(v) { return Math.max(0, Math.min(1, v)); }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
