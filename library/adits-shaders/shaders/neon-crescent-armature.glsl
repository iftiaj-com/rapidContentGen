/*{
  "ADITS": 1,
  "DESCRIPTION": "A shifting neon armature that morphs from a gentle crescent cage at silence, to spinning ribbed tori in the mids, and erupts into glowing cyan and magenta spines on treble peaks.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "neon", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Morph Gain" },
    { "NAME": "bias",   "TYPE": "float", "DEFAULT": 0.00, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Silence Archetype" },
    { "NAME": "scale",  "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.60, "MAX": 1.20,
      "LABEL": "Arc Scale", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "warp",   "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Core Warp", "BIND": "mid", "BIND_DEPTH": 0.50 },
    { "NAME": "spines", "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Spine Extent", "BIND": "treble", "BIND_DEPTH": 0.70 }
  ]
}*/

#define TAU 6.28318530718

// Smooth triangular weight
float ease(float w) {
    return w * w * (3.0 - 2.0 * w);
}

// 2D Rotation
mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;

    // Loop period 12s
    float ph = fract(TIME / 12.0);
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    float turn = ph * TAU;
    float drift = ph; // Use base phase 0-1 for mod/fract math, scale by TAU for trig

    // Selector (spectral balance)
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;

    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    float lively = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(bias, sel, lively);

    // Onset snap
    sel = clamp(sel + 0.6 * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    // Weights
    float x = sel * 2.0;
    float w0 = ease(clamp(1.0 - abs(x)       * 1.75, 0.0, 1.0));
    float w1 = ease(clamp(1.0 - abs(x - 1.0) * 1.75, 0.0, 1.0));
    float w2 = ease(clamp(1.0 - abs(x - 2.0) * 1.75, 0.0, 1.0));
    float wsum = w0 + w1 + w2 + 1e-4;
    w0 /= wsum; w1 /= wsum; w2 /= wsum;

    // Shared parameters
    float rad = mix(0.20, 0.28, sel) * scale;
    float coreRad = mix(0.08, 0.04, sel) * scale;

    // Archetype 0: Crescent cage
    float cageCov = 0.0;
    float cageGlow = 0.0;
    for (int i = 0; i < 3; i++) {
        float ang = float(i) * TAU / 3.0;
        // Integer turn multiplier ensures full 360 rotation loops over `ph`
        vec2 p = uv * rot(ang + turn * (1.0 + float(i)));
        float d = abs(length(p - vec2(rad * 0.4, 0.0)) - rad * 0.7);
        float arc = smoothstep(0.5, 0.9, cos(atan(p.y, p.x - rad*0.4)));
        float width = 0.003 + 0.008 * warp;
        float line = 1.0 - smoothstep(width, width + 0.004, d);
        // secondary dashed line - integer frequency in sine wave over turn
        float dash = smoothstep(0.3, 0.7, sin(atan(p.y, p.x - rad*0.4) * 20.0 - turn * 4.0));
        float d2 = abs(length(p - vec2(rad * 0.4, 0.0)) - rad * 0.75);
        float line2 = (1.0 - smoothstep(0.001, 0.004, d2)) * dash * arc;

        cageCov = max(cageCov, max(line * arc, line2));
        cageGlow += (0.001 / (d + 0.001) + 0.0005 / (d2 + 0.001)) * arc;
    }

    // Archetype 1: Rotor tori
    float k1 = (a + turn * 2.0) * (12.0 / TAU);
    float i1 = mod(floor(k1), 12.0);
    float c1 = abs(fract(k1) - 0.5);
    float rad1 = rad * (0.8 + 0.2 * sin(i1 * 1.5 + turn));
    float d1 = abs(r - rad1);
    // Use `drift` (0 to 1 over LOOP) with integer scaling for fract
    float rib = smoothstep(0.2, 0.0, abs(fract(r * 40.0 - drift * 4.0) - 0.5));
    float rotorCov = (1.0 - smoothstep(0.01, 0.02, d1)) * smoothstep(0.4, 0.1, c1);
    rotorCov *= (0.3 + 0.7 * rib);
    float rotorGlow = (0.002 / (d1 + 0.002)) * smoothstep(0.45, 0.0, c1);

    // Archetype 2: Needle spines
    float k2 = (a - turn * 2.0) * (36.0 / TAU);
    float i2 = mod(floor(k2), 36.0);
    float c2 = abs(fract(k2) - 0.5);
    float spineLen = rad * (1.2 + 0.5 * sin(i2 * 2.3) + spines * 0.3);
    float spineMask = smoothstep(spineLen, spineLen * 0.2, r);
    float sW = c2 * r * (TAU / 36.0);
    float spineCov = (1.0 - smoothstep(0.001, 0.004, sW)) * spineMask;
    float beadPhase = fract(r * 15.0 - drift * 4.0 + i2 * 0.5);
    float bead = smoothstep(0.7, 0.9, beadPhase) * smoothstep(1.1, 0.9, beadPhase);
    float beadCov = (1.0 - smoothstep(0.003, 0.008, sW)) * bead * spineMask;

    float spineGlow = (0.0008 / (sW + 0.001)) * spineMask;
    spineCov = max(spineCov, beadCov * 1.5);

    // Shared Core
    float nuc = 1.0 - smoothstep(coreRad * 0.8, coreRad, r);
    float nucRing = 1.0 - smoothstep(0.0015, 0.004, abs(r - coreRad * 1.4));
    float coreGlow = (0.004 / (r + 0.002)) * (1.0 - smoothstep(0.02, 0.2, r));

    // Palettes (Neon Armature: cyan, violet, magenta)
    vec3 cyan = vec3(0.1, 0.8, 1.0);
    vec3 mag = vec3(1.0, 0.1, 0.8);
    vec3 vio = vec3(0.5, 0.1, 1.0);
    vec3 white = vec3(1.0, 0.95, 0.95);

    vec3 col0 = cyan * cageCov * 1.5 + vio * cageGlow * 1.0;
    vec3 col1 = mag * rotorCov * 1.5 + cyan * rotorGlow * 1.2 + white * rotorCov * warp;
    vec3 col2 = cyan * spineCov * 1.5 + mag * spineGlow * 1.2 + white * beadCov * 2.0;

    vec3 col = col0 * w0 + col1 * w1 + col2 * w2
             + white * nuc * 1.2
             + vio * nucRing * 1.5
             + cyan * coreGlow * 0.8;

    float cov0 = cageCov + cageGlow * 0.5;
    float cov1 = rotorCov + rotorGlow * 0.5;
    float cov2 = spineCov + spineGlow * 0.5;

    float shapeCov = cov0 * w0 + cov1 * w1 + cov2 * w2;

    // Soft knee tonemapping
    col = col / (1.0 + col * 0.25);

    // Radial bounds
    float rim = smoothstep(0.48, 0.42, r);
    col *= rim;

    float alpha = (shapeCov + nuc + nucRing + coreGlow * 0.4) * rim;
    alpha = smoothstep(0.02, 0.9, alpha);
    alpha = clamp(alpha, 0.0, 1.0);

    // Premultiply
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
