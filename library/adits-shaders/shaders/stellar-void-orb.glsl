/*{
  "ADITS": 1,
  "DESCRIPTION": "A luminous nebula orb that pulses and morphs between four cosmic archetypes, reacting to audio bands.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "neon", "nebula"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "sens", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.15, "MAX": 1.0, "LABEL": "Spectral Gain" },
    { "NAME": "snap", "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.0, "MAX": 1.0, "LABEL": "Onset Drive" },
    { "NAME": "rest", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.0, "MAX": 1.0, "LABEL": "Resting Form" },
    { "NAME": "glowSz", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.20, "MAX": 0.80, "LABEL": "Glow Radius", "BIND": "bass", "BIND_DEPTH": 0.30 },
    { "NAME": "wave", "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.50, "MAX": 1.80, "LABEL": "Orb Flex", "BIND": "mid", "BIND_DEPTH": 0.40 },
    { "NAME": "freq", "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.20, "MAX": 1.20, "LABEL": "Spire Frequency", "BIND": "treble", "BIND_DEPTH": 0.45 }
  ]
}*/

#define PI 3.14159265359
#define TAU 6.28318530718

void main() {
    // canonical preamble
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // loop phase
    float ph = fract(TIME / 12.0);

    float r = length(uv);
    float theta = atan(uv.y, uv.x);

    // audio selector
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    float audioActive = smoothstep(0.015, 0.10, lo + md + hi);
    sel = mix(rest, sel, audioActive);

    // weights for four archetypes
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

    // palette
    vec3 colBlue   = vec3(0.2, 0.4, 1.0);
    vec3 colPurple = vec3(0.7, 0.2, 1.0);
    vec3 colPink   = vec3(1.0, 0.3, 0.6);
    vec3 colCyan   = vec3(0.0, 0.9, 1.0);
    vec3 colWhite  = vec3(1.0);

    vec3 colAccum = vec3(0.0);
    float alphaAccum = 0.0;

    // Archetype 0: Radiant core pulsing with bass
    {
        float core = smoothstep(0.02, 0.0, r - 0.1 - 0.02 * sin(ph * TAU * 2.0));
        vec3 mCol = colBlue * (1.0 + 1.2 * AUDIO_BASS);
        colAccum += mCol * core * w0;
        alphaAccum += core * w0;
    }

    // Archetype 1: Twisting spiral driven by mid
    {
        float spiral = smoothstep(0.015, 0.0, abs(r - 0.25 - 0.08 * sin(4.0 * theta + ph * TAU * wave)));
        vec3 mCol = colPurple * (1.0 + 0.8 * AUDIO_MID);
        colAccum += mCol * spiral * w1;
        alphaAccum += spiral * w1;
    }

    // Archetype 2: Burst of spikes on treble
    {
        float spikes = pow(max(cos(theta * 12.0 + ph * TAU * 2.0), 0.0), 30.0) * step(r, 0.4);
        float freqMod = sin(r * 180.0 * freq);
        float active = spikes * smoothstep(0.1, 0.9, abs(freqMod));
        vec3 mCol = colPink * (1.1 + 1.5 * snap * AUDIO_HAT);
        colAccum += mCol * active * w2;
        alphaAccum += active * w2;
    }

    // Archetype 3: Glowing halo with combined audio
    {
        float halo = smoothstep(0.04, 0.0, r - 0.35);
        vec3 mCol = mix(colCyan, colWhite, AUDIO_LEVEL) * (1.3 + 1.0 * AUDIO_VOL);
        colAccum += mCol * halo * w3;
        alphaAccum += halo * w3;
    }

    // Center hub (always present)
    float hub = smoothstep(0.038, 0.005, r);
    vec3 hubCol = mix(colCyan, colPurple, sel) * (1.3 + 1.5 * AUDIO_BEAT) + colWhite * smoothstep(0.012, 0.0, r);
    colAccum = mix(colAccum, hubCol, hub);
    alphaAccum = max(alphaAccum, hub);

    // Edge mask
    float outerLimit = 0.455 * (glowSz * 2.0);
    float boundsMask = smoothstep(outerLimit, outerLimit - 0.025, r);
    alphaAccum *= boundsMask;
    alphaAccum = clamp(alphaAccum, 0.0, 1.0);

    // premultiply
    colAccum *= alphaAccum;

    gl_FragColor = vec4(colAccum, alphaAccum);
}
