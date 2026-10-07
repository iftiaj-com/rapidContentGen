/*{
  "ADITS": 1,
  "DESCRIPTION": "A six-petal bloom with three sparks orbiting it, the sparks unchanging. The petal profile is one lobe field under five interpolated numbers, so the bloom morphs by deforming, not cross-fading, through four forms: round bulb, six-petal bloom, starburst, needle star. Bass rounds it into a bulb, treble hones it to needles, and the change crosses the bloom as a wave. Rests as the six-petal bloom.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-20",
  "CATEGORIES": ["generative", "morph", "bloom", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 8.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "petals", "TYPE": "float", "DEFAULT": 6.0,  "MIN": 3.0,  "MAX": 12.0,
      "LABEL": "Petals" },
    { "NAME": "bloom",  "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.15, "MAX": 0.38,
      "LABEL": "Bloom Size", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "edge",   "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Edge Sharpness", "BIND": "treble", "BIND_DEPTH": 0.7 },
    { "NAME": "tint",   "TYPE": "color", "DEFAULT": [0.35, 1.00, 0.45, 1.00],
      "LABEL": "Tint" }
  ]
}*/

#define TAU 6.28318530718

// How far the selector is spread across the bloom. The change then crosses it
// as a wave instead of flipping every petal at once.
#define STAGGER 1.05

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Phase wraps exactly at LOOP = 8 s, so the object loops seamlessly. Nothing
    // on the morph path reads it: which bloom this is belongs to the music.
    float t = TIME * (TAU / 8.0);

    float r = length(uv);
    float a = atan(uv.y, uv.x);          // computed once, never in a loop

    // --- Selector -------------------------------------------------------------
    // Balance decides which bloom; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // hones the bloom to needles, a kick rounds it into a bulb.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // Stagger. This bloom is one continuous field rather than a set of separate
    // petals, so the wave has to be continuous too: both terms below are smooth
    // and TAU-periodic, which leaves no seam anywhere while still landing each
    // petal somewhere different on the selector axis.
    float uS  = 0.5 - 0.5 * cos(a);
    float jit = 0.25 * sin(a * 2.0 + 1.1) + 0.25 * sin(a * 3.0 + 2.7);
    float xj  = clamp(sel * 3.0 + STAGGER * (0.62 * (uS - 0.5) + 0.38 * jit), 0.0, 3.0);

    // Triangular weights of slope 1.85. Support is 1/1.85 either side of a centre
    // and the centres are spaced 1.0, so neighbours overlap over 2/1.85 - 1 = 0.081
    // of the axis and the sum is never zero. The slope must stay below 2.0 or the
    // normalisation below divides by nothing.
    float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One lobe field, five interpolated numbers, so the
    // outline deforms and no fragment ever shows two blooms at half alpha.
    //             bulb       bloom      burst      needle
    float expM = 0.45 * w0 + 1.00 * w1 + 1.70 * w2 + 3.00 * w3;   // lobe sharpness
    float dptM = 0.22 * w0 + 0.45 * w1 + 0.62 * w2 + 0.80 * w3;   // lobe depth
    float rchM = 0.78 * w0 + 1.00 * w1 + 1.08 * w2 + 1.14 * w3;   // reach
    float bwM  = 2.00 * w0 + 1.00 * w1 + 0.62 * w2 + 0.30 * w3;   // ring gauge
    float coM  = 1.60 * w0 + 1.00 * w1 + 0.80 * w2 + 0.50 * w3;   // core glow

    // Petal count is snapped: abs(cos()) has period PI, so only an integer
    // count meets itself across the atan branch cut at the negative x axis. It
    // stays out of the morph for exactly that reason.
    float pcount = floor(petals + 0.5);

    // Petal field. No loops, no raymarch. This is why COST is "low", and the
    // morph adds five multiply-adds rather than a second bloom.
    float lobe = pow(abs(cos(a * pcount * 0.5 + t)), expM / max(edge, 0.05));
    float rim  = bloom * rchM * ((1.0 - dptM) + dptM * lobe);
    float body = smoothstep(0.045 * bwM, 0.0, abs(r - rim));

    // Core glow, bounded to reach zero at 0.46, inside the frame edge at 0.5.
    float core = 0.012 * coM / (r * r + 0.004) * smoothstep(0.46, 0.0, r);

    // Three orbiting sparks: the shared part, which never changes species.
    // Constant loop bound, 3 iterations. The orbit is capped so the sparks stay
    // on screen at every reachable bloom value, and the needle form is the
    // furthest the petals themselves reach, at 0.38 * 1.14 = 0.433.
    float orbit = min(bloom * 1.35, 0.40);
    float spark = 0.0;
    for (int i = 0; i < 3; i++) {
        float k = float(i) * (TAU / 3.0) - t * 2.0;
        vec2  p = vec2(cos(k), sin(k)) * orbit;
        vec2  d = uv - p;
        // Windowed so each halo reaches exactly zero 0.09 from its spark
        // rather than trailing a faint veil across the whole frame.
        spark  += 0.0022 / (dot(d, d) + 0.0006) * smoothstep(0.008, 0.0, dot(d, d));
    }
    // AUDIO_BEAT already decays, so it is used directly as a multiplier, and
    // the 0.6 floor keeps the sparks visible in silence. One transient control
    // drives the light as well as the geometry.
    spark *= 0.6 + 0.8 * snap * AUDIO_BEAT;

    vec3 col = tint.rgb * (body * 1.5 + core * 0.9)
             + vec3(1.0, 0.96, 0.88) * spark * 0.5;

    // Coverage, then premultiply. Zero everywhere the object is not; the
    // tint's own alpha acts as a master opacity so the picker's slider works.
    float alpha = clamp(body * 0.95 + core * 0.55 + spark * 0.45, 0.0, 1.0) * tint.a;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
