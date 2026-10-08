// ─── Aspect Ratios ────────────────────────────────────────────────────────────
export const RATIOS = {
  '9:16': 9 / 16,
  '1:1': 1,
  '2:3': 2 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
};

// ─── Board Layout ─────────────────────────────────────────────────────────────
export const BASE_WIDTH = 360;
export const GAP = 1200;

/**
 * Spread cards evenly along the X-axis.
 * @param {Array} cards
 * @param {number} [gap=GAP]
 * @returns {Array}
 */
export function layout(cards, gap = GAP) {
  return cards.map((c, i) => ({ ...c, x: i * gap, y: 0 }));
}
