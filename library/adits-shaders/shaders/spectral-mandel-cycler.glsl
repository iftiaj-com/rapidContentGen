/*{
  "ADITS": 1,
  "DESCRIPTION": "An electric Mandelbrot orbit trap resonator with dual travelling cycle detectors, logarithmic spiral energy guides, and audio-reactive spectral morphing. Deep bass triggers gravitational contraction and molten gold-indigo plasma; mid frequencies swirl dual cyan-violet orbit traps; treble ignites laser rainbow ribbons and sharp needle filaments. Rests in silence on the dual-orbit seahorse cycler.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "fractal", "morph", "audio", "neon"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Onset Snap" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Silence Archetype" },
    { "NAME": "swell",   "TYPE": "float", "DEFAULT": 0.75, "MIN": 0.20, "MAX": 1.20,
      "LABEL": "Bass Swell", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "warp",    "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.10, "MAX": 1.20,
      "LABEL": "Orbit Warp", "BIND": "mid", "BIND_DEPTH": 0.50 },
    { "NAME": "sparkle", "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.15, "MAX": 1.30,
      "LABEL": "Treble Shimmer", "BIND": "treble", "BIND_DEPTH": 0.55 },
    { "NAME": "tint",    "TYPE": "color", "DEFAULT": [0.35, 0.75, 1.00, 1.00],
      "LABEL": "Energy Tint" }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718
#define PERIOD 16.0
#define MAX_ITER 50

vec2 complexMul(in vec2 A, in vec2 B) {
    return vec2((A.x * B.x) - (A.y * B.y), (A.x * B.y) + (A.y * B.x));
}

vec3 hsv2rgb(in vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float easeWeight(float w) {
    return w * w * (3.0 - 2.0 * w);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent (§7)
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Exact 16-second loop phase
    float ph = fract(TIME / PERIOD);
    float t  = ph * TAU;

    // ---- Morph Selector (§12.2) ---------------------------------------------
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;

    // Gain expansion around rest point (§12.3)
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);

    // Direct onset snap from transient drums (§12.4)
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    // Smooth resting fallback at silence (§12.7)
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // 3 Archetype weights with narrow kernels (§12.6)
    float x  = sel * 2.0;
    float w0 = easeWeight(clamp(1.0 - abs(x)       * 1.72, 0.0, 1.0));
    float w1 = easeWeight(clamp(1.0 - abs(x - 1.0) * 1.72, 0.0, 1.0));
    float w2 = easeWeight(clamp(1.0 - abs(x - 2.0) * 1.72, 0.0, 1.0));
    float wsum = w0 + w1 + w2 + 1e-4;
    w0 /= wsum; w1 /= wsum; w2 /= wsum;

    // Sized to ~0.33 to keep total coverage around 25-35% (§8, §10)
    float baseReach = 0.325 * w0 + 0.340 * w1 + 0.315 * w2;
    float reach = baseReach * (1.0 + 0.06 * sin(t * 2.0) + 0.05 * AUDIO_BASS * swell);

    // Dynamic morphing between Points of Interest and zoom scales
    vec2 poi0 = vec2(-0.750, 0.000);   // Macro antenna & cardioid junction
    vec2 poi1 = vec2(-0.7105, 0.2466); // Seahorse valley satellite
    vec2 poi2 = vec2(-0.7453, 0.1127); // Spiral satellite cusp

    vec2 center = poi0 * w0 + poi1 * w1 + poi2 * w2;

    float rng0 = 1.25;
    float rng1 = 0.42;
    float rng2 = 0.08;
    float rng = rng0 * w0 + rng1 * w1 + rng2 * w2;
    rng /= (1.0 + 0.28 * swell * AUDIO_BASS);

    // Dynamic dual orbit trap centers
    float warpSpeed = 1.0 + 0.5 * warp;
    vec2 orbitCenter1 = (0.30 + 0.06 * sin(t * warpSpeed)) * vec2(cos(t * 1.25), sin(t * 1.25));
    vec2 orbitCenter2 = (0.20 + 0.04 * cos(t * warpSpeed * 1.5)) * vec2(cos(-t * 2.0), sin(-t * 2.0));

    // Gesture tracking integration (§5)
    if (TRACK_ON > 0.5) {
        vec2 ocOff = TRACK.xy * vec2(0.30, -0.30);
        orbitCenter1 += ocOff;
        orbitCenter2 += ocOff;
    }

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // Logarithmic spiral resonator arms
    float arms = 4.0 * w0 + 8.0 * w1 + 12.0 * w2;
    float spiralWave = sin(a * (arms * 0.5) - 3.5 * log(max(r, 0.02)) + t * 0.75);
    float spiralRib = smoothstep(0.70, 0.98, spiralWave * 0.5 + 0.5);

    // Evaluate fractal field within the reach envelope
    if (r < 0.38) {
        // Map local coordinate into complex plane
        vec2 C = (uv / reach) * rng + center;

        vec2 Z = C;
        float cycleLength1 = 0.0;
        float cycleLength2 = 0.0;
        float escapeIter = float(MAX_ITER);
        float smoothEsc = float(MAX_ITER);
        float minTrap1 = 100.0;
        float minTrap2 = 100.0;
        float trap1Thickness = 0.020 + 0.015 * AUDIO_KICK;
        float trap2Thickness = 0.014 + 0.012 * AUDIO_HAT * sparkle;

        for (int n = 0; n < MAX_ITER; ++n) {
            Z = complexMul(Z, Z) + C;

            float d1 = abs(1.0 - length(Z - orbitCenter1));
            float d2 = abs(0.2 - length(Z - orbitCenter2));

            if (d1 < minTrap1) minTrap1 = d1;
            if (d2 < minTrap2) minTrap2 = d2;

            if (cycleLength1 == 0.0 && d1 < trap1Thickness) {
                cycleLength1 = float(n);
            }
            if (cycleLength2 == 0.0 && d2 < trap2Thickness) {
                cycleLength2 = float(n);
            }

            float mag2 = dot(Z, Z);
            if (mag2 > 4.0) {
                escapeIter = float(n);
                // Continuous potential for silky smooth gradients
                float nu = log(max(1.0, log(mag2) * 0.5)) / 0.693147;
                smoothEsc = float(n) + 1.0 - nu;
                break;
            }
        }

        // Base field shading
        float f = 0.0;
        if (escapeIter < float(MAX_ITER)) {
            f = smoothEsc / float(MAX_ITER);
            f = pow(clamp(f, 0.0, 1.0), 0.62) * 0.88;
        } else {
            // Interior structure with obsidian depth
            f = 0.08 + 0.08 * sin(minTrap1 * 20.0 + t);
        }

        // Palette gradients per archetype
        vec3 rgb0 = vec3(f * 0.15, f * 0.45, f * 1.00); // Deep electric blue
        vec3 rgb1 = vec3(f * 0.20, f * 0.70, f * 0.95); // Cyan-violet resonator
        vec3 rgb2 = vec3(f * 0.95, f * 0.30, f * 0.80); // Magenta-pink laser

        vec3 rgb = rgb0 * w0 + rgb1 * w1 + rgb2 * w2;
        rgb = mix(rgb, rgb * tint.rgb * 1.6, 0.45);

        // Trap 1: Harmonic Cosine Spectrum waves
        if (cycleLength1 > 0.0) {
            float specSamples = mix(20.0, 12.0, w0);
            float wave = cos((cycleLength1 / specSamples) * TAU + t * 2.0) * 0.35 + 0.45;
            vec3 waveCol = mix(vec3(0.15, 0.70, 1.0), vec3(1.0, 0.75, 0.25), w0);
            rgb += waveCol * wave * (1.1 + 0.8 * AUDIO_KICK);
        } else {
            float softTrap1 = exp(-minTrap1 * 14.0);
            rgb += vec3(0.12, 0.50, 0.90) * softTrap1 * 0.40;
        }

        // Trap 2: Prismatic HSV Rainbow Spectrum
        if (cycleLength2 > 0.0) {
            float specSamples2 = mix(30.0, 16.0, w2);
            float hue = fract((cycleLength2 / specSamples2) + ph * 2.0);
            vec3 rainbow = hsv2rgb(vec3(hue, 0.92, 0.98));
            rgb += rainbow * (1.2 + 1.0 * sparkle * AUDIO_HAT);
        } else {
            float softTrap2 = exp(-minTrap2 * 20.0);
            rgb += vec3(0.95, 0.25, 0.70) * softTrap2 * 0.45;
        }

        // Structured silhouette falloff
        float distEdge = reach - r;
        float bodyFade = smoothstep(-0.02, 0.05, distEdge);
        float structureGate = 0.30 + 0.70 * (f + spiralRib * 0.4);

        // Core energy nucleus
        float coreR = 0.038 * (1.0 + 0.35 * AUDIO_BEAT);
        float coreGlow = smoothstep(coreR, 0.0, r);
        rgb += (vec3(0.95, 0.98, 1.0) + tint.rgb * 0.5) * coreGlow * 1.6;

        // Apply structured body illumination
        float fieldAlpha = bodyFade * structureGate * (0.35 + 0.65 * f);
        col += rgb * fieldAlpha;
        alpha += fieldAlpha * smoothstep(0.40, 0.30, r);
    }

    // --- Harmonic Gyro Containment Rings -------------------------------------
    float ring1R = reach * 0.94;
    float ring2R = reach * 0.58;

    float ring1 = smoothstep(0.0045, 0.0, abs(r - ring1R));
    float ring2 = smoothstep(0.0035, 0.0, abs(r - ring2R));

    vec3 ring1Col = mix(tint.rgb * 1.5, vec3(1.0, 0.85, 0.4), w0);
    vec3 ring2Col = mix(vec3(0.3, 0.9, 1.0), vec3(1.0, 0.3, 0.8), w2);

    col += ring1Col * ring1 * (0.8 + 0.6 * AUDIO_BEAT);
    col += ring2Col * ring2 * (0.7 + 0.5 * AUDIO_KICK);

    alpha += (ring1 + ring2) * smoothstep(0.40, 0.34, r) * 0.85;

    // Spiral energy streamers
    float streamerAlpha = spiralRib * smoothstep(0.04, 0.12, r) * smoothstep(reach + 0.01, reach - 0.03, r);
    col += mix(tint.rgb, vec3(1.0, 0.7, 0.3), w0) * streamerAlpha * 0.8;
    alpha += streamerAlpha * smoothstep(reach, 0.0, r) * 0.6;

    // --- Orbiting Spark Nodes ------------------------------------------------
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        float nodeAngle = fi * (TAU / 4.0) + t * 1.25;
        vec2 nodePos = ring1R * vec2(cos(nodeAngle), sin(nodeAngle));
        vec2 dNode = uv - nodePos;
        float sparkDist = dot(dNode, dNode);
        float spark = 0.0012 / (sparkDist + 0.0003);
        spark *= (0.5 + 0.8 * AUDIO_BEAT);

        vec3 sparkCol = hsv2rgb(vec3(fract(fi * 0.25 + ph * 2.0), 0.85, 1.0));
        col += sparkCol * spark;
        alpha += spark * smoothstep(0.40, 0.32, r) * 0.5;
    }

    // --- Strict Alpha Boundary & Premultiplication (§8, §10) -----------------
    float edgeCut = smoothstep(0.42, 0.34, r);
    alpha = clamp(alpha * edgeCut, 0.0, 1.0);

    // Premultiply RGB by coverage (§8)
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
