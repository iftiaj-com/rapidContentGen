/*{
  "ADITS": 1,
  "DESCRIPTION": "Ring of sixteen neon pendulums at harmonic frequencies, weaving mesmerizing alignment waves. Rests as warm amber necklace, bass thickens to heavy chained orbs, treble scatters to bright spark constellation.",
  "CREDIT": "claude-opus-4.6",
  "DATE": "2026-10-02",
  "CATEGORIES": ["generative", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "ring",  "TYPE": "float", "DEFAULT": 0.22, "MIN": 0.10, "MAX": 0.30,
      "LABEL": "Ring Radius", "BIND": "bass",   "BIND_DEPTH": 0.30 },
    { "NAME": "swing", "TYPE": "float", "DEFAULT": 0.055, "MIN": 0.01, "MAX": 0.09,
      "LABEL": "Swing Depth", "BIND": "mid",    "BIND_DEPTH": 0.40 },
    { "NAME": "glow",  "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.15, "MAX": 0.90,
      "LABEL": "Glow",        "BIND": "treble", "BIND_DEPTH": 0.45 },
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.72, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Morph Gain" },
    { "NAME": "bias",  "TYPE": "float", "DEFAULT": 0.20, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Shape" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define N_BOBS 16
#define BASE_FREQ 8.0

float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float t = clamp(dot(pa, ba) / (dot(ba, ba) + 1e-6), 0.0, 1.0);
    return length(pa - ba * t);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float r = length(uv);
    float phase = fract(TIME / PERIOD) * TAU;

    float lo = smoothstep(0.04, 0.95, AUDIO_BASS);
    float md = smoothstep(0.04, 0.95, AUDIO_MID);
    float hi = smoothstep(0.04, 0.95, AUDIO_TREBLE);

    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;

    float x = (tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5;
    x += 0.25 * (AUDIO_HAT - AUDIO_KICK);
    float sel = smoothstep(0.0, 1.0, x);

    float live = smoothstep(0.02, 0.12, max(lo + md + hi, AUDIO_LEVEL));
    sel = mix(bias, sel, live);

    float slope = 1.55;

    float coreBound = 1.0 - smoothstep(0.30, 0.48, r);
    float coreGlow = 0.08 * exp(-r * r / 0.005) * coreBound;
    float kick = AUDIO_KICK * 0.50;
    vec3 coreCol = vec3(0.9, 0.75, 0.5) * coreGlow * (1.0 + kick);

    float trackFade = (1.0 - smoothstep(0.0, 0.004, abs(r - ring))) * 0.04;
    vec3 trackCol = vec3(0.3, 0.35, 0.4) * trackFade;

    vec3 totalCol = coreCol + trackCol;
    float totalAlpha = coreGlow * 0.20 + trackFade * 0.06;

    float safetyOuter = 1.0 - smoothstep(0.44, 0.48, r);

    for (int i = 0; i < N_BOBS; i++) {
        float fi = float(i);
        float angle = fi / float(N_BOBS) * TAU;
        float freq = BASE_FREQ + fi;

        float nextIdx = fi + 1.0;
        if (i == N_BOBS - 1) nextIdx = 0.0;
        float nextAngle = nextIdx / float(N_BOBS) * TAU;
        float nextFreq = BASE_FREQ + nextIdx;

        float stagger = 0.08 * cos(fi * TAU / float(N_BOBS) * 3.0 + 1.7);
        float localSel = clamp(sel + stagger, 0.0, 1.0);
        float s3 = localSel * 3.0;

        float lw0 = max(1.0 - abs(s3)       * slope, 0.0);
        float lw1 = max(1.0 - abs(s3 - 1.0) * slope, 0.0);
        float lw2 = max(1.0 - abs(s3 - 2.0) * slope, 0.0);
        float lw3 = max(1.0 - abs(s3 - 3.0) * slope, 0.0);
        float lws = lw0 + lw1 + lw2 + lw3;
        lw0 /= lws; lw1 /= lws; lw2 /= lws; lw3 /= lws;

        float bobSize = 0.028 * lw0 + 0.018 * lw1 + 0.011 * lw2 + 0.005 * lw3;
        float lineStr = 0.80 * lw0 + 0.45 * lw1 + 0.15 * lw2 + 0.0 * lw3;

        vec3 bobTint = vec3(1.0, 0.65, 0.15) * lw0
                     + vec3(0.25, 0.90, 0.75) * lw1
                     + vec3(0.30, 0.50, 1.00) * lw2
                     + vec3(0.80, 0.35, 1.00) * lw3;

        float hueOff = fi * 0.4;
        vec3 iridescent = vec3(
            0.5 + 0.5 * cos(hueOff),
            0.5 + 0.5 * cos(hueOff + 2.1),
            0.5 + 0.5 * cos(hueOff + 4.2)
        );
        bobTint = mix(bobTint, bobTint * iridescent, 0.25);

        float swI = sin(phase * freq) * swing;
        vec2 bobPos = vec2(cos(angle), sin(angle)) * (ring + swI);

        float bd = length(uv - bobPos);
        float coreSig2 = bobSize * bobSize * 1.5;
        float bobCore = glow * 1.8 * exp(-bd * bd / coreSig2);
        float bobHalo = glow * 0.25 * exp(-bd * bd / 0.0008);
        float bobGlow = (bobCore + bobHalo) * safetyOuter;

        float swN = sin(phase * nextFreq) * swing;
        vec2 nextPos = vec2(cos(nextAngle), sin(nextAngle)) * (ring + swN);

        float ld = segDist(uv, bobPos, nextPos);
        float lineW = 0.003 * (0.5 + 0.5 * lw0);
        float lineGlow = glow * 0.30 * exp(-ld * ld / 0.0003) * lineStr;
        lineGlow *= safetyOuter;

        float snareFlash = AUDIO_SNARE * 0.25 * bobSize * 8.0;
        bobGlow *= 1.0 + snareFlash;

        totalCol += bobTint * (bobGlow + lineGlow * 0.5);
        totalAlpha += bobGlow * 0.45 + lineGlow * 0.12;
    }

    float alpha = clamp(totalAlpha, 0.0, 1.0);
    vec3 col = totalCol;

    col = col / (1.0 + col * 0.3);

    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
