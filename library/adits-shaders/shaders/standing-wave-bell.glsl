/*{
  "ADITS": 1,
  "DESCRIPTION": "A hollow bell of light whose wall is a stack of standing wave modes, mirrored about its equator and drawn by accumulating glow through both walls, so the far side interferes with the near one; it rests as a slow banded shell and tightens into a ripple rosette and then a bristling interference star as the spectrum brightens.",
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
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.12, "MAX": 0.80,
      "LABEL": "Wave Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "drift",      "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Node Drift", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "sharpen",    "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Membrane Sharpness", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "tint",       "TYPE": "color", "DEFAULT": [0.10, 0.72, 0.92, 1.00],
      "LABEL": "Trough Tint" },
    { "NAME": "crest_tint", "TYPE": "color", "DEFAULT": [1.00, 0.44, 0.72, 1.00],
      "LABEL": "Crest Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  7.40
#define BOUND  1.62

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
// One membrane. Three radial modes and one angular mode, all blended
// by the morph weights, so the drumhead, the rosette and the star are
// a single height function at three settings (guide 12.5).
// ------------------------------------------------------------------

float g_k1, g_k2, g_k3, g_amp, g_R, g_angN, g_angA, g_ph;
float g_lastH;   // wave height at the sample, read back for colour

// Distance to the shell, never negative: the ray passes through both
// sides of it and the march simply slows there, which is what lays the
// glow down and lets the far wall interfere with the near one.
float mapShell(vec3 p) {
    float m = max(-p.y, 0.0);
    p.y += m + m;                      // mirror: the modes are symmetric
    float rr = length(p);
    vec3  n  = p / max(rr, 1e-4);
    float a  = atan(n.z, n.x);

    // Three latitude modes stacked in octaves, exactly the wave stack the
    // reference marched, wrapped onto a sphere instead of a plane.
    float w = cos(n.y * g_k1 - g_ph) * 0.58
            + cos(n.y * g_k2 + g_ph * 2.0) * 0.27
            + cos(n.y * g_k3 - g_ph * 3.0) * 0.13;
    float ang = 1.0 + g_angA * cos(a * g_angN + g_ph);
    g_lastH = w;

    float R = g_R * (1.0 + g_amp * w * 0.5) * ang;
    return abs(rr - R) * 0.80;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr2 = length(uv);
    float bound = smoothstep(0.476, 0.440, rr2);
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

    g_k1   = w1 *  5.20 + w2 *  9.60 + w3 * 15.40;
    g_k2   = w1 * 10.40 + w2 * 19.20 + w3 * 30.80;
    g_k3   = w1 * 18.60 + w2 * 31.00 + w3 * 44.00;
    g_angN = w1 *  3.00 + w2 *  7.00 + w3 * 15.00;
    g_angA = w1 *  0.04 + w2 *  0.13 + w3 *  0.22;
    g_amp  = w1 *  0.40 + w2 *  0.32 + w3 *  0.24;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_R   = (0.92 + 0.20 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_amp *= 0.85 + 0.40 * swell + 0.22 * AUDIO_KICK;

    // The standing pattern travels: one full node march per loop, plus
    // a mid-driven second march, both integer harmonics so it closes.
    g_ph = ph * TAU + 1.9 * drift * sin(ph * TAU * 2.0);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // The lens precesses slowly so it is never seen perfectly edge-on.
    float tipA = 0.34 * sin(ph * TAU);
    float tipB = ph * TAU;
    pR(ro.yz, tipA); pR(ro.xz, tipB);
    pR(rd.yz, tipA); pR(rd.xz, tipB);

    vec3  acc = vec3(0.0);
    float cov = 0.0;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        float trans = 1.0;
        // A sharper membrane is a tighter, denser shell of light.
        float kk = 700.0 + 4200.0 * sharpen;
        for (int i = 0; i < 56; i++) {
            vec3 p = ro + rd * t;
            float d = mapShell(p);
            float ds = max(d * 0.50, 0.0065);

            // Emission and absorption, both weighted by the step length,
            // so a ray that crawls near the sheet does not over-count it.
            float dens = exp(-kk * d * d) * 15.0;
            float glowTake = 1.0 - exp(-dens * ds);

            float hn = clamp(0.5 + 0.52 * g_lastH, 0.0, 1.0);
            vec3 c = mix(tint.rgb, crest_tint.rgb, smoothstep(0.10, 0.92, hn));
            c += vec3(1.0, 0.97, 0.94) * smoothstep(0.93, 1.0, hn) * 0.55;
            c *= 0.55 + 1.10 * hn;

            acc += c * glowTake * trans;
            cov += glowTake * trans;
            trans *= 1.0 - glowTake;

            t += ds;
            if (trans < 0.02 || t > tb1) break;
        }
    }

    acc *= 1.15 + 0.85 * AUDIO_BEAT;

    vec3  col   = acc;
    float alpha = clamp(cov, 0.0, 1.0);

    // A bounded hub glow, well inside the frame edge (guide 8).
    float halo = 0.0042 / (dot(uv, uv) + 0.0110) * smoothstep(0.42, 0.05, rr2);
    col += mix(tint.rgb, crest_tint.rgb, 0.45) * halo
         * (0.35 + 0.70 * AUDIO_BEAT + 0.35 * sharpen) * (1.0 - alpha * 0.80);
    alpha = clamp(alpha + halo * 0.30 * (1.0 - alpha), 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
