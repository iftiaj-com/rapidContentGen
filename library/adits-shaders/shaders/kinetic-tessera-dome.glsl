/*{
  "ADITS": 1,
  "DESCRIPTION": "A dome tiled by a geodesic triangle lattice, every tessera lifting, turning and drifting on its own schedule off a hash of where it sits, so the surface comes apart tile by tile rather than all at once; it rests as flush armour over a lit core and lifts into raised scales and then into a suspended shell of drifting plates as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "geodesic"],
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
      "LABEL": "Dome Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "stagger",    "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Tile Stagger", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "kindle",     "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Seam Light", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "tile_tint",  "TYPE": "color", "DEFAULT": [0.24, 0.28, 0.36, 1.00],
      "LABEL": "Tile Tint" },
    { "NAME": "core_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.48, 0.86, 1.00],
      "LABEL": "Core Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  6.00
#define BOUND  1.46

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

float hash21(vec2 v) {
    return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453123);
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

// ------------------------------------------------------------------
// Geodesic tiling.
//
// Space is folded into one triangular face of an icosahedron, the
// direction is projected onto that face, and a triangular lattice on
// the face names the nearest tile. Pushing that tile centre back out to
// the sphere gives an even tiling of the whole dome from arithmetic
// that only ever runs once.
//
// The constants are the icosahedron's own geometry: the face plane and
// its two in-plane axes, and the inradius of a face on a unit sphere.
// ------------------------------------------------------------------

const vec3 NC        = vec3(-0.5, -0.80901699, 0.30901699);
const vec3 FACEPLANE = vec3(0.0,  0.35682209, 0.93417236);
const vec3 UPLANE    = vec3(0.0,  0.93417236, -0.35682209);
const vec3 VPLANE    = vec3(1.0,  0.0,        0.0);
#define FACERADIUS 0.38196601

const mat2 CART2HEX = mat2(1.0, 0.0, 0.57735027, 1.15470054);
const mat2 HEX2CART = mat2(1.0, 0.0, -0.5, 0.86602540);

void icoFold(inout vec3 p) {
    p = abs(p);
    float t = dot(p, NC); if (t < 0.0) p -= 2.0 * t * NC;
    p.xy = abs(p.xy);
    t = dot(p, NC);       if (t < 0.0) p -= 2.0 * t * NC;
    p.xy = abs(p.xy);
    t = dot(p, NC);       if (t < 0.0) p -= 2.0 * t * NC;
}

vec2 nearestTriCentre(vec2 v) {
    vec2 pt = CART2HEX * v;
    vec2 pi = floor(pt);
    vec2 pf = fract(pt);
    vec2 a = vec2(step(pf.y, pf.x), 1.0) + pi;
    vec2 b = vec2(1.0, step(pf.x, pf.y)) + pi;
    vec2 c = pi;
    return (HEX2CART * a + HEX2CART * b + HEX2CART * c) * 0.33333333;
}

float g_R, g_sub, g_tileR, g_tileT, g_lift, g_turn, g_core, g_ph;
float g_mat;    // 0 tessera, 1 core
float g_seed;   // per-tile hash, read back for colour
float g_rad;    // distance within the tile, for its edge light

float map(vec3 q) {
    vec3 p = q;
    pR(p.xz, g_ph);
    pR(p.yz, g_ph * 2.0);

    vec3 f = p;
    icoFold(f);

    // Project the folded direction onto the face plane and name the tile.
    vec3 pn = normalize(f);
    float den = max(dot(FACEPLANE, pn), 1e-3);
    vec3 ip = pn / den;
    vec2 fv = vec2(dot(ip, UPLANE), dot(ip, VPLANE));
    float sc = g_sub / FACERADIUS * 0.5;
    vec2 cen2 = nearestTriCentre(fv * sc) / sc;

    vec3 cen = normalize(FACEPLANE + UPLANE * cen2.x + VPLANE * cen2.y);
    float h = hash21(floor(cen2 * 97.0));
    g_seed = h;

    // Every tile keeps its own schedule, taken from where it sits, so
    // the dome comes apart tile by tile instead of all together.
    float beat = 0.5 + 0.5 * sin(g_ph + h * TAU);
    float lift = g_lift * mix(1.0, beat, g_turn);

    vec3 c3 = cen * (g_R + lift);

    // A frame on the tile, tilted by its own hash.
    vec3 up = cen;
    vec3 t1 = normalize(cross(up, vec3(0.0, 1.0, 0.037)));
    vec3 t2 = cross(up, t1);

    vec3 rel = f - c3;
    float ax = dot(rel, up);
    vec2  pl = vec2(dot(rel, t1), dot(rel, t2));
    pR(pl, h * TAU + g_ph * 2.0);
    ax += (pl.x * (h - 0.5) + pl.y * (0.5 - h)) * g_turn * 1.6;

    float rr = length(pl);
    g_rad = rr / max(g_tileR, 1e-3);
    float d = max(rr - g_tileR, abs(ax) - g_tileT);

    g_mat = 0.0;
    float core = length(q) - g_core;
    if (core < d) { d = core; g_mat = 1.0; }
    return d * 0.72;
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
    float rr2 = length(uv);
    float bound = smoothstep(0.478, 0.442, rr2);
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

    g_sub   = w1 * 2.20 + w2 * 3.00 + w3 * 3.80;
    g_tileR = w1 * 0.115 + w2 * 0.095 + w3 * 0.070;
    g_tileT = w1 * 0.050 + w2 * 0.032 + w3 * 0.020;
    g_lift  = w1 * 0.005 + w2 * 0.110 + w3 * 0.290;
    g_turn  = w1 * 0.050 + w2 * 0.480 + w3 * 1.000;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_R    = (0.80 + 0.18 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_core = (0.60 + 0.14 * swell) * (0.94 + 0.12 * AUDIO_KICK);
    g_lift *= 0.65 + 0.75 * stagger + 0.35 * AUDIO_KICK;
    g_turn *= 0.60 + 0.70 * stagger;

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
        for (int i = 0; i < 60; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0009) { hit = true; break; }
            // The tile nearest a sample is not always the nearest tile,
            // so the step is kept short of the reported distance.
            t += d * 0.50;
            if (t > tb1) break;
        }

        if (hit) {
            float mat  = g_mat;
            float seed = g_seed;
            float trad = g_rad;
            vec3  n    = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            float bac  = clamp(dot(n, -lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 50.0);

            if (mat > 0.5) {
                col = core_tint.rgb * (0.95 + 1.30 * dif + 1.25 * fre)
                    * (0.85 + 0.95 * AUDIO_BEAT);
            } else {
                // Each tessera takes its own value from its own hash,
                // which is what stops a tiled surface reading as one
                // painted skin.
                vec3 tt = tile_tint.rgb * (0.55 + 0.90 * seed);
                float rim = smoothstep(0.62, 1.0, trad);

                col = tt * (0.10 + 1.25 * dif + 0.32 * bac)
                    + core_tint.rgb * rim * (0.45 + 1.45 * kindle)
                                    * (0.60 + 0.90 * AUDIO_SNARE)
                    + core_tint.rgb * fre * (0.55 + 1.05 * kindle)
                    + vec3(1.0, 0.98, 0.95) * spec * (1.55 + 1.35 * AUDIO_BEAT);
            }
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.0, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.30 + pow(ca, 30.0) * 0.64) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr2) * (0.40 + 0.60 * kindle) * (0.55 + 0.90 * AUDIO_BEAT);
    col += core_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
