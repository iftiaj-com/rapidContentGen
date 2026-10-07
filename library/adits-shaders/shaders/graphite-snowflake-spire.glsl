/*{
  "ADITS": 1,
  "DESCRIPTION": "A graphite snowflake whose woven dome never changes, wearing ten spires that each change species on their own schedule. Each spire is one primitive under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: blunt buttress, tapered spire, barbed halberd, bare needle. Bass buttresses the crown, treble draws it out to needles, and the change sweeps spire by spire. Rests as the tapered spire.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "lattice", "obsidian", "snowflake", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "dome",  "TYPE": "float", "DEFAULT": 0.295, "MIN": 0.230, "MAX": 0.345,
      "LABEL": "Dome Radius", "BIND": "bass", "BIND_DEPTH": 0.38 },
    { "NAME": "spire", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spire Reach", "BIND": "treble", "BIND_DEPTH": 0.50 },
    { "NAME": "sheen", "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Strut Sheen", "BIND": "level", "BIND_DEPTH": 0.40 }
  ]
}*/

#define TAU 6.28318530718

// Strut half-width in uv units. Everything in the lattice is this gauge or finer.
#define GAUGE 0.0026

// Lattice ring count. It used to be a slider; the dome is now the part of the
// flake that never changes species, so it sits at the old default.
#define RINGS 9.0

// How far the per-spire selector is spread around the crown. The change then
// crosses it spire by spire instead of flipping all ten at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the whole
    // flake turns and breathes seamlessly on a 24 s cycle. Nothing on the morph
    // path reads it: which spire is which belongs to the music, not the clock.
    float ph = fract(TIME / 24.0);

    float r = length(uv);
    float a = atan(uv.y, uv.x);          // one atan for the frame, none in a loop

    float turn   = ph * TAU;                            // one slow turn per loop
    float breath = 1.0 + 0.045 * sin(ph * TAU * 2.0);   // two breaths per loop
    float creep  = ph * 2.0;

    // --- Selector -------------------------------------------------------------
    // Balance decides which spire; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws a spire out to a needle, a kick buttresses it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // One transient control drives the light as well as the geometry: the hat
    // that sharpens a spire also fires its glints.
    float hatF = 1.0 + 1.5 * snap * AUDIO_HAT;

    // The woven dome is the inner disc; the spires reach well past it.
    float D = dome * 0.72 * breath;

    // --- Woven dome: the shared core -------------------------------------------
    // Neither tier of the weave changes species. It is what holds the middle of
    // the frame together while the crown turns over.
    // Twenty-four radial struts. The angular cell is converted to a real screen
    // distance, so a strut is the same gauge at the hub as at the rim.
    const float SPOKES = 18.0;
    float sk  = (a + turn) * (SPOKES / TAU);
    float sid = mod(floor(sk), SPOKES);
    float sd  = abs(fract(sk) - 0.5) * (TAU / SPOKES) * r;
    // Struts stop at their own radius, so the dome edge is ragged, not machined.
    float sL  = D * (0.80 + 0.26 * hash11(sid * 1.71 + 4.2));
    float spoke = (1.0 - smoothstep(GAUGE, GAUGE + 0.0016, sd))
                * smoothstep(0.010, 0.030, r)
                * (1.0 - smoothstep(sL * 0.94, sL, r));

    // Concentric rings, scalloped so the weave bows between struts the way a
    // basket does instead of sitting as perfect circles.
    float rs = r * (1.0 + 0.055 * cos(10.0 * (a - turn * 2.0)));
    float rk = rs * RINGS / D;
    float rd = abs(fract(rk - creep) - 0.5) * D / RINGS;
    float ring = (1.0 - smoothstep(GAUGE, GAUGE + 0.0016, rd))
               * smoothstep(0.018, 0.045, r)
               * (1.0 - smoothstep(D * 0.90, D * 1.00, r));

    // A second, finer weave turning the other way. Two counter-rotating tiers is
    // what turns a tidy spider web into the dense thicket the reference has.
    const float SPOKES2 = 38.0;
    float sk2  = (a - turn * 2.0) * (SPOKES2 / TAU);
    float sid2 = mod(floor(sk2), SPOKES2);
    float sd2  = abs(fract(sk2) - 0.5) * (TAU / SPOKES2) * r;
    float sL2  = D * (0.46 + 0.34 * hash11(sid2 * 2.37 + 8.1));
    float spoke2 = (1.0 - smoothstep(GAUGE * 0.72, GAUGE * 0.72 + 0.0014, sd2))
                 * smoothstep(0.014, 0.034, r)
                 * (1.0 - smoothstep(sL2 * 0.92, sL2, r));
    float rk2 = r * (1.0 - 0.040 * cos(14.0 * (a + turn * 3.0))) * (RINGS * 1.9) / D;
    float rd2 = abs(fract(rk2 + creep * 1.5) - 0.5) * D / (RINGS * 1.9);
    float ring2 = (1.0 - smoothstep(GAUGE * 0.72, GAUGE * 0.72 + 0.0014, rd2))
                * smoothstep(0.020, 0.042, r)
                * (1.0 - smoothstep(D * 0.62, D * 0.74, r));

    // --- Morphing crown: ten spires --------------------------------------------
    // Their length is set in uv rather than scaled off the dome, which is what
    // keeps the longest one inside the frame at every setting of the slider,
    // its bind and now its form.
    const float SPIRES = 10.0;
    float pk  = (a + turn) * (SPIRES / TAU);
    float pid = mod(floor(pk), SPIRES);
    float pd  = abs(fract(pk) - 0.5) * (TAU / SPIRES) * r;
    float phv = hash11(pid * 3.13 + 1.9);

    // Per-spire selector. The cosine term sweeps the change around the crown and,
    // unlike a linear index ramp, is continuous where the ring wraps. The hash
    // keeps that sweep from looking mechanical. Both are static, so at a fixed
    // spectrum the crown holds still: the wave is positioned by the music.
    float u  = 0.5 - 0.5 * cos(pid * (TAU / SPIRES));
    float xj = clamp(sel * 3.0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (phv - 0.5)),
                     0.0, 3.0);

    // Triangular weights of slope 1.85. Support is 1/1.85 either side of a centre
    // and the centres are spaced 1.0, so neighbours overlap over 2/1.85 - 1 = 0.081
    // of the axis and the sum is never zero. The slope must stay below 2.0 or the
    // normalisation below divides by nothing.
    float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One spire primitive, seven interpolated numbers, so
    // the silhouette deforms and no fragment shows two forms at half alpha.
    //             buttress   spire      halberd    needle
    float pLm  = 0.70 * w0 + 1.00 * w1 + 1.05 * w2 + 1.08 * w3;   // reach
    float pwM  = 2.40 * w0 + 1.00 * w1 + 0.62 * w2 + 0.26 * w3;   // gauge
    float tpr  = 1.20 * w0 + 2.00 * w1 + 2.60 * w2 + 3.60 * w3;   // taper
    float bfr  = 4.00 * w0 + 9.00 * w1 + 15.0 * w2 + 26.0 * w3;   // finial pitch
    float bbz  = 0.15 * w0 + 1.00 * w1 + 1.85 * w2 + 0.05 * w3;   // finial size
    float barM = 1.90 * w0 + 1.00 * w1 + 1.45 * w2 + 0.12 * w3;   // cross-bar
    float gdM  = 0.50 * w0 + 1.00 * w1 + 1.30 * w2 + 1.80 * w3;   // glints

    float pL  = (0.240 + 0.080 * spire) * pLm
              * (0.82 + 0.26 * phv)
              * (1.0 + 0.20 * sin(a));            // the crown leans upward
    float t   = r / max(pL, 1e-4);
    float pw  = GAUGE * 0.9 + 0.0140 * pwM * pow(clamp(1.0 - t, 0.0, 1.0), tpr);

    // Barbed finials on the outer third, and a cross-bar just short of the point.
    float bt   = fract(t * bfr - creep);
    float barb = smoothstep(0.55, 0.95, bt) * smoothstep(1.05, 0.90, bt)
               * smoothstep(0.62, 0.78, t);
    pw *= 1.0 + 1.85 * bbz * barb;
    float bar = (1.0 - smoothstep(0.0026 * barM, 0.0046 * barM, abs(r - pL * 0.875)))
              * (1.0 - smoothstep(0.018 * barM, 0.030 * barM, pd)) * step(0.20, barM);

    float onP   = smoothstep(0.030, 0.070, r) * (1.0 - smoothstep(0.975, 1.0, t));
    float spike = (1.0 - smoothstep(pw, pw + 0.0016, pd)) * onP;
    float point = (1.0 - smoothstep(pw * 1.6, pw * 1.6 + 0.0016, pd))
                * smoothstep(0.90, 0.99, t) * (1.0 - smoothstep(0.99, 1.02, t));

    // --- Light -----------------------------------------------------------------
    // Cool rim on the outer edge of every strut, and glints travelling out along
    // them. step() picks about one cell in eight, so they read as scattered.
    float rimS = (1.0 - smoothstep(0.0006, 0.0022, abs(sd - GAUGE)))
               * smoothstep(0.010, 0.030, r) * (1.0 - smoothstep(sL * 0.94, sL, r));
    float rimR = (1.0 - smoothstep(0.0006, 0.0022, abs(rd - GAUGE)))
               * smoothstep(0.018, 0.045, r) * (1.0 - smoothstep(D * 0.90, D * 1.00, r));

    float gc = floor(r * 52.0 - ph * 26.0);
    float gl = step(0.94, hash11(sid * 6.31 + gc * 2.17))
             * (1.0 - smoothstep(0.0, 0.0040, sd)) * spoke;
    float gp = step(0.90, hash11(pid * 8.77 + gc * 1.53))
             * (1.0 - smoothstep(0.0, 0.0055, pd)) * spike * gdM;

    // Graphite: a near-black body carried entirely by its sheen, plus a small hub
    // where every strut is socketed.
    vec3 graph = vec3(0.145, 0.152, 0.172);
    vec3 steel = vec3(0.66, 0.74, 0.86);
    float hub  = (1.0 - smoothstep(0.026, 0.040, r));
    float core = (0.0009 / (dot(uv, uv) + 0.0016)) * (1.0 - smoothstep(0.012, 0.075, r));

    vec3 col = graph * (spoke * 1.15 + ring * 1.05 + spike * 1.25 + bar * 1.10 + point * 1.20
                      + spoke2 * 0.85 + ring2 * 0.80)
             + steel * (rimS + rimR) * (0.09 + 0.20 * sheen)
             + steel * barb * bbz * spike * (0.30 + 0.45 * sheen)
             + vec3(0.95, 0.98, 1.00) * (gl + gp) * 1.18 * hatF
             + graph * hub * 1.40
             + steel * (1.0 - smoothstep(0.030, 0.038, r)) * 0.16
             + vec3(0.92, 0.96, 1.00) * core * 0.32;

    // Soft knee: twenty-four struts and ten spires converge on one point.
    col = col / (1.0 + col * 0.30);

    // Radial safety bound. The needle form is the longest, at (0.240 + 0.080)
    // * 1.08 length * 1.08 hash * 1.20 lean, which is 0.448 at the point: no
    // further than the old slider already reached, so this fade feathers the
    // points exactly as it did before.
    float rim = 1.0 - smoothstep(0.428, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (spoke * 1.00 + ring * 0.95 + spike * 1.00 + bar * 0.95
                 + spoke2 * 0.85 + ring2 * 0.80
                 + point * 1.00 + (rimS + rimR) * 0.55 + (gl + gp) * 0.60
                 + hub * 1.00 + core * 0.40) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
