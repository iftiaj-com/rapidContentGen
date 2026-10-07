/*{
  "ADITS": 1,
  "DESCRIPTION": "A glossy obsidian insectoid sentinel on a segmented near-black core that never changes, its limbs each changing species on their own schedule. Each limb is one tapered spike under six interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: armour paddle, serrated limb, barbed sickle, hair needle. Bass armours the sentinel, treble strips it to needles, and the change sweeps limb by limb. Rests as the serrated limb.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-20",
  "CATEGORIES": ["generative", "morph", "creature", "dark", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "sens",     "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",     "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",     "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "scale",    "TYPE": "float", "DEFAULT": 0.90, "MIN": 0.60, "MAX": 1.15,
      "LABEL": "Overall Size", "BIND": "level", "BIND_DEPTH": 0.35 },
    { "NAME": "mass",     "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.75, "MAX": 1.5,
      "LABEL": "Body Mass", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "rimLight", "TYPE": "float", "DEFAULT": 1.1, "MIN": 0.5, "MAX": 2.2,
      "LABEL": "Rim Light", "BIND": "treble", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718

// Limb pair count and base limb reach. Both used to be sliders; the count has to
// stay constant for the angular cells to line up, and reach is now one of the
// numbers the form interpolates. Both sit at their old defaults.
#define LIMB_PAIRS 5.0
#define REACH 0.60

// How far the per-limb selector is spread across the fan. The change then
// crosses the sentinel limb by limb instead of flipping every limb at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// Polynomial smooth minimum: blends segments into one organic body.
float smin(float d1, float d2, float k) {
    float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Loop phase wraps exactly at LOOP = 12 s. Every animated rate below is
    // an integer multiple of t, so the whole design loops seamlessly. Nothing on
    // the morph path reads it: which limb is which belongs to the music.
    float ph = fract(TIME / 12.0);
    float t  = TAU * ph;

    // --- Selector -------------------------------------------------------------
    // Balance decides which limb; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips a limb to a needle, a kick armours it into a paddle.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // Slow rocking precession (one and two cycles per loop) plus a gentle bob.
    float sway = 0.14 * sin(t) + 0.045 * sin(2.0 * t + 1.3);
    float cs = cos(sway);
    float sn = sin(sway);
    vec2 qr = mat2(cs, -sn, sn, cs) * uv;
    qr.y -= 0.015 * sin(t + 2.6);
    qr /= scale;

    // Bilateral symmetry: everything below is built in one mirrored half.
    vec2 q = vec2(abs(qr.x), qr.y);

    // Largest radius in q space that still lands inside the frame once the
    // scale divide above is undone. uv reaches only 0.5 on the axes, so limbs
    // and the tail are clamped to this rather than trusting slider ranges.
    float fit = 0.46 / scale;

    // Breathing: the body thickens and the limbs extend a few percent.
    float breath = 1.0 + 0.035 * sin(2.0 * t);
    float mb = mass * breath;

    // ---- Dense segmented core: the shared part, five smin-blended segments ----
    float dc = length(vec2(q.x, q.y - 0.315)) - 0.075 * mb;
    dc = smin(dc, length(vec2(q.x, q.y - 0.175)) - 0.105 * mb, 0.035);
    dc = smin(dc, length(vec2(q.x, q.y - 0.010)) - 0.130 * mb, 0.035);
    dc = smin(dc, length(vec2(q.x, q.y + 0.165)) - 0.105 * mb, 0.035);
    dc = smin(dc, length(vec2(q.x, q.y + 0.300)) - 0.075 * mb, 0.035);

    // ---- Serrated limbs: angular repetition in the mirrored half, no loop ----
    float r   = length(q);
    float ang = atan(q.y, q.x);
    float nL  = LIMB_PAIRS;
    float a0  = -1.25;
    float stepA = 2.55 / nL;
    float fi  = clamp(floor((ang - a0) / stepA), 0.0, nL - 1.0);
    float da  = ang - (a0 + (fi + 0.5) * stepA);

    // Per-limb selector. fi runs across the fan, so it doubles as the sweep
    // coordinate; the hash keeps that sweep from looking mechanical. Both are
    // static, so at a fixed spectrum the sentinel holds still: the wave is
    // positioned by the music, never by the clock.
    float uL = fi / max(nL - 1.0, 1.0);
    float jt = hash11(fi * 4.31 + 1.7);
    float xj = clamp(x0 + STAGGER * (0.66 * (uL - 0.5) + 0.34 * (jt - 0.5)), 0.0, 3.0);

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

    // Parameter-space morph. One tapered spike, six interpolated numbers, so the
    // silhouette deforms and no fragment ever shows two forms at half alpha.
    //             paddle     limb       sickle     needle
    float rchM = 0.72 * w0 + 1.00 * w1 + 1.10 * w2 + 1.18 * w3;   // reach
    float wM   = 2.00 * w0 + 1.00 * w1 + 0.58 * w2 + 0.24 * w3;   // gauge
    float tprM = 0.55 * w0 + 1.00 * w1 + 1.30 * w2 + 1.85 * w3;   // taper
    float serD = 0.10 * w0 + 0.28 * w1 + 0.50 * w2 + 0.06 * w3;   // serration
    float serF = 24.0 * w0 + 52.0 * w1 + 80.0 * w2 + 130.0 * w3;  // tooth pitch
    float bndM = 0.40 * w0 + 1.00 * w1 + 1.85 * w2 + 0.35 * w3;   // limb bend

    // Per-limb reach variation, breathing extension, and the kick recoil that
    // used to be a negative bind on the reach slider.
    float reachK = REACH * rchM * (0.82 + 0.18 * cos(fi * 2.1 + 0.5));
    reachK *= 1.0 + 0.04 * sin(2.0 * t + fi * 1.8);
    reachK *= 1.0 - 0.30 * snap * AUDIO_KICK;
    // The fit clamp is what keeps even the longest form inside the frame.
    reachK = min(reachK, fit);

    // Static per-limb bend plus a slow wave travelling through the limbs.
    float daW = da + 0.26 * bndM * (r - 0.15) * sin(fi * 2.6 + 0.8);
    daW += 0.03 * sin(3.0 * t + fi * 2.2) * smoothstep(0.12, 0.45, r);

    // Tapered spike with serration teeth along its length.
    float tt = clamp(r / reachK, 0.0, 1.0);
    float wL = 0.058 * mb * wM * pow(1.0 - tt, tprM);
    wL *= (1.0 - serD) + serD * cos(r * serF + fi);
    float dLimb = max(r * abs(sin(daW)) - wL, r - reachK);

    // ---- Tail stinger: the shared part, which never changes species ----
    float along = -q.y - 0.30;
    float tl  = 0.26 * (1.0 + 0.04 * sin(2.0 * t + 0.9));
    tl = clamp(tl, 0.05, max(fit - 0.30, 0.05));
    float ttt = clamp(along / tl, 0.0, 1.0);
    float wT  = 0.050 * mb * (1.0 - ttt) * (0.74 + 0.26 * cos(along * 48.0));
    float dT  = max(q.x - wT, along - tl);
    dT = max(dT, -along - 0.06);

    // Union of core, limbs and tail.
    float d = smin(dc, dLimb, 0.03);
    d = smin(d, dT, 0.03);

    // ---- Obsidian shading: near-black body, thin cool specular rim ----
    float bodyMask = smoothstep(0.007, -0.007, d);
    float rimBand  = 1.0 - smoothstep(0.0, 0.016, abs(d));
    rimBand *= rimBand;
    float aFull   = atan(qr.y, qr.x);
    float shimmer = 0.70 + 0.30 * sin(6.0 * aFull - 2.0 * t);
    float rim = rimBand * rimLight * shimmer;

    vec3 obsidian = vec3(0.022, 0.026, 0.034);
    vec3 sheenCol = vec3(0.16, 0.20, 0.28);
    float sheen = exp(min(d, 0.0) * 20.0);
    float seams = smoothstep(0.35, 1.0, cos(q.y * 40.0)) * smoothstep(0.02, -0.04, dc);
    vec3 bodyCol = obsidian + sheenCol * (sheen * 0.26 + seams * 0.18);

    // Two small eye glints on the head, confined to the body.
    vec2 eq = q - vec2(0.030, 0.335);
    float ed  = dot(eq, eq);
    float eye = 0.00045 / (ed + 0.00030) * smoothstep(0.0045, 0.0, ed);
    eye *= smoothstep(0.015, -0.010, d);

    // Whisper of cool halo just outside the edge, bounded twice: to 0.10 from
    // the surface, and again in frame space so it fades out before the border
    // instead of being cut by it.
    float dOut = max(d, 0.0);
    float halo = exp(-dOut * 34.0) * smoothstep(0.10, 0.0, dOut) * (1.0 - bodyMask);
    halo *= smoothstep(0.49, 0.40, length(uv));

    vec3 rimCol = vec3(0.90, 0.95, 1.00);
    vec3 col = bodyCol * bodyMask
             + rimCol * rim
             + vec3(0.70, 0.88, 1.00) * eye
             + rimCol * halo * 0.08;

    // Coverage: solid interior, soft edge, faint bounded halo. Premultiply.
    float alpha = clamp(bodyMask + rim * 0.85 + eye * 0.5 + halo * 0.22, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
