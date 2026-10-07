/*{
  "ADITS": 1,
  "DESCRIPTION": "A multifaceted 3D crystal prism casting chromatic dispersion caustics; morphs from a heavy cut amber gem under bass into a cleaved reliquary with visible nucleus and an ultra-sharp needle star under treble. Rests in silence on the cut jewel.",
  "CREDIT": "gemini-3.8-flash",
  "DATE": "2026-09-17",
  "CATEGORIES": ["generative", "3d", "morph", "crystal", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",    "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",     "TYPE": "float", "DEFAULT": 0.08, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "gem_swell",     "TYPE": "float", "DEFAULT": 0.88, "MIN": 0.70, "MAX": 1.10,
      "LABEL": "Gem Scale", "BIND": "bass", "BIND_DEPTH": 0.35 },
    { "NAME": "dispersion",    "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Chromatic Dispersion", "BIND": "mid", "BIND_DEPTH": 0.55 },
    { "NAME": "caustic_flare", "TYPE": "float", "DEFAULT": 0.52, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Caustic Flare", "BIND": "treble", "BIND_DEPTH": 0.65 },
    { "NAME": "gem_tint",      "TYPE": "color", "DEFAULT": [0.45, 0.85, 1.00, 1.00],
      "LABEL": "Facet Tint" },
    { "NAME": "core_tint",     "TYPE": "color", "DEFAULT": [0.98, 0.75, 0.32, 1.00],
      "LABEL": "Core Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.20
#define BOUND  1.32

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

// Global morph parameters
float g_R, g_bevel, g_w1, g_w2, g_w3, g_nucR;
float g_mat; // 0: crystal facet, 1: inner nucleus star, 2: floor caustic pedestal
float g_causticFloorY;

// Tri-Archetype Polyhedral SDF
float sdMorphedPolyhedron(vec3 p, float r, float bev, float w1, float w2, float w3) {
    vec3 ps = abs(p);
    
    // Archetype 1: Dense beveled cut gemstone
    float d_cube = max(ps.x, max(ps.y, ps.z)) - r * 0.92;
    float d_oct  = dot(ps, vec3(0.57735027, 0.57735027, 0.57735027)) - r;
    
    const vec3 n_dod1 = vec3(0.0, 0.5257311, 0.8506508);
    const vec3 n_dod2 = vec3(0.8506508, 0.0, 0.5257311);
    const vec3 n_dod3 = vec3(0.5257311, 0.8506508, 0.0);
    
    float d_dod = max(dot(ps, n_dod1), max(dot(ps, n_dod2), dot(ps, n_dod3))) - r * (0.90 + bev * 0.14);
    float d_solid = max(d_oct, max(d_cube, d_dod));
    
    // Archetype 2: Cleaved Reliquary Shell with cut window ports
    float win = min(max(ps.x, ps.y), min(max(ps.y, ps.z), max(ps.x, ps.z))) - r * 0.42;
    float d_cleaved = max(abs(d_solid) - 0.032, -win);
    
    // Archetype 3: Needle Star Polyhedron with 6 axial crystalline spires
    float h = r * 1.42;
    float spX = max(length(ps.yz) - max(0.0, (h - ps.x) * 0.28), ps.x - h);
    float spY = max(length(ps.xz) - max(0.0, (h - ps.y) * 0.28), ps.y - h);
    float spZ = max(length(ps.xy) - max(0.0, (h - ps.z) * 0.28), ps.z - h);
    float d_needles = min(spX, min(spY, spZ));
    float d_spiky = min(d_solid, d_needles);
    
    // Continuous blend of the 3 archetypes' geometry
    return w1 * d_solid + w2 * d_cleaved + w3 * d_spiky;
}

float map(vec3 p) {
    // 1. Crystal Facet Body
    float dGem = sdMorphedPolyhedron(p, g_R, g_bevel, g_w1, g_w2, g_w3);
    
    // 2. Inner Floating Star Nucleus
    vec3 pn = abs(p);
    float nucStar = dot(pn, vec3(0.57735027, 0.57735027, 0.57735027)) - g_nucR;
    float nucBall = length(p) - g_nucR * 0.75;
    float dCore = min(nucStar, nucBall);
    
    // 3. Ground Caustic Pedestal Disc
    float dFloor = p.y - g_causticFloorY;
    float rFloor = length(p.xz);
    dFloor = max(dFloor, rFloor - 0.80);
    dFloor = max(dFloor, -(p.y - (g_causticFloorY - 0.02)));
    
    float d = dGem;
    g_mat = 0.0;
    
    if (dCore < d) {
        d = dCore;
        g_mat = 1.0;
    }
    if (dFloor < d) {
        d = dFloor;
        g_mat = 2.0;
    }
    
    return d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Caustic interference wave function with chromatic dispersion
vec3 causticWave(vec2 p, float t, float disp) {
    vec3 c = vec3(0.0);
    vec3 dispVec = vec3(-0.08, 0.0, 0.08) * disp;
    float ang = atan(p.y, p.x);
    float dist = length(p);
    
    for (int ch = 0; ch < 3; ch++) {
        float offset = (ch == 0) ? dispVec.x : ((ch == 1) ? dispVec.y : dispVec.z);
        vec2 q = p * (7.2 + offset * 4.5);
        
        float w = 0.0;
        w += sin(q.x * 2.4 + t * 2.0) * cos(q.y * 2.8 - t * 1.0);
        w += sin((q.x * 0.8 + q.y * 1.4) * 3.2 - t * 2.0);
        w += cos((q.x * 1.3 - q.y * 0.9) * 3.5 + t * 1.5);
        w += sin(dist * 12.0 - t * 3.0 + offset * 8.0) * 0.8;
        
        // Radial caustic fan flare
        float fan = pow(abs(sin(ang * 6.0 + t * 1.0 + offset * 3.0)), 4.0) * 0.45;
        
        float intensity = pow(clamp(abs(w) * 0.32 + fan, 0.0, 1.0), 3.2);
        if (ch == 0) c.r = intensity;
        if (ch == 1) c.g = intensity;
        if (ch == 2) c.b = intensity;
    }
    return c;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    
    // Strict edge boundary guard (guide 10)
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Seamless loop phase (integer harmonic multipliers)
    float ph   = fract(TIME / PERIOD);
    float turn = ph * TAU;

    // ---- Spectral Morph Selector (guide 12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    
    // Fast onset snaps
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.16 * AUDIO_SNARE, 0.0, 1.0);
    
    // Silence resting state
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // Narrow-kernel archetype weights (guide 12.6)
    float w1 = clamp(1.0 - abs(sel)       / 0.36, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.36, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.36, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    g_w1 = w1 / ws;
    g_w2 = w2 / ws;
    g_w3 = w3 / ws;

    // Bevel and dimension morphing
    g_bevel = g_w1 * 0.35 + g_w2 * 0.10 + g_w3 * 0.01;
    
    float sc = gem_swell * (1.0 + 0.03 * sin(turn * 2.0));
    g_R = mix(0.30, 0.34, sel) * sc;
    g_nucR = (0.10 + 0.04 * g_w2) * sc + 0.03 * AUDIO_BEAT;
    g_causticFloorY = -0.48;

    // ---- 3D Camera Basis (guide 5) ----------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Natural 14-degree downward viewing pitch so top facets & caustic fan read
    const float PITCH = 0.24;
    pR(ro.yz, PITCH);
    pR(rd.yz, PITCH);

    // Slow hypnotic rotation of the crystal
    float gemSpin = turn * 1.0;
    float gemWobble = 0.12 * sin(turn * 2.0);
    pR(ro.xz, gemSpin);
    pR(rd.xz, gemSpin);
    pR(ro.yz, gemWobble);
    pR(rd.yz, gemWobble);

    vec3 lightDir = normalize(vec3(0.52, 0.78, 0.34));
    vec3 col = vec3(0.0);
    float cov = 0.0;

    // Analytic bounding sphere acceleration
    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        
        for (int i = 0; i < 64; i++) {
            vec3 p = ro + rd * t;
            float d = map(p);

            if (d < 0.0012) {
                float hitMat = g_mat;
                vec3 n = calcNormal(p);

                float diff = clamp(dot(n, lightDir), 0.0, 1.0);
                float fres = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 2.8);
                vec3  refl = reflect(rd, n);
                float spec = pow(clamp(dot(refl, lightDir), 0.0, 1.0), 45.0);

                if (hitMat < 0.5) {
                    // Crystal Facets: Dynamic tone per archetype
                    vec3 baseTone = mix(core_tint.rgb, gem_tint.rgb, sel);
                    
                    // Internal chromatic dispersion refraction simulation
                    float etaR = 1.0 / (1.44 + 0.14 * dispersion);
                    float etaG = 1.0 / (1.50 + 0.14 * dispersion);
                    float etaB = 1.0 / (1.56 + 0.14 * dispersion);

                    vec3 refrR = refract(rd, n, etaR);
                    vec3 refrG = refract(rd, n, etaG);
                    vec3 refrB = refract(rd, n, etaB);

                    float intDotR = clamp(dot(refrR, lightDir), 0.0, 1.0);
                    float intDotG = clamp(dot(refrG, lightDir), 0.0, 1.0);
                    float intDotB = clamp(dot(refrB, lightDir), 0.0, 1.0);

                    vec3 dispGlint = vec3(
                        pow(intDotR, 12.0),
                        pow(intDotG, 15.0),
                        pow(intDotB, 18.0)
                    ) * (1.3 + 1.2 * AUDIO_HAT);

                    // Facet edge highlights
                    vec3 facetCol = baseTone * (0.22 + 0.68 * diff)
                                  + vec3(1.0, 0.96, 0.88) * spec * 2.2
                                  + dispGlint * (0.9 + 0.8 * dispersion)
                                  + baseTone * fres * 1.10;

                    // Treble needle sparkle burst
                    if (g_w3 > 0.05) {
                        float spikeGlint = pow(clamp(dot(abs(n), vec3(0.57735027)), 0.0, 1.0), 16.0);
                        facetCol += vec3(0.8, 0.95, 1.0) * spikeGlint * g_w3 * 1.5;
                    }

                    col += facetCol * 0.90;
                    cov = max(cov, 0.94);
                    break;

                } else if (hitMat < 1.5) {
                    // Core Nucleus: Glowing star pulsing with audio beat
                    float beatPulse = 1.0 + 1.4 * AUDIO_BEAT;
                    vec3 nucCol = core_tint.rgb * (2.2 * beatPulse + 1.2 * diff + 1.4 * fres);
                    col += nucCol;
                    cov = 1.0;
                    break;

                } else {
                    // Floor Plinth: Dancing Rainbow Caustic Pool (Card 1 showcase)
                    float distCenter = length(p.xz);
                    float ringMask = smoothstep(0.78, 0.22, distCenter) * smoothstep(0.05, 0.22, distCenter);
                    
                    // Caustic waves with chromatic dispersion
                    vec3 caust = causticWave(p.xz, turn * 1.0, dispersion);
                    caust *= (0.75 + 1.20 * caustic_flare * AUDIO_HAT + 0.45 * AUDIO_BEAT);
                    
                    // Ground reflection tint
                    vec3 floorBase = mix(core_tint.rgb * 0.12, gem_tint.rgb * 0.12, sel);
                    vec3 floorCol  = floorBase + caust * (1.35 * ringMask);
                    
                    float floorAlpha = clamp(ringMask * 0.60 + length(caust) * 0.30, 0.0, 0.85);
                    col += floorCol * floorAlpha;
                    cov = max(cov, floorAlpha);
                    break;
                }
            }

            t += max(d * 0.82, 0.003);
            if (t > tb1) break;
        }
    }

    // Volumetric glow around the crystal core
    float coreGlow = (0.0020 / (rr * rr + 0.0025)) * smoothstep(0.40, 0.02, rr);
    coreGlow *= (0.6 + 0.4 * AUDIO_BEAT);
    vec3 glowCol = mix(core_tint.rgb, gem_tint.rgb, sel) * coreGlow;
    col += glowCol * (0.8 + 0.6 * caustic_flare);
    cov = clamp(cov + coreGlow * 0.45, 0.0, 1.0);

    // Frame edge boundary attenuation
    col *= bound;
    float alpha = clamp(cov, 0.0, 1.0) * bound;
    alpha = smoothstep(0.015, 0.95, alpha);

    // Premultiplied alpha output (guide 8)
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
