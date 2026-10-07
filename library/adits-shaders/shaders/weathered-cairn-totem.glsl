/*{
  "ADITS": 1,
  "DESCRIPTION": "A balanced cairn of eroded river stones, carried by the two things that actually sell physical presence: five-tap distance-field occlusion darkening every contact where two stones meet, and a real penumbra-traced soft shadow so each stone lays a soft edge on the one below. A rising waterline splits wet stone from dry. It rests as a squat cobble cairn of pale granite, stacks into a tall precarious spire of wet slate plates, then shatters into an angular obsidian shard pile.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-09-04",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "obsidian", "stone"],
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
      "LABEL": "Stone Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "erode",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.08, "MAX": 0.86,
      "LABEL": "Erosion", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "grit",       "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Mica Grit", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "wet",        "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.04, "MAX": 0.78,
      "LABEL": "Waterline", "BIND": "kick", "BIND_DEPTH": 0.60 },
    { "NAME": "stone_tint", "TYPE": "color", "DEFAULT": [0.74, 0.70, 0.63, 1.00],
      "LABEL": "Stone Colour" },
    { "NAME": "sun_tint",   "TYPE": "color", "DEFAULT": [1.00, 0.86, 0.62, 1.00],
      "LABEL": "Sun Colour" }
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

// ------------------------------------------------------------------
// The cairn. Five stones on a slow helix, so the stack reads as
// precarious from every side without breaking the vertical silhouette.
//
// The erosion field is subtracted once, outside the stone loop, rather
// than per stone: it is the expensive term and the stones share the
// weather, so evaluating it five times would buy nothing.
// ------------------------------------------------------------------

float g_pitch, g_rx, g_ry, g_amp, g_ef, g_jit, g_squash, g_warp;

float erosion(vec3 p) {
    vec3 q = p * g_ef;
    // Warp the domain before folding it. A bare sine lattice erodes into
    // an even grid of dimples, which reads as a golf ball; the warp is
    // what makes the pits wander and clump the way weathering does.
    q += g_warp * vec3(sin(q.y * 1.7), sin(q.z * 1.3), sin(q.x * 2.1));
    float f = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
        f += a * (abs(sin(q.x) + cos(q.y) * 0.9 + sin(q.z) * 0.8) - 0.86);
        q = q * 2.13 + vec3(1.7, -0.6, 1.1);
        a *= 0.52;
    }
    return f;
}

float map(vec3 p) {
    float d = 1e9;
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        // The helix. A fixed turn per stone, so the offset is ordered
        // rather than random and the pile still balances.
        float a = fi * (TAU / 5.0) * 2.0;
        vec3 c = vec3(cos(a) * g_jit, (fi - 2.0) * g_pitch, sin(a) * g_jit);
        // Stones alternate their long axis, which is what a stacked pile
        // of water-worn cobbles actually does.
        float sw = mix(1.0, g_squash, mod(fi, 2.0));
        vec3 rad = vec3(g_rx * sw, g_ry, g_rx / sw);
        vec3 q = (p - c) / rad;
        d = min(d, (length(q) - 1.0) * min(rad.x, min(rad.y, rad.z)));
    }
    return d - erosion(p) * g_amp;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0022;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// ------------------------------------------------------------------
// Ambient occlusion, five taps stepped out along the normal. The gap
// between how far the field says it is free and how far the tap went is
// how enclosed the point is.
//
// This is the term that puts a dark seam where two stones touch, and
// without it a stack of blobs reads as a stack of blobs however good
// the surface is.
// ------------------------------------------------------------------

float calcAO(vec3 p, vec3 n) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 5; i++) {
        float h = 0.014 + 0.150 * float(i) / 4.0;
        float d = map(p + n * h);
        occ += (h - d) * sca;
        sca *= 0.72;
    }
    return clamp(1.0 - 2.6 * occ, 0.0, 1.0);
}

// ------------------------------------------------------------------
// Soft shadow by sphere tracing toward the light. The ratio of the
// clearance to the distance travelled is the angle the occluder
// subtends, so k * h / t is a penumbra estimate and not a guess: the
// shadow one stone throws on the next softens with the gap between
// them, exactly as a real one does.
// ------------------------------------------------------------------

float softShadow(vec3 ro, vec3 rd, float k) {
    float res = 1.0;
    // Start well clear of the surface. Nearer than this and a ray leaving
    // at a grazing angle grazes its own stone, which shows up as the
    // ragged terminator acne that eats the whole sunlit side.
    float t = 0.055;
    for (int i = 0; i < 22; i++) {
        float h = map(ro + rd * t);
        res = min(res, k * h / t);
        t += clamp(h, 0.016, 0.11);
        if (res < 0.005 || t > 2.60) break;
    }
    return clamp(res, 0.0, 1.0);
}

// Granite speckle. Real stone is a mosaic of grains, and the few bright
// mica flakes in it are the only specular a dry rock has.
float speckle(vec3 p) {
    vec3 q = p * 46.0;
    return sin(q.x) * sin(q.y * 1.13) * sin(q.z * 0.91);
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

    // Wide cobble cairn, narrow precarious spire, angular shard pile.
    // The stone count never changes; the aspect does. The pitch stays
    // under twice the vertical radius in every archetype, because the
    // moment the stones stop touching the occlusion and contact-shadow
    // story goes with them and the object reads as floating discs.
    float grow = (0.93 + 0.18 * swell) * (0.980 + 0.026 * sin(phase));
    g_rx     = (w1 * 0.460 + w2 * 0.245 + w3 * 0.435) * grow;
    g_ry     = (w1 * 0.300 + w2 * 0.245 + w3 * 0.265) * grow;
    g_pitch  = g_ry * (w1 * 0.94 + w2 * 1.48 + w3 * 1.22);
    g_jit    = (w1 * 0.055 + w2 * 0.085 + w3 * 0.130) * grow;
    g_squash = w1 * 1.10 + w2 * 1.22 + w3 * 1.50;
    g_ef     = w1 * 4.20 + w2 * 6.40 + w3 * 10.50;
    // A water-worn cobble is smooth and a fresh fracture is not,
    // so the domain warp is itself an archetype parameter.
    g_warp   = w1 * 0.34 + w2 * 0.72 + w3 * 1.20;
    g_amp    = (w1 * 0.019 + w2 * 0.026 + w3 * 0.052) * (0.55 + 0.85 * erode);

    // Granite, wet slate, obsidian. Albedo falls and gloss rises across
    // the range, which is the real difference between a dry cobble and a
    // fresh volcanic-glass fracture. The dark end is carried by the
    // reflection, not by the albedo, or it would vanish over footage.
    vec3 albedo = w1 * stone_tint.rgb
                + w2 * vec3(0.36, 0.41, 0.48)
                + w3 * vec3(0.105, 0.098, 0.126);
    float gloss = w1 * 0.12 + w2 * 0.52 + w3 * 0.96;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

    float lean = 0.14 * sin(phase * 2.0);
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
        for (int i = 0; i < 54; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0013) { hit = true; break; }
            // The erosion displacement makes the field only approximately
            // Lipschitz, so the step is held well under one.
            t += d * 0.55;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            float ndv = clamp(dot(n, -rd), 0.0, 1.0);

            vec3 L = normalize(vec3(-0.44, 0.70, 0.54));
            float ndl = max(dot(n, L), 0.0);
            float sh  = softShadow(p + n * 0.022, L, 14.0);
            float ao  = calcAO(p, n);

            // The waterline. Below it the stone is soaked: darker, and
            // much glossier, because a water skin fills the pores and
            // replaces a rough surface with a smooth one.
            float top = g_pitch * 2.0 + g_ry;
            float line = mix(-top * 1.05, top * 1.05, wet);
            float soak = smoothstep(line + 0.055, line - 0.055, p.y);

            // Two scales of grain: a centimetre mottle and the grain
            // speckle itself. Real stone is a mosaic at both, and one
            // scale alone reads as a paint job.
            float sp = speckle(p);
            float mot = sin(p.x * 5.7 + 1.3) * sin(p.y * 6.9) * sin(p.z * 6.1 - 0.7);
            vec3 base = albedo * (0.70 + 0.62 * smoothstep(-0.5, 0.85, sp) * grit
                                       + 0.26 * mot);
            base *= mix(1.0, 0.60, soak);
            float rough = mix(gloss, 0.98, soak);

            // A hemisphere ambient, which is what an outdoor rock really
            // sees: cool sky above, warm bounce off the ground below.
            // Occlusion multiplies the ambient only, never the sun: a
            // shadow and a crevice are different facts about the light.
            vec3 amb = mix(vec3(0.20, 0.14, 0.10),
                           vec3(0.30, 0.40, 0.58), 0.5 + 0.5 * n.y);

            vec3 hv = normalize(L - rd);
            float a2 = mix(0.42, 0.055, rough);
            float den = max(dot(n, hv), 0.0) * max(dot(n, hv), 0.0) * (a2 * a2 - 1.0) + 1.0;
            float ggx = (a2 * a2) / (3.14159265 * den * den);

            // The mica flash. A product of three sines rarely gets near
            // one, so the gate sits where the field actually reaches or
            // no grain ever fires.
            float mica = smoothstep(0.42, 0.72, sp) * grit;

            // A cold backlight, so the silhouette never disappears into
            // dark footage the way a lit-from-front rock would.
            float rim = pow(1.0 - ndv, 2.6);

            // The gloss layer. A wet or glassy stone shows the sky, and
            // that broad reflection is what keeps a near-black obsidian
            // legible where a point highlight alone would not.
            vec3 refv = reflect(rd, n);
            vec3 envr = mix(vec3(0.24, 0.17, 0.12), vec3(0.36, 0.48, 0.70),
                            0.5 + 0.5 * refv.y);
            envr += sun_tint.rgb * pow(max(dot(refv, L), 0.0), 36.0) * 2.60;
            float F = 0.045 + 0.955 * pow(1.0 - ndv, 5.0);

            col = base * (sun_tint.rgb * ndl * sh * 2.85 + amb * ao * 1.55)
                + envr * rough * (0.20 + 0.80 * F) * ao * 1.55
                + sun_tint.rgb * ggx * ndl * sh * (0.030 + 0.130 * rough)
                + sun_tint.rgb * mica * ndl * sh * 0.85 * (0.6 + 0.9 * AUDIO_SNARE)
                + mix(vec3(0.42, 0.62, 1.00), sun_tint.rgb, 0.35)
                  * rim * ao * (0.85 + 1.20 * grit) * (0.6 + 0.7 * AUDIO_BEAT);

            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.4, 0.0, 1.0);
    float sheath = (pow(ca, 8.0) * 0.16 + pow(ca, 30.0) * 0.44) * (1.0 - alpha);
    sheath *= smoothstep(0.446, 0.10, rr) * (0.30 + 0.60 * grit)
            * (0.45 + 0.85 * AUDIO_BEAT);
    col += mix(sun_tint.rgb, vec3(0.50, 0.70, 1.00), 0.40) * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    col = col / (1.0 + col * 0.34);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
