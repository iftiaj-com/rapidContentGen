/*{
  "ADITS": 1,
  "DESCRIPTION": "A carillon of lathe-turned discs shaded with an anisotropic microfacet lobe: roughness runs low along each turning groove and high across it, so the key smears into the radial streak a brushed disc really shows, and the metal colour is a per-channel reflectance, not a tint. It rests as a squat steel gong stack, stretches into a tall bronze bell tower, then flattens into a cymbal fan whose grain turns radial and closes the streak into a ring. Kicks ring a wave out from every hub.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-09-04",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "chrome", "metal"],
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
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.10, "MAX": 0.72,
      "LABEL": "Stack Reach", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "grind",      "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.08, "MAX": 0.88,
      "LABEL": "Groove Grind", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "sheen",      "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Anisotropy", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "strike",     "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.06, "MAX": 0.90,
      "LABEL": "Strike Ring", "BIND": "kick", "BIND_DEPTH": 0.65 },
    { "NAME": "metal_tint", "TYPE": "color", "DEFAULT": [0.72, 0.76, 0.82, 1.00],
      "LABEL": "Metal Reflectance" },
    { "NAME": "hall_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.72, 0.38, 1.00],
      "LABEL": "Hall Light" }
  ]
}*/

#define TAU    6.28318530718
#define PI     3.14159265359
#define PERIOD 16.0
#define ORBIT  4.60
#define BOUND  1.32

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
// The stack. Everything is a solid of revolution, so the whole body is
// one 2D distance evaluated in (radius, height): no angular work in the
// march at all, which is what pays for five discs per step.
// ------------------------------------------------------------------

float g_R0, g_shrink, g_pitch, g_y0, g_th, g_bow, g_edge, g_hub;

// A disc with a rolled edge. A real turned disc is never square-cut at
// the rim, and the roll is where the anisotropic streak wraps round, so
// it is worth the two extra terms.
float discD(float r, float y, float Rd, float th, float ed) {
    vec2 d = vec2(r - (Rd - ed), abs(y) - max(th - ed, 0.0));
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - ed;
}

float map(vec3 p) {
    float r = length(p.xz);
    float d = 1e9;
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float Rd = g_R0 * (1.0 - fi * g_shrink);
        float yc = g_y0 + fi * g_pitch;
        float th = g_th * (1.0 - fi * 0.11);
        // The bow. A struck disc is dished, high at the hub and drooping
        // at the rim, and that curve is what bends the streak.
        float yb = yc + g_bow * (Rd - r);
        d = min(d, discD(r, p.y - yb, Rd, th, min(g_edge, th * 0.9)));
        // The cup at the hub, the raised boss a lathe leaves behind.
        d = min(d, length(vec3(p.x, (p.y - yc) / 0.55, p.z)) - g_hub * (1.0 - fi * 0.13));
    }
    // The spindle the stack hangs on.
    float spindle = max(r - 0.052, abs(p.y - (g_y0 + 2.0 * g_pitch)) - (2.0 * g_pitch + 0.16));
    return min(d, spindle);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0018;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// ------------------------------------------------------------------
// Anisotropic GGX. The whole point of this shader.
//
// A round lobe gives every curved metal the same soft blob of a
// highlight. Splitting roughness into two axes does not: with the
// tangent laid along the turning groove and roughness low there and
// high across it, the lobe stretches across the grooves, which on a
// concentrically turned disc is a radial streak. That streak is the
// thing the eye reads as machined metal.
// ------------------------------------------------------------------

float ggxAniso(vec3 n, vec3 h, vec3 T, vec3 B, float ax, float ay) {
    float nh = dot(n, h);
    float th = dot(T, h) / ax;
    float bh = dot(B, h) / ay;
    float w  = th * th + bh * bh + nh * nh;
    return 1.0 / (PI * ax * ay * w * w);
}

// ------------------------------------------------------------------
// The hall. A truss of eight hard lamps above a warm stage floor.
// Metal has no colour of its own to show, only what it reflects, so
// discrete sources with hard edges are the whole material: a smooth
// gradient environment turns polished steel into grey plastic.
// ------------------------------------------------------------------

vec3 envHall(vec3 r) {
    vec3 c = mix(vec3(0.085, 0.075, 0.065), vec3(0.26, 0.30, 0.40),
                 smoothstep(-0.75, 0.90, r.y));
    c += hall_tint.rgb * 0.90 * smoothstep(0.06, -0.80, r.y);
    // The overhead panel. A stack of discs faces mostly upward, so this
    // is what almost all of the visible metal is actually reflecting:
    // leave the ceiling dark and the whole object reads as black resin
    // however bright the lamps around it are.
    c += vec3(0.96, 0.94, 0.90) * smoothstep(0.42, 0.96, r.y) * 2.30;
    // The lamp truss. Eight is an integer count, so the ring closes with
    // no seam wherever the azimuth wraps.
    float az = atan(r.z, r.x);
    float row = exp(-(r.y - 0.44) * (r.y - 0.44) * 190.0);
    float lamp = pow(max(cos(az * 8.0), 0.0), 240.0);
    c += vec3(1.00, 0.95, 0.86) * lamp * row * 26.0;
    // A tall soft fill on one side, and the bright seam of the stage lip.
    c += vec3(0.42, 0.56, 0.80) * pow(max(dot(r, normalize(vec3(-0.80, 0.16, 0.58))), 0.0), 6.0) * 0.85;
    c += vec3(0.90, 0.86, 0.80) * exp(-r.y * r.y * 320.0) * 0.55;
    return c;
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
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.15 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Gong stack, bell tower, cymbal fan. One disc primitive throughout,
    // so a blend deforms the stack instead of dissolving one into another.
    float grow = (0.93 + 0.18 * swell) * (0.980 + 0.026 * sin(phase));
    g_R0     = (w1 * 0.90 + w2 * 0.62 + w3 * 1.00) * grow;
    g_shrink = w1 * 0.115 + w2 * 0.205 + w3 * 0.075;
    g_pitch  = (w1 * 0.255 + w2 * 0.360 + w3 * 0.150) * grow;
    g_y0     = -(w1 * 0.50 + w2 * 0.71 + w3 * 0.29) * grow;
    g_th     = (w1 * 0.075 + w2 * 0.055 + w3 * 0.026) * grow;
    g_bow    = w1 * 0.10 + w2 * 0.05 + w3 * 0.30;
    g_edge   = w1 * 0.030 + w2 * 0.022 + w3 * 0.014;
    g_hub    = (w1 * 0.15 + w2 * 0.12 + w3 * 0.22) * grow;

    // Metal reflectance. A metal has no diffuse term and its colour lives
    // entirely in a per-channel F0, so the varieties are real numbers for
    // steel, bronze and a warm nickel bronze rather than three paints.
    vec3 F0 = w1 * metal_tint.rgb
            + w2 * vec3(0.96, 0.68, 0.34)
            + w3 * vec3(0.86, 0.82, 0.68);

    // Grain direction. 0 keeps the tangent on the turning circle, 1 lays
    // it radially, which flips the streak into a ring: two genuinely
    // different machining processes, not two colours.
    float grain = w1 * 0.05 + w2 * 0.15 + w3 * 0.92;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

    float lean = 0.17 * sin(phase * 2.0);
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
        for (int i = 0; i < 52; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0011) { hit = true; break; }
            t += d * 0.78;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            float r = max(length(p.xz), 1e-4);
            vec3 radv = vec3(p.x, 0.0, p.z) / r;
            vec3 tanv = vec3(-p.z, 0.0, p.x) / r;

            // Lathe relief. The angle is taken once, after the hit, never
            // inside the march, so the radial grain costs one atan for
            // the whole pixel.
            float az = atan(p.z, p.x);
            float gf = 90.0 + 240.0 * grind;
            // An integer spoke count, so the radial grain closes with no
            // seam where the azimuth wraps. It also has to fade out near
            // the hub: the angular frequency is fixed but the arc between
            // two spokes is not, so at small radius they collapse into
            // each other and alias.
            float rf = floor(120.0 + 190.0 * grind);
            float hubFade = smoothstep(0.04, 0.34, r);
            float cut = mix(sin(r * gf), sin(az * rf) * hubFade, grain);

            // The strike. A kick sends a standing wave out from the hub,
            // which is what a struck disc does; the pulse already decays,
            // so it is used straight as an amplitude (guide 11.5).
            float wave = sin(r * 30.0 - phase * 4.0) * AUDIO_KICK * strike;

            vec3 nb = normalize(n + radv * (cut * 0.055 * grind + wave * 0.22));

            // Tangent frame laid along the groove, then re-orthogonalised
            // against the relieved normal.
            vec3 gdir = normalize(mix(tanv, radv, grain));
            vec3 T = gdir - nb * dot(nb, gdir);
            float tl = length(T);
            T = tl > 1e-4 ? T / tl : tanv;
            vec3 B = cross(nb, T);

            // Roughness is low along the groove and high across it. That
            // asymmetry is the entire material.
            float ax = 0.022 + 0.075 * (1.0 - sheen);
            float ay = 0.16 + 0.40 * sheen;

            float ndv = clamp(dot(nb, -rd), 0.0, 1.0);
            vec3 fres = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);

            // Two hard keys, matching the brightest lamps in the hall, so
            // the streak has something definite to be a streak of.
            vec3 L1 = normalize(vec3(-0.34, 0.86, 0.38));
            vec3 L2 = normalize(vec3(0.72, 0.30, -0.62));
            vec3 V  = -rd;
            float s1 = ggxAniso(nb, normalize(L1 + V), T, B, ax, ay) * max(dot(nb, L1), 0.0);
            float s2 = ggxAniso(nb, normalize(L2 + V), T, B, ax, ay) * max(dot(nb, L2), 0.0);

            // The blurred environment, taken along the same anisotropy:
            // a streaked reflection needs a reflection vector pulled
            // toward the rough axis, not a mirror one.
            vec3 refl = reflect(rd, nb);
            refl = normalize(refl - B * dot(refl, B) * (0.55 * sheen));
            vec3 env = envHall(refl);

            col = env * fres * 1.25
                + F0 * (s1 * 0.030 + s2 * 0.020) * (0.75 + 0.85 * AUDIO_SNARE)
                + hall_tint.rgb * pow(1.0 - ndv, 4.0) * (0.22 + 0.55 * sheen);

            // The groove floors stay dark. A machined surface is legible
            // because the cut lines are darker than the land between them,
            // and that dark line is what survives being seen small.
            col *= 0.80 + 0.30 * smoothstep(-0.9, 0.9, cut);

            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.4, 0.0, 1.0);
    float sheath = (pow(ca, 7.0) * 0.22 + pow(ca, 30.0) * 0.58) * (1.0 - alpha);
    sheath *= smoothstep(0.446, 0.10, rr) * (0.35 + 0.70 * sheen)
            * (0.50 + 0.90 * AUDIO_BEAT);
    col += mix(hall_tint.rgb, vec3(1.0), 0.35) * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = col / (1.0 + col * 0.40);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
