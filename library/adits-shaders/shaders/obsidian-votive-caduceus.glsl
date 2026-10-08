/*{
  "ADITS": 1,
  "DESCRIPTION": "A volumetric obsidian caduceus staff with entwined helical strands and an unfolding winged crest. Bass thickens the central spine, mid drives helical twist rate, and treble ignites the inner emissive conduits.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",      "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00, "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",       "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00, "LABEL": "Rest Archetype" },
    { "NAME": "spine_thickness", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.10, "MAX": 0.80, "LABEL": "Spine Thickness", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "twist_rate",      "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.90, "LABEL": "Helical Twist",   "BIND": "mid",  "BIND_DEPTH": 0.60 },
    { "NAME": "conduit_glow",    "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00, "LABEL": "Conduit Glow",    "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "glow_tint",       "TYPE": "color", "DEFAULT": [0.90, 0.22, 0.15, 1.00], "LABEL": "Conduit Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.00
#define BOUND  1.16

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

float g_k, g_ph, g_twist, g_thick, g_helix_r, g_strand_r, g_wing_w, g_orb_r;

float map(vec3 p) {
    float y_fade = 1.0 - smoothstep(0.35, 0.65, abs(p.y));

    // Central ribbed spine
    float spine_r = g_thick * (1.0 + 0.18 * cos(p.y * 20.0 + g_ph)) * (0.15 + 0.85 * y_fade);
    float d_spine = length(p.xz) - spine_r;

    // Floating central orb / crown
    float d_orb = length(p - vec3(0.0, 0.38 * (g_wing_w - 0.15), 0.0)) - g_orb_r;

    // Helical strands (twin counter-entwined)
    float twist_angle = p.y * g_twist + g_ph;
    float hr = g_helix_r * (1.0 + 0.22 * sin(p.y * 4.0 - g_ph));
    float sr = g_strand_r * (0.20 + 0.80 * y_fade);

    vec3 c1 = vec3(cos(twist_angle) * hr, p.y, sin(twist_angle) * hr);
    float d_s1 = length(p - c1) - sr;

    vec3 c2 = vec3(cos(twist_angle + 3.14159265) * hr, p.y, sin(twist_angle + 3.14159265) * hr);
    float d_s2 = length(p - c2) - sr;

    float d_helices = min(d_s1, d_s2);

    // Winged crest structures
    float d_wings = 1e5;
    if (g_wing_w > 0.01) {
        vec2 q = p.xz;
        q.x = abs(q.x);
        float wing_y = p.y - 0.22;
        float wing_span = g_wing_w * smoothstep(-0.3, 0.3, p.y) * (1.0 - smoothstep(0.3, 0.6, p.y));
        float d_w = max(abs(p.z) - 0.015, abs(q.x - wing_span * 0.5) - wing_span * 0.5);
        d_w = max(d_w, abs(wing_y) - 0.28);
        d_wings = d_w;
    }

    float d = smin(d_spine, d_orb, g_k);
    d = smin(d, d_helices, g_k);
    d = smin(d, d_wings, g_k * 0.85);

    float d_outer = length(p) - 0.72;
    return max(d, d_outer);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

vec3 envObsidian(vec3 r) {
    float up = r.y;
    vec3 c = mix(vec3(0.012, 0.014, 0.022),
                 vec3(0.16, 0.19, 0.28) * (0.5 + 0.5 * up),
                 smoothstep(-0.2, 0.5, up));
    c += vec3(1.0, 0.96, 0.92) * pow(max(dot(r, normalize(vec3(0.42, 0.82, 0.44))), 0.0), 48.0) * 3.6;
    c += vec3(0.22, 0.65, 0.95) * pow(max(dot(r, normalize(vec3(-0.52, 0.28, -0.62))), 0.0), 22.0) * 1.3;
    return c;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
    float rr = length(uv);

    // Strict radius bounding safety using correct GLSL ES 1.00 non-inverted smoothstep bounds
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
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Morph parameters across 3 distinct archetypes
    g_k        = w1 * 0.085 + w2 * 0.045 + w3 * 0.022;
    g_thick    = (0.032 + 0.045 * spine_thickness) * (w1 * 1.1 + w2 * 0.8 + w3 * 0.6);
    g_twist    = (2.2 + 4.5 * twist_rate) * (w1 * 0.9 + w2 * 1.3 + w3 * 1.8);
    g_helix_r  = w1 * 0.15 + w2 * 0.28 + w3 * 0.38;
    g_strand_r = w1 * 0.042 + w2 * 0.032 + w3 * 0.022;
    g_wing_w   = w1 * 0.02 + w2 * 0.36 + w3 * 0.16;
    g_orb_r    = w1 * 0.08 + w2 * 0.12 + w3 * 0.18;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float tip = 0.28 * sin(g_ph) + 0.22;
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
            float fresnel = pow(1.0 - ndv, 4.0);

            vec3 baseCol = envObsidian(refl);

            // Emissive conduit highlight along helical channels
            float a_pos = atan(p.z, p.x + 1e-7);
            float conduit = pow(abs(sin(p.y * g_twist * 2.0 + a_pos * 2.0 + g_ph)), 8.0);
            vec3 emissive = glow_tint.rgb * conduit * (0.8 + 1.2 * conduit_glow) * (0.6 + 0.8 * AUDIO_BEAT);

            col = baseCol + fresnel * vec3(0.85, 0.92, 1.0) * 0.85 + emissive;
            alpha = 1.0;
        }
    }

    // Proximity sheath glow bounded to object radius
    float ca = clamp(1.0 - near * 5.0, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.25 + pow(ca, 24.0) * 0.50) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.30 + 0.70 * conduit_glow) * (0.5 + 0.8 * AUDIO_BEAT);
    col += glow_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    col = col / (1.0 + col * 0.34);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
