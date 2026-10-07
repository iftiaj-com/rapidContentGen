/*{
  "ADITS": 1,
  "DESCRIPTION": "A 3D morphing relic uniting a faceted crystal prism under bass, a biomechanical skeletal vertebrae ribcage in the mids, and an armillary celestial gyro under treble. Rests in silence on the faceted jewel.",
  "CREDIT": "gemini-3.8-flash",
  "DATE": "2026-09-17",
  "CATEGORIES": ["generative", "3d", "morph", "biomech", "audio"],
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
    { "NAME": "relic_scale",   "TYPE": "float", "DEFAULT": 0.88, "MIN": 0.70, "MAX": 1.10,
      "LABEL": "Relic Scale", "BIND": "bass", "BIND_DEPTH": 0.35 },
    { "NAME": "warp_phase",    "TYPE": "float", "DEFAULT": 0.52, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Skeletal Flex", "BIND": "mid", "BIND_DEPTH": 0.55 },
    { "NAME": "flare_level",   "TYPE": "float", "DEFAULT": 0.52, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Transients Flare", "BIND": "treble", "BIND_DEPTH": 0.65 },
    { "NAME": "ivory_tint",    "TYPE": "color", "DEFAULT": [0.95, 0.90, 0.78, 1.00],
      "LABEL": "Shell / Bone Tint" },
    { "NAME": "core_tint",     "TYPE": "color", "DEFAULT": [1.00, 0.65, 0.25, 1.00],
      "LABEL": "Core Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.50
#define BOUND  1.38

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

float sdTorus(vec3 p, float ra, float rb) {
    vec2 q = vec2(length(p.xz) - ra, p.y);
    return length(q) - rb;
}

// Global morph variables
float g_R, g_w1, g_w2, g_w3, g_turn, g_nucR;
float g_mat; // 0: morph body, 1: nucleus, 2: floor caustics
float g_causticFloorY;

// Tri-Motif SDF
float sdTriadMorph(vec3 p, float r, float w1, float w2, float w3) {
    // ---- 1. Faceted Crystal Prism (Card 1 motif) ----
    vec3 ps = abs(p);
    float d_cube = max(ps.x, max(ps.y, ps.z)) - r * 0.92;
    float d_oct  = dot(ps, vec3(0.57735027, 0.57735027, 0.57735027)) - r;
    const vec3 n_dod = vec3(0.0, 0.5257311, 0.8506508);
    float d_dod = max(dot(ps, n_dod.xyz), max(dot(ps, n_dod.yzx), dot(ps, n_dod.zxy))) - r * 0.95;
    float d_prism = max(d_oct, max(d_cube, d_dod));

    // ---- 2. Biomechanical Vertebrae Spine & Ribcage (Card 4 motif) ----
    float spine = max(length(p.xz) - 0.038, abs(p.y) - r * 0.92);
    // 6 thoracic rib arches
    float ribY = mod(p.y + 0.22, 0.088) - 0.044;
    float ribArch = length(vec2(length(vec2(abs(p.x) - 0.13, p.z * 0.75 + 0.04)) - 0.15, ribY)) - 0.016;
    ribArch = max(ribArch, abs(p.y) - r * 0.68);
    float d_skeleton = min(spine, ribArch);

    // ---- 3. Celestial Orbital Gyroscope (Card 5 motif) ----
    float g1 = sdTorus(p, r * 1.08, 0.014);
    vec3 pr1 = p; pR(pr1.yz, 1.25);
    float g2 = sdTorus(pr1, r * 1.04, 0.012);
    vec3 pr2 = p; pR(pr2.xy, 0.85);
    float g3 = sdTorus(pr2, r * 1.00, 0.011);
    float d_sat = length(abs(p) - vec3(r * 1.22, 0.0, 0.0)) - 0.028;
    float d_gyro = min(min(g1, g2), min(g3, d_sat));

    // Smooth geometric transition across the three motifs
    return w1 * d_prism + w2 * d_skeleton + w3 * d_gyro;
}

float map(vec3 p) {
    // 1. Morphed Body
    float dBody = sdTriadMorph(p, g_R, g_w1, g_w2, g_w3);

    // 2. Central Stellar Nucleus (shared anchor)
    float dCore = length(p) - g_nucR;

    // 3. Ground Caustic Plinth Disc (active during prism archetype)
    float dFloor = 1e5;
    if (g_w1 > 0.08) {
        dFloor = p.y - g_causticFloorY;
        float rFloor = length(p.xz);
        dFloor = max(dFloor, rFloor - 0.78);
        dFloor = max(dFloor, -(p.y - (g_causticFloorY - 0.02)));
    }

    float d = dBody;
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

    // Archetype weights (triangular narrow kernel)
    float w1 = clamp(1.0 - abs(sel)       / 0.36, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.36, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.36, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    g_w1 = w1 / ws;
    g_w2 = w2 / ws;
    g_w3 = w3 / ws;

    // Global scale and nucleus dimensions
    float sc = relic_scale * (1.0 + 0.03 * sin(turn * 2.0));
    g_R = mix(0.32, 0.36, sel) * sc;
    g_nucR = (0.09 + 0.03 * sin(turn * 2.0)) * sc + 0.03 * AUDIO_BEAT;
    g_causticFloorY = -0.48;

    // ---- 3D Camera Basis (guide 5) ----------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Natural 14-degree pitch
    const float PITCH = 0.24;
    pR(ro.yz, PITCH);
    pR(rd.yz, PITCH);

    // Precession rotation
    float spin = turn * 0.75;
    float wobble = 0.12 * sin(turn * 2.0);
    pR(ro.xz, spin);
    pR(rd.xz, spin);
    pR(ro.yz, wobble);
    pR(rd.yz, wobble);

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
                float fres = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 2.6);
                vec3  refl = reflect(rd, n);
                float spec = pow(clamp(dot(refl, lightDir), 0.0, 1.0), 40.0);

                if (hitMat < 0.5) {
                    // Body material: Amber Gold (Prism) -> Ivory White (Vertebrae) -> Iridescent Cyan (Gyro)
                    vec3 colPrism = vec3(1.00, 0.75, 0.30);
                    vec3 colBone  = ivory_tint.rgb;
                    vec3 colGyro  = vec3(0.35, 0.85, 1.00);

                    vec3 matBase = g_w1 * colPrism + g_w2 * colBone + g_w3 * colGyro;
                    vec3 bodyCol = matBase * (0.24 + 0.68 * diff)
                                 + vec3(1.0, 0.98, 0.92) * spec * 2.2
                                 + matBase * fres * 1.15;

                    col += bodyCol * 0.92;
                    cov = max(cov, 0.94);
                    break;

                } else if (hitMat < 1.5) {
                    // Central Stellar Core Nucleus
                    float beatPulse = 1.0 + 1.4 * AUDIO_BEAT;
                    vec3 nucCol = core_tint.rgb * (2.2 * beatPulse + 1.4 * diff + 1.2 * fres);
                    col += nucCol;
                    cov = 1.0;
                    break;

                } else {
                    // Caustic Floor Pool (Prism archetype)
                    float distCenter = length(p.xz);
                    float ringMask = smoothstep(0.76, 0.22, distCenter) * smoothstep(0.06, 0.22, distCenter);
                    float caust = pow(clamp(abs(sin(p.x * 12.0 + turn * 2.0) * cos(p.z * 14.0 - turn * 1.5)), 0.0, 1.0), 3.0);
                    caust *= (0.75 + 1.2 * AUDIO_HAT * flare_level);
                    vec3 caustCol = vec3(1.0, 0.75, 0.35) * caust * ringMask * g_w1;
                    col += caustCol;
                    cov = max(cov, ringMask * 0.60 * g_w1);
                    break;
                }
            }

            t += max(d * 0.82, 0.003);
            if (t > tb1) break;
        }
    }

    // Volumetric Central Core Glow
    float coreGlow = (0.0022 / (rr * rr + 0.0028)) * smoothstep(0.42, 0.02, rr);
    coreGlow *= (0.65 + 0.35 * AUDIO_BEAT);
    vec3 glowCol = mix(core_tint.rgb, ivory_tint.rgb, sel) * coreGlow;
    col += glowCol * (0.85 + 0.55 * flare_level);
    cov = clamp(cov + coreGlow * 0.45, 0.0, 1.0);

    // Frame edge boundary attenuation
    col *= bound;
    float alpha = clamp(cov, 0.0, 1.0) * bound;
    alpha = smoothstep(0.015, 0.95, alpha);

    // Premultiplied alpha output (guide 8)
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
