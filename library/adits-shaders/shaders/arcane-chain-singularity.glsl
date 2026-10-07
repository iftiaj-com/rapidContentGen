/*{
  "ADITS": 1,
  "DESCRIPTION": "An arcane singularity enveloped by billowing astral spell veils and interlocking celestial chains that rupture into swirling crystalline shards under acoustic pressure.",
  "CREDIT": "Gemini 3.7 Flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "neon"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "rupture",  "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Chain Rupture", "BIND": "mid", "BIND_DEPTH": 0.45 },
    { "NAME": "veilWarp", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.20, "MAX": 0.95,
      "LABEL": "Astral Veil Twist", "BIND": "treble", "BIND_DEPTH": 0.40 },
    { "NAME": "coreGlow", "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.25, "MAX": 1.10,
      "LABEL": "Core Radiance", "BIND": "bass", "BIND_DEPTH": 0.35 },
    { "NAME": "scale",    "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.65, "MAX": 1.00,
      "LABEL": "Object Scale" }
  ]
}*/

#define PI 3.14159265359
#define TAU 6.28318530718
#define MARCH_STEPS 60

// 2D Rotation matrix
mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// Distance primitives
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdCylinder(vec2 p, float r) {
    return length(p) - r;
}

float sdTorus(vec3 p, vec2 s) {
    vec2 q = vec2(length(p.xz) - s.x, p.y);
    return length(q) - s.y;
}

float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

// Smooth minimum
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Polar domain repetition
vec3 moda(vec2 p, float count) {
    float an = TAU / count;
    float a = atan(p.y, p.x) + an * 0.5;
    float c = floor(a / an);
    a = mod(a, an) - an * 0.5;
    return vec3(vec2(cos(a), sin(a)) * length(p), c);
}

// Hash function
float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Global animated state parameters
float g_time;
float g_phase;
float g_rupture;
float g_veil;
float g_morph;
float g_beat;

// Natural wave oscillation
float getLocalWave(float x) {
    return sin(-g_time * 1.25 + x * 3.0);
}

// Interlocking chain coordinate space
vec3 posChain(vec3 p, float count) {
    p.yz = rot(0.38) * p.yz;
    p.xz = rot(g_time * 0.12) * p.xz;
    
    float za = atan(p.z, p.x);
    vec3 dir = normalize(p);
    
    // Polar repetition around ring
    vec3 m = moda(p.xz, count);
    p.xz = m.xy;
    float lw = getLocalWave(m.z / PI);
    
    // Ring radius breathing
    p.x -= 0.86 - 0.08 * lw * (1.0 + 0.25 * g_beat);
    p.z *= 1.0 - clamp(0.022 / max(abs(p.z), 0.001), 0.0, 1.0);
    
    // Morphing break and link scatter
    float r1 = lw * smoothstep(0.12, 0.55, lw) * (0.6 + 0.8 * g_rupture);
    float r2 = lw * smoothstep(0.38, 0.78, lw) * (0.8 + 1.2 * g_rupture + 0.5 * g_morph);
    
    p += dir * mix(0.0, 0.22 * sin(floor(za * 3.0) + g_time), r1);
    p += dir * mix(0.0, 0.50 * sin(floor(za * 28.0) + g_time * 1.5), r2);
    
    float a = lw * (0.20 + 0.14 * g_morph);
    p.xy = rot(a) * p.xy;
    p.xz = rot(a * 1.2) * p.xz;
    return p;
}

// Interlocking chain ring
float mapChain(vec3 p) {
    float count = 20.0;
    vec2 linkSize = vec2(0.082, 0.017);
    
    // Horizontal links
    vec3 p1 = posChain(p, count);
    float torus1 = sdTorus(p1.yxz, linkSize);
    
    // Perpendicular vertical links
    vec3 pRot = p;
    pRot.yz = rot(0.38) * pRot.yz;
    pRot.xz = rot(g_time * 0.12 + PI / count) * pRot.xz;
    pRot.yz = rot(-0.38) * pRot.yz;
    vec3 p2 = posChain(pRot, count);
    float torus2 = sdTorus(p2.xyz, linkSize);
    
    // Scattered shard particles
    vec3 pShard = p1;
    pShard.x -= 0.14;
    pShard.yz = rot(p.x * 12.0) * pShard.yz;
    float shards = sdBox(pShard, vec3(0.016, 0.007, 0.009));
    
    return min(smin(torus1, torus2, 0.02), shards);
}

// Billowing astral spell veil ribbons
float mapSpell(vec3 p) {
    vec3 sp = p;
    sp.xy = rot(-0.25) * sp.xy;
    sp.yz = rot(0.18) * sp.yz;
    
    float a = atan(sp.z, sp.x);
    float l = length(sp.xz);
    float lw = getLocalWave(a);
    
    // Warping 3D space into sweeping cylindrical veil
    vec3 vp = sp;
    vp.z = l - (0.88 - 0.12 * lw + 0.06 * g_morph);
    
    // Torsade helical twist
    float twistRate = (2.0 + 1.2 * g_veil) * (1.0 + 0.2 * g_beat);
    vp.yz = rot(g_time * 0.7 + a * twistRate) * vp.yz;
    
    // Billowing ribbon sheet
    vec2 thickness = vec2(0.26 - 0.08 * lw, 0.014 + 0.006 * lw);
    float ribbon = sdBox(vp, vec3(4.0, thickness));
    
    // Inner negative cylinder carving
    float cut = 0.28 - 0.12 * lw * (1.0 - 0.25 * g_morph);
    ribbon = max(ribbon, -sdCylinder(vp.zy, cut));
    
    // Secondary counter-flowing ethereal veil
    vec3 vp2 = sp;
    vp2.xy = rot(1.2) * vp2.xy;
    float a2 = atan(vp2.z, vp2.x);
    float l2 = length(vp2.xz);
    float lw2 = getLocalWave(a2 + 2.0);
    vp2.z = l2 - (0.94 + 0.08 * lw2);
    vp2.yz = rot(-g_time * 0.5 + a2 * (1.5 + g_veil)) * vp2.yz;
    float ribbon2 = sdBox(vp2, vec3(4.0, vec2(0.22 - 0.06 * lw2, 0.012)));
    ribbon2 = max(ribbon2, -sdCylinder(vp2.zy, 0.24 - 0.10 * lw2));
    
    return min(ribbon, ribbon2);
}

// Central obsidian crystal sphere with gyroscopic filaments
float mapCore(vec3 p) {
    float r = length(p);
    float coreSphere = r - (0.42 + 0.018 * sin(g_time * 2.0) + 0.03 * g_beat);
    
    vec3 cp = p;
    cp.xz = rot(g_time * 0.4) * cp.xz;
    cp.yz = rot(g_time * 0.25) * cp.yz;
    float gyro1 = sdTorus(cp, vec2(0.45, 0.010));
    
    cp.xy = rot(g_time * 0.6) * cp.xy;
    float gyro2 = sdTorus(cp.yzx, vec2(0.48, 0.008));
    
    return min(coreSphere, min(gyro1, gyro2));
}

// Scene SDF with material ID
float mapScene(vec3 p, out int matId) {
    float dChain = mapChain(p);
    float dSpell = mapSpell(p);
    float dCore = mapCore(p);
    
    float d = min(dSpell, dCore);
    if (dChain < d) {
        matId = 0; // Chains & Shards
        return dChain;
    } else if (dSpell < dCore) {
        matId = 1; // Spell Veil Ribbons
        return dSpell;
    } else {
        matId = 2; // Central Core & Gyro Rings
        return dCore;
    }
}

float map(vec3 p) {
    int dummy;
    return mapScene(p, dummy);
}

// 4-tap tetrahedral normal (§9)
vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0020;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

void main() {
    // Canonical preamble (§7)
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float distOrigin = length(uv);

    // Loop-synchronous timing and reactive parameters
    g_phase = fract(TIME / 16.0);
    g_time = g_phase * TAU;
    g_beat = AUDIO_BEAT;
    g_rupture = rupture + 0.35 * AUDIO_MID;
    g_veil = veilWarp + 0.30 * AUDIO_TREBLE;
    
    // Smooth morph selector
    float spectralDrive = clamp((AUDIO_BASS * 0.45 + AUDIO_MID * 0.35 + AUDIO_TREBLE * 0.20) * 1.4, 0.0, 1.0);
    g_morph = smoothstep(0.25, 0.75, spectralDrive + 0.12 * sin(g_time));

    // Camera setup driven by CAM_DIR and CAM_UP (§5 & §10)
    float effScale = scale * (1.0 + 0.025 * sin(g_phase * TAU * 2.0) + 0.04 * AUDIO_BASS);
    const float ORBIT = 3.6;
    vec3 ro = CAM_DIR * (ORBIT / effScale);
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.85 * ww);

    // Analytic bounding sphere check
    float b = dot(ro, rd);
    float c = dot(ro, ro) - 1.95;
    float h = b * b - c;

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (h > 0.0) {
        float tmin = max(-b - sqrt(h), 0.1);
        float tmax = -b + sqrt(h);
        float t = tmin;
        
        // Volumetric energy accumulation
        vec3 glowAcc = vec3(0.0);
        float covAcc = 0.0;
        
        // Dithering
        float seed = hash12(gl_FragCoord.xy + fract(TIME));
        t += 0.012 * seed;

        for (int i = 0; i < MARCH_STEPS; i++) {
            vec3 p = ro + rd * t;
            int matId;
            float d = mapScene(p, matId);
            
            // Volumetric veil silk glow (Electric Cyan, Violet & Magenta)
            float dSpellLocal = mapSpell(p);
            float veilAura = 0.0016 / (0.006 + dSpellLocal * dSpellLocal * 18.0);
            vec3 veilCol = mix(vec3(0.15, 0.85, 1.0), vec3(0.85, 0.20, 0.95), 0.5 + 0.5 * sin(p.y * 3.5 + g_time));
            glowAcc += veilCol * veilAura * (0.6 + 0.5 * g_veil);
            covAcc += veilAura * 0.30;

            // Subtle core corona
            float dCoreLocal = length(p) - 0.42;
            if (dCoreLocal > 0.0) {
                float coreHalo = 0.0009 / (0.010 + dCoreLocal * dCoreLocal * 20.0);
                vec3 coreHaloCol = mix(vec3(0.12, 0.50, 0.98), vec3(0.25, 0.88, 0.95), 0.5 + 0.5 * cos(g_time));
                glowAcc += coreHaloCol * coreHalo * (coreGlow * 0.75 + 0.25 * AUDIO_BASS);
                covAcc += coreHalo * 0.18;
            }

            // Surface hit
            if (d < 0.0015) {
                vec3 nor = calcNormal(p);
                vec3 ref = reflect(rd, nor);
                float fre = pow(clamp(1.0 + dot(rd, nor), 0.0, 1.0), 3.0);

                // Studio light vectors
                vec3 keyLig = normalize(vec3(0.6, 0.7, 0.5));
                vec3 rimLig = normalize(vec3(-0.6, -0.4, -0.5));
                float difKey = max(dot(nor, keyLig), 0.0);
                float difRim = max(dot(nor, rimLig), 0.0);
                float speKey = pow(max(dot(ref, keyLig), 0.0), 32.0);
                float speRim = pow(max(dot(ref, rimLig), 0.0), 20.0);

                vec3 surfCol = vec3(0.0);

                if (matId == 0) {
                    // Polished Titanium & Dark Chrome Chains
                    vec3 darkChrome = vec3(0.038, 0.040, 0.048);
                    vec3 brightSilver = vec3(0.92, 0.94, 0.98);
                    vec3 goldGlint = vec3(1.0, 0.84, 0.42);
                    
                    surfCol = darkChrome + brightSilver * (difKey * 0.45 + speKey * 2.2);
                    surfCol += mix(brightSilver, goldGlint, fre) * (difRim * 0.6 + speRim * 1.5);
                    surfCol += goldGlint * pow(fre, 4.0) * (0.6 + 0.8 * g_beat);
                    
                    // Breakpoint luminescence & scattering embers
                    float breakZone = smoothstep(0.22, 0.62, getLocalWave(atan(p.z, p.x))) * g_rupture;
                    surfCol += mix(vec3(0.12, 0.88, 1.0), vec3(1.0, 0.75, 0.25), breakZone) * breakZone * 1.5;
                } else if (matId == 1) {
                    // Ethereal Astral Veil Ribbons with Silk Striations
                    vec3 veilBase = mix(vec3(0.02, 0.08, 0.16), vec3(0.18, 0.03, 0.25), 0.5 + 0.5 * sin(g_time + p.x * 2.0));
                    vec3 veilEdge = mix(vec3(0.15, 0.88, 1.0), vec3(0.98, 0.28, 0.88), fre);
                    
                    // Fine silk striation lines
                    float striation = sin(p.z * 48.0 + g_time * 2.0) * 0.5 + 0.5;
                    surfCol = veilBase + veilEdge * (difKey * 0.65 + speKey * 2.2 + fre * 1.8);
                    surfCol += veilEdge * striation * 0.45;
                } else {
                    // Smoky Obsidian Crystal Core with Swirling Caustics
                    vec3 obsidian = vec3(0.018, 0.022, 0.032);
                    vec3 sapphire = vec3(0.10, 0.55, 0.95);
                    vec3 turquoise = vec3(0.18, 0.90, 0.82);
                    
                    // Internal caustic vortex
                    vec3 cp = p;
                    cp.xz = rot(cp.y * 3.2 + g_time * 0.5) * cp.xz;
                    float caustic = sin(cp.x * 12.0 + g_time) * sin(cp.y * 12.0 - g_time) * sin(cp.z * 12.0 + g_time * 0.7);
                    caustic = smoothstep(0.1, 0.8, caustic * 0.5 + 0.5);
                    
                    surfCol = obsidian + mix(sapphire, turquoise, caustic) * (0.50 + 0.35 * sin(g_time)) * coreGlow;
                    surfCol += vec3(0.95, 0.98, 1.0) * speKey * 2.8;
                    surfCol += vec3(0.25, 0.75, 1.0) * fre * (1.2 + 0.6 * g_beat);
                }

                // Composite surface with volumetric aura
                col += (surfCol + glowAcc * 0.70) * (1.0 - alpha);
                alpha = 1.0;
                break;
            }

            if (t > tmax) break;
            t += max(d * 0.80, 0.012);
        }

        // Add residual glow
        if (alpha < 1.0) {
            col += glowAcc;
            alpha = clamp(covAcc, 0.0, 1.0);
        }
    }

    // Strict boundary enforcement (§10): strictly 0 before frame edge at 0.5
    float spatialBound = smoothstep(0.46, 0.38, distOrigin);
    alpha *= spatialBound;
    col *= spatialBound;

    // Premultiplied alpha output (§8)
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
