/*{
  "ADITS": 1,
  "DESCRIPTION": "A crystalline moth in anaglyph, thorax and hair antennae unchanging, wearing seven mirrored blades that each change species on their own schedule. Each is one primitive under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four crystal forms: broad plated scale, swept serrated wing, bowed comb sickle, glass needle. Bass plates the moth, treble strips it to needles, and the change sweeps wingtip to hip one blade at a time. Rests as the swept wing.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "chroma-split", "iridescent", "creature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 18.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach", "TYPE": "float", "DEFAULT": 0.285, "MIN": 0.225, "MAX": 0.305,
      "LABEL": "Wing Reach", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "iris",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Iridescence", "BIND": "treble", "BIND_DEPTH": 0.50 },
    { "NAME": "split", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Anaglyph Split", "BIND": "mid", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718

// Base plate pitch along a blade, before the morph scales it. It used to be a
// slider; plate pitch is now one of the numbers the form interpolates, because
// a coarse plate and a fine comb are two different animals.
#define PLATES 24.0

// How far the per-blade selector is spread from wingtip to hip. The change then
// crosses the moth as a wave instead of flipping all seven blades at once.
#define STAGGER 1.05

// r shifts one way, b the other. The green channel is the true position.
const vec3 CH = vec3(-1.0, 0.0, 1.0);

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

float lobe(float x) {
    float f = clamp(1.0 - abs(fract(x) - 0.5) * 2.55, 0.0, 1.0);
    return f * f * (3.0 - 2.0 * f);
}

vec3 filmHue(float t) {
    return vec3(lobe(t), lobe(t + 0.3333), lobe(t + 0.6667));
}

// Blade geometry per index: x angle, y length, z width, w bow. Written as a
// branch chain rather than an array because GLSL ES 1.00 has no aggregate
// initialisers, and every pixel takes the same branch so nothing diverges.
vec4 bladeSpec(int i) {
    if (i == 0) return vec4( 0.66, 1.10, 0.92, -1.25);   // long upper wing
    if (i == 1) return vec4( 0.38, 0.94, 0.70, -0.95);   // second wing
    if (i == 2) return vec4(-0.16, 0.60, 0.62,  0.35);   // shoulder frond
    if (i == 3) return vec4(-0.50, 0.72, 0.66,  0.80);
    if (i == 4) return vec4(-0.86, 0.66, 0.58,  1.10);
    if (i == 5) return vec4(-1.18, 0.56, 0.50,  1.30);
    return vec4(-1.45, 0.44, 0.44, 1.45);                // hip frond
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the moth
    // wraps seamlessly on an 18 s cycle. Nothing on the morph path reads it:
    // which blade is which belongs to the music, not to the clock.
    float ph = fract(TIME / 18.0);

    // Bilateral mirror, exactly as the reference sits against the sky.
    vec2  p = vec2(abs(uv.x), uv.y);
    float r = length(uv);

    float breath = sin(ph * TAU);
    float wob    = sin(ph * TAU * 2.0);
    float drift  = ph * 3.0;
    float span   = reach * (1.0 + 0.050 * breath);

    // Channel offset in uv, and the film's channel phase offset. The first makes
    // the red and cyan edges; the second makes the plates iridescent.
    float shift = 0.0014 + 0.0055 * split;
    float disp  = 0.05 + 0.24 * iris;
    float sat   = 0.20 + 0.80 * iris;

    // --- Selector -------------------------------------------------------------
    // Balance decides which blade; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips the moth to needles, a kick plates it back into scales.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the kick
    // that plates a blade also flares the thorax behind it.
    float flareF = 0.32 + 1.05 * snap * AUDIO_KICK;
    float hatF   = 1.0 + 1.4 * snap * AUDIO_HAT;

    vec3  cov  = vec3(0.0);   // per-channel coverage: this carries the anaglyph
    vec3  col  = vec3(0.0);
    float lum  = 0.0;         // crest luminance, for the white-hot plates

    // Seven blades, mirrored to fourteen. Constant bound, cheap body: COST "low".
    for (int i = 0; i < 7; i++) {
        vec4  spec = bladeSpec(i);
        float fi   = float(i);
        float hv   = hash11(fi * 4.13 + 1.9);

        // Per-blade selector. The index term makes the change sweep from wingtip
        // to hip; the hash keeps that sweep from looking mechanical. Both are
        // static, so at a fixed spectrum the moth holds still: the wave is
        // positioned by the music, never by the clock.
        float u  = fi / 6.0;
        float xj = clamp(x0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (hv - 0.5)),
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

        // Parameter-space morph. One blade primitive, seven interpolated numbers,
        // so the silhouette deforms and no fragment shows two forms at half alpha.
        //             scale      wing       sickle     needle
        float lm  = 0.66 * w0 + 1.00 * w1 + 1.08 * w2 + 1.18 * w3;  // reach
        float wm  = 2.05 * w0 + 1.00 * w1 + 0.66 * w2 + 0.26 * w3;  // chord
        float tp  = 0.55 * w0 + 1.00 * w1 + 1.20 * w2 + 1.70 * w3;  // taper
        float bwm = 0.35 * w0 + 1.00 * w1 + 1.85 * w2 + 0.30 * w3;  // bow
        float plm = 0.55 * w0 + 1.00 * w1 + 0.80 * w2 + 1.85 * w3;  // plate pitch
        float swg = 0.16 * w0 + 0.46 * w1 + 0.72 * w2 + 0.10 * w3;  // comb depth
        float wht = 0.05 * w0 + 0.15 * w1 + 0.28 * w2 + 0.62 * w3;  // film to glass

        float ang = spec.x + 0.085 * wob * sin(fi * 2.3 + 0.5);
        vec2  dir = vec2(cos(ang), sin(ang));
        vec2  q   = p - vec2(0.012 + 0.008 * fi, 0.010 - 0.022 * fi);
        float al  = dot(q, dir);
        float pe  = dot(q, vec2(-dir.y, dir.x)) - spec.w * bwm * al * al;

        // The hash spread is narrower than the archetype spread, so the longest
        // form on the longest blade is what bounds the moth rather than the hash.
        float L   = span * spec.y * (0.94 + 0.10 * hv) * lm;
        float an  = al / L;

        // Blade envelope: widest a third out, tapering to a point.
        float env = pow(clamp(1.0 - an, 0.0, 1.0), tp);
        env = 0.042 * spec.z * wm * env * (0.24 + 0.98 * smoothstep(0.0, 0.24, an));

        float onB = step(0.0, an) * (1.0 - smoothstep(0.960, 1.02, an))
                  * smoothstep(0.005, 0.026, al);

        // Positional channel offset first, then the serrated plating is cut from
        // each channel's own coordinate, so the three land in different places.
        vec3 ap3 = abs(vec3(pe) - CH * shift);
        vec3 rp3 = fract(vec3(an * PLATES * plm - drift) - ap3 * 9.0 + CH * disp);
        // A shallow swing, not a deep one: swinging the plate width from a third
        // to full turns a swept blade into a row of comb fingers, which is
        // exactly what the sickle form wants and what the needle form does not.
        vec3 w3v = env * (0.87 - 0.5 * swg + swg * rp3);
        vec3 mask3 = (1.0 - smoothstep(w3v - vec3(0.0016), w3v + vec3(0.0016), ap3)) * onB;

        float chip  = 0.18 + 0.92 * smoothstep(0.05, 0.62, rp3.g);
        float crest = smoothstep(0.74, 1.00, rp3.g);

        // Thin-film hue on the plates, banded along and across the blade. Each
        // form carries its own surface as well as its own outline: the scale is
        // saturated film, the needle is near-colourless glass.
        float hueT = rp3.g * 1.15 + ap3.g * 5.0 + an * 1.20 + fi * 0.15 + ph
                   + 0.42 * dot(dir, CAM_DIR.xy);
        vec3  hue  = filmHue(hueT) * vec3(0.95, 1.15, 1.10);
        hue = mix(vec3(0.55, 0.80, 0.92), hue, sat);
        hue = mix(hue, vec3(0.92, 0.98, 1.00), wht);

        // White-hot spine down the middle of every blade.
        float spine = (1.0 - smoothstep(env * 0.10, env * 0.42, ap3.g)) * onB;
        col += hue * mask3.g * chip * 1.55
             + vec3(0.94, 1.00, 1.00) * crest * mask3.g * 0.85
             + vec3(1.00, 1.00, 0.99) * spine * 0.55 * hatF;
        cov += mask3;
        lum += crest * mask3.g;
    }

    // --- Shared core ----------------------------------------------------------
    // None of this morphs. Two vertical horns rising off the thorax, a hair
    // antenna past them, and the white-hot thorax itself: it is what holds the
    // middle of the frame together while the blades turn over.
    float hornC = 0.0;
    float antC  = 0.0;
    for (int j = 0; j < 2; j++) {
        float fj = float(j);
        float hx = 0.020 + 0.026 * fj;
        float hy = (uv.y - 0.045) / (span * (0.92 - 0.16 * fj));
        float hw = 0.0085 * (1.0 - 0.45 * fj) * clamp(1.0 - hy, 0.0, 1.0)
                 * (0.30 + 0.85 * smoothstep(0.0, 0.30, hy));
        float hd = abs(p.x - hx - 0.030 * hy * hy);
        hornC += (1.0 - smoothstep(hw, hw + 0.0018, hd))
               * step(0.0, hy) * (1.0 - smoothstep(0.96, 1.02, hy));

        float aang = 1.30 - 0.26 * fj + 0.06 * wob;
        vec2  ad = vec2(cos(aang), sin(aang));
        vec2  aq = p - vec2(0.014, 0.030);
        float aa = dot(aq, ad);
        float ap = abs(dot(aq, vec2(-ad.y, ad.x)) + 0.75 * aa * aa);
        float aL = span * (1.24 + 0.12 * fj);
        antC += (1.0 - smoothstep(0.0016, 0.0034, ap))
              * step(0.0, aa) * (1.0 - smoothstep(aL - 0.020, aL, aa));
    }

    // White-hot thorax, bounded to the middle.
    float core = (0.0020 / (dot(uv, uv) + 0.0024)) * (1.0 - smoothstep(0.02, 0.14, r)) * (0.5 + flareF);
    float nuc  = 1.0 - smoothstep(0.018, 0.030, r);

    // The disagreement between the three cuts is the anaglyph; it is added as raw
    // channel coverage, which is what puts red on one edge and cyan on the other.
    vec3 aniso = cov - vec3(cov.g);
    col += vec3(aniso.r * 1.08, aniso.g, aniso.b * 1.04) * (1.2 + 1.8 * split)
         + vec3(0.92, 1.00, 1.00) * min(lum, 2.0) * 0.50
         + mix(vec3(0.30, 0.58, 0.74), vec3(1.0), 0.35) * min(hornC, 1.5) * 1.05
         + vec3(0.90, 0.98, 1.00) * min(antC, 1.5) * 0.75
         + vec3(1.00, 0.99, 0.98) * nuc * 0.95
         + vec3(0.96, 1.00, 1.00) * core * 1.10;

    // Soft knee: fourteen blades converge on the thorax.
    col = col / (1.0 + col * 0.30);

    // Radial safety bound. The worst case is the needle form on the long upper
    // wing at the largest reach: 0.305 * 1.05 breath * 1.10 spec * 1.04 hash *
    // 1.18 length puts the tip at 0.432 from a socket 0.016 off centre, so this
    // fade only feathers the last of a needle and never slices a blade mid-body.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (min(max(cov.r, max(cov.g, cov.b)), 1.4) * 0.95
                 + min(hornC, 1.0) * 1.00 + min(antC, 1.0) * 0.85
                 + nuc * 1.00 + core * 0.45) * rim;
    alpha = smoothstep(0.020, 0.92, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
