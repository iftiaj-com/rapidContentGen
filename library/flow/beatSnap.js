// beatSnap.js: snapArrivalsToBeats from flowEditor src/features/audio/useSoundtrackAnalysis.js,
// copied verbatim (the rest of that file is a React hook). Beats come from
// analyze-beatgrid.py (librosa) here; flowEditor's detectBeats is not used.

/**
 * Snap each card's arrival moment (end of its camera travel) to the nearest
 * detected beat by adjusting arrivalTime only — dwell times are untouched.
 * `audioOffset` shifts the beat grid when the soundtrack starts trimmed.
 * Pure function: feed it to setCards.
 */
export function snapArrivalsToBeats(cards, beats, audioOffset = 0) {
  if (!beats?.length) return cards;
  const grid = beats.map((b) => b - audioOffset).filter((b) => b > 0.05);
  if (!grid.length) return cards;

  let t = 0;
  return cards.map((card) => {
    const arrival = card.arrivalTime !== undefined ? card.arrivalTime : 1.5;
    const stay = card.duration || 2;
    const landing = t + arrival;

    // Nearest beat that still leaves a minimum travel time
    let best = null;
    for (const b of grid) {
      if (b <= t + 0.15) continue;
      if (best === null || Math.abs(b - landing) < Math.abs(best - landing)) best = b;
    }
    if (best === null) {
      t = landing + stay;
      return card;
    }
    const newArrival = Math.round((best - t) * 100) / 100;
    t = best + stay;
    return { ...card, arrivalTime: newArrival };
  });
}
