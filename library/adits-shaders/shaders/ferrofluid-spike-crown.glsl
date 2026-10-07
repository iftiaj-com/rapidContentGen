/*{
  "ADITS": 1,
  "DESCRIPTION": "Magnetic ferrofluid totem of wet black metal: smooth ovoid dome at rest, audio-driven spikes morphing from rounded lobes through ridged pods and hedgehog clusters to tall needle crown.",
  "CREDIT": "claude-opus-4.6",
  "DATE": "2026-10-02",
  "CATEGORIES": ["generative", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "reach",  "TYPE": "float", "DEFAULT": 0.26, "MIN": 0.15, "MAX": 0.34,
      "LABEL": "Reach",       "BIND": "bass",   "BIND_DEPTH": 0.35 },
    { "NAME": "spike",  "TYPE": "float", "DEFAULT": 0.28, "MIN": 0.05, "MAX": 0.50,
      "LABEL": "Spike Depth", "BIND": "mid",    "BIND_DEPTH": 0.45 },
    { "NAME": "luster", "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Luster",      "BIND": "treble", "BIND_DEPTH": 0.50 },
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.75, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Morph Gain" },
    { "NAME": "bias",   "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Shape" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float r = length(uv);
    float a = atan(uv.y, uv.x);
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

    float stagger = 0.09 * cos(a * 5.0 + 2.3) + 0.04 * cos(a * 8.0 - 1.1);
    float s3 = clamp((sel + stagger) * 3.0, 0.0, 3.0);

    float slope = 1.55;
    float w0 = smoothstep(0.0, 1.0, 1.0 - abs(s3)       * slope);
    float w1 = smoothstep(0.0, 1.0, 1.0 - abs(s3 - 1.0) * slope);
    float w2 = smoothstep(0.0, 1.0, 1.0 - abs(s3 - 2.0) * slope);
    float w3 = smoothstep(0.0, 1.0, 1.0 - abs(s3 - 3.0) * slope);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    float wobble  = sin(phase * 2.0) * 0.06;
    float breathe = sin(phase * 2.0) * 0.012;
    float drift   = sin(phase * 3.0) * 0.04;
    float aW = a + wobble;

    float svar = 0.88 + 0.12 * cos(a * 3.0 + 2.1);

    float r0 = reach + breathe
             + spike * 0.20 * svar * pow(max(cos(aW * 5.0), 0.0), 0.5);

    float r1 = reach * 0.82 + breathe
             + spike * 0.32 * svar * pow(max(cos(aW * 8.0 + drift), 0.0), 2.0);

    float r2 = reach * 0.62 + breathe
             + spike * 0.38 * svar * pow(max(cos(aW * 13.0 - drift * 0.5), 0.0), 5.0);

    float r3 = reach * 0.40 + breathe
             + spike * 0.42 * svar * pow(max(cos(aW * 21.0 + drift * 0.3), 0.0), 12.0);

    float rim = r0 * w0 + r1 * w1 + r2 * w2 + r3 * w3;

    float d = r - rim;

    float body   = 1.0 - smoothstep(-0.002, 0.004, d);
    float rimLit = (1.0 - smoothstep(0.0, 0.005, abs(d))) * luster * 1.5;
    float spec   = (1.0 - smoothstep(0.0, 0.003, abs(d + 0.002))) * luster * 0.55;

    float coreBound = 1.0 - smoothstep(0.20, 0.48, r);
    float coreGlow  = 0.002 / (r * r + 0.004) * coreBound * body;

    float outerD     = max(d, 0.0);
    float outerBound = 1.0 - smoothstep(0.42, 0.48, r);
    float outerGlow  = exp(-outerD * 35.0) * 0.18 * outerBound * smoothstep(-0.01, 0.005, d);

    vec3 rimC = vec3(0.70, 0.50, 0.28) * w0
              + vec3(0.60, 0.65, 0.70) * w1
              + vec3(0.40, 0.70, 0.95) * w2
              + vec3(0.60, 0.40, 1.00) * w3;

    vec3 bodyCol = vec3(0.015, 0.018, 0.024);

    float kick = AUDIO_KICK * 0.40;

    vec3 col = bodyCol * body
             + rimC * (rimLit + spec + kick * body)
             + vec3(0.18, 0.08, 0.02) * coreGlow
             + rimC * outerGlow * 0.30;

    float alpha = body * 0.97
                + rimLit * 0.28
                + outerGlow * 0.10
                + coreGlow * 0.15;

    float safety = 1.0 - smoothstep(0.45, 0.48, r);
    alpha = clamp(alpha * safety, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
