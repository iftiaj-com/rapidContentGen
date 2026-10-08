/*{
  "ADITS": 1,
  "DESCRIPTION": "Glossy obsidian chitin astrolabe morphing spectrally between three biomechanical forms: a heavy 7-segmented trilobite carapace under bass, a 12-blade layered chitin astrolabe rotor in the mids, and a 24-spire chitin needle crest under treble. Driven by spectral tilt and onset pulses, resting at silence on the astrolabe rotor.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "biomech", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Onset Snap" },
    { "NAME": "bias",    "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Silence Archetype" },
    { "NAME": "scale",   "TYPE": "float", "DEFAULT": 0.95, "MIN": 0.80, "MAX": 1.10,
      "LABEL": "Overall Scale", "BIND": "bass", "BIND_DEPTH": 0.25 },
    { "NAME": "lume",    "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Rim Specular", "BIND": "treble", "BIND_DEPTH": 0.40 }
  ]
}*/

#define TAU 6.28318530718

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

float ease(float w) {
    return w * w * (3.0 - 2.0 * w);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    #define PERIOD 16.0
    float ph = fract(TIME / PERIOD);
    float turn = ph * TAU;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Spectral selector (§12.2)
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;

    // Expand tilt range and set gain
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);

    // Silence rest archetype (§12.7)
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(bias, sel, live);

    // Onset shoves (§12.4)
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    // Archetype weights (§12.6)
    float x = sel * 2.0;
    float w0 = ease(clamp(1.0 - abs(x) * 1.72, 0.0, 1.0));
    float w1 = ease(clamp(1.0 - abs(x - 1.0) * 1.72, 0.0, 1.0));
    float w2 = ease(clamp(1.0 - abs(x - 2.0) * 1.72, 0.0, 1.0));
    float wsum = w0 + w1 + w2 + 1e-4;
    w0 /= wsum; w1 /= wsum; w2 /= wsum;

    // Shared geometry scaling
    float sc = scale * (1.0 + 0.03 * sin(turn * 2.0));
    float reach = mix(0.24, 0.32, sel) * sc;
    float hubR = mix(0.06, 0.02, sel) * sc;

    // Archetype 0: Trilobite Carapace (Bass domain)
    float k0 = (a + sin(turn * 1.0) * 0.2) * (7.0 / TAU);
    float i0 = mod(floor(k0), 7.0);
    float c0 = abs(fract(k0) - 0.5);
    float h0 = hash11(i0 * 1.61 + 2.3);
    float e0 = reach * (0.85 + 0.25 * h0) * (1.0 - 1.30 * c0 * c0);
    float body0 = 1.0 - smoothstep(e0 - 0.004, e0 + 0.004, r);
    float rim0 = 1.0 - smoothstep(0.002, 0.006, abs(r - e0));
    float seg0 = (1.0 - smoothstep(0.15, 0.35, abs(fract(r / max(e0, 0.02) * 4.0 - ph * 2.0) - 0.5))) * body0;

    // Archetype 1: Chitin Astrolabe Rotor (Mid domain - Silence default)
    float k1 = (a - turn * 1.0) * (12.0 / TAU);
    float i1 = mod(floor(k1), 12.0);
    float sd1 = abs(fract(k1) - 0.5) * (TAU / 12.0) * r;
    float h1 = hash11(i1 * 3.17 + 1.1);
    float L1 = reach * (0.65 + 0.20 * h1);
    float t1 = r / max(L1, 0.001);
    float pl1 = fract(t1 * 14.0 - ph * 3.0 - sd1 * 10.0);
    float w1g = 0.048 * clamp(1.0 - t1, 0.0, 1.0) * (0.30 + 0.80 * smoothstep(0.0, 0.22, t1)) * (0.60 + 0.50 * pl1);
    float mask1 = smoothstep(0.015, 0.035, r) * (1.0 - smoothstep(0.96, 1.01, t1));
    float body1 = (1.0 - smoothstep(w1g, w1g + 0.002, sd1)) * mask1;
    float rim1 = (1.0 - smoothstep(0.001, 0.0035, abs(sd1 - w1g))) * mask1;

    // Archetype 2: Chitin Needle Crest (Treble domain)
    float k2 = (a + turn * 2.0) * (24.0 / TAU);
    float i2 = mod(floor(k2), 24.0);
    float sd2 = abs(fract(k2) - 0.5) * (TAU / 24.0) * r;
    float h2 = hash11(i2 * 2.13 + 5.7);
    float L2 = reach * (0.75 + 0.30 * h2);
    float t2 = r / max(L2, 0.001);
    float w2g = 0.0028 * (1.0 - 0.55 * clamp(t2, 0.0, 1.0));
    float mask2 = smoothstep(0.01, 0.025, r) * (1.0 - smoothstep(0.95, 1.01, t2));
    float body2 = (1.0 - smoothstep(w2g, w2g + 0.0015, sd2)) * mask2;
    float bd2 = fract(t2 * 16.0 - ph * 4.0 + h2);
    float bead2 = smoothstep(0.65, 0.95, bd2) * smoothstep(1.05, 0.90, bd2);
    float crest2 = (1.0 - smoothstep(w2g * 3.0, w2g * 3.0 + 0.0015, sd2)) * bead2 * mask2;

    // Shared Core Nucleus (§12.6)
    float nuc = 1.0 - smoothstep(hubR * 0.85, hubR, r);
    float nucRim = 1.0 - smoothstep(0.0015, 0.0045, abs(r - hubR));
    float coreGlow = (0.0015 / (dot(uv, uv) + 0.0018)) * (1.0 - smoothstep(0.02, 0.14, r));

    // Palettes - Obsidian Biomech Family
    vec3 obsidianBase = vec3(0.025, 0.030, 0.040);
    vec3 cyanRim      = vec3(0.35, 0.85, 0.95);
    vec3 steelRim     = vec3(0.75, 0.82, 0.92);
    vec3 goldSpecular = vec3(1.00, 0.88, 0.60);
    vec3 whiteLight   = vec3(0.98, 0.98, 0.95);

    float em = 0.50 + 1.10 * lume;

    vec3 col0 = obsidianBase * body0 * 1.5
              + cyanRim * rim0 * (0.50 * em)
              + steelRim * seg0 * (0.25 * em);

    vec3 col1 = obsidianBase * body1 * 1.2
              + steelRim * body1 * (0.35 * em)
              + goldSpecular * rim1 * (0.65 * em);

    vec3 col2 = cyanRim * body2 * (0.90 * em)
              + whiteLight * crest2 * (0.95 * em);

    float cov0 = min(body0 + rim0 * 0.75, 1.2);
    float cov1 = min(body1 + rim1 * 0.65, 1.2);
    float cov2 = min(body2 * 0.95 + crest2 * 0.75, 1.2);

    vec3 col = col0 * w0 + col1 * w1 + col2 * w2
             + whiteLight * nuc * 0.90
             + cyanRim * nucRim * (0.35 * em)
             + whiteLight * coreGlow * (0.40 * em);

    float shapeCov = cov0 * w0 + cov1 * w1 + cov2 * w2;

    // Tone map soft knee
    col = col / (1.0 + col * 0.25);

    // Absolute extent smoothstep bound (§10 & memory)
    float extentMask = 1.0 - smoothstep(0.42, 0.478, r);
    col *= extentMask;

    // Coverage & Premultiplied Alpha (§8)
    float alpha = (shapeCov * 1.00 + nuc * 1.00 + nucRim * 0.60 + coreGlow * 0.40) * extentMask;
    alpha = smoothstep(0.015, 0.88, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
