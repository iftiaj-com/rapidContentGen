/*{
  "ADITS": 1,
  "DESCRIPTION": "A mouthwatering, translucent gourmet jelly confection that squashes, stretches, and wobbles with gelatinous elasticity. Sculpted with fluted ridges, glossy sugar glaze, and an inner glowing fruit core, it morphs across four confectionery archetypes under spectral balance: a fluted bundt kanten mold in bass, a bouncy tiered dome gelée, a prismatic star-crested crystal agar, and an effervescent floral petal gelée under treble.",
  "CREDIT": "Gemini 3.8 Flash",
  "DATE": "2026-09-13",
  "CATEGORIES": ["generative", "morph", "3d", "audio", "food"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "bounce",     "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Squash & Bounce", "BIND": "bass", "BIND_DEPTH": 0.65 },
    { "NAME": "wobble",     "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.80,
      "LABEL": "Gelatin Ripple", "BIND": "mid", "BIND_DEPTH": 0.55 },
    { "NAME": "glaze",      "TYPE": "float", "DEFAULT": 0.48, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Sugar Glaze", "BIND": "treble", "BIND_DEPTH": 0.60 },
    { "NAME": "jelly_tint", "TYPE": "color", "DEFAULT": [0.98, 0.10, 0.25, 1.00],
      "LABEL": "Jelly Tint" },
    { "NAME": "core_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.75, 0.15, 1.00],
      "LABEL": "Fruit Core" }
  ]
}*/

#define PI     3.14159265359
#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.40
#define BOUND  1.20

void pR(inout vec2 p, float a) {
    p = cos(a) * p + sin(a) * vec2(p.y, -p.x);
}

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

// Global parameters for unified SDF evaluation
float g_ph;
float g_sy, g_srad, g_bounceY, g_wamp;
float g_fluteAmp, g_crater, g_tierAmp, g_facet, g_flare, g_twist;
float g_lobes;

float map(vec3 p) {
    // 1. Elastic volume-conserving deformation (Squash & Stretch)
    vec3 q = p;
    q.y -= g_bounceY;
    q.y /= g_sy;
    q.xz *= g_srad;

    // 2. Gelatinous standing ripple waves along flanks
    float ripple = g_wamp * sin(q.y * 10.0 - g_ph * 4.0) * smoothstep(-0.55, 0.30, q.y);
    vec2 xz = q.xz * (1.0 + ripple);
    float r = length(xz);
    float a = atan(xz.y, xz.x) + q.y * g_twist;

    // 3. Voluptuous confectionery profile curve
    // Normalized height u: 0.0 at base (y = -0.44), 1.0 at crest (y = 0.38)
    float u = clamp((q.y + 0.44) / 0.82, 0.0, 1.0);

    // Sculpted dome envelope: rounded crown top that tapers smoothly to 0 at the crest
    float domeCap = sqrt(max(0.0, 1.0 - pow(clamp((u - 0.45) / 0.55, 0.0, 1.0), 2.4)));
    float rBase = (0.58 - 0.16 * u + 0.06 * sin(u * PI) + g_flare * 0.16 * (1.0 - u) * (1.0 - u)) * domeCap;

    // 4. Scalloped radial fluting & faceted crystal morphing
    float mRound = cos(a * g_lobes);
    float starPhase = fract(a * g_lobes / TAU) - 0.5;
    float mStar  = abs(starPhase) * 4.0 - 1.0;
    float mFlute = mix(mRound, mStar, g_facet);

    // Crown crests on top lobes
    float crownTaper = smoothstep(0.0, 0.70, domeCap);
    float fluteMod = g_fluteAmp * mFlute * crownTaper;

    // 5. Tiered rings (Archetype 1)
    float mTier = cos(q.y * 22.0) * g_tierAmp * crownTaper;

    // Modulated surface radius
    float rSurf = max(rBase + fluteMod + mTier, 0.001);

    // 6. Watertight distance combination
    float dRadial = r - rSurf;
    float dVertical = max(-0.45 - q.y, q.y - 0.38);
    vec2 d2 = vec2(dRadial, dVertical);
    float d = min(max(d2.x, d2.y), 0.0) + length(max(d2, 0.0));

    // Smooth spherical indentation for center syrup well (Archetype 0)
    if (g_crater > 0.01 && q.y > 0.14) {
        float craterRadius = 0.25 * g_crater;
        vec3 craterCenter = vec3(0.0, 0.42 + craterRadius * 0.3, 0.0);
        float dCraterSphere = length(q - craterCenter) - craterRadius;
        d = max(d, -dCraterSphere);
    }

    return d * 0.72;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);

    // Frame boundary check: strictly zero at visible edge
    float bound = smoothstep(0.476, 0.438, rr);
    if (bound <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // 16-second continuous loop phase
    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- Audio Spectral Morph Selector (guide §12.2 - 12.4, 12.7) -----------
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);

    // Onset punch: hat drives toward effervescent bloom, kick pushes toward heavy bundt
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.15 * AUDIO_SNARE, 0.0, 1.0);

    // Silence resting archetype
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // 4 Morph Archetype Weights
    float k0 = clamp(1.0 - abs(sel - 0.00) / 0.34, 0.0, 1.0);
    float k1 = clamp(1.0 - abs(sel - 0.33) / 0.34, 0.0, 1.0);
    float k2 = clamp(1.0 - abs(sel - 0.67) / 0.34, 0.0, 1.0);
    float k3 = clamp(1.0 - abs(sel - 1.00) / 0.34, 0.0, 1.0);
    float ws = k0 + k1 + k2 + k3 + 1e-4;
    float w0 = k0 / ws;
    float w1 = k1 / ws;
    float w2 = k2 / ws;
    float w3 = k3 / ws;

    // Confectionery mold geometry parameters per archetype:
    // w0: Fluted Bundt Mold (8 deep scalloped flutes, central syrup well)
    // w1: Tiered Dome Gelée (12 ripples, 3 distinct steps, smooth rounded dome)
    // w2: Star-Crested Crystal Agar (10-point crisp geometric prism facets)
    // w3: Effervescent Floral Bloom (6 wavy petal folds, flared rim)
    g_lobes    = w0 * 8.0  + w1 * 12.0 + w2 * 10.0 + w3 * 6.0;
    g_fluteAmp = w0 * 0.080 + w1 * 0.030 + w2 * 0.065 + w3 * 0.095;
    g_crater   = w0 * 0.90  + w1 * 0.00  + w2 * 0.10  + w3 * 0.35;
    g_tierAmp  = w0 * 0.000 + w1 * 0.040 + w2 * 0.000 + w3 * 0.010;
    g_facet    = w0 * 0.00  + w1 * 0.00  + w2 * 0.88  + w3 * 0.10;
    g_flare    = w0 * 0.10  + w1 * 0.04  + w2 * 0.08  + w3 * 0.40;
    g_twist    = w0 * 0.18  + w1 * -0.16 + w2 * 0.00  + w3 * 0.35;

    // ---- Gelatin Elasticity & Bouncing Physics -----------------------------
    // Strict integer harmonic multipliers: 2.0 cycles per loop
    float bouncePhase = g_ph * 2.0;
    float harmonicSquash = 0.14 * sin(bouncePhase);
    float impactSquash   = -0.30 * (AUDIO_KICK * 0.8 + AUDIO_BEAT * 0.4);
    g_sy = 1.0 + (harmonicSquash + impactSquash) * bounce;
    g_sy = clamp(g_sy, 0.60, 1.42);
    g_srad = 1.0 / sqrt(g_sy); // Conserve volume

    // Vertical bounce elevation
    float baseLift = 0.08 * abs(sin(bouncePhase)) * bounce;
    float kickLift = 0.09 * AUDIO_KICK;
    g_bounceY = (baseLift + kickLift) - 0.04;

    // Ripple amplitude energized by mid and snare
    g_wamp = wobble * (0.035 + 0.06 * AUDIO_MID + 0.10 * AUDIO_SNARE);

    // ---- Camera & Viewing Ray (guide §5) -----------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.85 * ww);

    // Hypnotic orbit spin
    float spinAngle = g_ph * 1.0;
    float tiltAngle = 0.10 * sin(g_ph * 2.0);
    pR(ro.xz, spinAngle); pR(ro.yz, tiltAngle);
    pR(rd.xz, spinAngle); pR(rd.yz, tiltAngle);

    vec3 col = vec3(0.0);
    float alpha = 0.0;
    float nearDist = 1e9;

    // Inner suspended fruit core position
    vec3 fruitCenter = vec3(0.0, g_bounceY - 0.03, 0.0);

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;

        // Bounded raymarch loop (56 iterations budget)
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            nearDist = min(nearDist, d / max(t, 0.5));
            if (d < 0.0010) {
                hit = true;
                break;
            }
            t += d * 0.68;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 v = -rd;
            float ndv = max(dot(n, v), 0.0);

            // Lighting setup: Warm patisserie key light + rim backlight
            vec3 lKey  = normalize(vec3(0.55, 0.80, 0.60));
            vec3 lBack = normalize(vec3(-0.55, 0.35, -0.75));

            // Subsurface Scattering (Forward transmission through translucent gelatin)
            float sssForward = pow(max(dot(v, -lBack), 0.0), 3.0) * 1.10;
            float sssRim     = pow(1.0 - ndv, 2.4) * 0.80;
            float sssDiffuse = max(dot(n, -lBack), 0.0) * 0.35;
            float totalSSS   = sssForward + sssRim + sssDiffuse;

            // Optical thickness & Beer-Lambert absorption
            float thick = clamp(0.18 + 0.42 * ndv, 0.0, 1.0);
            vec3 absorbVector = mix(vec3(0.4, 2.2, 1.8), vec3(1.8, 0.6, 1.5), sel);
            vec3 transmit = exp(-absorbVector * (thick * 1.4));

            // Inner suspended fruit core (analytic ray-to-sphere proximity)
            vec3 toFruit = fruitCenter - ro;
            float tFruit = clamp(dot(toFruit, rd), tb0, t);
            vec3 pFruitClosest = ro + rd * tFruit;
            float fruitDist = length(pFruitClosest - fruitCenter);
            float fruitGlow = smoothstep(0.28, 0.05, fruitDist);

            // Translucent Gelatin Color Blend
            vec3 rubyBody = jelly_tint.rgb * transmit;
            vec3 warmGlow = mix(jelly_tint.rgb, core_tint.rgb, 0.55);
            vec3 bodyCol  = mix(rubyBody, warmGlow, totalSSS * 0.55);

            // Infuse glowing inner fruit core
            bodyCol += core_tint.rgb * fruitGlow * (0.95 + 0.85 * AUDIO_BEAT);

            // Center syrup well coulis pool
            vec3 localP = p;
            localP.y -= g_bounceY;
            localP.y /= g_sy;
            float rLocal = length(localP.xz);
            float inWell = smoothstep(0.16, 0.03, rLocal) * smoothstep(0.18, 0.34, localP.y) * g_crater;
            bodyCol = mix(bodyCol, core_tint.rgb * 1.25, inWell * 0.70);

            // Key light illumination
            float nDotL = max(dot(n, lKey), 0.0);
            vec3 diffuseGel = bodyCol * (0.35 + 0.65 * nDotL + totalSSS * 0.75);

            // Dual-Layer Wet Sugar Syrup Specular
            vec3 hKey  = normalize(lKey + v);
            vec3 hBack = normalize(lBack + v);
            float specBroad = pow(max(dot(n, hKey), 0.0), 16.0) * 0.45;
            float specSharp = pow(max(dot(n, hKey), 0.0), 96.0) * 1.45;
            float specRim   = pow(max(dot(n, hBack), 0.0), 40.0) * 0.80;
            vec3 specHighlight = vec3(1.00, 0.96, 0.90) * (specBroad + specSharp + specRim);

            // Continuous Prismatic Sugar Sparkles (smooth, zero blockiness)
            vec3 spP = p * (38.0 + 14.0 * glaze);
            float s1 = sin(spP.x * 1.4 + spP.y * 2.1);
            float s2 = cos(spP.y * 1.9 + spP.z * 1.5);
            float s3 = sin(spP.z * 2.3 + spP.x * 1.7);
            float sugarSparkle = pow(max(s1 * s2 * s3, 0.0), 9.0) * glaze * (0.45 + 1.10 * AUDIO_TREBLE);
            specHighlight += vec3(1.00, 0.98, 0.86) * sugarSparkle * 2.6;

            // Fresnel Reflection of Warm Patisserie Studio
            float fresnel = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
            vec3 refDir = reflect(rd, n);
            vec3 studioAmbient = vec3(0.10, 0.04, 0.03) +
                                 vec3(0.98, 0.92, 0.80) * smoothstep(0.60, 0.98, sin(refDir.y * 5.0 + refDir.x * 2.5));

            col = mix(diffuseGel, studioAmbient, fresnel * 0.68) + specHighlight;

            // Semi-translucent gelatin coverage: softly see-through at ribs, deep at core
            alpha = clamp(0.80 + 0.20 * thick + 0.10 * fresnel, 0.0, 1.0);
        }
    }

    // ---- Bounded Gelatinous Aura Sheath (guide §8) -------------------------
    float ca = clamp(1.0 - nearDist * 4.6, 0.0, 1.0);
    float aura = (pow(ca, 5.0) * 0.28 + pow(ca, 22.0) * 0.68) * (1.0 - alpha);
    aura *= smoothstep(0.438, 0.10, rr) * (0.35 + 0.65 * glaze) * (0.55 + 0.85 * AUDIO_BEAT);

    col += (jelly_tint.rgb * 0.75 + core_tint.rgb * 0.45) * aura;
    alpha = clamp(alpha + aura * 0.46, 0.0, 1.0);

    // Tone curve & appetizing gamma
    col = col / (1.0 + col * 0.32);
    col = pow(max(col, 0.0), vec3(0.92));

    // Spatial border clamp & premultiplication
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
