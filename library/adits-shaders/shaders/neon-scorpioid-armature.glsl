/*{
  "ADITS": 1,
  "DESCRIPTION": "A neon scorpioid armature with jointed skeletal ribs and a glowing energy core. Morphs through four neon forms: armoured plate, skeletal ribcage, barbed pincers, and filament nova. Bass swells the ribcage, treble sharpens the neon glow, and onsets snap the archetypes. Rests as the skeletal ribcage.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-24",
  "CATEGORIES": ["generative", "morph", "neon", "armature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    { "NAME": "sens",      "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",      "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach",     "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.20, "MAX": 0.36,
      "LABEL": "Armature Reach", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "neonGlow",  "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Neon Intensity", "BIND": "treble", "BIND_DEPTH": 0.50 },
    { "NAME": "corePower", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Core Power", "BIND": "level", "BIND_DEPTH": 0.40 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718
#define PERIOD 20.0

#define RIB_GAUGE 0.032
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;

    // Single wrapped phase for smooth seamless movement.
    float ph = fract(TIME / PERIOD);

    // Bilateral symmetry.
    vec2 p = vec2(abs(uv.x), uv.y);
    float r = length(uv);

    float breath = sin(ph * TAU);
    float swing  = sin(ph * TAU * 2.0);
    float drift  = ph * 2.0;

    float span = reach * (1.0 + 0.06 * breath);

    // Spectral selector.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    float alive = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, alive);
    float x0 = sel * 3.0;

    float pulseFlash = 0.25 + 0.95 * snap * AUDIO_KICK;

    float darkBody = 0.0;
    float neonLine = 0.0;
    float neonGlowAcc = 0.0;
    float nodeGlow = 0.0;
    float shade = 0.0;

    // 6 Rib pairs along vertical spine
    for (int i = 0; i < 6; i++) {
        float fi = float(i);
        float u  = fi / 5.0; // 0 head, 1 tail

        vec2 base = vec2(0.020 + 0.010 * u, mix(0.24, -0.22, u));
        float hv  = hash11(fi * 4.13 + 3.1);

        float xj = clamp(x0 + STAGGER * (0.65 * (u - 0.5) + 0.35 * (hv - 0.5)), 0.0, 3.0);

        float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
        float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
        float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
        float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
        float ws = w0 + w1 + w2 + w3;
        w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

        // Morphed parameters: plate, rib, pincer, filament
        float lenM = 0.72 * w0 + 1.00 * w1 + 1.12 * w2 + 1.18 * w3;
        float wM   = 2.20 * w0 + 1.00 * w1 + 0.55 * w2 + 0.22 * w3;
        float bcw  = 4.00 * w0 + 8.00 * w1 + 14.0 * w2 + 24.0 * w3;
        float lobD = 0.65 * w0 + 0.45 * w1 + 0.30 * w2 + 0.05 * w3;
        float bowM = 0.50 * w0 + 1.00 * w1 + 1.65 * w2 + 0.30 * w3;
        float bbz  = 0.10 * w0 + 0.90 * w1 + 1.75 * w2 + 0.00 * w3;

        float ang = mix(0.70, -1.05, u) + 0.15 * swing * sin(fi * 2.3 + 1.1);
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 q = p - base;
        float al = dot(q, dir);
        float pe = dot(q, vec2(-dir.y, dir.x));

        float bow = mix(-1.40, 1.90, u) * bowM;
        pe -= bow * al * al;

        float L = span * (0.80 + 0.25 * hv) * lenM;
        float an = al / L;
        float tap = clamp(1.0 - an, 0.0, 1.0);

        float bc = fract(an * bcw - drift);
        float bh = hash11(floor(an * bcw - drift) * 2.11 + fi * 5.3);
        float lob = sin(PI * clamp(bc, 0.0, 1.0));

        float w = RIB_GAUGE * wM * tap * ((1.0 - lobD) * 0.55 + lobD * 1.45 * lob) * (0.75 + 0.50 * bh);

        float br = fract(an * bcw * 3.0 - drift * 3.0);
        w *= 1.0 + 0.65 * bbz * smoothstep(0.58, 0.95, br) * smoothstep(1.05, 0.85, br);

        float ape = abs(pe);
        float live = step(0.0, an) * (1.0 - smoothstep(0.96, 1.02, an));

        // Structural core
        float m = (1.0 - smoothstep(w - 0.0016, w + 0.0016, ape)) * live;

        // Bright neon edge stroke
        float nl = (1.0 - smoothstep(0.0010, 0.0035, abs(ape - w))) * live;

        // Tight neon glow around rib edge
        float ng = 0.00015 / (abs(ape - w) * abs(ape - w) + 0.00025) * live;

        // Glowing joint nodes between vertebrae
        float nd = smoothstep(0.82, 1.00, 1.0 - lob) * (1.0 - smoothstep(w * 0.4, w * 1.6, ape)) * live;

        darkBody = max(darkBody, m);
        neonLine += nl;
        neonGlowAcc += ng;
        nodeGlow += nd;
        shade = max(shade, m * (0.35 + 0.65 * an));
    }

    // Segmented central spine
    {
        float sy = (uv.y + 0.20) / 0.54;
        float sw = 0.028 * (0.45 + 0.80 * sin(PI * clamp(sy, 0.0, 1.0)));
        float sb = fract(sy * 10.0 - drift);
        sw *= 0.55 + 0.55 * sin(PI * sb);
        float live = step(0.0, sy) * (1.0 - step(1.0, sy));

        float m = (1.0 - smoothstep(sw - 0.0016, sw + 0.0016, p.x)) * live;
        float nl = (1.0 - smoothstep(0.0010, 0.0035, abs(p.x - sw))) * live;
        float ng = 0.00015 / (abs(p.x - sw) * abs(p.x - sw) + 0.00025) * live;
        float nd = smoothstep(0.80, 1.00, 1.0 - sin(PI * sb)) * (1.0 - smoothstep(sw * 0.4, sw * 1.4, p.x)) * live;

        darkBody = max(darkBody, m);
        neonLine += nl;
        neonGlowAcc += ng;
        nodeGlow += nd;
        shade = max(shade, m * 0.50);
    }

    // Central radiant energy nucleus (shared core)
    float r2 = dot(uv, uv);
    float coreGlow = corePower * 0.014 / (r2 + 0.006) * smoothstep(0.30, 0.0, r);

    // Color family: Neon Armature (Cyan / Violet / Magenta)
    vec3 CYAN    = vec3(0.10, 0.95, 1.00);
    vec3 MAGENTA = vec3(1.00, 0.15, 0.85);
    vec3 VIOLET  = vec3(0.60, 0.20, 1.00);
    vec3 DARK    = vec3(0.03, 0.03, 0.05);

    // Color gradient across height
    float colorMix = clamp((uv.y + 0.3) / 0.6, 0.0, 1.0);
    vec3 strokeColor = mix(MAGENTA, CYAN, colorMix);

    vec3 col = DARK * darkBody * (0.6 + 1.2 * shade)
             + strokeColor * neonLine * (0.85 * neonGlow)
             + strokeColor * neonGlowAcc * (0.08 * neonGlow)
             + VIOLET * nodeGlow * (0.90 * pulseFlash)
             + mix(CYAN, VIOLET, 0.5) * coreGlow * 0.9;

    // Soft knee compression to prevent harsh clipping
    col = col / (1.0 + col * 0.25);

    // Strict boundary safety envelope (< 0.46 radius)
    float boundsMask = smoothstep(0.48, 0.42, r);
    col *= boundsMask;

    // Coverage calculation and premultiplied alpha
    float cov = (darkBody * 0.95 + min(neonLine, 1.0) * 0.85 + min(neonGlowAcc * 0.1, 0.8)
               + min(nodeGlow, 1.0) * 0.70 + min(coreGlow * 0.8, 0.9)) * boundsMask;

    float alpha = clamp(cov, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
