/**
 * audioClipUtils — timeline clip windows for the background soundtrack.
 *
 * Clip model (App state `audioClips`):
 *   null → soundtrack untouched: one implicit clip spanning the whole sequence
 *   []   → user deleted every clip: silence
 *   [{ id, start, duration|null }] — windows in timeline seconds, sorted by
 *   start, non-overlapping; duration null = "to the end of the sequence".
 *
 * Crucially, clips only gate WHERE the soundtrack is audible. The audio
 * content mapping is untouched: audio file time = timeline time + offset
 * (audioTrim.offset). So trimming/splitting a clip never shifts the song —
 * exactly like trimming a clip in a video editor — while the Adjust tool
 * slides the song underneath by changing the offset.
 */

export const MIN_CLIP_SEC = 0.2;

/** Resolve clips into concrete sorted windows [{id, start, end}] clamped to the sequence. */
export function resolveClipWindows(clips, totalDuration) {
  const total = Math.max(0, totalDuration || 0);
  if (total <= 0) return [];
  if (clips == null) return [{ id: '__full__', start: 0, end: total }];
  return clips
    .map((c) => {
      const start = Math.max(0, c.start || 0);
      return {
        id: c.id,
        start,
        end: c.duration == null ? total : Math.min(total, start + c.duration),
      };
    })
    .filter((w) => w.end - w.start > 0.01 && w.start < total)
    .sort((a, b) => a.start - b.start);
}

/** Turn the implicit full-length clip into a concrete editable list. */
export function materializeClips(clips, totalDuration) {
  if (Array.isArray(clips)) {
    return clips.slice().sort((a, b) => (a.start || 0) - (b.start || 0));
  }
  return resolveClipWindows(null, totalDuration).map((w, i) => ({
    id: Date.now() + i,
    start: w.start,
    duration: w.end - w.start,
  }));
}

/** Split the clip containing timeline time `t` into two. No-op if t isn't inside one. */
export function splitClipsAt(clips, t, totalDuration) {
  const list = materializeClips(clips, totalDuration);
  const idx = list.findIndex((c) => {
    const start = c.start || 0;
    const end = c.duration == null ? totalDuration : start + c.duration;
    return t > start + MIN_CLIP_SEC && t < end - MIN_CLIP_SEC;
  });
  if (idx === -1) return list;
  const c = list[idx];
  const start = c.start || 0;
  const end = c.duration == null ? totalDuration : start + c.duration;
  const next = [...list];
  next.splice(idx, 1,
    { ...c, start, duration: Math.round((t - start) * 100) / 100 },
    { id: Date.now(), start: Math.round(t * 100) / 100, duration: Math.round((end - t) * 100) / 100 },
  );
  return next;
}

/**
 * Piecewise-linear gain envelope for the soundtrack: 0 outside clip windows,
 * short anti-click gates at every boundary, fade-in on the first window and
 * fade-out on the last. Returned as sorted breakpoints [{t, v}] — both the
 * live gain automation and the offline mix schedule straight from these.
 */
export function buildSoundtrackEnvelope(windows, fadeIn = 0, fadeOut = 0) {
  const GATE = 0.02;
  const pts = [];
  windows.forEach((w, i) => {
    const dur = w.end - w.start;
    if (dur <= 0) return;
    const fi = (i === 0 && fadeIn > 0) ? Math.min(fadeIn, dur) : Math.min(GATE, dur / 2);
    const fo = (i === windows.length - 1 && fadeOut > 0) ? Math.min(fadeOut, dur) : Math.min(GATE, dur / 2);
    let riseEnd = w.start + fi;
    let fallStart = w.end - fo;
    let peak = 1;
    if (riseEnd > fallStart) {
      // Window shorter than the combined fades — ramps meet in the middle
      const mid = (riseEnd + fallStart) / 2;
      peak = fi > 0 ? Math.min(1, (mid - w.start) / fi) : 1;
      riseEnd = mid;
      fallStart = mid;
    }
    pts.push({ t: w.start, v: 0 });
    pts.push({ t: riseEnd, v: peak });
    if (fallStart > riseEnd) pts.push({ t: fallStart, v: peak });
    pts.push({ t: w.end, v: 0 });
  });
  // Drop exact duplicates (touching windows produce coincident 0-points)
  return pts.filter((p, i) => i === 0 || p.t !== pts[i - 1].t || p.v !== pts[i - 1].v);
}

/** Sample the envelope at time t (linear interpolation between breakpoints). */
export function envelopeValueAt(pts, t) {
  if (!pts.length) return 0;
  if (t <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      if (b.t === a.t) return b.v;
      return a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t));
    }
  }
  return pts[pts.length - 1].v;
}
