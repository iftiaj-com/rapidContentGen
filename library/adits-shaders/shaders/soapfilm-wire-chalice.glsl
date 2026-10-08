/*{
  "ADITS": 1,
  "DESCRIPTION": "Soap films on a wire chalice, coloured by real interference: thickness is carried in nanometres, the optical path difference is taken through the refracted angle, and each channel beats against its own wavelength, so the colours run Newton's series and the drained top goes properly black instead of pale. The films are catenoids, the surface soap actually makes between two rings. It rests as a wide two-ring hourglass, narrows into a pinched goblet, then packs into a five-ring lantern.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-09-04",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "iridescent"],
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
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.10, "MAX": 0.74,
      "LABEL": "Frame Reach", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "drain",      "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.08, "MAX": 0.90,
      "LABEL": "Drain Marble", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "bandcount",  "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Fringe Order", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "thin",       "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.05, "MAX": 0.92,
      "LABEL": "Drain Snap", "BIND": "kick", "BIND_DEPTH": 0.60 },
    { "NAME": "wire_tint",  "TYPE": "color", "DEFAULT": [0.78, 0.82, 0.90, 1.00],
      "LABEL": "Wire Metal" },
    { "NAME": "sky_tint",   "TYPE": "color", "DEFAULT": [0.52, 0.72, 1.00, 1.00],
      "LABEL": "Sky Light" }
  ]
}*/

#define TAU    6.28318530718
#define PI     3.14159265359
#define PERIOD 16.0
#define ORBIT  4.60
#define BOUND  1.24
#define NFILM  1.34

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

// GLSL ES 1.00 has no hyperbolic functions, so the catenary comes from
// the exponential it is defined as.
float coshf(float x) { float e = exp(x); return 0.5 * (e + 1.0 / e); }

// ------------------------------------------------------------------
// The frame. Soap spanning two coaxial rings does not make a cone or a
// hyperboloid, it makes a catenoid: the one surface of revolution with
// zero mean curvature. Using the real surface is what makes the waist
// pinch the way a soap film pinches instead of merely tapering.
// ------------------------------------------------------------------

float g_pitch, g_waist, g_ft, g_wr, g_flare, g_bands, g_yLo, g_H, g_stem;
float g_mat;      // 0 = film, 1 = wire
float g_ringd;    // distance to the nearest ring, for the Plateau border

float map(vec3 p) {
    float r = length(p.xz);
    float band = (p.y - g_yLo) / g_pitch;

    // The goblet flare, applied to the whole solid of revolution so the
    // rings and the films widen together.
    float flare = 1.0 + g_flare * clamp((p.y - g_yLo) / g_H, 0.0, 1.0);

    // One catenoid per band, by domain repetition: the sheets meet at
    // their widest point, which is exactly where the rings sit.
    float yl = (fract(clamp(band, 0.0, g_bands)) - 0.5) * g_pitch;
    float rt = g_waist * coshf(yl / g_waist) * flare;
    float cap = abs(p.y - (g_yLo + 0.5 * g_H)) - 0.5 * g_H;
    float film = max(abs(r - rt) - g_ft, cap);

    // The nearest ring of the armature.
    float rj = clamp(floor(band + 0.5), 0.0, g_bands);
    float ringY = g_yLo + rj * g_pitch;
    float fl2 = 1.0 + g_flare * clamp((ringY - g_yLo) / g_H, 0.0, 1.0);
    float Rr = g_waist * coshf(0.5 * g_pitch / g_waist) * fl2;
    float rdist = length(vec2(r - Rr, p.y - ringY));
    g_ringd = rdist;
    float ring = rdist - g_wr;

    // The stem, and the foot it stands on.
    float stem = max(r - g_stem, cap);
    float foot = length(vec2(r - g_stem * 3.4, p.y - g_yLo)) - g_wr * 1.5;

    float d = film;
    g_mat = 0.0;
    float wire = min(min(ring, stem), foot);
    if (wire < d) { d = wire; g_mat = 1.0; }
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

// ------------------------------------------------------------------
// Film thickness, in nanometres, which is the quantity the physics
// wants. Gravity drains a real film, so it is thinnest at the top and
// the colour order runs upward through Newton's series into the black
// film just before it bursts.
// ------------------------------------------------------------------

float g_ph, g_dTop, g_dBot, g_marble;

float thickness(vec3 p) {
    float h = clamp((p.y - g_yLo) / g_H, 0.0, 1.0);
    float base = mix(g_dBot, g_dTop, h * h);

    vec3 q = p * 5.4;
    q += 0.85 * vec3(sin(q.y * 1.9 + g_ph * 2.0),
                     sin(q.z * 1.5 - g_ph),
                     sin(q.x * 2.2 + g_ph * 3.0));
    float m = 0.0;
    float a = 0.55;
    for (int i = 0; i < 3; i++) {
        m += a * sin(q.x + cos(q.z * 1.3) * 1.6);
        q = q * 2.07 + vec3(1.1, 0.4, -0.8);
        a *= 0.55;
    }
    return max(base * (1.0 + g_marble * m), 4.0);
}

// ------------------------------------------------------------------
// Thin-film interference. The whole point of this shader.
//
// Two reflections leave the film a half-wavelength apart per unit of
// optical path, and the path is 2 n d cos(theta_t). Because the phase
// goes as 1/lambda, the three channels beat at three different rates,
// which is what produces the real Newton colour order rather than the
// hue sweep a palette lookup gives. The pi is the hard-interface flip
// at the front face, and it is why d = 0 reflects nothing at all.
// ------------------------------------------------------------------

vec3 thinFilm(float dnm, float cosT) {
    const vec3 LAM = vec3(680.0, 550.0, 440.0);
    float opd = 2.0 * NFILM * dnm * cosT;
    vec3 phi = TAU * opd / LAM + PI;
    return 0.5 + 0.5 * cos(phi);
}

// A bright open sky with one hard sun and a dark ground: the light a
// soap film is legible in, and the reason a bubble photographs against
// the sky rather than against a wall.
vec3 envSky(vec3 r) {
    vec3 c = mix(vec3(0.16, 0.17, 0.20), sky_tint.rgb * 1.15,
                 smoothstep(-0.60, 0.85, r.y));
    c += vec3(0.52, 0.40, 0.28) * smoothstep(0.05, -0.85, r.y);
    vec3 sun = normalize(vec3(-0.42, 0.78, 0.46));
    float sd = max(dot(r, sun), 0.0);
    c += vec3(1.00, 0.96, 0.88) * pow(sd, 240.0) * 26.0;
    c += vec3(1.00, 0.93, 0.82) * pow(sd, 8.0) * 0.45;
    c += sky_tint.rgb * exp(-r.y * r.y * 200.0) * 0.30;
    return c;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.446, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    float phase = ph * TAU;
    g_ph = phase;

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

    // Hourglass, goblet, lantern. The band count and the waist slide
    // together while the tower keeps its height, so a blend redistributes
    // the pinches instead of dissolving one frame into another.
    float grow = (0.93 + 0.17 * swell) * (0.980 + 0.026 * sin(phase));
    g_bands = w1 * 2.0 + w2 * 3.0 + w3 * 5.0;
    g_H     = 1.66 * grow;
    g_pitch = g_H / g_bands;
    g_yLo   = -0.5 * g_H;
    g_waist = (w1 * 0.470 + w2 * 0.215 + w3 * 0.270) * grow;
    g_flare = w1 * 0.18 + w2 * 0.60 + w3 * 1.30;
    g_ft    = 0.0030 + 0.0016 * (1.0 - bandcount);
    g_wr    = (w1 * 0.021 + w2 * 0.016 + w3 * 0.012) * grow;
    g_stem  = g_wr * 1.35;

    // Thickness range, in nanometres. A real draining film runs from
    // roughly a micron at the bottom to under a hundred nanometres at the
    // top; the kick shoves the top toward zero, which is the black film.
    g_dBot   = 380.0 + 1500.0 * bandcount;
    g_dTop   = mix(210.0, 22.0, thin) * (1.0 - 0.55 * AUDIO_KICK);
    g_marble = 0.10 + 0.62 * drain;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

    float lean = 0.16 * sin(phase * 2.0);
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
        for (int i = 0; i < 60; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0008) { hit = true; break; }
            t += d * 0.66;
            if (t > tb1) break;
        }

        // The march's last evaluation was at the hit, so the material and
        // the ring distance are already the right ones. Read them before
        // the normal, whose four taps overwrite both.
        float mat  = g_mat;
        float rdst = g_ringd;

        if (hit) {
            vec3 n = calcNormal(p);
            float ndv = clamp(dot(n, -rd), 0.0, 1.0);

            if (mat > 0.5) {
                // The armature. Thin polished wire, so it is almost all
                // environment plus a hard sun glint along its length.
                vec3 f = wire_tint.rgb + (1.0 - wire_tint.rgb) * pow(1.0 - ndv, 5.0);
                col = envSky(reflect(rd, n)) * f * 1.45;
                alpha = 1.0;
            } else {
                // The refracted angle inside the film, from Snell. This
                // is what tilts the fringes as the surface curves away,
                // and skipping it leaves flat unconvincing bands.
                float sin2i = 1.0 - ndv * ndv;
                float cosT = sqrt(max(1.0 - sin2i / (NFILM * NFILM), 0.0));

                float dnm = thickness(p);
                vec3  iri = thinFilm(dnm, cosT);

                // A film reflects little head-on and a great deal at
                // grazing incidence, so the fringes crowd and brighten
                // toward the silhouette exactly as they do on a bubble.
                // The floor is raised well above the true 5 per cent: the
                // physics that has to stay honest is the wavelength
                // beating, the angle and the black film, and at the real
                // amplitude none of it is visible over footage at all.
                float graze = pow(1.0 - ndv, 3.0);
                float refl = 0.30 + 0.70 * graze;

                // The Plateau border: where a film meets the wire it
                // thickens into a bright fillet. Cheap, and it is the
                // detail that says soap rather than cellophane.
                float plat = smoothstep(g_wr * 4.2, g_wr * 1.3, rdst);

                vec3 lit = envSky(reflect(rd, n));
                col = iri * lit * refl * (3.4 + 3.6 * bandcount)
                    + iri * sky_tint.rgb * plat * (0.55 + 0.85 * AUDIO_SNARE)
                    + vec3(1.0) * plat * graze * 0.35;

                // Alpha is the reflectance, so the black film really is
                // a hole and the footage shows straight through it. That
                // is the whole reason to carry thickness in nanometres.
                float amp = clamp(dot(iri, vec3(0.3333)), 0.0, 1.0);
                alpha = clamp(amp * (0.34 + 0.66 * graze) * 1.55
                            + plat * 0.55, 0.0, 1.0);
            }
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.6, 0.0, 1.0);
    float sheath = (pow(ca, 8.0) * 0.20 + pow(ca, 30.0) * 0.52) * (1.0 - alpha);
    sheath *= smoothstep(0.446, 0.10, rr) * (0.35 + 0.70 * bandcount)
            * (0.50 + 0.90 * AUDIO_BEAT);
    col += mix(sky_tint.rgb, vec3(1.0), 0.40) * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    col = col / (1.0 + col * 0.36);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
