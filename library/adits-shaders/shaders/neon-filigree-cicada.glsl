/*{
  "ADITS": 1,
  "DESCRIPTION": "A hollow neon cicada drawn only in edges, its five dome arcs unchanging, wearing fourteen mirrored lens blades that each change species on their own schedule. Each is one arc under four interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: fat lens, lens blade, flat sliver, hairline. Every line still carries a hard chromatic fringe. Bass swells the frame into lenses, treble draws it to hairlines. Rests as the lens blade.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "neon", "armature", "chroma-split", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "size",   "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.82, "MAX": 1.10,
      "LABEL": "Frame Size", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "neon",   "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.25, "MAX": 1.00,
      "LABEL": "Neon Drive", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "fringe", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Chroma Fringe", "BIND": "treble", "BIND_DEPTH": 0.55 }
  ]
}*/

#define TAU 6.28318530718

// Where the hue cycle starts. It used to be a slider; the six-slot budget went
// to the morph controls instead, and this is the value it defaulted to.
#define HUE_OFF 0.35

// How far the per-blade selector is spread from crest to hip. The change then
// crosses the armature as a wave instead of flipping all fourteen at once.
#define STAGGER 1.05

// r lags, b leads. One vector, used for every dispersion cut in the file.
const vec3 CH = vec3(-1.0, 0.0, 1.0);

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

vec2 rot2(vec2 v, float a) {
    float s = sin(a), c = cos(a);
    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

vec3 pal(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}

// One neon blade: the outline of a lens built from a single circular arc
// mirrored about its own long axis. Exact, and it costs one length() call.
//   xyz = per-channel edge coverage, so the rim carries a real dispersion fringe
//   w   = the faint glass fill inside it
// u is the blade's position from crest to hip and x0 is the object's place on
// the selector axis; together they decide which of the four forms this blade is.
vec4 blade(vec2 p, vec2 c, float len, float bulge, float ang, float wid, float dsp,
           float u, float x0) {
    // Per-blade selector. u sweeps the change from crest to hip; the hash keeps
    // that sweep from looking mechanical. Both are static, so at a fixed spectrum
    // the armature holds still: the wave is positioned by the music, not the clock.
    float jt = hash11(u * 7.31 + 1.9);
    float xj = clamp(x0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (jt - 0.5)), 0.0, 3.0);

    // Triangular weights of slope 1.85. Support is 1/1.85 either side of a centre
    // and the centres are spaced 1.0, so neighbours overlap over 2/1.85 - 1 = 0.081
    // of the axis and the sum is never zero. The slope must stay below 2.0 or the
    // normalisation divides by nothing.
    float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One arc primitive, four interpolated numbers, so the
    // outline deforms and no fragment ever shows two forms at half alpha. The
    // bulge floor is deliberate: as it approaches zero the arc radius runs away
    // and dd becomes a difference of two large numbers, which loses the hairline.
    //             lens       blade      sliver     hairline
    float lenM = 0.72 * w0 + 1.00 * w1 + 1.06 * w2 + 1.12 * w3;
    float bulM = 2.10 * w0 + 1.00 * w1 + 0.55 * w2 + 0.26 * w3;
    float widM = 2.20 * w0 + 1.00 * w1 + 0.75 * w2 + 0.45 * w3;
    float filM = 1.80 * w0 + 1.00 * w1 + 0.55 * w2 + 0.10 * w3;

    len   *= lenM;
    bulge *= bulM;
    wid   *= widM;

    vec2 q = rot2(p - c, -ang);
    q.y = abs(q.y);
    // The arc through (+-len, 0) and (0, bulge). Beyond the tips the locus falls
    // below y = 0, which the fold above has already removed, so no span gate.
    float R  = (len * len + bulge * bulge) / (2.0 * bulge);
    float dd = length(q - vec2(0.0, bulge - R)) - R;
    vec3  d3 = abs(vec3(dd) - CH * dsp);
    vec3  ed = 1.0 - smoothstep(vec3(wid), vec3(wid + 0.0018), d3);
    float fill = (1.0 - smoothstep(-0.010, -0.001, dd)) * filM;
    return vec4(ed, fill);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the
    // armature and its hue wrap seamlessly on a 16 s cycle. Nothing on the morph
    // path reads it: which blade is which belongs to the music, not the clock.
    float ph = fract(TIME / 16.0);

    // Bilateral mirror, exactly as the reference armature sits.
    vec2  p = vec2(abs(uv.x), uv.y);
    float r = length(uv);

    float breath = sin(ph * TAU);
    float wob    = sin(ph * TAU * 2.0);
    float sc     = size * (1.0 + 0.040 * breath);

    // Dispersion width. This is the whole look: the fringe, not the fill.
    // Held near the line width on purpose: push it past that and the three
    // channels separate into three distinct wires instead of one wire with a
    // coloured edge, which is the difference between dispersion and a triple.
    float dsp = 0.0004 + 0.0024 * fringe;
    float wid = 0.0019;

    vec3  col = vec3(0.0);
    float cov = 0.0;   // union of every edge, for alpha
    float fil = 0.0;   // the faint glass fill inside the blades

    // Hue precesses once per loop, and shifts with the viewing direction so
    // orbiting the object sweeps the colour instead of tilting a fixed picture.
    float hue0 = ph + HUE_OFF + 0.30 * (1.0 - CAM_DIR.z);

    // --- Selector -------------------------------------------------------------
    // Balance decides which blade; loudness only decides how hard the neon runs.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws a blade down to a hairline, a kick swells it into a lens.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // Eight mirrored lens blades: two wing tiers, a crest, a leg and the inner
    // pair that forms the thorax. Explicit calls rather than a loop, because each
    // one is hand-placed and the compiler unrolls it either way.
    vec4 b1 = blade(p, vec2(0.170, 0.140) * sc, 0.150 * sc, 0.046 * sc,  0.36 + 0.06 * wob, wid, dsp, 0.18, x0);
    vec4 b2 = blade(p, vec2(0.205, 0.015) * sc, 0.170 * sc, 0.052 * sc, -0.14 - 0.06 * wob, wid, dsp, 0.42, x0);
    vec4 b3 = blade(p, vec2(0.160, -0.135) * sc, 0.140 * sc, 0.043 * sc, -0.56 + 0.07 * wob, wid, dsp, 0.72, x0);
    vec4 b4 = blade(p, vec2(0.068, 0.250) * sc, 0.090 * sc, 0.030 * sc,  1.16 - 0.08 * wob, wid, dsp, 0.00, x0);
    vec4 b5 = blade(p, vec2(0.100, -0.258) * sc, 0.110 * sc, 0.027 * sc, -1.06 - 0.05 * wob, wid, dsp, 1.00, x0);
    vec4 b6 = blade(p, vec2(0.295, 0.060) * sc, 0.088 * sc, 0.021 * sc,  0.05 + 0.09 * wob, wid, dsp, 0.36, x0);
    vec4 b7 = blade(p, vec2(0.044, 0.030) * sc, 0.105 * sc, 0.055 * sc,  1.5708, wid, dsp, 0.46, x0);
    vec4 b8 = blade(p, vec2(0.030, -0.105) * sc, 0.072 * sc, 0.030 * sc, 1.5708, wid, dsp, 0.62, x0);
    // A second, finer tier packs the frame out so it reads as filigree rather
    // than as eight lonely petals.
    vec4 c1 = blade(p, vec2(0.115, 0.195) * sc, 0.072 * sc, 0.018 * sc,  0.72 + 0.10 * wob, wid * 0.8, dsp, 0.10, x0);
    vec4 c2 = blade(p, vec2(0.245, 0.135) * sc, 0.062 * sc, 0.015 * sc,  0.30 - 0.10 * wob, wid * 0.8, dsp, 0.26, x0);
    vec4 c3 = blade(p, vec2(0.250, -0.095) * sc, 0.068 * sc, 0.016 * sc, -0.72 + 0.11 * wob, wid * 0.8, dsp, 0.68, x0);
    vec4 c4 = blade(p, vec2(0.150, -0.215) * sc, 0.058 * sc, 0.014 * sc, -0.92 - 0.09 * wob, wid * 0.8, dsp, 0.86, x0);
    vec4 c5 = blade(p, vec2(0.055, -0.180) * sc, 0.050 * sc, 0.020 * sc,  1.5708, wid * 0.8, dsp, 0.80, x0);
    vec4 c6 = blade(p, vec2(0.062, 0.088) * sc, 0.048 * sc, 0.022 * sc,  0.10, wid * 0.8, dsp, 0.30, x0);

    // Each blade gets its own hue band, so the armature is polychrome the way the
    // reference is rather than one tinted mesh.
    col += pal(hue0 + 0.00) * b1.rgb * 1.00;
    col += pal(hue0 + 0.13) * b2.rgb * 1.00;
    col += pal(hue0 + 0.27) * b3.rgb * 1.00;
    col += pal(hue0 + 0.41) * b4.rgb * 1.00;
    col += pal(hue0 + 0.55) * b5.rgb * 1.00;
    col += pal(hue0 + 0.68) * b6.rgb * 1.00;
    col += pal(hue0 + 0.79) * b7.rgb * 1.00;
    col += pal(hue0 + 0.90) * b8.rgb * 1.00;
    col += pal(hue0 + 0.06) * c1.rgb * 0.95;
    col += pal(hue0 + 0.20) * c2.rgb * 0.95;
    col += pal(hue0 + 0.34) * c3.rgb * 0.95;
    col += pal(hue0 + 0.48) * c4.rgb * 0.95;
    col += pal(hue0 + 0.62) * c5.rgb * 0.95;
    col += pal(hue0 + 0.74) * c6.rgb * 0.95;

    cov += max(b1.r, max(b1.g, b1.b)) + max(b2.r, max(b2.g, b2.b))
         + max(b3.r, max(b3.g, b3.b)) + max(b4.r, max(b4.g, b4.b))
         + max(b5.r, max(b5.g, b5.b)) + max(b6.r, max(b6.g, b6.b))
         + max(b7.r, max(b7.g, b7.b)) + max(b8.r, max(b8.g, b8.b));
    cov += max(c1.r, max(c1.g, c1.b)) + max(c2.r, max(c2.g, c2.b))
         + max(c3.r, max(c3.g, c3.b)) + max(c4.r, max(c4.g, c4.b))
         + max(c5.r, max(c5.g, c5.b)) + max(c6.r, max(c6.g, c6.b));
    fil += b1.a + b2.a + b3.a + b4.a + b5.a + b6.a + b7.a + b8.a
         + c1.a + c2.a + c3.a + c4.a + c5.a + c6.a;

    // The blade rims flash on a snare. AUDIO_SNARE already decays, so it is used
    // straight, and the floor keeps the rims lit in silence. One transient
    // control drives the light as well as the geometry.
    float snare = 1.0 + 1.6 * snap * AUDIO_SNARE;
    col += vec3(1.00, 0.98, 0.94) * (b2.g + b1.g + b7.g) * (0.14 + 0.42 * snap) * snare;

    // --- Shared core ----------------------------------------------------------
    // Five dome arcs sweeping from the hips up over the crest, each an outline
    // with the same dispersion cut so the whole frame is made of the same wire.
    // None of them changes species; they are what holds the frame together while
    // the blades turn over.
    float arcC = 0.0;
    for (int j = 0; j < 5; j++) {
        float fj = float(j);
        float R  = sc * (0.255 + 0.030 * fj);
        vec2  cc = vec2(-0.045 - 0.022 * fj, -0.055 + 0.028 * fj) * sc;
        float dd = length(p - cc) - R;
        vec3  d3 = abs(vec3(dd) - CH * dsp);
        vec3  ed = 1.0 - smoothstep(vec3(wid * 0.85), vec3(wid * 0.85 + 0.0016), d3);
        float wd = smoothstep(-0.34, -0.18, uv.y) * (1.0 - smoothstep(0.31, 0.40, uv.y))
                 * smoothstep(0.0, 0.035, p.x)
                 * (0.70 + 0.30 * sin(fj * 2.0 + ph * TAU));
        col  += pal(hue0 + 0.20 + fj * 0.11) * ed * wd * 1.15;
        arcC += max(ed.r, max(ed.g, ed.b)) * wd;
    }

    // Faint coloured glass inside the blades, so the armature is hollow but not
    // empty. Tinted, not grey: a grey fill over the crossing point reads as a
    // hole punched in the object rather than as glass.
    col += pal(hue0 + 0.52) * min(fil, 3.0) * 0.075;

    // Bright nucleus where the thorax blades cross, bounded to the middle.
    float core = (0.0022 / (dot(uv, uv) + 0.0016)) * (1.0 - smoothstep(0.015, 0.10, r));
    col += vec3(0.94, 1.00, 0.98) * core * 1.35;

    col *= (0.55 + 0.95 * neon);

    // Soft knee: eight blades and five arcs overlap through the thorax.
    col = col / (1.0 + col * 0.26);

    // Radial safety bound. The furthest thing out is the hairline form on the
    // outermost wing blade, whose tip lands at 0.450 with the frame size at its
    // ceiling, so this fade only ever feathers a tip.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (min(cov, 1.2) * 0.95 + min(arcC, 1.0) * 0.90
                 + min(fil, 1.5) * 0.12 + core * 0.60) * rim;
    alpha = smoothstep(0.020, 0.92, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
