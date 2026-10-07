/*{
  "ADITS": 1,
  "DESCRIPTION": "An oil-slick orchid arachnid on a ribbed spine and three antlers that never change, wearing five frond pairs that each change species on their own schedule. Each is one plated blade under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: scale plate, chevron frond, barbed sickle, oil needle. Every rib edge still splits into a real dispersion fringe. Bass plates it, treble hones it to needles. Rests as the chevron frond.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "iridescent", "chroma-split", "creature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach", "TYPE": "float", "DEFAULT": 0.305, "MIN": 0.230, "MAX": 0.330,
      "LABEL": "Frond Reach", "BIND": "bass", "BIND_DEPTH": 0.42 },
    { "NAME": "slick", "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Oil Slick", "BIND": "treble", "BIND_DEPTH": 0.55 },
    { "NAME": "glow",  "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Core Heat", "BIND": "level", "BIND_DEPTH": 0.40 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// Frond half-width at its widest, in uv units.
#define FROND 0.048

// Base rib pitch along a frond, before the morph scales it. It used to be a
// slider; rib pitch is now one of the numbers the form interpolates, because ten
// coarse plates and forty fine ones are two different limbs.
#define RIBS 18.0

// How far the per-frond selector is spread from the head pair to the hips. The
// change then crosses the creature as a wave instead of flipping all five.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// Narrow smoothed lobe. Deliberately narrow: a wide one leaves all three
// channels lit together and the slick washes out to pastel, which is the one
// failure mode a thin-film look cannot survive.
float lobe(float x) {
    float f = clamp(1.0 - abs(fract(x) - 0.5) * 2.60, 0.0, 1.0);
    return f * f * (3.0 - 2.0 * f);
}

vec3 filmHue(float t) {
    return vec3(lobe(t), lobe(t + 0.3333), lobe(t + 0.6667));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the
    // creature unfolds seamlessly on a 20 s cycle. Nothing on the morph path
    // reads it: which frond is which belongs to the music, not to the clock.
    float ph = fract(TIME / 20.0);

    // Bilateral mirror, exactly as the reference sits against the sky.
    vec2  p = vec2(abs(uv.x), uv.y);
    float r = length(uv);

    float breath = sin(ph * TAU);              // one breath per loop
    float swing  = sin(ph * TAU * 2.0);        // two limb swings per loop
    float drift  = ph * 3.0;                   // plates creep three ribs per loop
    float span   = reach * (1.0 + 0.055 * breath);

    // Iridescence sets both the saturation and how far the three channels are
    // offset from one another, which is what actually makes the fringe.
    float sat  = 0.70 + 0.30 * slick;
    float disp = 0.05 + 0.26 * slick;
    const vec3 CH = vec3(-1.0, 0.0, 1.0);      // red lags, blue leads

    // --- Selector -------------------------------------------------------------
    // Balance decides which frond; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // hones a frond to a needle, a kick plates it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float alive = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, alive);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the snare
    // that plates a frond also flares its crests.
    float flareF = 0.32 + 1.00 * snap * AUDIO_SNARE;

    vec3  col   = vec3(0.0);
    float covP  = 0.0;   // plate coverage
    float covF  = 0.0;   // silhouette specular
    float covC  = 0.0;   // crest flare

    // Five frond pairs. Constant bound, cheap body: this is why COST is "low".
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float u  = fi * 0.25;                  // 0 at the top pair, 1 at the hips

        float hv  = hash11(fi * 4.17 + 2.9);

        // Per-frond selector. u already runs head to hips, so it doubles as the
        // sweep coordinate; the hash keeps that sweep from looking mechanical.
        // Both are static, so at a fixed spectrum the creature holds still.
        float xj = clamp(x0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (hv - 0.5)),
                         0.0, 3.0);

        // Triangular weights of slope 1.85. Support is 1/1.85 either side of a
        // centre and the centres are spaced 1.0, so neighbours overlap over
        // 2/1.85 - 1 = 0.081 of the axis and the sum is never zero. The slope
        // must stay below 2.0 or the normalisation divides by nothing.
        float b0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
        float b1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
        float b2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
        float b3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
        float bs = b0 + b1 + b2 + b3;
        b0 /= bs; b1 /= bs; b2 /= bs; b3 /= bs;

        // Parameter-space morph. One plated blade, seven interpolated numbers, so
        // the silhouette deforms and no fragment shows two forms at half alpha.
        //              plate      frond      sickle     needle
        float lenM = 0.70 * b0 + 1.00 * b1 + 1.05 * b2 + 1.10 * b3;  // reach
        float wM   = 2.00 * b0 + 1.00 * b1 + 0.58 * b2 + 0.24 * b3;  // chord
        float tpr  = 0.55 * b0 + 1.00 * b1 + 1.25 * b2 + 1.75 * b3;  // taper
        float bowM = 0.40 * b0 + 1.00 * b1 + 1.70 * b2 + 0.30 * b3;  // bow
        float rbM  = 0.55 * b0 + 1.00 * b1 + 1.40 * b2 + 2.20 * b3;  // rib pitch
        float swg  = 0.28 * b0 + 0.72 * b1 + 1.05 * b2 + 0.22 * b3;  // comb depth
        float rkM  = 9.00 * b0 + 17.0 * b1 + 25.0 * b2 + 36.0 * b3;  // chevron rake

        vec2  base = vec2(0.018 + 0.016 * u, mix(0.245, -0.205, u));
        float ang  = mix(1.02, -0.98, u) + 0.11 * swing * sin(fi * 2.3 + 0.7);
        vec2  dir  = vec2(cos(ang), sin(ang));
        vec2  q    = p - base;
        float al   = dot(q, dir);
        float pe   = dot(q, vec2(-dir.y, dir.x));

        // Signed parabolic bow: the upper fronds curl up, the lower ones rake
        // down, which is the sweep the reference limbs have.
        pe -= mix(-1.30, 1.55, u) * bowM * al * al;

        float L   = span * (0.80 + 0.26 * hv) * lenM;
        float an  = al / max(L, 1e-4);         // 0 at the socket, 1 at the tip
        float ape = abs(pe);

        // Frond envelope: widest a third of the way out, tapering to a point.
        float env  = pow(clamp(1.0 - an, 0.0, 1.0), tpr);
        env = env * wM * (0.30 + 0.95 * smoothstep(0.0, 0.30, an));

        float live = step(0.0, an) * (1.0 - smoothstep(0.96, 1.04, an))
                   * smoothstep(0.006, 0.030, al);

        // Chevron rib plates. The -ape term rakes every seam into a chevron
        // pointing outward, which is what makes the plating read as overlapping
        // scales rather than as stacked blocks. Cut once per channel at a
        // slightly different phase: that is a real dispersion fringe.
        vec3 rp3 = fract(vec3(an * RIBS * rbM - drift - ape * rkM) + CH * disp);
        vec3 w3  = FROND * env * ((0.78 - swg * 0.5) + swg * rp3);
        vec3 d3  = vec3(ape) - w3;
        vec3 plate = (1.0 - smoothstep(vec3(-0.0035), vec3(0.0045), d3)) * live;

        // Each plate is a chip, not a ramp: the seam behind it goes nearly black
        // and the crest carries the shine, so the body gains relief while the
        // silhouette stays solid.
        float chip  = 0.14 + 0.96 * smoothstep(0.05, 0.62, rp3.g);
        float crest = smoothstep(0.74, 1.00, rp3.g);

        // Thin-film hue, banded along and across the frond, precessing once per
        // loop. The CAM_DIR term makes the fronds facing the viewer read a
        // different colour from the ones facing away, as a real film would.
        // Thin-film hue. The rib phase dominates, so neighbouring plates land on
        // different bands instead of sweeping one smooth rainbow down the frond.
        float hueT = rp3.g * 1.25 + ape * 5.2 + an * 1.35 + fi * 0.13 + hv * 0.19 + ph
                   + 0.50 * dot(dir, CAM_DIR.xy);
        vec3  hue  = filmHue(hueT) * vec3(0.80, 1.32, 0.98);
        // Desaturate toward deep teal, never toward white: a white floor lifts
        // all three channels and the slick goes pastel.
        hue = mix(vec3(0.045, 0.135, 0.120), hue, sat);

        // Wet specular line on the silhouette of every plate.
        float fringe = (1.0 - smoothstep(0.0, 0.0040, abs(d3.g))) * live;

        // Only the disagreement between the three channel cuts is dispersion; the
        // shared part is the dark oil body. Splitting the two is what keeps this a
        // slick with electric edges instead of a saturated rainbow ribbon.
        vec3 split = plate - vec3(plate.g);

        col += mix(vec3(0.038, 0.082, 0.076), hue * 0.70, 0.40) * plate.g * chip * 1.95
             + hue * split * 2.75
             + vec3(0.90, 1.00, 0.96) * fringe * 0.38
             + hue * crest * plate.g * (0.50 + 1.15 * flareF);

        covP += max(plate.r, max(plate.g, plate.b));
        covF += fringe;
        covC += crest * plate.g;
    }

    // --- Shared core ----------------------------------------------------------
    // Ribbed spine, and three thin antlers rising off the head. Neither changes
    // species; they are what holds the creature together while the fronds turn
    // over.
    float spineC = 0.0;
    float antC   = 0.0;
    {
        float sy = (uv.y + 0.215) / 0.50;                  // 0 at the hips, 1 at the head
        float sw = 0.030 * sin(PI * clamp(sy, 0.0, 1.0));
        vec3  sp3 = fract(vec3(sy * 26.0 - drift * 2.0 - p.x * 14.0) + CH * disp);
        vec3  sw3 = sw * (0.45 + 0.70 * sp3);
        vec3  sd3 = vec3(p.x) - sw3;
        float live = step(0.0, sy) * (1.0 - step(1.0, sy));
        vec3  sm  = (1.0 - smoothstep(vec3(-0.0030), vec3(0.0040), sd3)) * live;
        vec3  shue = filmHue(sp3.g * 1.20 + sy * 1.60 + ph + 0.35) * vec3(0.80, 1.32, 0.98);
        shue = mix(vec3(0.045, 0.135, 0.120), shue, sat);
        vec3  ssp  = sm - vec3(sm.g);
        col += mix(vec3(0.038, 0.082, 0.076), shue * 0.70, 0.40) * sm.g
             * (0.24 + 1.02 * smoothstep(0.05, 0.62, sp3.g)) * 1.85
             + shue * ssp * 2.75;
        spineC = max(sm.r, max(sm.g, sm.b));

        // Antlers: three tapered needles leaning out of the head.
        for (int j = 0; j < 3; j++) {
            float fj = float(j);
            float aang = 1.5708 - 0.30 * fj - 0.07 * swing;
            vec2  ad = vec2(cos(aang), sin(aang));
            vec2  aq = p - vec2(0.014, 0.235);
            float aa = dot(aq, ad);
            float ap = abs(dot(aq, vec2(-ad.y, ad.x)) - 0.55 * aa * aa);
            float aL = span * (0.52 - 0.11 * fj);
            float at = aa / aL;
            float aw = 0.0090 * clamp(1.0 - at, 0.0, 1.0);
            antC += (1.0 - smoothstep(aw, aw + 0.0016, ap))
                  * step(0.0, at) * (1.0 - smoothstep(0.94, 1.02, at));
        }
        // Antlers get their hue from height, so they band like the rest of the
        // shell instead of reading as one flat blue horn.
        vec3 ahue = filmHue(uv.y * 5.5 + ph * 2.0 + 0.6) * vec3(0.80, 1.32, 0.98);
        col += mix(vec3(0.055, 0.115, 0.105), ahue, sat * 0.80) * min(antC, 1.0) * 1.15;
    }

    // Hot nucleus where every frond is socketed, bounded so it pools at the
    // centre only.
    float core = (0.0016 / (dot(uv, uv) + 0.0026)) * (1.0 - smoothstep(0.02, 0.13, r)) * glow;
    col += vec3(1.00, 0.96, 0.82) * core * 0.75;

    // Soft knee. Ten fronds converge on one point; without this the nucleus
    // clips to flat white and the plating vanishes.
    col = col / (1.0 + col * 0.32);

    // Radial safety bound. The needle form is the longest frond, at 0.330 reach
    // * 1.055 breath * 1.06 hash * 1.10 length, which is within a few per cent of
    // what the old Frond Reach ceiling produced, so this fade feathers the tips
    // exactly as it did before.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (min(covP, 1.4) * 1.00 + min(covF, 1.0) * 0.55
                 + min(covC, 1.0) * 0.30 + spineC * 1.00
                 + min(antC, 1.0) * 0.95 + core * 0.50) * rim;
    alpha = smoothstep(0.020, 0.95, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
