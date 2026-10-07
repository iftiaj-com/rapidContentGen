/*{
  "ADITS": 1,
  "DESCRIPTION": "A spore shell reduced to the struts between its own windows, folded into icosahedral symmetry so one evaluation draws all sixty of them, with a spine standing on every vertex and a lit body caught inside; it rests as a closed thick-walled husk and opens into a strutted cage and then a fine reticulum of long spines as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "organic"],
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
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.10, "MAX": 0.76,
      "LABEL": "Husk Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "open",       "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Window Open", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "quick",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Inner Light", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "husk_tint",  "TYPE": "color", "DEFAULT": [0.86, 0.74, 0.34, 1.00],
      "LABEL": "Husk Tint" },
    { "NAME": "core_tint",  "TYPE": "color", "DEFAULT": [0.30, 1.00, 0.72, 1.00],
      "LABEL": "Core Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  6.20
#define BOUND  1.44

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

// Rounded booleans, so the struts meet their spines in a fillet rather
// than a crease. A hard min leaves a seam that catches the light wrong.
float unionR(float a, float b, float r) {
    float h = clamp(0.5 + 0.5 * (b - a) / r, 0.0, 1.0);
    return mix(b, a, h) - r * h * (1.0 - h);
}
float interR(float a, float b, float r) {
    float h = clamp(0.5 - 0.5 * (b - a) / r, 0.0, 1.0);
    return mix(b, a, h) + r * h * (1.0 - h);
}

// ------------------------------------------------------------------
// Icosahedral symmetry.
//
// Three reflections through one plane, with an absolute value between
// each, fold all of space into a single triangle of the icosahedron.
// Everything after the fold is written once and comes out sixty times.
// ------------------------------------------------------------------

const vec3 NC = vec3(-0.5, -0.80901699, 0.30901699);

void icoFold(inout vec3 p) {
    p = abs(p);
    float t = dot(p, NC); if (t < 0.0) p -= 2.0 * t * NC;
    p.xy = abs(p.xy);
    t = dot(p, NC);       if (t < 0.0) p -= 2.0 * t * NC;
    p.xy = abs(p.xy);
    t = dot(p, NC);       if (t < 0.0) p -= 2.0 * t * NC;
}

float g_R, g_wall, g_strut, g_spike, g_spikeR, g_core, g_ph, g_rib;
float g_mat;    // 0 husk, 1 core
float g_edge;   // distance to the nearest window edge, for shading

float map(vec3 q) {
    vec3 p = q;
    pR(p.xz, g_ph);
    pR(p.yz, g_ph * 2.0);
    icoFold(p);

    vec3 n = normalize(p);

    // The fold's own boundary planes are the window edges, so the
    // distance to the nearest of them is the strut coordinate.
    float e = min(min(abs(dot(n, NC)), abs(n.x)), abs(n.y));
    g_edge = e;

    // The same edge coordinate raises a rib on the closed husk, so the
    // reticulation is there before any window is cut through it.
    float shellR = g_R + g_rib * smoothstep(0.22, 0.0, e);
    float shell = abs(length(p) - shellR) - g_wall;
    float cage  = interR(shell, (e - g_strut) * g_R, 0.045);

    // A spine standing on the icosahedral vertex, which the fold has
    // brought to the z axis.
    vec3 s = p;
    s.z -= clamp(s.z, 0.0, g_R + g_spike);
    float t2 = clamp((p.z - g_R) / max(g_spike, 0.01), 0.0, 1.0);
    float spine = length(vec3(p.xy, s.z)) - g_spikeR * (1.0 - 0.88 * t2);
    spine = max(spine, g_R * 0.55 - p.z);

    float d = unionR(cage, spine, 0.05);
    g_mat = 0.0;

    float core = length(q) - g_core;
    if (core < d) { d = core; g_mat = 1.0; }
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

    // The strut coordinate is a direction cosine, so a value above the
    // largest it can reach keeps the whole shell and nothing is cut.
    g_strut  = w1 * 1.20 + w2 * 0.190 + w3 * 0.085;
    g_wall   = w1 * 0.075 + w2 * 0.050 + w3 * 0.034;
    g_rib    = w1 * 0.075 + w2 * 0.050 + w3 * 0.030;
    g_spike  = w1 * 0.050 + w2 * 0.260 + w3 * 0.520;
    g_spikeR = w1 * 0.060 + w2 * 0.075 + w3 * 0.055;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_R     = (0.72 + 0.14 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_core  = (0.30 + 0.12 * swell) * (0.92 + 0.16 * AUDIO_KICK);
    g_strut = mix(g_strut, g_strut * 0.55, open);
    g_spike *= 0.80 + 0.40 * open + 0.20 * AUDIO_KICK;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    vec3 lightD = normalize(vec3(0.44, 0.76, 0.48));

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
            t += d * 0.82;
            if (t > tb1) break;
        }

        if (hit) {
            float mat = g_mat;
            float edge = g_edge;
            vec3  n    = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            float bac  = clamp(dot(n, -lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 52.0);

            if (mat > 0.5) {
                col = core_tint.rgb * (1.10 + 1.40 * dif + 1.20 * fre)
                    * (0.85 + 0.95 * AUDIO_BEAT);
            } else {
                // The strut is brightest along its own centre line, which
                // is what makes a cage of ribs read as ribs.
                // Tied to the rib width, not the strut width: the strut
                // width is parked wide at rest, and using it there would
                // light the whole shell as though it were all rib.
                float spine = smoothstep(0.20, 0.0, edge);
                col = husk_tint.rgb * (0.04 + 0.40 * dif + 0.14 * bac)
                    + husk_tint.rgb * spine * (0.45 + 1.05 * quick)
                    + core_tint.rgb * fre * (0.60 + 1.15 * quick)
                    + vec3(1.0, 0.98, 0.94) * spec * (1.60 + 1.35 * AUDIO_SNARE);
            }
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.6, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.30 + pow(ca, 30.0) * 0.66) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * quick) * (0.55 + 0.90 * AUDIO_BEAT);
    col += core_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
