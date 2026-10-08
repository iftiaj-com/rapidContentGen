/**
 * Template Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * Each template is a pure function:  (cards: Card[]) => Card[]
 *
 * To add a new template:
 *   1. Add a new entry to TEMPLATES below.
 *   2. Optionally add its name to one of the TEMPLATE_GROUPS for UI grouping.
 *   Done! The TemplatesSection component reads from this registry automatically.
 */

export const TEMPLATES = {
  // ── Single Direction ────────────────────────────────────────────────────────
  left: (cards, gap = 800) => {
    return cards.map((c, i) => ({ ...c, x: -(i + 1) * gap, y: 0 }));
  },
  right: (cards, gap = 800) => {
    return cards.map((c, i) => ({ ...c, x: (i + 1) * gap, y: 0 }));
  },
  up: (cards, gap = 800) => {
    return cards.map((c, i) => ({ ...c, x: 0, y: -(i + 1) * gap }));
  },
  down: (cards, gap = 800) => {
    return cards.map((c, i) => ({ ...c, x: 0, y: (i + 1) * gap }));
  },
  star: (cards, gap = 800) => {
    const radius = gap * 1.25; // Scale radius with gap
    return cards.map((c, i) => {
      const angle = (i / cards.length) * Math.PI * 2;
      return { ...c, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
  },

  // ── Alternating Directions ──────────────────────────────────────────────────
  'left-right': (cards, gap = 800) => {
    return cards.map((c, i) => ({
      ...c,
      x: i % 2 === 0 ? -(Math.floor(i / 2) + 1) * gap : (Math.floor(i / 2) + 1) * gap,
      y: 0,
    }));
  },
  'right-left': (cards, gap = 800) => {
    return cards.map((c, i) => ({
      ...c,
      x: i % 2 === 0 ? (Math.floor(i / 2) + 1) * gap : -(Math.floor(i / 2) + 1) * gap,
      y: 0,
    }));
  },
  'up-down': (cards, gap = 800) => {
    return cards.map((c, i) => ({
      ...c,
      x: 0,
      y: i % 2 === 0 ? -(Math.floor(i / 2) + 1) * gap : (Math.floor(i / 2) + 1) * gap,
    }));
  },
  'down-up': (cards, gap = 800) => {
    return cards.map((c, i) => ({
      ...c,
      x: 0,
      y: i % 2 === 0 ? (Math.floor(i / 2) + 1) * gap : -(Math.floor(i / 2) + 1) * gap,
    }));
  },
};

/**
 * UI grouping for the template picker dropdown.
 * Keys map to <optgroup> labels; values are arrays of TEMPLATES keys.
 */
export const TEMPLATE_GROUPS = {
  'Single Direction': ['left', 'right', 'up', 'down', 'star'],
  'Alternating':      ['left-right', 'right-left', 'up-down', 'down-up'],
};

/**
 * Apply a named template to a card array.
 * @param {string} name
 * @param {Array} cards
 * @param {string} arrangement - 'none' | 'stack' | 'spacing'
 * @param {number} spacing
 * @returns {Array}
 */
export function applyTemplate(name, cards, arrangement = 'none', spacing = 800) {
  if (!TEMPLATES[name]) return cards;

  if (arrangement === 'stack') {
    // Determine how many unique stack points this template should have
    let numPoints = 1;
    if (name.includes('-')) numPoints = 2; // e.g. left-right, up-down
    if (name === 'star') numPoints = 5;

    // Get the base positions for these points from the template itself
    const baseCards = Array.from({ length: numPoints }, (_, i) => ({ id: `base-${i}` }));
    const basePositions = TEMPLATES[name](baseCards, spacing);

    // Map all cards to these base positions cyclically
    return cards.map((card, i) => {
      const pos = basePositions[i % numPoints];
      return { ...card, x: pos.x, y: pos.y };
    });
  }

  return TEMPLATES[name](cards, spacing);
}
