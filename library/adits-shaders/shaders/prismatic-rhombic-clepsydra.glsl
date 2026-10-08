/*{
  "ADITS": 1,
  "DESCRIPTION": "A dual-conical rhombic crystal clepsydra: resting as a sealed faceted hourglass, unspooling into counter-rotating interlocking crystal rings, and expanding into a stellated prismatic lattice with orbiting gem beads as the spectrum brightens.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "prismatic"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",   "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",    "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "waist",        "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.10, "MAX": 0.75,
      "LABEL": "Clepsydra Waist", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "twist",        "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Lobe Twist", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "dispersion",   "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Prismatic Dispersion", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "crystal_tint", "TYPE": "color", "DEFAULT": [0.75, 0.88, 1.00, 1.00],
      "LABEL": "Crystal Tint" },
    { "NAME": "core_tint",    "TYPE": "color", "DEFAULT": [1.00, 0.40, 0.70, 1.00],
      "LABEL": "Core Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.80
#define BOUND  1.08

void pR(inout vec2 p, float a) {
    p = cos(a) * p + sin(a) * vec2(p.y, -p.x);
}

bool sph(vec3 ro, vec3 rd, float ra, out float t0, out float t1) {
    t0 = 0.0;
    t1 = 0.0;
    float b = dot(ro, rd);
    float c = dot(ro, ro) - ra * ra;
    float h = b * b - c;
    if (h < 0.0) return false;
    h = sqrt(h);
    t0 = -b - h;
    t1 = -b + h;
    return t1 > 0.0;
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float g_ph, g_waistVal, g_twistVal, g_stella, g_beads, g_gap;

float map(vec3 p) {
    float sy = sign(p.y);
    float ay = abs(p.y);

    // Counter-rotating twist between upper and lower conical bells
    float twistAng = (ay * 2.2 + g_ph) * g_twistVal * sy;
    vec2 pxz = p.xz;
    pR(pxz, twistAng);

    // 8-fold radial symmetry with bilateral sector mirroring to eliminate sign-flip seams
    float ang = atan(pxz.y, pxz.x + 1e-7);
    float sector = TAU / 8.0;
    float a = mod(ang + sector * 0.5, sector) - sector * 0.5;
    a = abs(a);

    float r = length(pxz);

    // Dual-conical hourglass profile radius along Y
    float profileR = g_waistVal + 0.46 * pow(max(ay, 1e-5), 1.35);

    // Rhombic facets modulation
    float facet = cos(a * 8.0) * (0.028 + 0.070 * g_stella);
    profileR += facet;

    // Archetype 2: Interlocking ring gaps along Y
    float ringPattern = abs(sin(ay * 14.0 - g_ph * 2.0));
    float gapCut = (1.0 - smoothstep(0.0, 0.35, ringPattern)) * g_gap;

    // Base Clepsydra vessel volume with faceted caps
    float dBody = r - (profileR - gapCut);
    float dCap = ay - (0.65 - 0.035 * cos(a * 8.0));
    float dVessel = max(dBody, dCap);

    // Archetype 3: Orbiting gem beads around the waist
    float dBeads = 1e9;
    if (g_beads > 0.01) {
        for (int i = 0; i < 6; i++) {
            float fi = float(i);
            float ba = fi * (TAU / 6.0) + g_ph * 1.5;
            float orbR = (g_waistVal + 0.22) * (1.0 + 0.08 * sin(ba * 3.0 + g_ph));
            vec3 beadPos = vec3(cos(ba) * orbR, 0.12 * sin(ba * 2.0 - g_ph), sin(ba) * orbR);
            float dS = length(p - beadPos) - 0.052 * g_beads;
            dBeads = min(dBeads, dS);
        }
    }

    // Central energy nucleus
    float dCore = length(p) - (0.10 + 0.05 * g_waistVal);

    float dTotal = smin(dVessel, dBeads, 0.08);
    dTotal = smin(dTotal, dCore, 0.06);

    return dTotal * 0.75;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.005;
    vec3 v = k.xyy * map(p + k.xyy * e) +
             k.yyx * map(p + k.yyx * e) +
             k.yxy * map(p + k.yxy * e) +
             k.xxx * map(p + k.xxx * e);
    return length(v) > 1e-5 ? normalize(v) : vec3(0.0, 1.0, 0.0);
}

vec3 envPrismatic(vec3 r) {
    float up = r.y;
    vec3 c = mix(vec3(0.02, 0.03, 0.05),
                 crystal_tint.rgb * (0.85 + 0.65 * up),
                 smoothstep(-0.35, 0.45, up));
    c += vec3(1.0, 0.98, 0.95) * smoothstep(0.08, 0.0, abs(up - 0.02)) * 1.20;
    c += vec3(1.0, 0.96, 0.92) * pow(max(dot(r, normalize(vec3(0.45, 0.78, 0.42))), 1e-5), 48.0) * 4.5;
    c += core_tint.rgb * pow(max(dot(r, normalize(vec3(-0.58, 0.28, -0.54))), 1e-5), 16.0) * 1.60;
    return c;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = 1.0 - smoothstep(0.442, 0.478, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- spectral morph selector (guide 12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, sum);
    sel = mix(rest_form, sel, live);

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    g_gap    = w1 * 0.000 + w2 * 0.110 + w3 * 0.180;
    g_stella = w1 * 0.100 + w2 * 0.450 + w3 * 1.000;
    g_beads  = w1 * 0.000 + w2 * 0.250 + w3 * 1.000;

    // Shared sliding parameters across the whole selector range
    g_waistVal = (0.22 + 0.12 * waist) * (0.96 + 0.04 * sin(ph * TAU));
    g_twistVal = 0.30 + 1.20 * twist + 0.40 * AUDIO_KICK;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float tip = 0.32 * sin(ph * TAU) + 0.25;
    pR(ro.yz, tip);
    pR(rd.yz, tip);

    vec3  col   = vec3(0.0);
    float alpha = 0.0;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            if (d < 0.0009) { hit = true; break; }
            t += d * 0.80;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            float ndv = max(dot(n, -rd), 0.0);

            // Prismatic chromatic dispersion split along normals
            float dsp = 0.015 + 0.065 * dispersion;
            vec3 eR = envPrismatic(reflect(rd, normalize(n + vec3(dsp, 0.0, 0.0))));
            vec3 eG = envPrismatic(reflect(rd, n));
            vec3 eB = envPrismatic(reflect(rd, normalize(n - vec3(dsp, 0.0, 0.0))));
            vec3 crystalCol = vec3(eR.r, eG.g, eB.b) * mix(crystal_tint.rgb, vec3(1.0), 0.35);

            float rim = pow(max(1.0 - ndv, 1e-5), 3.5);
            float fangle = pow(max(1.0 - ndv, 1e-5), 2.0);
            vec3 irid = 0.5 + 0.5 * cos(TAU * (fangle * 1.5 + 0.20 * dispersion + vec3(0.0, 0.33, 0.67)));

            col = crystalCol
                + irid * fangle * (0.60 + 1.50 * dispersion) * (0.70 + 0.80 * AUDIO_BEAT)
                + core_tint.rgb * rim * (0.60 + 0.90 * dispersion);
            alpha = 1.0;
        }
    }

    col = col / (1.0 + col * 0.35);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
