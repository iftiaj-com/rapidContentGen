/*{
  "ADITS": 1,
  "DESCRIPTION": "A counter-rotating starburst of magenta, violet and emerald struts beaded with drifting light nodes, around a core and three orbiting sparks that never change. Each strut is one line under six interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: heavy bar, neon strut, beaded lance, hair ray. Bass bars the burst, treble draws it to hair, and the change sweeps strut by strut. Rests as the neon strut.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-20",
  "CATEGORIES": ["generative", "morph", "lattice", "neon", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",     "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",     "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",     "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "spread",   "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.20, "MAX": 0.38,
      "LABEL": "Burst Radius", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "nodeGlow", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Node Brightness", "BIND": "level", "BIND_DEPTH": 0.60 },
    { "NAME": "sparkle",  "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Spark Brightness", "BIND": "treble", "BIND_DEPTH": 0.55 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// How far the per-strut selector is spread across the burst. The change then
// crosses it strut by strut instead of flipping all nine at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Single loop phase. Every animated rate below is an integer multiple
    // of this phase, so the whole object wraps seamlessly at 16 s. Nothing on
    // the morph path reads it: which strut is which belongs to the music.
    float ph = fract(TIME / 16.0);

    float r  = length(uv);
    float r2 = dot(uv, uv);

    // Two lattice layers counter-rotate, one full turn each per loop.
    float rotA =  ph * TAU;
    float rotB = -ph * TAU;

    // Gentle breathing, two cycles per loop.
    float puls = 1.0 + 0.04 * sin(ph * TAU * 2.0);

    // Snare flash slices: 16 per loop, so the "random" subset is loop-safe.
    float seg = floor(ph * 16.0);

    vec3 MAG = vec3(1.00, 0.18, 0.82);
    vec3 VIO = vec3(0.58, 0.32, 1.00);
    vec3 EME = vec3(0.12, 1.00, 0.55);

    // --- Selector -------------------------------------------------------------
    // Balance decides which strut; loudness only decides how hard it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws a strut down to hair, a kick bars it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    vec3  col  = vec3(0.0);
    float covS = 0.0;   // strut coverage
    float covN = 0.0;   // node coverage

    // Nine struts as rotated line SDFs: layer A (i 0..4) is 5 struts / 10
    // rays, layer B (i 5..8) is 4 struts / 8 rays. Constant bound, cheap body.
    for (int i = 0; i < 9; i++) {
        float fi  = float(i);
        float isB = step(4.5, fi);            // 0 = layer A, 1 = layer B

        // Per-strut selector. The index sweeps the change across the burst; the
        // hash keeps that sweep from looking mechanical. Both are static, so at a
        // fixed spectrum the burst holds still: the wave is positioned by the
        // music, never by the clock. The struts are separate lines rather than
        // cells of one ring, so a linear index ramp leaves no seam.
        float uS = fi / 8.0;
        float jt = hash11(fi * 3.19 + 1.7);
        float xj = clamp(x0 + STAGGER * (0.66 * (uS - 0.5) + 0.34 * (jt - 0.5)),
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

        // Parameter-space morph. One line primitive, six interpolated numbers,
        // so the strut deforms and no fragment shows two forms at half alpha.
        //             bar        strut      lance      hair
        float lenM = 0.75 * w0 + 1.00 * w1 + 1.08 * w2 + 1.15 * w3;   // reach
        float cwM  = 1.70 * w0 + 1.00 * w1 + 1.30 * w2 + 0.55 * w3;   // core gauge
        float glM  = 1.30 * w0 + 1.00 * w1 + 1.25 * w2 + 0.50 * w3;   // glow
        float ndF  = 2.10 * w0 + 1.00 * w1 + 0.62 * w2 + 0.32 * w3;   // bead pitch
        float ndZ  = 1.90 * w0 + 1.00 * w1 + 0.75 * w2 + 0.45 * w3;   // bead size
        float briM = 0.75 * w0 + 1.00 * w1 + 1.15 * w2 + 1.45 * w3;   // emission
        float ia  = fi - isB * 5.0;           // index inside the layer
        float ang = mix(rotA + ia * (PI / 5.0),
                        rotB + ia * (PI / 4.0) + PI / 8.0, isB);

        vec2  dir   = vec2(cos(ang), sin(ang));
        float along = dot(uv, dir);
        float perp  = abs(dot(uv, vec2(-dir.y, dir.x)));
        float q     = abs(along);             // line through the centre: two rays

        // Static per-strut length variation; it rotates rigidly with its layer.
        float h1  = hash21(vec2(fi * 3.7 + 11.0, isB * 5.0 + 2.0));
        float len = spread * puls * (0.72 + 0.28 * h1) * lenM;

        // Palette: layer A alternates magenta / violet, layer B leans emerald.
        vec3 scol = mix(mix(MAG, VIO, mod(fi, 2.0)),
                        mix(EME, VIO, 0.35 * mod(ia, 2.0)), isB);

        // Snare flash: hash of strut id and the floor'd phase slice picks a
        // random-feeling subset. AUDIO_SNARE already decays, so it is used
        // directly as a multiplier; at silence the boost is exactly 1.
        float fh    = hash21(vec2(fi * 7.31 + isB * 29.0, seg + 1.0));
        // One transient control drives the light as well as the geometry.
        float boost = 1.0 + 1.45 * snap * AUDIO_SNARE * step(0.62, fh) * 1.2;

        // Thin bright core plus a tight bounded glow, denser near the centre,
        // fading to zero before the strut tip.
        float axial    = smoothstep(len, len * 0.30, q);
        float nearCut  = smoothstep(0.012, 0.055, q);   // hand the nucleus to the core glow
        float lineCore = smoothstep(0.0075 * cwM, 0.0015 * cwM, perp);
        float lineGlow = 0.00045 * glM / (perp * perp + 0.00045);
        float sInt = (lineCore * 0.85 + lineGlow * 0.40) * axial * nearCut * boost * briM;

        // Beads along the strut, drifting outward one spacing per loop. The
        // spacing is one of the morphed numbers; the drift is still exactly one
        // spacing per loop whatever it is, so the beads stay seamless.
        float nsp  = 0.085 * ndF;
        float nq   = (fract(q / nsp - ph) - 0.5) * nsp;
        float nd2  = nq * nq + perp * perp;
        float nInt = (0.00030 * ndZ / (nd2 + 0.00035))
                   * axial * nearCut * nodeGlow * 1.1 * boost;

        col  += scol * sInt + mix(scol, vec3(1.0), 0.45) * nInt;
        covS += sInt;
        covN += nInt;
    }

    // Three orbiting sparks: the shared part, which never changes species. Two
    // turns per loop, radius wobble three cycles per loop, both integer
    // multiples of the phase.
    float spark = 0.0;
    for (int i = 0; i < 3; i++) {
        float k    = float(i) * (TAU / 3.0) + ph * TAU * 2.0;
        float orad = spread * (0.96 + 0.08 * sin(ph * TAU * 3.0 + float(i) * (TAU / 3.0)));
        vec2  p    = vec2(cos(k), sin(k)) * orad;
        vec2  dv   = uv - p;
        spark += 0.00030 / (dot(dv, dv) + 0.00030);
    }
    spark *= sparkle;
    col   += vec3(0.90, 0.72, 1.00) * spark * 1.1;

    // Violet-white nucleus, bounded so it pools around the centre only. Kept
    // modest: every strut converges here too, so the additive pile-up at the
    // centre is already the brightest thing in the frame.
    float core = 0.0016 / (r2 + 0.0042) * smoothstep(0.40, 0.05, r);
    col += vec3(0.86, 0.60, 1.00) * core;

    // Soft knee. Dozens of overlapping additive struts clip to flat white
    // without one, which erases both the lattice and its colour.
    col = col / (1.0 + col * 0.72);

    // Radial bound. The hair form is the longest strut, at 0.38 burst radius *
    // 1.04 breath * 1.15 length, which is 0.454, so this fade feathers its tip
    // rather than the frame border cutting it.
    float rim = smoothstep(0.485, 0.36, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (covS * 0.85 + covN * 0.65 + core * 0.50 + spark * 0.55) * rim;
    alpha = smoothstep(0.015, 1.05, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
