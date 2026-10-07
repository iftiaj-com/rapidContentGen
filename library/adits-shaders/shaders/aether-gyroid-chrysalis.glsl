/*{
  "ADITS": 1,
  "DESCRIPTION": "A floating 3D biomechanical chrysalis cradled inside nested interlocking gimbal armatures. An inner glowing gyroid plasma core breathes through carved obsidian armor plates. Spectral balance drives a continuous morph between an armored cocoon, an open gyro-astrolabe, and a flared crystalline crown, while kicks pulse thermal core emission and hats sharpen the outer rim facets.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-22",
  "CATEGORIES": ["3d", "raymarching", "generative", "morph", "biomech", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "coreGlow",  "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Core Radiance", "BIND": "level", "BIND_DEPTH": 0.35 },
    { "NAME": "ringScale", "TYPE": "float", "DEFAULT": 0.88, "MIN": 0.70, "MAX": 1.05,
      "LABEL": "Gimbal Scale", "BIND": "bass", "BIND_DEPTH": 0.20 },
    { "NAME": "gyroidFreq","TYPE": "float", "DEFAULT": 7.50, "MIN": 4.00, "MAX": 12.0,
      "LABEL": "Lattice Density", "BIND": "mid", "BIND_DEPTH": 0.30 },
    { "NAME": "snapEdge",  "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Facet Sharpness", "BIND": "hat", "BIND_DEPTH": 0.40 }
  ]
}*/

#define PI 3.14159265359
#define TAU 6.28318530718
#define MAX_STEPS 52
#define SURF_DIST 0.0015
#define MAX_DIST 5.0

mat2 rot2D(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// Gyroid SDF
float sdGyroid(vec3 p, float scale, float thickness, float bias) {
    vec3 q = p * scale;
    float g = dot(sin(q), cos(q.zxy)) + bias;
    return abs(g) / scale - thickness;
}

// 3D Capsule
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

// 3D Torus
float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

// Global scene distance and material identification
// Returns vec2(distance, matID) where:
// matID 1.0 = Obsidian Shell
// matID 2.0 = Gimbal Rings
// matID 3.0 = Glowing Plasma Core
vec2 mapScene(vec3 p, float morphState, float ph) {
    // Symmetrical fold across X for bilateral biomech feel
    vec3 pSym = p;
    pSym.x = abs(pSym.x);

    // 1. Central Core Capsule / Chrysalis Base
    float capLen = mix(0.42, 0.32, morphState);
    float capR = mix(0.24, 0.18, morphState) * (1.0 + 0.05 * sin(ph * TAU * 2.0));
    float dCoreBase = sdCapsule(p, vec3(0.0, -capLen, 0.0), vec3(0.0, capLen, 0.0), capR);

    // Gyroid carving inside the chrysalis
    float gThick = mix(0.035, 0.015, morphState);
    float dGyr = sdGyroid(p, gyroidFreq, gThick, 0.25 * sin(p.y * 5.0 + ph * TAU));
    
    // Armored outer shell (slit cuts)
    float dShell = max(dCoreBase, -dGyr);

    // 2. Crown / Spines (Archetype 3 morph)
    vec3 pSpine = pSym;
    pSpine.yz *= rot2D(0.35 + 0.2 * sin(ph * TAU));
    pSpine.xy *= rot2D(0.40);
    float dSpines = sdCapsule(pSpine, vec3(0.1, 0.2, 0.0), vec3(0.25, 0.55, 0.1), 0.018);
    dShell = min(dShell, mix(dShell, dSpines, morphState * 0.7));

    // 3. Inner Glowing Gyroid Core
    float dInnerPlasma = max(dCoreBase + 0.04, dGyr);

    // 4. Gimbal Rings
    float rScale = ringScale * 0.46;
    
    // Outer Ring
    vec3 pRing1 = p;
    pRing1.xz *= rot2D(ph * TAU);
    pRing1.yz *= rot2D(0.45);
    float dRing1 = sdTorus(pRing1, vec2(rScale, 0.014));
    
    // Middle Ring
    vec3 pRing2 = p;
    pRing2.xy *= rot2D(-ph * TAU * 1.5);
    pRing2.xz *= rot2D(0.65);
    float dRing2 = sdTorus(pRing2, vec2(rScale * 0.82, 0.012));

    // Inner Ring
    vec3 pRing3 = p;
    pRing3.yz *= rot2D(ph * TAU * 2.0);
    pRing3.xy *= rot2D(-0.35);
    float dRing3 = sdTorus(pRing3, vec2(rScale * 0.65, 0.010));

    float dRings = min(dRing1, min(dRing2, dRing3));

    // Combine into materials
    float dObj = min(dShell, dRings);
    float mat = (dShell < dRings) ? 1.0 : 2.0;

    if (dInnerPlasma < dObj) {
        dObj = dInnerPlasma;
        mat = 3.0;
    }

    return vec2(dObj, mat);
}

// 4-tap Tetrahedral Normal for fast, high-quality normals
vec3 calcNormal(vec3 p, float morphState, float ph) {
    vec2 e = vec2(0.002, -0.002);
    return normalize(
        e.xyy * mapScene(p + e.xyy, morphState, ph).x +
        e.yyx * mapScene(p + e.yyx, morphState, ph).x +
        e.yxy * mapScene(p + e.yxy, morphState, ph).x +
        e.xxx * mapScene(p + e.xxx, morphState, ph).x
    );
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Strict boundary check: Keep outside dark to prevent edge leaks
    float distToCenter = length(uv);
    if (distToCenter > 0.47) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Seamless loop phase
    float ph = fract(TIME / 12.0);

    // Spectral morph selector: Balances Bass, Mid, Treble into [0..1]
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float totalAudio = lo + md + hi + 1e-4;
    float spectralTilt = (md * 0.6 + hi * 1.2) / totalAudio;
    float morphState = clamp((spectralTilt - 0.35) * 1.5, 0.0, 1.0);

    // Audio transient drivers
    float kickPulse = AUDIO_KICK * 0.25;
    float hatSharp = snapEdge * (1.0 + AUDIO_HAT * 1.2);
    float beatFlash = AUDIO_BEAT * 0.35;

    // Camera from the reserved uniforms CAM_DIR and CAM_UP
    float camDist = 1.60;
    vec3 ro = CAM_DIR * camDist;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.30 * ww);

    // Analytic bounding sphere check: exit immediately for rays that miss
    float bBound = 0.48;
    float bq = dot(ro, rd);
    float cq = dot(ro, ro) - bBound * bBound;
    float hq = bq * bq - cq;
    if (hq < 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float sq = sqrt(hq);
    float t0 = max(-bq - sq, 0.0);
    float tMax = -bq + sq;

    // Raymarching inside bounding sphere
    float t = t0;
    float mat = 0.0;
    float hit = 0.0;
    float glowAcc = 0.0;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * t;
        vec2 res = mapScene(p, morphState, ph);
        float d = res.x;

        // Volumetric glow accumulation from inner plasma
        glowAcc += (0.0018 / (0.012 + d * d * 60.0)) * (coreGlow + kickPulse + beatFlash);

        if (d < SURF_DIST) {
            mat = res.y;
            hit = 1.0;
            break;
        }
        t += d * 0.85;
        if (t > tMax) break;
    }

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (hit > 0.5) {
        vec3 p = ro + rd * t;
        vec3 n = calcNormal(p, morphState, ph);
        vec3 v = -rd;

        // Lighting directions
        vec3 lightKey = normalize(vec3(0.6, 0.8, -0.8));
        vec3 lightRim = normalize(vec3(-0.7, -0.4, 0.6));

        // Diffuse & Specular
        float diff = max(dot(n, lightKey), 0.0);
        vec3 h = normalize(lightKey + v);
        float spec = pow(max(dot(n, h), 0.0), 32.0 * hatSharp);

        // Fresnel Rim
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        float rimDiff = max(dot(n, lightRim), 0.0);

        if (mat < 1.5) {
            // Obsidian Biomech Shell: Deep glossy black with iridized specular
            vec3 baseObsidian = vec3(0.02, 0.025, 0.035);
            vec3 specCol = mix(vec3(0.9, 0.95, 1.0), vec3(0.3, 0.8, 1.0), fresnel);
            
            col = baseObsidian + spec * specCol * 2.2 + fresnel * vec3(0.15, 0.45, 0.65) * (0.8 + AUDIO_TREBLE);
            col += rimDiff * vec3(0.2, 0.08, 0.3) * 0.5;
            alpha = 0.96;
        } else if (mat < 2.5) {
            // Gimbal Rings: Titanium / Chrome Filaments
            vec3 baseChrome = vec3(0.08, 0.10, 0.12);
            vec3 ringGlint = vec3(0.9, 0.85, 0.7) * pow(max(dot(n, h), 0.0), 64.0);
            
            col = baseChrome + diff * vec3(0.35, 0.38, 0.42) + ringGlint * (1.5 + hatSharp) + fresnel * vec3(0.8, 0.9, 1.0) * 0.8;
            alpha = 0.94;
        } else {
            // Inner Plasma Core: Bioluminescent Cyan/Amber
            vec3 plasmaCol = mix(vec3(0.1, 0.85, 0.95), vec3(1.0, 0.55, 0.15), 0.5 + 0.5 * sin(ph * TAU * 3.0 + p.y * 4.0));
            col = plasmaCol * (2.2 + 3.2 * kickPulse + beatFlash);
            alpha = 0.98;
        }
    }

    // Add accumulated internal glow smoothly
    vec3 glowColor = mix(vec3(0.05, 0.5, 0.8), vec3(0.9, 0.4, 0.1), morphState);
    float glowMask = smoothstep(0.02, 0.30, glowAcc);
    col += glowAcc * glowColor * 0.40;
    alpha = clamp(alpha + glowMask * 0.45, 0.0, 1.0);

    // Frame boundary softness: smoothly reach zero at radius 0.44
    float edgeMask = 1.0 - smoothstep(0.38, 0.44, distToCenter);
    col *= edgeMask;
    alpha *= edgeMask;

    // Premultiplied alpha output
    gl_FragColor = vec4(col * alpha, alpha);
}
