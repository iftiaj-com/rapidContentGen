/*{
  "ADITS": 1,
  "DESCRIPTION": "A quantum crystal matrix featuring three distinct archetypes: a floating plate hypercube at bass, a rotating tesseract framework in the mids, and a crystalline spire cluster at treble. The object uses a teal-cyan-magenta color scheme with precise geometric rotations, orbiting energy rings, and pulsating core elements.",
  "CREDIT": "claude-sonnet-4-6",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "morph", "3d", "geometric", "audio", "tech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "morph_sens", "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Spectral Morph Gain" },
    { "NAME": "morph_rest", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Silence Archetype" },
    { "NAME": "scale",      "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.35, "MAX": 0.55,
      "LABEL": "Matrix Scale", "BIND": "bass", "BIND_DEPTH": 0.25 },
    { "NAME": "ring_speed", "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Ring Velocity", "BIND": "treble", "BIND_DEPTH": 0.40 },
    { "NAME": "separation", "TYPE": "float", "DEFAULT": 0.18, "MIN": 0.00, "MAX": 0.70,
      "LABEL": "Plate Separation", "BIND": "mid", "BIND_DEPTH": 0.50 },
    { "NAME": "pulse",      "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.30, "MAX": 1.00,
      "LABEL": "Core Pulse", "BIND": "level", "BIND_DEPTH": 0.55 }
  ]
}*/

#define PI 3.14159265359
#define TAU 6.28318530718
#define PERIOD 12.0

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void pR(inout vec2 p, float a) {
    p = cos(a) * p + sin(a) * vec2(p.y, -p.x);
}

float vmax(vec2 v) { return max(v.x, v.y); }
float vmin(vec2 v) { return min(v.x, v.y); }
float vmax(vec3 v) { return max(max(v.x, v.y), v.z); }
float vmin(vec3 v) { return min(min(v.x, v.y), v.z); }

float fBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return length(max(d, vec3(0.0))) + vmax(min(d, vec3(0.0)));
}

float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

float sdCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(h, r);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

float ease3(float w) {
    return w * w * (3.0 - 2.0 * w);
}

// Distinct color palette: teal-cyan-magenta instead of rainbow (more vibrant)
vec3 techPalette(float t) {
    vec3 a = vec3(0.2, 0.5, 0.6);
    vec3 b = vec3(0.4, 0.8, 0.9);
    vec3 c = vec3(1.0, 0.4, 0.8);
    vec3 d = vec3(0.0, 0.25, 0.5);
    return a + b * cos(TAU * (c * t + d));
}

vec3 coreGlow(float t) {
    return mix(vec3(0.0, 0.8, 0.9), vec3(0.9, 0.2, 0.8), t);
}

float g_ph;
float g_turn;
float g_morphSel;
float g_separation;
float g_ringSpeed;
float g_pulse;
float g_scale;

struct Hit {
    float d;
    float id; // 1.0: Main structure, 2.0: Core, 3.0: Rings, 4.0: Spikes
};

Hit mapScene(vec3 p) {
    // Precise geometric rotations instead of organic tumbling
    float rotPhase = floor(g_turn * 4.0) * (PI / 2.0);
    pR(p.yz, rotPhase * 0.3);
    pR(p.xz, rotPhase * 0.2 + PI * 0.25);

    // Morph archetype weights
    float xw = g_morphSel * 2.0;
    float w0 = ease3(clamp(1.0 - abs(xw)       * 1.8, 0.0, 1.0));
    float w1 = ease3(clamp(1.0 - abs(xw - 1.0) * 1.8, 0.0, 1.0));
    float w2 = ease3(clamp(1.0 - abs(xw - 2.0) * 1.8, 0.0, 1.0));
    float ws = w0 + w1 + w2 + 1e-4;
    w0 /= ws; w1 /= ws; w2 /= ws;

    // Archetype 0: Floating plate hypercube
    float plateSep = (0.10 + 0.30 * g_separation) * w0;
    float plateSize = 0.42 * g_scale;
    vec3 pPlate = p;
    pPlate.y = mod(pPlate.y + plateSep * 0.5, plateSep) - plateSep * 0.5;
    float dPlates = fBox(pPlate, vec3(plateSize)) - 0.02;

    // Archetype 1: Rotating tesseract framework
    float frameSize = 0.38 * g_scale;
    float frameThick = 0.04 + 0.02 * AUDIO_MID;
    vec3 pFrame = p;
    pR(pFrame.xy, g_turn * 0.5);
    pR(pFrame.yz, g_turn * 0.3);
    float dFrame = fBox(pFrame, vec3(frameSize)) - frameThick;
    float dFrameInner = -fBox(pFrame, vec3(frameSize * 0.7)) + frameThick;
    float dTesseract = max(dFrame, dFrameInner);

    // Archetype 2: Crystalline spire cluster
    float spireHeight = (0.5 + 0.18 * AUDIO_TREBLE) * g_scale;
    float spireRad = 0.05 + 0.02 * g_separation;
    vec3 pSpire = p;
    float spireAngle = atan(pSpire.z, pSpire.x) + g_turn * g_ringSpeed;
    float spireCount = 6.0;
    float spireIndex = floor((spireAngle + PI) / (TAU / spireCount));
    float spiralOffset = sin(spireIndex * 0.8 + g_turn * 2.0) * 0.1;
    pSpire.xz = rot2D(spireAngle) * pSpire.xz;
    pSpire.x -= spiralOffset;
    float dSpire = sdCylinder(pSpire, spireHeight, spireRad) - 0.01;
    float dSpireTip = sdOctahedron(pSpire + vec3(0, spireHeight, 0), 0.08);
    float dSpireCluster = min(dSpire, dSpireTip);

    // Blend archetypes
    float dStructure = dPlates * w0 + dTesseract * w1 + dSpireCluster * w2;

    // Central pulsating core
    float coreSize = (0.15 + 0.10 * g_pulse + 0.06 * sin(g_turn * 3.0)) * g_scale;
    float dCore = fBox(p, vec3(coreSize));
    float coreGlowSize = coreSize * (1.0 + 0.4 * AUDIO_BEAT);
    float dCoreGlow = length(p) - coreGlowSize;

    // Orbiting energy rings
    float ringRadius = (0.55 + 0.12 * g_separation) * g_scale;
    float ringThick = 0.02 + 0.012 * AUDIO_HAT;
    vec3 pRing = p;
    float ringAngle = g_turn * g_ringSpeed;
    pR(pRing.xy, ringAngle);
    pR(pRing.zx, ringAngle * 0.7);
    float dRing = sdTorus(pRing, vec2(ringRadius, ringThick));
    
    // Secondary counter-rotating ring
    vec3 pRing2 = p;
    pR(pRing2.yz, -ringAngle * 1.3);
    pR(pRing2.xy, ringAngle * 0.5);
    float dRing2 = sdTorus(pRing2, vec2(ringRadius * 0.7, ringThick * 0.8));
    float dRings = min(dRing, dRing2);

    // Floating crystalline spikes
    float spikeCount = 8.0;
    float spikeAngle = atan(p.z, p.x);
    float spikePhase = (spikeAngle + PI) / (TAU / spikeCount);
    float spikeIndex = floor(spikePhase);
    float spikePulse = sin(spikeIndex * 1.5 + g_turn * 4.0 + AUDIO_KICK * 3.0);
    float spikeExt = (0.5 + 0.15 * spikePulse) * g_scale;
    vec3 pSpike = p;
    pSpike.xz = rot2D(spikeAngle - spikeIndex * (TAU / spikeCount)) * pSpike.xz;
    pSpike.x -= spikeExt;
    float dSpike = sdCylinder(pSpike, 0.15, 0.02);
    float dSpikeTip = sdOctahedron(pSpike + vec3(0, 0.15, 0), 0.04);
    float dSpikes = min(dSpike, dSpikeTip);

    Hit res;
    res.d = dStructure;
    res.id = 1.0;

    if (dCore < res.d) {
        res.d = dCore;
        res.id = 2.0;
    }
    if (dRings < res.d) {
        res.d = dRings;
        res.id = 3.0;
    }
    if (dSpikes < res.d) {
        res.d = dSpikes;
        res.id = 4.0;
    }

    return res;
}

float mapD(vec3 p) {
    return mapScene(p).d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float eps = 0.0018;
    return normalize(
        k.xyy * mapD(p + k.xyy * eps) +
        k.yyx * mapD(p + k.yyx * eps) +
        k.yxy * mapD(p + k.yxy * eps) +
        k.xxx * mapD(p + k.xxx * eps)
    );
}

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

vec3 techLight(vec3 p, vec3 rayDir) {
    vec3 lPos1 = normalize(vec3(0.8, 0.6, -0.5));
    vec3 lPos2 = normalize(vec3(-0.6, -0.3, 0.8));
    vec3 lPos3 = normalize(vec3(0.2, 0.9, 0.4));

    float l1 = pow(max(dot(rayDir, lPos1), 0.0), 24.0);
    float l2 = pow(max(dot(rayDir, lPos2), 0.0), 18.0);
    float l3 = pow(max(dot(rayDir, lPos3), 0.0), 32.0);

    vec3 c1 = vec3(0.2, 0.95, 1.0) * l1 * 2.0;
    vec3 c2 = vec3(1.0, 0.35, 0.85) * l2 * 1.5;
    vec3 c3 = vec3(0.15, 0.7, 1.0) * l3 * 1.8;

    return c1 + c2 + c3;
}

vec3 techEnv(vec3 rayDir) {
    float y = dot(rayDir, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    vec3 sky = mix(vec3(0.02, 0.05, 0.12), vec3(0.08, 0.02, 0.15), y);
    float rim = pow(max(dot(rayDir, normalize(vec3(0.3, -0.5, 0.8))), 0.0), 3.0);
    return sky + vec3(0.0, 0.7, 0.9) * rim * 0.5;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float r = length(uv);

    float boundFade = 1.0 - smoothstep(0.42, 0.48, r);
    if (boundFade <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    g_ph = fract(TIME / PERIOD);
    g_turn = g_ph * TAU;

    // Spectral morph selector
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;

    float sel = clamp((tilt - 0.5) * (1.8 + 3.8 * morph_sens) + morph_rest, 0.0, 1.0);
    sel = clamp(sel + 0.45 * (AUDIO_HAT - AUDIO_KICK) + 0.25 * AUDIO_SNARE, 0.0, 1.0);
    
    float live = smoothstep(0.01, 0.07, lo + md + hi);
    g_morphSel = mix(morph_rest, sel, live);

    g_separation = separation * (1.0 + 0.45 * AUDIO_MID + 0.30 * AUDIO_KICK);
    g_ringSpeed = ring_speed * (0.8 + 0.6 * AUDIO_TREBLE);
    g_pulse = pulse * (0.7 + 0.8 * AUDIO_LEVEL + 0.6 * AUDIO_BEAT);
    g_scale = scale * (1.0 + 0.15 * AUDIO_BASS + 0.08 * AUDIO_KICK);

    const float ORBIT_DIST = 4.2;
    vec3 ro = CAM_DIR * (ORBIT_DIST / g_scale);
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.9 * ww);

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    float maxSceneRadius = 1.2;
    float tNear, tFar;

    if (raySphereIntersect(ro, rd, maxSceneRadius, tNear, tFar)) {
        float t = tNear;
        Hit hit;
        bool hasHit = false;
        vec3 p = ro + rd * t;

        for (int i = 0; i < 52; i++) {
            p = ro + rd * t;
            hit = mapScene(p);
            if (hit.d < 0.0015) {
                hasHit = true;
                break;
            }
            t += hit.d * 0.82;
            if (t > tFar) break;
        }

        if (hasHit) {
            vec3 nor = calcNormal(p);
            vec3 viewDir = -rd;
            float fresnel = pow(clamp(1.0 - dot(nor, viewDir), 0.0, 1.0), 2.8);

            vec3 refl = reflect(rd, nor);
            vec3 extSpec = techLight(p, refl) * (0.5 + 1.0 * fresnel);
            vec3 techRim = techPalette(dot(nor, vec3(0.0, 1.0, 0.0)) * 0.5 + g_ph) * fresnel * 1.0;

            if (hit.id == 3.0) {
                // Energy rings
                vec3 ringTint = mix(vec3(0.0, 0.9, 1.0), vec3(1.0, 0.3, 0.9), g_morphSel);
                col += ringTint * (3.0 * g_pulse) + vec3(1.0) * (1.2 * AUDIO_HAT);
                alpha = 1.0;
            } else if (hit.id == 2.0) {
                // Core
                vec3 coreTint = coreGlow(g_morphSel);
                col += coreTint * (3.5 * g_pulse) + vec3(1.0) * (1.5 * AUDIO_BEAT);
                alpha = 1.0;
            } else if (hit.id == 4.0) {
                // Spikes
                vec3 spikeTint = mix(vec3(0.1, 0.8, 1.0), vec3(1.0, 0.4, 0.8), g_morphSel);
                col += spikeTint * (2.5 * g_pulse) + vec3(1.0) * (1.0 * AUDIO_KICK);
                alpha = 1.0;
            } else {
                // Main structure
                col += extSpec * 0.7 + techRim * 0.5;
                alpha = 0.45 + 0.55 * fresnel;

                vec3 dispersedCol = vec3(0.0);
                const int DISP_SAMPLES = 3;

                for (int s = 0; s < DISP_SAMPLES; s++) {
                    float wave = float(s) / float(DISP_SAMPLES - 1);
                    vec3 waveColor = techPalette(-wave * 0.9 + 0.3);

                    float baseIOR = mix(1.15, 1.45, 0.5);
                    float ior = baseIOR + (wave - 0.5) * 0.2;

                    vec3 currOrigin = p;
                    vec3 currDir = rd;
                    vec3 sampleAccum = vec3(0.0);
                    float pathLength = 0.0;

                    for (int b = 0; b < 2; b++) {
                        vec3 n = (b == 0) ? nor : calcNormal(currOrigin);
                        float eta = 1.0 / ior;
                        vec3 refr = refract(currDir, n, eta);

                        bool tir = (dot(refr, refr) < 0.01);
                        currDir = tir ? reflect(currDir, n) : refr;

                        float stepOffset = 0.012;
                        currOrigin = currOrigin + currDir * stepOffset;

                        float subT = 0.0;
                        Hit subHit;
                        for (int m = 0; m < 14; m++) {
                            vec3 subP = currOrigin + currDir * subT;
                            subHit = mapScene(subP);
                            if (subHit.d < 0.0025) {
                                pathLength += subT;
                                currOrigin = subP;
                                break;
                            }
                            subT += subHit.d * 0.88;
                            if (subT > 1.2) {
                                pathLength += subT;
                                break;
                            }
                        }

                        if (subHit.id == 2.0) {
                            vec3 coreTint = coreGlow(g_morphSel);
                            sampleAccum += coreTint * (1.8 * g_pulse) + vec3(1.0) * (0.7 * AUDIO_BEAT);
                            break;
                        }

                        vec3 intRefl = reflect(currDir, n);
                        sampleAccum += techLight(currOrigin, intRefl) * 0.35;
                    }

                    vec3 absorption = exp(-pathLength * vec3(0.5, 0.6, 0.4) * 0.45);
                    dispersedCol += (sampleAccum + techEnv(currDir) * 0.5) * waveColor * absorption;
                }

                dispersedCol /= float(DISP_SAMPLES);
                col += dispersedCol * (1.3 * g_pulse);
                alpha = clamp(alpha + length(dispersedCol) * 0.45, 0.0, 1.0);
            }
        }

        // Tech-style glow
        float coreHalo = (0.008 / (r * r + 0.003)) * g_pulse;
        vec3 haloTint = coreGlow(g_morphSel);
        col += haloTint * coreHalo * (1.0 - alpha * 0.6);
        alpha = clamp(alpha + coreHalo * 0.5, 0.0, 1.0);
    }

    col = col / (1.0 + col * 0.2);
    col = pow(col, vec3(1.1)) * 2.2;

    alpha = clamp(alpha, 0.0, 1.0) * boundFade;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}