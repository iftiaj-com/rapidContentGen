/*{
  "ADITS": 1,
  "DESCRIPTION": "A bioluminescent neon plasma anemone whose waving electric tentacles morph across four discharge states under spectral balance. Heavy coiled violet arcs under bass give way to twisting cyan tentacles, a double-helix crown, and high-frequency xenon spires under treble.",
  "CREDIT": "Gemini 3.5 Flash",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "neon", "plasma", "creature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "glowSz",  "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.20, "MAX": 0.80,
      "LABEL": "Glow Radius", "BIND": "bass", "BIND_DEPTH": 0.30 },
    { "NAME": "wave",    "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.50, "MAX": 1.80,
      "LABEL": "Tentacle Flex", "BIND": "mid", "BIND_DEPTH": 0.40 },
    { "NAME": "freq",    "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.20, "MAX": 1.20,
      "LABEL": "Discharge Freq", "BIND": "treble", "BIND_DEPTH": 0.45 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Seamless loop phase (12.0s period)
    float ph = fract(TIME / 12.0);

    // Polar coordinates
    float r = length(uv);
    float theta = atan(uv.y, uv.x);

    // --- Audio Spectral Selector -----------------------------------------------
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // Onsets: hat drives spires, kick drives coiling arcs
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // Silence rests on chosen resting form
    float audioActive = smoothstep(0.015, 0.10, lo + md + hi);
    sel = mix(rest, sel, audioActive);

    // Archetype weights (4 distinct morphological states)
    float k0 = clamp(1.0 - abs(sel - 0.00) / 0.35, 0.0, 1.0);
    float k1 = clamp(1.0 - abs(sel - 0.33) / 0.35, 0.0, 1.0);
    float k2 = clamp(1.0 - abs(sel - 0.67) / 0.35, 0.0, 1.0);
    float k3 = clamp(1.0 - abs(sel - 1.00) / 0.35, 0.0, 1.0);
    float w0 = smoothstep(0.0, 1.0, k0);
    float w1 = smoothstep(0.0, 1.0, k1);
    float w2 = smoothstep(0.0, 1.0, k2);
    float w3 = smoothstep(0.0, 1.0, k3);
    float wSum = w0 + w1 + w2 + w3 + 1e-4;
    w0 /= wSum; w1 /= wSum; w2 /= wSum; w3 /= wSum;

    // Neon colors
    vec3 colViolet = vec3(0.65, 0.15, 1.00); // Xenon Violet
    vec3 colCyan   = vec3(0.15, 0.85, 1.00); // Argon Cyan
    vec3 colMagenta= vec3(1.00, 0.10, 0.55); // Neon Magenta
    vec3 colGreen  = vec3(0.20, 0.95, 0.40); // Krypton Green
    vec3 colWhite  = vec3(1.00, 1.00, 1.00); // Specular core

    vec3 colAccum = vec3(0.0);
    float alphaAccum = 0.0;

    // --- Archetype 0: Coiled Violet Arcs (Bass mode) ---------------------------
    {
        // 3 concentric swirling arcs modulated by time and angle
        float arc1 = smoothstep(0.024, 0.002, abs(r - (0.12 + 0.08 * sin(theta * 3.0 + ph * TAU))));
        float arc2 = smoothstep(0.018, 0.002, abs(r - (0.24 + 0.06 * sin(theta * 4.0 - ph * TAU * 2.0))));
        float arc3 = smoothstep(0.012, 0.002, abs(r - (0.34 + 0.04 * sin(theta * 5.0 + ph * TAU * 3.0))));

        float arcs = max(max(arc1, arc2), arc3) * smoothstep(0.40, 0.36, r);
        vec3 mCol0 = mix(colViolet, colMagenta, sin(r * 12.0) * 0.5 + 0.5) * (1.0 + 1.2 * AUDIO_BASS);

        colAccum += mCol0 * arcs * w0;
        alphaAccum += arcs * w0;
    }

    // --- Archetype 1: Waving Plasma Tentacles (Melody / Groove mode) -----------
    {
        // 24 twisting tentacles waving in counter-rotations
        float waves = sin(theta * 24.0 + 8.0 * sin(r * 10.0 - ph * TAU * wave));
        float tentacle = smoothstep(0.012, 0.002, abs(waves * r - 0.03)) * step(r, 0.42) * smoothstep(0.02, 0.06, r);

        // Pulsing glow along the tentacles
        vec3 mCol1 = mix(colCyan, colViolet, r * 2.0) * (0.8 + 0.8 * AUDIO_MID);

        colAccum += mCol1 * tentacle * w1;
        alphaAccum += tentacle * w1;
    }

    // --- Archetype 2: Double-Helix Crown (Melody / Harmony mode) ----------------
    {
        // Intersecting counter-rotating spiral helices
        float h1 = sin(theta * 4.0 - r * 22.0 + ph * TAU * 2.0);
        float h2 = sin(theta * 4.0 + r * 22.0 - ph * TAU * 2.0);
        float helix = smoothstep(0.018, 0.004, abs(h1 * h2 * r - 0.015)) * step(r, 0.40) * smoothstep(0.03, 0.08, r);

        // Chromatic split effect: shift phases slightly
        float c2R = smoothstep(0.018, 0.004, abs(h1 * h2 * r - 0.013));
        float c2B = smoothstep(0.018, 0.004, abs(h1 * h2 * r - 0.017));

        vec3 mCol2 = vec3(c2R, helix, c2B) * colMagenta * (0.9 + 0.9 * AUDIO_MID);

        colAccum += mCol2 * helix * w2;
        alphaAccum += helix * w2;
    }

    // --- Archetype 3: Xenon Corona Spires (High Treble / Hi-hat mode) ----------
    {
        // High frequency spires shooting outwards
        float spires = pow(max(cos(theta * 16.0 + ph * TAU * 2.0), 0.0), 30.0) * step(r, 0.44) * smoothstep(0.02, 0.08, r);
        float discharge = sin(r * 160.0 * freq);
        float activeSpires = spires * smoothstep(0.1, 0.9, abs(discharge));

        vec3 mCol3 = mix(colGreen, colCyan, r * 2.0) * (1.1 + 1.5 * snap * AUDIO_HAT);

        colAccum += mCol3 * activeSpires * w3;
        alphaAccum += activeSpires * w3;
    }

    // --- Center Glowing Polyp Hub ---------------------------------------------
    float hub = smoothstep(0.038, 0.005, r);
    vec3 hubCol = mix(colCyan, colMagenta, sel) * (1.3 + 1.5 * AUDIO_BEAT)
                + colWhite * smoothstep(0.012, 0.0, r);

    colAccum = mix(colAccum, hubCol, hub);
    alphaAccum = max(alphaAccum, hub);

    // --- Strict Spatial Silhouette & Edge Falloff -----------------------------
    // Keep entire object bounded strictly inside 0.46 (glowSz scale factor applies)
    float outerLimit = 0.455 * (glowSz * 2.0);
    float boundsMask = smoothstep(outerLimit, outerLimit - 0.025, r);

    alphaAccum *= boundsMask;
    alphaAccum = clamp(alphaAccum, 0.0, 1.0);

    // Premultiply alpha
    colAccum *= alphaAccum;

    gl_FragColor = vec4(colAccum, alphaAccum);
}
