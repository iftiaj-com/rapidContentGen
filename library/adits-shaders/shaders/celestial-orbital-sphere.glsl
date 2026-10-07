/*{
  "ADITS": 1,
  "DESCRIPTION": "A 3D celestial orbital data sphere with glowing stellar core and gyroscopic armillary rings; morphs from a dense bronze astrolabe under bass into an illuminated meridian network and an explosive satellite constellation under treble. Rests in silence on the bronze astrolabe.",
  "CREDIT": "gemini-3.8-flash",
  "DATE": "2026-09-17",
  "CATEGORIES": ["generative", "3d", "morph", "geometric", "audio"],
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
    { "NAME": "ring_swell",    "TYPE": "float", "DEFAULT": 0.90, "MIN": 0.70, "MAX": 1.10,
      "LABEL": "Orbit Scale", "BIND": "bass", "BIND_DEPTH": 0.35 },
    { "NAME": "network_warp",  "TYPE": "float", "DEFAULT": 0.52, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Ring Precession", "BIND": "mid", "BIND_DEPTH": 0.55 },
    { "NAME": "beacon_flare",  "TYPE": "float", "DEFAULT": 0.52, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Beacon Flare", "BIND": "treble", "BIND_DEPTH": 0.65 },
    { "NAME": "star_tint",     "TYPE": "color", "DEFAULT": [1.00, 0.78, 0.35, 1.00],
      "LABEL": "Core Star Tint" },
    { "NAME": "ring_tint",     "TYPE": "color", "DEFAULT": [0.35, 0.78, 1.00, 1.00],
      "LABEL": "Meridian Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.20
#define BOUND  1.42

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

// Distance to a 3D torus in XZ plane
float sdTorus(vec3 p, float ra, float rb) {
    vec2 q = vec2(length(p.xz) - ra, p.y);
    return length(q) - rb;
}

// Global morph & parameter variables
float g_R, g_thick, g_w1, g_w2, g_w3, g_turn, g_nucR;
float g_mat; // 0: rings/meridians, 1: stellar core, 2: satellite beacons, 3: latitude bands

float map(vec3 p) {
    // 1. Central Stellar Core
    float dCore = length(p) - g_nucR;

    // 2. Gyroscopic Orbital Rings & Meridians
    // Ring 1: Equatorial main ring
    vec3 p1 = p;
    pR(p1.xz, g_turn * 1.0);
    float r1 = sdTorus(p1, g_R, g_thick);

    // Ring 2: Polar Meridian ring
    vec3 p2 = p;
    pR(p2.yz, 1.5707963);
    pR(p2.xy, g_turn * 1.0);
    float r2 = sdTorus(p2, g_R * 0.97, g_thick * 0.90);

    // Ring 3: Tilted Oblique Armillary Ring A (inclined 38 deg)
    vec3 p3 = p;
    pR(p3.xy, 0.66);
    pR(p3.xz, g_turn * 2.0);
    float r3 = sdTorus(p3, g_R * 1.05, g_thick * 0.85);

    // Ring 4: Counter-rotating Oblique Armillary Ring B (inclined -38 deg)
    vec3 p4 = p;
    pR(p4.yz, -0.66);
    pR(p4.xz, -g_turn * 2.0);
    float r4 = sdTorus(p4, g_R * 1.10, g_thick * 0.80);

    // Latitude rings (+/- 32 degrees)
    float latY = g_R * 0.48;
    float latR = sqrt(max(0.0, g_R * g_R - latY * latY));
    vec3 pLat1 = vec3(p.x, p.y - latY, p.z);
    vec3 pLat2 = vec3(p.x, p.y + latY, p.z);
    float rLat = min(sdTorus(pLat1, latR, g_thick * 0.65), sdTorus(pLat2, latR, g_thick * 0.65));

    // Combine rings
    float dRings = min(min(r1, r2), min(r3, r4));
    dRings = min(dRings, rLat);

    // Archetype 1 (Bass): Astrolabe cogs / coordinate notches along equator
    if (g_w1 > 0.05) {
        float ang = atan(p1.z, p1.x);
        float cog = sin(ang * 24.0) * 0.012 * g_w1;
        dRings -= cog;
    }

    // Archetype 3 (Treble): Outer Constellation Satellite Beacons (18 orbiting nodes)
    float dSatellites = 1e5;
    if (g_w3 > 0.05) {
        float satR = g_R * 1.25;
        vec3 p_sym = abs(p);
        float dS1 = length(p_sym - vec3(satR, 0.0, 0.0)) - 0.030;
        float dS2 = length(p_sym - vec3(0.0, satR, 0.0)) - 0.030;
        float dS3 = length(p_sym - vec3(0.0, 0.0, satR)) - 0.030;
        float dS4 = length(p_sym - vec3(satR * 0.65, satR * 0.65, satR * 0.40)) - 0.024;
        dSatellites = min(min(dS1, dS2), min(dS3, dS4));
    }

    float d = dRings;
    g_mat = 0.0;

    if (dCore < d) {
        d = dCore;
        g_mat = 1.0;
    }
    if (dSatellites < d) {
        d = dSatellites;
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

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);

    // Border boundary attenuation guard (guide 10)
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Seamless loop phase
    float ph = fract(TIME / PERIOD);
    float turn = ph * TAU;
    g_turn = turn;

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

    // Narrow-kernel archetype weights
    float w1 = clamp(1.0 - abs(sel)       / 0.36, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.36, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.36, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    g_w1 = w1 / ws;
    g_w2 = w2 / ws;
    g_w3 = w3 / ws;

    // Scale & geometry morphing
    float sc = ring_swell * (1.0 + 0.03 * sin(turn * 2.0));
    g_R = mix(0.35, 0.40, sel) * sc;
    g_thick = (g_w1 * 0.026 + g_w2 * 0.013 + g_w3 * 0.008) * sc;
    g_nucR = (0.11 + 0.04 * sin(turn * 2.0)) * sc + 0.04 * AUDIO_BEAT;

    // ---- 3D Camera Orbit (guide 5) ----------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Downward 16-degree viewing pitch
    const float PITCH = 0.28;
    pR(ro.yz, PITCH);
    pR(rd.yz, PITCH);

    // Precession of celestial sphere
    float globSpin = turn * 0.50;
    float globRoll = 0.14 * sin(turn * 2.0);
    pR(ro.xz, globSpin);
    pR(rd.xz, globSpin);
    pR(ro.yz, globRoll);
    pR(rd.yz, globRoll);

    vec3 lightDir = normalize(vec3(0.55, 0.80, 0.35));
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
                float fres = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 2.5);
                vec3  refl = reflect(rd, n);
                float spec = pow(clamp(dot(refl, lightDir), 0.0, 1.0), 38.0);

                if (hitMat < 0.5) {
                    // Armillary Ring Meridians: Metallic bronze shifting to electric cyan data network
                    vec3 ringBase = mix(vec3(0.85, 0.62, 0.28), ring_tint.rgb, sel);
                    vec3 ringCol  = ringBase * (0.28 + 0.65 * diff)
                                  + vec3(1.0, 0.98, 0.90) * spec * 2.2
                                  + ringBase * fres * 1.20;

                    // Traveling optical pulse along the equator and meridians
                    float pulse = pow(clamp(sin(atan(p.z, p.x) * 6.0 - turn * 3.0), 0.0, 1.0), 8.0);
                    ringCol += vec3(0.7, 0.95, 1.0) * pulse * (1.2 + 1.4 * AUDIO_HAT);

                    col += ringCol * 0.92;
                    cov = max(cov, 0.94);
                    break;

                } else if (hitMat < 1.5) {
                    // Central Stellar Core: Radiant sun with corona
                    float beatPulse = 1.0 + 1.5 * AUDIO_BEAT;
                    vec3 starCol = star_tint.rgb * (2.4 * beatPulse + 1.5 * diff + 1.2 * fres);
                    col += starCol;
                    cov = 1.0;
                    break;

                } else {
                    // Constellation Satellite Beacons (Treble transients)
                    float flare = 1.0 + 2.2 * AUDIO_HAT * beacon_flare;
                    vec3 beaconCol = vec3(0.92, 0.98, 1.0) * (3.0 * flare + 1.4 * fres);
                    col += beaconCol;
                    cov = 1.0;
                    break;
                }
            }

            t += max(d * 0.85, 0.003);
            if (t > tb1) break;
        }
    }

    // Volumetric Celestial Corona Glow
    float coreGlow = (0.0024 / (rr * rr + 0.0028)) * smoothstep(0.42, 0.02, rr);
    coreGlow *= (0.65 + 0.35 * AUDIO_BEAT);
    vec3 glowCol = mix(star_tint.rgb, ring_tint.rgb, sel) * coreGlow;
    col += glowCol * (0.85 + 0.55 * beacon_flare);
    cov = clamp(cov + coreGlow * 0.45, 0.0, 1.0);

    // Frame edge boundary attenuation
    col *= bound;
    float alpha = clamp(cov, 0.0, 1.0) * bound;
    alpha = smoothstep(0.015, 0.95, alpha);

    // Premultiplied alpha output (guide 8)
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
