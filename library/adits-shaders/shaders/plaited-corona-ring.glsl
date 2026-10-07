/*{
  "ADITS": 1,
  "DESCRIPTION": "A ring plaited from luminous strands whose cross-section is stirred by an iterative flow warp, so the whole braid creeps like liquid metal under an oil film; it rests as one thick fused rope and opens into a five-strand plait and then an eleven-strand frayed cable as the spectrum brightens.",
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
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.10, "MAX": 0.75,
      "LABEL": "Ring Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "flow",       "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.05, "MAX": 0.90,
      "LABEL": "Flow Turbulence", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "sheen",      "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Oil-Film Sheen", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "tint",       "TYPE": "color", "DEFAULT": [0.16, 0.94, 0.62, 1.00],
      "LABEL": "Film Tint" },
    { "NAME": "accent",     "TYPE": "color", "DEFAULT": [0.86, 0.20, 0.96, 1.00],
      "LABEL": "Film Accent" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  6.90
#define BOUND  1.46

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
// The flow warp: five folds of a coordinate stirred by its own value,
// the same iterative displacement the reference used for its fluid.
// Every multiplier on the loop angle is an integer, so the warp closes
// exactly at the loop boundary.
// ------------------------------------------------------------------

float g_ph;
vec2  g_band;   // warped coordinate at the sample, read back for colour

vec2 flowWarp(vec2 v) {
    for (int i = 1; i <= 5; i++) {
        float fi = float(i);
        v += cos(v.yx * fi + fi + g_ph) / fi;
    }
    return v;
}

// ------------------------------------------------------------------
// The braid. One strand ring at three counts, summed by the morph
// weights rather than driven by a fractional count, because a
// fractional polar repeat would leave a seam running round the torus.
// ------------------------------------------------------------------

float g_Rm, g_wob;
float g_w1, g_w2, g_w3;
float g_r1, g_r2, g_r3, g_t1, g_t2, g_t3;

float strand(float a, float r, float n, float ring, float tube) {
    float sect = TAU / n;
    float aa = mod(a + 0.5 * sect, sect) - 0.5 * sect;
    vec2 s = vec2(cos(aa) * r - ring, sin(aa) * r);
    return length(s) - tube;
}

float map(vec3 p) {
    float th = atan(p.z, p.x);
    vec2  q  = vec2(length(p.xz) - g_Rm, p.y);

    // Three turns of the plait per lap, plus one full turn per loop.
    pR(q, th * 3.0 + g_ph);

    vec2 w = flowWarp(q * 3.6 + vec2(th * 2.0, g_ph));
    g_band = w;
    float wob = g_wob * (sin(w.x) + sin(w.y)) * 0.5;

    float a = atan(q.y, q.x);
    float r = length(q);
    return g_w1 * strand(a, r, 2.0,  g_r1, g_t1 + wob)
         + g_w2 * strand(a, r, 5.0,  g_r2, g_t2 + wob)
         + g_w3 * strand(a, r, 11.0, g_r3, g_t3 + wob);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0028;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
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

    g_w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    g_w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    g_w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = g_w1 + g_w2 + g_w3 + 1e-4;
    g_w1 /= ws; g_w2 /= ws; g_w3 /= ws;

    g_r1 = 0.05; g_t1 = 0.325;
    g_r2 = 0.20; g_t2 = 0.145;
    g_r3 = 0.30; g_t3 = 0.075;

    // Shared parameters: reach and flow depth slide across the whole
    // selector range so the envelope keeps moving mid-blend (12.6).
    g_Rm  = (0.80 + 0.24 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_wob = (0.040 + 0.115 * flow) * (0.80 + 0.55 * AUDIO_KICK);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // The ring tips slowly so it is never seen exactly edge-on.
    float tipA = 0.42 * sin(ph * TAU);
    float tipB = 0.30 * cos(ph * TAU * 2.0);
    pR(ro.yz, tipA); pR(ro.xy, tipB);
    pR(rd.yz, tipA); pR(rd.xy, tipB);

    vec3 lightD = normalize(vec3(0.44, 0.78, 0.44));

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 48; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0012) { hit = true; break; }
            t += d * 0.55;      // the flow warp softens the bound
            if (t > tb1) break;
        }

        if (hit) {
            vec2 w = g_band;
            vec3 n = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            float bac  = clamp(dot(n, -lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 40.0);

            // Oil film: the warped coordinate picks the interference
            // order, and the viewing angle shifts it, as a real film does.
            float order = w.x * 1.30 + w.y * 0.80 + fre * 4.2;
            vec3  band = 0.5 + 0.5 * cos(order + vec3(0.0, 2.10, 4.20));
            vec3  film = mix(tint.rgb, accent.rgb, band.x);
            film = mix(film, vec3(1.0, 0.96, 0.92), smoothstep(0.88, 1.0, band.y));

            // Thin bright rules where the interference order turns over.
            float rule = smoothstep(0.34 - 0.24 * sheen, 0.0,
                                    abs(fract(order * 0.3183099) - 0.5));

            col = vec3(0.020, 0.024, 0.030) * (0.30 + 0.80 * dif + 0.25 * bac)
                + film * (0.30 + 0.85 * sheen) * (0.30 + 0.75 * dif + 0.55 * fre)
                + film * rule * (0.55 + 1.35 * sheen) * (0.70 + 0.80 * AUDIO_SNARE)
                + vec3(1.0, 0.97, 0.94) * spec * (1.10 + 0.90 * AUDIO_BEAT);
            alpha = 1.0;
        }
    }

    // ---- bounded sheath glow from the closest approach ---------------
    float ca = clamp(1.0 - near * 5.4, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.55 + pow(ca, 26.0) * 1.15) * (1.0 - alpha);
    sheath *= smoothstep(0.440, 0.10, rr) * (0.40 + 0.60 * sheen) * (0.55 + 0.90 * AUDIO_BEAT);
    col += mix(tint.rgb, accent.rgb, 0.5) * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
