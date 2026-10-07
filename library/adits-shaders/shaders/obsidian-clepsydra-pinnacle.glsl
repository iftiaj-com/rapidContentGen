/*{
  "ADITS": 1,
  "DESCRIPTION": "A 3D obsidian clepsydra vessel with sweeping biomechanical ribs and bioluminescent core veins. Morphs spectrally between chalice vault, biconical spire, hourglass cage, and orbital rotor. Bass expands the vessel waist, mid tilts the rib precession, and treble flares the specular rims.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",   "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",    "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "vessel_waist", "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.10, "MAX": 0.75,
      "LABEL": "Vessel Waist", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "rib_twist",    "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Rib Precession", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "rim_glint",    "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Rim Specular", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "glow_tint",    "TYPE": "color", "DEFAULT": [0.15, 0.85, 0.75, 1.00],
      "LABEL": "Core Glow" }
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

// Global uniform values for map evaluation (guide 12.5)
float g_w1, g_w2, g_w3, g_w4;
float g_waist, g_twist, g_k, g_ph;

float map(vec3 p) {
    vec3 q = p;
    pR(q.xz, g_ph * 1.0 + q.y * g_twist * 0.9);

    // 6-fold symmetry with bilateral sector folding
    float sector = TAU / 6.0;
    float ang = atan(q.z, q.x + 1e-7);
    ang = mod(ang + sector * 0.5, sector) - sector * 0.5;
    ang = abs(ang);
    float rXZ = length(q.xz);
    q.x = rXZ * cos(ang);
    q.z = rXZ * sin(ang);

    float yNorm = clamp(q.y / 0.65, -1.0, 1.0);
    float taper = max(1.0 - yNorm * yNorm, 0.0);
    float endTaper = max(1.0 - pow(abs(yNorm), 4.0), 0.0); // smooth dome caps at ends

    // Archetype 1: Chalice Vault (flared mouth, narrow waist)
    float r1 = 0.35 * (0.35 + 0.65 * (yNorm * yNorm)) * g_waist;
    // Archetype 2: Biconical Spire (wide center, sharp tapered tips)
    float r2 = 0.38 * (0.15 + 0.85 * taper) * g_waist;
    // Archetype 3: Hourglass Cage (slender waist with outer struts)
    float r3 = 0.22 * (0.38 + 0.62 * (yNorm * yNorm)) * g_waist;
    // Archetype 4: Orbital Rotor (segmented central disc)
    float r4 = (0.18 + 0.32 * exp(-14.0 * q.y * q.y)) * g_waist;

    float rCore = (g_w1 * r1 + g_w2 * r2 + g_w3 * r3 + g_w4 * r4) * endTaper;

    // Smooth rounded capsule shape (no flat planar cuts)
    vec2 dCap = vec2(length(q.xz) - rCore, abs(q.y) - 0.62);
    float dCore = min(max(dCap.x, dCap.y), 0.0) + length(max(dCap, 0.0)) - 0.03;

    // Outer skeletal ribs for Archetype 1 & 3
    vec3 qRib = q;
    qRib.x -= (rCore + 0.08 * (1.0 + g_w3 * 0.8));
    vec2 dRibCap = vec2(length(qRib.xz) - (0.024 + 0.016 * g_w1), abs(qRib.y) - 0.58);
    float dRib = min(max(dRibCap.x, dRibCap.y), 0.0) + length(max(dRibCap, 0.0)) - 0.02;

    // Collars and rings for Archetype 2 & 4
    float dRing1 = length(vec2(length(q.xz) - (rCore + 0.06), q.y - 0.30)) - 0.028;
    float dRing2 = length(vec2(length(q.xz) - (rCore + 0.06), q.y + 0.30)) - 0.028;
    float dRing3 = length(vec2(length(q.xz) - (rCore + 0.12), q.y)) - 0.038;
    float dRings = min(min(dRing1, dRing2), dRing3);

    float dDetails = mix(dRib, dRings, g_w2 + g_w4);
    return smin(dCore, dDetails, g_k);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

vec3 envObsidian(vec3 r, vec3 n) {
    float up = r.y;
    vec3 baseCol = vec3(0.022, 0.032, 0.045);
    vec3 specSky  = vec3(0.85, 0.95, 1.00) * pow(max(dot(r, normalize(vec3(0.40, 0.85, 0.35))), 0.0), 48.0) * 3.8;
    vec3 specRim  = glow_tint.rgb * pow(max(dot(r, normalize(vec3(-0.60, 0.30, -0.50))), 0.0), 20.0) * 1.5;
    vec3 specGlow = vec3(0.40, 0.70, 0.90) * pow(max(dot(r, normalize(vec3(0.10, -0.90, 0.40))), 0.0), 12.0) * 0.4;
    return baseCol + specSky + specRim + specGlow;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = 1.0 - smoothstep(0.442, 0.478, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // Spectral morph selector (guide 12.2 - 12.4, 12.7)
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.36 * (AUDIO_HAT - AUDIO_KICK) + 0.16 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // 4 Archetypes spacing
    float s0 = sel * 3.0;
    g_w1 = clamp(1.0 - abs(s0 - 0.0) / 0.75, 0.0, 1.0);
    g_w2 = clamp(1.0 - abs(s0 - 1.0) / 0.75, 0.0, 1.0);
    g_w3 = clamp(1.0 - abs(s0 - 2.0) / 0.75, 0.0, 1.0);
    g_w4 = clamp(1.0 - abs(s0 - 3.0) / 0.75, 0.0, 1.0);
    float ws = g_w1 + g_w2 + g_w3 + g_w4 + 1e-4;
    g_w1 /= ws; g_w2 /= ws; g_w3 /= ws; g_w4 /= ws;

    g_waist = 0.85 + 0.35 * vessel_waist + 0.15 * AUDIO_KICK;
    g_twist = 0.30 + 1.10 * rib_twist;
    g_k     = g_w1 * 0.065 + g_w2 * 0.040 + g_w3 * 0.075 + g_w4 * 0.035;

    // Camera setup (guide 5)
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float tip = 0.25 * sin(g_ph * 1.0) + 0.20;
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

            float fresnel = pow(1.0 - ndv, 3.5);
            vec3 env = envObsidian(refl, n);

            // Obsidian body with specular highlights and fresnel rim
            col = env + glow_tint.rgb * fresnel * (0.60 + 1.40 * rim_glint) * (0.70 + 0.80 * AUDIO_BEAT);

            // Internal vein / core bioluminescent glow
            float innerVein = smoothstep(0.20, 0.0, length(p.xz) - 0.04) * (1.0 - smoothstep(0.55, 0.65, abs(p.y)));
            col += glow_tint.rgb * innerVein * (1.2 + 1.8 * AUDIO_BEAT);

            alpha = 1.0;
        }
    }

    // Bounded proximity sheath (guide 8)
    float ca = clamp(1.0 - near * 5.2, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.28 + pow(ca, 24.0) * 0.62) * (1.0 - alpha);
    sheath *= (1.0 - smoothstep(0.10, 0.442, rr)) * (0.35 + 0.65 * rim_glint) * (0.50 + 0.90 * AUDIO_BEAT);
    col += glow_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    col = col / (1.0 + col * 0.32);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
