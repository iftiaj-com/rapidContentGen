/*{
  "ADITS": 1,
  "DESCRIPTION": "A beeswax votive lit from inside, shaded by translucency that is measured rather than faked: from every visible point the shader marches toward the key light and counts how much wax the light actually had to cross, then transmits what survives, so a honeycomb core hidden under a sealed skin shows through only as the light finds the thin way past its walls. It rests as a fat amber bulb, draws into a tall dripping taper, then opens into a hexagonal comb lantern pouring light out of its cells.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-09-04",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "translucent"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.86, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.08, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.10, "MAX": 0.70,
      "LABEL": "Wax Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "melt",       "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.08, "MAX": 0.88,
      "LABEL": "Drip Melt", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "glow",       "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Scatter Reach", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "flare",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.08, "MAX": 0.92,
      "LABEL": "Flame Surge", "BIND": "kick", "BIND_DEPTH": 0.65 },
    { "NAME": "wax_tint",   "TYPE": "color", "DEFAULT": [0.98, 0.78, 0.42, 1.00],
      "LABEL": "Wax Colour" },
    { "NAME": "flame_tint", "TYPE": "color", "DEFAULT": [1.00, 0.62, 0.22, 1.00],
      "LABEL": "Flame Colour" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.60
#define BOUND  1.34

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

// Signed distance to a honeycomb cell edge, positive inside the cell. A
// hexagonal tiling is two offset rectangular grids, so the nearest cell
// centre is whichever of the two candidates is closer.
float hexIn(vec2 p) {
    const vec2 K = vec2(1.0, 1.7320508);
    vec2 a = mod(p, K) - K * 0.5;
    vec2 b = mod(p - K * 0.5, K) - K * 0.5;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    vec2 q = abs(g);
    return 0.5 - max(dot(q, vec2(0.8660254, 0.5)), q.y);
}

// ------------------------------------------------------------------
// The votive. A tapered wax body with drip runs down it, and hexagonal
// comb channels bored through the inside. The channels stop short of
// the skin in the first two archetypes, so nothing in the silhouette
// gives them away: they exist for the light to find, and the only way
// they become visible is through the wax.
// ------------------------------------------------------------------

float g_rx, g_ry, g_taper, g_cellF, g_wall, g_coreR, g_drip, g_dripF;

float drips(vec3 p) {
    // Stretched hard in y, which is what turns a ridged field into runs
    // of wax rather than an even bumpiness.
    vec3 q = vec3(p.x * g_dripF, p.y * g_dripF * 0.20, p.z * g_dripF);
    float f = 0.0;
    float a = 0.55;
    for (int i = 0; i < 2; i++) {
        f += a * (abs(sin(q.x) + cos(q.z) * 0.95) - 0.80);
        q = q * 2.17 + vec3(1.3, 0.5, -1.1);
        a *= 0.50;
    }
    return f;
}

float map(vec3 p) {
    float ty = clamp(p.y / g_ry * 0.5 + 0.5, 0.0, 1.0);
    float rx = g_rx * (1.0 - g_taper * ty * ty);
    vec3 q = vec3(p.x / rx, p.y / g_ry, p.z / rx);
    float body = (length(q) - 1.0) * min(rx, g_ry);
    body -= drips(p) * g_drip;

    // The comb, carved only inside the core radius.
    float hx = hexIn(p.xz * g_cellF) / g_cellF;
    float carve = hx - g_wall;
    float inCore = smoothstep(g_coreR, g_coreR - 0.10, length(p));
    return max(body, mix(-1.0, carve, inCore));
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0020;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// ------------------------------------------------------------------
// Translucent thickness. The whole point of this shader.
//
// Walk from the shaded point toward the light in fixed steps and count
// the ones that land inside the body. That count is the real path the
// light had to take through the wax, so a thin lip transmits and a
// thick waist does not, and the comb voids show up as the places the
// light got through cheaply. A wrap term or a fixed rim cannot do this:
// neither one knows what is behind the surface.
// ------------------------------------------------------------------

float lightPath(vec3 p, vec3 L) {
    float acc = 0.0;
    float t = 0.020;
    for (int j = 0; j < 16; j++) {
        acc += step(map(p + L * t), 0.0);
        t += 0.058;
    }
    return acc * 0.058;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.446, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    float phase = ph * TAU;

    // ---- spectral morph selector (guide 12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.36 * (AUDIO_HAT - AUDIO_KICK) + 0.16 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Fat bulb, dripping taper, comb lantern. The core radius is the one
    // that changes identity: past the body radius the comb reaches the
    // skin and the sealed votive becomes an open lattice.
    float grow = (0.93 + 0.18 * swell) * (0.980 + 0.026 * sin(phase));
    g_rx     = (w1 * 0.780 + w2 * 0.420 + w3 * 0.760) * grow;
    g_ry     = (w1 * 0.920 + w2 * 1.140 + w3 * 0.960) * grow;
    g_taper  = w1 * 0.22 + w2 * 0.52 + w3 * 0.16;
    g_coreR  = (w1 * 0.62 + w2 * 0.80 + w3 * 1.40) * grow;
    g_cellF  = w1 * 5.20 + w2 * 6.40 + w3 * 4.40;
    g_wall   = (w1 * 0.030 + w2 * 0.024 + w3 * 0.038);
    g_dripF  = w1 * 5.60 + w2 * 7.40 + w3 * 4.80;
    g_drip   = (w1 * 0.056 + w2 * 0.086 + w3 * 0.034) * (0.45 + 1.05 * melt);

    // Scattering coefficient, per channel. Wax passes red and eats blue,
    // which is why a candle glows amber from inside however pale the
    // surface looks in daylight.
    vec3 sigma = (1.0 - wax_tint.rgb) * (1.1 + 5.6 * (1.0 - glow)) + vec3(0.42);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

    float lean = 0.15 * sin(phase * 2.0);
    pR(ro.xz, phase); pR(ro.yz, lean);
    pR(rd.xz, phase); pR(rd.yz, lean);

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 50; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0011) { hit = true; break; }
            t += d * 0.52;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            float ndv = clamp(dot(n, -rd), 0.0, 1.0);

            // The key sits behind the object and the fill on the camera
            // side. That is how wax is really lit and it is not a taste
            // call: forward scattering can only be seen looking along the
            // light's own path, so a front key hides the one term this
            // shader exists to compute.
            vec3 KEY  = normalize(vec3(-0.40, 0.56, -0.73));
            vec3 FILL = normalize(vec3(0.44, 0.30, 0.85));
            float ndl = dot(n, KEY);

            // Wrapped diffuse. Light entering near the terminator
            // scatters round it before it leaves, so the shading has to
            // survive past ninety degrees or wax reads as painted stone.
            const float W = 0.55;
            float wrap = clamp((ndl + W) / (1.0 + W), 0.0, 1.0);
            float fill = clamp(dot(n, FILL) * 0.5 + 0.5, 0.0, 1.0);

            // The measured path, and what survives it.
            float pathL = lightPath(p + n * 0.014, KEY);
            vec3 trans = exp(-sigma * pathL * (7.0 - 5.2 * glow));

            // Forward scattering. Photons travel along -KEY, so what
            // leaves the far side reaches the eye when the view direction
            // lines up with the light's direction of travel.
            float fwd = pow(clamp(dot(rd, KEY) * 0.5 + 0.5, 0.0, 1.0), 3.0);

            // The flame inside. Its distance to the surface point is
            // analytic, so it costs nothing and it is what makes the
            // comb walls read as shadows cast from within.
            float dcore = max(length(p) - 0.16, 0.0);
            float pathC = lightPath(p + n * 0.014, -normalize(p + 1e-4));
            // The comb walls read as shadows cast from inside: the path
            // to the core is long where it crosses a wall and short
            // where it slips down a cell.
            vec3 core = flame_tint.rgb
                      * exp(-dcore * (0.75 + 1.9 * (1.0 - glow)))
                      * exp(-sigma * pathC * 1.65)
                      * (2.60 + 3.40 * flare) * (0.72 + 0.85 * AUDIO_KICK);

            // The surface itself. Beeswax is soft and slightly waxy, so
            // one broad low specular and a pale bloom, nothing sharper.
            vec3 hv = normalize(FILL - rd);
            float spec = pow(max(dot(n, hv), 0.0), 26.0) * 0.42;
            float bloom = pow(1.0 - ndv, 2.2);

            // The transmitted term is gated on the forward lobe alone.
            // Given a constant share as well it fires on the directly
            // lit side too, where the measured path is zero, and blows
            // that side to white with no form left in it.
            col = wax_tint.rgb * (fill * 0.40 + wrap * 0.26)
                + wax_tint.rgb * trans * fwd * (1.9 + 2.2 * glow)
                + core
                + vec3(1.0, 0.96, 0.90) * spec * (0.5 + 0.9 * AUDIO_SNARE)
                + mix(wax_tint.rgb, vec3(1.0), 0.55) * bloom * 0.34;

            alpha = clamp(0.62 + 0.30 * ndv + 0.22 * bloom, 0.0, 1.0);
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.2, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.24 + pow(ca, 26.0) * 0.62) * (1.0 - alpha);
    sheath *= smoothstep(0.446, 0.10, rr) * (0.40 + 0.75 * flare)
            * (0.55 + 0.90 * AUDIO_BEAT);
    col += flame_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = col / (1.0 + col * 0.42);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
