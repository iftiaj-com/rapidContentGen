/*{
  "ADITS": 1,
  "DESCRIPTION": "A hovering bioluminescent ribcage of neon arcs in cyan and violet, hung on a spine that never changes, its seven rib pairs each changing species on their own schedule. Each rib is one two-segment bone under six interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: heavy plate rib, neon rib, hooked barb, hair filament. Bass plates the cage, treble strips it to filaments. Rests as the neon rib.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "neon", "skeletal", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "scale",   "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.20, "MAX": 0.42,
      "LABEL": "Cage Size", "BIND": "level", "BIND_DEPTH": 0.35 },
    { "NAME": "swell",   "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.10, "MAX": 0.80,
      "LABEL": "Breath Swell", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "impulse", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.50,
      "LABEL": "Nerve Impulses", "BIND": "treble", "BIND_DEPTH": 0.60 }
  ]
}*/

#define TAU 6.28318530718

// Base rib spread and palette offset. Both used to be sliders; the six-slot
// budget went to the morph controls instead, and these are their old defaults.
// Spread is now scaled by the form rather than by hand.
#define SPREAD 0.65
#define HUE_SHIFT 0.0

// How far the per-rib selector is spread from the top of the cage to the
// bottom. The change then crosses it rib by rib instead of flipping all seven.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

vec3 neonPal(float t) {
    t = fract(t);
    vec3 col1 = vec3(0.0, 0.9, 1.0); // Cyan
    vec3 col2 = vec3(0.5, 0.1, 1.0); // Violet
    vec3 col3 = vec3(0.9, 0.1, 0.8); // Magenta

    if (t < 0.5) return mix(col1, col2, smoothstep(0.0, 0.5, t));
    return mix(col2, col1, smoothstep(0.5, 1.0, t));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Nothing on the morph path reads this: which rib is which belongs to the
    // music, not to the clock.
    float ph = fract(TIME / 16.0);
    float t = TAU * ph;

    // --- Selector -------------------------------------------------------------
    // Balance decides which rib; loudness only decides how hard it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips a rib to a filament, a kick plates it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the hat
    // that sharpens a rib also fires its nerve impulses.
    float hatF = 1.0 + 1.4 * snap * AUDIO_HAT;

    // Precession & sway (integer multiples of loop phase)
    float sway = 0.08 * sin(t) + 0.03 * sin(2.0 * t + 1.5);
    float cs = cos(sway), sn = sin(sway);
    vec2 qr = mat2(cs, -sn, sn, cs) * uv;

    // Slow bobbing
    qr.y += 0.02 * sin(t + 3.0);

    // Limit maximum reach so ribs don't hit the uv bounding box (0.5)
    float fit = 0.46 / scale;

    // Bilateral symmetry
    vec2 q = vec2(abs(qr.x), qr.y) / scale;

    // Spine: the shared part, which never changes species.
    float sdSpine = sdCapsule(q, vec2(0.0, 0.8), vec2(0.0, -0.8), 0.015);
    // Ridges on spine
    sdSpine -= 0.003 * sin(q.y * 80.0);

    float dRibs = 1e5;
    float sparks = 0.0;

    // 7 rib pairs, each on its own schedule
    for (int i = 0; i < 7; i++) {
        float fi = float(i);
        float tRib = fi / 6.0;
        float jt = hash11(fi * 3.71 + 2.9);

        // Per-rib selector. tRib already runs top to bottom, so it doubles as the
        // sweep coordinate; the hash keeps that sweep from looking mechanical.
        // Both are static, so at a fixed spectrum the cage holds still.
        float xj = clamp(x0 + STAGGER * (0.66 * (tRib - 0.5) + 0.34 * (jt - 0.5)),
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

        // Parameter-space morph. One two-segment bone, six interpolated numbers,
        // so the rib deforms and no fragment ever shows two forms at half alpha.
        //             plate      rib        barb       filament
        float wM   = 0.78 * w0 + 1.00 * w1 + 1.08 * w2 + 1.15 * w3;   // spread
        float t1M  = 2.40 * w0 + 1.00 * w1 + 0.70 * w2 + 0.35 * w3;   // upper gauge
        float t2M  = 2.60 * w0 + 1.00 * w1 + 0.65 * w2 + 0.30 * w3;   // lower gauge
        float elbM = 0.35 * w0 + 1.00 * w1 + 1.90 * w2 + 0.30 * w3;   // elbow bend
        float drpM = 0.55 * w0 + 1.00 * w1 + 1.35 * w2 + 1.65 * w3;   // tip drop
        float spkM = 0.60 * w0 + 1.00 * w1 + 1.30 * w2 + 1.75 * w3;   // impulses

        // y position of this rib's root
        float yCenter = mix(0.7, -0.65, tRib);

        // Rib lateral spread
        float w = sin(tRib * 3.14159) * SPREAD * wM;
        // Breathing swell + audio bind
        w *= 0.85 + swell * 0.3 * sin(2.0 * t - fi * 0.7);
        // Ensure ribs never exceed the fit boundary. This cap is what keeps the
        // longest form inside the frame without a separate bound on wM.
        w = min(w, fit - 0.05);

        // Dynamic elbow motion
        float elbowY = yCenter + 0.15 * elbM * cos(fi * 1.3 + t);

        vec2 p0 = vec2(0.0, yCenter); // attaches to spine
        vec2 p1 = vec2(w * 0.55, elbowY); // elbow joint
        vec2 p2 = vec2(w, yCenter - 0.18 * drpM - 0.05 * sin(t+fi)); // tip

        // Tapering thickness
        float d1 = sdCapsule(q, p0, p1, 0.010 * t1M);
        float d2 = sdCapsule(q, p1, p2, 0.006 * t2M);
        float dRib = min(d1, d2);

        dRibs = smin(dRibs, dRib, 0.04);

        // Travelling impulses along the ribs
        // phase wraps tightly; we use fract to make sparks travel down the ribs
        // impulse bind controls brightness
        float sparkPhase = fract(ph * 4.0 - tRib * 1.5);
        vec2 pSpark = p1;
        float distToSpark = length(q - pSpark);
        sparks += 0.002 / (distToSpark * distToSpark + 0.001) * impulse * spkM * hatF
                * smoothstep(0.1, 0.0, dRib);
    }

    float d = smin(sdSpine, dRibs, 0.03);

    // Main surface mask
    float bodyMask = smoothstep(0.006, -0.006, d);

    // Hollow inner glow - darker core, bright edges
    float edge = smoothstep(0.0, -0.006, d) - smoothstep(-0.006, -0.012, d);

    // Confined ambient glow
    float dOut = max(d, 0.0);
    float glowMask = exp(-dOut * 28.0) * smoothstep(0.12, 0.0, dOut);

    // Absolute bounds check on glow to prevent alpha leaks at screen edge
    glowMask *= smoothstep(0.48, 0.42, length(uv));

    // Base color from vertical position and hue shift
    vec3 baseCol = neonPal(q.y * 0.3 + 0.5 + HUE_SHIFT + 0.2 * sin(t));
    vec3 edgeCol = neonPal(q.y * 0.3 + 0.2 + HUE_SHIFT + 0.2 * sin(t));
    vec3 sparkCol = vec3(0.9, 1.0, 1.0);

    // Core structure color
    vec3 col = baseCol * bodyMask * 0.6;
    col += edgeCol * edge * 1.5;

    // Add external glow
    col += baseCol * glowMask * 0.8;

    // Add sparks
    // restrict sparks spatially so they don't light up the whole frame
    float sparkMask = smoothstep(0.2, 0.0, dOut) * smoothstep(0.48, 0.42, length(uv));
    col += sparkCol * sparks * sparkMask;

    // Premultiply and clamp alpha
    float alpha = clamp(bodyMask + glowMask * 0.7 + sparks * sparkMask * 0.4, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
