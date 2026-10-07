/*{
  "ADITS": 1,
  "DESCRIPTION": "A brushed-metal rotor whose rim is a four-term Fourier series, hung inside one elliptical orbit ring with travelling spark nodes. The rivet band, turbine iris and chrome hub never change; the harmonic amplitudes do, so the rim morphs by deforming through four forms: two-lobe gong, eight-blade gear, five-lobe turbine, sixteen-tooth cymatic plate. Bass deepens the harmonics, mid precesses the ring and iris, treble runs the shimmer. Rests as the eight-blade gear.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "geometry", "metal", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",      "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",      "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",      "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "ripple",    "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.20, "MAX": 1.30,
      "LABEL": "Harmonic Depth", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "precess",   "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Ring Precession", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "shimmer",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.15, "MAX": 1.30,
      "LABEL": "Treble Shimmer", "BIND": "treble", "BIND_DEPTH": 0.6 },
    { "NAME": "metalTint", "TYPE": "color", "DEFAULT": [0.85, 0.65, 0.42, 1.00],
      "LABEL": "Metal" },
    { "NAME": "glintTint", "TYPE": "color", "DEFAULT": [1.00, 0.94, 0.80, 1.00],
      "LABEL": "Glint" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 16.0

// The orbit ring's radius. Sized so the ring, its glow and its spark nodes all
// land inside 0.46, well within the visible frame edge at 0.5.
#define ORBIT_R 0.395

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float hash11(float x) {
    return fract(sin(x * 127.1) * 43758.5453);
}

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Stroboscopic jitter. The phase is quantised to a whole number of steps per
// loop, so the randomness repeats exactly when the phase wraps. The step
// counts are deliberately low: the host clock can run at 10x, and a 300-step
// flicker becomes noise up there.
float flicker(float seed, float ph, float steps) {
    return hash11(seed * 13.73 + floor(ph * steps) * 3.371);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    float r = length(uv);
    float ang = atan(uv.y, uv.x);        // computed once for the whole shader

    // Phase wraps exactly at LOOP = 16 s. Every rate below is an integer
    // number of turns per loop, so the rotor returns to its start frame.
    float ph = fract(TIME / PERIOD);
    float a = TAU * ph;

    // --- Selector -------------------------------------------------------------
    // Balance decides which harmonic owns the rim; loudness only decides how
    // deep it cuts.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;             // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than
    // any one band. Expanded around the rest point, or the outer forms never
    // arrive and the morph fails silently.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // hands the rim to the sixteenth harmonic, a kick hands it back to the
    // second.
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

    // Parameter-space morph. The rim is one Fourier series and the archetypes
    // are its amplitudes, so the silhouette deforms continuously and no
    // fragment ever shows two rims at half alpha. The harmonic orders stay
    // integers, or the seam at the angular wrap opens.
    //              gong      gear      turbine   cymatic
    float A2   = 0.160 * w0 + 0.030 * w1 + 0.050 * w2 + 0.020 * w3;
    float A5   = 0.020 * w0 + 0.020 * w1 + 0.190 * w2 + 0.020 * w3;
    float A8   = 0.010 * w0 + 0.130 * w1 + 0.020 * w2 + 0.030 * w3;
    float A16  = 0.005 * w0 + 0.010 * w1 + 0.010 * w2 + 0.075 * w3;
    float innR = 0.160 * w0 + 0.115 * w1 + 0.135 * w2 + 0.175 * w3;
    float outR = 0.290 * w0 + 0.285 * w1 + 0.295 * w2 + 0.275 * w3;
    float sharp = 1.200 * w0 + 3.500 * w1 + 2.000 * w2 + 5.000 * w3;
    float bevW = 0.045 * w0 + 0.032 * w1 + 0.036 * w2 + 0.020 * w3;

    // One transient control drives the light: the beat that swaps the harmonic
    // also fires the spark nodes. AUDIO_BEAT already decays, so it is used
    // straight and the floor keeps the nodes lit in silence.
    float pop = 0.30 + 1.20 * snap * AUDIO_BEAT;

    // --- The harmonic rim ----------------------------------------------------
    // Bass deepens the harmonics by widening the gap between the hub radius
    // and the blade tips, which is what makes the rotor breathe.
    float spin = 2.0 * a + (flicker(0.0, ph, 48.0) - 0.5) * 0.018;
    float sa = ang + spin;
    float hnorm = A2 + A5 + A8 + A16 + 1e-4;
    float hsum = A2 * cos(2.0 * sa + 2.0 * a)
               + A5 * cos(5.0 * sa - 3.0 * a)
               + A8 * cos(8.0 * sa + a)
               + A16 * cos(16.0 * sa - 2.0 * a);
    float wave = clamp(0.5 + 0.5 * hsum / hnorm, 0.0, 1.0);
    wave = pow(wave, sharp);

    float spreadM = 0.62 + 0.55 * ripple;
    float rimR = innR + (outR - innR) * spreadM * wave;
    float dBody = r - rimR;

    vec3 col = vec3(0.0);
    float cov = 0.0;

    // --- Layer 1: the brushed metal blade body -------------------------------
    // A smoothstep mask, not a branch: a divergent branch around real work
    // costs the sum and not the maximum.
    float mask = smoothstep(0.006, -0.006, dBody);

    // Brushed albedo, lifted well above black so the rotor reads as metal over
    // dark footage rather than as a hole in it.
    vec3 albedo = mix(metalTint.rgb * 0.22, metalTint.rgb * 0.62,
                      0.5 + 0.5 * sin(spin * 3.0 + hsum * 8.0));

    // Chamfer: a bright inner bevel along the whole rim, radially symmetric so
    // it survives the plane tilting.
    float bevel = smoothstep(-bevW, 0.0, dBody) * smoothstep(0.004, -0.004, dBody);

    // Anisotropic sweep highlight, animated rather than camera-matched.
    float spec = pow(max(0.0, cos(8.0 * sa - 4.0 * a + hsum * 6.0)), 24.0);
    spec *= 0.45 + 0.55 * flicker(1.0, ph, 64.0) * shimmer;

    // Micro brushed flecks, re-drawn 72 times per loop so they still read as
    // flecks when the host clock runs hard.
    vec2 cell = floor(rot(spin) * uv * 26.0);
    float fleck = step(0.972 - 0.02 * shimmer,
                       hash21(cell + floor(ph * 72.0)));

    col += (albedo
          + mix(metalTint.rgb, glintTint.rgb, 0.6) * bevel * 2.6
          + glintTint.rgb * spec * 2.4
          + glintTint.rgb * fleck * 1.1) * mask;
    cov += mask * 0.96;

    // Rim glow, bounded to the blade tips so it cannot creep outward.
    float glowEdge = (0.0022 / (abs(dBody) + 0.0045))
                   * smoothstep(0.345, 0.255, r);
    col += mix(metalTint.rgb, glintTint.rgb, 0.35) * glowEdge * 0.75;
    cov += glowEdge * 0.30;

    // --- Layer 2: the rivet band. Shared, never changes species -------------
    float bandR = 0.205;
    float bandMask = smoothstep(0.017, 0.0, abs(r - bandR));
    float rivStep = TAU / 12.0;
    float aMod = mod(ang + spin * 0.5 + rivStep * 0.5, rivStep) - rivStep * 0.5;
    float dRiv = length(vec2(r * cos(aMod) - bandR, r * sin(aMod)));
    float rivet = smoothstep(0.009, 0.002, dRiv);
    vec3 bandCol = metalTint.rgb * 0.34 + glintTint.rgb * rivet * 1.9;
    col = mix(col, bandCol, bandMask * 0.85);
    cov = max(cov, bandMask * 0.92);

    // --- Layer 3: the turbine iris. Shared, counter-rotating ----------------
    // Mid twists it, so the interior deforms while the rim keeps its harmonic.
    float ia = ang - 3.0 * a - precess * 1.1 * sin(a);
    float irisWave = pow(abs(cos(ia * 3.0)), 6.0);
    float irisR = mix(0.048, 0.150, irisWave);
    float irisMask = smoothstep(0.004, -0.004, r - irisR);
    float irisSpec = pow(max(0.0, cos(6.0 * ia + 6.0 * a)), 28.0);
    vec3 irisCol = metalTint.rgb * 0.28 + glintTint.rgb * irisSpec * 2.8;
    col = mix(col, irisCol, irisMask * 0.92);
    cov = max(cov, irisMask);

    // --- Layer 4: the polished chrome hub. Shared ---------------------------
    // No baked key light: the facing term is radially symmetric and the
    // highlight orbits, so nothing reads as a fixed smudge once the plane
    // tilts.
    float hubR = 0.070 + 0.010 * ripple;
    float z = sqrt(max(0.0, hubR * hubR - r * r)) / max(hubR, 1e-4);
    float fz = 1.0 - z;
    vec2 hl = vec2(cos(2.0 * a), sin(2.0 * a)) * (hubR * 0.45);
    vec2 dh = uv - hl;
    float hSpec = exp(-dot(dh, dh) * 2200.0);
    vec3 hubCol = metalTint.rgb * (0.20 + 0.55 * z)
                + glintTint.rgb * (fz * fz * fz) * 0.65
                + glintTint.rgb * hSpec * 2.6;
    float hubMask = smoothstep(0.003, -0.003, r - hubR);
    col = mix(col, hubCol, hubMask);
    cov = max(cov, hubMask);

    // --- The orbit ring, with three travelling spark nodes ------------------
    float rSpin = -a + (flicker(5.0, ph, 48.0) - 0.5) * 0.10;
    float rPrec = a + precess * 1.4 * sin(2.0 * a);
    vec2 pr = rot(rSpin) * uv;
    float rb = ORBIT_R * mix(0.66, 1.0, 0.5 + 0.5 * cos(rPrec));
    vec2 qe = vec2(pr.x / ORBIT_R, pr.y / max(rb, 1e-4));
    float dRing = (length(qe) - 1.0) * min(ORBIT_R, rb);

    float stroke = smoothstep(0.0050, 0.0005, abs(dRing));
    float soft = smoothstep(0.030, 0.002, abs(dRing));
    float ringGlow = stroke * 1.2 + soft * 0.55;
    float glint = pow(max(0.0, cos(atan(pr.y, pr.x) * 8.0 - 4.0 * a)), 26.0)
                * smoothstep(0.022, 0.0, abs(dRing))
                * (0.4 + 0.6 * shimmer);
    col += mix(metalTint.rgb * 0.6, metalTint.rgb, 0.5 + 0.5 * sin(rPrec))
         * ringGlow * 0.95
         + glintTint.rgb * glint * 1.5;
    cov += ringGlow * 0.68 + glint * 0.35;

    // Three localised spark nodes travelling the orbit. Colour and coverage
    // share the same falloff, so a node cannot raise coverage off the ring.
    for (int k = 0; k < 3; k++) {
        float tK = float(k) * (TAU / 3.0) + rPrec * 0.35;
        vec2 nodePos = rot(-rSpin) * vec2(cos(tK) * ORBIT_R, sin(tK) * rb);
        vec2 dn = uv - nodePos;
        float dd = dot(dn, dn);
        float fall = exp(-dd * 900.0);
        float seed = float(k) * 3.3;
        float sPop = pow(flicker(seed, ph, 96.0), 2.0) * 1.3 + 0.35;
        float core = 0.00090 / (dd + 0.00008) * fall;
        float halo = 0.0060 / (sqrt(dd) + 0.008) * fall;
        float sparkW = (core * 0.8 + halo * 0.5) * sPop * pop;
        col += mix(glintTint.rgb, vec3(1.0, 0.62, 0.20), 0.35) * sparkW;
        cov += sparkW * 0.30;
    }

    // Frame guard. The ring sits at 0.395 and its sparks reach about 0.055
    // past it, so this fade only feathers the outermost node.
    float edgeFade = smoothstep(0.478, 0.44, r);
    col *= edgeFade;

    // Coverage, then premultiply. Zero everywhere the rotor is not.
    float alpha = clamp(cov * edgeFade, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
