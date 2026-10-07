/*{
  "ADITS": 1,
  "DESCRIPTION": "A 3D mechanical tellurion diadem with obsidian biomech arms, chalcedony rings, and a glowing orbital core.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-09-01",
  "CATEGORIES": ["generative", "3d", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",  "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",   "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "ring_expand", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.10, "MAX": 0.75,
      "LABEL": "Ring Expansion", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "warp_twist",  "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.05, "MAX": 0.80,
      "LABEL": "Gear Twist", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "core_flare",  "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Core Flare", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "arm_tint",    "TYPE": "color", "DEFAULT": [0.08, 0.12, 0.18, 1.00],
      "LABEL": "Obsidian Biomech" },
    { "NAME": "ring_tint",   "TYPE": "color", "DEFAULT": [0.20, 0.75, 0.92, 1.00],
      "LABEL": "Chalcedony Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.20
#define BOUND  1.18

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

float g_ph, g_k, g_ringR, g_coreR, g_twist, g_m1, g_m2, g_m3;

float map(vec3 p) {
    // 1. Central Orb / Tellurion Nucleus
    float dCore = length(p) - g_coreR;

    // 2. Biomech Arms (6-fold radial symmetry around Y) with rounded jewel tips
    vec3 pa = p;
    float angle = atan(pa.z, pa.x);
    float sector = TAU / 6.0;
    float aIdx = floor((angle + sector * 0.5) / sector);
    float aAng = aIdx * sector;
    pR(pa.xz, aAng);
    pa.x -= g_ringR * 0.52;

    float armCurve = sin(pa.y * 3.5 + g_ph) * 0.12 * g_twist;
    pa.x += armCurve;

    // Smooth capsule body for arms
    float yCap = clamp(pa.y, -0.48, 0.48);
    vec3 paCap = vec3(pa.x, pa.y - yCap, pa.z);
    float rArm = 0.055 + 0.025 * cos(pa.y * 5.0);
    float dArm = length(paCap) - rArm;

    // Chalcedony crown jewel spheres on top of each biomech arm
    vec3 pTip = pa - vec3(0.0, 0.52, 0.0);
    float dTipJewel = length(pTip) - 0.065;
    dArm = smin(dArm, dTipJewel, 0.03);

    // 3. Concentric Chalcedony Rings (Inner & Outer Gimbal)
    vec3 pr1 = p;
    pR(pr1.xz, g_ph * 1.0 + g_twist * 0.8);
    pR(pr1.yz, 0.35 * sin(g_ph * 1.0));
    float dRing1 = length(vec2(length(pr1.xz) - g_ringR, pr1.y)) - 0.038;
    float teeth1 = cos(atan(pr1.z, pr1.x) * 12.0) * 0.010;
    dRing1 += teeth1;

    vec3 pr2 = p;
    pR(pr2.xy, g_ph * -1.0);
    pR(pr2.xz, 0.40 * cos(g_ph * 1.0));
    float dRing2 = length(vec2(length(pr2.yz) - g_ringR * 1.25, pr2.x)) - 0.032;

    // 4. Spiked Celestial Needles (12-fold symmetry)
    vec3 ps = p;
    float sAngle = atan(ps.z, ps.x);
    float sSector = TAU / 12.0;
    float sIdx = floor((sAngle + sSector * 0.5) / sSector);
    pR(ps.xz, sIdx * sSector + g_ph * 2.0);
    ps.x -= g_ringR * 1.42;
    float syCap = clamp(ps.y, -0.42, 0.42);
    vec3 psCap = vec3(ps.x, ps.y - syCap, ps.z);
    float dNeedle = length(psCap) - (0.018 + 0.028 * max(0.0, 1.0 - abs(ps.y * 2.2)));

    // Blend archetypes according to spectral morph weights
    float dBody1 = smin(dCore, dArm, g_k);
    float dBody2 = smin(dRing1, dRing2, g_k);
    float dBody3 = smin(dBody2, dNeedle, g_k * 0.8);

    float d = mix(dBody1, mix(dBody2, dBody3, g_m3 / max(g_m2 + g_m3, 1e-4)), g_m2 + g_m3);
    return d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

vec3 envLighting(vec3 r, vec3 n) {
    float up = r.y;
    vec3 c = mix(arm_tint.rgb * 0.4,
                 ring_tint.rgb * (0.8 + 0.6 * up),
                 smoothstep(-0.25, 0.45, up));
    // Specular horizon line and key light glints
    c += vec3(0.95, 0.98, 1.00) * smoothstep(0.06, 0.0, abs(up - 0.02)) * 0.75;
    c += vec3(1.00, 0.96, 0.90) * pow(max(dot(r, normalize(vec3(0.45, 0.75, 0.48))), 0.0), 64.0) * 3.8;
    c += ring_tint.rgb * pow(max(dot(r, normalize(vec3(-0.55, 0.30, -0.55))), 0.0), 20.0) * 1.4;
    return c;
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.435, rr);
    if (bound <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- Spectral Morph Selector (Guide §12) ------------------------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    g_m1 = clamp(1.0 - abs(sel)       / 0.35, 0.0, 1.0);
    g_m2 = clamp(1.0 - abs(sel - 0.5) / 0.35, 0.0, 1.0);
    g_m3 = clamp(1.0 - abs(sel - 1.0) / 0.35, 0.0, 1.0);
    float ms = g_m1 + g_m2 + g_m3 + 1e-4;
    g_m1 /= ms; g_m2 /= ms; g_m3 /= ms;

    g_k     = g_m1 * 0.140 + g_m2 * 0.080 + g_m3 * 0.035;
    g_ringR = (g_m1 * 0.380 + g_m2 * 0.520 + g_m3 * 0.650) * (0.92 + 0.16 * ring_expand);
    g_coreR = (g_m1 * 0.220 + g_m2 * 0.160 + g_m3 * 0.110) * (0.95 + 0.15 * AUDIO_KICK);
    g_twist = (0.60 + 0.80 * warp_twist) * (1.0 + 0.25 * sin(g_ph * 2.0));

    // ---- Camera setup (Guide §5) -----------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float tip = 0.28 * sin(g_ph * 1.0) + 0.22;
    pR(ro.yz, tip);
    pR(rd.yz, tip);

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;

        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0009) { hit = true; break; }
            t += d * 0.80;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Fresnel rim & thin film chalcedony iridescence
            float fangle = pow(1.0 - ndv, 2.2);
            vec3 irid = 0.5 + 0.5 * cos(TAU * (fangle * 1.3 + 0.15 * core_flare + vec3(0.0, 0.33, 0.67)));
            float rim = pow(1.0 - ndv, 3.8);

            vec3 baseCol = mix(arm_tint.rgb, ring_tint.rgb, smoothstep(0.1, 0.5, length(p)));
            col = envLighting(refl, n) * mix(baseCol, vec3(1.0), 0.35)
                + irid * fangle * (0.60 + 1.50 * core_flare) * (0.70 + 0.80 * AUDIO_BEAT)
                + ring_tint.rgb * rim * (0.50 + 0.90 * core_flare);
            alpha = 1.0;
        }
    }

    // Bounded energy halo around core approach
    float ca = clamp(1.0 - near * 5.2, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.28 + pow(ca, 24.0) * 0.62) * (1.0 - alpha);
    sheath *= smoothstep(0.435, 0.10, rr) * (0.45 + 0.55 * core_flare) * (0.60 + 0.85 * AUDIO_BEAT);
    col += ring_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.52, 0.0, 1.0);

    // Tone map and premultiply
    col = col / (1.0 + col * 0.35);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
