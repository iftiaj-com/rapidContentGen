/*{
  "ADITS": 1,
  "DESCRIPTION": "An acid urchin caged in three glossy tube hoops, cage and membrane unchanging, wearing twenty spines that each change species on their own schedule. Each is one primitive under nine interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: blunt club, ribbed speckled spine, barbed hook, white-hot hair quill. Bass clubs the fringe, treble draws it to needles, and the change sweeps across the shell one spine at a time. Rests as the ribbed spine.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "neon", "armillary", "urchin", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach",  "TYPE": "float", "DEFAULT": 0.300, "MIN": 0.230, "MAX": 0.350,
      "LABEL": "Spine Reach", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "hoops",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Hoop Glow", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "hueOff", "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Hue Offset" }
  ]
}*/

#define TAU 6.28318530718

// Spine half-width at the shell, in uv units.
#define SPINE 0.030

// How far the per-spine selector is spread around the ring. The change then
// crosses the shell as a wave instead of flipping all twenty spines at once.
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

vec3 pal(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}

vec2 rot2(vec2 v, float a) {
    float s = sin(a), c = cos(a);
    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the shell
    // and the hoops wrap seamlessly on a 24 s cycle. Nothing on the morph path
    // reads this: the identity of a spine belongs to the music, not to the clock.
    float ph = fract(TIME / 24.0);

    float r = length(uv);
    float a = atan(uv.y, uv.x);          // one atan for the frame, none in a loop

    float turn   = ph * TAU;
    float breath = 1.0 + 0.045 * sin(ph * TAU * 2.0);
    float creep  = ph * 3.0;
    float span   = reach * breath;

    // Hue precesses once per loop, and shifts with the view so orbiting sweeps it.
    float hue0 = ph + hueOff + 0.26 * (1.0 - CAM_DIR.z);

    // --- Selector -------------------------------------------------------------
    // Balance decides which spine; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws the fringe out to needles, a kick clubs it back to armour.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // One transient control drives the light as well as the geometry: the hat
    // that sharpens a spine also lights its edge.
    float beat = 1.0 + 1.4 * snap * AUDIO_BEAT;
    float hatF = 1.0 + 1.6 * snap * AUDIO_HAT;

    // --- Morphing fringe: twenty spines ----------------------------------------
    const float SPINES = 20.0;
    float sk  = (a + turn) * (SPINES / TAU);
    float sid = mod(floor(sk), SPINES);
    float cf  = fract(sk) - 0.5;
    float sp  = cf * (TAU / SPINES) * r;      // signed distance from the centreline

    float hv  = hash11(sid * 2.71 + 1.3);

    // Per-spine selector. The cosine term makes the change sweep across the shell
    // and, unlike a linear index ramp, it is continuous where the ring wraps, so
    // spine 19 and spine 0 stay neighbours. The hash keeps the sweep from looking
    // mechanical. Both are static, so at a fixed spectrum the urchin holds still.
    float u  = 0.5 - 0.5 * cos(sid * (TAU / SPINES));
    float xj = clamp(sel * 3.0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (hv - 0.5)),
                     0.0, 3.0);

    // Triangular weights of slope 1.85. Support is 1/1.85 either side of a centre
    // and the centres are spaced 1.0, so neighbours overlap over 2/1.85 - 1 = 0.081
    // of the axis and the sum is never zero. The slope must stay below 2.0 or the
    // normalisation divides by nothing. Each spine therefore snaps between forms
    // while the fringe as a whole turns over gradually.
    float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One spine primitive, nine interpolated numbers, so
    // the silhouette deforms and no fragment ever shows two forms at half alpha.
    //            club       spine      hook       quill
    float lenM = 0.62 * w0 + 1.00 * w1 + 1.08 * w2 + 1.15 * w3;
    float wM   = 1.85 * w0 + 1.00 * w1 + 0.62 * w2 + 0.22 * w3;
    float tp   = 0.55 * w0 + 1.00 * w1 + 1.25 * w2 + 1.75 * w3;   // tip taper
    float bd   = 0.03 * w0 + 0.06 * w1 - 0.34 * w2 + 0.02 * w3;   // sickle bend
    float sr   = 0.00 * w0 + 0.10 * w1 + 0.60 * w2 + 0.00 * w3;   // serration
    float rbf  = 13.0 * w0 + 26.0 * w1 + 20.0 * w2 + 44.0 * w3;   // rib pitch
    float spk  = 0.20 * w0 + 0.70 * w1 + 0.40 * w2 + 1.00 * w3;   // speckle
    float wht  = 0.06 * w0 + 0.12 * w1 + 0.30 * w2 + 0.58 * w3;   // acid to white
    float hsh  = 0.00 * w0 + 0.12 * w1 + 0.30 * w2 + 0.52 * w3;   // palette shift

    // The length spread is narrower than the archetype spread, so the longest
    // form on the longest spine is what bounds the object rather than the hash.
    float L   = span * (0.66 + 0.40 * hv) * lenM;
    float t   = r / max(L, 1e-4);
    float tap = clamp(1.0 - t, 0.0, 1.0);
    float env = SPINE * wM * pow(tap, tp)
              * (0.22 + 0.80 * smoothstep(0.0, 0.16, t)) * (0.65 + 0.60 * hv);
    env *= 1.0 - sr * 0.55 * fract(t * 7.0);      // forward-raked teeth
    float sd = abs(sp - bd * t * t * L);          // bend the centreline, not the edge

    float onS  = smoothstep(0.010, 0.030, r) * (1.0 - smoothstep(0.965, 1.015, t));
    float body = (1.0 - smoothstep(env, env + 0.0018, sd)) * onS;
    // Hot leading edge on both flanks of every spine.
    float edge = (1.0 - smoothstep(0.0008, 0.0028, abs(sd - env))) * onS;

    // Cross-ribs, which is what gives every spine its ladder texture. The pitch
    // is one of the morphed numbers, so a club is coarsely banded and a quill is
    // finely combed.
    float rib  = fract(t * rbf - creep);
    float ribL = (1.0 - smoothstep(0.10, 0.30, abs(rib - 0.5))) * body;

    // Speckle: a jittered grid of bright motes along the spine, exactly the
    // dotted texture the reference spines carry.
    float sn = (sd / max(env, 0.0012)) * sign(cf);
    vec2  gi = floor(vec2(t * 46.0, sn * 3.0)) + vec2(sid * 17.0, 0.0);
    float k1 = hash21(gi);
    float k2 = hash21(gi + 23.7);
    vec2  gf = fract(vec2(t * 46.0, sn * 3.0)) - 0.5 - (vec2(k1, k2) - 0.5) * 0.55;
    float mote = (1.0 - smoothstep(0.16, 0.30, length(gf * vec2(1.0, 0.62))))
               * body * step(0.42, k2) * (0.25 + 1.10 * k1);

    // Hair-thin whisker running out past each spine. It belongs to the drawn-out
    // forms, so it fades away as the fringe clubs up.
    float whisk = (1.0 - smoothstep(0.0012, 0.0030, sd))
                * smoothstep(0.96, 1.02, t)
                * (1.0 - smoothstep(1.16 + 0.14 * hv, 1.32 + 0.14 * hv, t))
                * (0.20 + 0.80 * spk);

    // --- Shared core: membrane, hoops, nucleus ---------------------------------
    // None of this morphs. Only the fringe does, and the core is what holds the
    // middle of the frame together while it turns over.
    float mR   = span * 0.46;
    float memb = (1.0 - smoothstep(mR * 0.82, mR, r)) * smoothstep(0.020, 0.040, r);
    vec2  mgi  = floor(vec2(r * 22.0, (a + turn) * (14.0 / TAU)));
    float mh   = hash21(mgi + 5.3);
    vec2  mgf  = fract(vec2(r * 22.0, (a + turn) * (14.0 / TAU))) - 0.5;
    float hole = 1.0 - smoothstep(0.20, 0.36, length(mgf * vec2(1.0, 1.5))) * step(0.45, mh);
    memb *= 1.0 - (1.0 - hole);
    float membR = (1.0 - smoothstep(0.0018, 0.0040, abs(r - mR * 0.90)))
                * smoothstep(0.020, 0.040, r);

    // Three glossy tube hoops.
    float tubeC = 0.0;
    float tubeG = 0.0;
    vec3  tubeCol = vec3(0.0);
    for (int j = 0; j < 3; j++) {
        float fj = float(j);
        float A  = 0.325 + 0.032 * fj;
        float spin = ph * TAU * (fj < 1.5 ? 1.0 : -1.0) + fj * 1.05;
        float sq   = 0.20 + 0.80 * abs(sin(ph * TAU * (1.0 + fj) + fj * 2.1));
        sq = max(sq, 0.18);

        vec2  e = rot2(uv, -spin);
        vec2  g = vec2(e.x, e.y / sq);
        float d = abs(length(g) - A);
        float tw = 0.0072 - 0.0012 * fj;

        float tube = 1.0 - smoothstep(tw, tw + 0.0022, d);
        float core = 1.0 - smoothstep(0.0006, tw * 0.55, d);
        // Gradient down the tube's own long axis, which is what makes one hoop
        // run green at one end and magenta at the other.
        vec3  hc = pal(hue0 + 0.55 * (e.x / A) + fj * 0.21);
        tubeCol += hc * tube * 0.85 + mix(hc, vec3(1.0), 0.65) * core * 0.90;
        tubeC += tube;
        tubeG += core;
    }

    // --- Colour ----------------------------------------------------------------
    vec3 acid = pal(hue0 + 0.08) * vec3(0.90, 1.10, 0.95);
    vec3 hot  = mix(acid, vec3(1.0, 1.0, 0.96), 0.70);
    // Each form carries its own palette as well as its own outline: the club is
    // saturated acid, the quill is white-hot.
    vec3 spineHue = mix(pal(hue0 + hsh + hv * 0.20 + t * 0.30),
                        vec3(1.0, 0.99, 0.94), wht);

    float coreG = (0.0018 / (dot(uv, uv) + 0.0022)) * (1.0 - smoothstep(0.02, 0.13, r));
    // Solid nucleus. Without it the exact centre is a hole: the spine bases are
    // gated out there and nothing else carries alpha at r = 0.
    float nuc = 1.0 - smoothstep(0.014, 0.024, r);

    vec3 col = spineHue * body * 0.85 * beat
             + hot * ribL * (0.30 + 0.55 * spk)
             + hot * min(mote, 1.5) * (0.65 + 1.15 * spk) * beat
             + mix(acid, vec3(1.0), 0.4) * whisk * 0.70
             + acid * memb * 0.55
             + hot * membR * 0.45
             + tubeCol * (0.55 + 0.95 * hoops)
             + hot * coreG * 0.85
             + hot * edge * (0.28 + 0.45 * spk) * hatF
             + vec3(1.0, 0.99, 0.96) * nuc * 0.95;

    // Soft knee: twenty spines and three hoops overlap through the shell.
    col = col / (1.0 + col * 0.30);

    // Radial safety bound. The worst case is the quill form on the longest spine
    // at the largest reach: 0.350 * 1.045 breath * 1.06 spread * 1.15 length puts
    // the tip at 0.446, so this fade only feathers the last hair of a needle and
    // never slices a spine mid-body. The whisker runs past it into empty space,
    // which is what it did before.
    float rim = 1.0 - smoothstep(0.428, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (body * 0.95 + min(mote, 1.0) * 0.60 + whisk * 0.75
                 + memb * 0.70 + membR * 0.60
                 + min(tubeC, 1.0) * 1.00 + min(tubeG, 1.0) * 0.60
                 + coreG * 0.50 + nuc * 1.00 + min(edge, 1.0) * 0.55) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
