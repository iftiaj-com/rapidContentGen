/*{
  "ADITS": 1,
  "DESCRIPTION": "A cloud chamber of supersaturated vapour with particle tracks condensing through it. The vapour is a real volume integral: Beer-Lambert transmittance along the ray, a shadow ray from every sample back to the light, and Henyey-Greenstein scattering whose asymmetry decides whether it glows forward or lights only at its rim. The tracks are solved in closed form. It rests as a squat chamber crossed by one muon, stretches into a column of electron arcs, then flattens into a disc of alphas.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-09-04",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "volumetric"],
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
      "LABEL": "Vapour Density", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "roll",       "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.08, "MAX": 0.88,
      "LABEL": "Convection", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "ion",        "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Track Ionisation", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "burst",      "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.06, "MAX": 0.90,
      "LABEL": "Shower Burst", "BIND": "kick", "BIND_DEPTH": 0.65 },
    { "NAME": "vapor_tint", "TYPE": "color", "DEFAULT": [0.78, 0.87, 1.00, 1.00],
      "LABEL": "Vapour Colour" },
    { "NAME": "track_tint", "TYPE": "color", "DEFAULT": [0.46, 1.00, 0.84, 1.00],
      "LABEL": "Track Colour" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.60
#define BOUND  1.42

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
// The chamber. A soft-edged cylinder of vapour, all density and no
// surface, so the whole body is one integral and there is no glass to
// raymarch. The rim rings are Gaussian rather than hard-edged: a shell
// thinner than the march step is caught by some pixels and missed by
// their neighbours, and comes out as a dashed line.
// ------------------------------------------------------------------

float g_R, g_H, g_soft, g_dens, g_rw, g_roll, g_ph, g_rollF;

float chamber(vec3 p) {
    return smoothstep(g_R, g_R - g_soft, length(p.xz))
         * smoothstep(g_H, g_H - g_soft * 0.7, abs(p.y));
}

float vapor(vec3 p) {
    float shell = chamber(p);
    float r = length(p.xz);

    // Supersaturated vapour settles, so it is denser toward the floor.
    float grad = 0.42 + 0.58 * smoothstep(g_H, -g_H, p.y);

    // Convection rolls, domain-warped so the cell walls wander instead
    // of lying on an even lattice.
    vec3 q = p * g_rollF;
    q += 0.85 * vec3(sin(q.y * 1.7 + g_ph), sin(q.z * 1.3 - g_ph * 2.0),
                     sin(q.x * 1.9 + g_ph));
    float rl = 0.5 + 0.5 * sin(q.x + cos(q.y * 1.2) * 1.5 + sin(q.z));

    float rd2 = length(vec2(r - g_R, abs(p.y) - g_H));
    float ring = exp(-rd2 * rd2 / (g_rw * g_rw)) * 5.20;

    return (shell * grad * (0.34 + 0.66 * rl * g_roll) + ring) * g_dens;
}

// ------------------------------------------------------------------
// The tracks, solved rather than marched, and this is the whole reason
// the object reads.
//
// A condensation track is a hairline far thinner than any affordable
// volume step, so a marched one is caught by some pixels and missed by
// their neighbours and comes out as a row of dashes. The closest
// approach between the view ray and the track segment has a closed
// form, and a Gaussian core about that distance integrates to an exact
// line: perfectly smooth, no aliasing, and no marching at all.
// ------------------------------------------------------------------

float raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b, out vec3 cp) {
    vec3 u = b - a;
    vec3 w = ro - a;
    float uu = dot(u, u);
    float ru = dot(rd, u);
    float rw = dot(rd, w);
    float uw = dot(u, w);
    float den = ru * ru - uu;
    float t = abs(den) < 1e-6 ? 0.0 : clamp((rw * ru - uw) / den, 0.0, 1.0);
    float s = max(t * ru - rw, 0.0);
    cp = a + u * t;
    return length(ro + rd * s - cp);
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

    // Squat chamber, tall column, wide disc. One cylinder throughout, so
    // the vapour body deforms and the tracks inside it keep their place.
    float grow = (0.93 + 0.17 * swell) * (0.980 + 0.026 * sin(phase));
    g_R     = (w1 * 1.040 + w2 * 0.560 + w3 * 1.100) * grow;
    g_H     = (w1 * 0.500 + w2 * 1.030 + w3 * 0.300) * grow;
    g_soft  = (w1 * 0.180 + w2 * 0.150 + w3 * 0.130) * grow;
    g_rw    = (w1 * 0.052 + w2 * 0.046 + w3 * 0.058) * grow;
    // A real chamber is nearly invisible mist: what the camera sees
    // is the tracks. Dense enough vapour to read on its own washes
    // the whole object into one soft blob and buries them.
    g_dens  = (0.34 + 0.92 * swell) * (w1 * 1.00 + w2 * 0.86 + w3 * 1.15);
    g_rollF = w1 * 4.20 + w2 * 6.10 + w3 * 8.40;
    g_roll  = 0.25 + 0.85 * roll;

    // Which signature dominates. All three are always evaluated and only
    // their weights move, so a blend never pops one into existence.
    float wM = w1 * 1.50 + w2 * 0.42 + w3 * 0.28;
    float wE = w1 * 0.30 + w2 * 1.60 + w3 * 0.38;
    float wA = w1 * 0.26 + w2 * 0.34 + w3 * 1.25;
    float core = (0.020 + 0.018 * (1.0 - ion)) * grow;
    float ionise = (0.55 + 1.45 * ion) * (1.0 + 1.40 * AUDIO_KICK * burst);

    // The phase asymmetry is itself an archetype parameter: forward at
    // rest for a soft glowing chamber, hard back-scattering at the top
    // so the disc lights only along its rim.
    float gHG = w1 * 0.62 + w2 * 0.24 + w3 * (-0.42);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

    float lean = 0.14 * sin(phase * 2.0);
    pR(ro.xz, phase); pR(ro.yz, lean);
    pR(rd.xz, phase); pR(rd.yz, lean);

    vec3 L = normalize(vec3(-0.46, 0.58, 0.67));

    // For a directional light the scattering angle is the same at every
    // sample along a ray, so the phase function is evaluated once per
    // pixel and never inside the integral.
    float cth = dot(rd, L);
    float g2 = gHG * gHG;
    float phaseFn = (1.0 - g2)
                  / (12.56637061 * pow(max(1.0 + g2 - 2.0 * gHG * cth, 1e-4), 1.5));

    vec3  col = vec3(0.0);
    float T   = 1.0;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float ts = max(tb0, 0.02);
        float ds = (tb1 - ts) / 34.0;

        // The phase function is normalised over the sphere, so its
        // typical value is about 1/4pi. A source radiance of a few
        // leaves the whole integral at nothing; the scale belongs here,
        // in the radiance, exactly as it does in reality.
        vec3 lightCol = mix(vapor_tint.rgb, vec3(1.0), 0.35) * 62.0;

        for (int i = 0; i < 34; i++) {
            vec3 q = ro + rd * (ts + (float(i) + 0.5) * ds);
            float dv = vapor(q);
            if (dv > 0.0006) {
                // The shadow ray. Only the vapour is sampled here: the
                // tracks are far too thin to shade anything, and putting
                // them in this loop would cost five times their worth.
                float tau = 0.0;
                float dl = 0.10;
                for (int j = 0; j < 5; j++) {
                    tau += vapor(q + L * dl);
                    dl += 0.15;
                }
                float Tl = exp(-tau * 0.15 * (0.6 + 1.4 * swell));

                // Single scatter, plus multiple scattering approximated
                // as isotropic ambient. A real cloud is much brighter
                // than single scattering alone predicts, because most of
                // what reaches the eye has bounced more than once, and
                // without it the volume goes dark at every phase where
                // the lobe happens to point away.
                vec3 scat = lightCol * Tl * phaseFn * vapor_tint.rgb
                          + vapor_tint.rgb * (0.22 + 0.90 * Tl) * 0.80;

                col += T * scat * dv * ds;
                T *= exp(-dv * ds * 1.95);
                if (T < 0.006) break;
            }
        }
    }

    // ---- the tracks, in closed form ---------------------------------
    float glow = 0.0;
    vec3  cp;

    // Muon: one long steep chord crossing the whole chamber.
    vec3 mu = normalize(vec3(0.30, 1.00, 0.34));
    vec3 mc = vec3(-0.10, 0.0, 0.08);
    float dm = raySeg(ro, rd, mc - mu * g_H * 1.6, mc + mu * g_H * 1.6, cp);
    glow += wM * exp(-dm * dm / (core * core)) * chamber(cp);

    // Electron: an arc, the curve a charged track really makes in a
    // magnetic field, taken as eight chords of one circle.
    for (int i = 0; i < 8; i++) {
        float a0 = float(i) * (TAU / 16.0) + phase;
        float a1 = a0 + (TAU / 16.0);
        float ar = g_R * 0.52;
        vec3 pa = vec3(cos(a0) * ar + 0.18, sin(a0) * ar * 0.55 - 0.04, sin(a0) * ar);
        vec3 pb = vec3(cos(a1) * ar + 0.18, sin(a1) * ar * 0.55 - 0.04, sin(a1) * ar);
        float de = raySeg(ro, rd, pa, pb, cp);
        glow += wE * exp(-de * de / (core * core * 0.85)) * chamber(cp) * 0.60;
    }

    // Alphas: six short fat stubs that stop quickly, which is as far as
    // an alpha gets before it runs out of energy.
    for (int i = 0; i < 6; i++) {
        float a0 = float(i) * (TAU / 6.0) - phase;
        vec3 dir = normalize(vec3(cos(a0), 0.26 - 0.11 * float(i), sin(a0)));
        vec3 pa = vec3(0.0, 0.04, 0.0) + dir * g_R * 0.20;
        vec3 pb = pa + dir * g_R * 0.48;
        float da = raySeg(ro, rd, pa, pb, cp);
        glow += wA * exp(-da * da / (core * core * 2.8)) * chamber(cp) * 0.90;
    }

    // The tracks sit inside the vapour, so roughly half of it is in
    // front of any one of them. Attenuating by the halfway transmittance
    // keeps them behind the fog instead of painted over it.
    col += track_tint.rgb * glow * ionise * 3.10 * mix(1.0, T, 0.5);

    // Transmittance is the coverage. Nothing has to be invented: what
    // the volume did not let through is exactly how much of the footage
    // it hides, and the tracks add their own share on top.
    float alpha = clamp(1.0 - T + clamp(glow * ionise * 0.55, 0.0, 0.85), 0.0, 1.0);

    col = col / (1.0 + col * 0.42);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
