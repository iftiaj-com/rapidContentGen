/*{
  "ADITS": 1,
  "DESCRIPTION": "A luminous volumetric spikeball of glowing fog, icosahedral spines breathing as one primitive under interpolated sharpness and reach, morphing through four forms: dense pollen cloud, classic mist urchin, living anemone, needle nova. Bass swells the volume, mid warps the grain, treble hones the spines. Rests as the mist urchin.",
  "CREDIT": "Cursor Grok 4.6",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "morph", "volumetric", "audio", "3d"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.62, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach", "TYPE": "float", "DEFAULT": 0.46, "MIN": 0.22, "MAX": 0.62,
      "LABEL": "Volume Reach", "BIND": "bass", "BIND_DEPTH": 0.42 },
    { "NAME": "warp",  "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.08, "MAX": 1.00,
      "LABEL": "Living Warp", "BIND": "mid", "BIND_DEPTH": 0.55 },
    { "NAME": "grain", "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Fog Grain", "BIND": "treble", "BIND_DEPTH": 0.50 }
  ]
}*/

#define TAU     6.28318530718
#define PERIOD  24.0
#define STEPS   64
#define ORBIT   5.35
#define FOCAL   1.55
#define PI      3.14159265

// Icosahedral spike directions from the original volumetric spikeball.
vec3 n4  = vec3( 0.577,  0.577,  0.577);
vec3 n5  = vec3(-0.577,  0.577,  0.577);
vec3 n6  = vec3( 0.577, -0.577,  0.577);
vec3 n7  = vec3( 0.577,  0.577, -0.577);
vec3 n8  = vec3( 0.000,  0.357,  0.934);
vec3 n9  = vec3( 0.000, -0.357,  0.934);
vec3 n10 = vec3( 0.934,  0.000,  0.357);
vec3 n11 = vec3(-0.934,  0.000,  0.357);
vec3 n12 = vec3( 0.357,  0.934,  0.000);
vec3 n13 = vec3(-0.357,  0.934,  0.000);
vec3 n14 = vec3( 0.000,  0.851,  0.526);
vec3 n15 = vec3( 0.000, -0.851,  0.526);
vec3 n16 = vec3( 0.526,  0.000,  0.851);
vec3 n17 = vec3(-0.526,  0.000,  0.851);
vec3 n18 = vec3( 0.851,  0.526,  0.000);
vec3 n19 = vec3(-0.851,  0.526,  0.000);

float gPh;
float gAng;
float gSel;
float gReach;
float gWarp;
float gGrain;
float gSharp;
float gSpike;
float gNoise;
float gBreath;
float gKick;
float gBeat;
float gC1;
float gS1;
float gC2;
float gS2;

vec3 hsv(float h, float s, float v) {
    return mix(vec3(1.0), clamp(abs(fract(h + vec3(3.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0), s) * v;
}

// Original procedural Perlin-ish noise (no textures in v1).
float pn(vec3 p) {
    vec3 i = floor(p);
    vec4 a = dot(i, vec3(1.0, 57.0, 21.0)) + vec4(0.0, 57.0, 21.0, 78.0);
    vec3 f = cos((p - i) * PI) * (-0.5) + 0.5;
    a = mix(sin(cos(a) * a), sin(cos(1.0 + a) * (1.0 + a)), f.x);
    a.xy = mix(a.xz, a.yw, f.y);
    return mix(a.x, a.y, f.z);
}

float fpn(vec3 p) {
    return pn(p * 0.06125) * 0.50 + pn(p * 0.125) * 0.25 + pn(p * 0.25) * 0.125;
}

float spikeball(vec3 p) {
    vec3 q = p;
    float lp = length(p);
    p = p / max(lp, 1.0e-4);

    vec4 b = max(max(max(
        abs(vec4(dot(p, n16), dot(p, n17), dot(p, n18), dot(p, n19))),
        abs(vec4(dot(p, n12), dot(p, n13), dot(p, n14), dot(p, n15)))),
        abs(vec4(dot(p, n8),  dot(p, n9),  dot(p, n10), dot(p, n11)))),
        abs(vec4(dot(p, n4),  dot(p, n5),  dot(p, n6),  dot(p, n7))));
    b.xy = max(b.xy, b.zw);
    float mx = max(b.x, b.y);

    // Living per-spine pulse: each icosahedral lobe breathes on its own phase.
    float live = 0.5 + 0.5 * sin(gAng * 2.0 + mx * 14.0 + p.y * 5.0 + p.x * 3.0);
    float sharp = mix(18.0, 210.0, gSharp);
    float sp = pow(mx, sharp);

    float breath = mix(0.28, 0.92, gBreath * (0.55 + 0.45 * live));
    float rad = (0.78 + 0.52 * gReach) * (1.0 + 0.10 * gKick) * (1.0 + 0.06 * live * gWarp);
    return lp - rad * pow(1.5, sp * (1.0 - breath * sp) * gSpike);
}

float map(vec3 p) {
    vec2 xy = vec2(gC1 * p.x + gS1 * p.y, -gS1 * p.x + gC1 * p.y);
    p.x = xy.x;
    p.y = xy.y;
    vec2 xz = vec2(gC2 * p.x + gS2 * p.z, -gS2 * p.x + gC2 * p.z);
    p.x = xz.x;
    p.z = xz.y;

    // Mid-driven living warp: a closed swirl, so it loops with the phase.
    float w = 0.055 + 0.12 * gWarp;
    p += w * vec3(
        sin(p.y * 2.4 + gAng),
        cos(p.z * 2.1 + gAng * 2.0),
        sin(p.x * 2.6 - gAng));

    vec3 nOff = vec3(sin(gAng), cos(gAng), sin(gAng * 2.0)) * (2.4 + 4.0 * gWarp);
    float fog = fpn(p * (28.0 + 22.0 * gGrain) + nOff) * (0.22 + 0.28 * gNoise);
    return spikeball(p) + fog;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    gPh  = fract(TIME / PERIOD);
    gAng = gPh * TAU;
    gC1  = cos(gAng);
    gS1  = sin(gAng);
    gC2  = cos(gAng);
    gS2  = sin(gAng);

    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sumA = lo + md + hi + 1.0e-3;
    float tilt = (md * 0.5 + hi) / sumA;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    float liveA = smoothstep(0.02, 0.12, sumA);
    gSel = mix(rest, sel, liveA);

    float w0 = max(1.0 - abs(gSel - 0.00) * 1.55, 0.0);
    float w1 = max(1.0 - abs(gSel - 0.33) * 1.55, 0.0);
    float w2 = max(1.0 - abs(gSel - 0.66) * 1.55, 0.0);
    float w3 = max(1.0 - abs(gSel - 1.00) * 1.55, 0.0);
    float ws = w0 + w1 + w2 + w3 + 1.0e-5;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Four archetypes, one spikeball field: pollen, mist urchin, anemone, nova.
    gSharp = w0 * 0.08 + w1 * 0.38 + w2 * 0.62 + w3 * 1.00;
    gSpike = w0 * 0.42 + w1 * 0.78 + w2 * 0.92 + w3 * 1.12;
    gNoise = w0 * 0.95 + w1 * 0.72 + w2 * 0.80 + w3 * 0.38;
    gBreath = w0 * 0.35 + w1 * 0.55 + w2 * 0.88 + w3 * 0.70;

    gReach = reach;
    gWarp  = warp;
    gGrain = grain;
    gKick  = AUDIO_KICK;
    gBeat  = AUDIO_BEAT;

    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    float bound = 1.62;
    float ca = dot(ro, rd);
    float disc = ca * ca - (dot(ro, ro) - bound * bound);
    float sq = sqrt(max(disc, 0.0));
    float tFar = disc < 0.0 ? -1.0 : -ca + sq;
    float t = max(-ca - sq, 0.0);

    vec3 tc = vec3(0.0);
    float td = 0.0;
    const float h = 0.055;

    if (tFar > 0.0) {
        vec3 p = ro + t * rd;
        for (int i = 0; i < STEPS; i++) {
            if (t > tFar || td > 0.95) break;

            float l = map(p) * 0.50;
            float ld = (h - l) * step(l, h);
            float wt = (1.0 - td) * ld;

            float lp = length(p);
            float hue = w0 * 0.08 + w1 * 0.58 + w2 * 0.78 + w3 * 0.92;
            hue += 0.10 * p.y + 0.04 * sin(gAng);
            vec3 fogCol = hsv(hue, mix(0.35, 0.85, 0.25 + lp * 0.45), 1.0);
            vec3 coreCol = mix(vec3(1.00, 0.92, 0.78), hsv(hue + 0.12, 0.45, 1.15), 0.35);
            vec3 c = mix(coreCol, fogCol, clamp(lp * 0.72, 0.0, 1.0));
            c = mix(c, vec3(1.0), 0.18 * (1.0 - clamp(lp, 0.0, 1.0)));

            tc += wt * c * (1.15 + 0.85 * gBeat);
            td += wt;

            l = max(l, 0.028);
            p += l * rd;
            t += l;
        }
    }

    float b2 = max(dot(ro, ro) - ca * ca, 0.0);
    float star = 0.020 / (b2 * 6.5 + 0.010);
    float halo = exp(-b2 * 7.5);
    vec3 nucleus = hsv(w1 * 0.55 + w2 * 0.72 + 0.06, 0.35, 1.0) * star * (0.70 + 1.40 * gBeat + 0.90 * gKick)
                 + vec3(1.00, 0.94, 0.82) * halo * (0.35 + 0.80 * gKick);
    nucleus *= 1.0 - 0.50 * td;

    tc = clamp(tc, 0.0, 1.6);
    tc = tc * tc * (3.0 - 2.0 * tc);
    td = td * td * (3.0 - 2.0 * td);

    float coreA = clamp(star * 0.85 + halo * 0.28, 0.0, 1.0);
    float alpha = clamp(td * 1.20 + coreA * 0.88, 0.0, 1.0);
    vec3 col = min((tc + nucleus) / max(alpha, 0.02), vec3(3.2));

    alpha *= 1.0 - smoothstep(0.390, 0.455, length(uv));
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
