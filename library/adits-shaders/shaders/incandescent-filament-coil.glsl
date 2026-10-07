/*{
  "ADITS": 1,
  "DESCRIPTION": "A tungsten filament wound into a standing coil on two support posts, coloured from a black-body curve so its glow runs dull red at the cold ends and white at the hot centre while heat waves travel the wire; it rests as a loose open spring and winds into a tight coil and then a dense coiled coil as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "incandescent"],
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
    { "NAME": "current",    "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.10, "MAX": 0.80,
      "LABEL": "Drive Current", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "ripple",     "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Wire Ripple", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "bloom",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Bloom", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "post_tint",  "TYPE": "color", "DEFAULT": [0.30, 0.34, 0.42, 1.00],
      "LABEL": "Post Tint" },
    { "NAME": "halo_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.62, 0.24, 1.00],
      "LABEL": "Halo Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.20
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

// ------------------------------------------------------------------
// Black-body colour.
//
// An analytic fit to the colour of a black body at a given temperature
// in kelvin. It is the reason this object does not need a hand-picked
// gradient: the wire is given a temperature and the colour follows,
// so the cold ends land on dull red and the hot centre on white
// without either being chosen.
// ------------------------------------------------------------------

vec3 blackBody(float T) {
    vec3 c;
    c.x = 56100000.0 * pow(T, -1.5) + 148.0;
    if (T > 6500.0) {
        c.y = 35200000.0 * pow(T, -1.5) + 184.0;
    } else {
        c.y = 100.04 * log(T) - 623.6;
    }
    c.z = 194.18 * log(T) - 1448.6;
    c = clamp(c, 0.0, 255.0) / 255.0;
    if (T < 1000.0) c *= T / 1000.0;
    return c;
}

// ------------------------------------------------------------------
// The coil. A helix solved by finding the nearest turn directly, so
// the wire costs one evaluation however many turns it has, and the
// pitch is free to slide with the selector (guide 12.5).
// ------------------------------------------------------------------

float g_Rh, g_pitch, g_wire, g_rip, g_H, g_ph, g_post;
float g_along;   // height along the coil, read back for temperature
float g_mat;     // 0 wire, 1 post

float coil(vec3 p) {
    float a = atan(p.z, p.x);
    float r = length(p.xz);

    // Nearest turn: unwrap the height against the angle, round, re-wrap.
    float k  = floor(p.y / g_pitch - (a + g_ph) / TAU + 0.5);
    float yy = (k + (a + g_ph) / TAU) * g_pitch;

    // A ripple on the coil radius reads as a coil wound on a coil.
    float rr = g_Rh * (1.0 + g_rip * cos(a * 6.0 + p.y * 26.0 - g_ph * 2.0));

    float d = length(vec2(r - rr, p.y - yy)) - g_wire;
    g_along = p.y;
    return max(d, abs(p.y) - g_H);
}

float map(vec3 p) {
    float d = coil(p);
    g_mat = 0.0;

    // Two support posts, and a bar joining their feet.
    vec3 q = p;
    q.x = abs(q.x) - g_post;
    float legs = max(length(q.xz) - 0.030, abs(p.y) - g_H * 1.06);
    float bar  = max(length(vec2(p.z, p.y + g_H * 1.02)) - 0.030,
                     abs(p.x) - g_post);
    float post = min(legs, bar);
    if (post < d) { d = post; g_mat = 1.0; }
    return d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0014;
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

    g_Rh    = w1 * 0.340 + w2 * 0.300 + w3 * 0.255;
    g_pitch = w1 * 0.300 + w2 * 0.150 + w3 * 0.082;
    g_wire  = w1 * 0.055 + w2 * 0.040 + w3 * 0.028;
    g_rip   = w1 * 0.010 + w2 * 0.045 + w3 * 0.110;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    float grow = (0.94 + 0.14 * current) * (0.98 + 0.03 * sin(ph * TAU));
    g_Rh   *= grow;
    g_H     = 0.86 * grow;
    g_post  = 0.44 * grow;
    g_wire *= 0.90 + 0.22 * current + 0.12 * AUDIO_KICK;
    g_rip  *= 0.70 + 0.80 * ripple;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float spin = ph * TAU;
    float sway = 0.16 * sin(ph * TAU * 2.0);
    pR(ro.xz, spin); pR(ro.yz, sway);
    pR(rd.xz, spin); pR(rd.yz, sway);

    vec3 lightD = normalize(vec3(0.44, 0.72, 0.52));

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    // The filament runs hottest at its centre and coldest at the clamps,
    // with a wave of heat travelling the wire once per loop.
    float baseT = 1500.0 + 2900.0 * current + 1500.0 * AUDIO_KICK;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0008) { hit = true; break; }
            t += d * 0.72;
            if (t > tb1) break;
        }

        if (hit) {
            float mat = g_mat;
            vec3  n   = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 44.0);

            if (mat > 0.5) {
                // Cold steel clamps, lit only by the filament beside them.
                // Lit only by the filament beside them, so they take
                // its colour rather than adding a light of their own.
                vec3 lampLit = post_tint.rgb * blackBody(baseT) * 1.05;
                col = post_tint.rgb * 0.05
                    + lampLit * (0.14 + 0.75 * dif)
                    + lampLit * fre * 1.65
                    + vec3(1.0, 0.98, 0.95) * spec * 0.85;
            } else {
                float endFall = 1.0 - 0.55 * pow(clamp(abs(g_along) / g_H, 0.0, 1.0), 2.0);
                float wave = 0.80 + 0.20 * cos(g_along * 9.0 - ph * TAU * 2.0);
                float T = baseT * endFall * wave;
                vec3 body = blackBody(T);
                float lumin = smoothstep(900.0, 4200.0, T);
                col = body * (0.55 + 2.60 * lumin)
                    + body * fre * (0.85 + 1.35 * bloom)
                    + vec3(1.0, 0.99, 0.96) * spec * (0.85 + 1.20 * AUDIO_SNARE);
            }
            alpha = 1.0;
        }
    }

    // ---- bounded bloom from the closest approach (guide 8) -----------
    float ca = clamp(1.0 - near * 3.6, 0.0, 1.0);
    float glowTake = (pow(ca, 4.0) * 0.78 + pow(ca, 20.0) * 1.55) * (1.0 - alpha);
    glowTake *= smoothstep(0.442, 0.08, rr2) * (0.45 + 0.75 * bloom)
              * (0.55 + 0.90 * AUDIO_BEAT);
    col += mix(blackBody(baseT), halo_tint.rgb, 0.45) * glowTake;
    alpha = clamp(alpha + glowTake * 0.50, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
