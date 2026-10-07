/*{
  "ADITS": 1,
  "DESCRIPTION": "A mass of cooled basalt lit from inside by a crawling network of incandescent fissures, wrapped in a heat corona traced from how near each ray passed; it rests as a heavy round slag boulder and is recut into a fissured anvil slab and then a six-pointed cinder jack as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "fractal"],
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
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.12, "MAX": 0.78,
      "LABEL": "Mass Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "warp",       "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Crust Warp", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "heat",       "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Fissure Heat", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "crust_tint", "TYPE": "color", "DEFAULT": [0.13, 0.11, 0.14, 1.00],
      "LABEL": "Crust Tint" },
    { "NAME": "ember_tint", "TYPE": "color", "DEFAULT": [1.00, 0.32, 0.05, 1.00],
      "LABEL": "Ember Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  7.60
#define BOUND  1.66

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
// Two fields, intersected.
//
//   crust()    a fixed abs-fold foam. Its scale and offset never move
//              with the selector, so its detail always resolves; only
//              the fold angles breathe, which makes the crust creep.
//   envelope() the silhouette. A boulder, an anvil slab and a cinder
//              jack, weighted-summed, so an archetype is a shape and
//              never a fractal frequency.
// ------------------------------------------------------------------

float g_a1, g_a2;                 // crust fold angles
float g_w1, g_w2, g_w3, g_size;   // envelope weights and overall reach
float g_trap, g_vein;             // orbit traps, read back after a hit

float crust(vec3 p) {
    float sc = 1.0;
    float trap = 1e9;
    float vein = 1e9;
    for (int i = 0; i < 5; i++) {
        pR(p.xy, g_a1);
        pR(p.yz, g_a2);
        p = abs(p);
        if (p.x + p.y < 0.0) p.xy = -p.yx;
        if (p.x + p.z < 0.0) p.xz = -p.zx;
        if (p.y + p.z < 0.0) p.zy = -p.yz;
        p = p * 1.58 - vec3(1.10, 0.92, 1.05) * 0.58;
        sc *= 1.58;
        if (i > 0) {
            trap = min(trap, length(p));
            vein = min(vein, abs(p.x) + abs(p.z));
        }
    }
    g_trap = trap;
    g_vein = vein;
    return (length(p) - 0.62) / sc;
}

float envelope(vec3 p) {
    p /= g_size;

    // boulder
    float a = length(p) - 1.22;

    // anvil slab
    vec3 q = abs(p) - vec3(1.05, 0.52, 1.05);
    float b = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.06;

    // six-pointed cinder jack: three tapered rods through the origin
    float L = 1.48, T = 0.30;
    float c = min(min(length(p.yz) - T * (1.0 - abs(p.x) / L),
                      length(p.xz) - T * (1.0 - abs(p.y) / L)),
                      length(p.xy) - T * (1.0 - abs(p.z) / L));
    c = max(c, length(p) - L);

    return (g_w1 * a + g_w2 * b + g_w3 * c) * g_size;
}

float map(vec3 p) {
    return max(envelope(p), crust(p));
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0026;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Black body ramp: dead crust, then dull red, orange, and white.
vec3 glowRamp(float h) {
    vec3 c = ember_tint.rgb * smoothstep(0.0, 0.50, h);
    c = mix(c, mix(ember_tint.rgb, vec3(1.0, 0.78, 0.38), 0.85), smoothstep(0.42, 0.86, h));
    c = mix(c, vec3(1.0, 0.95, 0.88), smoothstep(0.88, 1.00, h));
    return c;
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
    sel = clamp(sel + 0.36 * (AUDIO_HAT - AUDIO_KICK) + 0.20 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    g_w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    g_w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    g_w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = g_w1 + g_w2 + g_w3 + 1e-4;
    g_w1 /= ws; g_w2 /= ws; g_w3 /= ws;

    // Shared parameter: reach slides continuously across the whole
    // selector range, so the envelope keeps moving mid-blend (12.6).
    float breathe = 0.5 + 0.5 * sin(ph * TAU);
    g_size = (0.94 + 0.10 * breathe) * (0.94 + 0.14 * swell + 0.05 * AUDIO_KICK);
    g_a1 = 0.34 + warp * 0.24 + 0.11 * sin(ph * TAU);
    g_a2 = 0.20 + warp * 0.15 + 0.08 * cos(ph * TAU * 2.0);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // The mass turns once per loop, marched in its own frame.
    float spin = ph * TAU;
    float roll = 0.30 * sin(ph * TAU * 2.0);
    pR(ro.xz, spin); pR(ro.yz, roll);
    pR(rd.xz, spin); pR(rd.yz, roll);
    vec3 lightD = normalize(vec3(0.48, 0.76, 0.44));

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;   // closest approach, the ray-miss glow term

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 44; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.5));
            if (d < 0.0009 + 0.0010 * t) { hit = true; break; }
            t += d * 0.85;
            if (t > tb1) break;
        }

        if (hit) {
            float trap = g_trap;
            float vein = g_vein;
            vec3  n    = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            float bac  = clamp(dot(n, -lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.2);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 26.0);

            // Fissures: two families of contour lines through the orbit
            // traps. Their offsets drift once per loop, so the splits
            // crawl across the crust instead of sitting still.
            float wv = 0.055 + 0.060 * heat;
            float f1 = abs(fract(vein * 1.70 + 0.30 * sin(ph * TAU)) - 0.5);
            float f2 = abs(fract(trap * 1.15 - 0.25 * cos(ph * TAU * 2.0)) - 0.5);
            float crack = max(smoothstep(wv, 0.0, f1),
                              smoothstep(wv * 1.3, 0.0, f2) * 0.70);
            float hotv = clamp(crack * (0.62 + 0.80 * heat)
                                     * (0.70 + 0.60 * AUDIO_KICK), 0.0, 1.0);

            vec3 body = crust_tint.rgb * (0.10 + 0.60 * dif + 0.18 * bac);
            body += vec3(1.0, 0.94, 0.86) * spec * 0.45;
            body += ember_tint.rgb * fre * (0.30 + 0.45 * heat);

            col = body + glowRamp(hotv) * hotv * (1.45 + 1.55 * hotv)
                       * (0.82 + 0.62 * AUDIO_BEAT);
            alpha = 1.0;
        }
    }

    // ---- heat corona from the closest approach ----------------------
    // Rays that pass near the mass without hitting it still carry its
    // heat, which draws a shell hugging the silhouette for no extra march.
    float ca = clamp(1.0 - near * 4.6, 0.0, 1.0);
    float corona = (pow(ca, 5.0) * 0.75 + pow(ca, 26.0) * 1.35) * (1.0 - alpha);
    corona *= smoothstep(0.442, 0.10, rr) * (0.45 + 0.55 * heat) * (0.60 + 0.85 * AUDIO_BEAT);
    col += mix(ember_tint.rgb, vec3(1.0, 0.70, 0.30), 0.35) * corona;
    alpha = clamp(alpha + corona * 0.55, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
