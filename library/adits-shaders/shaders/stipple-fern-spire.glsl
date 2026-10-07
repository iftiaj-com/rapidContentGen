/*{
  "ADITS": 1,
  "DESCRIPTION": "A stipple spire of nine discs stacked up a beaded axis that never changes, each tier changing species on its own schedule. Each is one stippled disc under six interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: broad plate, stipple disc, scalloped ring, needle ring. Bass broadens the tiers, treble narrows them to rings, and the change climbs the spire tier by tier. Rests as the stipple disc.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "halftone", "stipple", "spire", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "spanX",   "TYPE": "float", "DEFAULT": 0.260, "MIN": 0.200, "MAX": 0.290,
      "LABEL": "Tier Span", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "stipple", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Stipple", "BIND": "treble", "BIND_DEPTH": 0.50 },
    { "NAME": "glow",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Glow", "BIND": "level", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718

// Where the palette starts. It used to be a slider; the six-slot budget went to
// the morph controls instead, and this is the value it defaulted to.
#define HUE_OFF 0.35

// How far the per-tier selector is spread up the spire. The change then climbs
// it tier by tier instead of flipping all nine at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

vec3 pal(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the spire
    // and its colour wrap seamlessly on a 16 s cycle. Nothing on the morph path
    // reads it: which tier is which belongs to the music, not to the clock.
    float ph = fract(TIME / 16.0);

    float r = length(uv);

    float breath = 1.0 + 0.045 * sin(ph * TAU * 2.0);
    float span   = spanX * breath;
    float hue0   = ph + HUE_OFF + 0.24 * (1.0 - CAM_DIR.z);

    // --- Selector -------------------------------------------------------------
    // Balance decides which tier; loudness only decides how hard it glows.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // narrows a tier to a ring, a kick broadens it into a plate.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the hat
    // that narrows a tier also fires the spray around it.
    float sprayF = 0.35 + 0.65 * snap * AUDIO_HAT;

    // Stipple grid pitch. Density changes the pattern, never the loop count, so
    // cost cannot move with the slider or its bind.
    float pitch = 58.0 + 46.0 * stipple;

    vec3  col = vec3(0.0);
    float stippleCov = 0.0;
    float hotC = 0.0;

    // Nine flat discs stacked up the axis. Constant bound; the body is two hashes
    // and a few smoothsteps, which is why COST is "medium" and not "high".
    for (int k = 0; k < 9; k++) {
        float fk = float(k);
        float u  = fk / 8.0;                                  // 0 at the base, 1 at the tip
        float hv = hash11(fk * 3.31 + 1.7);

        // Per-tier selector. u already climbs the spire, so it doubles as the
        // sweep coordinate; the hash keeps that sweep from looking mechanical.
        // Both are static, so at a fixed spectrum the spire holds still.
        float xj = clamp(x0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (hv - 0.5)),
                         0.0, 3.0);

        // Triangular weights of slope 1.85. Support is 1/1.85 either side of a
        // centre and the centres are spaced 1.0, so neighbours overlap over
        // 2/1.85 - 1 = 0.081 of the axis and the sum is never zero. The slope
        // must stay below 2.0 or the normalisation divides by nothing.
        float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
        float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
        float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
        float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
        float ws = w0 + w1 + w2 + w3;
        w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

        // Parameter-space morph. One stippled disc, six interpolated numbers, so
        // the tier deforms and no fragment shows two forms at half alpha.
        //             plate      disc       ring       needle
        float RM   = 1.15 * w0 + 1.00 * w1 + 0.92 * w2 + 0.84 * w3;   // radius
        float tltM = 1.45 * w0 + 1.00 * w1 + 0.85 * w2 + 0.72 * w3;   // tilt
        float ann  = 0.02 * w0 + 0.04 * w1 + 0.20 * w2 + 0.36 * w3;   // hollow
        float dszM = 1.55 * w0 + 1.00 * w1 + 0.86 * w2 + 0.74 * w3;   // dot size
        float pchM = 0.60 * w0 + 1.00 * w1 + 1.30 * w2 + 1.65 * w3;   // grid pitch
        float briM = 0.85 * w0 + 1.00 * w1 + 1.20 * w2 + 1.55 * w3;   // emission

        float yk = mix(-0.275, 0.300, u) + 0.010 * sin(ph * TAU * 2.0 + fk * 1.3);
        // Widest a quarter of the way up, as a fir is, not at the very bottom.
        float R  = span * (1.0 - 0.88 * u) * (0.80 + 0.55 * smoothstep(0.0, 0.25, u))
                 * (0.92 + 0.16 * hv) * RM;
        // 'flat' is a reserved word in GLSL ES, so the tilt is named tiltY.
        float tiltY = (0.150 + 0.045 * sin(ph * TAU + fk * 0.9)) * tltM;

        // Disc space: x as it is, y divided by the tilt, so a horizontal disc seen
        // at a shallow angle becomes a circle of radius R here.
        float dy = uv.y - yk;
        float dr = length(vec2(uv.x, dy / tiltY));

        // The stipple grid is pinned to the tier centre but measured in real uv on
        // both axes, so the dots stay round on screen instead of being crushed by
        // the tilt division.
        vec2  g  = vec2(uv.x, dy) * pitch * pchM;
        vec2  gi = floor(g) + vec2(fk * 23.0, fk * 11.0);
        vec2  gf = fract(g) - 0.5;
        float h1 = hash21(gi);
        float h2 = hash21(gi + 37.13);
        float dsz = (0.15 + 0.20 * h1) * dszM;
        float mote = 1.0 - smoothstep(dsz, dsz + 0.16, length(gf - (vec2(h1, h2) - 0.5) * 0.62));

        // The disc is a filled annulus with its rim picked out, and the dots only
        // exist inside it.
        float body = (1.0 - smoothstep(R * 0.90, R * 1.02, dr))
                   * smoothstep(R * ann, R * (ann + 0.26), dr);
        float rimE = 1.0 - smoothstep(0.0, R * 0.12, abs(dr - R * 0.93));

        float tierMask = mote * body * (0.40 + 0.95 * rimE) * step(0.30, h2);
        // Narrow sweep, weighted green-cyan: a full-circle sweep drops some tiers
        // into dark red where a stipple field has nothing left to read on.
        vec3  hueT = pal(hue0 + u * 0.26 + hv * 0.08) * vec3(0.88, 1.16, 1.02);

        col  += hueT * tierMask * (1.15 + 1.60 * glow) * (0.50 + 1.10 * h1 * h1) * briM;
        stippleCov  += tierMask;
        hotC += tierMask * step(0.90, h1);
    }

    // --- Shared core ----------------------------------------------------------
    // Beaded vertical axis running the height of the spire. Neither it nor the
    // spray changes species; they are what holds the spire together while the
    // tiers turn over.
    float axw = 0.0017 * (1.0 - 0.4 * smoothstep(-0.28, 0.30, uv.y));
    float bead = 1.0 - smoothstep(0.20, 0.38, abs(fract(uv.y * 30.0 - ph * 4.0) - 0.5));
    float axis = (1.0 - smoothstep(axw * (1.0 + 2.2 * bead), axw * (1.0 + 2.2 * bead) + 0.0016, abs(uv.x)))
               * (1.0 - smoothstep(0.30, 0.345, abs(uv.y - 0.012)));

    // Bounded spray of white motes hanging around the spire. Sparse, and the
    // envelope reaches zero well inside the frame.
    vec2  sg  = uv * (pitch * 0.55);
    vec2  sgi = floor(sg);
    vec2  sgf = fract(sg) - 0.5;
    float s1  = hash21(sgi + 71.3);
    float s2  = hash21(sgi + 13.9);
    float sp  = (1.0 - smoothstep(0.10, 0.24, length(sgf - (vec2(s1, s2) - 0.5) * 0.7)))
              * step(0.955 - 0.10 * sprayF, s2)
              * (1.0 - smoothstep(0.20, 0.415, r));

    vec3 white = vec3(1.00, 0.99, 0.96);
    col += white * min(hotC, 1.5) * 0.55
         + mix(pal(hue0 + 0.5), white, 0.62) * axis * 0.70
         + white * sp * (0.85 + 1.30 * sprayF);

    // Soft knee: nine tiers overlap along the axis.
    col = col / (1.0 + col * 0.28);

    // Radial safety bound. The plate form is the widest tier, at 0.290 span *
    // 1.045 breath * 0.864 profile * 1.08 hash * 1.15 radius, which is 0.325, so
    // this fade only ever feathers the spray as it did before.
    float rim = 1.0 - smoothstep(0.420, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (min(stippleCov, 1.3) * 0.95 + axis * 0.90 + sp * 0.85
                 + min(hotC, 1.0) * 0.35) * rim;
    alpha = smoothstep(0.020, 0.92, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
