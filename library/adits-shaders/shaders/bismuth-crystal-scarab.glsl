/*{
  "ADITS": 1,
  "DESCRIPTION": "An iridescent bismuth crystal scarab built from stepped hopper-crystal terraces and rainbow oxide films. Morphing across four geometric states under spectral balance, heavy stepped bismuth plates under bass give way to open faceted elytra, a nested hopper mandala, and needle-fine crystal spire quills under treble.",
  "CREDIT": "Gemini 3.6 Flash",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "crystal", "bismuth", "creature", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 18.0,
  "INPUTS": [
    { "NAME": "sens",    "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",    "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "stepSz",  "TYPE": "float", "DEFAULT": 0.95, "MIN": 0.80, "MAX": 1.12,
      "LABEL": "Terrace Scale", "BIND": "bass", "BIND_DEPTH": 0.28 },
    { "NAME": "irid",    "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Oxide Sheen", "BIND": "level", "BIND_DEPTH": 0.40 },
    { "NAME": "quill",   "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Spire Reach", "BIND": "treble", "BIND_DEPTH": 0.45 }
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

// Bismuth oxide thin-film iridescence color spectrum
vec3 bismuthFilm(float d, float cosTheta) {
    float phase = d * 2.8 / (cosTheta + 0.2);
    vec3 c = 0.5 + 0.5 * cos(TAU * (phase + vec3(0.0, 0.33, 0.67)));
    return mix(c, vec3(0.95, 0.75, 0.25), 0.25);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Seamless loop phase (18s period)
    float ph = fract(TIME / 18.0);

    // Bilateral fold for scarab creature symmetry
    vec2 p = vec2(abs(uv.x), uv.y);
    float r = length(uv);

    // Scale and coordinates
    float sc = stepSz * (1.0 + 0.03 * sin(ph * TAU));
    vec2 sp = p / sc;
    float spr = length(sp);
    float pa = atan(sp.y, sp.x);

    // Dynamic light key tilted by camera direction
    float lAngle = 2.2 + 0.5 * sin(ph * TAU) + 0.85 * CAM_DIR.x;
    vec3 lightDir = normalize(vec3(cos(lAngle), sin(lAngle), 0.68 + 0.25 * CAM_DIR.y));
    vec3 fillDir  = normalize(vec3(-cos(lAngle), -sin(lAngle), 0.32));
    vec3 viewDir  = normalize(vec3(CAM_DIR.xy, 0.80));

    // --- Audio Spectral Selector -----------------------------------------------
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // Onsets: hat sharpens towards spires, kick armours towards heavy carapace
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // Silence rests on resting form
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

    // Base Bismuth Core Colors
    vec3 colLeadCore = vec3(0.045, 0.055, 0.075); // Deep silvery metallic core
    vec3 colSilver   = vec3(0.92, 0.96, 1.00);    // Specular silver metal
    vec3 colGold     = vec3(1.00, 0.84, 0.35);    // Inlaid 24k Gold
    vec3 colHotGlint = vec3(1.00, 0.99, 0.96);    // Hot specular highlight
    vec3 colCyanGlow = vec3(0.25, 0.88, 1.00);    // Plasma core glow

    vec3 colAccum = vec3(0.0);
    float alphaAccum = 0.0;

    // --- Archetype 0: Terraced Bismuth Carapace (Heavy stepped hopper crystals)
    {
        // Integrated scarab body parts: Elytra (lower), Pronotum (middle), Clypeus (head)
        float elytra = smoothstep(0.32, 0.29, length((sp - vec2(0.0, -0.06)) / vec2(0.24, 0.24)));
        float pronotum = smoothstep(0.22, 0.19, length((sp - vec2(0.0, 0.10)) / vec2(0.19, 0.10)));
        float clypeus = smoothstep(0.12, 0.09, length((sp - vec2(0.0, 0.18)) / vec2(0.12, 0.06)));

        float scarabMask = max(max(elytra, pronotum), clypeus);

        // Hopper crystal stepped concentric box geometry
        vec2 boxP = (sp - vec2(0.0, -0.02)) / vec2(0.26, 0.30);
        float stepBox = max(abs(boxP.x), abs(boxP.y));
        float stepLevel = floor(stepBox * 8.0);
        float stepFrac  = fract(stepBox * 8.0);
        float stepRim   = smoothstep(0.08, 0.01, min(stepFrac, 1.0 - stepFrac));

        // Faceted normal for stepped hopper terraced steps
        float nDir = sign(sp.x - 0.08 * sin(sp.y * 12.0));
        vec3 norm0 = normalize(vec3(nDir * 0.65, (stepFrac - 0.5) * 0.8, 0.70));
        float diff0 = clamp(dot(norm0, lightDir), 0.0, 1.0);
        float spec0 = pow(clamp(dot(norm0, lightDir), 0.0, 1.0), 28.0);
        float cosView = clamp(dot(norm0, viewDir), 0.1, 1.0);

        // Thin-film oxide color depending on terrace level and view angle
        vec3 film0 = bismuthFilm(stepLevel * 0.18 + ph * 0.5, cosView);

        float bodyRim = smoothstep(0.008, 0.001, abs(spr - 0.32));

        vec3 mCol0 = colLeadCore
                   + film0 * (0.85 + 0.65 * irid) * (0.35 + 0.65 * diff0)
                   + colGold * stepRim * (0.8 + 0.6 * irid)
                   + colSilver * spec0 * 0.95
                   + colHotGlint * pow(spec0, 2.0) * 0.8;

        mCol0 += colCyanGlow * bodyRim * (1.2 + 1.4 * snap * AUDIO_KICK);

        float a0 = scarabMask * (0.85 + 0.15 * stepRim);
        a0 = max(a0, bodyRim * 0.95);

        colAccum += mCol0 * a0 * w0;
        alphaAccum += a0 * w0;
    }

    // --- Archetype 1: Articulated Faceted Elytra (Split wings, vein lattices) ---
    {
        // Split elytra wings with angled seam
        float wingAngle = 0.18 + 0.12 * sin(ph * TAU) + 0.22 * snap * AUDIO_KICK;
        vec2 wp = sp - vec2(0.04, -0.02);
        float cosW = cos(wingAngle), sinW = sin(wingAngle);
        vec2 rotWp = vec2(cosW * wp.x - sinW * wp.y, sinW * wp.x + cosW * wp.y);

        // Wing vein lattice ribs
        float vein1 = smoothstep(0.015, 0.003, abs(rotWp.x - 0.12 * sin(rotWp.y * 14.0)));
        float vein2 = smoothstep(0.012, 0.002, abs(rotWp.y - 0.15 * cos(rotWp.x * 12.0)));
        float veinMesh = max(vein1, vein2);

        // Solid wing-cover mask with split center gap
        float wingBody = smoothstep(0.32, 0.28, length(rotWp / vec2(0.24, 0.34)));
        float wingGap  = smoothstep(0.004, 0.018, abs(rotWp.x));
        float elytraMask = wingBody * wingGap;

        // Faceted normal
        vec3 norm1 = normalize(vec3(0.5 * sign(rotWp.x), 0.3, 0.8));
        float diff1 = clamp(dot(norm1, lightDir), 0.0, 1.0);
        float spec1 = pow(clamp(dot(norm1, lightDir), 0.0, 1.0), 36.0);
        float cosView1 = clamp(dot(norm1, viewDir), 0.1, 1.0);

        vec3 film1 = bismuthFilm(rotWp.y * 3.0 + rotWp.x * 2.0, cosView1);

        vec3 mCol1 = colLeadCore * 0.7
                   + film1 * (0.8 + 0.7 * irid) * (0.35 + 0.65 * diff1)
                   + colSilver * veinMesh * (0.9 + 0.5 * irid)
                   + colHotGlint * spec1 * 0.95;

        float a1 = elytraMask * (0.80 + 0.20 * veinMesh);
        colAccum += mCol1 * a1 * w1;
        alphaAccum += a1 * w1;
    }

    // --- Archetype 2: Faceted Hopper Star (6-Pointed bismuth hopper crystal) ---
    {
        float mandalaAngle = pa + ph * TAU * 0.5;

        // 6-Fold star silhouette boundary with open negative space
        float starBoundary = 0.24 + 0.09 * cos(pa * 6.0);
        float starFold = abs(mod(mandalaAngle + PI/6.0, PI/3.0) - PI/6.0);
        float starR = spr / (starBoundary + 0.01);
        float starStep = floor(starR * 8.0);
        float starFrac = fract(starR * 8.0);
        float starRib  = smoothstep(0.06, 0.01, min(starFrac, 1.0 - starFrac));

        vec3 norm2 = normalize(vec3(cos(mandalaAngle) * 0.6, sin(mandalaAngle) * 0.6, 0.75));
        float diff2 = clamp(dot(norm2, lightDir), 0.0, 1.0);
        float spec2 = pow(clamp(dot(norm2, lightDir), 0.0, 1.0), 24.0);
        float cosView2 = clamp(dot(norm2, viewDir), 0.1, 1.0);

        vec3 film2 = bismuthFilm(starStep * 0.25 + ph * 0.8, cosView2);

        vec3 mCol2 = colLeadCore * 0.6
                   + film2 * (0.85 + 0.75 * irid) * (0.4 + 0.6 * diff2)
                   + colGold * starRib * 0.7
                   + colHotGlint * spec2 * (0.9 + 1.2 * snap * AUDIO_HAT);

        // 6-pointed star silhouette mask (no circular disc)
        float starBody = smoothstep(starBoundary, starBoundary - 0.02, spr) * smoothstep(0.03, 0.06, spr);
        float a2 = starBody * (0.80 + 0.20 * starRib);
        colAccum += mCol2 * a2 * w2;
        alphaAccum += a2 * w2;
    }

    // --- Archetype 3: Crystal Spire Quills (Needle antenna nova) --------------
    {
        // 12 Needle antennae & 36 calibrated crystal spires
        float reach = quill;
        float antenna12 = pow(max(cos(pa * 6.0 + ph * TAU), 0.0), 40.0) * smoothstep(0.38 * reach, 0.06, spr);
        float spires36  = pow(max(cos(pa * 18.0 - ph * TAU * 0.5), 0.0), 48.0) * smoothstep(0.36 * reach, 0.10, spr);

        // Radial crystal calibration rings
        float ring1 = smoothstep(0.004, 0.001, abs(spr - 0.35 * reach));
        float ring2 = smoothstep(0.003, 0.001, abs(spr - 0.24 * reach));

        float quills = antenna12 + spires36 + (ring1 + ring2) * 0.5;

        vec3 film3 = bismuthFilm(spr * 4.0 + pa * 2.0, 0.8);

        vec3 mCol3 = film3 * (0.9 + 0.6 * irid)
                   + colSilver * (antenna12 * 1.5 + spires36 * 1.2)
                   + colHotGlint * antenna12 * (1.2 + 1.6 * snap * AUDIO_HAT)
                   + colCyanGlow * (ring1 + ring2) * 0.8;

        float a3 = clamp(quills, 0.0, 1.0) * smoothstep(0.40, 0.37, spr);
        colAccum += mCol3 * a3 * w3;
        alphaAccum += a3 * w3;
    }

    // --- Core Glowing Plasma Heart --------------------------------------------
    float coreMask = smoothstep(0.038, 0.005, spr);
    vec3 coreCol = mix(colCyanGlow, vec3(1.0, 0.35, 0.75), sel) * (1.4 + 1.5 * AUDIO_BEAT);

    colAccum = mix(colAccum, coreCol, coreMask);
    alphaAccum = max(alphaAccum, coreMask);

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
