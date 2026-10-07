/*{
  "ADITS": 1,
  "DESCRIPTION": "A damascene clockwork nautilus whose spiraling chambers and astrolabe rings morph across four archetypes under spectral balance. Heavy etched steel armour under bass gives way to bronze escapement gears, opaline radiolarin struts, and razor-sharp golden chronometer filaments under treble.",
  "CREDIT": "Gemini 3.7 Flash",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "metal", "astrolabe", "clockwork", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Snap" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "spiral",  "TYPE": "float", "DEFAULT": 0.95, "MIN": 0.80, "MAX": 1.15,
      "LABEL": "Spiral Scale", "BIND": "bass", "BIND_DEPTH": 0.25 },
    { "NAME": "gearRot", "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.50, "MAX": 1.80,
      "LABEL": "Escapement Spin", "BIND": "mid", "BIND_DEPTH": 0.40 },
    { "NAME": "filigree","TYPE": "float", "DEFAULT": 0.65, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Gold Filigree", "BIND": "treble", "BIND_DEPTH": 0.45 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// Pseudo-random hash
float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// Gear teeth function: sharp trapezoidal cogs
float gearTooth(float a, float count) {
    float x = cos(a * count);
    return smoothstep(-0.2, 0.4, x) * 2.0 - 1.0;
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // 16.0s seamless loop phase
    float ph = fract(TIME / 16.0);

    // Dynamic key and rim lighting tilted by camera direction
    float lAngle = 2.4 + 0.5 * sin(ph * TAU) + 0.9 * CAM_DIR.x;
    vec3 lightDir = normalize(vec3(cos(lAngle), sin(lAngle), 0.70 + 0.3 * CAM_DIR.y));
    vec3 fillDir  = normalize(vec3(-cos(lAngle), -sin(lAngle), 0.35));
    vec3 rimDir   = normalize(vec3(CAM_DIR.xy, 0.85));

    // --- Audio Spectral Selector -----------------------------------------------
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // Onset drive: hat sharpens towards chronometer, kick armours towards plate
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // Silence rests on chosen resting form
    float audioActive = smoothstep(0.015, 0.10, lo + md + hi);
    sel = mix(rest, sel, audioActive);

    // Archetype weights (4 distinct morphological states)
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

    // --- Coordinate System -----------------------------------------------------
    float r = length(uv);
    float sc = spiral;
    vec2 p = uv / sc;
    float pr = length(p);
    float pa = atan(p.y, p.x);

    // Logarithmic spiral math: r = a * exp(b * theta)
    // Coiled nautilus parameterization
    float bSpiral = 0.175; // Growth rate per radian
    float spiralTurns = (pa + PI) / TAU; // 0 to 1 per turn
    float logR = log(max(pr, 0.001) / 0.035);
    float spTurn = logR / (bSpiral * TAU);
    float spWinding = spTurn - spiralTurns;
    float spFloor = floor(spWinding);
    float spPhase = fract(spWinding); // 0 at inner spiral wall, 1 at outer

    // Angular chamber segments
    float chamberCount = 18.0;
    float chamberId = floor((pa / TAU + spTurn * 1.5 - ph) * chamberCount);
    float chamberFrac = fract((pa / TAU + spTurn * 1.5 - ph) * chamberCount);

    // Base Color Palette
    vec3 colDamascus = vec3(0.025, 0.030, 0.040); // Deep etched Damascus black steel
    vec3 colGold     = vec3(1.00, 0.84, 0.32);    // 24k Inlaid Gold Leaf
    vec3 colBronze   = vec3(0.88, 0.58, 0.28);    // Polished Antique Brass/Bronze
    vec3 colSteel    = vec3(0.80, 0.88, 0.96);    // Tempered Mirror Steel
    vec3 colHotSpec  = vec3(1.00, 0.99, 0.96);    // Hot Specular Glint
    vec3 colCyan     = vec3(0.25, 0.88, 1.00);    // Phosphor Cyan Luminescence
    vec3 colAmber    = vec3(1.00, 0.60, 0.18);    // Molten Amber Core Glow
    vec3 colRuby     = vec3(0.95, 0.18, 0.35);    // Chronometer Jewel Ruby

    vec3 colAccum = vec3(0.0);
    float alphaAccum = 0.0;

    // --- Archetype 0: Damascene Armour Nautilus (Heavy plates, gold inlay) ----
    {
        // Nautilus spiral wall boundaries
        float spiralRib = smoothstep(0.09, 0.02, min(spPhase, 1.0 - spPhase));
        float chamberSeam = smoothstep(0.05, 0.01, min(chamberFrac, 1.0 - chamberFrac));
        float plateRelief = pow(chamberFrac, 2.0);

        // Damascene steel wavy grain (Damascus folded steel pattern)
        float damascusWave = sin(pr * 180.0 + sin(pa * 16.0) * 4.0) * cos(pa * 36.0 + logR * 16.0);
        float damascusGrain = smoothstep(-0.2, 0.5, damascusWave);

        // Gold arabesque filigree inlays inside each chamber
        float arabesque = sin(chamberFrac * PI * 4.0) * cos(spPhase * PI * 4.0 + pa * 6.0);
        float goldInlay = smoothstep(0.52, 0.68, abs(arabesque)) * spiralRib;

        // Spiral bevel normals
        vec2 norm2D = vec2(cos(pa + chamberFrac * 1.8), sin(pa + chamberFrac * 1.8)) * 0.7;
        norm2D += vec2(-sin(pa), cos(pa)) * (chamberFrac - 0.5) * 0.9;
        vec3 norm0 = normalize(vec3(norm2D, 0.70));

        float diff0 = clamp(dot(norm0, lightDir), 0.0, 1.0);
        float spec0 = pow(clamp(dot(norm0, lightDir), 0.0, 1.0), 28.0);
        float rim0  = pow(clamp(1.0 - dot(norm0, rimDir), 0.0, 1.0), 3.5);

        float shellMask = smoothstep(0.435, 0.410, pr) * smoothstep(0.025, 0.045, pr);
        float shellRim  = smoothstep(0.008, 0.001, abs(pr - 0.420));

        vec3 mCol0 = mix(colDamascus, colDamascus * 2.5, damascusGrain * 0.5)
                   + colBronze * diff0 * 0.65
                   + colGold * goldInlay * (1.1 + 0.8 * filigree)
                   + colSteel * rim0 * 0.55
                   + colHotSpec * spec0 * (0.9 + 0.8 * plateRelief);

        mCol0 += colAmber * (1.0 - smoothstep(0.02, 0.14, pr)) * (1.4 + 1.6 * snap * AUDIO_KICK);
        mCol0 += colGold * shellRim * (1.2 + 1.4 * snap * AUDIO_KICK);

        float a0 = shellMask * max(spiralRib * chamberSeam, goldInlay * 0.95);
        a0 = max(a0, shellRim * 0.98);

        colAccum += mCol0 * a0 * w0;
        alphaAccum += a0 * w0;
    }

    // --- Archetype 1: Articulated Clockwork Astrolabe (Involute gears, cogs) ---
    {
        // 3 Concentric Interlocking Gear Rings
        float rG1 = 0.14, rG2 = 0.27, rG3 = 0.40;
        float wG = 0.022;

        float rot1 = ph * TAU * gearRot * 2.0;
        float rot2 = -ph * TAU * gearRot * 1.5;
        float rot3 = ph * TAU * gearRot * 1.0;

        // Sharp Involute Gear Teeth
        float tooth1 = gearTooth(pa + rot1, 16.0) * 0.007;
        float tooth2 = gearTooth(pa + rot2, 28.0) * 0.008;
        float tooth3 = gearTooth(pa + rot3, 42.0) * 0.008;

        float ring1 = smoothstep(wG, wG - 0.003, abs(pr - rG1 + tooth1));
        float ring2 = smoothstep(wG, wG - 0.003, abs(pr - rG2 + tooth2));
        float ring3 = smoothstep(wG * 0.85, wG * 0.85 - 0.003, abs(pr - rG3 + tooth3));

        // Circular Astrolabe Port Holes (weight reduction cutouts in gear body)
        float holes1 = smoothstep(0.014, 0.017, length(vec2(pr - rG1, mod(pa + rot1 + PI/8.0, PI/4.0) * rG1 - rG1 * PI/8.0)));
        float holes2 = smoothstep(0.017, 0.020, length(vec2(pr - rG2, mod(pa + rot2 + PI/14.0, PI/7.0) * rG2 - rG2 * PI/14.0)));

        ring1 *= holes1;
        ring2 *= holes2;

        // 6 Curved Escapement Spokes
        float spokeAngle = pa + rot3 + sin(pr * 12.0) * 0.35;
        float spokes6 = smoothstep(0.0045, 0.0015, abs(sin(spokeAngle * 3.0)) * pr) * step(pr, rG3);

        // Astrolabe Vernier Calibration Ticks
        float calTicks = smoothstep(0.70, 0.95, cos(pa * 84.0)) * smoothstep(0.008, 0.002, abs(pr - (rG3 - 0.016)));

        // Anisotropic Brushed Brass Highlights
        float aniso = pow(max(cos(pa * 2.0 - lAngle), 0.0), 8.0);

        // 3D Lighting on Brass Gears
        vec3 norm1 = normalize(vec3(cos(pa) * (tooth1 + tooth2) * 1.5, sin(pa) * (tooth1 + tooth2) * 1.5, 0.78));
        float diff1 = clamp(dot(norm1, lightDir), 0.0, 1.0);
        float spec1 = pow(clamp(dot(norm1, lightDir), 0.0, 1.0), 32.0);

        vec3 mCol1 = mix(colBronze, colSteel, 0.35) * (0.55 + 0.65 * diff1)
                   + colGold * (0.7 + 0.6 * filigree) * (spokes6 + calTicks + aniso * 0.4)
                   + colHotSpec * spec1 * 1.1;

        float a1 = clamp(ring1 + ring2 + ring3 + spokes6 + calTicks, 0.0, 1.0);
        a1 *= smoothstep(0.44, 0.41, pr);

        colAccum += mCol1 * a1 * w1;
        alphaAccum += a1 * w1;
    }

    // --- Archetype 2: Opaline Radiolarin (Crystalline spiral lattice) ----------
    {
        // Dual counter-rotating logarithmic spiral lattices
        float lattA = fract((pa + 1.4 * logR) / TAU * 12.0 + ph * 3.0);
        float lattB = fract((pa - 1.4 * logR) / TAU * 12.0 - ph * 3.0);

        float strutA = smoothstep(0.05, 0.008, min(lattA, 1.0 - lattA));
        float strutB = smoothstep(0.05, 0.008, min(lattB, 1.0 - lattB));
        float latticeMesh = max(strutA, strutB) * smoothstep(0.435, 0.390, pr) * smoothstep(0.03, 0.07, pr);

        // Opaline chromatic prism dispersion
        float prismPh = pr * 7.0 - ph * 3.0 + spWinding * 0.5;
        vec3 colPrism = 0.55 + 0.45 * cos(TAU * (prismPh + vec3(0.0, 0.33, 0.67)));
        colPrism = mix(colPrism, colCyan, 0.5);

        // Faceted crystal sparkle nodes at lattice intersections
        float nodes = smoothstep(0.07, 0.01, strutA * strutB * 4.0);
        float facetSpec = pow(max(sin((pa * 8.0 + logR * 14.0) + ph * TAU), 0.0), 22.0);

        vec3 mCol2 = colDamascus * 0.6
                   + colPrism * (0.85 + 0.55 * sin(pa * 6.0 + ph * TAU))
                   + colHotSpec * facetSpec * (1.1 + 1.3 * snap * AUDIO_HAT)
                   + colCyan * nodes * 1.5;

        float a2 = latticeMesh;
        colAccum += mCol2 * a2 * w2;
        alphaAccum += a2 * w2;
    }

    // --- Archetype 3: Chronometer Nova Filaments (Needle hands, star dial) ---
    {
        // 12-Ray Star Dial & Precision Degree Rings
        float starRays = pow(max(cos(pa * 12.0 + ph * TAU * 0.5), 0.0), 36.0) * smoothstep(0.44, 0.08, pr);
        float minuteTicks = smoothstep(0.85, 0.98, cos(pa * 60.0)) * smoothstep(0.005, 0.001, abs(pr - 0.415));
        float secondTicks = smoothstep(0.90, 0.99, cos(pa * 120.0)) * smoothstep(0.003, 0.001, abs(pr - 0.385));

        // Precision chronometer hands rotating at exact harmonic ratios
        float aHand1 = ph * TAU * 1.0;
        float aHand2 = ph * TAU * 3.0;
        float aHand3 = -ph * TAU * 6.0;

        vec2 h1 = vec2(cos(aHand1), sin(aHand1));
        vec2 h2 = vec2(cos(aHand2), sin(aHand2));
        vec2 h3 = vec2(cos(aHand3), sin(aHand3));

        // Tapered needle geometry
        float dH1 = abs(dot(p, vec2(-h1.y, h1.x)));
        float lH1 = dot(p, h1);
        float hand1 = smoothstep(0.004 * (1.0 - lH1 * 1.8), 0.0008, dH1) * step(0.0, lH1) * step(lH1, 0.41);

        float dH2 = abs(dot(p, vec2(-h2.y, h2.x)));
        float lH2 = dot(p, h2);
        float hand2 = smoothstep(0.003 * (1.0 - lH2 * 2.2), 0.0008, dH2) * step(0.0, lH2) * step(lH2, 0.34);

        float dH3 = abs(dot(p, vec2(-h3.y, h3.x)));
        float lH3 = dot(p, h3);
        float hand3 = smoothstep(0.002 * (1.0 - lH3 * 1.5), 0.0005, dH3) * step(0.0, lH3) * step(lH3, 0.43);

        // Corona needle ring
        float needleRing = smoothstep(0.0035, 0.001, abs(pr - 0.415));
        float chronometer = starRays + minuteTicks + secondTicks + hand1 + hand2 + hand3 + needleRing * 0.7;

        vec3 mCol3 = colGold * (1.00 + 0.50 * filigree)
                   + colHotSpec * (starRays * 1.8 + hand3 * 1.5) * (1.0 + 1.6 * snap * AUDIO_HAT)
                   + colCyan * (minuteTicks + secondTicks) * 1.1;

        float a3 = clamp(chronometer, 0.0, 1.0) * smoothstep(0.45, 0.42, pr);
        colAccum += mCol3 * a3 * w3;
        alphaAccum += a3 * w3;
    }

    // --- Core Jewel Hub & Balance Wheel ----------------------------------------
    float hubR = 0.052;
    float hubMask = smoothstep(hubR, hubR - 0.005, pr);
    float hubRim  = smoothstep(0.004, 0.001, abs(pr - hubR));
    float jewelR  = smoothstep(0.026, 0.006, pr);

    // Oscillating balance wheel inside center hub
    float balanceOsc = sin(ph * TAU * 16.0) * 0.6;
    float balanceArms = smoothstep(0.0035, 0.001, abs(sin((pa + balanceOsc) * 2.0)) * pr) * step(pr, hubR);

    vec3 hubCol = colDamascus + colGold * (0.8 + 0.4 * filigree) * (hubRim + balanceArms);
    vec3 jewelCol = mix(colRuby, colCyan, sel) * (1.4 + 1.4 * AUDIO_BEAT);
    hubCol = mix(hubCol, jewelCol, jewelR);

    colAccum = mix(colAccum, hubCol, hubMask);
    alphaAccum = max(alphaAccum, hubMask);

    // --- Strict Spatial Silhouette & Edge Falloff -----------------------------
    // Keep entire object bounded strictly inside 0.46 at all scale/bind levels
    float outerLimit = 0.455 * sc;
    float boundsMask = smoothstep(outerLimit, outerLimit - 0.020, r);

    alphaAccum *= boundsMask;
    alphaAccum = clamp(alphaAccum, 0.0, 1.0);

    // Premultiply alpha
    colAccum *= alphaAccum;

    gl_FragColor = vec4(colAccum, alphaAccum);
}
