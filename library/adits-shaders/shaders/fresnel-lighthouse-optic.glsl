/*{
  "ADITS": 1,
  "DESCRIPTION": "A rotating lighthouse optic: a drum of stepped annular prisms whose tilt grows with distance from the belt, the way a real Fresnel ring does so every ring bends light to one focus. The lamp inside is seen only through the glass, by refracting into each prism, marching to its exit face and refracting out again at three separate indices, so the lamp image splits into real colour fringes. It rests as a squat first-order optic, rises into a catadioptric drum, then collapses into fat bullseye belts.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-09-04",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "refraction", "glass"],
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
      "LABEL": "Drum Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "prism",      "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.08, "MAX": 0.88,
      "LABEL": "Prism Tilt", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "fire",       "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Dispersion", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "lamp",       "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.08, "MAX": 0.92,
      "LABEL": "Lamp Surge", "BIND": "kick", "BIND_DEPTH": 0.65 },
    { "NAME": "glass_tint", "TYPE": "color", "DEFAULT": [0.72, 0.92, 0.96, 1.00],
      "LABEL": "Glass Colour" },
    { "NAME": "lamp_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.84, 0.52, 1.00],
      "LABEL": "Lamp Colour" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.60
#define BOUND  1.32
#define IOR    1.523

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
// The optic. Concentric annular prisms stacked up a drum, and the one
// detail that makes it a Fresnel ring rather than a stack of hoops:
// each ring's inner face tilts in proportion to its distance from the
// belt, so all of them bend light toward the same focus. A constant
// tilt would give a barrel of identical prisms and no optic at all.
// ------------------------------------------------------------------

float g_R, g_thick, g_pitch, g_bands, g_tilt, g_belt, g_bulge, g_hub;
float g_mat;   // 0 = glass, 1 = brass

float map(vec3 p) {
    float r = length(p.xz);

    float bi = clamp(floor(p.y / g_pitch + 0.5), -g_bands, g_bands);
    float yl = p.y - bi * g_pitch;
    float ab = abs(bi);

    // The belt: the middle rings are thicker and bulge outward, which is
    // the bullseye of a real optic and the part that throws the beam.
    float near = exp(-ab * ab * 0.75);
    float thick = g_thick * (1.0 + g_belt * near);
    float half_ = g_pitch * 0.46;
    float f = clamp(yl / half_, -1.0, 1.0);
    float Ro = g_R + g_bulge * near * (1.0 - f * f);

    float tilt = bi * g_tilt;
    float inv = 1.0 / sqrt(1.0 + tilt * tilt);
    float innerFace = (Ro - thick + tilt * yl - r) * inv;

    float ring = max(max(r - Ro, innerFace), abs(yl) - half_);

    // The lamp housing, and the brass rings that cap the drum.
    float span = g_bands * g_pitch + half_;
    float post = max(r - g_hub, abs(p.y) - span * 0.98);
    float capY = span + g_thick * 0.22;
    float capr = length(vec2(r - g_R * 0.98, abs(p.y) - capY)) - g_thick * 0.55;

    float d = ring;
    g_mat = 0.0;
    float brass = min(post, capr);
    if (brass < d) { d = brass; g_mat = 1.0; }
    return d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0012;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// How nearly a ray points at the lamp at the origin. Taken as the
// perpendicular distance from the lamp centre to the ray, so the lamp
// image has a soft edge instead of the stair-step a hit test gives.
float seesLamp(vec3 o, vec3 d, float R) {
    if (dot(d, d) < 1e-6) return 0.0;
    float b = dot(o, d);
    if (b > 0.0) return 0.0;                 // the lamp is behind the ray
    float perp = sqrt(max(dot(o, o) - b * b, 0.0));
    return smoothstep(R * 3.2, R * 0.30, perp);
}

// A night sea horizon: the only thing outside a lighthouse worth
// reflecting. Dark above, a low band of haze at the waterline, and a
// dim swell below it.
vec3 envSea(vec3 r) {
    vec3 c = mix(vec3(0.105, 0.130, 0.190), vec3(0.030, 0.038, 0.062),
                 smoothstep(-0.05, 0.75, r.y));
    c += vec3(0.150, 0.185, 0.260) * smoothstep(0.02, -0.70, r.y);
    c += mix(lamp_tint.rgb, vec3(0.60, 0.75, 1.00), 0.55)
       * exp(-r.y * r.y * 240.0) * 1.25;
    // The lantern room's own gallery lamps, close in and warm.
    c += lamp_tint.rgb
       * pow(max(dot(r, normalize(vec3(-0.55, 0.62, 0.56))), 0.0), 26.0) * 2.30;
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
    float tilt0 = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt0 - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.36 * (AUDIO_HAT - AUDIO_KICK) + 0.16 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // First-order optic, catadioptric drum, triple bullseye. The ring
    // count and the belt bulge slide together, and the drum keeps its
    // height, so a blend redistributes the prisms rather than swapping
    // one drum for another.
    float grow = (0.93 + 0.17 * swell) * (0.980 + 0.026 * sin(phase));
    g_bands = w1 * 3.0 + w2 * 6.0 + w3 * 1.0;
    float span = 0.90 * grow;
    g_pitch = span / (g_bands + 0.46);
    g_R     = (w1 * 0.600 + w2 * 0.520 + w3 * 0.640) * grow;
    g_thick = g_pitch * (w1 * 0.60 + w2 * 0.72 + w3 * 0.52);
    g_tilt  = (w1 * 0.34 + w2 * 0.56 + w3 * 0.18) * (0.5 + 1.3 * prism);
    g_belt  = w1 * 0.55 + w2 * 0.35 + w3 * 0.95;
    g_bulge = (w1 * 0.075 + w2 * 0.045 + w3 * 0.130) * grow;
    g_hub   = (w1 * 0.075 + w2 * 0.060 + w3 * 0.095) * grow;

    float lampR = (0.085 + 0.115 * lamp) * (1.0 + 0.45 * AUDIO_KICK);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

    // A real optic turns on its pedestal. One turn per loop, so the
    // bright panel sweeps past exactly once.
    float lean = 0.10 * sin(phase * 2.0);
    pR(ro.xz, phase); pR(ro.yz, lean);
    pR(rd.xz, phase); pR(rd.yz, lean);

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float nearest = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            nearest = min(nearest, d / max(t, 0.6));
            if (d < 0.0008) { hit = true; break; }
            t += d * 0.64;
            if (t > tb1) break;
        }

        float mat = g_mat;

        if (hit) {
            vec3 n = calcNormal(p);
            float ndv = clamp(dot(n, -rd), 0.0, 1.0);

            if (mat > 0.5) {
                // The brass. Dull, warm, and mostly there to give the
                // glass an edge to sit against.
                const vec3 F0 = vec3(0.72, 0.55, 0.28);
                vec3 f = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
                col = envSea(reflect(rd, n)) * f * 2.2
                    + F0 * 0.10
                    + lamp_tint.rgb * pow(1.0 - ndv, 3.0) * 0.55;
                alpha = 1.0;
            } else {
                const float F0 = 0.0430;
                float fres = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);

                // Three indices. Crown glass disperses by about 0.017
                // across the visible band, so the spread is scaled from
                // a real number rather than picked for looks.
                float dv = (0.017 + 0.075 * fire);
                vec3 r1 = refract(rd, n, 1.0 / (IOR - dv));
                vec3 r2 = refract(rd, n, 1.0 / IOR);
                vec3 r3 = refract(rd, n, 1.0 / (IOR + dv));

                // One interior march, shared. The three paths diverge by
                // well under a prism thickness, so the exit point is
                // common; what is not shared, and what carries the
                // dispersion, is the refraction at each face.
                float ti = 0.006;
                vec3 q = p + r2 * ti;
                for (int j = 0; j < 18; j++) {
                    q = p + r2 * ti;
                    float di = map(q);
                    if (di > -0.0005) break;
                    ti += max(-di * 0.90, 0.008);
                }
                vec3 ne = calcNormal(q);

                // Out through the far face, once per index, then ask
                // each exit ray whether it can see the lamp. This is the
                // whole shader: the lamp is never drawn directly, only
                // as whatever the glass bends into the eye.
                vec3 o1 = refract(r1, ne, IOR - dv);
                vec3 o2 = refract(r2, ne, IOR);
                vec3 o3 = refract(r3, ne, IOR + dv);
                vec3 beam = vec3(seesLamp(q, o1, lampR),
                                 seesLamp(q, o2, lampR),
                                 seesLamp(q, o3, lampR));

                // Past the critical angle refract() returns zero and the
                // face turns into a mirror, which is exactly what the
                // catadioptric prisms in a real optic are built to do.
                vec3 mirror = envSea(reflect(rd, n));
                float tir = 1.0 - step(1e-4, dot(abs(o2), vec3(1.0)));

                // Glass has a colour of its own only over a long path,
                // and a prism is not long, so it stays a faint tint.
                vec3 body = mix(vec3(1.0), glass_tint.rgb, 0.55);

                // The bright edge where two prism faces meet. On a
                // stepped lens that edge is the whole visual signature.
                float lip = pow(1.0 - ndv, 3.2);

                // The lamp lighting the glass it stands inside. Without
                // this the optic is a black drum with two bright spots
                // on it: a lit optic is full of its own lamp, and only
                // the beam directions are brighter than the rest.
                vec3 toLamp = -normalize(p + 1e-4);
                // abs, not max: the lamp lights the glass from inside, so
                // an outer face is transmitting that light toward the eye
                // just as an inner face is catching it. Gated on the
                // inward normal alone, every outward face reads black.
                float lin = abs(dot(n, toLamp));
                float fall = 1.0 / (dot(p, p) + 0.22);
                vec3 glassLit = lamp_tint.rgb * body * fall
                              * (0.58 + 1.25 * lamp) * (0.35 + 0.65 * lin);

                col = mirror * (fres * 1.35 + 0.20 + 0.70 * tir)
                    + glassLit
                    + lamp_tint.rgb * body * beam
                      * (5.4 + 7.6 * lamp) * (0.72 + 0.80 * AUDIO_BEAT)
                    + body * lip * (0.55 + 1.25 * fire)
                    + glass_tint.rgb * fres * 0.34;

                // Glass with a lamp behind it hides the footage where the
                // beam is and shows it where the prism is empty, so the
                // beam is what raises coverage.
                float b = clamp(dot(beam, vec3(0.3333)), 0.0, 1.0);
                alpha = clamp(0.30 + 0.55 * b + 0.55 * fres + 0.40 * lip
                            + 0.30 * clamp(dot(glassLit, vec3(0.3333)), 0.0, 1.0),
                              0.0, 1.0);
            }
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - nearest * 5.6, 0.0, 1.0);
    float sheath = (pow(ca, 8.0) * 0.20 + pow(ca, 30.0) * 0.54) * (1.0 - alpha);
    sheath *= smoothstep(0.446, 0.10, rr) * (0.35 + 0.70 * lamp)
            * (0.50 + 0.90 * AUDIO_BEAT);
    col += lamp_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.52, 0.0, 1.0);

    col = col / (1.0 + col * 0.46);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
