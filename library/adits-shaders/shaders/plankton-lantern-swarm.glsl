/*{
  "ADITS": 1,
  "DESCRIPTION": "A bioluminescent siphonophore: one glowing strand closed into a precessing three-lobed clover around a nucleus that never changes, beaded with twenty-four lanterns that each change species on their own schedule. Each lantern is one anisotropic bead under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: spore bulb, haloed plankton, trailing comet, radial needle. Bass widens the clover, mid scallops it, treble hones every core. Rests as the plankton.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "particle", "bloom", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 8.0,
  "INPUTS": [
    { "NAME": "sens",      "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",      "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",      "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "spread",    "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.20, "MAX": 0.32,
      "LABEL": "Clover Span", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "drift",     "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Strand Scallop", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "coreSharp", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Core Sharpness", "BIND": "treble", "BIND_DEPTH": 0.55 },
    { "NAME": "tint",      "TYPE": "color", "DEFAULT": [0.16, 0.94, 0.76, 1.00],
      "LABEL": "Bioluminescence" },
    { "NAME": "sparkTint", "TYPE": "color", "DEFAULT": [1.00, 0.72, 0.24, 1.00],
      "LABEL": "Lantern Colour" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 8.0
#define BEADS 24

// Local radius at which one lantern's contribution reaches exactly zero,
// measured in that lantern's own stretched frame. Every glow term is
// multiplied by the falloff, so no bead can bleed a haze to the frame edge.
#define REACH 0.055

// How far the per-bead selector is spread along the strand. The change then
// travels down the strand bead by bead instead of flipping all of it at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Phase wraps exactly at LOOP = 8 s. The beads travel one turn per loop
    // and the three lobes precess two, both integers, so the object returns
    // to its start frame.
    float ph0 = fract(TIME / PERIOD);
    float a = TAU * ph0;

    float r = length(uv);

    // --- Selector -------------------------------------------------------------
    // Balance decides which lantern species this is; loudness only decides how
    // hard it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;             // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than
    // any one band. Expanded around the rest point, or the outer forms never
    // arrive and the morph fails silently.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // hones a lantern to a needle, a kick swells it back to a spore bulb.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to the chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the beat
    // that swells a lantern also pulses the nucleus. AUDIO_BEAT already decays,
    // so it is used straight and the floor keeps everything lit in silence.
    float pulse = 0.22 + 0.78 * snap * AUDIO_BEAT;

    // Tracked hand in uv space. TRACK.y points down, so it is flipped. The
    // response is scaled by TRACK_ON, which drops to 0 immediately when
    // tracking is lost, while TRACK itself only eases back over ~20 frames.
    vec2 hand = vec2(TRACK.x, -TRACK.y) * 0.42;
    float handAmt = 0.030 * TRACK_ON;

    // Core tightness: a smaller epsilon is a sharper, hotter point.
    float eps0 = mix(0.00055, 0.00006, coreSharp);

    // Lobe precession, loop-invariant, so it is hoisted out of the loop.
    float prec = 2.0 * a;
    float dth = TAU / float(BEADS);

    vec3 col = vec3(0.0);
    float cov = 0.0;

    // Shared nucleus. It never changes species, so something solid holds the
    // centre through every transition.
    float nucR = 0.088 * (1.0 + 0.10 * sin(a * 2.0) + pulse * 0.28);
    float nd = r / max(nucR, 0.001);
    float coreGlow = exp(-nd * nd * 3.0) * 0.75 + exp(-nd * nd * 13.0);
    col += mix(tint.rgb, vec3(1.0), 0.28 + 0.45 * pulse) * coreGlow * 1.5;
    cov += coreGlow * 0.95;

    for (int i = 0; i < BEADS; i++) {
        float fi = float(i);
        float u = fi / float(BEADS);
        float jt = hash11(fi * 4.13 + 1.7);

        // Per-bead selector. u sweeps the change along the strand; the hash
        // keeps that sweep from looking mechanical. Both are static, so at a
        // fixed spectrum the strand holds its species.
        float xj = clamp(x0 + STAGGER * (0.62 * (u - 0.5) + 0.38 * (jt - 0.5)),
                         0.0, 3.0);

        // Triangular weights of slope 1.85. Support is 1/1.85 either side of a
        // centre and the centres are spaced 1.0, so neighbours overlap over
        // 2/1.85 - 1 = 0.081 of the axis and the sum is never zero. The slope
        // must stay below 2.0 or the normalisation divides by nothing.
        float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
        float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
        float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
        float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
        float ws = w0 + w1 + w2 + w3;
        w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

        // Parameter-space morph. One anisotropic bead, seven interpolated
        // numbers, so the lantern deforms and no fragment ever shows two
        // species at half alpha.
        //             bulb      plankton   comet      needle
        float reachM = 0.74 * w0 + 1.00 * w1 + 1.04 * w2 + 1.08 * w3;
        float epsM   = 3.50 * w0 + 1.00 * w1 + 1.80 * w2 + 0.30 * w3;
        float glowM  = 3.40 * w0 + 1.00 * w1 + 0.80 * w2 + 0.40 * w3;
        float strM   = 1.90 * w0 + 1.15 * w1 + 2.40 * w2 + 1.35 * w3;
        float crossM = 1.90 * w0 + 0.90 * w1 + 0.55 * w2 + 0.20 * w3;
        float axisM  = 0.00 * w0 + 0.20 * w1 + 0.00 * w2 + 1.00 * w3;
        float hueM   = 0.00 * w0 + 0.40 * w1 + 0.66 * w2 + 1.00 * w3;
        // The strand is shared: present in every form, only its thickness
        // interpolates, so the silhouette never breaks into loose dots.
        float wireM  = 1.60 * w0 + 1.00 * w1 + 0.75 * w2 + 0.45 * w3;

        // Position along a closed three-lobed clover. The bead travels one
        // turn per loop and the lobes precess two, so the strand slides
        // through its own shape and every bead returns to where it started.
        float th  = u * TAU + a;
        float th2 = th + dth;
        float lobe  = 0.60 + 0.40 * cos(3.0 * th  - prec)
                    + drift * 0.10 * cos(6.0 * th  + prec);
        float lobe2 = 0.60 + 0.40 * cos(3.0 * th2 - prec)
                    + drift * 0.10 * cos(6.0 * th2 + prec);
        float span = spread * reachM;

        // The radial direction is the parametrisation's own unit vector, so
        // nothing here needs a normalize.
        vec2 dirv = vec2(cos(th), sin(th));
        vec2 pos  = dirv * (span * lobe);
        vec2 posN = vec2(cos(th2), sin(th2)) * (span * lobe2);

        // Analytic tangent of the clover, used as the comet's tail axis.
        float dlobe = -1.20 * sin(3.0 * th - prec)
                    - drift * 0.60 * sin(6.0 * th + prec);
        vec2 tang = dirv * dlobe + vec2(-dirv.y, dirv.x) * lobe;

        // Hand repulsion, local to the hand rather than a global drift.
        vec2 away = pos - hand;
        float hd = length(away);
        pos += (away / (hd + 0.001)) * handAmt * exp(-hd * hd * 8.0);

        // --- the strand segment -------------------------------------------
        // The segment to the next bead, so the same iteration draws the wire
        // that joins them and the clover reads as one continuous body.
        vec2 seg = posN - pos;
        float h = clamp(dot(uv - pos, seg) / max(dot(seg, seg), 1e-6), 0.0, 1.0);
        float sd = length(uv - pos - seg * h);
        float wire = 0.0016 * wireM / (sd + 0.0040) * smoothstep(0.060, 0.0, sd);

        // --- the lantern bead ---------------------------------------------
        vec2 d = uv - pos;

        // Stretch frame. The needle form points its spike radially outward,
        // the comet form trails its tail along the strand.
        vec2 axis = normalize(mix(tang, dirv, axisM) + vec2(1e-5, 1e-5));
        vec2 perp = vec2(-axis.y, axis.x);
        float q = length(vec2(dot(d, axis) / strM, dot(d, perp) / crossM));

        // fall is 0 beyond REACH in the stretched frame, so both the colour
        // and the alpha stay inside the bead.
        float fall = smoothstep(REACH, 0.0, q);
        float core = 0.00042 / (q * q + eps0 * epsM) * fall;
        float glow = 0.0030 / (q + 0.012) * fall * fall * glowM;

        // Colour walks the strand from bioluminescent body light to lantern
        // warmth, and the morph pushes it the rest of the way.
        vec3 pCol = mix(tint.rgb, sparkTint.rgb,
                        clamp(hueM * 0.75 + 0.25 * (0.5 + 0.5 * sin(th)), 0.0, 1.0));
        pCol = mix(pCol, vec3(1.0), clamp(core * 0.25, 0.0, 0.35));

        float w = core * 0.85 + glow * 0.65;
        col += pCol * w * (1.55 + pulse * 0.80)
             + mix(tint.rgb, sparkTint.rgb, 0.15) * wire * (1.0 + pulse * 0.7);
        // Spatial by construction: both terms carry their own falloff.
        cov += w * fall * 1.15 + wire * 0.85;
    }

    // Frame guard. The widest reachable bead sits at 0.32 span * 1.10 scallop
    // * 1.08 reach, plus the 0.03 hand push and REACH * 1.35 of radial needle:
    // about 0.48, so this fade only feathers the tip of an extreme needle.
    float edgeFade = smoothstep(0.478, 0.41, r);
    col *= edgeFade;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = clamp(cov * edgeFade, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
