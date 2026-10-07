/*{
  "ADITS": 1,
  "DESCRIPTION": "A vaulted 3D biomechanical arthropod exoskeleton with segmented dorsal tergites and sweeping lateral pleural spines. Bass swells the dorsal vault, mid flares the pleural sweep, and treble sharpens the bioluminescent rim.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "morph_gain",   "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00, "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",    "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00, "LABEL": "Rest Archetype" },
    { "NAME": "dorsal_vault", "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.85, "LABEL": "Dorsal Vault",  "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "pleural_sweep","TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.80, "LABEL": "Pleural Sweep", "BIND": "mid",  "BIND_DEPTH": 0.55 },
    { "NAME": "rim_sharp",    "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 0.90, "LABEL": "Rim Sharpness", "BIND": "treble","BIND_DEPTH": 0.60 },
    { "NAME": "biolum_tint",  "TYPE": "color", "DEFAULT": [0.15, 0.70, 0.95, 1.00], "LABEL": "Biolum Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 12.0
#define ORBIT  4.80
#define BOUND  1.08

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

float smax(float a, float b, float k) {
    return -smin(-a, -b, k);
}

float g_ph, g_k, g_vault, g_sweep, g_barb, g_crest;

float map(vec3 p) {
    vec3 q = p;
    q.x = abs(q.x);

    // Central Cephalon (vaulted head shield)
    vec3 head_p = q - vec3(0.0, -0.02, -0.36);
    float head = length(vec3(head_p.x * 0.9, head_p.y * 1.3 + 0.10 * head_p.x * head_p.x, head_p.z * 1.2)) - (0.22 + 0.05 * g_vault);
    head = smax(head, -head_p.y - 0.12, 0.06);

    // Axial dorsal crest
    float axis_spine = length(q.xy - vec2(0.0, 0.05 * g_crest * cos(q.z * 10.0 + g_ph))) - (0.08 + 0.04 * g_vault);
    axis_spine = max(axis_spine, abs(q.z) - 0.52);

    float d = smin(head, axis_spine, 0.05);

    // Thoracic segments with overlapping tergites and sweeping pleural spines
    for (int i = 0; i < 7; i++) {
        float fi = float(i);
        float z_pos = -0.26 + fi * 0.115 * (1.0 + 0.10 * g_sweep);
        vec3 seg_p = q - vec3(0.0, 0.025 * sin(fi * 0.7 + g_ph), z_pos);

        // Tergite arch (dorsal plate)
        float plate = length(vec3(seg_p.x * 0.85, seg_p.y * 1.4 + 0.12 * seg_p.x * seg_p.x, seg_p.z * 2.2)) - (0.16 + 0.03 * fi * g_vault);

        // Pleural spine (lateral needle-like rib)
        vec3 spine_p = seg_p;
        pR(spine_p.xz, -0.35 - 0.55 * g_sweep - 0.08 * fi);
        pR(spine_p.yz, 0.15 * sin(fi * 0.5));

        float spine_len = 0.35 + 0.28 * g_barb + 0.03 * fi;
        float spine_rad = (0.032 - 0.0025 * fi) * (1.0 - smoothstep(0.0, spine_len, spine_p.x));
        float spine = length(spine_p.yz) - spine_rad;
        spine = max(spine, spine_p.x - spine_len);
        spine = max(spine, -spine_p.x);

        float seg_d = smin(plate, spine, 0.04);
        d = smin(d, seg_d, g_k);
    }

    // Pygidial tail barb
    vec3 tail_p = q - vec3(0.0, 0.02, 0.48);
    pR(tail_p.yz, -0.25 * g_crest);
    float tail = length(tail_p.xy) - (0.06 * g_vault) * (1.0 - smoothstep(0.0, 0.34, tail_p.z));
    tail = max(tail, abs(tail_p.z) - 0.17);

    d = smin(d, tail, g_k);
    return d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- Spectral Morph Selector (guide §12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.15 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // 3 Archetypes: 1 = Vaulted Shield (Rest), 2 = Flaring Thorax (Mid), 3 = Spined Pygidium (Treble)
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    g_k     = w1 * 0.060 + w2 * 0.038 + w3 * 0.022;
    g_vault = w1 * 0.58  + w2 * 0.40  + w3 * 0.24;
    g_sweep = w1 * 0.15  + w2 * 0.62  + w3 * 0.92;
    g_barb  = w1 * 0.10  + w2 * 0.48  + w3 * 0.88;
    g_crest = w1 * 0.20  + w2 * 0.55  + w3 * 0.90;

    // Shared bound modulation
    float grow = (0.92 + 0.16 * dorsal_vault);
    g_vault *= grow;
    g_sweep *= (0.90 + 0.20 * pleural_sweep);

    // ---- Camera setup (guide §5) -------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float pitch = 0.38 + 0.18 * sin(g_ph);
    float yaw   = 0.28 * cos(g_ph);
    pR(ro.yz, pitch); pR(rd.yz, pitch);
    pR(ro.xz, yaw);   pR(rd.xz, yaw);

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;
    int steps_taken = 0;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0009) { hit = true; steps_taken = i; break; }
            t += d * 0.82;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 l_dir = normalize(vec3(0.48, 0.78, 0.58));
            float ndl = max(dot(n, l_dir), 0.0);

            vec3 h = normalize(l_dir - rd);
            float ndh = max(dot(n, h), 0.0);
            float spec = pow(ndh, 44.0) * 1.6;

            float ndv = max(dot(n, -rd), 0.0);
            float fresnel = pow(1.0 - ndv, 3.2 + 2.0 * rim_sharp);

            // Self-occlusion & crevice shading
            float ao = clamp(1.0 - float(steps_taken) / 52.0, 0.0, 1.0);
            ao = pow(ao, 1.6);

            float vein = (1.0 - ao) * (0.35 + 0.65 * AUDIO_BEAT + 0.75 * AUDIO_KICK) * (0.5 + 0.5 * sin(p.z * 16.0 + g_ph));

            vec3 base_obsidian = vec3(0.014, 0.017, 0.024);
            col = base_obsidian * (0.12 + 0.88 * ndl * ao)
                + vec3(0.92, 0.96, 1.00) * spec * ao
                + biolum_tint.rgb * (fresnel * 1.8 + vein * 1.2) * (0.75 + 0.50 * AUDIO_BEAT);

            alpha = 1.0;
        }
    }

    // ---- Bounded Sheath Glow (guide §8) -------------------------------
    float ca = clamp(1.0 - near * 5.2, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.26 + pow(ca, 24.0) * 0.58) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.45 + 0.55 * AUDIO_BEAT);
    col += biolum_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.52, 0.0, 1.0);

    col = col / (1.0 + col * 0.35);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
