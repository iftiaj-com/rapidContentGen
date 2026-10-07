/*{
  "ADITS": 1,
  "DESCRIPTION": "A frost insect in anaglyph, its beaded antennae and crystalline core unchanging, wearing four wing spine pairs that each change species on their own schedule. Each is one blade under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: frost scale, chevron wing, barbed sickle, ice needle. Every limb still splits crimson one side and mint the other. Bass plates it, treble strips it to needles. Rests as the chevron wing.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "chroma-split", "frost", "creature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 18.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach",  "TYPE": "float", "DEFAULT": 0.290, "MIN": 0.230, "MAX": 0.320,
      "LABEL": "Limb Reach", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "split",  "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Anaglyph Split", "BIND": "treble", "BIND_DEPTH": 0.55 },
    { "NAME": "frost",  "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Frost Glow", "BIND": "level", "BIND_DEPTH": 0.45 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// Base chevron pitch along a wing, before the morph scales it. It used to be a
// slider; plate pitch is now one of the numbers the form interpolates.
#define PLATES 14.0

// How far the per-wing selector is spread from head to tail. The change then
// crosses the creature as a wave instead of flipping all four pairs at once.
#define STAGGER 1.05

// r shifts one way, b the other. The green channel is the true position.
const vec3 CH = vec3(-1.0, 0.0, 1.0);

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the
    // creature wraps seamlessly on an 18 s cycle. Nothing on the morph path
    // reads it: which wing is which belongs to the music, not to the clock.
    float ph = fract(TIME / 18.0);

    // Bilateral mirror, exactly as the reference sits.
    vec2  p = vec2(abs(uv.x), uv.y);
    float r = length(uv);

    float breath = sin(ph * TAU);
    float wob    = sin(ph * TAU * 2.0);
    float drift  = ph * 3.0;
    float span   = reach * (1.0 + 0.050 * breath);

    // Channel offset in uv. This is the whole look, so it is generous: at the
    // default it is comparable to a limb's own half-width, which is what turns a
    // fringe into a genuine crimson-and-mint separation.
    float shift = 0.0016 + 0.0060 * split;

    // --- Selector -------------------------------------------------------------
    // Balance decides which wing; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips a wing to a needle, a kick plates it into a scale.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float alive = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, alive);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the kick
    // that plates a wing also flares the core under it.
    float flareF = 0.32 + 1.05 * snap * AUDIO_KICK;

    vec3  cov  = vec3(0.0);   // per-channel coverage; this is the colour
    float lum  = 0.0;         // shared luminance, for the white cores
    float beadC = 0.0;

    // --- Two beaded antennae ---------------------------------------------------
    for (int j = 0; j < 2; j++) {
        float fj = float(j);
        float ang = 1.34 - 0.24 * fj + 0.055 * wob;
        vec2  dir = vec2(cos(ang), sin(ang));
        vec2  q   = p - vec2(0.010, 0.040);
        float al  = dot(q, dir);
        float pe  = dot(q, vec2(-dir.y, dir.x)) + 0.90 * al * al;

        float L   = span * (0.95 + 0.10 * fj);
        float an  = al / L;
        float w   = 0.0024 * (1.0 - 0.45 * clamp(an, 0.0, 1.0));

        // Beads strung along the shaft, growing toward the tip.
        float bt   = fract(an * 8.0 - drift);
        float bead = smoothstep(0.58, 0.96, bt) * smoothstep(1.06, 0.90, bt)
                   * smoothstep(0.10, 0.55, an);
        float wb   = w * (1.0 + 4.2 * bead);

        float live = step(0.0, an) * (1.0 - smoothstep(0.965, 1.01, an));
        vec3  ap3  = abs(vec3(pe) - CH * shift);
        vec3  mask3   = (1.0 - smoothstep(vec3(wb), vec3(wb + 0.0014), ap3)) * live;

        cov  += mask3;
        lum  += mask3.g;
        beadC += bead * mask3.g;
    }

    // --- Morphing fringe: four chevron-plated wing spines ----------------------
    for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float u  = fi / 3.0;
        float hv = hash11(fi * 3.77 + 6.1);

        // Per-wing selector. u already runs head to tail, so it doubles as the
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

        // Parameter-space morph. One blade primitive, seven interpolated numbers,
        // so the silhouette deforms and no fragment shows two forms at half alpha.
        //              scale      wing       sickle     needle
        float lenM = 0.68 * b0 + 1.00 * b1 + 1.05 * b2 + 1.10 * b3;  // reach
        float wM   = 2.00 * b0 + 1.00 * b1 + 0.58 * b2 + 0.24 * b3;  // chord
        float tpr  = 0.55 * b0 + 1.00 * b1 + 1.25 * b2 + 1.75 * b3;  // taper
        float bowM = 0.40 * b0 + 1.00 * b1 + 1.70 * b2 + 0.30 * b3;  // bow
        float plM  = 0.55 * b0 + 1.00 * b1 + 1.35 * b2 + 2.10 * b3;  // plate pitch
        float swg  = 0.30 * b0 + 0.80 * b1 + 1.10 * b2 + 0.25 * b3;  // comb depth
        float rkM  = 8.00 * b0 + 15.0 * b1 + 22.0 * b2 + 32.0 * b3;  // chevron rake

        float ang = mix(0.30, -0.62, u) + 0.09 * wob * sin(fi * 2.1);
        vec2  dir = vec2(cos(ang), sin(ang));
        vec2  q   = p - vec2(0.012 + 0.010 * u, mix(0.050, -0.115, u));
        float al  = dot(q, dir);
        float pe  = dot(q, vec2(-dir.y, dir.x)) - mix(-0.70, 1.05, u) * bowM * al * al;

        float L   = span * (0.62 + 0.48 * hv) * (1.0 - 0.22 * u) * lenM;
        float an  = al / max(L, 1e-4);

        // Blade envelope, widest a third of the way out.
        float env = pow(clamp(1.0 - an, 0.0, 1.0), tpr);
        env = 0.046 * wM * env * (0.28 + 0.95 * smoothstep(0.0, 0.26, an))
                     * (1.0 - 0.34 * u);

        float live = step(0.0, an) * (1.0 - smoothstep(0.960, 1.02, an))
                   * smoothstep(0.006, 0.028, al);

        // The channel offset is applied to the position, then the chevron plating
        // is cut from each channel's own offset coordinate, so the plates land in
        // three slightly different places rather than merely fringing.
        vec3 ap3 = abs(vec3(pe) - CH * shift);
        vec3 rp3 = fract(vec3(an * PLATES * plM - drift) - ap3 * rkM);
        vec3 w3  = env * ((0.80 - swg * 0.5) + swg * rp3);
        vec3 mask3  = (1.0 - smoothstep(w3 - vec3(0.0016), w3 + vec3(0.0016), ap3)) * live;

        // Crest chips, so the blade reads as overlapping frost plates.
        float crest = smoothstep(0.72, 1.00, rp3.g);

        cov += mask3 * (0.30 + 0.95 * smoothstep(0.04, 0.60, rp3.g));
        lum += mask3.g * crest * 1.15;
    }

    // --- Crystalline core ------------------------------------------------------
    // Short radiating needles under the body plus a hot nucleus, both bounded.
    float ath = atan(uv.y, uv.x);
    float nk  = (ath + ph * TAU) * (36.0 / TAU);
    float nsd = abs(fract(nk) - 0.5) * (TAU / 36.0) * r;
    float nlen = 0.050 + 0.115 * flareF;
    float need = (1.0 - smoothstep(0.0014, 0.0032, nsd))
               * (1.0 - smoothstep(nlen * 0.35, nlen, r))
               * smoothstep(0.004, 0.018, r);
    float nuc  = 1.0 - smoothstep(0.016, 0.030, r);
    float core = (0.0014 / (dot(uv, uv) + 0.0016)) * (1.0 - smoothstep(0.015, 0.105, r));

    // The per-channel coverage *is* the colour: crimson where only the red offset
    // lands, mint where green and blue do, white where all three agree.
    vec3 col = vec3(cov.r * 1.06, cov.g * 0.96, cov.b * 1.02) * (0.75 + 0.95 * frost)
             + vec3(0.90, 1.00, 1.00) * min(lum, 2.0) * (0.30 + 0.45 * frost)
             + vec3(0.80, 1.00, 0.98) * min(beadC, 1.5) * 0.55
             + vec3(0.86, 1.00, 1.00) * min(need, 1.5) * (0.60 + 1.00 * flareF)
             + vec3(1.00, 0.99, 0.98) * nuc * 0.95
             + vec3(0.95, 1.00, 1.00) * core * (0.50 + 0.80 * flareF);

    // Soft knee: twelve limbs and thirty-six needles converge on the nucleus.
    col = col / (1.0 + col * 0.30);

    // Radial safety bound. The needle form on the leading wing is the furthest
    // thing out, at 0.320 * 1.05 breath * 1.10 hash * 1.10 length from a socket
    // 0.05 off centre, which lands at 0.435, so this fade only feathers a tip.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (min(max(cov.r, max(cov.g, cov.b)), 1.3) * 0.98
                 + min(need, 1.0) * 0.80 + nuc * 1.00 + core * 0.50) * rim;
    alpha = smoothstep(0.020, 0.92, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
