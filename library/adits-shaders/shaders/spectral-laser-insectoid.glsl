/*{
  "ADITS": 1,
  "DESCRIPTION": "A bilateral cyber-insectoid drawn only in laser filaments, its beaded spine and green head orb unchanging, wearing five mirrored limb pairs that each change species on their own schedule. Each limb is one two-segment articulated arm under eight interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: short armour claw, curved neon arc, long laser lance, beaded hair needle. Bass swells the glow, mid opens the sweep, treble hones the filaments. Rests as the neon arc.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "neon", "creature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 10.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "bloom",   "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.20, "MAX": 2.20,
      "LABEL": "Glow", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "warp",    "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Limb Sweep", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "sparkle", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Filament Sharpness", "BIND": "treble", "BIND_DEPTH": 0.6 },
    { "NAME": "tint",    "TYPE": "color", "DEFAULT": [0.30, 1.00, 0.70, 1.00],
      "LABEL": "Core Tint" },
    { "NAME": "boneTint","TYPE": "color", "DEFAULT": [0.55, 0.80, 1.00, 1.00],
      "LABEL": "Spine Tint" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 10.0

// Every limb tip is folded onto this circle, so the silhouette is bounded by
// construction whatever the archetype asks for. Inside the visible frame edge
// at 0.5 with room left for the stroke and its glow.
#define REACH 0.392

// How far the per-limb selector is spread down the body. The change then
// travels from head to tail limb by limb instead of flipping the whole insect.
#define STAGGER 1.05

// Distance to a segment, and the position along it, in one return so the
// stroke can taper and bead without a second projection.
vec2 segDH(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return vec2(length(pa - ba * h), h);
}

// Spectral palette. The argument advances by exactly 1.0 per loop, so the
// chromatic sweep closes with the geometry.
vec3 rainbowPalette(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));
}

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    float r = length(uv);

    // Phase wraps exactly at LOOP = 10 s. Every rate below is an integer
    // multiple of this angle, so the insect returns to its start frame.
    float ph = fract(TIME / PERIOD);
    float a = TAU * ph;

    // --- Selector -------------------------------------------------------------
    // Balance decides which limb species this is; loudness only decides how
    // hard it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;             // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than
    // any one band. Expanded around the rest point, or the outer forms never
    // arrive and the morph fails silently.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws a limb out to a hair needle, a kick pulls it back to a claw.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to the chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the beat
    // that pulls a limb in also flares the head. AUDIO_BEAT already decays, so
    // it is used straight and the floor keeps the body lit in silence.
    float pulse = 0.20 + 0.80 * snap * AUDIO_BEAT;

    // Tracked hand sway, released the moment TRACK_ON falls to zero. Read
    // directly rather than bound, because a bind cannot express direction.
    vec2 hand = vec2(TRACK.x, -TRACK.y) * 0.030 * TRACK_ON;

    // Bilateral symmetry. The body has a head-to-tail axis, so only x is
    // mirrored, and the whole insect breathes along that axis.
    float breathe = 0.012 * sin(2.0 * a);
    vec2 q = vec2(abs(uv.x + hand.x), uv.y + hand.y + breathe);

    // Filament tightness. A smaller epsilon is a thinner, hotter laser core.
    float eps0 = mix(0.00035, 0.00004, sparkle);

    vec3 col = vec3(0.0);
    float cov = 0.0;

    // Five limb pairs, always five, so the per-pixel cost cannot move with a
    // slider or with the music.
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float u = fi / 4.0;                    // 0 at the head, 1 at the tail
        float jt = hash11(fi * 4.13 + 1.7);

        // Per-limb selector. u sweeps the change down the body; the hash keeps
        // that sweep from looking mechanical. Both are static, so at a fixed
        // spectrum the insect holds its species.
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

        // Parameter-space morph. One two-segment arm, eight interpolated
        // numbers, so the limb deforms and no fragment ever shows two species
        // at half alpha.
        //             claw      arc       lance     needle
        float len1  = 0.095 * w0 + 0.130 * w1 + 0.170 * w2 + 0.200 * w3;
        float len2  = 0.080 * w0 + 0.135 * w1 + 0.205 * w2 + 0.265 * w3;
        float bend  = 1.150 * w0 + 0.620 * w1 + 0.280 * w2 + 0.075 * w3;
        float wProx = 0.032 * w0 + 0.014 * w1 + 0.008 * w2 + 0.0030 * w3;
        float wDist = 0.020 * w0 + 0.006 * w1 + 0.002 * w2 + 0.0006 * w3;
        float epsM  = 2.600 * w0 + 1.000 * w1 + 0.700 * w2 + 0.400 * w3;
        float beadN = 0.000 * w0 + 0.000 * w1 + 4.000 * w2 + 9.000 * w3;
        float chrom = 0.200 * w0 + 0.600 * w1 + 0.820 * w2 + 1.000 * w3;

        // Where the limb joins the spine, and which way it points. The sweep
        // is one integer turn per loop, so the gait closes with the frame.
        vec2 hip = vec2(0.046, 0.205 - 0.102 * fi);
        // The front pair points up and out, the rear pair down and out, so the
        // body splays like an insect rather than stacking as chevrons.
        float base = 0.55 - 1.58 * u;
        float sw = base + warp * 0.55 * sin(a + fi * 0.70);

        vec2 knee = hip + vec2(cos(sw), sin(sw)) * len1;
        vec2 tip = knee + vec2(cos(sw - bend), sin(sw - bend)) * len2;

        // Fold any limb that overreaches back onto the bounding circle. The
        // long forms therefore splay to a common radius instead of leaving the
        // frame, and the silhouette is guaranteed without a slider check.
        knee *= min(1.0, REACH / max(length(knee), 1e-4));
        tip *= min(1.0, REACH / max(length(tip), 1e-4));

        // Two strokes, one primitive. Each tapers along its own length.
        vec2 s1 = segDH(q, hip, knee);
        vec2 s2 = segDH(q, knee, tip);
        float d1 = s1.x - mix(wProx, mix(wProx, wDist, 0.5), s1.y);
        float d2 = s2.x - mix(mix(wProx, wDist, 0.5), wDist, s2.y);

        float d = min(abs(d1), abs(d2));
        float h = s1.x < s2.x ? s1.y * 0.5 : 0.5 + s2.y * 0.5;

        // Crisp core plus a soft glow, both bounded by a falloff that reaches
        // zero close to the stroke, so nothing hazes toward the frame.
        float local = smoothstep(0.055, 0.0, d);
        float core = 0.00060 / (d * d + eps0 * epsM) * local;
        float glow = (0.0024 * bloom) / (d + 0.0035) * local * local;

        // Beads, on the forms that are meant to read as jointed hairs.
        float bead = 1.0 + beadN * 0.09 * (0.5 + 0.5 * cos(h * beadN * TAU));

        vec3 spec = rainbowPalette(ph + fi * 0.15 + h * 0.30);
        vec3 lCol = mix(mix(boneTint.rgb, tint.rgb, 0.35), spec, chrom);

        col += lCol * (core * 0.75 + glow * 0.55) * bead;
        cov += (core * 0.42 + glow * 0.30) * local * bead;

        // The spine node this limb hangs from. Shared: it never changes
        // species, so the body holds together through every transition.
        float nd = abs(length(q - hip) - 0.017);
        float ringGlow = 0.00028 / (nd * nd + 0.00007) * smoothstep(0.034, 0.0, nd);
        col += boneTint.rgb * ringGlow * 0.80;
        cov += ringGlow * 0.30;
    }

    // Shared spine. Drawn as the outline of a tapered body, widest at the
    // abdomen, so the insect has a trunk the limbs hang from. It never changes
    // species, so something solid holds the centre through every transition.
    vec2 sp = segDH(q, vec2(0.0, 0.290), vec2(0.0, -0.285));
    float wSp = 0.014 + 0.028 * sin(sp.y * 3.14159);
    float dsp = abs(sp.x - wSp);
    float glowSpine = 0.00045 / (dsp * dsp + 0.00010)
                    * smoothstep(0.038, 0.0, dsp);
    col += mix(boneTint.rgb, tint.rgb, 0.30) * glowSpine * (0.95 + 0.5 * pulse);
    cov += glowSpine * 0.45;

    // Shared head orb. The 1/r falloff is multiplied by a smoothstep that
    // reaches zero well inside the frame, so it pools instead of washing.
    float hdst = length(q - vec2(0.0, 0.305));
    float coreGlow = (0.00170 / (hdst * hdst + 0.00090)
                   + 0.0070 / (hdst + 0.014)) * smoothstep(0.150, 0.0, hdst);
    col += mix(tint.rgb, vec3(1.0), 0.25 + 0.40 * pulse) * coreGlow
         * bloom * (1.0 + 0.8 * pulse);
    cov += coreGlow * 0.70;

    // Frame guard. Everything is already inside REACH plus the stroke and its
    // 0.055 glow, about 0.45, so this only feathers the outermost tip.
    float edgeFade = smoothstep(0.478, 0.44, r);
    col *= edgeFade * (1.0 + 0.35 * pulse);

    // Coverage, then premultiply. Zero everywhere the insect is not.
    float alpha = clamp(cov * edgeFade * (1.0 + 0.25 * pulse), 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
