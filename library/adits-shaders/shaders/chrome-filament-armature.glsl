/*{
  "ADITS": 1,
  "DESCRIPTION": "A hyper-reflective chrome filament armature featuring counter-rotating woven ribs surrounding a glowing cyan core. Morphs spectrally through four archetypes: heavy ribbed cage, filament solenoid, lattice spindle, and needle corona. Rests as the filament solenoid.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-25",
  "CATEGORIES": ["generative", "morph", "chrome", "filament", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "scale", "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.20, "MAX": 0.40,
      "LABEL": "Armature Scale", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "glint", "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.20, "MAX": 1.40,
      "LABEL": "Chrome Specular", "BIND": "treble", "BIND_DEPTH": 0.50 }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 16.0

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;

    float ph = fract(TIME / PERIOD);
    float t = ph * TAU;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // --- Spectral Selector ---------------------------------------------------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    float xj = sel * 3.0;
    float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3 + 1e-5;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // --- Interpolated Archetype Parameters ------------------------------------
    //              cage (0)   solenoid (1) spindle (2) corona (3)
    float ribN   =  6.0 * w0 +  12.0 * w1 +  18.0 * w2 +  24.0 * w3;
    float gauge  = 0.018 * w0 + 0.010 * w1 + 0.006 * w2 + 0.003 * w3;
    float twist  =  0.6 * w0 +   1.8 * w1 +   3.2 * w2 +   0.8 * w3;
    float pinch  =  0.3 * w0 +   0.7 * w1 +   1.2 * w2 +   0.2 * w3;
    float coreR  = 0.10 * w0 +  0.07 * w1 +  0.05 * w2 +  0.03 * w3;

    // --- Primary Outer Armature Filaments -------------------------------------
    float rad = scale * (0.85 + 0.20 * sin(t + r * 4.0));

    float a1 = a + twist * r * sin(t);
    float a2 = a - twist * r * cos(t * 2.0);

    float wave1 = abs(cos(a1 * ribN * 0.5 + t));
    float wave2 = abs(sin(a2 * ribN * 0.5 - t * 2.0));

    float profile1 = rad * (0.55 + 0.45 * wave1);
    float profile2 = rad * (0.55 + 0.45 * wave2);

    float dRib1 = abs(r - profile1);
    float dRib2 = abs(r - profile2);

    // Filament cross-section modulation
    float spike = pow(abs(sin(a * ribN * 0.5)), 1.0 + pinch * 3.0);
    float wireGauge = gauge * (0.6 + 0.8 * spike);

    // Primary wire coverage and specular rims
    float wire1Body = smoothstep(wireGauge + 0.0015, wireGauge - 0.0015, dRib1);
    float wire1Rim  = smoothstep(0.0008, 0.0025, abs(dRib1 - wireGauge)) * wire1Body;

    float wire2Body = smoothstep(wireGauge + 0.0015, wireGauge - 0.0015, dRib2);
    float wire2Rim  = smoothstep(0.0008, 0.0025, abs(dRib2 - wireGauge)) * wire2Body;

    float wireBody = max(wire1Body, wire2Body);
    float wireRim  = max(wire1Rim, wire2Rim);

    // --- Inner Solenoid Coils & Core ------------------------------------------
    float dCore = abs(r - coreR * scale * 2.8);
    float coreMod = abs(sin(a * (ribN * 0.5) + t * 3.0));
    float coreBody = smoothstep(0.005, 0.001, dCore * (1.0 + 2.5 * coreMod));

    // Concentric Nucleus Glow
    float nucleus = 0.0035 / (r * r + 0.0012) * smoothstep(0.38, 0.0, r);
    nucleus *= (0.65 + 0.35 * AUDIO_BEAT);

    // --- Chrome Specular Shading ----------------------------------------------
    float env1 = abs(sin(a1 * 3.0 + t)) * 0.5 + 0.5;
    float env2 = abs(cos(a2 * 3.0 - t)) * 0.5 + 0.5;
    float specGlint1 = pow(abs(cos(a1 * 6.0 - t * 2.0)), 16.0) * glint;
    float specGlint2 = pow(abs(sin(a2 * 6.0 + t * 2.0)), 16.0) * glint;

    vec3 darkChrome   = vec3(0.08, 0.10, 0.13);
    vec3 midChrome    = vec3(0.35, 0.40, 0.48);
    vec3 brightChrome = vec3(0.95, 0.98, 1.00);
    vec3 cyanGlow     = vec3(0.25, 0.82, 1.00);

    vec3 colWire1 = darkChrome + midChrome * env1 + brightChrome * wire1Rim * 1.8 + brightChrome * specGlint1 * 2.5;
    vec3 colWire2 = darkChrome + midChrome * env2 + brightChrome * wire2Rim * 1.8 + brightChrome * specGlint2 * 2.5;
    vec3 colWire  = mix(colWire1, colWire2, 0.5);

    vec3 colCore    = cyanGlow * coreBody * 2.2 + brightChrome * coreBody * 0.9;
    vec3 colNucleus = cyanGlow * nucleus * 1.3 + vec3(1.0) * nucleus * 0.6;

    vec3 col = colWire * wireBody + colCore + colNucleus;

    // Soft tone compression on overlapping lights
    col = col / (1.0 + col * 0.25);

    // --- Premultiplied Alpha & Radial Bounds ----------------------------------
    float alpha = clamp(wireBody * 0.95 + coreBody * 0.85 + nucleus * 0.65, 0.0, 1.0);

    // Absolute Radial Safety Mask (guaranteeing edge = 0)
    float mask = smoothstep(0.48, 0.42, r);
    col *= mask;
    alpha *= mask;

    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
