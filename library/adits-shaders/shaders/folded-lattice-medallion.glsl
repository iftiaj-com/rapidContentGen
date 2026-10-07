/*{
  "ADITS": 1,
  "DESCRIPTION": "A crystal medallion whose rim and inner folded web both change species under spectral balance. Five KIFS folds draw the lattice inside one six-lobed envelope of five interpolated numbers, so the medallion morphs by deforming, not cross-fading, through four forms: filled ice plate, lobed wire lattice, scalloped spiral rotor, six-ray needle star. Bass breathes the folds, mid twists the web into a vortex, treble hones every filament. Rests as the lobed wire lattice.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "geometry", "fractal", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "sens", "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest", "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "fold", "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.18, "MAX": 0.44,
      "LABEL": "Fold Offset", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "warp", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Vortex Twist", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "edge", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Edge Sharpness", "BIND": "treble", "BIND_DEPTH": 0.6 },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [0.20, 0.60, 1.00, 1.00],
      "LABEL": "Lattice Colour" },
    { "NAME": "rimTint", "TYPE": "color", "DEFAULT": [0.95, 0.55, 1.00, 1.00],
      "LABEL": "Rim Colour" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 12.0

// Six-fold envelope. An integer, or the seam at the angular wrap opens.
#define LOBES 6.0

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Phase wraps exactly at LOOP = 12 s: one turn of the lattice per loop.
    float ph = fract(TIME / PERIOD);
    float a = TAU * ph;

    float r = length(uv);
    float ang = atan(uv.y, uv.x);        // computed once, never in the loop

    // --- Selector -------------------------------------------------------------
    // Balance decides which medallion this is; loudness only decides how hard
    // it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;             // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than
    // any one band. Expanded around the rest point, or the outer forms never
    // arrive and the morph fails silently.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // hones the medallion to a needle star, a kick packs it back to a plate.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to the chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x = sel * 3.0;

    // Triangular weights of slope 1.85. Support is 1/1.85 either side of a
    // centre and the centres are spaced 1.0, so neighbours overlap over
    // 2/1.85 - 1 = 0.081 of the axis and the sum is never zero. The slope must
    // stay below 2.0 or the normalisation divides by nothing.
    float w0 = max(1.0 - abs(x      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(x - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(x - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(x - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One folded field inside one envelope, nine
    // interpolated numbers, so the medallion deforms and no fragment ever
    // shows two forms at half alpha.
    //              plate     lattice   spiral    star
    float envR   = 0.320 * w0 + 0.350 * w1 + 0.380 * w2 + 0.408 * w3;
    float lobeA  = 0.100 * w0 + 0.300 * w1 + 0.450 * w2 + 0.780 * w3;
    float lobeP  = 1.000 * w0 + 2.000 * w1 + 3.000 * w2 + 9.000 * w3;
    float foldO  = 0.420 * w0 + 0.300 * w1 + 0.245 * w2 + 0.170 * w3;
    float scaleK = 1.120 * w0 + 1.200 * w1 + 1.260 * w2 + 1.320 * w3;
    float rotS   = 0.200 * w0 + 0.785 * w1 + 1.300 * w2 + 0.420 * w3;
    float epsM   = 3.200 * w0 + 1.000 * w1 + 0.800 * w2 + 0.350 * w3;
    float glowM  = 1.500 * w0 + 1.000 * w1 + 0.950 * w2 + 0.800 * w3;
    // Interior fill: the plate is a solid slab of ice, the star is pure wire.
    float fillM  = 1.000 * w0 + 0.380 * w1 + 0.240 * w2 + 0.080 * w3;
    // Envelope sweep: only the rotor form skews its lobes, which is what makes
    // it a pinwheel rather than a second lobed medallion.
    float swirlM = 0.000 * w0 + 0.000 * w1 + 1.700 * w2 + 0.000 * w3;

    // One transient control drives the light as well as the geometry: the kick
    // that packs the medallion also flashes it. AUDIO_KICK already decays, so
    // it is used straight and the floor keeps the lattice lit in silence.
    float pop = 1.0 + snap * AUDIO_KICK * 1.4;

    // --- Envelope: the silhouette, independent of the fold parameters --------
    // Bounded by construction. The widest reachable rim is envR at the star,
    // 0.408, plus the 0.022 rim band, so nothing is drawn past 0.43.
    float lob = pow(abs(cos((ang + swirlM * r / max(envR, 0.001)) * LOBES * 0.5)),
                    lobeP);
    float rim = envR * (1.0 - lobeA + lobeA * lob);
    float inside = smoothstep(rim, rim - 0.040, r);
    float rimGlow = smoothstep(0.022, 0.0, abs(r - rim));

    // --- Lattice: the interior structure ------------------------------------
    // Mid twists the web into a vortex while the rim stays put, so the object
    // deforms rather than merely widening.
    float tw = warp * 1.30 * (r / max(envR, 0.001));
    vec2 p = rot(tw) * uv / max(envR, 0.001);

    // Bass breathes the fold offset around its archetype value.
    float foldAmt = foldO * (fold / 0.30);

    // Edge tightness: a smaller epsilon is a thinner, brighter filament.
    float eps = mix(0.0090, 0.0018, edge) * epsM;

    vec3 col = vec3(0.0);
    float cov = 0.0;

    // Five folds. Constant bound, no raymarch, so COST stays low. The
    // cumulative scale is tracked so every strut is divided back into screen
    // units and the deep iterations stay filaments instead of turning to
    // speckle.
    float sc = 1.0;
    for (int i = 0; i < 5; i++) {
        float fi = float(i);

        p = abs(p) - foldAmt;
        p *= rot(a + fi * rotS);
        p = p * scaleK;
        sc *= scaleK;

        // Two struts and one ring per fold, so the lattice is drawn in lines
        // rather than in points.
        float d = min(min(abs(p.x), abs(p.y)), abs(length(p) - 0.62)) / sc;

        // Filament glow, bounded twice: by eps at the core and by the
        // envelope at the rim. Nothing survives outside the medallion.
        float glow = 0.0030 * glowM / (d + eps) * inside;

        vec3 gCol = mix(tint.rgb, rimTint.rgb, fi * 0.20);
        col += gCol * glow;
        cov += glow * 0.42;
    }

    // Interior fill, so the plate form reads as a slab and not as a cage.
    float glowFill = fillM * inside * (0.34 + 0.30 * lob);
    col += mix(tint.rgb, vec3(1.0), 0.22) * glowFill * 0.75;
    cov += glowFill * 0.70;

    // Rim light. Radially symmetric, so it survives the plane tilting, and
    // brightest at the lobe tips so it reads as a crystal edge and not as an
    // even outline.
    col += rimTint.rgb * rimGlow * (0.80 + 0.55 * lob) * (1.10 + 0.60 * pop);
    cov += rimGlow * 0.85;

    // A second, thinner girdle inside the rim: the medallion's shoulder.
    float ringGlow = smoothstep(0.008, 0.0, abs(r - rim * 0.84)) * inside;
    col += mix(rimTint.rgb, vec3(1.0), 0.35) * ringGlow * 0.90;
    cov += ringGlow * 0.55;

    col *= pop;
    cov *= pop;

    // Coverage, then premultiply. Zero everywhere the medallion is not.
    float alpha = clamp(cov, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
