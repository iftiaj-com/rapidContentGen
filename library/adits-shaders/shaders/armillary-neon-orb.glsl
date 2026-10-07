/*{
  "ADITS": 1,
  "DESCRIPTION": "An armillary orb: a sphere banded in cyan, magenta and black chevrons with eye motifs printed over them, the print unchanging, caged by six hoops that each change species on their own schedule. Each hoop is one tube under six interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: fat belt, glossy tube, beaded chain, hair filament. Bass belts the cage in tight, treble opens it to filaments, and the change sweeps hoop by hoop. Rests as the glossy tube.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "neon", "armillary", "gyroscope", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "orbR",   "TYPE": "float", "DEFAULT": 0.170, "MIN": 0.120, "MAX": 0.205,
      "LABEL": "Core Radius", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "hoop",   "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Hoop Glow", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "flakes", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Lens Flakes", "BIND": "hat", "BIND_DEPTH": 0.55 }
  ]
}*/

#define TAU 6.28318530718

// Chevron count across the printed sphere. It used to be a slider; the print is
// now the part of the object that never changes, so it is fixed at the value the
// slider defaulted to.
#define BANDS 5.0

// How far the per-hoop selector is spread across the cage. The change then
// crosses the cage hoop by hoop instead of flipping all six at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

vec2 rot2(vec2 v, float a) {
    float s = sin(a), c = cos(a);
    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// One small lens flake: a tilted bright ellipse with a dark seam through it.
//   x body, y rim
vec2 flake(vec2 p, vec2 c, float rad, float tilt) {
    vec2  q = rot2(p - c, -tilt);
    q.y /= 0.32;                                  // a flat chip, not a ball
    float d = length(q) / rad;
    return vec2(1.0 - smoothstep(0.985, 1.015, d),
                1.0 - smoothstep(0.0012, 0.0040, abs(d - 1.0) * rad));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the cage
    // and the printed sphere wrap seamlessly on a 24 s cycle. Nothing on the
    // morph path reads it: which hoop is which belongs to the music.
    float ph = fract(TIME / 24.0);

    float r  = length(uv);
    float d2 = dot(uv, uv);

    float breath = 1.0 + 0.045 * sin(ph * TAU * 2.0);

    vec3 cyan  = vec3(0.10, 0.92, 1.00);
    vec3 mag   = vec3(0.86, 0.14, 0.98);
    vec3 ink   = vec3(0.018, 0.018, 0.032);
    vec3 white = vec3(1.00, 0.99, 0.98);

    // --- Selector -------------------------------------------------------------
    // Balance decides which hoop; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws a hoop out to a filament, a kick belts it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the beat
    // that belts the cage also flashes it.
    float beat = 1.0 + 1.3 * snap * AUDIO_BEAT;

    // Shared continuous parameters. Both slide across the whole selector range
    // rather than snapping, so the object's envelope is visibly moving even at a
    // 50/50 blend: bass swells the sphere and pulls the cage in, treble shrinks
    // the sphere and opens the cage out.
    float ballM = mix(1.10, 0.84, sel);
    float ampM  = mix(0.94, 1.06, sel);
    float R     = orbR * breath * ballM;

    // --- Printed sphere: the shared core ---------------------------------------
    // A real spherical mapping, so the bands crowd toward the limb the way paint
    // on a ball does instead of reading as a flat disc pattern. This never
    // changes species; it is what holds the middle of the frame together.
    float nz   = sqrt(max(R * R - d2, 0.0)) / max(R, 1e-4);
    float ball = 1.0 - smoothstep(R - 0.0022, R + 0.0022, r);
    vec3  n    = vec3(uv / max(R, 1e-4), nz);
    float lat  = asin(clamp(n.y, -1.0, 1.0));
    // The CAM_DIR term means orbiting the camera spins the sphere rather than
    // merely tilting a fixed picture of it.
    float lon  = atan(n.x, max(n.z, 1e-4)) + ph * TAU + 1.20 * CAM_DIR.x;

    // Chevrons: latitude bands raked by the folded longitude, which is what turns
    // stripes into the nested V motif the reference sphere carries.
    float k  = (lat / 1.5708) * BANDS * 0.36 - (abs(lon) / 3.14159) * 2.30;
    float f  = fract(k);
    vec3  pat = mix(cyan, mag, smoothstep(0.30, 0.36, f));
    pat = mix(pat, ink, smoothstep(0.68, 0.74, f));
    // Eye motifs printed over the bands.
    float eye = fract(length(vec2(lon / 3.14159 * 1.6, lat / 1.5708 * 1.1)) * 2.2 - ph * 2.0);
    pat = mix(pat, white, smoothstep(0.88, 0.96, eye) * 0.55);
    pat = mix(pat, ink, smoothstep(0.46, 0.52, eye) * 0.35);

    // Volume: the limb darkens, and a thin wet terminator picks out the edge.
    float shade = 0.42 + 0.72 * nz;
    float limb  = 1.0 - smoothstep(0.0, 0.020, R - r);

    vec3 col = pat * ball * shade * 1.15 * beat
             + white * ball * limb * 0.30;
    float cov = ball;

    // --- Morphing cage: six hoops ----------------------------------------------
    float tubeC = 0.0;
    for (int j = 0; j < 6; j++) {
        float fj = float(j);
        float hv = hash11(fj * 3.41 + 2.7);

        // Per-hoop selector. The index term sweeps the change across the cage;
        // the hash keeps that sweep from looking mechanical. Both are static, so
        // at a fixed spectrum the cage holds still: the wave is positioned by the
        // music, never by the clock.
        float u  = fj / 5.0;
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

        // Parameter-space morph. One tube primitive, six interpolated numbers, so
        // the section deforms and no fragment shows two forms at half alpha.
        //             belt       tube       chain      filament
        float gm  = 2.60 * w0 + 1.00 * w1 + 1.35 * w2 + 0.34 * w3;  // gauge
        float am  = 0.86 * w0 + 1.00 * w1 + 1.04 * w2 + 1.08 * w3;  // amplitude
        float bdz = 0.00 * w0 + 0.00 * w1 + 1.00 * w2 + 0.18 * w3;  // beading
        float bp  = 6.00 * w0 + 8.00 * w1 + 22.0 * w2 + 40.0 * w3;  // bead pitch
        float cwm = 0.22 * w0 + 0.42 * w1 + 0.30 * w2 + 0.95 * w3;  // core share
        float gwm = 0.85 * w0 + 1.00 * w1 + 1.10 * w2 + 1.45 * w3;  // emission

        float A  = (0.255 + 0.020 * fj) * am * ampM;
        float spin = ph * TAU * (fj < 2.5 ? 1.0 : -1.0) + fj * 0.62;
        float sq   = 0.16 + 0.84 * abs(sin(ph * TAU * (1.0 + floor(fj * 0.5)) + fj * 1.4));
        sq = max(sq, 0.15);

        vec2  e = rot2(uv, -spin);
        vec2  g = vec2(e.x, e.y / sq);
        float d = abs(length(g) - A);
        float tw = (0.0112 - 0.0010 * fj) * gm;

        // Beading. One atan per hoop, six per pixel: the alternative is a
        // Chebyshev recursion on the unit vector, which costs more code than it
        // saves here and this shader already declares COST "medium".
        float th = atan(g.y, g.x);
        tw *= mix(1.0, 0.25 + 1.50 * pow(abs(sin(th * bp * 0.5)), 0.70), bdz);

        float tube = 1.0 - smoothstep(tw, tw + 0.0020, d);
        float core = 1.0 - smoothstep(0.0006, max(tw * cwm, 0.0008), d);
        // Cyan at one end of the tube, magenta at the other.
        vec3  hc = mix(cyan, mag, 0.5 + 0.5 * (e.x / A));
        col   += (hc * tube * 0.90 + white * core * 0.85)
               * (0.55 + 0.90 * hoop) * gwm * beat;
        tubeC += tube + core * 0.5;
    }

    // --- Lens flakes -----------------------------------------------------------
    float fr = 0.30 + 0.05 * sin(ph * TAU);
    vec2 f1 = flake(uv, rot2(vec2(fr, 0.0), ph * TAU * 2.0 + 0.4), 0.036, 0.45 + ph * TAU);
    vec2 f2 = flake(uv, rot2(vec2(fr * 1.10, 0.0), -ph * TAU + 2.1), 0.028, -0.70 - ph * TAU * 2.0);
    vec2 f3 = flake(uv, rot2(vec2(fr * 0.92, 0.0), ph * TAU * 3.0 + 3.9), 0.032, 1.10 + ph * TAU);
    vec2 f4 = flake(uv, rot2(vec2(fr * 1.18, 0.0), -ph * TAU * 2.0 + 5.2), 0.024, -0.25 - ph * TAU * 3.0);
    vec2 f5 = flake(uv, rot2(vec2(fr * 0.84, 0.0), ph * TAU + 1.3), 0.030, 0.80 + ph * TAU * 2.0);

    float flB = max(max(f1.x, f2.x), max(max(f3.x, f4.x), f5.x));
    float flR = f1.y + f2.y + f3.y + f4.y + f5.y;
    col += white * flB * (0.55 + 0.95 * flakes)
         + mix(cyan, mag, 0.5) * min(flR, 2.0) * (0.30 + 0.50 * flakes);

    // Soft knee: six hoops cross in front of a lit sphere.
    col = col / (1.0 + col * 0.26);

    // Radial safety bound. The worst case is the filament form on the outermost
    // hoop: 0.355 * 1.08 * 1.06 puts its centreline at 0.407, and that form is
    // the thinnest of the four, so this fade only ever feathers empty space.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (cov * 1.00 + min(tubeC, 1.0) * 1.00
                 + flB * 1.00 + min(flR, 1.0) * 0.70) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
