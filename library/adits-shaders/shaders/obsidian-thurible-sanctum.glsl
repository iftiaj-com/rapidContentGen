/*{
  "ADITS": 1,
  "DESCRIPTION": "A suspended 3D obsidian thurible whose carved biomechanical shell opens under spectral drive to expose a glowing core: rests as a closed monolithic censer, separates into three stacked floating tiers, and flares open into an ornate six-finned sanctuary.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.10, "MAX": 0.80,
      "LABEL": "Censer Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "carve",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Rib Carving", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "flare",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Core Flare", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "shell_tint", "TYPE": "color", "DEFAULT": [0.08, 0.08, 0.10, 1.00],
      "LABEL": "Obsidian Shell" },
    { "NAME": "core_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.35, 0.12, 1.00],
      "LABEL": "Core Glow" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.80
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

// Global parameters set in main and read in map
float g_R, g_tier_sep, g_flare_ang, g_rib_depth, g_core_r, g_ph, g_mat_id;

float map(vec3 p) {
    // Core energy orb at origin
    float dCore = length(p) - g_core_r + 0.02 * sin(p.x * 12.0) * cos(p.y * 12.0 + g_ph);

    // Vessel coordinate transformations
    vec3 q = p;

    // 3-tier vertical separation (Archetype 1)
    if (abs(q.y) > 0.18) {
        float ySign = q.y > 0.0 ? 1.0 : -1.0;
        q.y -= ySign * g_tier_sep;
    }

    // 6-fold radial symmetry angles (prevent NaN at origin with 1e-7 offset)
    float ang = atan(q.z, q.x + 1e-7);
    float cAng = cos(ang * 6.0);
    float rib = smoothstep(-0.2, 0.8, cAng);

    // Flaring fins (Archetype 2)
    if (g_flare_ang > 0.001) {
        float flareFactor = (q.y + 0.6) * 0.5 * g_flare_ang * (0.3 + 0.7 * rib);
        q.xz *= 1.0 - clamp(flareFactor, 0.0, 0.5);
    }

    // Base vessel profile
    float yNorm = clamp((q.y + 0.65) / 1.3, 0.0, 1.0);
    float profR = g_R * (0.80 + 0.35 * sin(yNorm * 3.14159265));

    // Outer wall carving and inner cavity
    float outerR = profR - g_rib_depth * rib;
    float innerR = profR - 0.12;

    float dShell = max(length(q.xz) - outerR, innerR - length(q.xz));
    dShell = max(dShell, abs(q.y) - (0.62 + g_tier_sep * 0.4));

    // Decorative rim caps
    float dCaps = length(vec3(q.x, abs(q.y) - (0.64 + g_tier_sep * 0.4), q.z)) - 0.10;
    dShell = smin(dShell, dCaps, 0.06);

    // Material assignment
    if (dCore < dShell) {
        g_mat_id = 1.0;
        return dCore;
    } else {
        g_mat_id = 0.0;
        return dShell;
    }
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0018;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Studio environment for obsidian gloss reflections
vec3 envObsidian(vec3 r) {
    float up = r.y;
    vec3 c = mix(shell_tint.rgb * 0.20, shell_tint.rgb * 1.20, smoothstep(-0.40, 0.60, up));
    // High-contrast key specular band
    c += vec3(1.0, 0.96, 0.90) * pow(max(dot(r, normalize(vec3(0.50, 0.75, 0.42))), 0.0), 48.0) * 3.5;
    // Cool rim fill light
    c += core_tint.rgb * pow(max(dot(r, normalize(vec3(-0.60, 0.20, -0.50))), 0.0), 16.0) * 0.8;
    return c;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- spectral morph selector (guide 12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Archetype parameters
    g_tier_sep  = w1 * 0.000 + w2 * 0.180 + w3 * 0.080;
    g_flare_ang = w1 * 0.000 + w2 * 0.050 + w3 * 0.450;
    g_rib_depth = w1 * 0.060 + w2 * 0.120 + w3 * 0.220;
    g_core_r    = w1 * 0.180 + w2 * 0.240 + w3 * 0.320;

    // Shared parameter scaling across selector range
    g_R = (0.58 + 0.14 * swell) * (0.97 + 0.03 * sin(g_ph));
    g_rib_depth *= 0.85 + 0.50 * carve;
    g_core_r *= 0.85 + 0.50 * flare + 0.20 * AUDIO_KICK;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float spin = g_ph;
    float tilt = 0.25 * sin(g_ph * 2.0);
    pR(ro.xz, spin); pR(ro.yz, tilt);
    pR(rd.xz, spin); pR(rd.yz, tilt);

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        float hitMat = 0.0;

        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0009) {
                hit = true;
                hitMat = g_mat_id;
                break;
            }
            t += d * 0.65;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            float ndv = max(dot(n, -rd), 0.0);

            if (hitMat > 0.5) {
                // Inner core material
                col = core_tint.rgb * (1.8 + 1.2 * sin(g_ph * 2.0 + p.y * 8.0))
                    + vec3(1.0, 0.9, 0.7) * pow(ndv, 2.0) * 2.2;
            } else {
                // Obsidian shell material
                vec3 refl = reflect(rd, n);
                vec3 obsidianSpec = envObsidian(refl);
                float fresnel = pow(1.0 - ndv, 4.0);
                float spec = pow(max(dot(refl, normalize(vec3(0.4, 0.8, 0.4))), 0.0), 36.0);

                // Core glow leaking from inside cavity
                float coreLeak = smoothstep(0.40, 0.10, length(p) - g_core_r) * (0.6 + 0.8 * flare);

                col = shell_tint.rgb * (0.2 + 0.8 * obsidianSpec)
                    + vec3(1.0, 0.95, 0.90) * spec * 2.8
                    + shell_tint.rgb * fresnel * 2.0
                    + core_tint.rgb * coreLeak * (0.7 + 0.8 * AUDIO_BEAT);
            }
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from closest approach (guide 8) --------------
    float ca = clamp(1.0 - near * 5.2, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.35 + pow(ca, 28.0) * 0.65) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * flare) * (0.55 + 0.90 * AUDIO_BEAT);
    col += core_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    col = col / (1.0 + col * 0.38);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
