/*{
  "ADITS": 1,
  "DESCRIPTION": "Three objects in one file, with the spectrum choosing: a heavy five-lobed obsidian bulb when the bass owns the mix, a squat thirteen-blade plated chrome rotor through the mids, and a thirty-six needle acid nova when the treble takes over. The selector is the balance of the three band levels, expanded hard and shoved by hat and kick onsets, so the identity changes within a beat rather than over a bar. At silence it rests on the chrome rotor.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "spectral", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.78, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Onset Snap" },
    { "NAME": "bias",   "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Silence Archetype" },
    { "NAME": "size",   "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.84, "MAX": 1.12,
      "LABEL": "Overall Size", "BIND": "bass", "BIND_DEPTH": 0.30 },
    { "NAME": "lume",   "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Emissive", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "plates", "TYPE": "float", "DEFAULT": 15.0, "MIN": 8.00, "MAX": 26.00,
      "LABEL": "Rotor Plates", "BIND": "treble", "BIND_DEPTH": 0.40 }
  ]
}*/

#define TAU 6.28318530718

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// Smooth a clamped triangular weight without widening it (§12.6).
float ease(float w) {
    return w * w * (3.0 - 2.0 * w);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // The only TIME read in the file. It drives spin and plate drift, not the
    // morph: identity belongs to the music, so nothing below keys off this.
    float ph = fract(TIME / 16.0);

    float r = length(uv);
    float a = atan(uv.y, uv.x);          // one atan for the frame, none in a loop

    float turn   = ph * TAU;
    float drift  = ph * 3.0;
    float breath = sin(ph * TAU * 2.0);

    // ---- Selector (§12.2) -----------------------------------------------------
    // Balance, not loudness. The four recorded band levels are used rather than
    // AUDIO_BANDS slots, so an offline export picks the same archetypes the
    // preview did instead of merely a similar-looking object.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;              // 0 all bass, 1 all treble

    // §12.3: tilt is a ratio of three smoothed averages, so it swings far less
    // than any single band. Expanded around the rest point, or the outer two
    // archetypes would never be reached on real material.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);

    // §12.7: at silence every audio uniform is 0.0 and tilt is 0/0, so the
    // resting archetype is chosen here rather than inherited from the arithmetic.
    float lively = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(bias, sel, lively);

    // §12.4: the onsets are the fastest signals in the profile and already decay,
    // so they are used straight. A hat snaps the object toward the nova, a kick
    // slams it back to the bulb. No TIME-windowed easing anywhere on this path.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    // ---- Weights (§12.6) ------------------------------------------------------
    // A triangular weight of slope s has support 1/s either side of its centre,
    // and the centres are spaced 1.0 apart, so neighbours overlap over 2/s - 1 and
    // stop overlapping entirely at s = 2.0, where the normalisation below would
    // divide by nothing. 1.72 leaves a margin and holds the crossfade to a sixth
    // of the axis instead of the third that slope 1.5 gives.
    float x  = sel * 2.0;
    float w0 = ease(clamp(1.0 - abs(x)       * 1.72, 0.0, 1.0));
    float w1 = ease(clamp(1.0 - abs(x - 1.0) * 1.72, 0.0, 1.0));
    float w2 = ease(clamp(1.0 - abs(x - 2.0) * 1.72, 0.0, 1.0));
    float wsum = w0 + w1 + w2 + 1e-4;
    w0 /= wsum; w1 /= wsum; w2 /= wsum;

    // ---- Shared parameters (§12.6) -------------------------------------------
    // Both slide continuously across the whole selector range, so the envelope is
    // visibly moving even at a 50/50 blend. size is bound to bass *loudness*,
    // which is a separate job from the bass *share* that picks the archetype.
    float sc    = size * (1.0 + 0.035 * breath);
    float reach = mix(0.235, 0.320, sel) * sc;
    float hubR  = mix(0.062, 0.016, sel) * sc;

    // ---- Archetype 0: obsidian bulb ------------------------------------------
    // Outlined in radius: the silhouette is a five-lobed radius function, which
    // is a different construction from the two centreline bodies below. That is
    // why this file evaluates three fields instead of reparameterising one, the
    // exception §12.5 allows: the cell counts must stay integers to avoid a seam
    // at the atan wrap, so the count itself cannot be interpolated.
    float k0 = (a + turn * 0.5) * (5.0 / TAU);
    float i0 = mod(floor(k0), 5.0);
    float c0 = abs(fract(k0) - 0.5);
    float h0 = hash11(i0 * 1.71 + 1.3);
    float e0 = reach * (0.88 + 0.22 * h0) * (1.0 - 1.45 * c0 * c0);
    float bulb    = 1.0 - smoothstep(e0 - 0.0035, e0 + 0.0035, r);
    float bulbRim = 1.0 - smoothstep(0.0018, 0.0058, abs(r - e0));
    float bulbGl  = smoothstep(0.34, 0.02, c0)
                  * (1.0 - smoothstep(e0 * 0.14, e0 * 0.86, r));
    float bulbSm  = (1.0 - smoothstep(0.16, 0.34,
                     abs(fract(r / max(e0, 0.02) * 3.0 - drift) - 0.5))) * bulb;

    // ---- Archetype 1: chrome rotor -------------------------------------------
    // Outlined in perpendicular distance, with chevron plating raked outward.
    float k1  = (a - turn) * (13.0 / TAU);
    float i1  = mod(floor(k1), 13.0);
    float sd1 = abs(fract(k1) - 0.5) * (TAU / 13.0) * r;
    float h1  = hash11(i1 * 2.93 + 4.1);
    float L1  = reach * (0.62 + 0.18 * h1);
    float t1  = r / L1;
    float pl1 = fract(t1 * plates - drift * 2.0 - sd1 * 13.0);
    float w1g = 0.052 * clamp(1.0 - t1, 0.0, 1.0)
              * (0.28 + 0.84 * smoothstep(0.0, 0.20, t1)) * (0.62 + 0.56 * pl1);
    float lv1 = smoothstep(0.012, 0.032, r) * (1.0 - smoothstep(0.965, 1.01, t1));
    float rotor    = (1.0 - smoothstep(w1g, w1g + 0.0018, sd1)) * lv1;
    float rotorRim = (1.0 - smoothstep(0.0010, 0.0034, abs(sd1 - w1g))) * lv1;
    float rotorCr  = smoothstep(0.74, 1.00, pl1) * rotor;

    // ---- Archetype 2: acid nova ----------------------------------------------
    // The same centreline construction at a much higher count and a hair gauge,
    // with beads travelling out along every needle.
    float k2  = (a + turn * 2.0) * (36.0 / TAU);
    float i2  = mod(floor(k2), 36.0);
    float sd2 = abs(fract(k2) - 0.5) * (TAU / 36.0) * r;
    float h2  = hash11(i2 * 1.37 + 7.7);
    float L2  = reach * (0.78 + 0.28 * h2);
    float t2  = r / L2;
    float w2g = 0.0024 * (1.0 - 0.62 * clamp(t2, 0.0, 1.0));
    float lv2 = smoothstep(0.008, 0.024, r) * (1.0 - smoothstep(0.955, 1.01, t2));
    float nova = (1.0 - smoothstep(w2g, w2g + 0.0013, sd2)) * lv2;
    float bd2  = fract(t2 * 18.0 - drift * 4.0 + h2);
    float bead = smoothstep(0.66, 0.98, bd2) * smoothstep(1.06, 0.90, bd2);
    float novaBd = (1.0 - smoothstep(w2g * 3.2, w2g * 3.2 + 0.0012, sd2)) * bead * lv2;

    // ---- Shared core (§12.6) --------------------------------------------------
    // Unweighted on purpose: it holds the middle of the frame together through a
    // transition, so the object never thins to nothing between archetypes.
    float nuc  = 1.0 - smoothstep(hubR * 0.80, hubR, r);
    float nucR = 1.0 - smoothstep(0.0014, 0.0046, abs(r - hubR));
    float core = (0.0016 / (dot(uv, uv) + 0.0020)) * (1.0 - smoothstep(0.02, 0.13, r));

    // ---- Palettes -------------------------------------------------------------
    vec3 obs   = vec3(0.048, 0.052, 0.062);
    vec3 cool  = vec3(0.58, 0.76, 0.95);
    vec3 steel = vec3(0.80, 0.85, 0.93);
    vec3 acid  = vec3(0.34, 1.00, 0.56);
    vec3 hotc  = vec3(0.82, 1.00, 0.95);
    vec3 white = vec3(1.00, 0.99, 0.96);
    float em = 0.55 + 1.10 * lume;

    vec3 col0 = obs * bulb * 1.30
              + cool * bulbRim * (0.46 * em)
              + white * bulbGl * (0.26 * em)
              + cool * bulbSm * (0.15 * em);
    vec3 col1 = steel * rotor * (0.42 * em)
              + white * rotorRim * (0.52 * em)
              + mix(steel, white, 0.72) * rotorCr * (0.62 * em);
    vec3 col2 = acid * nova * (1.00 * em)
              + hotc * novaBd * (0.90 * em);

    float cov0 = min(bulb + bulbRim * 0.70, 1.2);
    float cov1 = min(rotor + rotorRim * 0.60, 1.2);
    float cov2 = min(nova * 0.95 + novaBd * 0.70, 1.2);

    // Every archetype above was evaluated whether or not it is weighted in. That
    // is the price of the style (§12.5), and it is why COST is budgeted on the
    // sum: three analytic fields, one atan and four hashes, with no loop anywhere,
    // which still lands in the low tier. Three raymarched archetypes would not.
    vec3  col = col0 * w0 + col1 * w1 + col2 * w2
              + white * nuc * 0.90
              + cool * nucR * (0.32 * em)
              + white * core * (0.38 * em);
    float shapeCov = cov0 * w0 + cov1 * w1 + cov2 * w2;

    // Soft knee: thirty-six needles converge on the nucleus at the treble end.
    col = col / (1.0 + col * 0.28);

    // Radial safety bound. uv reaches only 0.5 on the axes, so everything closes
    // by 0.478 and the longest needles fade instead of being sliced.
    float rim = 1.0 - smoothstep(0.415, 0.478, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (shapeCov * 1.00 + nuc * 1.00 + nucR * 0.60 + core * 0.40) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
