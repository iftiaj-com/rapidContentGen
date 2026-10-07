/*{
  "ADITS": 1,
  "DESCRIPTION": "A wet black lacquer coral: a knot of glossy orbs and two amber lanterns, unchanging, crossed by six arms that each change species on their own schedule. Each arm is one primitive under eight interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: fat bead club, segmented lacquer arm, barbed whip, hair antenna. Bass swells the arms into clubs, treble draws them out to antennae, and the change sweeps arm by arm. Rests as the segmented arm.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "obsidian", "lacquer", "creature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 22.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach",   "TYPE": "float", "DEFAULT": 0.305, "MIN": 0.240, "MAX": 0.325,
      "LABEL": "Arm Reach", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "wet",     "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Wet Gloss", "BIND": "treble", "BIND_DEPTH": 0.50 },
    { "NAME": "lantern", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Lantern Glow", "BIND": "level", "BIND_DEPTH": 0.45 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// Arm half-width at the knot, in uv units, before the morph scales it.
#define ARM 0.030

// How far the per-arm selector is spread around the coral. The change then
// crosses it arm by arm instead of flipping all six at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// One glossy orb. The highlight sits on the side facing the knot, which is
// radially symmetric across the whole object, so it survives the plane rotating
// instead of reading as a baked key light.
//   x body, y rim, z highlight
vec3 orb(vec2 p, vec2 c, float rad) {
    float d  = length(p - c);
    vec2  hc = c * (1.0 - 0.46 * rad / max(length(c), 0.02));
    float dh = length(p - hc);
    return vec3(1.0 - smoothstep(rad, rad + 0.0022, d),
                1.0 - smoothstep(0.0014, 0.0044, abs(d - rad)),
                (1.0 - smoothstep(rad * 0.14, rad * 0.42, dh)));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the coral
    // turns and breathes seamlessly on a 22 s cycle. Nothing on the morph path
    // reads it: which arm is which belongs to the music, not to the clock.
    float ph = fract(TIME / 22.0);

    float r = length(uv);

    float turn   = ph * TAU;                             // one slow turn per loop
    float breath = 1.0 + 0.048 * sin(ph * TAU * 2.0);
    float wob    = sin(ph * TAU * 3.0);
    float drift  = ph * 2.0;
    float span   = reach * breath;

    // --- Selector -------------------------------------------------------------
    // Balance decides which arm; loudness only decides how wet it looks.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws an arm out to an antenna, a kick swells it into a club.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the hat
    // that pricks a whisker also lights its barbs.
    float hatF = 1.0 + 1.5 * snap * AUDIO_HAT;

    // Shared continuous parameter: the knot itself keeps sliding across the whole
    // selector range, so the envelope is visibly moving even at a 50/50 blend.
    float knotM = mix(1.12, 0.88, sel) * breath;

    float bodyC = 0.0;   // opaque silhouette
    float glosC = 0.0;   // warm bead highlights
    float rimC  = 0.0;   // wet edge
    float whisC = 0.0;   // whiskers
    float barbC = 0.0;   // whisker barbs

    // Six arms crossing through the knot. Constant bound, cheap body: this is why
    // COST is "low", and the morph adds eight multiply-adds rather than a body.
    for (int i = 0; i < 6; i++) {
        float fi = float(i);
        float hv = hash11(fi * 2.71 + 1.4);

        // Per-arm selector. The cosine term sweeps the change around the coral
        // and, unlike a linear index ramp, is continuous where the ring of arms
        // wraps. The hash keeps that sweep from looking mechanical. Both are
        // static, so at a fixed spectrum the coral holds still.
        float u  = 0.5 - 0.5 * cos(fi * (TAU / 6.0));
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

        // Parameter-space morph. One arm primitive, eight interpolated numbers,
        // so the silhouette deforms and no fragment shows two forms at half alpha.
        //              club       arm        whip       antenna
        float lenM = 0.64 * w0 + 1.00 * w1 + 1.08 * w2 + 1.16 * w3;  // reach
        float wM   = 1.95 * w0 + 1.00 * w1 + 0.58 * w2 + 0.24 * w3;  // gauge
        float tpr  = 0.55 * w0 + 1.00 * w1 + 1.25 * w2 + 1.70 * w3;  // taper
        float bcw  = 4.00 * w0 + 8.00 * w1 + 14.0 * w2 + 26.0 * w3;  // segments
        float lobD = 0.72 * w0 + 0.50 * w1 + 0.30 * w2 + 0.06 * w3;  // bead pinch
        float swp  = 0.45 * w0 + 1.00 * w1 + 1.75 * w2 + 0.30 * w3;  // sweep
        float bbz  = 0.10 * w0 + 0.45 * w1 + 1.00 * w2 + 0.15 * w3;  // barb size
        float whM  = 0.25 * w0 + 1.00 * w1 + 1.30 * w2 + 1.55 * w3;  // whisker

        float ang = fi * (TAU / 6.0) + turn + 0.16 * wob * sin(fi * 1.9);
        vec2  dir = vec2(cos(ang), sin(ang));
        float al  = dot(uv, dir);
        float pe  = dot(uv, vec2(-dir.y, dir.x));
        // A gentle sweep, so an arm curves like a limb rather than a spoke.
        pe -= (0.85 + 0.70 * hv) * swp * al * al * sign(hv - 0.5);

        // The hash spread is narrower than the archetype spread, so the longest
        // form on the longest arm is what bounds the coral rather than the hash.
        float L   = span * (0.90 + 0.22 * hv) * lenM;
        float an  = al / L;
        float ape = abs(pe);
        float tap = pow(clamp(1.0 - an, 0.0, 1.0), tpr);

        // Bead chain. sin(PI * bc) pinches the width to zero between segments,
        // which is what makes an arm read as stacked lacquer beads. The pinch
        // depth is one of the morphed numbers, so the antenna form runs smooth.
        // an is a linear coordinate along the arm rather than an angle, so a
        // fractional segment count leaves no wrap seam and needs no rounding.
        float bc  = fract(an * bcw - drift);
        float bh  = hash11(floor(an * bcw - drift) * 1.63 + fi * 5.9);
        float lob = sin(PI * clamp(bc, 0.0, 1.0));
        float w   = ARM * wM * tap * ((1.0 - lobD) * 0.68 + lobD * 1.60 * lob)
                  * (0.74 + 0.52 * bh);

        float onA = step(0.0, an) * (1.0 - smoothstep(0.965, 1.02, an))
                  * smoothstep(0.010, 0.034, al);
        float m    = (1.0 - smoothstep(w - 0.0018, w + 0.0018, ape)) * onA;

        // Wet rim along both edges of every bead.
        float rm = (1.0 - smoothstep(0.0012, 0.0042, abs(ape - w))) * onA;
        // Warm highlight pooling on the outward end of each bead, plus a tight
        // chip where the bead is fattest.
        float gl = (smoothstep(0.35, 0.92, bc) * smoothstep(0.55, 1.00, lob)
                  * (1.0 - smoothstep(0.10 * w, 0.62 * w, ape))) * onA;
        float chip = smoothstep(0.88, 1.00, lob)
                   * (1.0 - smoothstep(0.0, 0.30 * w, ape)) * onA;

        // Barbed whisker trailing past the tip.
        float ww = 0.0016 * (1.0 - 0.5 * clamp(an - 1.0, 0.0, 1.0));
        float wt = fract(an * 26.0 - drift * 3.0);
        float wb = smoothstep(0.68, 0.98, wt) * smoothstep(1.06, 0.90, wt);
        float wwB = ww * (1.0 + (1.6 + 5.0 * bbz) * wb);
        float wh = (1.0 - smoothstep(wwB, wwB + 0.0014, ape))
                 * smoothstep(0.96, 1.04, an)
                 * (1.0 - smoothstep(1.24 + 0.16 * hv, 1.40 + 0.16 * hv, an))
                 * whM;

        bodyC = max(bodyC, m);
        rimC += rm;
        glosC += gl + chip * 1.4;
        whisC += wh;
        barbC += wb * wh * (0.25 + 0.60 * bbz);
    }

    // --- Shared core: the knot -------------------------------------------------
    // Glossy orbs knotted through the middle, and two amber lanterns among them.
    // None of this changes species; it is what holds the middle of the frame
    // together while the arms turn over.
    vec3 o1 = orb(uv, vec2(0.088, 0.052) * knotM, 0.052 * knotM);
    vec3 o2 = orb(uv, vec2(-0.070, 0.078) * knotM, 0.043 * knotM);
    vec3 o3 = orb(uv, vec2(-0.030, -0.092) * knotM, 0.058 * knotM);
    vec3 o4 = orb(uv, vec2(0.078, -0.058) * knotM, 0.038 * knotM);

    float orbB = max(max(o1.x, o2.x), max(o3.x, o4.x));
    float orbR = o1.y + o2.y + o3.y + o4.y;
    float orbH = o1.z + o2.z + o3.z + o4.z;

    // Lanterns: small warm lenses inside the knot, each breathing on its own rate.
    float dl1 = length(uv - vec2(0.020, 0.132) * knotM);
    float dl2 = length(uv - vec2(-0.118, -0.026) * knotM);
    float lan = (1.0 - smoothstep(0.010, 0.030, dl1)) * (0.62 + 0.38 * sin(ph * TAU * 2.0))
              + (1.0 - smoothstep(0.008, 0.026, dl2)) * (0.62 + 0.38 * sin(ph * TAU * 3.0 + 2.1));
    // Bounded halo: it pools on the lanterns and reaches zero well inside the frame.
    float halo = (0.0009 / (dl1 * dl1 + 0.0016) + 0.0007 / (dl2 * dl2 + 0.0014))
               * (1.0 - smoothstep(0.06, 0.20, r));

    // Palette: wet near-black, lamp-warm specular, amber lantern.
    vec3 lacq  = vec3(0.040, 0.040, 0.046);
    vec3 warm  = vec3(1.00, 0.86, 0.62);
    vec3 amber = vec3(1.00, 0.58, 0.16);

    vec3 col = lacq * (bodyC * 1.25 + orbB * 1.45 + whisC * 1.10)
             + warm * min(rimC, 2.0) * (0.16 + 0.30 * wet)
             + warm * min(glosC, 2.0) * (0.30 + 0.60 * wet)
             + warm * min(orbH, 2.0) * (0.45 + 0.75 * wet)
             + warm * min(orbR, 2.0) * 0.22
             + warm * min(barbC, 1.5) * 0.85 * hatF
             + amber * min(lan, 2.0) * (1.25 * lantern)
             + amber * halo * (1.45 * lantern);

    // Soft knee: six arms and four orbs pile up in the knot.
    col = col / (1.0 + col * 0.28);

    // Radial safety bound. The worst case is the antenna form on the longest arm
    // at the largest reach: 0.325 * 1.048 breath * 1.12 spread * 1.16 length puts
    // the tip at 0.443, so this fade only feathers the last of an antenna. The
    // whisker runs past it into empty space, which is what it did before.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (bodyC * 1.00 + orbB * 1.00 + min(whisC, 1.0) * 0.90
                 + min(rimC, 1.0) * 0.70 + min(orbR, 1.0) * 0.70
                 + min(lan, 1.0) * 0.85 + min(halo, 1.0) * 0.30) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
