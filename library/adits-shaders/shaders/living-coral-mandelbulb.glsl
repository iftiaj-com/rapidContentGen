/*{
  "ADITS": 1,
  "DESCRIPTION": "Living abyssal coral Mandelbulb organism with tiered concentric crenellations, fiery terracotta mantle strata, electric cyan-turquoise reef frills, and deep bioluminescent indigo crevices. Bass expands fractal power and coral volume, mid accelerates undulating peristaltic ripple waves, treble sharpens iridescent pearl-crested micro-ridges, and beats trigger deep bio-photonic mantle surges.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "fractal", "creature", "coral", "bioluminescence", "morph", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "coralScale", "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.70, "MAX": 1.30,
      "LABEL": "Coral Scale", "BIND": "bass", "BIND_DEPTH": 0.30 },
    { "NAME": "lobeMorph", "TYPE": "float", "DEFAULT": 7.50, "MIN": 5.00, "MAX": 10.00,
      "LABEL": "Lobe Symmetry", "BIND": "mid", "BIND_DEPTH": 0.35 },
    { "NAME": "bioCyan", "TYPE": "float", "DEFAULT": 1.15, "MIN": 0.30, "MAX": 2.20,
      "LABEL": "Cyan Frill Glow", "BIND": "treble", "BIND_DEPTH": 0.40 },
    { "NAME": "mantleSurge", "TYPE": "float", "DEFAULT": 1.30, "MIN": 0.30, "MAX": 2.50,
      "LABEL": "Mantle Core Surge", "BIND": "beat", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU             6.28318530718
#define PERIOD          16.0
#define MAX_STEPS       58
#define TOLERANCE       0.0010
#define MAX_DIST        6.5
#define FRACTAL_ITERS   7

mat3 rotX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
}

mat3 rotY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 rotZ(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}

// Bounding sphere intersection
bool raySphere(vec3 ro, vec3 rd, float rad, out float tnear, out float tfar) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - rad * rad;
    float h = b * b - c;
    if (h < 0.0) return false;
    h = sqrt(h);
    tnear = max(0.0, -b - h);
    tfar = -b + h;
    return tfar > tnear;
}

// Distance estimator for the living coral Mandelbulb organism
// Returns vec4(distance, orbit_trap_r, orbit_trap_z, orbit_trap_polyp)
vec4 mapOrganism(vec3 p, float pwr, float foldPwr, float phase, float pulse) {
    // Living organic breathing & peristalsis
    float r0 = length(p);
    float peristalsis = sin(r0 * 8.5 - phase * 2.8 + p.z * 5.0) * 0.024 * (1.0 + 0.6 * AUDIO_MID);
    p *= 1.0 + peristalsis;

    vec3 z = p;
    float dr = 1.0;
    float r = 0.0;
    float trapR = 100.0;
    float trapZ = 100.0;
    float trapPolyp = 100.0;

    // Audio reactive power modulation
    float activePower = pwr + 0.35 * sin(phase * 1.5) + 0.45 * AUDIO_BASS;

    for (int i = 0; i < FRACTAL_ITERS; ++i) {
        r = length(z);
        if (r > 2.2) break;

        trapR = min(trapR, r);
        trapZ = min(trapZ, abs(z.z));
        trapPolyp = min(trapPolyp, length(fract(z.xyz * 1.5) - 0.5));

        // Spherical coordinate transformation
        float theta = atan(z.y, z.x);
        float phi = asin(clamp(z.z / max(r, 0.0001), -1.0, 1.0));

        // Living petal undulation
        float wave = sin(theta * foldPwr + phase * 1.8) * 0.045 * (1.0 + pulse);
        phi += wave + phase * 0.03;

        // Derivative accumulation
        dr = pow(r, activePower - 1.0) * dr * activePower + 1.0;

        // Power scaling
        r = pow(r, activePower);
        theta = theta * activePower;
        phi = phi * activePower;

        // Cartesian mapping
        z = r * vec3(cos(theta) * cos(phi), sin(theta) * cos(phi), sin(phi)) + p;
    }

    float d = 0.5 * log(max(r, 1.0001)) * r / max(dr, 0.0001);
    return vec4(d, trapR, trapZ, trapPolyp);
}

// 4-tap tetrahedral normal
vec3 calcNormal(vec3 pos, float pwr, float foldPwr, float phase, float pulse) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0020;
    return normalize(
        k.xyy * mapOrganism(pos + k.xyy * e, pwr, foldPwr, phase, pulse).x +
        k.yyx * mapOrganism(pos + k.yyx * e, pwr, foldPwr, phase, pulse).x +
        k.yxy * mapOrganism(pos + k.yxy * e, pwr, foldPwr, phase, pulse).x +
        k.xxx * mapOrganism(pos + k.xxx * e, pwr, foldPwr, phase, pulse).x
    );
}

// Multi-scale ambient occlusion for sculpted crevice depth
float calcAO(vec3 pos, vec3 nor, float pwr, float foldPwr, float phase, float pulse) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 4; ++i) {
        float h = 0.02 + 0.05 * float(i);
        float d = mapOrganism(pos + h * nor, pwr, foldPwr, phase, pulse).x;
        occ += (h - d) * sca;
        sca *= 0.70;
    }
    return clamp(1.0 - 2.2 * occ, 0.0, 1.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Exact loop period
    float ph = fract(TIME / PERIOD);
    float phase = ph * TAU;

    // Audio reactive pulse inputs
    float pulse = AUDIO_BEAT * 0.8 + AUDIO_KICK * 0.6;
    float trebleShimmer = AUDIO_TREBLE * 0.85 + AUDIO_HAT * 0.5;

    // Slow hypnotic yaw rotation
    float rotSpeed = phase * 0.14;
    mat3 objRot = rotZ(rotSpeed) * rotX(0.88 + sin(phase * 0.25) * 0.08) * rotY(sin(phase * 0.2) * 0.08);

    // Orbitable 3D camera
    const float CAM_DIST = 3.65;
    vec3 ro = CAM_DIR * CAM_DIST;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    const float FOV = 1.38;
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOV * ww);

    // Transform camera ray to object local space
    vec3 roLoc = objRot * ro;
    vec3 rdLoc = objRot * rd;

    // Scale fractal model
    float s = 0.84 * coralScale;
    vec3 roModel = roLoc / s;
    vec3 rdModel = rdLoc;

    float tNear, tFar;
    float t = 0.0;
    vec4 trap = vec4(0.0);
    bool hit = false;
    float totalAlpha = 0.0;
    vec3 col = vec3(0.0);

    if (raySphere(roModel, rdModel, 1.45, tNear, tFar)) {
        t = tNear;
        float d = 0.0;

        for (int i = 0; i < MAX_STEPS; ++i) {
            vec3 p = roModel + rdModel * t;
            vec4 res = mapOrganism(p, 8.0, lobeMorph, phase, pulse);
            d = res.x;
            trap = res;

            if (d < TOLERANCE || t > tFar) {
                if (d < TOLERANCE) hit = true;
                break;
            }
            t += d * 0.70;
        }
    }

    if (hit) {
        vec3 pModel = roModel + rdModel * t;
        vec3 nModel = calcNormal(pModel, 8.0, lobeMorph, phase, pulse);
        vec3 nWorld = objRot * nModel;

        // Key light (warm golden top sunlight), fill light (cool cyan), and warm bottom backlight
        vec3 sunDir = normalize(vec3(0.35, 0.85, 1.05));
        vec3 fillDir = normalize(vec3(-0.7, -0.4, -0.4));
        vec3 backDir = normalize(vec3(0.0, -1.0, 0.5));
        vec3 viewDir = -rd;

        float difSun = max(dot(nWorld, sunDir), 0.0);
        float difFill = max(dot(nWorld, fillDir), 0.0);
        float difBack = max(dot(nWorld, backDir), 0.0);
        float ao = calcAO(pModel, nModel, 8.0, lobeMorph, phase, pulse);

        // Fresnel edge glow
        float fre = clamp(1.0 - max(dot(nWorld, viewDir), 0.0), 0.0, 1.0);
        float fresnel = pow(fre, 3.6);

        // Specular glints on wet living coral
        vec3 halfVec = normalize(sunDir + viewDir);
        float spec = pow(max(dot(nWorld, halfVec), 0.0), 48.0) * (0.8 + 0.6 * trebleShimmer);

        // Rich Color Palette System:
        // 1. Deep Abyssal indigo & royal violet crevices
        vec3 creviceIndigo = vec3(0.012, 0.008, 0.06);
        vec3 deepPurple = vec3(0.18, 0.015, 0.16);
        vec3 deepPrussianNavy = vec3(0.015, 0.04, 0.18);
        vec3 deepAbyssalBlue = vec3(0.008, 0.02, 0.10);

        // 2. Terracotta, burnt orange & fiery amber mantle strata
        vec3 terracotta = vec3(0.82, 0.22, 0.03);
        vec3 fieryAmber = vec3(0.96, 0.48, 0.06);
        vec3 burntUmber = vec3(0.28, 0.05, 0.01);
        vec3 coralPeach = vec3(0.92, 0.40, 0.18);

        // 3. Electric turquoise & cyan-aquamarine reef frills
        vec3 electricCyan = vec3(0.10, 0.78, 0.90);
        vec3 reefTurquoise = vec3(0.04, 0.45, 0.55);
        vec3 deepSeafoam = vec3(0.02, 0.25, 0.35);

        // 4. Pearlescent ivory crenellation crests
        vec3 pearlIvory = vec3(0.98, 0.95, 0.88);

        // Coordinates for multi-tier procedural texturing
        float radXY = length(pModel.xy);
        float zHeight = pModel.z;
        float zTier = clamp(zHeight * 0.75 + 0.5, 0.0, 1.0);

        // Concentric stepped ridges on the central rosette
        float rosetteRings = sin(radXY * 28.0 - zHeight * 7.5);
        float crestStripe = smoothstep(0.80, 0.98, rosetteRings);
        float troughStripe = smoothstep(-0.20, -0.90, rosetteRings);

        // Micro-textures for the bottom coral nodules
        float polypStipple = sin(pModel.x * 38.0) * sin(pModel.y * 38.0) * sin(pModel.z * 38.0);
        float noduleBands = sin(radXY * 36.0 + pModel.z * 18.0);
        float noduleCrests = smoothstep(0.70, 0.95, noduleBands);
        float noduleGrooves = smoothstep(-0.3, -0.85, noduleBands);

        // Tier 1: Apex Rosette (zTier > 0.62)
        vec3 apexCol = mix(terracotta, fieryAmber, smoothstep(0.62, 0.95, zTier));
        apexCol = mix(apexCol, burntUmber, troughStripe * 0.90);
        apexCol = mix(apexCol, pearlIvory, crestStripe * 0.85);
        apexCol = mix(creviceIndigo, apexCol, smoothstep(0.02, 0.12, radXY));

        // Tier 2: Mid Mantle Strata (0.38 <= zTier < 0.62)
        float mantleWave = sin(radXY * 22.0 + pModel.x * 5.0);
        vec3 mantleCol = mix(deepPurple, terracotta, smoothstep(-0.3, 0.4, mantleWave));
        mantleCol = mix(mantleCol, fieryAmber, smoothstep(0.4, 0.9, mantleWave));
        mantleCol = mix(mantleCol, pearlIvory, crestStripe * 0.60);

        // Tier 3A: Lower Reef Shelf (0.18 <= zTier < 0.38)
        // Turquoise/Cyan reef frills with fiery amber floret accents and ivory edges
        float frillStripes = sin(radXY * 32.0 + pModel.y * 8.0);
        vec3 shelfCol = mix(deepSeafoam, reefTurquoise, smoothstep(-0.4, 0.2, frillStripes));
        shelfCol = mix(shelfCol, electricCyan, smoothstep(0.15, 0.80, frillStripes));
        shelfCol = mix(shelfCol, coralPeach, noduleCrests * 0.45); // Orange/peach polyp spots
        shelfCol = mix(shelfCol, pearlIvory, smoothstep(0.85, 0.99, frillStripes) * 0.75);

        // Tier 3B: Abyssal Coral Base & Nodules (zTier < 0.18)
        // Deep indigo/navy base, rich cyan/turquoise ribbed nodules, amber polyp pores, ivory frill rims
        vec3 baseCol = mix(deepAbyssalBlue, deepPrussianNavy, smoothstep(-0.4, 0.3, noduleBands));
        baseCol = mix(baseCol, reefTurquoise, smoothstep(0.1, 0.65, noduleBands));
        baseCol = mix(baseCol, electricCyan, smoothstep(0.60, 0.92, noduleBands));
        baseCol = mix(baseCol, pearlIvory, noduleCrests * 0.85);
        baseCol = mix(deepAbyssalBlue, baseCol, smoothstep(-0.25, 0.15, zTier));

        // Cellular polyp pores on the bottom nodules
        float polypMask = smoothstep(0.45, 0.90, polypStipple);
        baseCol = mix(baseCol, fieryAmber, polypMask * 0.55 * (0.8 + 0.6 * pulse));

        // Deep groove shadows on the bottom nodules
        baseCol = mix(baseCol, creviceIndigo, noduleGrooves * 0.80);

        // Combine lower shelf and abyssal base
        vec3 lowerTierCol = mix(baseCol, shelfCol, smoothstep(0.12, 0.24, zTier));

        // Blend all concentric tiers vertically
        vec3 tissueCol = mix(lowerTierCol, mantleCol, smoothstep(0.34, 0.48, zTier));
        tissueCol = mix(tissueCol, apexCol, smoothstep(0.58, 0.72, zTier));

        // Deep multi-scale shadow integration for sculpted crevice depth
        float creviceMask = smoothstep(0.0, 0.50, ao);
        vec3 creviceBase = mix(creviceIndigo, deepPurple, smoothstep(0.15, 0.75, zTier));
        tissueCol = mix(creviceBase, tissueCol, creviceMask);

        // Bioluminescent vein network in crevices (both top mantle and bottom nodules)
        vec3 veinPulse = fieryAmber * 0.9 * (1.0 - creviceMask) * exp(-radXY * 3.5) * mantleSurge * (0.8 + 1.2 * pulse);
        vec3 cyanFrillGlow = electricCyan * 0.85 * (1.0 - zTier) * (noduleCrests * 0.8 + 0.2) * bioCyan * (0.7 + 0.6 * trebleShimmer);
        vec3 abyssalGlow = deepSeafoam * 0.6 * smoothstep(0.3, 0.0, zTier) * bioCyan;

        // Controlled multi-directional lighting
        vec3 sunLight = vec3(1.05, 0.98, 0.90) * difSun;
        vec3 fillLight = vec3(0.08, 0.35, 0.50) * difFill;
        vec3 bottomBounce = vec3(0.95, 0.48, 0.12) * difBack * 0.45 * (1.0 - zTier); // Warm bottom bounce
        vec3 ambient = vec3(0.04, 0.05, 0.06) * ao;

        vec3 litBody = tissueCol * (sunLight * 0.85 + fillLight * 0.25 + bottomBounce + ambient) * ao;
        vec3 rimGlint = tissueCol * 1.1 * fresnel;
        vec3 specularReflection = pearlIvory * spec * 0.65;

        col = litBody + veinPulse + cyanFrillGlow + abyssalGlow + rimGlint + specularReflection;

        // Depth falloff
        col *= exp(-t * 0.15);
        totalAlpha = 1.0;
    }

    // Concentrated bioluminescent micro-glow strictly hugging the organism
    float rUV = length(uv);
    float haloFalloff = exp(-rUV * 10.0) * (0.025 * bioCyan) * (1.0 + 0.5 * pulse);
    vec3 haloGlow = mix(vec3(0.04, 0.5, 0.7), vec3(0.85, 0.30, 0.06), sin(phase + uv.x * 2.0) * 0.5 + 0.5) * haloFalloff;
    col += haloGlow;

    // ACES filmic tonemapping
    col = max(col, vec3(0.0)) * 0.95;
    col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);

    // S-curve contrast and rich saturation
    col = pow(col, vec3(1.05));
    col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.35);

    // sRGB gamma
    col = mix(1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, 12.92 * col, step(col, vec3(0.0031308)));

    // Smooth boundary feathering to guarantee edge = 0
    float edgeFade = smoothstep(0.48, 0.40, rUV);
    float alpha = clamp(totalAlpha * edgeFade, 0.0, 1.0);

    col *= edgeFade;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
