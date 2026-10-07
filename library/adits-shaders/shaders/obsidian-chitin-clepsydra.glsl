/*{
  "ADITS": 1,
  "DESCRIPTION": "An obsidian chitin clepsydra water-glass featuring vertical hourglass ribs over a glowing crimson plasma vessel, spectrally morphing through three biomech archetypes: Armored Clepsydra, Open Lattice Water-Glass, and Flared Needle Siphon. Rests on the Open Lattice Water-Glass at silence.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-09-20",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",   "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",    "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "waist_constrict", "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.80,
      "LABEL": "Waist Constriction", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "rib_twist",    "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.00, "MAX": 0.80,
      "LABEL": "Chitin Twist", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "core_pulse",   "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Plasma Core Drive", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "chitin_tint",  "TYPE": "color", "DEFAULT": [0.08, 0.12, 0.16, 1.00],
      "LABEL": "Chitin Color" },
    { "NAME": "plasma_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.22, 0.12, 1.00],
      "LABEL": "Plasma Emission" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.20
#define BOUND  1.20

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

// Global morph state set once per fragment
float g_waist, g_rib_r, g_sectors, g_twist, g_core_r, g_spire_ext, g_ph;

float map(vec3 p) {
    // Height bounding and capping to eliminate flat cuts
    float h = 0.85 + 0.15 * g_spire_ext;
    float y = p.y;

    // Smooth tapering towards top and bottom endpoints
    float h_cap = smoothstep(h, h - 0.20, abs(y));

    // Base hyperboloid (hourglass) surface
    float r_ideal = 0.35 + (y * y) * (0.45 + 0.35 * g_waist) - 0.12 * g_waist;
    r_ideal *= h_cap;

    // Angular domain repetition for vertical chitin ribs
    float r_xy = length(p.xz);
    float ang = atan(p.z, p.x + 1e-7) + y * g_twist + g_ph;

    float sector = TAU / g_sectors;
    ang = mod(ang + sector * 0.5, sector) - sector * 0.5;
    ang = abs(ang); // Bilateral symmetry within sectors to prevent seam artifacts

    // 3D Rib position
    vec2 p_sector = r_xy * vec2(cos(ang), sin(ang));
    float d_rib = length(p_sector - vec2(r_ideal, 0.0)) - g_rib_r;

    // Top and bottom crowned spires
    vec3 p_top = p;
    p_top.y = abs(p_top.y) - h;
    float d_spires = length(p_top) - (0.08 + 0.08 * g_spire_ext);

    // Combine outer chitin hull
    float d_hull = smin(d_rib, d_spires, 0.08);

    // Inner glowing plasma core vessel
    float d_core = length(p * vec3(1.2, 0.8, 1.2)) - g_core_r;

    return smin(d_hull, d_core, 0.06);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

vec3 envStudio(vec3 r, vec3 n, vec3 viewDir) {
    float up = r.y;
    vec3 baseCol = mix(vec3(0.01, 0.015, 0.025), chitin_tint.rgb * 0.8, smoothstep(-0.4, 0.5, up));

    // Key light
    vec3 keyDir = normalize(vec3(0.5, 0.8, 0.6));
    float key = max(dot(n, keyDir), 0.0);
    vec3 keySpec = vec3(1.0, 0.95, 0.90) * pow(max(dot(r, keyDir), 0.0), 32.0) * 1.8;

    // Fresnel rim light
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.5);
    vec3 rimCol = chitin_tint.rgb * fresnel * 2.2;

    return baseCol + chitin_tint.rgb * key * 0.6 + keySpec + rimCol;
}

void main() {
    // §7 canonical preamble
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    float rr = length(uv);
    // Bounded silhouette safety check
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- spectral morph selector (guide §12) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.15 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // Three spectral archetypes weights
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0); // A1: Closed Vault
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0); // A2: Open Lattice Clepsydra
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0); // A3: Flared Siphon
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Morph parameter interpolation
    g_waist     = w1 * 0.20 + w2 * 0.55 + w3 * 0.80 + 0.20 * waist_constrict;
    g_rib_r     = w1 * 0.09 + w2 * 0.05 + w3 * 0.025;
    g_sectors   = w1 * 8.0  + w2 * 12.0 + w3 * 18.0;
    g_spire_ext = w1 * 0.10 + w2 * 0.40 + w3 * 0.90;
    g_twist     = (0.4 + 1.2 * rib_twist) * (w1 * 0.2 + w2 * 0.6 + w3 * 1.2);
    g_core_r    = w1 * 0.15 + w2 * 0.22 + w3 * 0.32 + 0.08 * core_pulse * (1.0 + 0.5 * AUDIO_KICK);

    // ---- camera setup from CAM_DIR and CAM_UP (guide §5) ----------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Gentle slow hypnotic precession
    float precession = 0.25 * sin(g_ph);
    pR(ro.xz, precession);
    pR(rd.xz, precession);

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
            near = min(near, d / max(t, 0.5));
            if (d < 0.001) { hit = true; break; }
            t += d * 0.80;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 viewDir = -rd;
            vec3 refl = reflect(rd, n);

            // Obsidian surface shading
            vec3 surfaceCol = envStudio(refl, n, viewDir);

            // Internal plasma core glow bleeding through the gaps
            float coreDist = length(p) - g_core_r;
            float coreGlow = exp(-max(coreDist, 0.0) * 8.0);
            vec3 emission = plasma_tint.rgb * coreGlow * (1.2 + 1.8 * core_pulse) * (0.8 + 0.8 * AUDIO_BEAT);

            col = surfaceCol + emission;
            alpha = 1.0;
        }
    }

    // Outer plasma atmosphere sheath from ray near-misses
    float ca = clamp(1.0 - near * 5.0, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.35 + pow(ca, 24.0) * 0.65) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.05, rr) * (0.3 + 0.7 * core_pulse) * (0.5 + 0.8 * AUDIO_BEAT);

    col += plasma_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.60, 0.0, 1.0);

    // Tone mapping and gamma
    col = col / (1.0 + col * 0.35);
    col = pow(max(col, 0.0), vec3(0.90));

    // Final premultiplied alpha calculation
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
