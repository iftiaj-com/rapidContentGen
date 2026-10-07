/*{
  "ADITS": 1,
  "DESCRIPTION": "Sacred 3D Alabaster Lambdabulb Astrolabe Vortex with 6-fold gothic calyx petals, chiral logarithmic vortex funnels, concentric three-axis gimbal filigree rings, and a glowing apricot-terracotta singularity core. Bass unfurls the calyx wings and swells fractal volume, mid accelerates chiral vortex twisting and astrolabe ring precession, treble ignites molten copper-gold damascene crests, and beats pulse the radiant core bloom.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-24",
  "CATEGORIES": ["generative", "fractal", "3d", "julia", "lambdabulb", "audio", "astrolabe"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "spiralScale", "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.70, "MAX": 1.30,
      "LABEL": "Calyx Scale", "BIND": "bass", "BIND_DEPTH": 0.30 },
    { "NAME": "triplexTwist", "TYPE": "float", "DEFAULT": 1.15, "MIN": 0.30, "MAX": 2.20,
      "LABEL": "Vortex Chiral Twist", "BIND": "mid", "BIND_DEPTH": 0.35 },
    { "NAME": "filigreeGleam", "TYPE": "float", "DEFAULT": 1.10, "MIN": 0.30, "MAX": 2.20,
      "LABEL": "Copper Damascene Inlay", "BIND": "treble", "BIND_DEPTH": 0.35 },
    { "NAME": "coreBloomPulse", "TYPE": "float", "DEFAULT": 1.20, "MIN": 0.30, "MAX": 2.50,
      "LABEL": "Singularity Core Pulse", "BIND": "beat", "BIND_DEPTH": 0.40 }
  ]
}*/

#define TAU             6.28318530718
#define PERIOD          16.0
#define MAX_STEPS       58
#define TOLERANCE       0.0010
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

// Bounding sphere intersection for raymarch acceleration
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

// Distance estimator: 6-Fold Polyhedral Folded-KIFS Lambdabulb with Chiral Spire & Tri-Axis Astrolabe Rings
// Returns vec4(distance, trap_spiral_vortex, trap_core_depth, trap_filigree)
vec4 mapLambdabulb(vec3 p, float pwr, float twist, float phase, float pulse) {
    // Dynamic organic breathing along harmonic radial bands (strictly integer 2.0 loop)
    float r0 = length(p);
    float breath = sin(r0 * 6.28318 - phase * 2.0) * 0.024 * (1.0 + 0.60 * AUDIO_MID);
    p *= 1.0 + breath;

    // 6-Fold rotational calyx symmetry for sculptural sacred-geometry architecture
    float aRot = atan(p.y, p.x);
    float rXY = length(p.xy);
    const float N_SECTORS = 6.0;
    float sector = floor(aRot * (N_SECTORS / TAU) + 0.5);
    float aLocal = aRot - sector * (TAU / N_SECTORS);
    vec3 pSym = vec3(rXY * cos(aLocal), rXY * sin(aLocal), p.z);

    // Chiral vortex funnel twisting through the Z-axis (strictly integer 2.0 loop)
    float vortexTwist = sin(pSym.z * 3.5 - phase * 2.0 + rXY * 4.5) * 0.032 * twist;
    pSym = rotZ(vortexTwist * 2.5) * pSym;

    vec3 z = pSym;
    float dr = 1.0;
    float r = 0.0;
    float trapSpiral = 100.0;
    float trapCore = 100.0;
    float trapFiligree = 100.0;

    // Active power modulated with audio bass swell (strictly integer 1.0 loop)
    float activePower = pwr + 0.35 * sin(phase * 1.0) + 0.52 * AUDIO_BASS;

    // Julia constant offsets for Ron Barnett's Lambdabulb (strictly integer 1.0 and 2.0 loop)
    vec3 juliaC = vec3(
        0.16 * sin(phase * 1.0),
        0.12 * cos(phase * 1.0),
        -0.24 + 0.08 * sin(phase * 2.0)
    );

    for (int i = 0; i < FRACTAL_ITERS; ++i) {
        // Mirrored polyhedral folds (creates sharp gothic/sacred calyx wings)
        z = abs(z);
        if (z.x < z.y) z.xy = z.yx;
        if (z.x < z.z) z.xz = z.zx;
        if (z.y < z.z) z.yz = z.zy;

        // Subtle scale-fold contraction
        z = z * 1.06 - vec3(0.07, 0.04, 0.05);
        dr = dr * 1.06;

        r = length(z);
        if (r > 2.30) break;

        trapCore = min(trapCore, r);

        // Spherical coordinate transformation
        float theta = atan(z.y, z.x);
        float phi = asin(clamp(z.z / max(r, 0.0001), -1.0, 1.0));

        // Logarithmic multi-arm chiral spiral vortex trap (strictly integer 2.0 loop)
        float spiralArm = abs(sin(4.0 * theta - log(max(r, 0.01)) * 3.2 + phase * 2.0));
        trapSpiral = min(trapSpiral, spiralArm);

        // Triplex power derivative
        dr = pow(r, activePower - 1.0) * dr * activePower + 1.0;

        // Spherical triplex scaling with chiral swirling vortex modulation (strictly integer loops)
        r = pow(r, activePower);
        theta = theta * activePower + sin(phi * 3.5 + phase * 2.0) * 0.075 * twist * (1.0 + 0.35 * pulse);
        phi = phi * activePower + cos(theta * 2.5 + phase * 1.0) * 0.052 * twist;

        // Triplex mapping
        vec3 zPow = r * vec3(cos(theta) * cos(phi), sin(theta) * cos(phi), sin(phi));
        
        // Ron Barnett's 3D Lambdabulb quadratic combination: z = zPow * (1 - z) + c
        z = zPow + juliaC + pSym * 0.58;

        // High-frequency damascene filigree texture accumulation (strictly integer 1.0 loop)
        vec3 fCell = abs(sin(z * 4.8 + phase * 1.0));
        trapFiligree = min(trapFiligree, dot(fCell, vec3(0.333)));
    }

    float dFractal = 0.5 * log(max(r, 1.0001)) * r / max(dr, 0.0001);

    // Orbiting Tri-Axis Astrolabe Gimbal Rings (All in exact integer phase periods)
    // Ring 1: Equatorial fluted ring in slow 1x revolution
    vec3 pRing1 = rotX(phase * 1.0) * rotY(phase * 1.0) * p;
    float ringFluting1 = 0.006 * sin(atan(pRing1.y, pRing1.x) * 18.0 + phase * 2.0);
    float dRing1 = length(vec2(length(pRing1.xy) - 1.18, pRing1.z)) - 0.016 + ringFluting1;

    // Ring 2: Tilted 45-degree ring in 1x counter-revolution
    vec3 pRing2 = rotZ(phase * 1.0 + 0.785) * rotX(-phase * 1.0 + 0.785) * p;
    float ringFluting2 = 0.005 * cos(atan(pRing2.y, pRing2.x) * 12.0 - phase * 2.0);
    float dRing2 = length(vec2(length(pRing2.xy) - 1.28, pRing2.z)) - 0.013 + ringFluting2;

    // Ring 3: Outer Orthogonal Polar Ring in 2x precession
    vec3 pRing3 = rotY(phase * 2.0) * rotZ(1.5708) * p;
    float ringFluting3 = 0.004 * sin(atan(pRing3.y, pRing3.x) * 24.0 + phase * 3.0);
    float dRing3 = length(vec2(length(pRing3.xy) - 1.38, pRing3.z)) - 0.011 + ringFluting3;

    float dRings = min(dRing1, min(dRing2, dRing3));

    // Smooth architectural fusion between the Lambdabulb calyx and orbital astrolabe rings
    float blendK = 0.055;
    float h = clamp(0.5 + 0.5 * (dFractal - dRings) / blendK, 0.0, 1.0);
    float dTotal = mix(dFractal, dRings, h) - blendK * h * (1.0 - h);

    return vec4(dTotal, trapSpiral, trapCore, trapFiligree);
}

// 4-tap tetrahedral normal (4 calls to distance function)
vec3 calcNormal(vec3 pos, float pwr, float twist, float phase, float pulse) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(
        k.xyy * mapLambdabulb(pos + k.xyy * e, pwr, twist, phase, pulse).x +
        k.yyx * mapLambdabulb(pos + k.yyx * e, pwr, twist, phase, pulse).x +
        k.yxy * mapLambdabulb(pos + k.yxy * e, pwr, twist, phase, pulse).x +
        k.xxx * mapLambdabulb(pos + k.xxx * e, pwr, twist, phase, pulse).x
    );
}

// Multi-scale ambient occlusion for deep vortex crevice depth
float calcAO(vec3 pos, vec3 nor, float pwr, float twist, float phase, float pulse) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 4; ++i) {
        float h = 0.02 + 0.048 * float(i);
        float d = mapLambdabulb(pos + h * nor, pwr, twist, phase, pulse).x;
        occ += (h - d) * sca;
        sca *= 0.72;
    }
    return clamp(1.0 - 2.4 * occ, 0.0, 1.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Exact seamless loop period: all continuous phases wrap seamlessly at PERIOD
    float ph = fract(TIME / PERIOD);
    float phase = ph * TAU;

    // Audio reactive pulse inputs
    float pulse = AUDIO_BEAT * 0.85 + AUDIO_KICK * 0.65;
    float trebleShimmer = AUDIO_TREBLE * 0.85 + AUDIO_HAT * 0.55;

    // Exactly 1 full tumbling turn per period (strictly integer 1.0 loop)
    mat3 objRot = rotZ(phase * 1.0) * rotX(0.78 + sin(phase * 1.0) * 0.08) * rotY(cos(phase * 1.0) * 0.08);

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

    // Scale fractal model with bass uniform
    float s = 0.78 * spiralScale;
    vec3 roModel = roLoc / s;
    vec3 rdModel = rdLoc;

    float tNear, tFar;
    float t = 0.0;
    vec4 trap = vec4(0.0);
    bool hit = false;
    float totalAlpha = 0.0;
    vec3 col = vec3(0.0);

    if (raySphere(roModel, rdModel, 1.55, tNear, tFar)) {
        t = tNear;
        float d = 0.0;

        for (int i = 0; i < MAX_STEPS; ++i) {
            vec3 p = roModel + rdModel * t;
            vec4 res = mapLambdabulb(p, 7.8, triplexTwist, phase, pulse);
            d = res.x;
            trap = res;

            if (d < TOLERANCE || t > tFar) {
                if (d < TOLERANCE) hit = true;
                break;
            }
            t += d * 0.72;
        }
    }

    if (hit) {
        vec3 pModel = roModel + rdModel * t;
        vec3 nModel = calcNormal(pModel, 7.8, triplexTwist, phase, pulse);
        vec3 nWorld = objRot * nModel;

        // Three-point soft studio lighting setup
        vec3 sunDir = normalize(vec3(0.38, 0.92, 0.88));     // Warm Key light
        vec3 fillDir = normalize(vec3(-0.72, -0.30, -0.35)); // Cool slate fill
        vec3 backDir = normalize(vec3(0.0, -1.0, 0.55));     // Warm peach bounce
        vec3 viewDir = -rd;

        float difSun = max(dot(nWorld, sunDir), 0.0);
        float difFill = max(dot(nWorld, fillDir), 0.0);
        float difBack = max(dot(nWorld, backDir), 0.0);
        float ao = calcAO(pModel, nModel, 7.8, triplexTwist, phase, pulse);

        // Subsurface scattering approximation (warm light bleeding through translucent porcelain folds)
        float sss = pow(clamp(dot(viewDir, -sunDir + nWorld * 0.40), 0.0, 1.0), 3.2) * (1.0 - ao * 0.60);
        vec3 sssGlow = vec3(0.96, 0.58, 0.38) * sss * 0.90;

        // Multi-lobe specular highlights (soft porcelain sheen + razor glaze highlight)
        vec3 halfSun = normalize(sunDir + viewDir);
        float specSoft = pow(max(dot(nWorld, halfSun), 0.0), 16.0) * 0.35;
        float specSharp = pow(max(dot(nWorld, halfSun), 0.0), 52.0) * (0.85 + 0.65 * trebleShimmer);

        // Fresnel velvet sheen on grazing angles
        float fre = clamp(1.0 - max(dot(nWorld, viewDir), 0.0), 0.0, 1.0);
        float fresnel = pow(fre, 3.4);

        // Curated Color Palette:
        // 1. Alabaster porcelain & creamy bone outer crust
        vec3 alabasterWhite = vec3(0.97, 0.95, 0.92);
        vec3 creamyBone     = vec3(0.91, 0.87, 0.81);

        // 2. Terracotta, toasted peach & apricot core strata
        vec3 toastedPeach   = vec3(0.92, 0.56, 0.40);
        vec3 terracottaRose = vec3(0.80, 0.36, 0.22);
        vec3 moltenCopper   = vec3(0.94, 0.60, 0.24);

        // 3. Dark sepia & deep crevice shadows
        vec3 darkSepia      = vec3(0.12, 0.06, 0.04);
        vec3 deepCrevice    = vec3(0.02, 0.015, 0.012);

        // Spatial and trap-driven material blending
        float radXY = length(pModel.xy);
        float zHeight = pModel.z;

        // Concentric cauliflower micro-ruffles
        float ruffles = sin(radXY * 28.0 - zHeight * 8.0 + pModel.x * 5.0);
        float ruffCrest = smoothstep(0.65, 0.95, ruffles);
        float ruffGroove = smoothstep(-0.25, -0.85, ruffles);

        // Spiral vortex arm mask (swirling into the core)
        float spiralMask = smoothstep(0.08, 0.75, trap.y);

        // Outer alabaster shell transitioning into warm peach/terracotta vortex interior
        float coreDepth = smoothstep(0.08, 0.55, trap.z);
        vec3 tissueCol = mix(toastedPeach, alabasterWhite, coreDepth);
        tissueCol = mix(tissueCol, terracottaRose, (1.0 - spiralMask) * 0.70);
        tissueCol = mix(tissueCol, creamyBone, ruffCrest * 0.50);
        tissueCol = mix(tissueCol, darkSepia, ruffGroove * 0.65 * (1.0 - coreDepth));

        // Intricate damascene copper-gold filigree veins along the spiral crests
        float filigreePattern = smoothstep(0.35, 0.75, trap.w);
        float filigreeMask = filigreePattern * (1.0 - coreDepth * 0.60) * filigreeGleam;
        tissueCol = mix(tissueCol, moltenCopper, filigreeMask * 0.80);

        // Crevice ambient occlusion integration
        float creviceMask = smoothstep(0.02, 0.52, ao);
        tissueCol = mix(deepCrevice, tissueCol, creviceMask);

        // Warm peach/apricot internal radiance pulsing in the center vortex singularity
        vec3 coreRadiance = toastedPeach * 1.45 * (1.0 - creviceMask) * exp(-radXY * 2.6) * coreBloomPulse * (0.85 + 1.15 * pulse);

        // Multi-point lighting integration
        vec3 sunLight = vec3(1.08, 0.99, 0.92) * difSun;
        vec3 fillLight = vec3(0.24, 0.28, 0.34) * difFill;
        vec3 bounceLight = vec3(0.85, 0.48, 0.28) * difBack * 0.38;
        vec3 ambient = vec3(0.05, 0.05, 0.05) * ao;

        vec3 litBody = tissueCol * (sunLight * 0.85 + fillLight * 0.25 + bounceLight + ambient) * ao;

        // Fresnel porcelain sheen & subtle copper rim gleam
        vec3 rimTint = mix(alabasterWhite, moltenCopper, (1.0 - coreDepth) * 0.65);
        vec3 rimGlint = rimTint * 1.15 * fresnel;
        vec3 specReflection = alabasterWhite * (specSoft + specSharp) * 0.75;

        col = litBody + sssGlow + coreRadiance + rimGlint + specReflection;

        // Atmospheric depth falloff
        col *= exp(-t * 0.14);
        totalAlpha = 1.0;
    }

    // Soft localized warm peach ambient halo strictly hugging the silhouette (strictly integer 1.0 loop)
    float rUV = length(uv);
    float haloFalloff = exp(-rUV * 9.5) * (0.022 * coreBloomPulse) * (1.0 + 0.40 * pulse);
    vec3 haloGlow = mix(vec3(0.92, 0.56, 0.40), vec3(0.97, 0.88, 0.78), sin(phase * 1.0 + uv.x * 2.0) * 0.5 + 0.5) * haloFalloff;
    col += haloGlow;

    // ACES filmic tonemapping
    col = max(col, vec3(0.0)) * 0.96;
    col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);

    // S-curve contrast and subtle natural saturation
    col = pow(col, vec3(1.04));
    col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.25);

    // sRGB gamma correction
    col = mix(1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, 12.92 * col, step(col, vec3(0.0031308)));

    // Smooth boundary feathering to guarantee edge = 0
    float edgeFade = smoothstep(0.46, 0.38, rUV);
    float alpha = clamp(totalAlpha * edgeFade, 0.0, 1.0);

    col *= edgeFade;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
