/*{
  "ADITS": 1,
  "DESCRIPTION": "A hooded revenant of luminous vapour with two embers burning where its face should be, drawn by how deep each ray sank into the body rather than by shading a surface, so it has no skin to catch the light; it rests as a gathered figure and unfurls into a billowing shroud and then tears into a spray of wisps as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "volumetric"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.10, "MAX": 0.74,
      "LABEL": "Body Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "billow",     "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.86,
      "LABEL": "Shroud Billow", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "ember",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Ember Light", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "veil_tint",  "TYPE": "color", "DEFAULT": [0.20, 0.56, 0.98, 1.00],
      "LABEL": "Veil Tint" },
    { "NAME": "eye_tint",   "TYPE": "color", "DEFAULT": [1.00, 0.28, 0.12, 1.00],
      "LABEL": "Ember Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  6.40
#define BOUND  1.55

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
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
// The vapour body.
//
// A cowl smoothly joined to a shroud, both torn by a folded wave field.
// The density is taken from abs(d), so there is no surface anywhere:
// the ray sinks in, and how far it sank is the whole shading model.
// ------------------------------------------------------------------

float g_hem, g_neck, g_hood, g_curl, g_tear, g_scale, g_ph;

float wisp(vec3 p) {
    // Three folded waves, every multiplier on the loop angle an integer
    // so the drift closes. The vertical terms make the shroud crawl
    // upward rather than merely wobble in place.
    float w = sin(p.x * 3.10 + p.y * 4.0 - g_ph)
            + sin(p.z * 2.70 - p.y * 3.0 + g_ph * 2.0) * 0.72
            + sin((p.x + p.z) * 5.30 + p.y * 6.0 - g_ph * 3.0) * 0.38;
    return w * 0.42;
}

float body(vec3 p) {
    p /= g_scale;

    float rad = length(p.xz);
    float a   = atan(p.z, p.x);

    // Shroud: hem at the bottom, drawn in at the neck.
    float hn = clamp((p.y + 1.05) / 1.55, 0.0, 1.0);
    float prof = mix(g_hem, g_neck, smoothstep(0.0, 1.0, hn));
    // Cloth: seven broad folds with a finer set riding on them, both
    // deepening toward the hem where a shroud actually gathers.
    float fold = 1.0 + (1.0 - hn) *
        (g_curl * cos(a * 7.0 + p.y * 3.0 + g_ph)
       + (0.055 + 0.28 * g_curl) * cos(a * 17.0 - p.y * 5.0 - g_ph * 2.0));
    float shroud = (rad - prof * fold) * 0.78;
    shroud = max(shroud, -1.05 - p.y);
    shroud = max(shroud, p.y - 0.60);

    // Cowl over the head, bowed slightly forward.
    vec3 hp = p - vec3(0.0, 0.72, 0.06);
    float head = length(hp * vec3(1.0, 0.88, 1.06)) - g_hood;

    float d = smin(shroud, head, 0.26);
    d += wisp(p) * g_tear;
    return d * g_scale;
}

// Two embers where the face should be. Mirrored in x, so they sweep
// past the viewer together as the figure turns.
float emberPair(vec3 p) {
    p /= g_scale;
    p.x = abs(p.x);
    vec3 e = p - vec3(0.088, 0.74, 0.22);
    return exp(-dot(e, e) * 300.0);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.476, 0.440, rr);
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

    g_hem  = w1 * 0.38 + w2 * 0.50 + w3 * 0.58;
    g_neck = w1 * 0.19 + w2 * 0.22 + w3 * 0.16;
    g_hood = w1 * 0.27 + w2 * 0.24 + w3 * 0.18;
    g_curl = w1 * 0.17 + w2 * 0.26 + w3 * 0.36;
    g_tear = w1 * 0.05 + w2 * 0.13 + w3 * 0.30;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_scale = (0.98 + 0.20 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_curl *= 0.70 + 0.70 * billow;
    g_tear *= 0.70 + 0.65 * billow + 0.30 * AUDIO_KICK;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // The figure turns once per loop and sways. It never tips far, so
    // the cowl stays legible and the embers sweep past the viewer.
    float spin = ph * TAU;
    float sway = 0.09 * sin(ph * TAU * 2.0);
    pR(ro.xz, spin); pR(ro.yz, sway);
    pR(rd.xz, spin); pR(rd.yz, sway);

    vec3  acc   = vec3(0.0);
    float cov   = 0.0;
    float trans = 1.0;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        // A tighter shell reads as a denser, more defined revenant.
        float kk = 7.0 + 20.0 * ember;
        for (int i = 0; i < 60; i++) {
            vec3 p = ro + rd * t;
            float d = body(p);

            float ad = abs(d);
            float ds = max(ad * 0.55, 0.013);
            float dens = exp(-kk * ad) * (3.6 + 4.4 * ember);
            float glowTake = 1.0 - exp(-dens * ds);

            // Cold at the hem, warmer where the field runs deepest, so
            // the heat sits inside the cowl and not on the outside.
            float hot = smoothstep(0.06, -0.26, d);
            vec3 c = mix(veil_tint.rgb, eye_tint.rgb, hot * hot * 0.75);
            c *= 0.45 + 0.95 * smoothstep(-1.05, 0.75, p.y / g_scale);

            acc  += c * glowTake * trans;
            cov  += glowTake * trans;

            // The embers are emitters, not surface: they light through
            // whatever veil is still in front of them.
            acc += eye_tint.rgb * emberPair(p)
                 * (7.0 + 8.5 * ember + 9.0 * AUDIO_BEAT) * ds * trans;

            trans *= 1.0 - glowTake;

            t += ds;
            if (trans < 0.03 || t > tb1) break;
        }
    }

    vec3  col   = acc * (1.05 + 0.75 * AUDIO_BEAT);
    float alpha = clamp(cov * 1.10, 0.0, 1.0);

    col = col / (1.0 + col * 0.45);

    // ---- bounded hub glow, well inside the frame edge (guide 8) ------
    float halo = 0.0030 / (dot(uv, uv) + 0.0150) * smoothstep(0.38, 0.05, rr);
    col += mix(veil_tint.rgb, eye_tint.rgb, 0.35) * halo
         * (0.28 + 0.70 * AUDIO_BEAT + 0.32 * ember) * (1.0 - alpha * 0.80);
    alpha = clamp(alpha + halo * 0.26 * (1.0 - alpha), 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
