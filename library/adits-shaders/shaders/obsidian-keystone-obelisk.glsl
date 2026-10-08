/*{
  "ADITS": 1,
  "DESCRIPTION": "An ancient obsidian keystone monolith whose carved core splits, levitates, and flares into winged armor fins as music shifts from deep bass monolith to mid-band levitating plates and treble star spire.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",    "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",     "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "plate_flare",    "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Plate Flare", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "core_twist",     "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.80,
      "LABEL": "Core Twist", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "vein_glow",      "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Vein Energy", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "obsidian_color", "TYPE": "color", "DEFAULT": [0.08, 0.10, 0.14, 1.00],
      "LABEL": "Obsidian Base" },
    { "NAME": "emissive_color", "TYPE": "color", "DEFAULT": [0.20, 0.85, 0.95, 1.00],
      "LABEL": "Conduit Glow" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.00
#define BOUND  1.15

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

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

float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float sdCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// Global morph parameters populated per pixel
float g_ph;
float g_split;
float g_flare;
float g_twist;
float g_core_r;
float g_ring_r;
float g_wing_angle;
float g_k;
float g_core_d;

float map(vec3 p) {
    vec3 origP = p;

    // Slow organic precession of the entire monolith assembly
    pR(p.xz, g_ph * 1.0);

    // Vertical bounding clamp
    float bodyBound = abs(p.y) - 0.70;

    // --- Core Monolith Structure ---
    vec3 cp = p;
    // Core twist based on mid band
    pR(cp.xz, cp.y * (0.8 + 1.2 * g_twist));

    // Vertical tapering for obelisk silhouette
    float taper = 1.0 - cp.y * 0.35;
    taper = max(taper, 0.2);

    // Bilateral 4-fold radial repetition for 4-sided keystone
    float ang = atan(cp.z, cp.x + 1e-7);
    float sector = TAU / 4.0;
    ang = mod(ang + sector * 0.5, sector) - sector * 0.5;
    ang = abs(ang);
    float rXZ = length(cp.xz);
    cp.x = rXZ * cos(ang);
    cp.z = rXZ * sin(ang);

    // Split translation for Arch 2 / 3
    cp.x -= g_split * 0.18 * taper;

    // Tapered box primitive for monolith segment
    vec3 boxSize = vec3(g_core_r * taper, 0.65, g_core_r * taper * 0.75);
    float dCore = sdBox(cp, boxSize) - 0.02;

    // Grooves and inner energy conduit carving
    float groove = sin(cp.y * 24.0 + g_ph * 2.0) * 0.015;
    dCore += groove;

    // --- Floating Armor Plates / Wings ---
    vec3 ap = p;
    // Counter-rotation for outer armor
    pR(ap.xz, -g_ph * 2.0);

    // 8-fold symmetry for surrounding floating plates
    float ang8 = atan(ap.z, ap.x + 1e-7);
    float sector8 = TAU / 8.0;
    ang8 = mod(ang8 + sector8 * 0.5, sector8) - sector8 * 0.5;
    ang8 = abs(ang8);
    float rXZ8 = length(ap.xz);
    ap.x = rXZ8 * cos(ang8);
    ap.z = rXZ8 * sin(ang8);

    // Radial flare distance
    ap.x -= g_ring_r + g_flare * 0.22;

    // Wing tilt / flare
    pR(ap.xy, g_wing_angle);

    float dArmor = sdBox(ap, vec3(0.04, 0.32, 0.08)) - 0.015;

    // Combine core and armor plates with morph blend radius
    float d = smin(dCore, dArmor, g_k);

    // Central energy rod / conduit needle
    float dRod = sdCylinder(origP, 0.72, g_core_r * 0.35);
    g_core_d = dRod;

    d = min(d, dRod);
    d = max(d, bodyBound);

    return d * 0.85; // Conservative step multiplier
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

vec3 envObsidian(vec3 r, vec3 n, vec3 viewDir) {
    float up = r.y;

    // Near-black dark specular environment reflection
    vec3 baseCol = obsidian_color.rgb * 0.35;

    // High contrast sky and horizon lights
    float sky = smoothstep(-0.2, 0.6, up);
    vec3 env = mix(baseCol, vec3(0.12, 0.16, 0.22), sky);

    // Key studio light highlights
    vec3 lightDir1 = normalize(vec3(0.5, 0.8, 0.6));
    vec3 lightDir2 = normalize(vec3(-0.6, -0.3, -0.5));

    float spec1 = pow(max(dot(r, lightDir1), 0.0), 48.0);
    float spec2 = pow(max(dot(r, lightDir2), 0.0), 24.0);

    env += vec3(0.95, 0.98, 1.0) * spec1 * 2.8;
    env += emissive_color.rgb * spec2 * 1.2;

    return env;
}

void main() {
    // Canonical aspect-correct preamble
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);

    // Strict boundary culling at 0.48 to prevent edge slicing
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- Spectral Morph Selector (guide §12) ----
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);

    // Onset pulse shoves (guide §12.4)
    sel = clamp(sel + 0.36 * (AUDIO_HAT - AUDIO_KICK) + 0.16 * AUDIO_SNARE, 0.0, 1.0);

    // Silence rest state fallback
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // 3 Archetype weights with narrow kernel
    float w1 = clamp(1.0 - abs(sel)       / 0.35, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.35, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.35, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Archetype parameters interpolation
    g_split      = w1 * 0.00 + w2 * 1.00 + w3 * 0.40;
    g_core_r     = w1 * 0.28 + w2 * 0.20 + w3 * 0.12;
    g_ring_r     = w1 * 0.35 + w2 * 0.45 + w3 * 0.55;
    g_wing_angle = w1 * 0.05 + w2 * 0.25 + w3 * 0.65;
    g_k          = w1 * 0.08 + w2 * 0.15 + w3 * 0.03;

    // Audio-driven continuous parameter sweeps
    g_flare = plate_flare * (1.0 + 0.4 * AUDIO_KICK);
    g_twist = core_twist * (1.0 + 0.3 * AUDIO_BEAT);

    // ---- Camera setup with CAM_DIR and CAM_UP (guide §5) ----
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Subtle breathing tilt
    float tip = 0.12 * sin(g_ph * 1.0);
    pR(ro.yz, tip);
    pR(rd.yz, tip);

    vec3 col = vec3(0.0);
    float alpha = 0.0;
    float near = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;

        // Raymarch loop (56 steps budget)
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.5));
            if (d < 0.001) {
                hit = true;
                break;
            }
            t += d;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Fresnel rim lighting
            float fresnel = pow(max(1.0 - ndv, 0.0), 3.5);

            // Obsidian surface shading
            vec3 env = envObsidian(refl, n, -rd);

            // Interior conduit emissive glow along carved veins
            float veinPattern = sin(p.y * 30.0 + g_ph * 2.0) * cos(atan(p.z, p.x + 1e-7) * 4.0);
            float veinGlowInt = smoothstep(0.4, 0.95, veinPattern) * vein_glow;

            // Core energy rod glow
            float coreEmissive = smoothstep(0.08, 0.0, g_core_d) * (0.8 + 1.2 * vein_glow);

            col = obsidian_color.rgb * 0.2
                + env * (0.6 + 0.4 * fresnel)
                + emissive_color.rgb * (fresnel * 1.8 + veinGlowInt * 2.5 + coreEmissive * 3.0) * (0.6 + 0.8 * AUDIO_BEAT);

            alpha = 1.0;
        }
    }

    // Volumetric energy sheath near approach (guide §8)
    float ca = clamp(1.0 - near * 4.8, 0.0, 1.0);
    float sheath = (pow(max(ca, 0.0), 5.0) * 0.25 + pow(max(ca, 0.0), 20.0) * 0.55) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * vein_glow * (0.5 + 0.8 * AUDIO_BEAT);

    col += emissive_color.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.5, 0.0, 1.0);

    // Tone mapping & gamma correction
    col = col / (1.0 + col * 0.28);
    col = pow(max(col, 0.0), vec3(0.90));

    // Premultiply alpha & frame boundary mask
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
