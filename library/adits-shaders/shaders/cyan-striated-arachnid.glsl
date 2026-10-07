/*{
  "ADITS": 1,
  "DESCRIPTION": "A bioluminescent arachnid over a core starburst that never changes, wearing five mirrored leg pairs that each change species on their own schedule. Each leg is one blade under eight interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: armour paddle, striated blade, barbed claw, hair needle. Bass armours the legs, treble strips them to needles, and the change sweeps head to tail one pair at a time. Two legs in five stay dark. Rests as the striated blade.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "neon", "creature", "bioluminescent", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach", "TYPE": "float", "DEFAULT": 0.310, "MIN": 0.240, "MAX": 0.330,
      "LABEL": "Leg Reach", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "bio",   "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Bio Glow", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "barbs", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Edge Barbs", "BIND": "treble", "BIND_DEPTH": 0.50 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// Leg half-width at the socket, in uv units, before the morph scales it.
#define LEG 0.034

// Base strand count across a blade. It used to be a slider; strand pitch is now
// one of the numbers the form interpolates, because four fat strands and twenty
// hair ones are two different limbs.
#define STRANDS 9.0

// How far the per-leg selector is spread from head to tail. The change then
// crosses the creature as a wave instead of flipping all five pairs at once.
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
    // creature crawls seamlessly on a 20 s cycle. Nothing on the morph path
    // reads it: which leg is which belongs to the music, not to the clock.
    float ph = fract(TIME / 20.0);

    // Bilateral mirror, exactly as the reference sits.
    vec2  p = vec2(abs(uv.x), uv.y);
    float r = length(uv);

    float breath = sin(ph * TAU);
    float swing  = sin(ph * TAU * 2.0);
    float drift  = ph * 3.0;
    float span   = reach * (1.0 + 0.050 * breath);

    // --- Selector -------------------------------------------------------------
    // Balance decides which leg; loudness only decides how hard it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips a leg to a needle, a kick armours it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the kick
    // that armours a leg also flares the starburst under it.
    float flareF = 0.34 + 1.05 * snap * AUDIO_KICK;

    float bodyC = 0.0;   // dark silhouette coverage
    float litC  = 0.0;   // glowing strand coverage
    float rimC  = 0.0;   // leg rim
    float hotC  = 0.0;   // white-hot filament cores
    float barbC = 0.0;   // edge barbs

    // Five leg pairs. Constant bound, cheap body: this is why COST is "low", and
    // the morph adds eight multiply-adds rather than a second creature.
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float u  = fi * 0.25;
        float hv = hash11(fi * 5.31 + 3.7);

        // Per-leg selector. u already runs head to tail, so it doubles as the
        // sweep coordinate; the hash keeps that sweep from looking mechanical.
        // Both are static, so at a fixed spectrum the creature holds still: the
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

        // Parameter-space morph. One blade primitive, eight interpolated numbers,
        // so the silhouette deforms and no fragment shows two forms at half alpha.
        //              paddle     blade      claw       needle
        float lenM = 0.68 * w0 + 1.00 * w1 + 1.05 * w2 + 1.10 * w3;  // reach
        float wM   = 2.00 * w0 + 1.00 * w1 + 0.60 * w2 + 0.26 * w3;  // chord
        float tpr  = 0.55 * w0 + 1.00 * w1 + 1.25 * w2 + 1.75 * w3;  // taper
        float bowM = 0.45 * w0 + 1.00 * w1 + 1.65 * w2 + 0.35 * w3;  // bow
        float strM = 0.45 * w0 + 1.00 * w1 + 1.30 * w2 + 2.10 * w3;  // strands
        float bbz  = 0.05 * w0 + 0.50 * w1 + 1.00 * w2 + 0.12 * w3;  // barb flare
        float bfr  = 7.00 * w0 + 13.0 * w1 + 18.0 * w2 + 30.0 * w3;  // barb pitch
        float glw  = 0.55 * w0 + 1.00 * w1 + 0.85 * w2 + 1.45 * w3;  // emission

        vec2  base = vec2(0.014 + 0.012 * u, mix(0.140, -0.140, u));
        float ang  = mix(1.30, -1.24, u) + 0.13 * swing * sin(fi * 2.7 + 0.4);
        vec2  dir  = vec2(cos(ang), sin(ang));
        vec2  q    = p - base;
        float al   = dot(q, dir);
        float pe   = dot(q, vec2(-dir.y, dir.x));

        // Signed bow, so the upper legs arch over and the lower ones rake down.
        pe -= mix(-1.45, 1.60, u) * bowM * al * al;

        float L   = span * (0.76 + 0.30 * hv) * lenM;
        float an  = al / max(L, 1e-4);
        float ape = abs(pe);

        // Blade envelope, tapering to a point. The strands are normalised to it,
        // which is what makes them converge at the tip instead of running
        // parallel off the end.
        float tap = pow(clamp(1.0 - an, 0.0, 1.0), tpr);
        float env = LEG * wM * tap * (0.32 + 0.92 * smoothstep(0.0, 0.22, an));

        // Barbs flaring the edge into spines.
        float bt = fract(an * bfr - drift * 2.0 + hv);
        float bf = smoothstep(0.60, 0.96, bt) * smoothstep(1.08, 0.88, bt);
        float envB = env * (1.0 + (0.30 + 0.90 * barbs) * bbz * 2.0 * bf);

        float onL = step(0.0, an) * (1.0 - smoothstep(0.965, 1.02, an))
                  * smoothstep(0.008, 0.032, al);
        float mask = (1.0 - smoothstep(envB - 0.0018, envB + 0.0018, ape)) * onL;

        // Lengthwise strands. sn is the position across the blade in units of its
        // own half-width, so one strand is one cell of it at every radius. The
        // count is a linear cross-blade coordinate rather than an angle, so a
        // fractional count leaves no wrap seam and needs no rounding.
        float scn = STRANDS * strM;
        float sn = pe / max(env, 0.0012);
        float sk = sn * scn;
        float sh = hash11(floor(sk) * 1.87 + fi * 9.1);
        float st = abs(fract(sk) - 0.5);
        // Screen width of a strand cell, used so the line stays a hair wide.
        float sw = env / max(scn, 1.0);
        float strand = (1.0 - smoothstep(0.30 * sw, 0.30 * sw + 0.0013, st * 2.0 * sw))
                     * mask * (0.24 + 0.90 * sh);

        // Two legs in five stay dark and carry only a rim, exactly as the
        // reference mixes lit limbs with silhouetted ones.
        float litLeg = step(0.46, hv);

        float rimL = (1.0 - smoothstep(0.0010, 0.0038, abs(ape - envB))) * onL;
        float hot  = strand * smoothstep(0.55, 0.98, sh) * smoothstep(0.06, 0.42, an);

        // Bounded glow hugging the blade. This is the bloom a bioluminescent limb
        // has in the reference, and it is tied to the limb so it can never creep
        // out into a frame-wide haze.
        float halo = (1.0 - smoothstep(env * 0.6, env * 3.0, ape)) * onL;

        bodyC += mask * (1.0 - 0.62 * litLeg);
        litC  += (strand * litLeg + halo * litLeg * 0.30) * glw;
        rimC  += rimL;
        hotC  += hot * litLeg * glw;
        barbC += bf * mask * bbz;
    }

    // --- Shared core ----------------------------------------------------------
    // Dense hair-thin rays under the body, plus a hot nucleus. None of it changes
    // species; it is what holds the middle of the frame together while the legs
    // turn over.
    float ath = atan(uv.y, uv.x);
    float rk  = (ath + ph * TAU) * (44.0 / TAU);
    float rsd = abs(fract(rk) - 0.5) * (TAU / 44.0) * r;
    float rlen = 0.075 + 0.19 * flareF;
    float rays = (1.0 - smoothstep(0.0014, 0.0032, rsd))
               * (1.0 - smoothstep(rlen * 0.30, rlen, r))
               * smoothstep(0.004, 0.020, r);
    float core = (0.0016 / (dot(uv, uv) + 0.0018)) * (1.0 - smoothstep(0.015, 0.115, r));
    // A solid nucleus. Without it the exact centre is a hole: the leg sockets
    // are gated out there and the rays start further out, so nothing else
    // carries alpha at r = 0.
    float nuc = 1.0 - smoothstep(0.013, 0.022, r);

    // Palette: electric cyan over a near-black chitin.
    vec3 elec = vec3(0.10, 0.62, 1.00);
    vec3 hotc = vec3(0.72, 0.95, 1.00);
    vec3 dark = vec3(0.016, 0.038, 0.058);

    vec3 col = dark * min(bodyC, 2.0) * 1.30
             + elec * min(litC, 2.5) * (0.85 + 1.10 * bio)
             + mix(dark, elec, 0.75) * min(rimC, 2.0) * (0.22 + 0.40 * bio)
             + hotc * min(hotC, 2.0) * (0.80 + 1.20 * bio)
             + mix(dark, elec, 0.55) * min(barbC, 1.5) * 0.85
             + elec * min(rays, 1.5) * (0.70 + 1.20 * flareF)
             + hotc * core * (0.60 + 0.90 * flareF)
             + hotc * nuc * 0.95;

    // Soft knee: ten legs and forty-four rays converge on the nucleus.
    col = col / (1.0 + col * 0.30);

    // Radial safety bound. The needle form is the longest, at 0.330 * 1.05 breath
    // * 1.06 hash * 1.10 length from a socket 0.14 off centre, which is what the
    // old Leg Reach ceiling already reached; this fade feathers the tips exactly
    // as it did before rather than slicing them.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (min(bodyC, 1.0) * 1.00 + min(litC, 1.0) * 0.90
                 + min(rimC, 1.0) * 0.70 + min(hotC, 1.0) * 0.50
                 + min(rays, 1.0) * 0.80 + core * 0.50 + nuc * 1.00) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
