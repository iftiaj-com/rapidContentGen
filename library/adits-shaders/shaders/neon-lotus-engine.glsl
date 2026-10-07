/*{
  "ADITS": 1,
  "DESCRIPTION": "A mechanical lotus drawn in pure neon light around a glowing heart that never changes, its three petal rings each changing species on their own schedule. Each ring is one arc under five interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: broad bloom petal, neon petal, barbed lance, needle ray. Bass blooms the lotus, treble hones it to rays. Rests as the neon petal.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "neon", "armature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",       "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",       "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",       "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "coreRadius", "TYPE": "float", "DEFAULT": 0.12, "MIN": 0.05, "MAX": 0.18,
      "LABEL": "Core Size", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "petalFlare", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Petal Flare", "BIND": "level", "BIND_DEPTH": 0.60 },
    { "NAME": "fringe",     "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 0.80,
      "LABEL": "Fringe", "BIND": "treble", "BIND_DEPTH": 0.50 }
  ]
}*/

#define TAU 6.28318530718

// How far the per-ring selector is spread across the bloom. The change then
// crosses it ring by ring instead of flipping all three at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

void main() {
    // Canonical preamble
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // 16.0 second loop phase. Nothing on the morph path reads it: which petal
    // this is belongs to the music, not to the clock.
    float ph = fract(TIME / 16.0);
    float t = ph * TAU;

    float r = length(uv);
    float ang = atan(uv.y, uv.x);

    // --- Selector -------------------------------------------------------------
    // Balance decides which petal; loudness only decides how hard it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // hones a petal to a ray, a kick blooms it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the beat
    // that blooms a petal also pulses the heart. AUDIO_BEAT already decays, so
    // it is used straight and the floor keeps the heart lit in silence.
    float pulse = 0.20 + 0.80 * snap * AUDIO_BEAT;

    vec3 col = vec3(0.0);
    float alphaCov = 0.0;

    // Inner Core: the shared part, which never changes species.
    float corePulse = 1.0 + 0.15 * sin(t * 4.0) + pulse * 0.4;
    float cR = coreRadius * corePulse;

    // Core glow (spatial falloff)
    float coreDist = r / max(cR, 0.001);
    float coreGlow = exp(-coreDist * coreDist * 12.0);

    vec3 coreColor = mix(vec3(0.10, 0.92, 1.00), vec3(1.0, 1.0, 1.0), pulse);
    col += coreColor * coreGlow * 1.5;
    alphaCov += coreGlow * 0.8;

    // Petals
    vec3 cyan = vec3(0.10, 0.92, 1.00);
    vec3 mag  = vec3(0.86, 0.14, 0.98);

    // Three layers of petals, each on its own schedule
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float u  = fi * 0.5;
        float jt = hash11(fi * 4.13 + 1.7);

        // Per-ring selector. u sweeps the change from the heart outward; the hash
        // keeps that sweep from looking mechanical. Both are static, so at a
        // fixed spectrum the lotus holds still.
        float xj = clamp(x0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (jt - 0.5)),
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

        // Parameter-space morph. One arc primitive, five interpolated numbers, so
        // the petal deforms and no fragment ever shows two forms at half alpha.
        // The petal count stays out of it: the angular fold needs an integer or
        // the seam at the wrap opens.
        //             bloom      petal      lance      ray
        float reachM = 0.72 * w0 + 1.00 * w1 + 1.06 * w2 + 1.10 * w3;
        float widM   = 1.25 * w0 + 1.00 * w1 + 0.65 * w2 + 0.35 * w3;
        float intM   = 1.60 * w0 + 1.00 * w1 + 1.20 * w2 + 0.70 * w3;
        float frM    = 0.35 * w0 + 1.00 * w1 + 1.60 * w2 + 2.40 * w3;
        float frF    = 45.0 * w0 + 100.0 * w1 + 160.0 * w2 + 260.0 * w3;

        // Angular repetitions and integer-multiple spin for seamless looping
        float pCount = 12.0 - fi * 2.0;
        float spinRate = (fi + 1.0) * (mod(fi, 2.0) > 0.5 ? -1.0 : 1.0);
        float layerAng = ang + t * spinRate * 0.25;

        // Fold the angle
        float sector = TAU / pCount;
        float aFold = mod(layerAng + sector * 0.5, sector) - sector * 0.5;

        // Petal reach. The base is trimmed so that even the longest form lands
        // no further out than the old fixed petal did.
        float petalDist = (0.18 + fi * 0.072 + petalFlare * 0.068) * reachM;

        // Petal shape (local width mapping). The width multiplier is bounded
        // above as well as below: past about 1.3 the outline leaves its own
        // angular cell and the petal thins back out into chevrons.
        vec2 localP = vec2(r, aFold * r);
        float width = (petalDist - r) * (r + 0.05) * (3.0 + fi) * widM;
        float lineDist = abs(abs(localP.y) - width);

        // Bounded radially so the petals have a distinct end
        float rMask = smoothstep(petalDist, petalDist - 0.04, r) * smoothstep(0.02, 0.08, r);

        // Additive neon line
        float intensity = 0.0015 * intM / (lineDist + 0.001);
        intensity *= rMask;

        vec3 layerCol = mix(cyan, mag, fi / 2.0);

        // Electric fringe on the edges
        float fringeOsc = 0.5 + 0.5 * sin(r * frF - t * 8.0);
        intensity *= 1.0 + fringe * frM * fringeOsc * 2.0;

        col += layerCol * intensity * (1.0 + pulse * 0.5);
        alphaCov += intensity * rMask;
    }

    // Guard alpha. The ray form is the longest petal, at (0.18 + 0.144 + 0.068)
    // * 1.10 = 0.431, so this fade only feathers its outer tip.
    float edgeFade = smoothstep(0.48, 0.42, r);
    col *= edgeFade;

    float alpha = clamp(alphaCov * edgeFade, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
