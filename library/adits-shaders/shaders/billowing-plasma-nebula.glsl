/*{
  "ADITS": 1,
  "DESCRIPTION": "A volumetric billowing plasma nebula with multi-scattering sunlight and an inner stellar core, morphing between volcanic magma plume, celestial biocoral gas, and a high-energy solar corona.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "morph", "3d", "audio", "volumetric"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_sens",   "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Spectral Morph Gain" },
    { "NAME": "morph_rest",   "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "density",      "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.20, "MAX": 0.85,
      "LABEL": "Cloud Density", "BIND": "bass", "BIND_DEPTH": 0.35 },
    { "NAME": "turbulence",   "TYPE": "float", "DEFAULT": 0.48, "MIN": 0.15, "MAX": 0.85,
      "LABEL": "Vortex Turbulence", "BIND": "mid", "BIND_DEPTH": 0.40 },
    { "NAME": "core_lume",    "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Stellar Core Lume", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "wisp_detail",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Wisp Filaments", "BIND": "treble", "BIND_DEPTH": 0.35 }
  ]
}*/

#define PI 3.14159265359
#define TAU 6.28318530718
#define PERIOD 16.0

// Rotation helpers
mat3 rotX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

mat3 rotY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 rotZ(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
}

const mat3 mFBM = mat3(
     0.00,  0.80,  0.60,
    -0.80,  0.36, -0.48,
    -0.60, -0.48,  0.64
);

// High-speed 3D hash
float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

// 3D Value Noise with Hermite interpolation
float noise3D(in vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    float n = p.x + p.y * 57.0 + 113.0 * p.z;

    return mix(
        mix(
            mix(hash(n + 0.0),   hash(n + 1.0),   f.x),
            mix(hash(n + 57.0),  hash(n + 58.0),  f.x),
            f.y
        ),
        mix(
            mix(hash(n + 113.0), hash(n + 114.0), f.x),
            mix(hash(n + 170.0), hash(n + 171.0), f.x),
            f.y
        ),
        f.z
    );
}

// Global animation & audio uniforms
float g_ph;
float g_turn;
float g_morphSel;
float g_density;
float g_turb;
float g_coreLume;
float g_wisp;
float g_beatPulse;
float g_kickSnap;
float g_snarePop;

// Multi-octave FBM for billowing plasma folds
float fbm(vec3 p, float timePhase) {
    // Dynamic vortex swirling motion
    p += vec3(0.08 * sin(timePhase + p.y * 1.5), 0.06 * cos(timePhase * 1.2 + p.z * 1.5), 0.07 * sin(timePhase * 0.8 + p.x * 1.5)) * (0.8 + 0.6 * g_turb);

    float f = 0.0;
    f += 0.5000 * noise3D(p); p = mFBM * p * 2.02;
    f += 0.2500 * noise3D(p); p = mFBM * p * 2.03;
    f += 0.1250 * noise3D(p); p = mFBM * p * 2.01;
    f += 0.0625 * noise3D(p);

    if (g_wisp > 0.15) {
        p = mFBM * p * 2.04;
        f += 0.0312 * noise3D(p) * (0.5 + 0.8 * g_wisp);
    }
    return f;
}

// Cheap FBM for light marching
float fbmLight(vec3 p, float timePhase) {
    float f = 0.60 * noise3D(p);
    p = mFBM * p * 2.02;
    f += 0.40 * noise3D(p);
    return f;
}

// Volumetric Density Map
float sampleDensity(vec3 p) {
    // Tumbling slow rotation
    vec3 pr = rotY(g_turn * 0.18) * rotX(g_turn * 0.12) * p;

    // Archetype weights based on spectral selector
    float xw = g_morphSel * 2.0;
    float w0 = clamp(1.0 - abs(xw)       * 1.6, 0.0, 1.0);
    float w1 = clamp(1.0 - abs(xw - 1.0) * 1.6, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(xw - 2.0) * 1.6, 0.0, 1.0);
    float ws = w0 + w1 + w2 + 1e-4;
    w0 /= ws; w1 /= ws; w2 /= ws;

    // Radial spherical falloff envelope
    float r = length(pr);
    float coreRadius = 0.56 + 0.12 * g_density + 0.08 * g_kickSnap;
    float envelope = smoothstep(coreRadius, 0.06, r);

    // Billowing domain sample
    float freq = 4.2 * (0.85 + 0.35 * g_turb);
    float n = fbm(pr * freq, g_ph * TAU);

    // Density field formulation
    // w0: Dense volcanic billow clusters with sharp puff contours
    // w1: Soft ethereal astral filaments
    // w2: Sharp coronal plasma streamers
    float d0 = pow(max(n - 0.35, 0.0), 1.3) * 3.2;
    float d1 = (pow(n, 1.6) - 0.22) * 2.8;
    float d2 = pow(max(n - 0.32, 0.0), 1.2) * (2.2 + 1.4 * sin(pr.y * 10.0 + g_turn * 2.5));

    float dens = d0 * w0 + d1 * w1 + d2 * w2;
    dens = max(dens, 0.0) * envelope;
    dens *= (0.8 + 0.6 * g_density + 0.6 * g_beatPulse);

    return dens;
}

// Light sampling along sun ray
float sampleLightDensity(vec3 p) {
    vec3 pr = rotY(g_turn * 0.18) * rotX(g_turn * 0.12) * p;
    float r = length(pr);
    float envelope = smoothstep(0.62, 0.06, r);
    float n = fbmLight(pr * 4.2, g_ph * TAU);
    return max(n - 0.32, 0.0) * envelope * 2.5;
}

// Ray-Sphere intersection for tight bounding
vec2 iSphere(in vec3 ro, in vec3 rd, in float rad) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - rad * rad;
    float h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(max(-b - h, 0.0), -b + h);
}

void main() {
    // Canonical preamble: aspect-correct, resolution-independent uv coordinates
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Time phase
    g_ph = fract(TIME / PERIOD);
    g_turn = g_ph * TAU;

    // Audio reactivity & spectral morph selector
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sumAudio = lo + md + hi + 1e-4;
    float tilt = (md * 0.5 + hi) / sumAudio; // 0.0 = bass, 1.0 = treble

    // Expand selector range
    float sens = morph_sens;
    float selRaw = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);

    // Audio onsets shove selector for instantaneous responsiveness
    float snap = 0.45 * (AUDIO_HAT - AUDIO_KICK);
    selRaw = clamp(selRaw + snap, 0.0, 1.0);

    // Silence rest archetype blend
    float isLive = smoothstep(0.02, 0.12, sumAudio);
    g_morphSel = mix(morph_rest, selRaw, isLive);

    // Parameter assignments
    g_density = density;
    g_turb = turbulence;
    g_coreLume = core_lume;
    g_wisp = wisp_detail;

    // Onset pulses
    g_beatPulse = AUDIO_BEAT;
    g_kickSnap = AUDIO_KICK;
    g_snarePop = AUDIO_SNARE;

    // Camera setup with CAM_DIR and CAM_UP contract
    const float ORBIT_DIST = 3.6;
    vec3 ro = CAM_DIR * ORBIT_DIST;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    // Focal length 2.2 keeps cloud silhouette tightly within r < 0.38
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 2.2 * ww);

    // Sun / Key Light direction (warm directional orbital sun)
    vec3 sunDir = normalize(vec3(1.2 * cos(g_turn * 0.25), 0.8, 1.2 * sin(g_turn * 0.25)));

    // Volumetric Raymarch
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // Bounding sphere
    const float BOUND_RAD = 0.70;
    vec2 hit = iSphere(ro, rd, BOUND_RAD);

    if (hit.y > 0.0) {
        float tStart = hit.x;
        float tEnd = hit.y;
        float marchDist = tEnd - tStart;

        // Screen-space dither jitter to break stepping slices
        float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

        const int SAMPLES = 44;
        float stepSize = marchDist / float(SAMPLES);
        float t = tStart + stepSize * dither;

        float T = 1.0;
        vec3 accumColor = vec3(0.0);

        // Phase function for forward/back scattering
        float cosTheta = dot(rd, sunDir);
        float phaseForward = 1.0 / pow(1.30 - 0.60 * cosTheta, 1.5);
        float phaseBack = 0.6 + 0.4 * cosTheta;
        float phase = mix(phaseBack, phaseForward, 0.65);

        // Archetype color palettes:
        // Archetype 0: Volcanic Magma Plume / Golden Sunlight & Amber Smoke with Crimson Embers
        vec3 sunCol0   = vec3(1.45, 0.90, 0.45);
        vec3 ambCol0   = vec3(0.28, 0.18, 0.22);
        vec3 coreCol0  = vec3(1.80, 0.50, 0.10);

        // Archetype 1: Bioluminescent Astral Nebula / Aquamarine & Turquoise with Deep Violet
        vec3 sunCol1   = vec3(0.45, 1.20, 1.40);
        vec3 ambCol1   = vec3(0.25, 0.15, 0.38);
        vec3 coreCol1  = vec3(0.15, 0.85, 1.40);

        // Archetype 2: Solar Corona Flare / Electric Magenta, Gold & Teal Streamers
        vec3 sunCol2   = vec3(1.40, 0.65, 1.10);
        vec3 ambCol2   = vec3(0.15, 0.35, 0.40);
        vec3 coreCol2  = vec3(1.40, 0.85, 0.18);

        // Interpolate colors across morph selector
        float xw = g_morphSel * 2.0;
        float w0 = clamp(1.0 - abs(xw)       * 1.6, 0.0, 1.0);
        float w1 = clamp(1.0 - abs(xw - 1.0) * 1.6, 0.0, 1.0);
        float w2 = clamp(1.0 - abs(xw - 2.0) * 1.6, 0.0, 1.0);
        float ws = w0 + w1 + w2 + 1e-4;
        w0 /= ws; w1 /= ws; w2 /= ws;

        vec3 sunCol  = sunCol0  * w0 + sunCol1  * w1 + sunCol2  * w2;
        vec3 ambCol  = ambCol0  * w0 + ambCol1  * w1 + ambCol2  * w2;
        vec3 coreCol = coreCol0 * w0 + coreCol1 * w1 + coreCol2 * w2;

        const float ABSORPTION = 32.0;

        for (int i = 0; i < SAMPLES; i++) {
            vec3 pos = ro + t * rd;
            float dens = sampleDensity(pos);

            if (dens > 0.005) {
                // Secondary light march toward the sun
                float Tl = 1.0;
                float lightStep = 0.10;
                for (int j = 1; j <= 4; j++) {
                    vec3 lPos = pos + sunDir * (float(j) * lightStep);
                    float lDens = sampleLightDensity(lPos);
                    if (lDens > 0.005) {
                        Tl *= 1.0 - clamp(lDens * ABSORPTION * 0.07, 0.0, 0.85);
                        if (Tl < 0.02) break;
                    }
                }

                // Inner stellar core radiance
                float distToOrigin = length(pos);
                float coreGlow = smoothstep(0.28, 0.03, distToOrigin) * (0.5 + 1.2 * g_coreLume + 1.4 * g_beatPulse);
                vec3 emissive = coreCol * coreGlow;

                // Ambient light
                vec3 ambient = ambCol * (0.40 + 0.30 * dens);

                // Direct sun scattering with phase function
                vec3 direct = sunCol * Tl * phase * 2.6;

                // Step light accumulation
                vec3 stepLight = (direct + ambient + emissive) * dens;

                // Beer-Lambert transmittance extinction
                float tmp = dens * stepSize;
                float stepExt = exp(-tmp * ABSORPTION);
                accumColor += stepLight * T * (1.0 - stepExt);
                T *= stepExt;

                if (T < 0.01) {
                    T = 0.0;
                    break;
                }
            }

            t += stepSize;
            if (t > tEnd) break;
        }

        col = accumColor;
        alpha = 1.0 - T;
    }

    // Bounded edge fade: enforce zero coverage at frame borders (guide §8, §10)
    // Visible edge is at 0.50; bound fades smoothly to absolute zero by 0.47
    float frameFade = smoothstep(0.47, 0.36, length(uv));
    alpha *= frameFade;

    // Tone Mapping
    col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
    col = clamp(col, 0.0, 1.0);

    // Gamma correction
    col = pow(col, vec3(0.4545));

    // Premultiply alpha (guide §8)
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
