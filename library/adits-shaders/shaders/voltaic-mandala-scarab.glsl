/*{
  "ADITS": 1,
  "DESCRIPTION": "A bioluminescent cybernetic entity that morphs through four distinct archetypes: a radiant needle starburst rosette, an electric filigree mantis with arched plasma tendrils, a faceted polyhedral chitin carapace, and orbiting chevron rune sentinels.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "neon", "creature", "sacred", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    { "NAME": "sens",     "TYPE": "float", "DEFAULT": 0.75,  "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",     "TYPE": "float", "DEFAULT": 0.60,  "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Pulse" },
    { "NAME": "rest",     "TYPE": "float", "DEFAULT": 0.28,  "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach",    "TYPE": "float", "DEFAULT": 0.320, "MIN": 0.220, "MAX": 0.350,
      "LABEL": "Tendril Reach", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "electric", "TYPE": "float", "DEFAULT": 0.65,  "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Arc Intensity", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "crown",    "TYPE": "float", "DEFAULT": 0.55,  "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Crown Detail", "BIND": "treble", "BIND_DEPTH": 0.50 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718
// Floor cut from each archetype's coverage before it is mixed in. The 1/d
// glows never reach zero, so without it their tails veil the whole disc.
#define TAIL 0.04

// 1D Pseudo-random hash
float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// 2D Pseudo-random hash
vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

// 2D Rotation helper
vec2 rot2D(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

// Distance to 2D line segment
float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

// Distance to an equilateral triangle
float sdEquilateralTriangle(vec2 p, float r) {
    const float k = 1.7320508;
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Strict boundary clipping to ensure zero edge bleed
    float r = length(uv);
    float boundary = smoothstep(0.47, 0.44, r);
    if (boundary <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // 20-second loop phase
    float ph = fract(TIME / 20.0);
    float ang = ph * TAU;

    // Spectral Selector calculation
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum; // 0 = all bass, 1 = all treble

    // Expand tilt around center
    float sel = clamp((tilt - 0.5) * (1.5 + 3.2 * sens) + 0.5, 0.0, 1.0);
    sel = clamp(sel + snap * (AUDIO_HAT * 0.8 + AUDIO_SNARE * 0.4 - AUDIO_KICK * 0.9), 0.0, 1.0);

    // Fade smoothly to rest during silence
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0; // Range 0.0 to 3.0 for 4 archetypes

    // Archetype weights (triangular kernels, slope 1.85)
    float w0 = max(1.0 - abs(x0      ) * 1.85, 0.0); // 0: Needle Rosette Starburst
    float w1 = max(1.0 - abs(x0 - 1.0) * 1.85, 0.0); // 1: Electric Mantis Tendril Entity
    float w2 = max(1.0 - abs(x0 - 2.0) * 1.85, 0.0); // 2: Faceted Polyhedral Chitin Shield
    float w3 = max(1.0 - abs(x0 - 3.0) * 1.85, 0.0); // 3: Orbiting Chevron Rune Sentinel
    float ws = w0 + w1 + w2 + w3 + 1e-4;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Transients & dynamic modulations
    float beatPulse = AUDIO_BEAT * snap;
    float kickFlare = AUDIO_KICK * snap;
    float hatSpark  = AUDIO_HAT * snap;
    float currentReach = reach * (1.0 + 0.08 * sin(ang) + 0.15 * kickFlare);

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // Palette definitions
    vec3 cEmerald = vec3(0.10, 0.98, 0.55);
    vec3 cCyan    = vec3(0.12, 0.88, 1.00);
    vec3 cViolet  = vec3(0.85, 0.15, 0.95);
    vec3 cGold    = vec3(1.00, 0.82, 0.25);
    vec3 cPlasma  = mix(cEmerald, cGold, 0.4 + 0.3 * sin(ang * 2.0));

    // Bilateral mirrored coordinate space
    vec2 pBilateral = vec2(abs(uv.x), uv.y);

    // =========================================================================
    // ARCHETYPE 0: Radiant Needle Starburst & Diamond Rosette (w0)
    // =========================================================================
    if (w0 > 0.001) {
        vec3 col0 = vec3(0.0);
        float alpha0 = 0.0;

        float nSpokes = 16.0;
        float theta = atan(uv.y, uv.x);
        float sector = TAU / nSpokes;
        float sAngle = mod(theta + ang * 0.25 + sector * 0.5, sector) - sector * 0.5;
        vec2 pSpoke = vec2(cos(sAngle), sin(sAngle)) * r;

        // Needle spoke geometry
        float spokeLen = currentReach * (0.85 + 0.25 * crown);
        float spokeW = 0.004 * (1.0 - smoothstep(0.02, spokeLen, pSpoke.x));
        float dSpoke = abs(pSpoke.y) - spokeW;
        float inSpoke = step(0.02, pSpoke.x) * (1.0 - smoothstep(spokeLen - 0.02, spokeLen, pSpoke.x));
        
        float spokeLine = (1.0 - smoothstep(0.0, 0.003, max(dSpoke, 0.0))) * inSpoke;
        float spokeGlow = (0.002 / (abs(pSpoke.y) + 0.003)) * inSpoke * (0.5 + 0.5 * sin(pSpoke.x * 60.0 - ang * 4.0));

        // Outer diamond crystals on spoke tips
        vec2 pTip = pSpoke - vec2(spokeLen * 0.95, 0.0);
        float tipCrystal = sdEquilateralTriangle(rot2D(pTip, PI * 0.5 + ang * 2.0), 0.018 * (1.0 + 0.5 * hatSpark));
        float tipGlow = 0.0015 / (abs(tipCrystal) + 0.0025);

        vec3 spCol = mix(cCyan, cViolet, sin(theta * 4.0 + ang) * 0.5 + 0.5);
        vec3 tipCol = mix(cEmerald, cGold, hatSpark);

        col0 += (spCol * (spokeLine * 2.5 + spokeGlow * 1.5) + tipCol * tipGlow * 2.0);
        alpha0 += spokeLine + spokeGlow * 0.6 + smoothstep(0.008, 0.0, tipCrystal) + tipGlow * 0.5;

        col += col0 * w0;
        alpha += max(alpha0 - TAIL, 0.0) * w0;
    }

    // =========================================================================
    // ARCHETYPE 1: Electric Filigree Mantis Tendril Entity (w1)
    // =========================================================================
    if (w1 > 0.001) {
        vec3 col1 = vec3(0.0);
        float alpha1 = 0.0;

        // 5 pairs of bilateral tendril legs + antenna spines
        for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float u = fi * 0.25;
            float h = hash11(fi * 7.13 + 1.2);

            // Tendril base attachment & arching orientation
            vec2 base = vec2(0.015 + 0.015 * u, mix(0.12, -0.12, u));
            float tAngle = mix(1.25, -1.15, u) + 0.15 * sin(ang * 2.0 + fi * 1.8);
            vec2 dir = vec2(cos(tAngle), sin(tAngle));
            vec2 norm = vec2(-dir.y, dir.x);

            vec2 q = pBilateral - base;
            float al = dot(q, dir);
            float pe = dot(q, norm);

            // Arch curve distortion
            pe -= mix(-1.2, 1.4, u) * 1.5 * al * al;

            // Electric lightning plasma jitter
            float jitter = sin(al * 75.0 - ang * 8.0 + fi * 4.0) * (0.003 + 0.006 * electric * (0.4 + 0.6 * beatPulse));
            pe += jitter;

            float tLen = currentReach * (0.75 + 0.35 * h);
            float tTaper = clamp(1.0 - al / tLen, 0.0, 1.0);
            float halfW = 0.022 * pow(tTaper, 1.2) * (0.3 + 0.7 * smoothstep(0.0, 0.04, al));

            // Discharge filament line
            float dFil = abs(pe) - halfW * 0.15;
            float inFil = step(0.005, al) * (1.0 - smoothstep(tLen - 0.015, tLen, al));
            float filLine = (1.0 - smoothstep(0.0, 0.002, max(dFil, 0.0))) * inFil;
            float filGlow = (0.0022 / (abs(pe) + 0.004)) * inFil;

            // Hot sparkler nodes along the tendril
            float nodePhase = fract(al * 12.0 - ang * 3.0 + h);
            float sparkNode = smoothstep(0.85, 0.98, nodePhase) * filLine;

            vec3 tCol = mix(cEmerald, cPlasma, u);
            if (h > 0.6) tCol = mix(tCol, cCyan, 0.7);

            col1 += tCol * (filLine * 2.2 + filGlow * 1.4) + vec3(1.0) * sparkNode * 3.0;
            alpha1 += filLine + filGlow * 0.5 + sparkNode;
        }

        // Segmented thoracic ribcage & antenna crown
        float spineY = pBilateral.y;
        float spineMask = step(-0.14, spineY) * step(spineY, 0.16) * (1.0 - smoothstep(0.005, 0.02, pBilateral.x));
        float ribs = sin(spineY * 120.0 + ang * 4.0) * spineMask;
        float ribGlow = smoothstep(0.3, 0.9, ribs) * (1.0 - smoothstep(0.0, 0.018, pBilateral.x));

        col1 += cGold * ribGlow * 2.5;
        alpha1 += ribGlow * 0.8;

        col += col1 * w1;
        alpha += max(alpha1 - TAIL, 0.0) * w1;
    }

    // =========================================================================
    // ARCHETYPE 2: Faceted Polyhedral Chitin Shield (w2)
    // =========================================================================
    if (w2 > 0.001) {
        vec3 col2 = vec3(0.0);
        float alpha2 = 0.0;

        // Concentric hexagonal & triangular faceted plates
        vec2 pPlate = uv;
        float nSides = 6.0;
        float aPlate = atan(pPlate.y, pPlate.x);
        float pSector = TAU / nSides;
        float aMod = mod(aPlate + ang * 0.15 + pSector * 0.5, pSector) - pSector * 0.5;
        vec2 pFold = vec2(cos(aMod), sin(aMod)) * r;

        // Plate facet borders
        float plateRadius = currentReach * 0.75 * (1.0 + 0.15 * kickFlare);
        float dPlate = sdEquilateralTriangle(rot2D(pFold - vec2(plateRadius * 0.5, 0.0), PI * 0.5), plateRadius * 0.4);

        float edgeBevel = abs(dPlate) - 0.002;
        float plateEdge = (1.0 - smoothstep(0.0, 0.0035, edgeBevel)) * step(r, plateRadius * 1.1);
        float plateGlow = (0.002 / (abs(dPlate) + 0.005)) * step(r, plateRadius * 1.15);

        // Chitin surface specular highlights
        float spec = pow(max(0.0, sin(pFold.x * 40.0 - ang * 3.0) * sin(pFold.y * 40.0)), 6.0) * step(dPlate, 0.0);

        vec3 chitinCol = mix(cViolet, cGold, 0.5 + 0.5 * sin(ang + r * 10.0));
        vec3 edgeCol = mix(cCyan, vec3(1.0, 0.9, 0.95), kickFlare);

        col2 += chitinCol * (plateEdge * 2.0 + plateGlow * 1.2) + edgeCol * (spec * 3.0 + plateEdge * 1.5);
        alpha2 += plateEdge + plateGlow * 0.6 + spec * 0.5;

        col += col2 * w2;
        alpha += max(alpha2 - TAIL, 0.0) * w2;
    }

    // =========================================================================
    // ARCHETYPE 3: Orbiting Chevron Rune Sentinel (w3)
    // =========================================================================
    if (w3 > 0.001) {
        vec3 col3 = vec3(0.0);
        float alpha3 = 0.0;

        // Orbiting triangular chevron runes in concentric rings
        const int nRunes = 8;
        for (int i = 0; i < nRunes; i++) {
            float fi = float(i);
            float orbitRadius = currentReach * (0.65 + 0.30 * mod(fi, 2.0));
            float orbitSpeed = (mod(fi, 2.0) == 0.0 ? 1.0 : -1.2) * 0.6;
            float rAngle = (fi / float(nRunes)) * TAU + ang * orbitSpeed;

            vec2 runePos = vec2(cos(rAngle), sin(rAngle)) * orbitRadius;
            vec2 pRune = rot2D(uv - runePos, rAngle + PI * 0.5 + ang * 2.0);

            // Triangular chevron prism
            float dRune = sdEquilateralTriangle(pRune, 0.022 * (1.0 + 0.4 * beatPulse));
            float runeBorder = abs(dRune) - 0.002;
            float runeLine = (1.0 - smoothstep(0.0, 0.003, runeBorder));
            float runeGlow = 0.002 / (abs(dRune) + 0.004);

            // Energy filament connecting rune to center
            float dBeam = sdSegment(uv, vec2(0.0), runePos);
            float beamGlow = (0.0008 / (dBeam + 0.003)) * (0.3 + 0.7 * beatPulse);

            vec3 rCol = mix(cGold, cEmerald, mod(fi, 2.0));
            col3 += rCol * (runeLine * 2.5 + runeGlow * 1.6 + beamGlow * 1.0);
            alpha3 += runeLine + runeGlow * 0.6 + beamGlow * 0.3;
        }

        col += col3 * w3;
        alpha += max(alpha3 - TAIL, 0.0) * w3;
    }

    // =========================================================================
    // CORE NUCLEUS (Shared continuous core anchor across all archetypes)
    // =========================================================================
    float coreR = 0.045 * (1.0 + 0.35 * beatPulse + 0.25 * kickFlare);
    float dCore = r - coreR;
    float coreLine = 1.0 - smoothstep(0.0, 0.004, abs(dCore));
    float coreGlow = 0.003 / (abs(dCore) + 0.005);
    float coreFill = 1.0 - smoothstep(0.0, coreR, r);

    // Faceted counter-rotating iris inside core
    vec2 pCore = rot2D(uv, -ang * 1.5);
    float aCore = atan(pCore.y, pCore.x);
    float corePetals = sin(aCore * 8.0) * sin(r * 80.0 - ang * 6.0);
    float coreDetail = smoothstep(0.2, 0.8, corePetals) * coreFill;

    vec3 coreColor = mix(vec3(1.0), mix(cCyan, cGold, 0.5 + 0.5 * sin(ang * 3.0)), smoothstep(0.0, coreR, r));
    vec3 coreEmission = coreColor * (coreLine * 3.0 + coreGlow * 2.0 + coreDetail * 2.5);

    col += coreEmission;
    alpha += coreLine + coreGlow * 0.7 + coreDetail * 0.8;

    // Apply strict circular vignette / boundary falloff to ensure edge is completely 0
    alpha *= boundary;
    col *= boundary;

    // Output strictly formatted Premultiplied Alpha
    alpha = clamp(alpha, 0.0, 1.0) * electric;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
