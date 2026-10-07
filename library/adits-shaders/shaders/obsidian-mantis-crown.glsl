/*{
  "ADITS": 1,
  "DESCRIPTION": "A wet obsidian mantis crown on a segmented spine caged by four whisker arcs, neither of which changes, wearing seven limb pairs that each change species on their own schedule. Each limb is one chain under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: armour plate, vertebra limb, barbed sickle, hair feeler. Bass armours the crown, treble strips it to feelers. Rests as the vertebra limb.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "creature", "obsidian", "dark", "audio"],
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
    { "NAME": "reach",  "TYPE": "float", "DEFAULT": 0.29, "MIN": 0.21, "MAX": 0.32,
      "LABEL": "Limb Reach", "BIND": "bass", "BIND_DEPTH": 0.42 },
    { "NAME": "rimLit", "TYPE": "float", "DEFAULT": 1.05, "MIN": 0.45, "MAX": 2.00,
      "LABEL": "Rim Light", "BIND": "treble", "BIND_DEPTH": 0.50 },
    { "NAME": "gloss",  "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Wet Gloss", "BIND": "level", "BIND_DEPTH": 0.40 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// Limb half-width at the shoulder, in uv units.
#define LIMB 0.036

// The vertebra count used to be a slider. It is now one of the numbers the form
// interpolates, because four heavy plates and twenty-six fine ones are two
// different limbs, and the slot it freed went to the morph controls.

// How far the per-limb selector is spread from the head pair to the hips. The
// change then crosses the crown as a wave instead of flipping all seven at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the
    // creature breathes seamlessly on a 24 s cycle. Nothing on the morph path
    // reads it: which limb is which belongs to the music, not to the clock.
    float ph = fract(TIME / 24.0);

    // Bilateral mirror about the vertical axis, exactly as the reference sits.
    // Everything below is drawn once and appears on both sides.
    vec2 p = vec2(abs(uv.x), uv.y);
    float r = length(uv);

    float breath = sin(ph * TAU);                  // one breath per loop
    float swing  = sin(ph * TAU * 2.0);            // two limb swings per loop
    float drift  = ph * 3.0;                       // beads creep three steps per loop

    float span = reach * (1.0 + 0.055 * breath);

    // --- Selector -------------------------------------------------------------
    // Balance decides which limb; loudness only decides how wet it looks.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips a limb to a feeler, a kick armours it into a plate.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float alive = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, alive);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the kick
    // that armours a limb also flashes the seam light out of its joints.
    float seamF = 0.30 + 1.00 * snap * AUDIO_KICK;

    float body  = 0.0;   // opaque silhouette
    float rimC  = 0.0;   // specular rim coverage
    float glosC = 0.0;   // wet highlight
    float seamC = 0.0;   // joint seam glow
    float clawC = 0.0;   // terminal claws
    float shade = 0.0;   // how lit the body is, for the near-black gradient

    // Seven limb pairs on two tiers: the even ones are the long reaching arms,
    // the odd ones are short fillers that pack the mass out so the crown reads as
    // a thicket rather than a spider on a stick. Constant bound, cheap body:
    // this is why COST is "low".
    for (int i = 0; i < 7; i++) {
        float fi = float(i);
        float u  = fi / 6.0;                        // 0 at the top pair, 1 at the hips
        float tier = mod(fi, 2.0);                  // 0 long, 1 short filler

        // Shoulder socket walking down the spine.
        vec2 base = vec2(0.022 + 0.012 * u, mix(0.250, -0.215, u));

        float hv  = hash11(fi * 3.71 + 5.3);

        // Per-limb selector. u already runs head to hips, so it doubles as the
        // sweep coordinate; the hash keeps that sweep from looking mechanical.
        // Both are static, so at a fixed spectrum the crown holds still.
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

        // Parameter-space morph. One chain primitive, seven interpolated numbers,
        // so the silhouette deforms and no fragment shows two forms at half alpha.
        //              plate      limb       sickle     feeler
        float lenM = 0.70 * w0 + 1.00 * w1 + 1.06 * w2 + 1.10 * w3;  // reach
        float wM   = 2.00 * w0 + 1.00 * w1 + 0.60 * w2 + 0.26 * w3;  // gauge
        float bcw  = 4.00 * w0 + 9.00 * w1 + 15.0 * w2 + 26.0 * w3;  // vertebrae
        float lobD = 0.72 * w0 + 0.50 * w1 + 0.34 * w2 + 0.08 * w3;  // bead pinch
        float bowM = 0.45 * w0 + 1.00 * w1 + 1.70 * w2 + 0.35 * w3;  // bow
        float bbz  = 0.15 * w0 + 1.00 * w1 + 1.85 * w2 + 0.05 * w3;  // barbs
        float clwM = 1.80 * w0 + 1.00 * w1 + 1.30 * w2 + 0.45 * w3;  // claw

        // Fan: the top pair reaches up and out, the hip pair rakes down and out.
        // Each pair swings on its own phase so the whole crown flexes.
        float ang = mix(0.78, -1.12, u) + 0.30 * tier * (0.5 - u)
                  + 0.12 * swing * sin(fi * 2.1 + 1.0);
        vec2  dir = vec2(cos(ang), sin(ang));
        vec2  q   = p - base;
        float al  = dot(q, dir);
        float pe  = dot(q, vec2(-dir.y, dir.x));

        // Signed parabolic bow: the upper arms curl up, the lower ones rake down,
        // so a limb reads as a bowed arm and never as a straight spoke.
        float bow = mix(-1.55, 2.05, u) * bowM;
        pe -= bow * al * al;

        float L   = span * (0.76 + 0.30 * hv) * (1.0 - 0.38 * tier) * lenM;
        float an  = al / L;                        // 0 at the socket, 1 at the claw
        float tap = clamp(1.0 - an, 0.0, 1.0);

        // Vertebra chain. sin(PI * bc) pinches the width to zero between beads,
        // which is what makes the limb read as stacked segments and not a tube.
        float bc  = fract(an * bcw - drift);
        float bh  = hash11(floor(an * bcw - drift) * 1.93 + fi * 7.7);
        float lob = sin(PI * clamp(bc, 0.0, 1.0));
        // Per-bead size jitter: without it the chain is a machined rack, and the
        // reference mass is anything but regular. The pinch depth is one of the
        // morphed numbers, so the feeler form runs smooth instead of segmented.
        float w   = LIMB * wM * tap * ((1.0 - lobD) * 0.60 + lobD * 1.56 * lob)
                  * (1.0 - 0.28 * tier) * (0.74 + 0.52 * bh);

        // Barbs: three per bead, flaring the outer edge into serrations.
        float br = fract(an * bcw * 3.0 - drift * 3.0);
        w *= 1.0 + 0.70 * bbz * smoothstep(0.58, 0.96, br) * smoothstep(1.08, 0.88, br);

        float ape  = abs(pe);
        float live = step(0.0, an) * (1.0 - smoothstep(0.97, 1.02, an));
        float m    = (1.0 - smoothstep(w - 0.0018, w + 0.0018, ape)) * live;

        // Rim on both edges of every bead: radially symmetric, so it survives
        // the plane rotating instead of reading as a baked key light.
        float rm = (1.0 - smoothstep(0.0012, 0.0042, abs(ape - w))) * live;

        // Wet gloss running down the crest of the chain.
        float gl = smoothstep(0.55, 1.00, lob)
                 * (1.0 - smoothstep(0.10 * w, 0.62 * w, ape)) * live;

        // The pinch between two beads is where the light inside leaks out.
        float sm = smoothstep(0.80, 1.00, 1.0 - lob)
                 * (1.0 - smoothstep(w * 0.5, w * 1.5, ape)) * live;

        // Terminal claw: a short hooked spike carrying on past the last bead.
        float cw = 0.0085 * clwM * (1.0 - smoothstep(0.97, 1.15, an));
        float cl = (1.0 - smoothstep(cw - 0.0014, cw + 0.0014, ape))
                 * smoothstep(0.93, 0.99, an) * (1.0 - smoothstep(1.10, 1.17, an));

        body  = max(body, m);
        rimC += rm;
        glosC += gl;
        seamC += sm;
        clawC = max(clawC, cl);
        // Outer beads catch more light than the ones buried in the mass.
        shade = max(shade, m * (0.30 + 0.70 * an));
    }

    // Segmented spine: a tapered spindle the limbs are socketed into.
    {
        float sy = (uv.y + 0.20) / 0.56;                       // 0 at the hips, 1 at the head
        float sw = 0.030 * (0.42 + 0.85 * sin(PI * clamp(sy, 0.0, 1.0)));
        float sb = fract(sy * 11.0 - drift);
        sw *= 0.55 + 0.60 * sin(PI * sb);
        float live = step(0.0, sy) * (1.0 - step(1.0, sy));
        float m  = (1.0 - smoothstep(sw - 0.0018, sw + 0.0018, p.x)) * live;
        float rm = (1.0 - smoothstep(0.0012, 0.0040, abs(p.x - sw))) * live;
        float sm = smoothstep(0.82, 1.00, 1.0 - sin(PI * sb))
                 * (1.0 - smoothstep(sw * 0.4, sw * 1.4, p.x)) * live;
        body  = max(body, m);
        rimC += rm;
        seamC += sm;
        shade = max(shade, m * 0.55);
    }

    // --- Shared core ----------------------------------------------------------
    // Four whisker arcs caging the mass, sweeping from the hips up over the head.
    // Neither they nor the spine changes species; they are what holds the crown
    // together while the limbs turn over.
    // Circles offset inboard, gated by height so they never close into rings.
    // Each is a black wire with its own bright edge, which is how the reference
    // arcs read against a night street: solid, not a smudge.
    float arcB = 0.0;   // wire body
    float arcR = 0.0;   // wire edge
    for (int j = 0; j < 4; j++) {
        float fj = float(j);
        float R  = span * (1.16 + 0.20 * fj) + 0.030;
        vec2  c  = vec2(-0.055 - 0.020 * fj, -0.075 + 0.030 * fj);
        float d  = abs(length(p - c) - R);
        float aw = 0.0052 - 0.0008 * fj;
        float wd = smoothstep(-0.32, -0.16, uv.y) * (1.0 - smoothstep(0.33, 0.415, uv.y))
                 * smoothstep(0.0, 0.04, p.x)
                 * (0.72 + 0.28 * sin(fj * 2.0 + ph * TAU));
        arcB += (1.0 - smoothstep(aw - 0.0013, aw + 0.0013, d)) * wd;
        arcR += (1.0 - smoothstep(0.0008, 0.0026, abs(d - aw))) * wd;
    }

    // Wet obsidian: the body is near-black on purpose, so the form is carried by
    // rims and gloss. A cool sheen gradient keeps it from going flat over night
    // footage, where a pure black silhouette would read as a hole.
    vec3 obs   = vec3(0.058, 0.062, 0.072);
    vec3 sheen = vec3(0.70, 0.80, 0.90);
    vec3 acid  = vec3(0.34, 1.00, 0.52);

    vec3 col = obs * body * (0.55 + 1.35 * shade)
             + sheen * rimC * (0.42 * rimLit)
             + vec3(0.90, 0.96, 1.00) * glosC * (0.55 * gloss)
             + acid * seamC * (0.95 * seamF)
             + sheen * clawC * (0.22 + 0.30 * rimLit)
             + obs * arcB * 1.05
             + sheen * arcR * (0.34 + 0.30 * rimLit);

    // Soft knee: five limbs and four arcs overlap near the spine and the rims
    // would otherwise clip into one white slab.
    col = col / (1.0 + col * 0.28);

    // Radial safety bound. The feeler form is the longest limb, at 0.32 reach *
    // 1.055 breath * 1.06 hash * 1.10 length, which is within a few per cent of
    // what the old Limb Reach ceiling already produced, so this fade feathers the
    // claws and the arcs exactly as it did before.
    float rim = 1.0 - smoothstep(0.430, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (body * 1.00 + min(rimC, 1.0) * 0.85 + min(seamC, 1.0) * 0.45
                 + clawC * 0.90 + min(arcB, 1.0) * 1.00
                 + min(arcR, 1.0) * 0.70) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
