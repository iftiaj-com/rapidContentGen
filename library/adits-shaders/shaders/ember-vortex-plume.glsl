/*{
  "ADITS": 1,
  "DESCRIPTION": "A smoke vortex: log-spiral arms wound around an ember heart that never changes, the whole body advected by a domain-warped drift that closes on the loop. One spiral field under eight interpolated numbers, so the vortex morphs by deforming, not cross-fading, through four forms: dense ember bulb, wispy smoke plume, tight whirlpool, sparse filament nova. Bass thickens it, mid twists the warp, treble raises the fine detail. Rests as the smoke plume.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "fluid", "smoke", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 14.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "density", "TYPE": "float", "DEFAULT": 0.52, "MIN": 0.30, "MAX": 0.78,
      "LABEL": "Density", "BIND": "bass", "BIND_DEPTH": -0.45 },
    { "NAME": "warp",    "TYPE": "float", "DEFAULT": 3.40, "MIN": 1.50, "MAX": 5.00,
      "LABEL": "Warp", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "detail",  "TYPE": "float", "DEFAULT": 1.80, "MIN": 1.20, "MAX": 3.00,
      "LABEL": "Detail", "BIND": "treble", "BIND_DEPTH": 0.5 },
    { "NAME": "coreCol", "TYPE": "color", "DEFAULT": [1.00, 0.92, 0.78, 1.00],
      "LABEL": "Core Colour" },
    { "NAME": "edgeCol", "TYPE": "color", "DEFAULT": [0.10, 0.72, 1.00, 1.00],
      "LABEL": "Edge Colour" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 14.0

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Fractional Brownian Motion. Four octaves, constant bound.
float fbm(vec2 p) {
    float f = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
        f += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return f;
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Phase wraps exactly at LOOP = 14 s. The old version advected the noise
    // along a straight time axis and so could not loop; here the advection
    // travels a closed circle instead, and every spiral rate is an integer
    // number of turns per loop, so the whole plume cycles.
    float ph = fract(TIME / PERIOD);
    float a = TAU * ph;

    float r = length(uv);
    float ang = atan(uv.y, uv.x);        // computed once, never in a loop

    // --- Selector -------------------------------------------------------------
    // Balance decides which vortex this is; loudness only decides how hard it
    // burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;             // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than
    // any one band. Expanded around the rest point, or the outer forms never
    // arrive and the morph fails silently.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // shreds the body to filaments, a kick packs it back to an ember bulb.
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

    // Parameter-space morph. One spiral field inside one scalloped envelope,
    // eight interpolated numbers, so the vortex deforms rather than dissolving
    // into a second copy of itself at half alpha.
    //              bulb      plume     whirl     filament
    float envR  = 0.300 * w0 + 0.340 * w1 + 0.360 * w2 + 0.380 * w3;
    float spirK = 3.200 * w0 + 5.000 * w1 + 8.500 * w2 + 2.000 * w3;
    float bandW = 0.300 * w0 + 0.450 * w1 + 0.600 * w2 + 0.780 * w3;
    float thr   = 0.340 * w0 + 0.260 * w1 + 0.180 * w2 + 0.075 * w3;
    float rough = 0.550 * w0 + 1.000 * w1 + 0.800 * w2 + 0.350 * w3;
    float hotM  = 1.550 * w0 + 1.000 * w1 + 0.900 * w2 + 0.700 * w3;
    float opacM = 1.300 * w0 + 1.000 * w1 + 0.780 * w2 + 0.480 * w3;
    float detM  = 0.650 * w0 + 1.000 * w1 + 1.250 * w2 + 1.700 * w3;
    // Density offset, edge feather and taper together decide how much of the
    // envelope each form actually fills: the bulb packs it, the nova keeps
    // only the peaks of its arms and tapers them to points.
    float densO = -0.100 * w0 + 0.000 * w1 + 0.055 * w2 + 0.170 * w3;
    float feath =  0.060 * w0 + 0.075 * w1 + 0.100 * w2 + 0.175 * w3;
    float taperM = 0.000 * w0 + 0.000 * w1 + 0.350 * w2 + 0.880 * w3;
    float litM  =  1.000 * w0 + 1.000 * w1 + 0.940 * w2 + 0.720 * w3;

    // One transient control drives the light: the beat that packs the body
    // also flares the heart. AUDIO_BEAT already decays, so it is used straight
    // and the floor keeps the ember lit in silence.
    float pulse = 0.20 + 0.80 * snap * AUDIO_BEAT;

    // --- Fluid: domain-warped advection on a closed path ---------------------
    // The offset travels a circle rather than a line, so the field returns to
    // itself at the end of the loop.
    vec2 adv = vec2(cos(a), sin(a)) * 0.62;
    vec2 sp = uv * (detail * detM * 3.4);

    vec2 q = vec2(fbm(sp + adv), fbm(sp - adv + vec2(5.2, 1.3)));
    vec2 rr = vec2(fbm(sp + warp * q + vec2(1.7, 9.2)),
                   fbm(sp + warp * q + vec2(8.3, 2.8)));
    float f = fbm(sp + warp * rr);

    // --- Structure: log-spiral arms -----------------------------------------
    // Self-similar repetition, not a noise texture, is what gives the body its
    // shape. The arm counts stay integers so the pattern closes at the angular
    // wrap; only the radial frequency interpolates.
    float lr = log(max(r, 0.02));
    float band = w0 * sin(spirK * lr -  2.0 * ang + a)
               + w1 * sin(spirK * lr -  3.0 * ang + a)
               + w2 * sin(spirK * lr -  5.0 * ang + 2.0 * a)
               + w3 * sin(spirK * lr - 13.0 * ang + a);
    band = 0.5 + 0.5 * band;

    // --- Envelope: a billowing but bounded silhouette -----------------------
    // The fbm scallops the rim, it does not set the radius, so the object can
    // never creep past 0.41 whatever the noise does.
    float rim = envR * (1.0 + rough * 0.35 * (f - 0.5));
    float body = smoothstep(rim, rim - feath, r);

    // The field the density threshold reads: fluid and structure together.
    float fld = mix(f, band, bandW);
    // The arms taper toward the rim on the forms that are meant to read as
    // separate filaments rather than as a filled body.
    float taper = mix(1.0, smoothstep(rim, rim * 0.22, r), taperM);
    float dens = smoothstep(density + densO, density + densO + thr, fld)
               * body * taper;

    // Shared ember heart. It never changes species, so something solid holds
    // the centre through every transition.
    float hd = r / 0.105;
    float coreGlow = (exp(-hd * hd * 2.6) * 0.8 + exp(-hd * hd * 11.0)) * hotM;

    // Emissive colour, brightest in the dense core. No dark base tone is mixed
    // in: a dark colour carrying alpha is what reads as a veil.
    vec3 col = mix(edgeCol.rgb, coreCol.rgb, dens * dens);
    col *= (0.55 + 1.15 * dens) * litM;
    col += coreCol.rgb * coreGlow * (1.25 + 0.85 * pulse);

    // Curl highlight along the warp gradient, already confined by body.
    float ridge = clamp(length(q) - 0.35, 0.0, 1.0) * body;
    col += coreCol.rgb * ridge * 0.45;

    // Frame guard. The widest reachable rim is 0.380 * 1.175, about 0.41, so
    // this only insures the envelope against an extreme noise excursion.
    float edgeFade = smoothstep(0.47, 0.43, r);
    col *= edgeFade;

    // Coverage, then premultiply. Zero everywhere the vortex is not.
    float alpha = clamp((dens * 1.10 * opacM + ridge * 0.35 + coreGlow * 0.85)
                        * edgeFade, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
