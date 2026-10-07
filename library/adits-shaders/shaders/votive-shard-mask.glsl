/*{
  "ADITS": 1,
  "DESCRIPTION": "A hollow volcanic-glass mask lit from behind its own eye and mouth voids, its face broken by an octahedral fold that rotates itself each pass so the cracks run at every angle; it rests as a smooth plate and grows a pair of horns and then splits into a floating cage of shards as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
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
      "LABEL": "Mask Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "fracture",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Fracture", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "inner",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Inner Light", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "glass_tint", "TYPE": "color", "DEFAULT": [0.11, 0.10, 0.14, 1.00],
      "LABEL": "Glass Tint" },
    { "NAME": "lit_tint",   "TYPE": "color", "DEFAULT": [1.00, 0.42, 0.10, 1.00],
      "LABEL": "Inner Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.30
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

// ------------------------------------------------------------------
// The fracture field.
//
// Five passes of a mirror fold with a rotation between each, closed by
// an L1 norm rather than a euclidean one. The L1 norm is what gives
// the breaks flat facets and straight edges instead of rounded pits,
// and the rotation is what stops them all running the same way.
// ------------------------------------------------------------------

float g_ph, g_fa, g_foff, g_cw, g_cfreq;

float shatter(vec3 p) {
    for (int i = 0; i < 5; i++) {
        pR(p.xz, g_fa);
        pR(p.xy, g_fa * 1.9);
        p.xz = abs(p.xz) - g_foff;
    }
    return (abs(p.x) + abs(p.y) + abs(p.z)) * 0.20;
}

// ------------------------------------------------------------------
// The mask. A hollowed ovoid cut back to a face plate, with the voids
// subtracted and a pair of horns whose length carries the silhouette
// from plate to horned to shattered (guide 12.5).
// ------------------------------------------------------------------

float g_R, g_wall, g_horn, g_hornR, g_scale;
float g_mat;    // 0 glass, 1 void rim

float mask(vec3 p) {
    p /= g_scale;
    p.x = abs(p.x);                       // bilateral symmetry

    // Face plate: a hollow ovoid, narrowed low down into a chin, then
    // cut back so only the front of it remains.
    float taper = 1.0 + 0.60 * smoothstep(0.10, -0.60, p.y);
    float shell = length(vec3(p.x * taper, p.y * 0.80, p.z * 1.30)) - g_R;
    shell = abs(shell) - g_wall;
    shell = max(shell, -p.z - 0.10);

    // Brow ridge, running across the top of the sockets.
    vec3 bp = p - vec3(0.0, 0.20, 0.34);
    float brow = length(vec2(length(bp.xy * vec2(0.62, 1.0)) - 0.26, bp.z)) - 0.055;
    shell = min(shell, brow);

    // Eye sockets and a mouth slot, taken straight out of the plate.
    // The z scale is small so each void runs right through the plate;
    // a void that stops short of the front face never opens at all.
    vec3 ep = p - vec3(0.245, 0.080, 0.30);
    float eye = length(ep * vec3(1.00, 1.70, 0.30)) - 0.165;
    vec3 mp = p - vec3(0.0, -0.38, 0.30);
    float mouth = length(mp * vec3(0.44, 2.40, 0.30)) - 0.165;
    shell = max(shell, -eye);
    shell = max(shell, -mouth);

    // Horns, swept up and back from the temples.
    vec3 hp = p - vec3(0.34, 0.30, 0.00);
    pR(hp.yz, -0.55);
    float hy = clamp(hp.y / max(g_horn, 0.01), 0.0, 1.0);
    float horn = length(vec2(length(hp.xz) - 0.0, hp.y - clamp(hp.y, 0.0, g_horn)))
               - g_hornR * (1.0 - 0.85 * hy);
    float d = min(shell, horn);

    // Break it apart along a family of contours through the fold field.
    // A band width of zero cuts nothing at all, whatever range the
    // field happens to occupy, which is what makes the level safe to
    // slide with the selector.
    float crack = abs(fract(shatter(p) * g_cfreq) - 0.5) - g_cw;
    d = max(d, -crack);
    return d * g_scale * 0.85;
}

float map(vec3 p) {
    float d = mask(p);
    g_mat = 0.0;
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

// The fire behind the mask: emitters at the sockets and the mouth, so
// the voids read as lit from within rather than as holes.
float innerFire(vec3 p) {
    p /= g_scale;
    p.x = abs(p.x);
    vec3 e = p - vec3(0.245, 0.080, 0.06);
    float a = exp(-dot(e, e) * 22.0);
    vec3 m = p - vec3(0.0, -0.38, 0.06);
    float b = exp(-dot(m, m) * 17.0);
    return a + b * 0.85;
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

    g_horn  = w1 * 0.030 + w2 * 0.560 + w3 * 0.820;
    g_hornR = w1 * 0.030 + w2 * 0.130 + w3 * 0.105;
    g_wall  = w1 * 0.075 + w2 * 0.055 + w3 * 0.036;
    g_cw    = w1 * 0.000 + w2 * 0.075 + w3 * 0.170;
    g_foff  = w1 * 0.500 + w2 * 0.560 + w3 * 0.640;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_scale = (0.96 + 0.16 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_R     = 0.62;
    g_cw    *= 0.70 + 0.70 * fracture + 0.25 * AUDIO_KICK;
    g_cfreq  = 2.4;
    g_fa     = g_ph + fracture * 1.5 * sin(ph * TAU * 2.0);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // The mask turns to face the room and back, but never far enough to
    // hide the face: the whole point is that it is looking at you.
    float turn = 0.85 * sin(ph * TAU);
    float nod  = 0.16 * sin(ph * TAU * 2.0);
    pR(ro.xz, turn); pR(ro.yz, nod);
    pR(rd.xz, turn); pR(rd.yz, nod);

    vec3 lightD = normalize(vec3(0.42, 0.72, 0.56));

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;
    float fire  = 0.0;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            // Gather the fire along the way, so it shows through the
            // voids and stops at whatever the ray hits first.
            fire += innerFire(p) * min(d * 0.70, 0.05);
            if (d < 0.0010) { hit = true; break; }
            t += d * 0.70;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            float bac  = clamp(dot(n, -lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.2);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 60.0);

            // Volcanic glass: near black, with the inner fire bleeding
            // through the thin places and a hard wet highlight.
            float bleed = innerFire(p);

            col = glass_tint.rgb * (0.10 + 0.80 * dif + 0.26 * bac)
                + lit_tint.rgb * bleed * (1.15 + 2.60 * inner)
                + lit_tint.rgb * fre * (0.55 + 1.05 * inner)
                + vec3(1.0, 0.97, 0.94) * spec * (1.70 + 1.40 * AUDIO_SNARE);
            alpha = 1.0;
        }
    }

    // The fire gathered before the first hit is what lights the voids.
    col += lit_tint.rgb * fire * (18.0 + 30.0 * inner) * (0.70 + 1.10 * AUDIO_BEAT);
    alpha = clamp(alpha + fire * 9.0, 0.0, 1.0);

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.2, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.30 + pow(ca, 30.0) * 0.66) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * inner) * (0.55 + 0.90 * AUDIO_BEAT);
    col += lit_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
