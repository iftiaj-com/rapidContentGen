/*{
  "ADITS": 1,
  "DESCRIPTION": "A drop of liquid chrome being eaten by its own chemistry: a branching reaction network etches channels into the mirror, the banks stay bright metal and spectral light climbs out of the grooves; it rests as a smooth drop faintly veined and is cut into a deep river network and then eaten through into a chrome lace as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "chrome"],
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
      "LABEL": "Drop Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "stir",       "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Reaction Stir", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "spectra",    "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Spectral Wake", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "metal_tint", "TYPE": "color", "DEFAULT": [0.70, 0.76, 0.88, 1.00],
      "LABEL": "Metal Tint" },
    { "NAME": "wake_tint",  "TYPE": "color", "DEFAULT": [0.20, 1.00, 0.78, 1.00],
      "LABEL": "Wake Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.60
#define BOUND  1.06

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
// The reaction network.
//
// A Gray-Scott run needs a feedback buffer, which this profile does not
// have. The channels are built instead from a ridged field under one
// vector warp: the abs is what turns waves into creases, and the warp is
// what makes those creases branch and wander rather than run parallel.
// ------------------------------------------------------------------

float g_freq, g_ph, g_stir;

float channel(vec3 p) {
    vec3 q = p * g_freq;
    q += g_stir * vec3(sin(q.y * 1.70 + g_ph),
                       sin(q.z * 1.90 - g_ph * 2.0),
                       sin(q.x * 1.50 + g_ph * 3.0));
    float f = 0.0;
    float a = 0.50;
    for (int i = 0; i < 4; i++) {
        f += a * abs(sin(q.x) + cos(q.y) + sin(q.z) * 0.70);
        q = q * 1.87 + vec3(1.30, -0.70, 0.90);
        a *= 0.52;
    }
    return f * 0.62;
}

// ------------------------------------------------------------------
// The drop. A shell whose wall thins with the selector, with the
// channel cut into it and, once the wall is thin enough, right through
// it (guide 12.5).
// ------------------------------------------------------------------

float g_R, g_wall, g_cut, g_pierce, g_lobe, g_width;
float g_chan;   // distance to the channel centre line, for shading

// Distance to the nearest channel line, taken as a contour band through
// the field rather than as a threshold on it. A bare threshold has to be
// guessed against the field's absolute range, and if it lands outside
// that range nothing is cut at all.
float channelLine(vec3 p) {
    return abs(fract(channel(p) * 1.5) - 0.5);
}

float map(vec3 p) {
    float rad = length(p);
    if (rad < 1e-4) return -g_R;
    vec3 n = p / rad;

    // A drop, not a ball: drawn out at the top and heavy underneath.
    float prof = g_R * (1.0 - g_lobe * n.y * (1.0 - n.y) * 1.6);

    float cf = channelLine(p);
    g_chan = cf;

    // The channel eats inward from the outside.
    float eat = smoothstep(g_width, 0.0, cf);
    float outer = rad - (prof - g_cut * eat);
    float inner = (prof - g_wall) - rad;
    float d = max(outer, inner);

    // Once the wall is thin the middle of the channel breaks through it.
    // A pierce width at or below zero reaches nothing, since cf never
    // goes negative, which is what parks it at the resting archetype.
    d = max(d, (g_pierce - cf) * 0.60);
    return d * 0.80;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0018;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// A workshop the metal can reflect: horizontal strip lights over a dark
// floor. Strips give a mirror something with hard edges to carry, which
// is what makes the surface read as polished rather than merely bright.
vec3 envShop(vec3 r) {
    float band = sin(r.y * 9.0 + 0.6);
    vec3 c = metal_tint.rgb * 0.10;
    c += metal_tint.rgb * smoothstep(0.62, 0.98, band) * 0.95;
    c += vec3(1.0, 0.99, 0.97) * pow(smoothstep(0.90, 1.0, band), 3.0) * 0.80;
    c += metal_tint.rgb * smoothstep(-0.15, 0.65, r.y) * 0.30;
    c += wake_tint.rgb * pow(max(dot(r, normalize(vec3(-0.55, 0.30, -0.60))), 0.0), 16.0) * 0.55;
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

    g_cut   = w1 * 0.028 + w2 * 0.080 + w3 * 0.125;
    g_wall  = w1 * 0.560 + w2 * 0.190 + w3 * 0.080;
    g_lobe  = w1 * 0.220 + w2 * 0.320 + w3 * 0.420;
    g_width = w1 * 0.140 + w2 * 0.210 + w3 * 0.280;
    g_pierce = w1 * -1.00 + w2 * 0.040 + w3 * 0.110;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_R    = (0.66 + 0.14 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_freq = 3.6 + 3.4 * stir;
    g_stir = 0.20 + 0.55 * stir;
    g_cut *= 0.80 + 0.50 * AUDIO_KICK;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float spin = ph * TAU;
    float roll = 0.22 * sin(ph * TAU * 2.0);
    pR(ro.xz, spin); pR(ro.yz, roll);
    pR(rd.xz, spin); pR(rd.yz, roll);

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
            t += d * 0.62;
            if (t > tb1) break;
        }

        if (hit) {
            float f = g_chan;
            vec3  n = calcNormal(p);
            float ndv = max(dot(n, -rd), 0.0);

            // Dispersion, taken by reflecting three slightly different
            // normals rather than by offsetting the image: on a curved
            // mirror the split has to happen in the reflection.
            float dsp = 0.020 + 0.075 * spectra;
            vec3 e1 = envShop(reflect(rd, normalize(n + vec3( dsp, 0.0, 0.0))));
            vec3 e2 = envShop(reflect(rd, n));
            vec3 e3 = envShop(reflect(rd, normalize(n - vec3( dsp, 0.0, 0.0))));
            vec3 chrome = vec3(e1.r, e2.g, e3.b) * mix(metal_tint.rgb, vec3(1.0), 0.40);

            // The bank is the lip of the groove, the brightest metal on
            // the drop; the floor is where the wake climbs back out.
            //
            // These widths are deliberately not tied to the cut width.
            // Letting them widen with it puts over half the surface
            // inside a lit channel at the open archetypes, and the drop
            // blows out to white.
            float bank = smoothstep(0.150, 0.100, f);
            float deep = smoothstep(0.080, 0.0, f);
            float rim  = pow(1.0 - ndv, 4.0);

            // The chemistry eats the mirror where it runs, and its wake
            // climbs back out of the groove it cut.
            vec3 wake = wake_tint.rgb
                      * (0.55 + 0.45 * cos(TAU * (f * 1.6 + 0.18 * spectra
                                          + vec3(0.0, 0.14, 0.30))));

            col = chrome * (1.0 - 0.90 * deep)
                + metal_tint.rgb * bank * (0.70 + 1.15 * spectra)
                                 * (0.65 + 0.85 * AUDIO_SNARE)
                + wake * deep * (1.45 + 1.75 * spectra) * (0.65 + 0.75 * AUDIO_BEAT)
                + wake_tint.rgb * rim * (0.40 + 0.85 * spectra);
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.6, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.30 + pow(ca, 30.0) * 0.66) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * spectra) * (0.55 + 0.90 * AUDIO_BEAT);
    col += wake_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = col / (1.0 + col * 0.42);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
