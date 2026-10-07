/*{
  "ADITS": 1,
  "DESCRIPTION": "A translucent jade effigy whose whole body is one sphere pushed through four folds of a sine warp, each fold driven by the axis next to it so the form twists rather than merely bulges; it rests as a smooth three-lobed stone and grows a knotted torso and then a deeply convoluted mass as the spectrum brightens.",
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
      "LABEL": "Stone Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "flux",       "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.82,
      "LABEL": "Fold Flux", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "sheen",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Polish", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "stone_tint", "TYPE": "color", "DEFAULT": [0.10, 0.62, 0.44, 1.00],
      "LABEL": "Stone Tint" },
    { "NAME": "vein_tint",  "TYPE": "color", "DEFAULT": [0.90, 1.00, 0.72, 1.00],
      "LABEL": "Vein Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  9.40
#define BOUND  2.25

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
// The body.
//
// One sphere, pushed through four folds of a sine warp. Each fold uses
// the yzx swizzle, so every axis is driven by the axis next to it, and
// each fold reads the coordinate the previous one already moved. That
// coupling is what makes the result twist instead of merely bulge.
//
// A warp this heavy destroys the distance bound, so the march has to
// be told to take short steps; the factor below is that safety margin.
// ------------------------------------------------------------------

float g_g1, g_g2, g_g3, g_g4, g_rad, g_ph;
float g_vein;   // radius after the first fold only, which still varies
                // across the finished surface and so can carry veining

vec3 warp(vec3 p) {
    p += g_g1 * 0.720 * sin(p.yzx *  2.0 + g_ph);
    g_vein = length(p);
    p += g_g2 * 0.420 * sin(p.yzx *  4.0 - g_ph * 2.0);
    p += g_g3 * 0.220 * sin(p.yzx *  8.0 + g_ph * 3.0);
    p += g_g4 * 0.090 * sin(p.yzx * 16.0 - g_ph * 4.0);
    return p;
}

float map(vec3 q) {
    // The safety factor is set by the steepest the warp can get: the
    // sum of amplitude times frequency over all four folds.
    return (length(warp(q)) - g_rad) * 0.13;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0030;
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

    // The archetype is which folds are switched on, exactly the weight
    // vector the reference used to grow its form (guide 12.5).
    g_g1 = w1 * 0.62 + w2 * 0.86 + w3 * 1.00;
    g_g2 = w1 * 0.10 + w2 * 0.52 + w3 * 0.86;
    g_g3 = w1 * 0.02 + w2 * 0.14 + w3 * 0.52;
    g_g4 = w1 * 0.00 + w2 * 0.03 + w3 * 0.20;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_rad = (0.80 + 0.20 * swell) * (0.97 + 0.05 * sin(ph * TAU))
          * (0.96 + 0.10 * AUDIO_KICK);
    float fl = 0.80 + 0.45 * flux;
    g_g1 *= fl; g_g2 *= fl; g_g3 *= fl; g_g4 *= fl;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float spin = ph * TAU;
    float tip  = 0.30 * sin(ph * TAU * 2.0);
    pR(ro.xz, spin); pR(ro.yz, tip);
    pR(rd.xz, spin); pR(rd.yz, tip);

    vec3 lightD = normalize(vec3(0.44, 0.78, 0.44));

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 64; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.8));
            if (d < 0.0012) { hit = true; break; }
            t += d;
            if (t > tb1) break;
        }

        if (hit) {
            float trap = g_vein;
            vec3  n    = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            // Wrapped light, which is how a translucent stone carries
            // brightness round onto its shadowed side.
            float wrap = clamp(0.5 + 0.5 * dot(n, lightD), 0.0, 1.0);
            float bac  = clamp(dot(n, -lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 2.8);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 64.0);

            // Cloudy veining: contours of the warped radius, so the
            // veins run through the body rather than over its skin.
            float vein = smoothstep(0.13, 0.0, abs(fract(trap * 4.6) - 0.5));
            float cloud = 0.55 + 0.45 * sin(trap * 7.0 - g_ph);

            vec3 stone = stone_tint.rgb * (0.14 + 0.55 * dif + 0.70 * wrap * wrap)
                       + stone_tint.rgb * bac * 0.35;
            stone *= 0.70 + 0.50 * cloud;

            col = stone
                + vein_tint.rgb * vein * (0.45 + 1.25 * sheen) * (0.45 + 0.75 * wrap)
                + mix(stone_tint.rgb, vein_tint.rgb, 0.55) * fre * (0.70 + 1.20 * sheen)
                + vec3(1.0, 0.99, 0.96) * spec * (1.60 + 1.40 * AUDIO_SNARE);
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    // near is measured on the scaled distance, so the tightening
    // factor has to undo that scale as well.
    float ca = clamp(1.0 - near * 16.0, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.30 + pow(ca, 30.0) * 0.62) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * sheen) * (0.55 + 0.90 * AUDIO_BEAT);
    col += mix(stone_tint.rgb, vein_tint.rgb, 0.4) * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
