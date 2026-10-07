/*{
  "ADITS": 1,
  "DESCRIPTION": "Six toothed cogs mounted on the faces of a cube around a lit core, drawn from a single gear evaluation by folding the point into the cube symmetry, which mirrors neighbouring cogs so they appear to counter-turn across every edge; it rests as a heavy solid escapement and opens into a spoked train and then a fine skeletal movement as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "mechanical"],
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
      "LABEL": "Cog Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "bite",       "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.05, "MAX": 0.88,
      "LABEL": "Tooth Bite", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "polish",     "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Metal Polish", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "metal_tint", "TYPE": "color", "DEFAULT": [0.34, 0.38, 0.46, 1.00],
      "LABEL": "Metal Tint" },
    { "NAME": "core_tint",  "TYPE": "color", "DEFAULT": [0.30, 0.94, 1.00, 1.00],
      "LABEL": "Core Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.80
#define BOUND  1.12
#define TEETH  16.0

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

// ------------------------------------------------------------------
// One cog, six times over.
//
// The point is folded so its largest component lies on y and then
// mirrored, which maps all six cube faces onto one. Because the fold
// mirrors rather than rotates, a cog and its neighbour across an edge
// turn opposite ways, which is what makes the teeth read as meshing.
// ------------------------------------------------------------------

float g_R, g_depth, g_th, g_hub, g_rimw, g_spokeW, g_rot, g_mount, g_core;
float g_mat;    // 0 cog, 1 core
float g_cogR;   // radius within the cog, for the turned finish

vec3 faceFold(vec3 p) {
    vec3 a = abs(p);
    if (a.x >= a.y && a.x >= a.z) return vec3(p.y, p.x, p.z);
    if (a.z >= a.y)               return vec3(p.x, p.z, p.y);
    return p;
}

float cog(vec3 q) {
    float r = length(q.xz);
    g_cogR = r;
    float a = atan(q.z, q.x) + g_rot;

    // Squared-off teeth on the rim.
    float rim = g_R + g_depth * smoothstep(-0.28, 0.28, cos(a * TEETH));
    float plate = max(r - rim, abs(q.y) - g_th);

    // Cut the web away between hub and rim, but keep six spokes.
    float annulus = max(g_hub - r, r - (g_R - g_rimw));
    float spoke   = abs(sin(a * 3.0)) - g_spokeW;
    float removal = max(annulus, -spoke);
    plate = max(plate, -removal);

    // Bore through the hub so the core shows.
    plate = max(plate, -(max(r - g_hub * 0.46, abs(q.y) - g_th - 0.02)));
    return plate;
}

float map(vec3 p) {
    vec3 q = faceFold(p);
    q.y = abs(q.y) - g_mount;

    float d = cog(q);
    g_mat = 0.0;

    float core = length(p) - g_core;
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

    // The tooth count stays fixed, since a fractional angular repeat
    // would drop a tooth at the seam. Everything else is free to slide.
    g_R      = w1 * 0.36 + w2 * 0.40 + w3 * 0.44;
    g_th     = w1 * 0.10 + w2 * 0.070 + w3 * 0.042;
    g_hub    = w1 * 0.30 + w2 * 0.24 + w3 * 0.17;
    g_rimw   = w1 * 0.28 + w2 * 0.13 + w3 * 0.060;
    g_spokeW = w1 * 0.90 + w2 * 0.42 + w3 * 0.17;
    g_mount  = w1 * 0.55 + w2 * 0.60 + w3 * 0.65;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    float grow = (0.94 + 0.14 * swell) * (0.98 + 0.03 * sin(ph * TAU));
    g_R     *= grow;
    g_hub   *= grow;
    g_mount *= grow;
    g_depth  = (0.060 + 0.100 * bite) * (0.85 + 0.35 * AUDIO_KICK);
    g_core   = (0.22 + 0.10 * swell) * (0.92 + 0.16 * AUDIO_KICK);
    g_rot    = ph * TAU * 2.0;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // The whole engine tumbles once per loop so every face comes round.
    float spin = ph * TAU;
    float tip  = 0.42 * sin(ph * TAU) + 0.30;
    pR(ro.yz, tip); pR(ro.xz, spin);
    pR(rd.yz, tip); pR(rd.xz, spin);

    vec3 lightD = normalize(vec3(0.44, 0.78, 0.44));

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
            t += d * 0.85;
            if (t > tb1) break;
        }

        if (hit) {
            float mat = g_mat;
            vec3  n   = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            float bac  = clamp(dot(n, -lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.2);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 48.0);
            float sp2  = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 9.0);

            if (mat > 0.5) {
                col = core_tint.rgb * (1.15 + 1.35 * dif + 1.25 * fre)
                    * (0.85 + 0.95 * AUDIO_BEAT);
            } else {
                // Brushed metal: a broad sheen plus a hard glint, with a
                // cool rim so the cog edges separate over dark footage.
                // Turned finish: concentric lathe rings on the faces,
                // which is what stops a flat cog face reading as grey card.
                float lathe = 0.5 + 0.5 * cos(g_cogR * (150.0 + 90.0 * polish));
                lathe = 0.62 + 0.38 * lathe;

                col = metal_tint.rgb * (0.05 + 0.52 * dif + 0.16 * bac) * lathe
                    + metal_tint.rgb * sp2 * (0.28 + 0.52 * polish) * lathe
                    + core_tint.rgb * fre * (0.95 + 1.65 * polish)
                    + vec3(1.0, 0.98, 0.95) * spec * (2.40 + 1.80 * AUDIO_SNARE) * lathe;
            }
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 6.0, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.30 + pow(ca, 30.0) * 0.66) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * polish) * (0.55 + 0.90 * AUDIO_BEAT);
    col += core_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
