/*
 * face-reframe.js: subject-anchored framing for the camera block (rcg camera --track).
 *
 * New code (Adits has no face-follow camera: its tracking drives 3D parallax and gesture
 * zoom only). Uses the per-frame track from rcg track (MediaPipe face / hand landmarks).
 *
 * A reframe state is { z: zoom, x, y: where the subject should sit in the frame (0..1),
 * k: follow 0..1 }. k = 0 zooms about the subject where it stands (it stays put on screen);
 * k = 1 also moves it to (x, y) and keeps it there as it moves. Face cues ease from the
 * state at their start to their target over d seconds. The translation is clamped so no
 * frame edge shows while z >= 1.
 *
 * Transform: an element point q (relative to the element centre, transform-origin 50% 50%)
 * maps to z*q + T. With the subject at p, its target is g = p + k*(G - p), so T = g - z*p.
 *
 * Plain script (no imports or exports) so generators can copy it into a job. It defines
 * one global, RCGFaceReframe.
 */
var RCGFaceReframe = (function () {
  var EASES = {
    linear: function (u) { return u; },
    sine: function (u) { return 0.5 - 0.5 * Math.cos(Math.PI * u); },
    power2: function (u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; },
    power3: function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    out3: function (u) { return 1 - Math.pow(1 - u, 3); },
    expo: function (u) { return u >= 1 ? 1 : 1 - Math.pow(2, -10 * u); },
  };
  var IDENTITY = { z: 1, x: 0.5, y: 0.4, k: 0 };

  function lerp(a, b, u) { return a + (b - a) * u; }
  function mix(a, b, u) { return { z: lerp(a.z, b.z, u), x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), k: lerp(a.k, b.k, u) }; }
  function progress(c, t) {
    var d = c.d || 0;
    var u = d > 0 ? Math.max(0, Math.min(1, (t - c.at) / d)) : (t >= c.at ? 1 : 0);
    return (EASES[c.ease] || EASES.power3)(u);
  }

  /** The reframe state at time t from cues sorted by time ({at, d, ease, z?, x?, y?, k?}). */
  function stateAt(cues, t) {
    var from = IDENTITY;
    var target = IDENTITY;
    var active = null;
    for (var i = 0; i < cues.length; i++) {
      var c = cues[i];
      if (c.at > t) break;
      // The state where the previous cue had got to when this one starts.
      var start = active ? mix(from, target, progress(active, c.at)) : target;
      from = start;
      target = {
        z: c.z != null ? c.z : start.z, x: c.x != null ? c.x : start.x,
        y: c.y != null ? c.y : start.y, k: c.k != null ? c.k : start.k,
      };
      active = c;
    }
    return active ? mix(from, target, progress(active, t)) : IDENTITY;
  }

  /** Subject point (source-normalized) at source time s, linear between track frames. */
  function subjectAt(track, s) {
    var f = (s - track.start) * track.fps;
    var n = track.ax.length;
    if (!(n > 0)) return [0.5, 0.4];
    if (f <= 0) return [track.ax[0], track.ay[0]];
    if (f >= n - 1) return [track.ax[n - 1], track.ay[n - 1]];
    var i = Math.floor(f), u = f - i;
    return [lerp(track.ax[i], track.ax[i + 1], u), lerp(track.ay[i], track.ay[i + 1], u)];
  }

  /**
   * The reframe transform at composition time t.
   * map: { W, H, dw, dh, cw, ch }: element size, the cover-fit size of the source (where the
   *   subject is), and the size of the content actually laid out (cw x ch: the full cover size
   *   when the clip is uncropped, else W x H, as object-fit: cover crops it to the element);
   * clip: { start, mediaStart } of the tracked video, so source time = mediaStart + (t - start).
   */
  function reframe(cues, t, track, map, clip) {
    var st = stateAt(cues, t);
    var src = subjectAt(track, clip.mediaStart + (t - clip.start));
    var px = (src[0] - 0.5) * map.dw, py = (src[1] - 0.5) * map.dh;
    var Gx = (st.x - 0.5) * map.W, Gy = (st.y - 0.5) * map.H;
    var gx = px + st.k * (Gx - px), gy = py + st.k * (Gy - py);
    var tx = gx - st.z * px, ty = gy - st.z * py;
    // Keep the content covering the frame: its scaled half-size must reach past each edge.
    var mx = Math.max(0, (st.z * (map.cw || map.W) - map.W) / 2), my = Math.max(0, (st.z * (map.ch || map.H) - map.H) / 2);
    tx = Math.max(-mx, Math.min(mx, tx));
    ty = Math.max(-my, Math.min(my, ty));
    return {
      z: st.z, tx: tx, ty: ty, subject: [px, py],
      transform: "translate(" + tx.toFixed(2) + "px, " + ty.toFixed(2) + "px) scale(" + st.z.toFixed(5) + ")",
    };
  }

  return { EASES: EASES, IDENTITY: IDENTITY, stateAt: stateAt, subjectAt: subjectAt, reframe: reframe };
})();
if (typeof module !== "undefined" && module.exports) module.exports = RCGFaceReframe;
