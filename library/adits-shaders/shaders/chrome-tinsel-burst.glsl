/*{
  "ADITS": 1,
  "DESCRIPTION": "A burst of shredded foil around a dense flake ball and four armature wires, the hub unchanging, wearing eleven legs that each change species on their own schedule. Each leg is one primitive under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: broad foil paddle, tinsel leg, shredded whip, needle streamer. Bass packs the burst into paddles, treble shreds it to streamers, and the change sweeps leg by leg. Rests as the tinsel leg.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "chrome", "tinsel", "sparkle", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "burst",  "TYPE": "float", "DEFAULT": 0.285, "MIN": 0.230, "MAX": 0.300,
      "LABEL": "Burst Radius", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "chroma", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.02, "MAX": 1.00,
      "LABEL": "Foil Chroma", "BIND": "treble", "BIND_DEPTH": 0.45 },
    { "NAME": "spark",  "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Sparkle", "BIND": "level", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718

// Leg half-width at the hub, in uv units, before the morph scales it.
#define LEGW 0.048

// Base flake pitch. It used to be a slider; pitch is now one of the numbers the
// form interpolates, because a coarse foil paddle and a fine streamer are two
// different animals. The hub ball keeps this fixed value, since the hub is the
// part that never changes.
#define DENSITY 34.0

// How far the per-leg selector is spread around the burst. The change then
// crosses it leg by leg instead of flipping all eleven at once.
#define STAGGER 1.05

float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

vec3 pal(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the cloud
    // turns and its colour precesses seamlessly on a 20 s cycle. Nothing on the
    // morph path reads it: which leg is which belongs to the music.
    float ph = fract(TIME / 20.0);

    float r = length(uv);
    float a = atan(uv.y, uv.x);          // one atan for the frame, none in a loop

    float turn   = ph * TAU;
    float breath = 1.0 + 0.045 * sin(ph * TAU * 2.0);
    float span   = burst * breath;

    // --- Selector -------------------------------------------------------------
    // Balance decides which leg; loudness only decides how hard it sparkles.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // shreds a leg to a streamer, a kick packs it into a paddle.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // One transient control drives the light as well as the geometry: the hat
    // that shreds a leg also fires its brightest flakes.
    float hat = 1.0 + 1.5 * snap * AUDIO_HAT;

    // --- Morphing burst: eleven legs -------------------------------------------
    const float LEGS = 11.0;
    float sk  = (a + turn) * (LEGS / TAU);
    float sid = mod(floor(sk), LEGS);
    float cf  = fract(sk) - 0.5;
    float sp  = cf * (TAU / LEGS) * r;    // signed distance from the centreline

    float hv  = hash11(sid * 2.13 + 4.7);

    // Per-leg selector. The cosine term sweeps the change around the burst and,
    // unlike a linear index ramp, is continuous where the ring wraps. The hash
    // keeps that sweep from looking mechanical. Both are static, so at a fixed
    // spectrum the burst holds still: the wave is positioned by the music.
    float u  = 0.5 - 0.5 * cos(sid * (TAU / LEGS));
    float xj = clamp(sel * 3.0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (hv - 0.5)),
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

    // Parameter-space morph. One leg primitive, seven interpolated numbers, so
    // the silhouette deforms and no fragment ever shows two forms at half alpha.
    //             paddle     leg        whip       streamer
    float lm   = 0.66 * w0 + 1.00 * w1 + 1.06 * w2 + 1.12 * w3;  // reach
    float wM   = 2.10 * w0 + 1.00 * w1 + 0.58 * w2 + 0.24 * w3;  // chord
    float tpr  = 0.55 * w0 + 1.00 * w1 + 1.25 * w2 + 1.75 * w3;  // taper
    float bd   = 0.03 * w0 + 0.05 * w1 - 0.38 * w2 + 0.02 * w3;  // sweep
    float denM = 0.50 * w0 + 1.00 * w1 + 1.55 * w2 + 2.40 * w3;  // flake pitch
    float szM  = 1.55 * w0 + 1.00 * w1 + 0.80 * w2 + 0.62 * w3;  // sliver size
    float briM = 0.75 * w0 + 1.00 * w1 + 1.25 * w2 + 1.60 * w3;  // sliver flash

    // Legs hang: the ones pointing down run longer, as the reference's do. The
    // hash spread is narrower than the archetype spread, so the longest form on
    // the longest leg is what bounds the cloud rather than the hash.
    float L   = span * (0.62 + 0.42 * hv) * (1.0 - 0.22 * sin(a)) * lm;
    float t   = r / max(L, 1e-4);
    float tap = pow(clamp(1.0 - t, 0.0, 1.0), tpr);
    float env = LEGW * wM * tap * (0.30 + 0.90 * smoothstep(0.0, 0.20, t));
    float sd  = abs(sp - bd * t * t * L);        // bend the centreline

    float onL = smoothstep(0.010, 0.032, r) * (1.0 - smoothstep(0.965, 1.02, t));
    float leg  = (1.0 - smoothstep(env, env + 0.0018, sd)) * onL;

    // Flake grid, laid out along the leg and across it, so every sliver looks
    // stuck to the limb instead of floating in screen space. Pitch and sliver
    // size are two of the morphed numbers, so a paddle carries big coarse foil
    // and a streamer carries fine glitter.
    float sn = (sd / max(env, 0.0012)) * sign(cf);
    vec2  g  = vec2(t * DENSITY * denM, sn * 4.0);
    vec2  gi = floor(g) + vec2(sid * 31.0, 0.0);
    vec2  gf = fract(g) - 0.5;
    float h1 = hash21(gi);
    float h2 = hash21(gi + 41.31);
    // Each sliver is a small anisotropic quad, jittered inside its own cell.
    vec2  fp = gf - (vec2(h1, h2) - 0.5) * 0.60;
    float sz = (0.17 + 0.30 * h1) * szM;
    float fl = 1.0 - smoothstep(sz, sz + 0.13, max(abs(fp.x) * 0.75, abs(fp.y) * 1.55));
    // A cubed hash gives a few very bright slivers among many dim ones, which is
    // what makes foil read as foil rather than as noise.
    float bri = (0.12 + 2.4 * h2 * h2 * h2) * briM;
    float flake = fl * leg;

    // --- Shared core: hub flake ball and armature ------------------------------
    // Neither changes species. The hub is what holds the middle of the frame
    // together while the legs turn over.
    vec2  hg  = uv * (DENSITY * 1.9);
    vec2  hgi = floor(hg);
    vec2  hgf = fract(hg) - 0.5;
    float k1  = hash21(hgi + 7.7);
    float k2  = hash21(hgi + 91.4);
    vec2  hp  = hgf - (vec2(k1, k2) - 0.5) * 0.62;
    float hsz = 0.16 + 0.24 * k1;
    float hball = (1.0 - smoothstep(hsz, hsz + 0.14, max(abs(hp.x) * 0.85, abs(hp.y) * 1.35)))
                * (1.0 - smoothstep(span * 0.38, span * 0.78, r));
    float hbri = 0.14 + 2.2 * k2 * k2 * k2;

    float wire = 0.0;
    for (int j = 0; j < 4; j++) {
        float fj = float(j);
        float wa = fj * 0.7854 + turn * 0.5;
        vec2  wd = vec2(cos(wa), sin(wa));
        float wp = abs(dot(uv, wd.yx * vec2(-1.0, 1.0)) - 0.22 * dot(uv, wd) * dot(uv, wd));
        wire += (1.0 - smoothstep(0.0016, 0.0034, wp))
              * (1.0 - smoothstep(span * 0.80, span * 1.02, abs(dot(uv, wd))));
    }

    // --- Colour ----------------------------------------------------------------
    // Silver by default; chroma opens each sliver onto its own hue, which is how
    // the reference cycles from mylar to full rainbow without changing shape.
    vec3 silver = vec3(0.82, 0.86, 0.94);
    vec3 hueL = mix(silver, pal(ph + h1 * 0.42 + 0.22 * (1.0 - CAM_DIR.z)), chroma);
    vec3 hueH = mix(silver, pal(ph + k1 * 0.42 + 0.35), chroma);

    vec3 col = hueL * flake * bri * (0.70 + 1.15 * spark) * hat
             + hueH * hball * hbri * (0.70 + 1.15 * spark) * hat
             + vec3(0.075, 0.080, 0.095) * min(wire, 2.0) * 1.15
             + silver * min(wire, 2.0) * 0.09;

    // Soft knee: the brightest slivers stack and would clip to a flat white patch.
    col = col / (1.0 + col * 0.26);

    // Radial safety bound. The worst case is the streamer form on the longest
    // downward leg at the largest burst radius: 0.300 * 1.045 breath * 1.04
    // spread * 1.22 hang * 1.12 length puts the tip at 0.454, so this fade only
    // feathers the last of a streamer and never slices a leg mid-body.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (flake * (0.35 + 0.80 * min(bri, 1.4))
                 + hball * (0.35 + 0.80 * min(hbri, 1.4))
                 + min(wire, 1.0) * 0.95) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
