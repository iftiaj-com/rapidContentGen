/*{
  "ADITS": 1,
  "DESCRIPTION": "A ring of mercury beads whose blend radius is the whole morph: it rests as one fused lobed mass, parts into a rosary of seven distinct beads, and breaks into fourteen small ones flung wide as the spectrum brightens, the film hue keyed to the grazing angle so the chrome stays vivid instead of muddying.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "iridescent"],
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
    { "NAME": "fuse",       "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.10, "MAX": 0.80,
      "LABEL": "Surface Tension", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "wander",     "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Bead Wander", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "film",       "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Film Iridescence", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "metal_tint", "TYPE": "color", "DEFAULT": [0.62, 0.70, 0.86, 1.00],
      "LABEL": "Metal Tint" },
    { "NAME": "film_tint",  "TYPE": "color", "DEFAULT": [0.24, 0.62, 1.00, 1.00],
      "LABEL": "Film Tint" }
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

// A smooth union. Its blend radius is the only thing separating a fused
// mass from a string of beads, which is why it carries the whole morph
// here rather than being a cosmetic fillet (guide 12.5).
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float g_k, g_orb, g_bead, g_extra, g_nuc, g_bob, g_ph;

float map(vec3 p) {
    float d = length(p) - g_nuc;

    for (int i = 0; i < 14; i++) {
        float fi = float(i);

        // Seven evenly spaced beads, and seven more interleaved between
        // them. Laying the extras in the slots after the first seven
        // instead would bunch the resting ring into half the circle.
        float a  = fi * (TAU / 7.0) + g_ph;
        float w  = 1.0;
        float rs = 1.0;
        if (fi > 6.5) {
            a  = (fi - 7.0) * (TAU / 7.0) + TAU / 14.0 + g_ph;
            w  = g_extra;
            rs = 0.78;
        }

        // The undulation is kept well under the orbit radius. Let it grow
        // to the same order and the ring stops reading as a ring at all.
        float orb = g_orb * rs * (1.0 + g_bob * 0.055 * cos(a * 2.0 - g_ph));
        vec3  c   = vec3(cos(a) * orb,
                         g_bob * 0.090 * sin(a * 2.0 + g_ph),
                         sin(a) * orb);

        // A bead whose radius has gone to nothing is simply absent, which
        // is how the count rises without a loop bound that moves.
        float r = g_bead * w;
        d = smin(d, length(p - c) - r, g_k);
    }
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

// A studio the metal can reflect. Built in object space, so the highlights
// travel with the object as the real camera orbits instead of sitting on
// the plane like a painted smudge.
vec3 envChrome(vec3 r) {
    float up = r.y;
    // A bright dome over a dark floor with a hot line where they meet.
    // The horizon line is what a mirror needs most: without an edge to
    // reflect there is nothing in the image to say the surface is one.
    vec3 c = mix(vec3(0.020, 0.024, 0.038),
                 metal_tint.rgb * (0.70 + 0.70 * up),
                 smoothstep(-0.30, 0.40, up));
    c += vec3(1.0, 0.99, 0.96) * smoothstep(0.075, 0.0, abs(up - 0.02)) * 0.85;
    c += vec3(1.0, 0.98, 0.94) * pow(max(dot(r, normalize(vec3(0.42, 0.80, 0.44))), 0.0), 72.0) * 4.2;
    c += film_tint.rgb * pow(max(dot(r, normalize(vec3(-0.62, 0.24, -0.52))), 0.0), 18.0) * 1.20;
    c += metal_tint.rgb * pow(max(dot(r, normalize(vec3(0.10, -0.88, 0.46))), 0.0), 10.0) * 0.35;
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

    g_k     = w1 * 0.210 + w2 * 0.075 + w3 * 0.026;
    g_orb   = w1 * 0.420 + w2 * 0.630 + w3 * 0.745;
    g_bead  = w1 * 0.260 + w2 * 0.205 + w3 * 0.152;
    g_extra = w1 * 0.000 + w2 * 0.060 + w3 * 1.000;
    g_nuc   = w1 * 0.300 + w2 * 0.220 + w3 * 0.140;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    float grow = (0.94 + 0.14 * fuse) * (0.98 + 0.03 * sin(ph * TAU));
    g_orb  *= grow;
    g_bead *= grow * (0.94 + 0.14 * AUDIO_KICK);
    g_k    *= 0.70 + 0.85 * fuse + 0.30 * AUDIO_KICK;
    g_bob   = 0.55 + 1.10 * wander;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float tip = 0.34 * sin(ph * TAU) + 0.30;
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

            // Thin film. The hue is keyed to the grazing angle rather
            // than to any density, which is what keeps it saturated at
            // the limb instead of collapsing to grey; the exponent is
            // kept low so the colour spreads over the bead rather than
            // sitting on a knife-edge rim.
            float fangle = pow(1.0 - ndv, 2.0);
            vec3 irid = 0.5 + 0.5 * cos(TAU * (fangle * 1.4 + 0.16 * film
                                        + vec3(0.0, 0.33, 0.67)));

            // A metal reflects at nearly full strength at every angle,
            // so the reflection is not attenuated by fresnel here. Doing
            // that is what turns chrome into near-black plastic.
            float rim = pow(1.0 - ndv, 4.0);

            col = envChrome(refl) * mix(metal_tint.rgb, vec3(1.0), 0.45)
                + irid * fangle * (0.55 + 1.65 * film) * (0.70 + 0.80 * AUDIO_BEAT)
                + film_tint.rgb * rim * (0.45 + 0.95 * film);
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    // The reference lit its whole frame this way; here it is clamped to
    // the object so the footage behind it stays legible.
    float ca = clamp(1.0 - near * 5.4, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.30 + pow(ca, 30.0) * 0.66) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * film) * (0.55 + 0.90 * AUDIO_BEAT);
    col += film_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = col / (1.0 + col * 0.34);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
