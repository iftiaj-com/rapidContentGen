/*{
  "ADITS": 1,
  "DESCRIPTION": "A hollow lens filled with a halftone lattice of light dots, fringed with hair-thin rim rays and pierced by a dotted axis. The lens is one superellipse under six interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: fat caustic pod, wide astroid lens, tall spindle, four-point caustic star. Bass swells it into a flat pod, treble opens it into a four-point star, and the dot lattice turns over as a wave running outward from the hollow. Rests as the astroid lens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "halftone", "chroma-split", "lattice", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 14.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "spanX",  "TYPE": "float", "DEFAULT": 0.330, "MIN": 0.260, "MAX": 0.355,
      "LABEL": "Lens Span", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "chroma", "TYPE": "float", "DEFAULT": 0.72, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Spectrum", "BIND": "treble", "BIND_DEPTH": 0.45 },
    { "NAME": "rays",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Rim Rays", "BIND": "level", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU 6.28318530718

// How far the lattice selector is spread from the hollow outward. The dot field
// then turns over as a wave crossing the lens instead of flipping at once.
#define STAGGER 1.05

vec3 pal(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the
    // lattice drifts seamlessly on a 14 s cycle. Nothing on the morph path reads
    // it: which lens this is belongs to the music, not to the clock.
    float ph = fract(TIME / 14.0);

    float r  = length(uv);
    float r2 = dot(uv, uv);

    // --- Selector -------------------------------------------------------------
    // Balance decides which lens; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // opens the lens into a star, a kick flattens it into a pod.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the beat
    // that swells the lens also blooms its hollow.
    float bloomF = 0.32 + 1.05 * snap * AUDIO_BEAT;

    // Triangular weights of slope 1.85. Support is 1/1.85 either side of a centre
    // and the centres are spaced 1.0, so neighbours overlap over 2/1.85 - 1 = 0.081
    // of the axis and the sum is never zero. The slope must stay below 2.0 or the
    // normalisation below divides by nothing.
    float g0 = max(1.0 - abs(x0      ) * 1.85, 0.0);
    float g1 = max(1.0 - abs(x0 - 1.0) * 1.85, 0.0);
    float g2 = max(1.0 - abs(x0 - 2.0) * 1.85, 0.0);
    float g3 = max(1.0 - abs(x0 - 3.0) * 1.85, 0.0);
    float gs = g0 + g1 + g2 + g3;
    g0 /= gs; g1 /= gs; g2 /= gs; g3 /= gs;

    // Parameter-space morph of the silhouette. This object is one continuous lens
    // rather than a fringe of separate limbs, so the outline has to agree with
    // itself everywhere: these six numbers are global, and the per-element wave
    // lives in the dot lattice below, where a mismatch between neighbouring rows
    // costs a dot size rather than a torn edge.
    //             pod        lens       spindle    star
    float expo = 1.60 * g0 + 0.62 * g1 + 0.50 * g2 + 0.40 * g3;  // side curvature
    float aspB = 0.62 * g0 + 0.34 * g1 + 0.52 * g2 + 0.88 * g3;  // height
    float rgs  = 9.00 * g0 + 18.0 * g1 + 22.0 * g2 + 30.0 * g3;  // dot rings
    float colw = 24.0 * g0 + 46.0 * g1 + 56.0 * g2 + 72.0 * g3;  // dot columns
    float rayL = 0.45 * g0 + 1.00 * g1 + 1.10 * g2 + 1.20 * g3;  // rim rays
    float axD  = 22.0 * g0 + 44.0 * g1 + 56.0 * g2 + 80.0 * g3;  // axis dashes

    float A = spanX * (1.0 + 0.030 * sin(ph * TAU * 2.0));   // two breaths per loop
    float B = A * aspB;
    float drift = ph * 2.0;                                  // lattice creeps two rings

    // Superellipse metric. e = 1 is the silhouette; e < 1 is inside the lens. An
    // exponent below 1 gives concave sides and four sharp points; above 1 it
    // bulges into a pod. Either way the outline stays inside the box A by B, so
    // the morph cannot push the lens past the frame.
    vec2  s  = vec2(uv.x / A, uv.y / B);
    float e  = pow(abs(s.x) + 1e-4, expo) + pow(abs(s.y) + 1e-4, expo);
    float th = atan(s.y, s.x);            // one atan in the warped frame

    // Lattice selector. The dot field is continuous, so the wave is too: e runs
    // from the hollow outward and the jitter is a smooth function of the warped
    // angle, which means neighbouring cells never disagree by more than a hair.
    float vr  = clamp(e, 0.0, 1.0);
    float jit = 0.25 * sin(th * 3.0 + 1.1) + 0.25 * sin(th * 5.0 + 2.6);
    float xj  = clamp(x0 + STAGGER * (0.62 * (vr - 0.5) + 0.38 * jit), 0.0, 3.0);
    float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;
    //             pod        lens       spindle    star
    float dotK = 0.34 * w0 + 0.21 * w1 + 0.18 * w2 + 0.14 * w3;  // dot size
    float dotA = 1.00 * w0 + 1.00 * w1 + 1.40 * w2 + 2.00 * w3;  // dot to dash
    float briM = 0.80 * w0 + 1.00 * w1 + 1.15 * w2 + 1.40 * w3;  // dot flash

    // Halftone lattice: rows at constant e, columns at constant angle. Cells
    // stretch toward the four points, so the dots smear into dashes out there
    // exactly as they do in the reference.
    float ringF = e * rgs - drift;
    // The column count is rounded to an integer: th wraps at +-PI, and a
    // fractional count would leave one mismatched column down the seam.
    float ncol  = floor(colw + 0.5);
    float colF  = th * (ncol / TAU) + drift * 0.5;
    // Both cell axes are converted to real uv lengths before the dot is cut, so
    // the halftone stays a field of round dots instead of collapsing into radial
    // streaks wherever the metric stretches. e is homogeneous of degree EXPO,
    // which is what makes dr/de available in closed form.
    float radStep = r / (expo * max(e, 0.05) * rgs);
    float angStep = r * (TAU / ncol);
    vec2  g     = vec2((fract(ringF) - 0.5) * radStep, (fract(colF) - 0.5) * angStep);
    float dotR  = dotK * min(radStep, angStep);
    float dotm  = 1.0 - smoothstep(dotR * 0.70, dotR + 0.0011,
                                   length(vec2(g.x, g.y / dotA)));

    // Hollow middle with a bright lip, and the outer edge of the lattice.
    float band = smoothstep(0.185, 0.275, e) * (1.0 - smoothstep(0.950, 1.015, e));
    float lip  = (1.0 - smoothstep(0.0, 0.040, abs(e - 0.200)))
               * (1.0 - smoothstep(0.45, 0.70, abs(s.y)));
    float lat  = dotm * band;

    // e is homogeneous of degree EXPO, so the silhouette radius along this exact
    // direction is one pow away. That converts the astroid metric into real uv
    // distance, which is the only way to give the rim rays a constant length
    // instead of one that explodes toward the four points.
    float rs   = r * pow(max(e, 1e-4), -1.0 / expo);
    float dOut = r - rs;

    // Rim rays. Measured in true screen polar coordinates, so every ray is the
    // same hair width instead of fanning out with radius.
    float ath  = atan(uv.y, uv.x);
    float nk   = ath * (58.0 / TAU);
    float nsd  = abs(fract(nk) - 0.5) * (TAU / 58.0) * r;
    float nline = 1.0 - smoothstep(0.0012, 0.0028, nsd);
    float nreach = (0.024 + 0.058 * rays) * rayL;
    float nband  = smoothstep(-0.012, 0.002, dOut)
                 * (1.0 - smoothstep(nreach * 0.30, nreach, dOut));
    float ray    = nline * nband;

    // Dotted vertical axis running up and down through the hollow.
    float ax    = 1.0 - smoothstep(0.0022, 0.0046, abs(uv.x));
    float dash  = 1.0 - smoothstep(0.16, 0.34, abs(fract(uv.y * axD - drift * 3.0) - 0.5));
    float axis  = ax * dash * (1.0 - smoothstep(0.28, 0.435, abs(uv.y)));

    // Hollow core: a thin bright spindle, plus the bounded bloom a beat opens.
    float spin = (1.0 - smoothstep(0.0, 0.0075 * (1.0 - abs(uv.y) / (B * 1.35)), abs(uv.x)))
               * (1.0 - smoothstep(B * 0.85, B * 1.30, abs(uv.y)));
    float core = (0.0016 / (r2 + 0.0020)) * (1.0 - smoothstep(0.02, 0.16, r)) * bloomF;

    // Spectrum sweeping across the span, precessing once per loop. Desaturating
    // toward silver rather than white keeps the lattice from going pastel.
    vec3 spec = pal(0.52 * s.x + ph + 0.30 * (1.0 - CAM_DIR.z));
    vec3 hue  = mix(vec3(0.80, 0.86, 0.94), spec, chroma);

    vec3 col = hue * lat * 2.60 * briM
             + vec3(0.95, 0.98, 1.00) * lip * 0.60
             + mix(vec3(0.94, 0.97, 1.00), hue, 0.45) * ray * (0.60 + 0.85 * rays)
             + vec3(0.94, 0.97, 1.00) * axis * 0.80
             + vec3(1.00, 1.00, 0.98) * spin * 0.85
             + vec3(1.00, 0.99, 0.96) * core * 1.10;

    // Soft knee: the lattice, the rays and the core all pile up near the middle.
    col = col / (1.0 + col * 0.22);

    // Radial safety bound. The blade form has the longest rays, reaching 0.1025
    // past a silhouette that never leaves 0.366 on the long axis, so the far tip
    // of a ray lands at 0.469 and this fade feathers it rather than the frame
    // cutting it.
    float rim = 1.0 - smoothstep(0.420, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (lat * 1.00 + lip * 0.55 + ray * 1.00 + axis * 0.80
                 + spin * 0.90 + core * 0.55) * rim;
    alpha = smoothstep(0.020, 0.92, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
