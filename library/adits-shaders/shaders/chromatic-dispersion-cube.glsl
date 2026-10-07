/*{
  "ADITS": 1,
  "DESCRIPTION": "A refractive crystal hypercube with chromatic dispersion and segmented kinetic facets, morphing between a monolithic prism vault, an articulated floating plate matrix, and a hyperfaceted diamond stellate.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "morph", "3d", "refraction", "audio", "geometric"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_sens", "TYPE": "float", "DEFAULT": 0.75, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Morph Gain" },
    { "NAME": "morph_rest", "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Silence Archetype" },
    { "NAME": "scale",      "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.25, "MAX": 0.44,
      "LABEL": "Overall Scale", "BIND": "bass", "BIND_DEPTH": 0.20 },
    { "NAME": "dispersion", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Chroma Dispersion", "BIND": "treble", "BIND_DEPTH": 0.35 },
    { "NAME": "explode",    "TYPE": "float", "DEFAULT": 0.22, "MIN": 0.00, "MAX": 0.85,
      "LABEL": "Facet Separation", "BIND": "mid", "BIND_DEPTH": 0.45 },
    { "NAME": "lume",       "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Core Luminescence", "BIND": "level", "BIND_DEPTH": 0.50 }
  ]
}*/

#define PI 3.14159265359
#define TAU 6.28318530718
#define PERIOD 16.0

// Rotation helpers
mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void pR(inout vec2 p, float a) {
    p = cos(a) * p + sin(a) * vec2(p.y, -p.x);
}

// SDF primitives & CSG helpers
float vmax(vec2 v) { return max(v.x, v.y); }
float vmin(vec2 v) { return min(v.x, v.y); }
float vmax(vec3 v) { return max(max(v.x, v.y), v.z); }
float vmin(vec3 v) { return min(min(v.x, v.y), v.z); }

float fBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return length(max(d, vec3(0.0))) + vmax(min(d, vec3(0.0)));
}

float smax(float a, float b, float r) {
    vec2 u = max(vec2(r + a, r + b), vec2(0.0));
    return min(-r, max(a, b)) + length(u);
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float sdLine(vec3 p, float h, float r) {
    p.y -= clamp(p.y, 0.0, h);
    return length(p) - r;
}

float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float ease3(float w) {
    return w * w * (3.0 - 2.0 * w);
}

// True Rainbow Spectral Palette for chromatic dispersion
vec3 pal(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}

vec3 spectrum(float n) {
    return pal(n, vec3(0.50, 0.50, 0.50), vec3(0.50, 0.50, 0.50), vec3(1.0, 1.0, 1.0), vec3(0.00, 0.33, 0.67));
}

vec3 causticGlow(float t) {
    return pal(t, vec3(0.50, 0.50, 0.50), vec3(0.50, 0.50, 0.50), vec3(1.0, 1.0, 1.0), vec3(0.15, 0.45, 0.75));
}

// Global scene parameters
float g_ph;
float g_turn;
float g_morphSel;
float g_explode;
float g_dispersion;
float g_lume;
float g_invert;

// Hit struct
struct Hit {
    float d;
    float id; // 1.0: Crystal Shell, 2.0: Core Sphere, 3.0: Exterior Radial Pins, 4.0: Inner Conduit
};

Hit mapScene(vec3 p) {
    // Tumbling isometric orientation
    pR(p.yz, 0.20 * PI + 0.04 * sin(g_turn * 0.5));
    pR(p.xz, -0.25 * PI + g_turn * 0.125);

    // Archetype weights based on spectral selector (§12 Morph Style)
    float xw = g_morphSel * 2.0;
    float w0 = ease3(clamp(1.0 - abs(xw)       * 1.65, 0.0, 1.0));
    float w1 = ease3(clamp(1.0 - abs(xw - 1.0) * 1.65, 0.0, 1.0));
    float w2 = ease3(clamp(1.0 - abs(xw - 2.0) * 1.65, 0.0, 1.0));
    float ws = w0 + w1 + w2 + 1e-4;
    w0 /= ws; w1 /= ws; w2 /= ws;

    // Archetype dimensions
    float boxHalf = 0.58 * w0 + 0.54 * w1 + 0.50 * w2;
    float bevelR  = 0.024 * w0 + 0.016 * w1 + 0.048 * w2;

    // Sophisticated element movements: octant separation & harmonic motion
    vec3 octantDir = sign(p);
    float octMotion = (0.010 * w0 + 0.048 * w1 + 0.024 * w2) * (1.0 + 0.50 * g_explode + 0.30 * AUDIO_KICK);
    vec3 pOct = p - octantDir * (octMotion * 0.5);

    // Sinusoidal surface breathing
    float warpFreq = 6.0 * w0 + 8.0 * w1 + 12.0 * w2;
    float warpSpeed = g_turn * 0.6;
    float warpAmt = (0.028 * w0 + 0.050 * w1 + 0.075 * w2) * (1.0 + 0.35 * AUDIO_MID);
    vec3 pWarp = pOct + sin(pOct * warpFreq + vec3(warpSpeed, warpSpeed * 1.4, warpSpeed * 0.9) + vec3(0.0, 0.5, 3.0)) * warpAmt;

    // Micro-ripple facets for high dispersion brilliance
    float microRip = sin(pOct.x * 40.0) * sin(pOct.y * 40.0) * sin(pOct.z * 40.0) * (0.0010 + 0.0015 * w2);
    pWarp += microRip;

    // Base beveled cube
    float dBox = fBox(pWarp, vec3(boxHalf - bevelR)) - bevelR;

    // Segmented CSG octant cutouts (coordinate plane slots)
    float slotWidth = (0.008 * w0 + 0.032 * w1 + 0.016 * w2) + 0.022 * g_explode + 0.014 * AUDIO_KICK;
    vec3 absP = abs(pWarp);
    float slotCuts = -vmin(absP) + slotWidth;

    // CSG cut to create distinct segmented crystal blocks
    float dCrystal = smax(dBox, slotCuts, 0.014);

    // Inner cavity
    float innerR = (0.44 * w0 + 0.48 * w1 + 0.42 * w2) * (1.0 + 0.08 * AUDIO_BASS);
    float dInner = fBox(pWarp, vec3(innerR));
    float dCrystalShell = max(dCrystal, -dInner);

    // Central pulsing photon core
    float coreR = (0.15 * w0 + 0.18 * w1 + 0.14 * w2) * (1.0 + 0.20 * AUDIO_BASS + 0.15 * AUDIO_BEAT);
    float dCore = sdSphere(p, coreR);

    // Internal cross conduits
    vec3 pCross = abs(p);
    float dConduit = min(min(sdLine(pCross.xyz - vec3(0.0, 0.0, 0.0), 0.45, 0.007),
                             sdLine(pCross.yzx - vec3(0.0, 0.0, 0.0), 0.45, 0.007)),
                             sdLine(pCross.zxy - vec3(0.0, 0.0, 0.0), 0.45, 0.007));

    // Exterior floating alignment pins / tick marks (radiating along diagonal axes)
    vec3 pPin = abs(p);
    pPin = vec3(vmin(pPin.xz), pPin.y, vmax(pPin.xz));
    float pinExt = 0.72 + 0.10 * sin(g_turn * 2.0) + 0.15 * AUDIO_HAT;
    float dPins = sdLine(pPin.xzy - vec3(pinExt, pinExt * 1.1, pinExt), 0.18, 0.0035);
    dPins = max(dPins, -vmax(p * vec3(1.0, -1.0, -1.0)));

    // Invert sign for internal raymarching
    dCrystalShell *= g_invert;

    Hit res;
    res.d = dCrystalShell;
    res.id = 1.0;

    if (dCore < res.d) {
        res.d = dCore;
        res.id = 2.0;
    }
    if (dConduit < res.d) {
        res.d = dConduit;
        res.id = 4.0;
    }
    if (dPins < res.d) {
        res.d = dPins;
        res.id = 3.0;
    }

    return res;
}

float mapD(vec3 p) {
    return mapScene(p).d;
}

// 4-tap tetrahedral normal (Rule 18)
vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float eps = 0.0016;
    return normalize(
        k.xyy * mapD(p + k.xyy * eps) +
        k.yyx * mapD(p + k.yyx * eps) +
        k.yxy * mapD(p + k.yxy * eps) +
        k.xxx * mapD(p + k.xxx * eps)
    );
}

// Ray-Sphere intersection for performance early-out
bool raySphereIntersect(vec3 ro, vec3 rd, float rad, out float tNear, out float tFar) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - rad * rad;
    float h = b * b - c;
    if (h < 0.0) return false;
    float sq = sqrt(h);
    tNear = max(0.0, -b - sq);
    tFar = -b + sq;
    return tFar > 0.0;
}

// Studio Lighting
vec3 studioLight(vec3 p, vec3 rayDir) {
    vec3 lPos1 = normalize(vec3(0.65, 0.85, -0.60));
    vec3 lPos2 = normalize(vec3(-0.70, -0.45, 0.65));
    vec3 lPos3 = normalize(vec3(0.10, 0.90, 0.30));

    float l1 = pow(max(dot(rayDir, lPos1), 0.0), 22.0);
    float l2 = pow(max(dot(rayDir, lPos2), 0.0), 16.0);
    float l3 = pow(max(dot(rayDir, lPos3), 0.0), 40.0);

    vec3 c1 = vec3(1.00, 0.98, 0.94) * l1 * 1.5;
    vec3 c2 = vec3(0.25, 0.80, 1.00) * l2 * 1.0;
    vec3 c3 = vec3(1.00, 0.40, 0.85) * l3 * 1.8;

    return c1 + c2 + c3;
}

// Ambient environment illumination with chromatic gradient
vec3 envLight(vec3 rayDir) {
    float y = dot(rayDir, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    vec3 sky = mix(vec3(0.04, 0.08, 0.16), vec3(0.18, 0.06, 0.22), y);
    float rim = pow(max(dot(rayDir, normalize(vec3(0.5, -0.3, 1.0))), 0.0), 4.0);
    return sky + vec3(0.20, 0.85, 1.00) * rim * 0.7;
}

void main() {
    // Canonical preamble (Rule 19)
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    float r = length(uv);

    // Frame bound guard for zero edge clip (Rule 20)
    float boundFade = 1.0 - smoothstep(0.42, 0.48, r);
    if (boundFade <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Time phase for seamless loop
    g_ph = fract(TIME / PERIOD);
    g_turn = g_ph * TAU;

    // Audio-reactive spectral balance selector (§12 Morph Style)
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;

    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * morph_sens) + morph_rest, 0.0, 1.0);
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.20 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.01, 0.08, lo + md + hi);
    g_morphSel = mix(morph_rest, sel, live);

    // Dynamic parameter modulations
    g_explode = explode * (1.0 + 0.40 * AUDIO_MID + 0.25 * AUDIO_KICK);
    g_dispersion = dispersion * (0.85 + 0.45 * AUDIO_TREBLE);
    g_lume = lume * (0.65 + 0.70 * AUDIO_LEVEL + 0.50 * AUDIO_BEAT);

    // Camera setup with CAM_DIR & CAM_UP (Section 5)
    float sc = scale * (1.0 + 0.12 * AUDIO_BASS + 0.06 * AUDIO_KICK);
    const float ORBIT_DIST = 3.8;
    vec3 ro = CAM_DIR * (ORBIT_DIST / sc);
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.85 * ww);

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // Bounding sphere intersection (Rule 16)
    float maxSceneRadius = 1.85;
    float tNear, tFar;

    if (raySphereIntersect(ro, rd, maxSceneRadius, tNear, tFar)) {
        g_invert = 1.0;
        float t = tNear;
        Hit hit;
        bool hasHit = false;
        vec3 p = ro + rd * t;

        // Primary raymarch pass (56 steps)
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            hit = mapScene(p);
            if (hit.d < 0.0012) {
                hasHit = true;
                break;
            }
            t += hit.d * 0.84;
            if (t > tFar) break;
        }

        if (hasHit) {
            vec3 nor = calcNormal(p);
            vec3 viewDir = -rd;
            float fresnel = pow(clamp(1.0 - dot(nor, viewDir), 0.0, 1.0), 3.2);

            // Exterior specular and chromatic rainbow rim
            vec3 refl = reflect(rd, nor);
            vec3 extSpec = studioLight(p, refl) * (0.4 + 1.2 * fresnel);
            vec3 rainbowRim = spectrum(dot(nor, vec3(0.0, 1.0, 0.0)) * 0.4 + g_ph) * fresnel * 1.2;

            if (hit.id == 3.0) {
                // Exterior alignment pins / energy ticks
                vec3 pinTint = mix(vec3(0.30, 0.88, 1.00), vec3(1.00, 0.35, 0.85), g_morphSel);
                col += pinTint * (1.8 * g_lume) + vec3(1.0) * (0.8 * AUDIO_HAT);
                alpha = 1.0;
            } else if (hit.id == 2.0) {
                // Direct hit on central core
                vec3 coreTint = mix(vec3(1.00, 0.80, 0.20), vec3(0.20, 0.95, 1.00), g_morphSel);
                col += coreTint * (2.0 * g_lume) + vec3(1.0) * (0.8 * AUDIO_BEAT);
                alpha = 1.0;
            } else if (hit.id == 4.0) {
                // Inner laser conduit lines
                vec3 condTint = mix(vec3(0.10, 0.95, 0.85), vec3(1.00, 0.20, 0.60), g_morphSel);
                col += condTint * (1.8 * g_lume);
                alpha = 1.0;
            } else {
                // Main crystal shell: Multi-wavelength Chromatic Dispersion (4 Spectral Bands: Red, Yellow/Green, Cyan, Blue/Violet)
                col += extSpec * 0.6 + rainbowRim * 0.4;
                alpha = 0.50 + 0.50 * fresnel;

                vec3 dispersedCol = vec3(0.0);
                const int DISP_SAMPLES = 4;

                for (int s = 0; s < DISP_SAMPLES; s++) {
                    float wave = float(s) / 3.0; // 0.0, 0.33, 0.66, 1.0
                    vec3 waveColor = spectrum(-wave * 1.1 + 0.25);

                    // Chromatic Index of Refraction (IOR)
                    float baseIOR = mix(1.22, 1.68, g_dispersion);
                    float ior = baseIOR + (wave - 0.5) * 0.28 * g_dispersion;

                    vec3 currOrigin = p;
                    vec3 currDir = rd;
                    float currInvert = 1.0;
                    vec3 sampleAccum = vec3(0.0);
                    float pathLength = 0.0;

                    // 2 Internal bounces
                    for (int b = 0; b < 2; b++) {
                        vec3 n = (b == 0) ? nor : calcNormal(currOrigin);
                        float eta = (currInvert > 0.0) ? (1.0 / ior) : ior;
                        vec3 refr = refract(currDir, n * currInvert, eta);

                        bool tir = (dot(refr, refr) < 0.01);
                        currDir = tir ? reflect(currDir, n * currInvert) : refr;

                        float stepOffset = 0.014;
                        currOrigin = currOrigin + currDir * stepOffset;
                        currInvert *= (tir ? 1.0 : -1.0);
                        g_invert = currInvert;

                        // Internal path step
                        float subT = 0.0;
                        Hit subHit;
                        for (int m = 0; m < 16; m++) {
                            vec3 subP = currOrigin + currDir * subT;
                            subHit = mapScene(subP);
                            if (subHit.d < 0.002) {
                                pathLength += subT;
                                currOrigin = subP;
                                break;
                            }
                            subT += subHit.d * 0.85;
                            if (subT > 1.3) {
                                pathLength += subT;
                                break;
                            }
                        }

                        // Shading along internal path
                        if (subHit.id == 2.0) {
                            // Hit central core
                            vec3 coreTint = mix(vec3(1.00, 0.75, 0.15), vec3(0.20, 0.95, 1.00), g_morphSel);
                            sampleAccum += coreTint * (1.6 * g_lume) + vec3(1.0) * (0.6 * AUDIO_BEAT);
                            break;
                        } else if (subHit.id == 4.0) {
                            // Inner conduit glow
                            sampleAccum += vec3(0.20, 0.90, 1.00) * (1.2 * g_lume);
                        }

                        // Internal facet caustic reflections with rainbow flare
                        vec3 intRefl = reflect(currDir, n);
                        sampleAccum += studioLight(currOrigin, intRefl) * 0.40;
                        sampleAccum += causticGlow(dot(currDir, n) * 2.0 + g_ph) * 0.25;
                    }

                    // Internal volumetric absorption & spectral tinting
                    vec3 absorption = exp(-pathLength * vec3(0.6, 0.45, 0.3) * 0.50);
                    dispersedCol += (sampleAccum + envLight(currDir) * 0.6) * waveColor * absorption;
                }

                dispersedCol /= float(DISP_SAMPLES);
                col += dispersedCol * (1.4 * g_lume);
                alpha = clamp(alpha + length(dispersedCol) * 0.50, 0.0, 1.0);
            }
        }

        // Subtle volumetric photon glow
        float coreHalo = (0.0025 / (r * r + 0.0022)) * g_lume;
        vec3 haloTint = mix(vec3(0.95, 0.45, 1.00), vec3(0.25, 0.90, 1.00), g_morphSel);
        col += haloTint * coreHalo * (1.0 - alpha * 0.75);
        alpha = clamp(alpha + coreHalo * 0.35, 0.0, 1.0);
    }

    // High contrast tonemapping and color grading
    col = col / (1.0 + col * 0.25);
    col = pow(col, vec3(1.10)) * 1.8;

    // Premultiply and write (Rule 22)
    alpha = clamp(alpha, 0.0, 1.0) * boundFade;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
