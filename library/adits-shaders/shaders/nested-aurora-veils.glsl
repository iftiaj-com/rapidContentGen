/*{
  "ADITS": 1,
  "DESCRIPTION": "Five nested veils of light, each an ellipsoid solved in closed form and composited outer to inner without a single march step, every one carrying its own drifting curtain pattern; it rests as one dense pearl and separates into spaced veils and then into a wide nested cage of tilted shells as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "volumetric"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.10, "MAX": 0.76,
      "LABEL": "Veil Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "curtain",    "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.05, "MAX": 0.88,
      "LABEL": "Curtain Drift", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "lucid",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Veil Light", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "cold_tint",  "TYPE": "color", "DEFAULT": [0.16, 0.92, 0.68, 1.00],
      "LABEL": "Cold Tint" },
    { "NAME": "warm_tint",  "TYPE": "color", "DEFAULT": [0.86, 0.24, 0.86, 1.00],
      "LABEL": "Warm Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.30

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

// ------------------------------------------------------------------
// Nested shells, solved rather than marched.
//
// Each veil is an ellipsoid, which is a sphere in a scaled space, so a
// single quadratic gives the exact hit. Because the shells are strictly
// nested the front-to-back order is already known, and no sorting and
// no stepping are needed at all. That is why this object costs a
// fraction of anything marched.
// ------------------------------------------------------------------

float g_ph, g_R, g_gap, g_tiltA, g_squash, g_alpha, g_freq;

// Front hit of an ellipsoid, or -1 on a miss. Normal returned too.
float hitVeil(vec3 ro, vec3 rd, vec3 rad, out vec3 nrm) {
    nrm = vec3(0.0, 1.0, 0.0);
    vec3 o = ro / rad;
    vec3 d = rd / rad;
    float a = dot(d, d);
    float b = dot(o, d);
    float c = dot(o, o) - 1.0;
    float h = b * b - a * c;
    if (h < 0.0) return -1.0;
    float t = (-b - sqrt(h)) / a;
    if (t <= 0.0) return -1.0;
    nrm = normalize((ro + rd * t) / (rad * rad));
    return t;
}

// The curtain running over one veil: folded bands, drifting, with every
// multiplier on the loop angle an integer so the drift closes exactly.
float curtainAt(vec3 n, float seed) {
    float a = atan(n.z, n.x);
    float w = sin(a * (3.0 + seed) + n.y * g_freq - g_ph)
            + sin(a * (7.0 + seed) - n.y * g_freq * 1.7 + g_ph * 2.0) * 0.62
            + sin(n.y * g_freq * 2.6 + g_ph * 3.0) * 0.38;
    return w * 0.42;
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

    g_gap    = w1 * 0.030 + w2 * 0.105 + w3 * 0.165;
    g_tiltA  = w1 * 0.020 + w2 * 0.170 + w3 * 0.400;
    g_squash = w1 * 0.020 + w2 * 0.180 + w3 * 0.380;
    g_alpha  = w1 * 0.640 + w2 * 0.330 + w3 * 0.190;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_R    = (0.52 + 0.16 * swell) * (0.97 + 0.05 * sin(ph * TAU))
           * (0.96 + 0.10 * AUDIO_KICK);
    g_freq = 3.4 + 7.0 * curtain;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float spin = ph * TAU;
    float tip  = 0.28 * sin(ph * TAU * 2.0);
    pR(ro.xz, spin); pR(ro.yz, tip);
    pR(rd.xz, spin); pR(rd.yz, tip);

    vec3 lightD = normalize(vec3(0.44, 0.76, 0.48));

    vec3  acc   = vec3(0.0);
    float cov   = 0.0;
    float trans = 1.0;

    // Outer veil first: nested shells are already in depth order.
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float shellR = g_R * (1.0 + g_gap * (4.0 - fi));

        // Each veil is squashed and tilted a little more than the last,
        // so the stack reads as separate skins and not as one fat ball.
        vec3 rad = vec3(shellR * (1.0 + g_squash * 0.35 * fi),
                        shellR * (1.0 - g_squash * 0.45 * fi),
                        shellR * (1.0 + g_squash * 0.12 * fi));

        vec3 lro = ro, lrd = rd, llight = lightD;
        float ta = g_tiltA * fi + g_ph;
        pR(lro.xy, ta);  pR(lro.yz, ta * 0.6);
        pR(lrd.xy, ta);  pR(lrd.yz, ta * 0.6);
        pR(llight.xy, ta); pR(llight.yz, ta * 0.6);

        vec3 n;
        float t = hitVeil(lro, lrd, rad, n);
        if (t < 0.0) continue;

        float dif  = clamp(dot(n, llight), 0.0, 1.0);
        float fre  = pow(clamp(1.0 + dot(n, lrd), 0.0, 1.0), 2.6);
        float spec = pow(clamp(dot(reflect(lrd, n), llight), 0.0, 1.0), 40.0);

        float cur = curtainAt(n, fi * 1.7);
        float band = smoothstep(0.10, 0.42, abs(cur));
        float rib  = smoothstep(0.055, 0.0, abs(fract(cur * 5.0) - 0.5));

        vec3 tone = mix(cold_tint.rgb, warm_tint.rgb,
                        clamp(0.5 + 1.1 * cur, 0.0, 1.0));

        vec3 c = tone * (0.40 + 1.30 * dif) * (0.45 + 1.20 * band)
               + tone * fre * (1.45 + 2.10 * lucid)
               + tone * rib * (1.30 + 2.60 * lucid) * (0.60 + 0.90 * AUDIO_SNARE)
               + vec3(1.0, 0.98, 0.96) * spec * (1.35 + 1.35 * AUDIO_BEAT);

        float glowTake = clamp(g_alpha * (0.45 + 0.95 * fre + 0.75 * band), 0.0, 1.0);
        acc  += c * glowTake * trans;
        cov  += glowTake * trans;
        trans *= 1.0 - glowTake;
    }

    vec3  col   = acc * (1.55 + 0.90 * AUDIO_BEAT);
    float alpha = clamp(cov, 0.0, 1.0);
    col = col / (1.0 + col * 0.30);

    // ---- bounded hub glow, well inside the frame edge (guide 8) ------
    float halo = 0.0055 / (dot(uv, uv) + 0.0100) * smoothstep(0.42, 0.05, rr);
    col += mix(cold_tint.rgb, warm_tint.rgb, 0.5) * halo
         * (0.30 + 0.80 * AUDIO_BEAT + 0.35 * lucid) * (1.0 - alpha * 0.80);
    alpha = clamp(alpha + halo * 0.28 * (1.0 - alpha), 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
