/*{
  "ADITS": 1,
  "DESCRIPTION": "A magnetic confinement fusion tokamak featuring D-shaped toroidal field coils, a central solenoid transformer, and a burning thermonuclear plasma torus with helical magnetic flux lines and Bremsstrahlung emission, morphing spectrally between quiescent H-mode confinement, twisted helical stellarator mode, and turbulent filamentary ELM bursts.",
  "CREDIT": "gemini-3.8-flash",
  "DATE": "2026-09-17",
  "CATEGORIES": ["generative", "3d", "physics", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",     "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_mode",      "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "plasma_current", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Plasma Current", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "magnetic_shear", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Magnetic Shear", "BIND": "mid", "BIND_DEPTH": 0.55 },
    { "NAME": "instability",    "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.05, "MAX": 0.80,
      "LABEL": "Turbulence",     "BIND": "treble", "BIND_DEPTH": 0.60 },
    { "NAME": "glow_tint",      "TYPE": "color", "DEFAULT": [0.18, 0.76, 1.00, 1.00],
      "LABEL": "Core Plasma Tint" }
  ]
}*/

#define TAU          6.28318530718
#define PERIOD       16.0
#define ORBIT        6.05
#define BOUND_RADIUS 1.28
#define MARCH_STEPS  56

// 2D rotation helper
void pR(inout vec2 p, float a) {
    p = cos(a) * p + sin(a) * vec2(p.y, -p.x);
}

// Analytic bounding sphere intersection to early-out raymarch misses
bool sph(vec3 ro, vec3 rd, float ra, out float t0, out float t1) {
    t0 = 0.0;
    t1 = 0.0;
    float b = dot(ro, rd);
    float c = dot(ro, ro) - ra * ra;
    float h = b * b - c;
    if (h < 0.0) return false;
    h = sqrt(h);
    t0 = -b - h;
    t1 = -b + h;
    return t1 > 0.0;
}

// Polynomial smooth minimum for mechanical fillet junctions
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Global parameters set once per pixel in main()
float g_ph;
float g_q0;
float g_twist;
float g_coreScale;
float g_coilBore;
float g_coilW;
float g_elmScatter;

// Solov'ev equilibrium geometry & physical dimensions
// Major radius R0 = 0.68, elongation kappa = 1.62, triangularity delta = 0.26
float map(vec3 p) {
    // Continuous precessional spin around major axis tied to strict integer harmonic
    pR(p.xz, g_ph * 1.0);

    float R = length(p.xz);
    float aTor = atan(p.z, p.x + 1e-7);

    // D-shaped plasma coordinates with elongation kappa and triangularity delta
    float kappa = 1.62;
    float delta = 0.26;
    float yScaled = p.y / kappa;
    float rD = R - 0.68 + delta * (yScaled * yScaled);
    float poloidalDist = sqrt(rD * rD + yScaled * yScaled);

    // 1. Central Solenoid (CS) transformer stack at inner axis
    float csCyl = max(abs(R - 0.19) - 0.024, abs(p.y) - 0.68);
    // Coolant / winding ribs etched into solenoid
    float csRibs = sin(p.y * 50.0);
    float dCS = csCyl - 0.003 * csRibs;

    // 2. Toroidal Field (TF) Coils: 16 discrete D-shaped superconducting magnetic coils
    const float N_COILS = 16.0;
    float sec = TAU / N_COILS;
    float aSec = mod(aTor + sec * 0.5, sec) - sec * 0.5;
    
    // Stellarator mode helical modular wobble on coil frame
    float coilWobble = g_twist * 0.035 * sin(aTor * 3.0 + p.y * 6.0 + g_ph * 2.0);
    float dTor = R * abs(aSec) + coilWobble;

    // D-shaped coil loop cross-section
    float coilRing = abs(poloidalDist - g_coilBore) - 0.038;
    float dTF = max(coilRing, dTor - g_coilW);
    // Truncate coil inner bore so it connects to central bucking cylinder
    dTF = max(dTF, 0.17 - R);
    dTF = max(dTF, abs(p.y) - 0.74);

    // 3. Poloidal Field (PF) shaping rings: 4 external horizontal magnetic coils
    vec2 pf1 = vec2(R - 1.08, abs(p.y) - 0.46);
    vec2 pf2 = vec2(R - 1.16, abs(p.y) - 0.22);
    float dPF = min(length(pf1) - 0.032, length(pf2) - 0.034);

    // 4. Divertor target plates at top and bottom null points
    float dDiv = max(abs(poloidalDist - 0.38) - 0.025, -p.y - 0.44);
    dDiv = max(dDiv, abs(R - 0.64) - 0.18);

    // Combine structural components with smooth filleted joints
    float d = smin(dTF, dPF, 0.025);
    d = smin(d, dCS, 0.030);
    d = smin(d, dDiv, 0.020);

    return d;
}

// 4-tap tetrahedral normal
vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Dark cryostat alloy with high-specular reflective rims
vec3 shadeCryostat(vec3 n, vec3 rd, vec3 pos) {
    vec3 viewDir = -rd;
    vec3 refl = reflect(rd, n);
    float up = refl.y;

    // Brushed titanium / obsidian base tone
    vec3 col = mix(vec3(0.012, 0.016, 0.024),
                   vec3(0.060, 0.085, 0.125),
                   smoothstep(-0.5, 0.6, up));

    // Primary key specular light highlight
    vec3 lightDir = normalize(vec3(0.60, 0.85, 0.45));
    float spec = pow(max(dot(refl, lightDir), 0.0), 48.0);
    col += vec3(0.92, 0.96, 1.00) * spec * 2.8;

    // Secondary fill specular
    vec3 fillDir = normalize(vec3(-0.70, 0.30, -0.65));
    float spec2 = pow(max(dot(refl, fillDir), 0.0), 20.0);
    col += glow_tint.rgb * spec2 * 0.85;

    // Grazing Fresnel rim highlight
    float fres = pow(clamp(1.0 - dot(n, viewDir), 0.0, 1.0), 3.5);
    col += mix(vec3(0.35, 0.65, 0.95), vec3(1.0), 0.40) * fres * 1.5;

    // Divertor heat glow on the lower tungsten armor tiles
    if (pos.y < -0.36) {
        float heat = smoothstep(-0.36, -0.48, pos.y);
        col += vec3(1.00, 0.42, 0.10) * heat * (1.0 + 2.4 * AUDIO_KICK);
    }

    return col;
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Radial bounding mask: keeps silhouette within radius 0.46, closes by 0.478
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Phase wraps seamlessly over 16 seconds
    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- Spectral Morph Selector (Guide §12.2 - 12.4, 12.7) -----------------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum; // 0 = all bass, 1 = all treble

    // Range expansion around rest point
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);

    // Fast onset transients shoving the selector
    sel = clamp(sel + 0.42 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);

    // Graceful rest archetype at silence
    float lively = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_mode, sel, lively);

    // 3 Archetypes Kernel Weights (Guide §12.6)
    // Archetype 0: Quiescent H-Mode Confinement (Bass)
    // Archetype 1: Helical Stellarator / Advanced Tokamak (Mid)
    // Archetype 2: Turbulent ELM Filament Burst (Treble)
    float x = sel * 2.0;
    float w0 = clamp(1.0 - abs(x)       * 1.65, 0.0, 1.0);
    float w1 = clamp(1.0 - abs(x - 1.0) * 1.65, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(x - 2.0) * 1.65, 0.0, 1.0);
    float wsum = w0 + w1 + w2 + 1e-4;
    w0 /= wsum; w1 /= wsum; w2 /= wsum;

    // Interpolate physical parameters across archetypes
    g_q0          = w0 * 1.05 + w1 * 1.85 + w2 * 2.45;
    g_twist       = w0 * 0.00 + w1 * 0.85 + w2 * 0.35;
    g_coreScale   = w0 * 1.25 + w1 * 0.95 + w2 * 0.70;
    g_coilBore    = w0 * 0.44 + w1 * 0.47 + w2 * 0.42;
    g_coilW       = w0 * 0.034 + w1 * 0.028 + w2 * 0.022;
    g_elmScatter  = w0 * 0.05 + w1 * 0.25 + w2 * 1.00;

    // Continuous audio-bound parameter modulations
    float Ip = plasma_current * (1.0 + 0.35 * AUDIO_KICK);
    g_coreScale *= 0.85 + 0.40 * Ip;
    float shear = magnetic_shear * (1.0 + 0.25 * AUDIO_MID);
    g_q0 *= 0.80 + 0.40 * shear;
    float turb = instability * (1.0 + 0.45 * AUDIO_HAT);

    // ---- Camera Model (Guide §5) --------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.85 * ww);

    // Precessional tilt harmonic
    float tiltHarmonic = 0.18 * sin(g_ph * 1.0) + 0.22;
    pR(ro.yz, tiltHarmonic);
    pR(rd.yz, tiltHarmonic);

    vec3 col = vec3(0.0);
    float alpha = 0.0;
    float nearApproach = 1e9;

    // Plasma volumetric accumulation quantities
    float plasmaCoreGlow = 0.0;
    float plasmaFilamentGlow = 0.0;
    float dAlphaEdgeGlow = 0.0;

    // Analytic bounding sphere intersection
    float tb0, tb1;
    if (sph(ro, rd, BOUND_RADIUS, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        float tHit = 1e9;
        vec3 hitP = vec3(0.0);
        vec3 p = ro + rd * t;

        // 1. Raymarch the solid cryostat & coil structures first
        for (int i = 0; i < MARCH_STEPS; i++) {
            p = ro + rd * t;
            float d = map(p);
            nearApproach = min(nearApproach, d / max(t, 0.5));

            if (d < 0.0012) {
                hit = true;
                tHit = t;
                hitP = p;
                break;
            }
            t += d * 0.85;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(hitP);
            col = shadeCryostat(n, rd, hitP);
            alpha = 1.0;
        }

        // 2. Plasma volumetric sampling along ray inside the chamber (up to first solid surface)
        float tMaxVol = min(tb1, tHit);
        float tDist = max(0.0, tMaxVol - tb0);
        float tStep = tDist / 8.0;
        float tSample = tb0 + tStep * 0.5;

        for (int j = 0; j < 8; j++) {
            vec3 pVol = ro + rd * tSample;
            pR(pVol.xz, g_ph * 1.0);

            float Rvol = length(pVol.xz);
            float aTorVol = atan(pVol.z, pVol.x + 1e-7);
            float yNorm = pVol.y / 1.62;
            float rDvol = Rvol - 0.68 + 0.26 * (yNorm * yNorm);
            float polDist = sqrt(rDvol * rDvol + yNorm * yNorm);

            // Plasma exists within minor radius a = 0.32
            if (polDist < 0.34) {
                float polAngle = atan(yNorm, rDvol);
                
                // Helical magnetic field safety factor q(r)
                float qProfile = g_q0 + 2.0 * (polDist / 0.32) * (polDist / 0.32);
                float psi = polAngle - qProfile * aTorVol - g_ph * 2.0;

                // Core Bremsstrahlung thermal radiation (I ~ n_e^2 * sqrt(T_e))
                float rNorm = polDist / (0.13 * g_coreScale);
                float brems = exp(-rNorm * rNorm * 3.2);
                plasmaCoreGlow += brems * tStep * (1.8 + 0.8 * AUDIO_BEAT);

                // Helical magnetic flux tube filaments
                float filPattern = cos(psi * 7.0);
                filPattern = filPattern * filPattern * filPattern * filPattern;
                float filRad = smoothstep(0.06, 0.20, polDist) * smoothstep(0.33, 0.22, polDist);

                // Runaway electron flares and magnetic turbulence sparkles along field lines
                float spark = pow(max(0.0, sin(psi * 14.0 + aTorVol * 8.0 - g_ph * 4.0)), 16.0);
                float filTotal = filPattern + spark * (1.2 * turb + 1.8 * AUDIO_HAT);
                plasmaFilamentGlow += filTotal * filRad * tStep * (2.4 + 3.2 * turb);

                // Edge D-Alpha Balmer series recombination glow (656.3 nm)
                float dAlphaRing = exp(-pow((polDist - 0.29) / 0.026, 2.0));
                dAlphaEdgeGlow += dAlphaRing * tStep * (1.8 + 1.2 * g_elmScatter);
            }

            tSample += tStep;
        }
    }

    // ---- Volumetric Plasma Lighting & Color Synthesis -----------------------
    vec3 coreColor = mix(vec3(0.92, 0.98, 1.00), glow_tint.rgb, 0.30);
    vec3 filColor  = mix(glow_tint.rgb, vec3(0.55, 0.35, 1.00), 0.50);
    vec3 dAlphaCol = vec3(1.00, 0.18, 0.42);

    vec3 plasmaLight = coreColor * plasmaCoreGlow * (1.2 + 1.2 * Ip)
                     + filColor  * plasmaFilamentGlow * (1.0 + 1.4 * turb)
                     + dAlphaCol * dAlphaEdgeGlow * (1.0 + 1.8 * g_elmScatter);

    // Combine surface shading with volumetric plasma light
    if (alpha > 0.5) {
        // Coil hit: metal reflects inner plasma light from edges and gaps
        col += plasmaLight * 0.35;
    } else {
        // Ray passed through coil gaps directly into the core
        col = plasmaLight;
        float plasmaAlpha = clamp(plasmaCoreGlow * 1.1 + plasmaFilamentGlow * 0.75 + dAlphaEdgeGlow * 0.65, 0.0, 0.94);
        alpha = plasmaAlpha;
    }

    // Bounded magnetic cage outer aura based on ray closest approach
    float ca = clamp(1.0 - nearApproach * 4.8, 0.0, 1.0);
    float aura = (pow(ca, 5.0) * 0.35 + pow(ca, 20.0) * 0.65) * (1.0 - alpha * 0.5);
    aura *= smoothstep(0.442, 0.08, rr) * (0.50 + 0.85 * AUDIO_BEAT);
    col += mix(glow_tint.rgb, vec3(1.0), 0.30) * aura * 1.2;
    alpha = clamp(alpha + aura * 0.50, 0.0, 1.0);

    // High dynamic range tone curve and color saturation
    col = col / (1.0 + col * 0.26);
    col = pow(max(col, 0.0), vec3(0.94));

    // Guide §8 & §10: Premultiplied alpha and strictly bounded edge
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
