/*{
  "ADITS": 1,
  "DESCRIPTION": "A bio-electric deep-sea jellyfish lantern whose bioluminescent bell and trailing voltaic tentacles morph across four archetypes under spectral balance. A relaxed radial bell under bass contracts into a pulsing mantle with trailing streams, fractures into a neural filament web, then ignites into a voltaic crown nova under treble.",
  "CREDIT": "claude-sonnet-4-6",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "bioluminescent", "creature", "neon", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.58, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Snap" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.20, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "pulse",   "TYPE": "float", "DEFAULT": 0.90, "MIN": 0.60, "MAX": 1.20,
      "LABEL": "Bell Scale", "BIND": "bass", "BIND_DEPTH": 0.28 },
    { "NAME": "vein",    "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Vein Glow", "BIND": "mid", "BIND_DEPTH": 0.42 },
    { "NAME": "volt",    "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Volt Reach", "BIND": "treble", "BIND_DEPTH": 0.50 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // 20s seamless loop phase
    float ph = fract(TIME / 20.0);

    // Gentle sinusoidal drift: bell hovers slightly above origin
    float swimY  = 0.025 * sin(ph * TAU * 1.5);
    float swimX  = 0.012 * cos(ph * TAU * 2.3);
    vec2  center = vec2(swimX, swimY + 0.04);

    // Working coordinates relative to drifting center
    vec2  p  = uv - center;
    float r  = length(p);
    float a  = atan(p.y, p.x);

    // Scaled coordinates for bell shape
    float sc = pulse;
    vec2  sp = p / sc;
    float sr = length(sp);
    float sa = atan(sp.y, sp.x);

    // Camera-responsive key light
    float lAngle   = 1.85 + 0.45 * sin(ph * TAU) + 0.80 * CAM_DIR.x;
    vec3  lightDir = normalize(vec3(cos(lAngle), sin(lAngle), 0.72 + 0.28 * CAM_DIR.y));

    // ---- Audio Spectral Selector ---------------------------------------------
    float lo  = AUDIO_BASS;
    float md  = AUDIO_MID;
    float hi  = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // Onset: hat drives toward voltaic crown, kick contracts toward pulsed bell
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // Silence rests on resting form (relaxed bell)
    float audioActive = smoothstep(0.015, 0.12, lo + md + hi);
    sel = mix(rest, sel, audioActive);

    // Archetype weights (4 states, triangular kernel slope ~1.5/0.35)
    float k0 = clamp(1.0 - abs(sel - 0.00) / 0.35, 0.0, 1.0);
    float k1 = clamp(1.0 - abs(sel - 0.33) / 0.35, 0.0, 1.0);
    float k2 = clamp(1.0 - abs(sel - 0.67) / 0.35, 0.0, 1.0);
    float k3 = clamp(1.0 - abs(sel - 1.00) / 0.35, 0.0, 1.0);
    float w0 = smoothstep(0.0, 1.0, k0);
    float w1 = smoothstep(0.0, 1.0, k1);
    float w2 = smoothstep(0.0, 1.0, k2);
    float w3 = smoothstep(0.0, 1.0, k3);
    float wSum = w0 + w1 + w2 + w3 + 1e-4;
    w0 /= wSum; w1 /= wSum; w2 /= wSum; w3 /= wSum;

    // Shared continuous parameters (interpolate across selector)
    float bellRadius = mix(0.24, 0.18, sel);   // bell contracts toward treble
    float tentReach  = mix(0.08, 0.40, sel);   // tentacles lengthen toward treble

    // Base color palette: deep-sea bioluminescence
    vec3 colBell    = vec3(0.04, 0.10, 0.28);  // deep indigo bell tissue
    vec3 colVein    = vec3(0.12, 0.72, 0.98);  // electric cyan veins
    vec3 colMagenta = vec3(0.95, 0.18, 0.72);  // magenta bioluminescent nodes
    vec3 colGreen   = vec3(0.22, 0.98, 0.55);  // green photophores
    vec3 colViolet  = vec3(0.55, 0.12, 0.98);  // violet corona discharge
    vec3 colWhite   = vec3(1.00, 0.97, 0.95);  // hot specular

    vec3  colAccum   = vec3(0.0);
    float alphaAccum = 0.0;

    // ---- Archetype 0: Relaxed Bioluminescent Bell (bass) ---------------------
    {
        // 8-fold gentle radial lobes on rim
        float lobeWave = 0.06 * cos(sa * 8.0 + ph * TAU);
        float bellEdge = bellRadius + lobeWave;
        float bellBody = smoothstep(bellEdge + 0.015, bellEdge - 0.010, sr);

        // 8 radial veins from center (computed once via angle, no loop)
        float veinsR  = pow(max(cos(sa * 4.0 + ph * TAU * 0.25), 0.0), 6.0);
        float veinMask = veinsR * smoothstep(bellEdge, 0.01, sr) * smoothstep(0.01, 0.06, sr);

        // Membrane subsurface glow pulsing with beat
        float subPulse = 0.85 + 0.15 * AUDIO_BEAT;

        // Dome surface normal for diffuse/specular
        vec3 norm0 = normalize(vec3(sp * 0.5, sqrt(max(0.0, bellRadius * bellRadius - dot(sp, sp))) + 0.3));
        float diff0 = clamp(dot(norm0, lightDir), 0.0, 1.0);
        float spec0 = pow(clamp(dot(norm0, lightDir), 0.0, 1.0), 18.0);

        // Rim glow band (tight — not a broad fill)
        float rimBand = smoothstep(0.008, 0.001, abs(sr - bellEdge));

        vec3 mCol0 = colBell * (0.5 + 0.5 * diff0) * subPulse * bellBody
                   + colVein * veinMask * (1.2 + 1.0 * vein)
                   + colMagenta * rimBand * 1.1
                   + colWhite * spec0 * bellBody * 0.6;

        // Alpha: rim + veins only (no broad disc fill)
        float a0 = clamp(rimBand * 0.90 + veinMask * 0.80 + bellBody * 0.35, 0.0, 1.0);

        colAccum  += mCol0 * a0 * w0;
        alphaAccum += a0 * w0;
    }

    // ---- Archetype 1: Contracted Pulse with Trailing Tentacles (mid-bass) ---
    {
        float cBell = bellRadius * 0.85;

        // Tighter 12-fold lobe rim
        float lobeW  = 0.045 * cos(sa * 12.0 + ph * TAU);
        float cEdge  = cBell + lobeW;
        float cBody  = smoothstep(cEdge + 0.012, cEdge - 0.008, sr);

        // 12 tentacle streams (constant bound)
        float tentAlpha = 0.0;
        vec3  tentCol   = vec3(0.0);
        for (int i = 0; i < 12; i++) {
            float fi    = float(i);
            float tAng  = PI * 0.35 * (fi / 11.0 - 0.5);
            float tLen  = tentReach * (0.5 + 0.5 * hash11(fi * 1.37));
            vec2  tDir  = vec2(sin(tAng), -cos(tAng));
            vec2  base  = vec2(0.0, -cBell * 0.4);
            float tProj = dot(sp - base, tDir);
            float tPerp = length(sp - base - tDir * tProj);
            float tW    = 0.004 + 0.003 * hash11(fi * 2.11);
            float tMask = smoothstep(tW, tW * 0.3, tPerp)
                        * step(0.0, tProj)
                        * smoothstep(tLen, tLen * 0.3, tProj);
            // Bioluminescent nodes along tentacle
            float nPhase = tProj / (tLen + 0.001) * 8.0 - ph * 12.0;
            float node   = tMask * smoothstep(0.5, 0.9, cos(nPhase * PI));
            tentAlpha += clamp(tMask + node * 0.6, 0.0, 1.0);
            tentCol   += colVein * tMask * (0.7 + 0.5 * vein)
                       + colGreen * node * (1.0 + 0.8 * snap * AUDIO_KICK);
        }
        tentAlpha = clamp(tentAlpha, 0.0, 1.0);
        tentCol   = clamp(tentCol, vec3(0.0), vec3(3.0));

        vec3 mCol1 = colBell * cBody * (0.6 + 0.4 * vein)
                   + colVein * cBody * 0.45
                   + tentCol;

        float a1 = clamp(cBody * 0.82 + tentAlpha * 0.90, 0.0, 1.0);

        colAccum  += mCol1 * a1 * w1;
        alphaAccum += a1 * w1;
    }

    // ---- Archetype 2: Neural Filament Web (mid-treble) -----------------------
    {
        // Dual counter-rotating logarithmic spiral lattice
        float lnR  = log(max(sr, 0.001) / 0.025);
        float lattA = fract((sa + 1.8 * lnR) / TAU * 14.0 + ph * 2.5);
        float lattB = fract((sa - 1.8 * lnR) / TAU * 14.0 - ph * 2.5);

        float fibA = smoothstep(0.055, 0.006, min(lattA, 1.0 - lattA));
        float fibB = smoothstep(0.055, 0.006, min(lattB, 1.0 - lattB));
        float web  = max(fibA, fibB)
                   * smoothstep(0.43, 0.40, sr)
                   * smoothstep(0.028, 0.06, sr);

        // Synaptic sparks at filament crossings
        float cross   = fibA * fibB * 4.0;
        float synapse = smoothstep(0.06, 0.01, cross) * (1.0 + 1.8 * snap * AUDIO_HAT);

        // Travelling radial pulse bands
        float band = 0.5 + 0.5 * cos(sr * 28.0 - ph * TAU * 4.0);

        // Chromatic prism fringe (3 phase offsets, no per-channel uniform — cost-free)
        float prismPh  = sr * 9.0 - ph * 2.5 + sa * 0.4;
        vec3  colPrism = 0.50 + 0.50 * cos(TAU * (prismPh + vec3(0.0, 0.33, 0.67)));
        vec3  colNeural = mix(colPrism, colVein, 0.55);

        vec3 mCol2 = colNeural * web * (0.9 + 0.6 * vein) * band
                   + colWhite  * synapse * 1.2
                   + colViolet * synapse * 0.9;

        float a2 = clamp(web * 0.88 + synapse * 0.75, 0.0, 1.0);

        colAccum  += mCol2 * a2 * w2;
        alphaAccum += a2 * w2;
    }

    // ---- Archetype 3: Voltaic Crown Nova (treble) ----------------------------
    {
        float cReach = volt;

        // 24 corona spikes (compile-time constant)
        float spikeRays = pow(max(cos(sa * 12.0 + ph * TAU * 0.5), 0.0), 28.0)
                        * smoothstep(cReach * 0.44, 0.04, sr);

        // Finer secondary fringe between primary spikes
        float fringe = pow(max(cos(sa * 24.0 + ph * TAU), 0.0), 42.0)
                     * smoothstep(cReach * 0.36, 0.10, sr);

        // Three calibration rings
        float ring1 = smoothstep(0.004, 0.001, abs(sr - cReach * 0.40));
        float ring2 = smoothstep(0.003, 0.001, abs(sr - cReach * 0.28));
        float ring3 = smoothstep(0.002, 0.001, abs(sr - cReach * 0.16));

        // Electric discharge brightens on hat onset
        float zapFlash = (1.0 + 2.5 * snap * AUDIO_HAT) * spikeRays;

        vec3 mCol3 = colViolet * spikeRays * (1.0 + 0.8 * volt)
                   + colVein   * (fringe + ring1 + ring2 + ring3) * (1.2 + 1.0 * volt)
                   + colWhite  * zapFlash * 0.75
                   + colGreen  * fringe * 0.6;

        float a3 = clamp(spikeRays * 0.92 + fringe * 0.85 + (ring1 + ring2 + ring3) * 0.80, 0.0, 1.0)
                 * smoothstep(cReach * 0.46, cReach * 0.43, sr);

        colAccum  += mCol3 * a3 * w3;
        alphaAccum += a3 * w3;
    }

    // ---- Shared Bioluminescent Core Hub --------------------------------------
    // Magenta ganglion nucleus, flares on beat — present in all archetypes
    float coreR    = 0.030;
    float coreMask = smoothstep(coreR, coreR - 0.006, sr);
    // Tight halo: drops to zero at 2x coreR — does not bloat alpha frame-wide
    float coreHalo = 0.012 / (sr * sr + 0.0008) * smoothstep(coreR * 2.8, 0.0, sr);
    coreHalo = clamp(coreHalo, 0.0, 0.60);
    vec3  coreCol  = mix(colMagenta, colVein, sel) * (1.6 + 2.0 * AUDIO_BEAT);

    colAccum  = mix(colAccum + coreHalo * coreCol, coreCol, coreMask);
    alphaAccum = max(alphaAccum, max(coreMask, coreHalo * 0.5));

    // ---- Strict Edge Falloff -------------------------------------------------
    // Keep object inside ~0.46 at all slider and bind values (pulse MAX=1.20)
    // Use a tighter limit: 0.44 * sc so at MAX pulse=1.20, limit = 0.528 => clamped
    float outerLimit = 0.440 * sc;
    float boundsMask = smoothstep(outerLimit, outerLimit - 0.028, r);

    alphaAccum *= boundsMask;
    alphaAccum  = clamp(alphaAccum, 0.0, 1.0);

    // Premultiply alpha (§8)
    colAccum *= alphaAccum;

    gl_FragColor = vec4(colAccum, alphaAccum);
}
