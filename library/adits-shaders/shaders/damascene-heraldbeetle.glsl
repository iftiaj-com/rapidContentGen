/*{
  "ADITS": 1,
  "DESCRIPTION": "A heraldic beetle forged in damascus steel, its marbled carapace and lens plates unchanging, wearing five leg pairs that each change species on their own schedule. Each leg is one primitive under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: armour plate, segmented leg, barbed claw, wire feeler. Bass armours the legs, treble strips them to feelers, and the change sweeps head to tail one pair at a time. Rests as the segmented leg.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "chrome", "damascene", "creature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 22.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "legs",   "TYPE": "float", "DEFAULT": 0.300, "MIN": 0.240, "MAX": 0.320,
      "LABEL": "Leg Reach", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "polish", "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Chrome Polish", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "fringe", "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.02, "MAX": 1.00,
      "LABEL": "Chroma Fringe", "BIND": "treble", "BIND_DEPTH": 0.45 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// Marble grain. It used to be a slider; the carapace is now the part of the
// beetle that never changes species, so its grain is fixed at the old default.
#define GRAIN 44.0

// How far the per-leg selector is spread from head to tail. The change then
// crosses the beetle as a wave instead of flipping all five pairs at once.
#define STAGGER 1.05

const vec3 CH = vec3(-1.0, 0.0, 1.0);

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the beetle
    // and its pattern wrap seamlessly on a 22 s cycle. Nothing on the morph path
    // reads it: which leg is which belongs to the music, not to the clock.
    float ph = fract(TIME / 22.0);

    // Bilateral mirror. The marble is warped in mirrored space too, so the pattern
    // matches across the midline the way the reference's does.
    vec2  p = vec2(abs(uv.x), uv.y);
    float r = length(uv);

    float breath = sin(ph * TAU);
    float wob    = sin(ph * TAU * 2.0);
    float drift  = ph * 3.0;
    float span   = legs * (1.0 + 0.045 * breath);

    // --- Damascus marble ------------------------------------------------------
    // Two warp passes, then a hard threshold. Pattern welding is exactly this: a
    // folded stripe field cut flat, so a soft gradient would read as plastic.
    vec2 w = p * GRAIN;
    w += 0.55 * sin(w.yx * 1.7 + ph * TAU);
    w += 0.30 * sin(w.yx * 3.1 - ph * TAU * 2.0);
    w += 0.16 * sin(w.yx * 6.3 + ph * TAU * 3.0);
    float mv = sin(w.x * 1.6 + w.y * 0.9);
    float fr = 0.015 + 0.115 * fringe;
    vec3  marble = smoothstep(vec3(-0.16), vec3(0.16), vec3(mv) + CH * fr);

    // --- Selector -------------------------------------------------------------
    // Balance decides which leg; loudness only decides how polished it looks.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips a leg to a feeler, a kick armours it into a plate.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // --- Carapace: the shared core --------------------------------------------
    // Neither the shell nor the lens stack changes species; they are what hold
    // the middle of the frame together while the legs turn over.
    float by = (uv.y + 0.205) / 0.445;            // 0 at the tail, 1 over the head
    float bw = 0.118 * pow(max(sin(PI * clamp(by, 0.0, 1.0)), 0.0), 0.55)
             * (0.85 + 0.30 * by);
    float bLive = step(0.0, by) * (1.0 - step(1.0, by));
    float body  = (1.0 - smoothstep(bw - 0.0020, bw + 0.0020, p.x)) * bLive;
    float bRim  = (1.0 - smoothstep(0.0012, 0.0044, abs(p.x - bw))) * bLive;
    // A raised keel down the midline, which is what gives the shell its ridge.
    float keel  = (1.0 - smoothstep(0.0, 0.014, p.x)) * bLive;

    // --- Morphing legs --------------------------------------------------------
    float legB = 0.0;
    float legR = 0.0;
    float knuck = 0.0;
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float u  = fi * 0.25;
        float hv = hash11(fi * 3.91 + 2.3);

        // Per-leg selector. u already runs head to tail, so it doubles as the
        // sweep coordinate; the hash keeps that sweep from looking mechanical.
        // Both are static, so at a fixed spectrum the beetle holds still: the
        // wave is positioned by the music, never by the clock.
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

        // Parameter-space morph. One leg primitive, seven interpolated numbers,
        // so the silhouette deforms and no fragment shows two forms at half alpha.
        //              plate      leg        claw       feeler
        float lenM = 0.70 * w0 + 1.00 * w1 + 1.04 * w2 + 1.09 * w3;  // reach
        float wM   = 2.30 * w0 + 1.00 * w1 + 0.62 * w2 + 0.30 * w3;  // gauge
        float tpr  = 1.20 * w0 + 2.00 * w1 + 2.50 * w2 + 3.40 * w3;  // taper
        float bowM = 0.40 * w0 + 1.00 * w1 + 1.70 * w2 + 0.30 * w3;  // bow
        float bfr  = 6.00 * w0 + 12.0 * w1 + 18.0 * w2 + 30.0 * w3;  // barb pitch
        float bbz  = 0.10 * w0 + 1.00 * w1 + 1.85 * w2 + 0.05 * w3;  // barb size
        float jkz  = 2.40 * w0 + 1.00 * w1 + 0.70 * w2 + 0.05 * w3;  // knuckle size

        float ang = mix(0.52, -0.68, u) + 0.075 * wob * sin(fi * 2.1 + 0.6);
        vec2  dir = vec2(cos(ang), sin(ang));
        vec2  q   = p - vec2(0.030 + 0.020 * u, mix(0.150, -0.140, u));
        float al  = dot(q, dir);
        float pe  = dot(q, vec2(-dir.y, dir.x)) - mix(-0.85, 1.15, u) * bowM * al * al;

        float L   = span * (0.86 + 0.26 * hv) * lenM;
        float an  = al / max(L, 1e-4);
        float tap = pow(clamp(1.0 - an, 0.0, 1.0), tpr);
        float ape = abs(pe);

        // Segment barbs and two heavier knuckles per leg. Both sizes and the barb
        // pitch are morphed, which is what turns a plated limb into a bare wire.
        float bt = fract(an * bfr - drift + hv);
        float bb = smoothstep(0.62, 0.96, bt) * smoothstep(1.08, 0.90, bt);
        float jt = fract(an * 2.2 + 0.2);
        float jj = smoothstep(0.72, 0.98, jt) * smoothstep(1.06, 0.92, jt);
        float lw = (0.0016 + 0.0090 * tap) * wM
                 * (1.0 + 1.10 * bbz * bb + 2.30 * jkz * jj);

        float onL = step(0.0, an) * (1.0 - smoothstep(0.965, 1.02, an))
                  * smoothstep(0.006, 0.026, al);
        legB += (1.0 - smoothstep(lw, lw + 0.0016, ape)) * onL;
        legR += (1.0 - smoothstep(0.0008, 0.0030, abs(ape - lw))) * onL;
        knuck += jj * jkz * (1.0 - smoothstep(lw, lw + 0.0016, ape)) * onL;
    }

    // --- Lens plate stack over the head ---------------------------------------
    float plate = 0.0;
    float plateR = 0.0;
    for (int j = 0; j < 3; j++) {
        float fj = float(j);
        float py = 0.288 + 0.042 * fj + 0.006 * wob;
        float pw = 0.056 - 0.014 * fj;
        float d  = length(vec2(p.x / pw, (uv.y - py) / (0.0135 - 0.0028 * fj)));
        plate  += 1.0 - smoothstep(0.98, 1.03, d);
        plateR += 1.0 - smoothstep(0.0, 0.10, abs(d - 1.0));
    }

    // --- Metal ----------------------------------------------------------------
    vec3 silver = vec3(0.88, 0.90, 0.95);
    vec3 ink    = vec3(0.026, 0.028, 0.036);
    float shellM = min(body + min(legB, 1.0) + min(plate, 1.0), 1.0);

    // The marble decides, per channel, whether this patch of metal is bright or
    // dark; the disagreement between the three cuts is the chroma fringe.
    vec3 metal = mix(ink, silver, marble.g) * (0.55 + 0.85 * polish);
    vec3 chrom = (marble - vec3(marble.g)) * (0.35 + 0.85 * fringe);

    // One transient control drives the light as well as the geometry. AUDIO_SNARE
    // already decays, so it is used straight and the 1.0 floor keeps the edges
    // lit in silence.
    float snare = 1.0 + 1.5 * snap * AUDIO_SNARE;

    vec3 col = metal * shellM
             + chrom * shellM * 0.85
             + silver * bRim * (0.42 + 0.50 * polish) * snare
             + silver * min(legR, 2.0) * (0.30 + 0.42 * polish) * snare
             + silver * keel * (0.28 + 0.40 * polish)
             + silver * min(knuck, 1.5) * 0.30
             + silver * min(plateR, 2.0) * 0.35;

    // Soft knee: five legs and a keel overlap on the thorax.
    col = col / (1.0 + col * 0.24);

    // Radial safety bound. The feeler form is the longest, at 0.320 * 1.045
    // breath * 1.12 hash * 1.09 length from a socket 0.15 off centre, which is
    // what the old Leg Reach ceiling already reached; this fade feathers the tips
    // exactly as it did before rather than slicing them.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (shellM * 1.00 + bRim * 0.70 + min(legR, 1.0) * 0.60
                 + min(plateR, 1.0) * 0.45) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
