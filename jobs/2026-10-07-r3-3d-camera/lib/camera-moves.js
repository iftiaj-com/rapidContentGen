/*
 * camera-moves.js: the 46 Adits camera movements as pure functions of time.
 *
 * Ported from Adits core/anam/CameraMovements.js (see docs/PROVENANCE.md). The
 * MOVES table and the pose math are unchanged; what changed:
 *   - no performance.now() clock: the movement clock is `t * speed` (or the
 *     beat-synced rate), so any frame can be evaluated on its own (seekable)
 *   - no DOM slider reads: speed / intensity / loop / bars are arguments
 *   - the kick "beat shake" reads a value passed in (from the audio table)
 *   - compositeBackground's canvas redraw becomes poseToCss(): the same affine
 *     approximation (translate / rotate / scale with overscan) plus CSS filters
 *
 * Plain script (no imports or exports) so generators can inline it into a
 * HyperFrames composition. It defines one global, RCGCameraMoves.
 *
 * Limits: tilt_shift's sharp focus band needs a second blurred layer; poseToCss
 * returns only its color lift. infinite_zoom and earth_zoom_out reveal edges on a
 * single source by design (allowEdges).
 *
 * Also here: the 20 Virtual Camera presets from Adits core/VirtualCamera.js,
 * named "vc.<preset>" (two preset names clash with moves). A preset lerps
 * zoom / x / y / rotation / perspective skew from start to finish over its
 * duration, with the Adits options (speed, loop, inverse, curve, zigzag,
 * handheld shake, the six audio-react modes) and the Adits clamp. Changes:
 * timeline time replaces media time and performance.now(), and the audio-react
 * modes read precomputed per-frame values instead of live analyser state.
 */
var RCGCameraMoves = (function () {
  var REF_CYCLE_S = 4;
  var BEAT_SHAKE = 0.35;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var smoothstep = function (u) { return u * u * (3 - 2 * u); };
  var easeInOut = function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
  var bump = function (u) { return Math.sin(Math.PI * u); };
  var noise = function (t, seed) {
    return Math.sin(t * 1.7 + seed * 12.9) * 0.55 + Math.sin(t * 3.1 + seed * 78.2) * 0.30 + Math.sin(t * 6.7 + seed * 37.7) * 0.15;
  };

  var MOVES = {
    // Pan / Tilt
    static_shot:      { once: true, dur: 1,    ev: function () {} },
    pan_right:        { once: true, dur: 6,    ev: function (p, e) { p.yaw = -0.55 * p.I * e; } },
    pan_left:         { once: true, dur: 6,    ev: function (p, e) { p.yaw =  0.55 * p.I * e; } },
    whip_pan_right:   { once: true, dur: 1.0,  ev: function (p, e) { p.yaw = -1.10 * p.I * e; p.blur = bump(e) * 0.9; } },
    whip_pan_left:    { once: true, dur: 1.0,  ev: function (p, e) { p.yaw =  1.10 * p.I * e; p.blur = bump(e) * 0.9; } },
    tilt_up:          { once: true, dur: 6,    ev: function (p, e) { p.pitch =  0.38 * p.I * e; } },
    tilt_down:        { once: true, dur: 6,    ev: function (p, e) { p.pitch = -0.38 * p.I * e; } },
    // Zoom / Lens
    slow_zoom_in:     { once: true, dur: 10,   ev: function (p, e) { p.zoom = 1 + 0.7 * p.I * e; } },
    slow_zoom_out:    { once: true, dur: 10,   ev: function (p, e) { p.zoom = 1 + 0.7 * p.I * (1 - e); } },
    fast_zoom_in:     { once: true, dur: 2.2,  ev: function (p, e) { p.zoom = 1 + 0.9 * p.I * e; } },
    fast_zoom_out:    { once: true, dur: 2.2,  ev: function (p, e) { p.zoom = 1 + 0.9 * p.I * (1 - e); } },
    crash_zoom_in:    { once: true, dur: 0.55, ev: function (p, e) { p.zoom = 1 + 1.5 * p.I * e;       p.blur = bump(e) * 0.8; } },
    crash_zoom_out:   { once: true, dur: 0.55, ev: function (p, e) { p.zoom = 1 + 1.5 * p.I * (1 - e); p.blur = bump(e) * 0.8; } },
    // Dolly / Track
    dolly_in:         { once: true, dur: 7,    ev: function (p, e) { p.z = -2.0 * p.I * e; } },
    dolly_out:        { once: true, dur: 7,    ev: function (p, e) { p.z = -2.0 * p.I * (1 - e); } },
    tracking_shot:    { ev: function (p, e, t) { p.x = 1.1 * p.I * Math.sin(t * 0.45); p.y = 0.15 * p.I * Math.sin(t * 0.9); p.shake = 0.12 * p.I; } },
    follow_shot:      { ev: function (p, e, t) { p.z = -0.45 * p.I * (0.5 - 0.5 * Math.cos(t * 0.8)); p.y = 0.10 * p.I * Math.sin(t * 4.6); p.roll = 0.02 * p.I * Math.sin(t * 2.3); p.shake = 0.18 * p.I; } },
    reverse_tracking: { ev: function (p, e, t) { p.z = -0.45 * p.I * (0.5 + 0.5 * Math.cos(t * 0.8)); p.y = 0.10 * p.I * Math.sin(t * 4.6); p.aim = true; p.shake = 0.15 * p.I; } },
    side_tracking:    { ev: function (p, e, t) { p.x = 1.5 * p.I * Math.sin(t * 0.4); p.shake = 0.08 * p.I; } },
    low_tracking:     { ev: function (p, e, t) { var s = smoothstep(Math.min(1, t / 1.5)); p.y = -0.9 * p.I * s; p.pitch = 0.18 * p.I * s; p.x = 0.9 * p.I * Math.sin(t * 0.4); p.shake = 0.14 * p.I; } },
    vehicle_tracking: { ev: function (p, e, t) { p.x = 1.7 * p.I * Math.sin(t * 0.55); p.roll = -0.05 * p.I * Math.sin(t * 0.55); p.shake = 0.22 * p.I; p.blur = 0.12 * p.I * Math.abs(Math.cos(t * 0.55)); } },
    chase_shot:       { ev: function (p, e, t) { p.z = -0.7 * p.I * (0.5 - 0.5 * Math.cos(t * 0.9)); p.yaw = 0.12 * p.I * Math.sin(t * 1.7); p.shake = 0.5 * p.I; p.blur = 0.15 * p.I; } },
    // Physical moves
    truck_right:      { once: true, dur: 6,    ev: function (p, e) { p.x =  1.6 * p.I * e; } },
    truck_left:       { once: true, dur: 6,    ev: function (p, e) { p.x = -1.6 * p.I * e; } },
    pedestal_up:      { once: true, dur: 6,    ev: function (p, e) { p.y =  1.2 * p.I * e; } },
    pedestal_down:    { once: true, dur: 6,    ev: function (p, e) { p.y = -1.2 * p.I * e; } },
    slider_right:     { once: true, dur: 8,    ev: function (p, e) { p.x =  0.6 * p.I * e; } },
    slider_left:      { once: true, dur: 8,    ev: function (p, e) { p.x = -0.6 * p.I * e; } },
    push_past:        { once: true, dur: 7,    ev: function (p, e) { p.z = -2.6 * p.I * e; p.x = 0.5 * p.I * bump(e); p.zoom = 1 + 0.1 * p.I * e; p.blur = 0.12 * bump(e); } },
    arc_right:        { once: true, dur: 8,    ev: function (p, e) { p.orbit = -0.6 * p.I * e; p.aim = true; } },
    arc_left:         { once: true, dur: 8,    ev: function (p, e) { p.orbit =  0.6 * p.I * e; p.aim = true; } },
    orbit_cw:         { ev: function (p, e, t) { p.orbit = -0.5 * p.I * t; p.aim = true; } },
    orbit_ccw:        { ev: function (p, e, t) { p.orbit =  0.5 * p.I * t; p.aim = true; } },
    // Human camera
    handheld:         { ev: function (p, e, t) { p.yaw = 0.022 * p.I * noise(t, 1); p.pitch = 0.016 * p.I * noise(t, 2); p.roll = 0.012 * p.I * noise(t, 3); p.x = 0.06 * p.I * noise(t, 4); p.y = 0.05 * p.I * noise(t, 5); p.shake = 0.15 * p.I; } },
    snorricam:        { ev: function (p, e, t) { p.bgOnly = true; p.roll = 0.06 * p.I * noise(t, 6); p.x = 0.5 * p.I * noise(t * 0.7, 7); p.y = 0.3 * p.I * noise(t * 0.7, 8) + 0.08 * p.I * Math.sin(t * 4.2); p.shake = 0.2 * p.I; } },
    // Drone / Crane
    crane_up:         { once: true, dur: 9,    ev: function (p, e) { p.y =  2.2 * p.I * e; p.aim = true; } },
    crane_down:       { once: true, dur: 9,    ev: function (p, e) { p.y = -2.2 * p.I * e; p.aim = true; } },
    drone_push_in:    { once: true, dur: 9,    ev: function (p, e, t) { p.z = -2.8 * p.I * e;       p.y = 0.8 * p.I * (1 - e); p.x = 0.15 * p.I * Math.sin(t * 0.7); p.aim = true; p.shake = 0.05 * p.I; } },
    drone_pull_back:  { once: true, dur: 9,    ev: function (p, e, t) { p.z = -2.8 * p.I * (1 - e); p.y = 0.8 * p.I * e;       p.x = 0.15 * p.I * Math.sin(t * 0.7); p.aim = true; p.shake = 0.05 * p.I; } },
    helicopter:       { ev: function (p, e, t) { var s = smoothstep(Math.min(1, t / 3)); p.y = 1.8 * p.I * s; p.x = 1.2 * p.I * Math.sin(t * 0.25); p.roll = 0.03 * p.I * Math.sin(t * 0.4); p.aim = true; p.shake = 0.08 * p.I; } },
    // Specials
    first_person:     { ev: function (p, e, t) { p.z = -0.4 * p.I * (0.5 - 0.5 * Math.cos(t * 0.9)); p.y = 0.08 * p.I * Math.sin(t * 5.2); p.roll = 0.025 * p.I * Math.sin(t * 2.6); p.yaw = 0.05 * p.I * Math.sin(t * 0.9); p.shake = 0.16 * p.I; } },
    tilt_shift:       { ev: function (p, e, t) { var s = smoothstep(Math.min(1, t / 2)); p.y = 1.5 * p.I * s; p.zoom = 1 + 0.15 * p.I * s; p.tiltShift = s * clamp(p.I, 0, 1.2); p.aim = true; } },
    infinite_zoom:    { ev: function (p, e, t) { var c = (t * 0.45 * p.I) % 2; p.zoom = Math.pow(2, c); p.blur = 0.12 + 0.45 * Math.pow(c / 2, 8); } },
    earth_zoom_out:   { once: true, dur: 8,    ev: function (p, e) { p.zoom = 1 / (1 + 14 * p.I * e); p.roll = 0.15 * p.I * e; p.allowEdges = true; } },
    time_lapse:       { ev: function (p) { p.flicker = clamp(0.5 * p.I, 0, 1); } },
    pass_through:     { once: true, dur: 6,    ev: function (p, e) { p.z = -3.2 * p.I * e; p.zoom = 1 + 0.35 * p.I * bump(e); p.blur = 0.7 * bump(e) * bump(e); } },
  };

  // Virtual Camera presets (Adits core/VirtualCamera.js this.presets), one row each:
  // [camStartZoom, camFinishZoom, camStartX, camFinishX, camStartY, camFinishY,
  //  camStartRot, camFinishRot, camStartPerspH, camFinishPerspH, camStartPerspV, camFinishPerspV,
  //  camZoom (master zoom), camMotionSpeed]. X/Y in percent of the frame; rotation and perspective in degrees.
  var PRESETS = {
    slow_zoom_in:          [1.0, 1.6,    0,  0,   0,  0,    0,   0,     0,  0,    0,   0,   1.0, 1.0],
    slow_zoom_out:         [1.3, 1.0,    0,  0,   0,  0,    0,   0,     0,  0,    0,   0,   1.3, 1.0],
    pan_left_to_right:     [1.3, 1.3,  -20, 20,   0,  0,    0,   0,     0,  0,    0,   0,   1.0, 1.0],
    pan_right_to_left:     [1.3, 1.3,   20, -20,  0,  0,    0,   0,     0,  0,    0,   0,   1.0, 1.0],
    pan_up_to_down:        [1.3, 1.3,    0,  0, -20, 20,    0,   0,     0,  0,    0,   0,   1.0, 1.0],
    pan_down_to_up:        [1.3, 1.3,    0,  0,  20, -20,   0,   0,     0,  0,    0,   0,   1.0, 1.0],
    pan_center_to_outward: [1.3, 1.3,    0, 25,   0, 15,    0,   0,     0,  0,    0,   0,   1.0, 1.0],
    cinematic_zoom_pan:    [1.0, 2.0,  -15, 18,  -8,  5,   -1,   1.5,   0,  0,    0,   0,   1.0, 1.0],
    dramatic_3d_tilt:      [1.1, 1.1,   -5,  5,   0,  0,   -3,   3,   -30, 30,   15, -15,   1.1, 1.0],
    dynamic_spin:          [1.0, 1.7,    0,  0,   0,  0,    0, 360,     0,  0,    0,   0,   1.0, 0.35],
    fast_zoom_burst:       [1.0, 1.0,    0,  0,   0,  0,    0,   0,     0,  0,    0,   0,   1.0, 1.0],
    ken_burns:             [1.0, 1.3,   -7,  5,   4, -3,    0,   0,     0,  0,    0,   0,   1.0, 0.5],
    dolly_push:            [1.0, 2.2,    0,  0,   6, -4,    0,   0,     0,  4,    0,   0,   1.0, 1.5],
    whip_pan:              [1.0, 1.0,  -50, 50,   0,  0,    0,   0,     0,  0,    0,   0,   1.0, 7.0],
    dutch_angle_drift:     [1.0, 1.15, -10, 10,   5, -5,   -7,   5,     0,  0,    0,   0,   1.0, 0.8],
    crash_zoom:            [1.0, 3.5,    0,  0,   0,  0,    0,   0,     0,  0,    0,   0,   1.0, 5.0],
    lean_sweep:            [1.1, 1.2,   -8,  8,   0,  0,    0,   0,   -35, 35,    0,   0,   1.0, 0.7],
    arch_rise:             [1.0, 1.4,    0,  0,  10, -8,    0,   0,     0,  0,   30, -20,   1.0, 0.8],
    warp_tilt:             [1.0, 1.3,   -5,  5,   0,  0,   -4,   4,   -25, 20,   20, -15,   1.0, 0.9],
    perspective_drift:     [1.0, 1.25, -12, 10,   5, -5,   -2,   1,   -15, 10,  -10,  15,   1.0, 0.6],
  };
  var REACT_MODES = ["bass_zoom", "bass_shake", "mid_sway", "treble_tilt", "jitter_stutter", "audio_speed"];

  function identity() {
    return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, orbit: 0, zoom: 1, shake: 0, blur: 0, flicker: 0, tiltShift: 0, aim: false, bgOnly: false, allowEdges: false, I: 1, clock: 0,
      px: 0, py: 0, prot: 0, skewH: 0, skewV: 0, vc: false, coverMin: 0 };
  }

  /**
   * A Virtual Camera preset at `t` seconds after its cue (getCurrentParams + the
   * applyTransform clamp). opts: { dur (Adits: clip duration, default 10),
   * speed (default: the preset's camMotionSpeed), intensity, loop, reverse, from,
   * curve, zigzag (-300..300), handheld (0..100), react (one of REACT_MODES),
   * sens, audio: { bass, mid, treble, prevBass } at this frame,
   * fill: "cover" (default) | "blur" | "none" }.
   * Pose terms: px/py (camera offset, fraction of the frame), prot/skewH/skewV (radians).
   */
  function evaluatePreset(key, t, opts) {
    var row = PRESETS[key];
    if (!row) throw new Error("Unknown camera preset: vc." + key);
    var lerp = function (a, b, u) { return a + (b - a) * u; };
    var d = opts.dur > 0 ? opts.dur : 10;
    var speed = opts.speed != null ? opts.speed : row[13];
    var ct = Math.max(0, t) + (opts.from || 0);
    var u = (ct / d) * speed;
    if (opts.loop) {
      // Adits ping-pongs on wall-clock time; here on timeline time. Each half takes d / speed seconds.
      var half = Math.max(0.5, d / Math.max(0.01, speed));
      var phase0 = ct % (half * 2);
      u = phase0 < half ? phase0 / half : 2 - phase0 / half;
    } else u = clamp(u, 0, 1);
    if (opts.reverse) u = 1 - u;

    var master = row[12];
    var sx = row[2] / 100, fx = row[3] / 100, sy = row[4] / 100, fy = row[5] / 100;
    var zoom = lerp(row[0], row[1], u) * master;
    var rot = lerp(row[6], row[7], u);
    var perspH = lerp(row[8], row[9], u), perspV = lerp(row[10], row[11], u);
    var x = lerp(sx, fx, u), y = lerp(sy, fy, u);

    // Curve and zigzag paths, offset perpendicular to the start -> finish direction.
    var dx = fx - sx, dy = fy - sy, len = Math.sqrt(dx * dx + dy * dy), nx = 0, ny = -1;
    if (len > 0.0001) { nx = -dy / len; ny = dx / len; }
    if (opts.curve) {
      var k = (opts.curve / 300) * 0.8, cx = (sx + fx) / 2 + nx * k, cy = (sy + fy) / 2 + ny * k, mt = 1 - u;
      x = mt * mt * sx + 2 * mt * u * cx + u * u * fx;
      y = mt * mt * sy + 2 * mt * u * cy + u * u * fy;
    }
    if (opts.zigzag) {
      var wob = Math.sin(u * 5 * Math.PI) * (opts.zigzag / 300) * 0.3;
      x += nx * wob; y += ny * wob;
    }
    if (key === "fast_zoom_burst") {
      var phase = u * 4 * Math.PI * 2;
      zoom = master * (1.4 + Math.sin(phase) * 0.38);
      x = Math.sin(phase + Math.PI / 4) * 0.12;
      y = Math.cos(phase * 0.75 + Math.PI / 3) * 0.08;
    }

    // Audio-react modes. Adits reads live analyser values and performance.now();
    // here `audio` comes from the per-frame table and the step clock is timeline time.
    var a = opts.audio;
    if (opts.react && a) {
      var sens = opts.sens != null ? opts.sens : 1;
      var bass = a.bass || 0, mid = a.mid || 0, treble = a.treble || 0, s, step;
      if (opts.react === "bass_zoom") {
        zoom += (bass * 0.45 + Math.max(0, bass - (a.prevBass || 0)) * 2.2 * 0.7) * sens;
      } else if (opts.react === "bass_shake") {
        if (bass > 0.5) {
          s = Math.pow((bass - 0.5) / 0.5, 1.5) * sens;
          step = Math.floor((ct * 1000) / 70);
          x += (Math.sin(step * 13.7) > 0 ? 1 : -1) * s * 0.07;
          y += (Math.sin(step * 9.31) > 0 ? 1 : -1) * s * 0.05;
        }
      } else if (opts.react === "mid_sway") {
        rot += Math.sin(ct * 6.28) * mid * 28 * sens;
      } else if (opts.react === "treble_tilt") {
        perspH += Math.sin(ct * 8.0) * treble * 35 * sens;
        perspV += Math.cos(ct * 10.5) * treble * 25 * sens;
      } else if (opts.react === "jitter_stutter") {
        var energy = (bass * 0.5 + mid * 0.5) * sens;
        if (energy > 0.35) {
          s = (energy - 0.35) / 0.65;
          step = Math.floor((ct * 1000) / 82);
          x += Math.round(Math.sin(step * 5.1)) * s * 0.09;
          y += Math.round(Math.cos(step * 3.7)) * s * 0.07;
          rot += Math.round(Math.sin(step * 7.3)) * s * 4.5;
        }
      } else if (opts.react === "audio_speed") {
        var en = (bass * 0.5 + mid * 0.3 + treble * 0.2) * sens;
        if (en > 0.02) {
          var su = Math.min(1, u + en * (1 - u) * 0.8);
          zoom = lerp(row[0], row[1], su) * master;
          x = lerp(sx, fx, su); y = lerp(sy, fy, su); rot = lerp(row[6], row[7], su);
        }
      }
    }

    // Handheld shake (camShake 0..100).
    if (opts.handheld > 0) {
      var amp = (opts.handheld / 100) * 0.05;
      x += (Math.sin(ct * 15.0) * 0.6 + Math.sin(ct * 32.0) * 0.4) * amp;
      y += (Math.cos(ct * 12.0) * 0.65 + Math.cos(ct * 29.0) * 0.35) * amp;
      rot += (Math.sin(ct * 8.0) * 0.5 + Math.sin(ct * 21.0) * 0.5) * (opts.handheld / 100) * 2.0;
    }

    var p = identity();
    p.I = clamp(opts.intensity == null ? 1 : opts.intensity, 0.05, 2.5);
    if (p.I !== 1) { zoom = 1 + (zoom - 1) * p.I; x *= p.I; y *= p.I; rot *= p.I; perspH *= p.I; perspV *= p.I; }

    // applyTransform's clamp ("prevent emptiness"): zoom up for the rotation, keep the pan inside the overscan.
    var fill = opts.fill || "cover";
    if (fill !== "none") {
      var rr = Math.abs((rot * Math.PI) / 180) % (Math.PI / 2);
      zoom = Math.max(zoom, Math.abs(Math.cos(rr)) + Math.abs(Math.sin(rr)));
      if (zoom > 1) { var m = (zoom - 1) / 2; x = clamp(x, -m, m); y = clamp(y, -m, m); }
    }
    p.clock = ct;
    p.zoom = zoom;
    p.px = x; p.py = y;
    p.prot = (rot * Math.PI) / 180;
    p.skewH = (perspH * Math.PI) / 180;
    p.skewV = (perspV * Math.PI) / 180;
    p.vc = true;
    // "cover": poseToCss scales up until no edge shows (opts.cover: a fixed minimum scale for
    // the whole cue, so the zoom does not pulse). "blur": edges show a blurred copy of the
    // footage (Adits drawBackground; the camera block adds it). "none": edges show.
    p.allowEdges = fill !== "cover";
    p.coverMin = fill === "cover" ? opts.cover || 0 : 0;
    return p;
  }

  /**
   * Smallest scale at which translate(bx, by) rotate(rot) scale(s) skew(kh, kv)
   * (origin at the center) still covers the whole w x h frame.
   */
  function coverScale(bx, by, rot, kh, kv, w, h) {
    var c = Math.cos(rot), s = Math.sin(rot), th = Math.tan(kh || 0), tv = Math.tan(kv || 0), det = 1 - th * tv, need = 0;
    for (var i = 0; i < 4; i++) {
      var qx0 = (i & 1 ? 0.5 : -0.5) * w - bx, qy0 = (i & 2 ? 0.5 : -0.5) * h - by;
      var rx = c * qx0 + s * qy0, ry = -s * qx0 + c * qy0;
      var qx = (rx - th * ry) / det, qy = (ry - tv * rx) / det;
      need = Math.max(need, Math.abs(qx) / (w / 2), Math.abs(qy) / (h / 2));
    }
    return need;
  }

  /**
   * Movement-seconds per real second for beat sync: one pass of the move takes
   * `bars` bars at `bpm` (a one-shot's pass is its dur; a continuous move's is 4 s).
   * `speed` multiplies on top, as in Adits.
   */
  function beatRate(name, bpm, bars, beatsPerBar, speed) {
    var def = MOVES[name] || MOVES.static_shot;
    var barSec = (60 / bpm) * (beatsPerBar || 4);
    var pass = def.once ? (def.dur || REF_CYCLE_S) : REF_CYCLE_S;
    return (pass / (bars * barSec)) * (speed || 1);
  }

  /**
   * Pose of move `name` at `t` seconds after it starts.
   * opts: { speed = 1, intensity = 1, loop = false, rate (overrides speed), kick = 0..1 }
   */
  function evaluate(name, t, opts) {
    opts = opts || {};
    if (name.indexOf("vc.") === 0) return evaluatePreset(name.slice(3), t, opts);
    var def = MOVES[name];
    if (!def) throw new Error("Unknown camera move: " + name);
    var p = identity();
    p.I = clamp(opts.intensity == null ? 1 : opts.intensity, 0.05, 2.5);
    // from: start this many movement-seconds into the move (e.g. the second half of a whip)
    var clock = Math.max(0, t) * (opts.rate != null ? opts.rate : (opts.speed == null ? 1 : opts.speed)) + (opts.from || 0);
    p.clock = clock;
    var e = 0;
    if (def.once) {
      var u = clock / def.dur;
      if (opts.loop) { u = u % 2; if (u > 1) u = 2 - u; } else u = clamp(u, 0, 1);
      // reverse: play the one-shot backwards, ending on its neutral start (whip-in after a cut)
      if (opts.reverse) u = 1 - u;
      e = easeInOut(u);
    }
    def.ev(p, e, clock);
    if (opts.kick) p.shake = clamp(p.shake + opts.kick * BEAT_SHAKE * p.I, 0, 1);
    return p;
  }

  /**
   * compositeBackground's 2D approximation as CSS for an element of size w x h:
   * { transform, filter, edges } where edges = true means black may show (allowEdges).
   */
  function poseToCss(p, w, h) {
    var c = p.clock || 0;
    var jx = p.shake ? noise(c * 7.3, 11) * p.shake * 0.012 * w : 0;
    var jy = p.shake ? noise(c * 8.1, 12) * p.shake * 0.012 * h : 0;
    var bx = (p.yaw * 0.60 + p.orbit * 0.35) * w - p.x * 0.13 * w + jx;
    var by = p.pitch * 0.60 * h + p.y * 0.13 * h + jy;
    var rot = -p.roll + (p.shake ? noise(c * 6.4, 13) * p.shake * 0.01 : 0);
    var scale = Math.max(0.05, p.zoom * (1 - p.z * 0.16));
    if (p.vc) { bx -= p.px * w; by -= p.py * h; rot += p.prot; }
    if (!p.allowEdges) {
      // Moves keep their ported overscan estimate; presets (skew, portrait rotation) need the exact cover.
      var cover = p.vc ? Math.max(coverScale(bx, by, rot, p.skewH, p.skewV, w, h), p.coverMin || 0)
        : 1 + 2 * (Math.abs(bx) / w + Math.abs(by) / h) + Math.abs(Math.sin(rot)) * 0.7;
      scale = Math.max(scale, cover);
    }
    var skew = p.vc && (p.skewH || p.skewV) ? " skew(" + p.skewH.toFixed(5) + "rad, " + p.skewV.toFixed(5) + "rad)" : "";
    var filter = [];
    if (p.blur > 0.01) filter.push("blur(" + (p.blur * 10 * (w / 1280)).toFixed(2) + "px)");
    if (p.flicker > 0.01) filter.push("brightness(" + (1 + p.flicker * 0.10 * noise(c * 9.7, 21)).toFixed(3) + ")");
    if (p.tiltShift > 0.01) filter.push("saturate(1.35) contrast(1.05)");
    return {
      transform: "translate(" + bx.toFixed(2) + "px, " + by.toFixed(2) + "px) rotate(" + rot.toFixed(5) + "rad) scale(" + scale.toFixed(5) + ")" + skew,
      filter: filter.length ? filter.join(" ") : "none",
      edges: !!p.allowEdges,
      scale: scale,
    };
  }

  /**
   * applyToCamera, ported: set the camera to its base pose first (position,
   * lookAt target, fov), then offset it. Needs a three.js camera.
   * base: { position: [x,y,z], target: [x,y,z], fov }
   */
  function applyToThreeCamera(cam, p, base) {
    cam.position.set(base.position[0], base.position[1], base.position[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(base.target[0], base.target[1], base.target[2]);
    cam.fov = base.fov;
    if (!p.bgOnly) {
      if (p.orbit) {
        var co = Math.cos(p.orbit), so = Math.sin(p.orbit);
        var px = cam.position.x, pz = cam.position.z;
        cam.position.x = px * co + pz * so;
        cam.position.z = -px * so + pz * co;
        cam.lookAt(base.target[0], base.target[1], base.target[2]);
      }
      cam.position.x += p.x; cam.position.y += p.y; cam.position.z += p.z;
      if (p.aim) cam.lookAt(base.target[0], base.target[1], base.target[2]);
      if (p.yaw) cam.rotateY(p.yaw);
      if (p.pitch) cam.rotateX(p.pitch);
      if (p.roll) cam.rotateZ(p.roll);
      if (p.shake) {
        cam.rotateX(p.shake * 0.01 * noise(p.clock * 8.1, 31));
        cam.rotateY(p.shake * 0.01 * noise(p.clock * 7.7, 32));
      }
      if (p.zoom !== 1) cam.fov = clamp(base.fov / p.zoom, 2, 130);
    }
    cam.updateProjectionMatrix();
  }

  /**
   * Combine two poses (layering, an rapidContentGen extension: Adits runs one
   * move at a time). Offsets add, zoom multiplies, effects take the stronger value.
   */
  function combine(a, b) {
    return {
      x: a.x + b.x, y: a.y + b.y, z: a.z + b.z,
      yaw: a.yaw + b.yaw, pitch: a.pitch + b.pitch, roll: a.roll + b.roll, orbit: a.orbit + b.orbit,
      zoom: a.zoom * b.zoom,
      shake: Math.max(a.shake, b.shake), blur: Math.max(a.blur, b.blur),
      flicker: Math.max(a.flicker, b.flicker), tiltShift: Math.max(a.tiltShift, b.tiltShift),
      aim: a.aim || b.aim, bgOnly: a.bgOnly && b.bgOnly, allowEdges: a.allowEdges || b.allowEdges,
      I: Math.max(a.I, b.I), clock: a.clock || b.clock,
      px: a.px + b.px, py: a.py + b.py, prot: a.prot + b.prot,
      skewH: a.skewH + b.skewH, skewV: a.skewV + b.skewV, vc: a.vc || b.vc,
      coverMin: Math.max(a.coverMin || 0, b.coverMin || 0),
    };
  }

  /**
   * A cue list: [{ at, move, layer?, speed?, intensity?, loop?, rate?, from?, reverse? }...].
   * Per layer, the most recent cue whose `at` <= t is active, evaluated at t - at
   * (one-shots hold their end framing until the layer's next cue). Layers are
   * combined. Before a layer's first cue it contributes nothing. kickAt(t)
   * optionally returns the kick strength for beat shake (applied once).
   * audioAt(t) optionally returns { bass, mid, treble, prevBass } for presets
   * with a `react` mode. Preset cues also carry dur, curve, zigzag, handheld, sens, fill.
   */
  function poseAt(cues, t, kickAt, audioAt) {
    var active = {};
    var order = [];
    for (var i = 0; i < cues.length; i++) {
      var c = cues[i];
      var layer = c.layer || "a";
      if (order.indexOf(layer) < 0) order.push(layer);
      if (c.at <= t + 1e-6 && (!active[layer] || c.at >= active[layer].at)) active[layer] = c;
    }
    var pose = null;
    order.forEach(function (layer) {
      var c = active[layer];
      if (!c) return;
      var p = evaluate(c.move, t - c.at, { speed: c.speed, intensity: c.intensity, loop: c.loop, rate: c.rate, from: c.from, reverse: c.reverse,
        dur: c.dur, curve: c.curve, zigzag: c.zigzag, handheld: c.handheld, react: c.react, sens: c.sens, fill: c.fill, cover: c.cover,
        audio: c.react && audioAt ? audioAt(t) : null });
      pose = pose ? combine(pose, p) : p;
    });
    if (!pose) pose = identity();
    var k = kickAt ? kickAt(t) : 0;
    if (k) pose.shake = clamp(pose.shake + k * BEAT_SHAKE * pose.I, 0, 1);
    return pose;
  }

  return {
    MOVES: MOVES,
    names: Object.keys(MOVES),
    PRESETS: PRESETS,
    presetNames: Object.keys(PRESETS).map(function (k) { return "vc." + k; }),
    REACT_MODES: REACT_MODES,
    coverScale: coverScale,
    identity: identity,
    evaluate: evaluate,
    beatRate: beatRate,
    poseToCss: poseToCss,
    applyToThreeCamera: applyToThreeCamera,
    poseAt: poseAt,
    combine: combine,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = RCGCameraMoves;
