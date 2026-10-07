/*{
  "ADITS": 1,
  "DESCRIPTION": "Living 3D Lambdabulb bio-fractal organism with sculpted porcelain cauliflower folds, copper-peach mantle crevices, undulating radial tubular crown tendrils, and pulsing iridescent rainbow spark embers. Bass expands fractal power and radial crown volume, mid twists logarithmic petal swirls, treble sharpens pearlescent micro-ridges, and beats ignite internal bioluminescent photonic surges.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-24",
  "CATEGORIES": ["generative", "fractal", "3d", "organism", "bioluminescence", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "organismScale", "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.70, "MAX": 1.30,
      "LABEL": "Organism Scale", "BIND": "bass", "BIND_DEPTH": 0.30 },
    { "NAME": "petalTwist", "TYPE": "float", "DEFAULT": 1.20, "MIN": 0.40, "MAX": 2.40,
      "LABEL": "Petal Swirl Twist", "BIND": "mid", "BIND_DEPTH": 0.35 },
    { "NAME": "iridGleam", "TYPE": "float", "DEFAULT": 1.10, "MIN": 0.30, "MAX": 2.20,
      "LABEL": "Pearlescent Sheen", "BIND": "treble", "BIND_DEPTH": 0.40 },
    { "NAME": "coreSparkPulse", "TYPE": "float", "DEFAULT": 1.25, "MIN": 0.30, "MAX": 2.60,
      "LABEL": "Core Spark Surge", "BIND": "beat", "BIND_DEPTH": 0.45 }
  ]
}*/

#define TAU             6.28318530718
#define PERIOD          16.0
#define MAX_STEPS       58
#define TOLERANCE       0.0011
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

// Bounding sphere intersection for raymarch early-out
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

// Distance estimator for the 3D Lambdabulb bio-fractal organism
// Returns vec4(distance, trap_radius, trap_crevice, trap_ember)
vec4 mapLambdabulb(vec3 p, float pwr, float twist, float phase, float pulse) {
    // Undulating radial crown peristalsis and breathing
    float r0 = length(p);
    float crownBands = sin(r0 * 7.5 - phase * 2.2 + p.z * 4.5);
    float peristalsis = crownBands * 0.026 * (1.0 + 0.65 * AUDIO_MID);
    p *= 1.0 + peristalsis;

    vec3 z = p;
    float dr = 1.0;
    float r = 0.0;
    float trapR = 100.0;
    float trapCrev = 100.0;
    float trapEmber = 100.0;

    // Active power modulated by bass swell
    float activePower = pwr + 0.35 * sin(phase * 1.5) + 0.50 * AUDIO_BASS;

    for (int i = 0; i < FRACTAL_ITERS; ++i) {
        r = length(z);
        if (r > 2.25) break;

        trapR = min(trapR, r);
        trapCrev = min(trapCrev, abs(z.z) + 0.25 * length(z.xy));
        
        // Ember trap: cellular lattice inside deep micro-crevices
        vec3 cCell = fract(z.xyz * 1.85) - 0.5;
        trapEmber = min(trapEmber, length(cCell));

        // Spherical coordinate transformation
        float theta = atan(z.y, z.x);
        float phi = asin(clamp(z.z / max(r, 0.0001), -1.0, 1.0));

        // Baroque Lambdabulb petal swirl & logarithmic spiral folding
        float petalWave = sin(theta * 6.0 + phase * 1.4) * 0.052 * twist * (1.0 + 0.4 * pulse);
        phi += petalWave + phase * 0.025;

        // Derivative accumulation for distance estimation
        dr = pow(r, activePower - 1.0) * dr * activePower + 1.0;

        // Triplex power scaling
        r = pow(r, activePower);
        theta = theta * activePower;
        phi = phi * activePower;

        // Ron Barnett's 3D Lambdabulb logistic mapping
        vec3 zPow = r * vec3(cos(theta) * cos(phi), sin(theta) * cos(phi), sin(phi));
        z = zPow + p;
    }

    float d = 0.5 * log(max(r, 1.0001)) * r / max(dr, 0.0001);
    return vec4(d, trapR, trapCrev, trapEmber);
}

// 4-tap tetrahedral normal (exact 4-call budget)
vec3 calcNormal(vec3 pos, float pwr, float twist, float phase, float pulse) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0018;
    return normalize(
        k.xyy * mapLambdabulb(pos + k.xyy * e, pwr, twist, phase, pulse).x +
        k.yyx * mapLambdabulb(pos + k.yyx * e, pwr, twist, phase, pulse).x +
        k.yxy * mapLambdabulb(pos + k.yxy * e, pwr, twist, phase, pulse).x +
        k.xxx * mapLambdabulb(pos + k.xxx * e, pwr, twist, phase, pulse).x
    );
}

// Multi-scale ambient occlusion for deep crevice depth
float calcAO(vec3 pos, vec3 nor, float pwr, float twist, float phase, float pulse) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 4; ++i) {
        float h = 0.02 + 0.05 * float(i);
        float d = mapLambdabulb(pos + h * nor, pwr, twist, phase, pulse).x;
        occ += (h - d) * sca;
        sca *= 0.72;
    }
    return clamp(1.0 - 2.4 * occ, 0.0, 1.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Exact loop period: all continuous phases wrap seamlessly at PERIOD
    float ph = fract(TIME / PERIOD);
    float phase = ph * TAU;

    // Audio reactive pulse inputs
    float pulse = AUDIO_BEAT * 0.85 + AUDIO_KICK * 0.65;
    float trebleShimmer = AUDIO_TREBLE * 0.85 + AUDIO_HAT * 0.50;

    // Slow hypnotic yaw and pitch rotation
    float rotSpeed = phase * 0.125;
    mat3 objRot = rotZ(rotSpeed) * rotX(0.72 + sin(phase * 0.22) * 0.08) * rotY(sin(phase * 0.18) * 0.08);

    // Orbitable 3D camera
    const float CAM_DIST = 3.60;
    vec3 ro = CAM_DIR * CAM_DIST;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    const float FOV = 1.40;
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOV * ww);

    // Transform ray to object local space
    vec3 roLoc = objRot * ro;
    vec3 rdLoc = objRot * rd;

    // Scale fractal model with bass uniform
    float s = 0.82 * organismScale;
    vec3 roModel = roLoc / s;
    vec3 rdModel = rdLoc;

    float tNear, tFar;
    float t = 0.0;
    vec4 trap = vec4(0.0);
    bool hit = false;
    float totalAlpha = 0.0;
    vec3 col = vec3(0.0);

    if (raySphere(roModel, rdModel, 1.48, tNear, tFar)) {
        t = tNear;
        float d = 0.0;

        for (int i = 0; i < MAX_STEPS; ++i) {
            vec3 p = roModel + rdModel * t;
            vec4 res = mapLambdabulb(p, 7.8, petalTwist, phase, pulse);
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
        vec3 nModel = calcNormal(pModel, 7.8, petalTwist, phase, pulse);
        vec3 nWorld = objRot * nModel;

        // Three-point sculptural lighting
        vec3 sunDir = normalize(vec3(0.40, 0.90, 0.95));     // Warm high key light
        vec3 fillDir = normalize(vec3(-0.75, -0.30, -0.40)); // Cool soft fill
        vec3 backDir = normalize(vec3(0.0, -1.0, 0.60));     // Warm bottom bounce
        vec3 viewDir = -rd;

        float difSun = max(dot(nWorld, sunDir), 0.0);
        float difFill = max(dot(nWorld, fillDir), 0.0);
        float difBack = max(dot(nWorld, backDir), 0.0);
        float ao = calcAO(pModel, nModel, 7.8, petalTwist, phase, pulse);

        // Fresnel edge sheen
        float fre = clamp(1.0 - max(dot(nWorld, viewDir), 0.0), 0.0, 1.0);
        float fresnel = pow(fre, 3.4);

        // Micro specular glints on polished porcelain folds
        vec3 halfSun = normalize(sunDir + viewDir);
        float spec = pow(max(dot(nWorld, halfSun), 0.0), 40.0) * (0.85 + 0.65 * trebleShimmer);

        // Palette System based on analyzed video characteristics:
        // 1. Sculpted porcelain & bone alabaster crust
        vec3 porcelainAlabaster = vec3(0.96, 0.94, 0.90);
        vec3 warmBone = vec3(0.88, 0.82, 0.74);

        // 2. Terracotta, peach-copper & warm amber mantle strata
        vec3 peachCopper = vec3(0.90, 0.48, 0.32);
        vec3 terracotta = vec3(0.78, 0.26, 0.08);
        vec3 burntUmber = vec3(0.24, 0.06, 0.02);

        // 3. Deep shadowed fissure indigo
        vec3 creviceIndigo = vec3(0.015, 0.010, 0.045);

        // Procedural spatial stratification
        float radXY = length(pModel.xy);
        float zHeight = pModel.z;
        float zTier = clamp(zHeight * 0.72 + 0.50, 0.0, 1.0);

        // Fine porcelain micro-crenellations
        float microBands = sin(radXY * 32.0 - zHeight * 10.0 + pModel.x * 6.0);
        float crestLine = smoothstep(0.68, 0.96, microBands);
        float grooveLine = smoothstep(-0.25, -0.85, microBands);

        // Outer alabaster shell blending into inner copper/peach mantle
        float depthBlend = smoothstep(0.05, 0.42, trap.y);
        vec3 tissueCol = mix(peachCopper, porcelainAlabaster, depthBlend);
        tissueCol = mix(tissueCol, terracotta, smoothstep(0.40, 0.85, 1.0 - zTier) * (1.0 - depthBlend));
        tissueCol = mix(tissueCol, warmBone, crestLine * 0.55);
        tissueCol = mix(tissueCol, burntUmber, grooveLine * 0.75 * (1.0 - depthBlend));

        // Crevice ambient occlusion integration
        float creviceMask = smoothstep(0.02, 0.52, ao);
        tissueCol = mix(creviceIndigo, tissueCol, creviceMask);

        // Multicolored internal bioluminescent ember sparks (emerald, ruby, gold, cyan)
        // Flaring from deep crevices as seen in Video 2 & Video 4
        float emberDist = trap.w;
        float sparkMask = smoothstep(0.22, 0.02, emberDist) * (1.0 - creviceMask);
        
        // Color variation across spatial cells
        vec3 sparkEmerald = vec3(0.12, 0.98, 0.45);
        vec3 sparkRuby    = vec3(1.00, 0.18, 0.22);
        vec3 sparkGold    = vec3(1.00, 0.75, 0.12);
        vec3 sparkCyan    = vec3(0.15, 0.85, 1.00);

        float cellSeed = fract(pModel.x * 5.2 + pModel.y * 3.7 + pModel.z * 4.1);
        vec3 sparkColor = mix(sparkEmerald, sparkRuby, step(0.25, cellSeed));
        sparkColor = mix(sparkColor, sparkGold, step(0.50, cellSeed));
        sparkColor = mix(sparkColor, sparkCyan, step(0.75, cellSeed));

        vec3 internalSparkEmber = sparkColor * sparkMask * 3.2 * coreSparkPulse * (0.75 + 1.25 * pulse);

        // Core photonic mantle surge radiating through fissures
        vec3 coreSurge = mix(peachCopper, sparkGold, 0.5) * (1.0 - creviceMask) * exp(-radXY * 3.2) * (0.8 + 1.2 * pulse);

        // Directional illumination & ambient reflection
        vec3 sunLight = vec3(1.06, 0.98, 0.92) * difSun;
        vec3 fillLight = vec3(0.12, 0.28, 0.45) * difFill;
        vec3 bounceLight = vec3(0.85, 0.42, 0.18) * difBack * 0.40 * (1.0 - zTier);
        vec3 ambient = vec3(0.045, 0.050, 0.060) * ao;

        vec3 litBody = tissueCol * (sunLight * 0.85 + fillLight * 0.25 + bounceLight + ambient) * ao;

        // Pearlescent fresnel sheen with chromatic rim glint
        vec3 iridHue = mix(porcelainAlabaster, vec3(0.85, 0.92, 1.05), fre);
        vec3 rimGlint = iridHue * 1.15 * fresnel * iridGleam;
        vec3 specReflection = porcelainAlabaster * spec * 0.75;

        col = litBody + internalSparkEmber + coreSurge + rimGlint + specReflection;

        // Atmospheric depth falloff
        col *= exp(-t * 0.14);
        totalAlpha = 1.0;
    }

    // Localized bioluminescent micro-glow strictly surrounding the organism
    float rUV = length(uv);
    float haloFalloff = exp(-rUV * 9.5) * (0.024 * iridGleam) * (1.0 + 0.45 * pulse);
    vec3 haloGlow = mix(vec3(0.85, 0.45, 0.20), vec3(0.20, 0.80, 0.95), sin(phase + uv.x * 2.5) * 0.5 + 0.5) * haloFalloff;
    col += haloGlow;

    // ACES filmic tonemapping
    col = max(col, vec3(0.0)) * 0.96;
    col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);

    // S-curve contrast and subtle saturation enhancement
    col = pow(col, vec3(1.04));
    col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.30);

    // sRGB gamma correction
    col = mix(1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, 12.92 * col, step(col, vec3(0.0031308)));

    // Smooth boundary feathering to guarantee edge = 0
    float edgeFade = smoothstep(0.48, 0.40, rUV);
    float alpha = clamp(totalAlpha * edgeFade, 0.0, 1.0);

    col *= edgeFade;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
