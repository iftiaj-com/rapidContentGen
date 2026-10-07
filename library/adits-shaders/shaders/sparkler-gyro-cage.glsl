/*{
  "ADITS": 1,
  "DESCRIPTION": "Seven great-circle wires tumbling as one gyroscopic cage around six warm sparkler bursts that never change, each wire changing species on its own schedule. Each is one hoop and node under five interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: heavy band, gyro wire, barbed hoop, hair filament. Bass bands the cage, treble strips it to filaments. Rests as the gyro wire.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "gyroscope", "sparkler", "armillary", "audio"],
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
    { "NAME": "cage",   "TYPE": "float", "DEFAULT": 0.300, "MIN": 0.240, "MAX": 0.345,
      "LABEL": "Cage Radius", "BIND": "bass", "BIND_DEPTH": 0.35 },
    { "NAME": "wire",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Wire Sheen", "BIND": "treble", "BIND_DEPTH": 0.45 },
    { "NAME": "sparks", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Sparkler Size", "BIND": "level", "BIND_DEPTH": 0.50 }
  ]
}*/

#define TAU 6.28318530718

// How far the per-wire selector is spread across the cage. The change then
// crosses it wire by wire instead of flipping all seven at once.
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

// One sparkler burst: dense hair-thin rays of unequal length around a hot core.
//   x ray coverage, y core, z tip brightness
vec3 sparkler(vec2 p, vec2 c, float len, float rays, float rot) {
    vec2  q  = p - c;
    float rr = length(q);
    float k  = (atan(q.y, q.x) - rot) * (rays / TAU);
    float hv = hash11(mod(floor(k), rays) * 2.71 + 0.7);
    float sd = abs(fract(k) - 0.5) * (TAU / rays) * rr;
    float L  = len * (0.34 + 0.86 * hv);
    float rn = rr / L;
    float w  = 0.0019 * (1.0 - 0.82 * clamp(rn, 0.0, 1.0));
    float m  = (1.0 - smoothstep(w, w + 0.0014, sd))
             * (1.0 - smoothstep(0.84, 1.02, rn));
    float core = 1.0 - smoothstep(0.10 * len, 0.42 * len, rr);
    return vec3(m, core, m * smoothstep(0.35, 0.92, rn));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the cage
    // tumbles seamlessly on a 24 s cycle. Nothing on the morph path reads it:
    // which wire is which belongs to the music, not to the clock.
    float ph = fract(TIME / 24.0);

    float r = length(uv);

    // --- Selector -------------------------------------------------------------
    // Balance decides which wire; loudness only decides how hard it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips a wire to a filament, a kick bands it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the beat
    // that bands a wire also blows the sparklers white-hot. AUDIO_BEAT already
    // decays, so it is used straight and the floor keeps them lit in silence.
    float heat = 0.55 + 0.45 * snap * AUDIO_BEAT;

    float wireC = 0.0;   // wire body
    float wireR = 0.0;   // wire highlight
    float nodeC = 0.0;   // node bodies
    float barbC = 0.0;   // node barbs

    // Seven great-circle wires. A tilted circle projects to an ellipse whose
    // minor axis is the cosine of the tilt, so animating the squash makes the
    // hoop genuinely tumble rather than just spin in the plane. Constant bound.
    for (int j = 0; j < 7; j++) {
        float fj = float(j);
        float jt = hash11(fj * 4.77 + 3.1);

        // Per-wire selector. The index sweeps the change across the cage; the
        // hash keeps that sweep from looking mechanical. Both are static, so at
        // a fixed spectrum the cage holds still: the wave is positioned by the
        // music, never by the clock.
        float uS = fj / 6.0;
        float xj = clamp(x0 + STAGGER * (0.66 * (uS - 0.5) + 0.34 * (jt - 0.5)),
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

        // Parameter-space morph. One hoop and node under five interpolated
        // numbers, so the section deforms and no fragment shows two forms at
        // half alpha.
        //             band       wire       barbed     filament
        float gwM = 2.60 * w0 + 1.00 * w1 + 1.40 * w2 + 0.50 * w3;   // gauge
        float amM = 0.90 * w0 + 1.00 * w1 + 1.05 * w2 + 1.10 * w3;   // amplitude
        float nrM = 1.70 * w0 + 1.00 * w1 + 0.85 * w2 + 0.35 * w3;   // node size
        float bbM = 0.10 * w0 + 0.50 * w1 + 1.00 * w2 + 0.05 * w3;   // node barbs
        float shM = 0.80 * w0 + 1.00 * w1 + 1.15 * w2 + 1.45 * w3;   // sheen

        float A  = cage * (0.72 + 0.046 * fj) * amM;
        // Integer turns and integer tumble rates, so everything wraps at LOOP.
        float spin = ph * TAU * (fj < 3.5 ? 1.0 : -1.0) + fj * 0.897;
        float sq   = 0.16 + 0.84 * abs(sin(ph * TAU * (1.0 + floor(fj * 0.5)) + fj * 1.7));
        sq = max(sq, 0.14);

        vec2  e = rot2(uv, -spin);
        vec2  g = vec2(e.x, e.y / sq);
        float d = abs(length(g) - A);

        // Per-wire gauge, so the cage reads as seven separate hoops rather than
        // one machined shell.
        float gw = (0.0018 + 0.0011 * hash11(fj * 3.3 + 1.1)) * gwM;
        wireC += 1.0 - smoothstep(gw, gw + 0.0020, d);
        wireR += (1.0 - smoothstep(0.0005, gw * 0.85, d)) * shM;

        // One barbed node riding each wire, positioned in the wire's own frame
        // and rotated back out, so it sits exactly on the hoop.
        float u  = ph * TAU * (2.0 + fj) + fj * 2.3;
        vec2  cw = rot2(vec2(A * cos(u), A * sq * sin(u)), spin);
        vec2  nq = uv - cw;
        float nd = length(nq);
        float nr = (0.016 + 0.007 * hash11(fj * 5.1 + 2.0)) * nrM;
        nodeC += 1.0 - smoothstep(nr, nr + 0.0022, nd);
        // Short barbs bristling off the node. abs(x*y) is a cheap four-fold
        // pinwheel and needs no second atan.
        float pin = abs(nq.x * nq.y) / (nd * nd + 1e-5);
        barbC += (1.0 - smoothstep(0.0, 0.22, pin))
               * (1.0 - smoothstep(nr, nr * (2.0 + 2.4 * bbM), nd))
               * smoothstep(nr * 0.7, nr, nd) * step(0.08, bbM);
    }

    // --- Shared core ----------------------------------------------------------
    // Six sparklers riding the cage, one held near the middle. None of them
    // changes species; they are what holds the object together while the wires
    // turn over.
    float sl = cage * (0.16 + 0.30 * sparks);
    vec3 s1 = sparkler(uv, rot2(vec2(cage * 0.62, 0.0), ph * TAU),        sl * 1.15, 26.0,  ph * TAU * 2.0);
    vec3 s2 = sparkler(uv, rot2(vec2(cage * 0.78, 0.0), ph * TAU * -2.0 + 1.7), sl * 0.90, 22.0, -ph * TAU);
    vec3 s3 = sparkler(uv, rot2(vec2(cage * 0.45, 0.0), ph * TAU * 3.0 + 3.1),  sl * 1.00, 30.0,  ph * TAU * 2.0);
    vec3 s4 = sparkler(uv, rot2(vec2(cage * 0.88, 0.0), ph * TAU * 2.0 + 4.4),  sl * 0.78, 20.0, -ph * TAU * 3.0);
    vec3 s5 = sparkler(uv, rot2(vec2(cage * 0.55, 0.0), ph * TAU * -1.0 + 5.6), sl * 1.05, 24.0,  ph * TAU);
    vec3 s6 = sparkler(uv, vec2(0.0, 0.0), sl * 0.85, 34.0, ph * TAU * 4.0);

    float sray  = s1.x + s2.x + s3.x + s4.x + s5.x + s6.x;
    float score = s1.y + s2.y + s3.y + s4.y + s5.y + s6.y;
    float stip  = s1.z + s2.z + s3.z + s4.z + s5.z + s6.z;

    // Palette: a cold dark wire, a warm sparkler.
    vec3 steel = vec3(0.115, 0.125, 0.145);
    vec3 sheen = vec3(0.62, 0.68, 0.78);
    vec3 spark = vec3(1.00, 0.80, 0.60);
    vec3 white = vec3(1.00, 0.95, 0.86);

    float beat = 1.0 + 1.4 * snap * AUDIO_BEAT;

    vec3 col = steel * min(wireC, 2.0) * 1.10
             + sheen * min(wireR, 2.0) * (0.20 + 0.45 * wire)
             + steel * min(nodeC, 1.5) * 1.55
             + sheen * min(barbC, 1.5) * 0.62
             + spark * min(sray, 2.5) * (0.55 + 0.75 * heat) * beat
             + white * min(score, 2.0) * (1.30 * heat) * beat
             + white * min(stip, 2.0) * 0.35;

    // Soft knee: six sparklers and seven wires overlap in the middle of the cage.
    col = col / (1.0 + col * 0.30);

    // Radial safety bound. The filament form is the widest hoop, at 0.345 cage
    // radius * 0.996 spacing * 1.10 amplitude, which is 0.378, so this fade only
    // ever feathers the sparkler rays as it did before.
    float rim = 1.0 - smoothstep(0.420, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (min(wireC, 1.0) * 0.95 + min(wireR, 1.0) * 0.55
                 + min(nodeC, 1.0) * 1.00 + min(barbC, 1.0) * 0.70
                 + min(sray, 1.0) * 0.90 + min(score, 1.0) * 0.85) * rim;
    alpha = smoothstep(0.020, 0.90, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
