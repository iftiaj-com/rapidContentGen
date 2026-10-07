/*{
  "ADITS": 1,
  "DESCRIPTION": "An iridescent organo-metallic membrane iris with pearlescent vesicular petals, a glowing chartreuse caustic core, and prismatic dispersion fringes. Spectrum morphs across a deep obsidian chrysalis, a translucent vesicle orchid, and a crystalline filament star.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "morph", "spectral", "audio", "psychedelic"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "warp",       "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Membrane Warp", "BIND": "mid", "BIND_DEPTH": 0.40 },
    { "NAME": "dispersion", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Prismatic Split", "BIND": "treble", "BIND_DEPTH": 0.45 },
    { "NAME": "scale",      "TYPE": "float", "DEFAULT": 0.88, "MIN": 0.70, "MAX": 1.08,
      "LABEL": "Core Swell", "BIND": "bass", "BIND_DEPTH": 0.30 },
    { "NAME": "lume",       "TYPE": "float", "DEFAULT": 0.75, "MIN": 0.25, "MAX": 1.20,
      "LABEL": "Caustic Lume", "BIND": "level", "BIND_DEPTH": 0.35 },
    { "NAME": "morphSens",  "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" }
  ]
}*/

#define TAU 6.28318530718
#define PI 3.14159265359

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

float easeCurve(float x) {
    return x * x * (3.0 - 2.0 * x);
}

// Thin-film pearlescent / caustic spectral color
vec3 causticIridescence(float t, vec3 tintA, vec3 tintB) {
    vec3 c = 0.5 + 0.5 * cos(TAU * (t + vec3(0.08, 0.36, 0.65)));
    return mix(mix(tintA, tintB, clamp(t, 0.0, 1.0)), c, 0.50);
}

// Evaluates a single petal / membrane sector layer
void evalPetalLayer(
    vec2 p,
    float folds,
    float phase,
    float warpFactor,
    float dispAmt,
    vec3 palCore,
    vec3 palSheen,
    vec3 palGlint,
    out vec3 colOut,
    out float covOut
) {
    float r = length(p);
    float a = atan(p.y, p.x);

    // Rotational symmetry sector folding
    float seg = TAU / folds;
    float repA = abs(mod(a + seg * 0.5, seg) - seg * 0.5);

    // Sector coordinates
    vec2 sp = vec2(cos(repA), sin(repA)) * r;

    // Organic wavy deformation along petal membrane
    float wave = sin(r * 22.0 - phase * TAU) * 0.012 
               + cos(repA * folds * 2.0 - phase * TAU * 0.5) * 0.010 * (1.0 + warpFactor);
    sp.y += wave;

    // Vesicular oval cavities (the dark lens windows in the reference)
    vec2 cav1 = vec2(0.20, 0.0);
    vec2 cav2 = vec2(0.33, 0.0);
    
    float dCav1 = length(vec2((sp.x - cav1.x) * 1.35, sp.y * 2.5)) - 0.055 * (1.0 + 0.15 * sin(phase * TAU));
    float dCav2 = length(vec2((sp.x - cav2.x) * 1.60, sp.y * 2.8)) - 0.040;

    // Petal boundary contour
    float petalWidth = 0.38 * sp.x * (1.0 - sp.x * 1.7) + 0.012;
    float petalEdgeDist = abs(sp.y) - petalWidth;

    // Chromatic dispersion for sharp caustic boundaries
    float dispOffset = dispAmt * 0.015;
    float rRidge1 = exp(-pow((dCav1 - dispOffset) * 65.0, 2.0));
    float gRidge1 = exp(-pow(dCav1 * 65.0, 2.0));
    float bRidge1 = exp(-pow((dCav1 + dispOffset) * 65.0, 2.0));

    float rRidge2 = exp(-pow((dCav2 - dispOffset * 0.8) * 70.0, 2.0));
    float gRidge2 = exp(-pow(dCav2 * 70.0, 2.0));
    float bRidge2 = exp(-pow((dCav2 + dispOffset * 0.8) * 70.0, 2.0));

    float edgeRidge = exp(-pow(petalEdgeDist * 70.0, 2.0));

    // Translucent membrane sheet (petal interior minus the deep obsidian vesicular cavities)
    float membrane = smoothstep(0.012, -0.006, petalEdgeDist) 
                   * smoothstep(-0.006, 0.035, dCav1)
                   * smoothstep(-0.006, 0.025, dCav2);

    // Radial span mask for individual petal
    float petalSpan = smoothstep(0.04, 0.10, sp.x) * smoothstep(0.48, 0.28, sp.x);
    membrane *= petalSpan;
    edgeRidge *= petalSpan;
    float ridge1Mask = smoothstep(0.05, 0.12, sp.x) * smoothstep(0.42, 0.26, sp.x);
    float ridge2Mask = smoothstep(0.18, 0.25, sp.x) * smoothstep(0.46, 0.35, sp.x);

    // Fine concentric caustic striations across the membrane
    float striations = sin(r * 40.0 - phase * TAU * 2.0) * 0.5 + 0.5;
    striations = pow(striations, 2.5) * 0.25 * membrane;

    // Pearlescent translucent membrane body shading
    vec3 irid = causticIridescence(r * 2.4 + sp.x * 1.4 - phase * 0.35, palCore, palSheen);
    vec3 bodyCol = mix(palSheen * 0.55, irid, 0.45) * 0.80 + striations * palCore;

    // Concentrated caustic boundary lines
    vec3 causticCol = vec3(rRidge1, gRidge1, bRidge1) * ridge1Mask * 1.1
                    + vec3(rRidge2, gRidge2, bRidge2) * ridge2Mask * 0.95
                    + vec3(edgeRidge) * irid * 1.2;

    // Glossy specular highlight glints
    float specular = pow(clamp(gRidge1 * 1.05 + edgeRidge * 0.70, 0.0, 1.0), 4.0);
    vec3 specCol = palGlint * specular * 1.5;

    colOut = membrane * bodyCol + causticCol + specCol;
    covOut = clamp(membrane * 0.70 + (gRidge1 * ridge1Mask + edgeRidge) * 0.80, 0.0, 1.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float distOrig = length(uv);

    // Loop-synchronized clock phase
    float ph = fract(TIME / 16.0);
    float tauPh = ph * TAU;

    // Direct onset punch
    float beatSnap = AUDIO_BEAT;
    float kickSnap = AUDIO_KICK;
    float hatSnap  = AUDIO_HAT;

    // ---- Morph Selector (§12.2) ---------------------------------------------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float specSum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / specSum;

    float sel = clamp((tilt - 0.5) * (1.6 + 3.2 * morphSens) + 0.5, 0.0, 1.0);
    float audioActive = smoothstep(0.02, 0.14, lo + md + hi);
    sel = mix(0.50, sel, audioActive);
    sel = clamp(sel + 0.40 * (hatSnap - kickSnap), 0.0, 1.0);

    // 3 Archetypes: 0 = Obsidian Chrysalis, 1 = Pearlescent Vesicle Bloom, 2 = Crystalline Star
    float pos = sel * 2.0;
    float w0 = easeCurve(clamp(1.0 - abs(pos - 0.0) * 1.6, 0.0, 1.0));
    float w1 = easeCurve(clamp(1.0 - abs(pos - 1.0) * 1.6, 0.0, 1.0));
    float w2 = easeCurve(clamp(1.0 - abs(pos - 2.0) * 1.6, 0.0, 1.0));
    float wSum = w0 + w1 + w2 + 1e-4;
    w0 /= wSum; w1 /= wSum; w2 /= wSum;

    // Curated color palettes per archetype matching the reference aesthetic:
    // Archetype 0: Deep midnight obsidian with glowing moss-gold veins
    vec3 c0_core  = vec3(0.82, 0.94, 0.28);
    vec3 c0_sheen = vec3(0.20, 0.24, 0.48);
    vec3 c0_glint = vec3(0.60, 0.90, 0.95);

    // Archetype 1: Pearlescent chartreuse gold, lilac silver, and translucent cyan sheen
    vec3 c1_core  = vec3(0.86, 0.95, 0.40);
    vec3 c1_sheen = vec3(0.58, 0.52, 0.72);
    vec3 c1_glint = vec3(0.92, 0.97, 0.95);

    // Archetype 2: Prismatic crystalline lilac, electric cyan, and diamond
    vec3 c2_core  = vec3(0.50, 0.98, 0.88);
    vec3 c2_sheen = vec3(0.70, 0.32, 0.80);
    vec3 c2_glint = vec3(0.98, 0.98, 1.00);

    vec3 tintCore  = w0 * c0_core  + w1 * c1_core  + w2 * c2_core;
    vec3 tintSheen = w0 * c0_sheen + w1 * c1_sheen + w2 * c2_sheen;
    vec3 tintGlint = w0 * c0_glint + w1 * c1_glint + w2 * c2_glint;

    // Geometric parameters
    float baseFolds = floor(mix(4.0, mix(6.0, 8.0, w2), w1 + w2) + 0.5);
    float curScale = scale * (1.0 + 0.04 * sin(tauPh * 2.0) + 0.08 * beatSnap);
    float curWarp = warp * mix(0.7, 1.25, w0) + 0.14 * kickSnap;
    float curDisp = dispersion * (1.0 + 0.45 * hatSnap);

    // Natural precession and breathing
    vec2 p = uv / (curScale * 0.85);
    p *= rot2D(sin(tauPh) * 0.15 + tauPh * 0.05);

    // Layer 1: Primary Petal / Vesicle Membrane Bloom
    vec3 col1; float cov1;
    evalPetalLayer(p, baseFolds, ph, curWarp, curDisp, tintCore, tintSheen, tintGlint, col1, cov1);

    // Layer 2: Interleaved Counter-Rotating Secondary Folds
    vec2 p2 = p * rot2D(PI / baseFolds + sin(tauPh * 0.5) * 0.10) * 1.15;
    vec3 col2; float cov2;
    evalPetalLayer(p2, baseFolds, ph + 0.33, curWarp * 0.8, curDisp * 1.15, tintCore, tintSheen, tintGlint, col2, cov2);

    // Combine layered membrane sheets
    vec3 totalCol = col1 + col2 * 0.50;
    float totalCov = clamp(cov1 + cov2 * 0.40, 0.0, 1.0);

    // Radiant Central Chartreuse Iris Core
    float coreR = length(p);
    float coreRay = 0.5 + 0.5 * cos(atan(p.y, p.x) * baseFolds * 2.0 + tauPh);
    float coreGlow = exp(-coreR * 11.0) * (0.80 + 0.40 * coreRay + 0.5 * beatSnap);
    
    totalCol += tintCore * coreGlow * 1.1;
    totalCov = clamp(totalCov + coreGlow * 0.60, 0.0, 1.0);

    // Overall lume modulation
    totalCol *= (0.88 + 0.35 * lume);

    // Strict boundary enforcement (§10): strictly 0 before frame edge at 0.5
    float spatialBound = smoothstep(0.46, 0.36, distOrig);
    totalCov *= spatialBound;
    totalCol *= spatialBound;

    // Premultiplied alpha output (§8)
    float alpha = clamp(totalCov, 0.0, 1.0);
    vec3 finalCol = clamp(totalCol, 0.0, 1.6) * alpha;

    gl_FragColor = vec4(finalCol, alpha);
}
