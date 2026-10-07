/*{
  "ADITS": 1,
  "DESCRIPTION": "An obsidian biomechanical coronet featuring helical solenoid coils and articulated claw-ribs around a glowing central spire, morphing spectrally between a dense spiked crown, an orbiting solenoid cage, and a flared needle starburst.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",   "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",    "TYPE": "float", "DEFAULT": 0.12, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "coil_density", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Coil Density", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "claw_spread",  "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Claw Spread", "BIND": "mid", "BIND_DEPTH": 0.55 },
    { "NAME": "glow_tint",    "TYPE": "color", "DEFAULT": [0.15, 0.75, 1.00, 1.00],
      "LABEL": "Core Glow Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.20
#define BOUND  1.18

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

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Globals for SDF evaluation
float g_ph;
float g_coreR;
float g_coilR;
float g_coilThickness;
float g_clawScale;
float g_spireLen;
float g_morphK;

float map(vec3 p) {
    // Rotation over loop period
    pR(p.xz, g_ph * 0.5);

    // Central obelisk core / spire
    float coreD = length(p.xz) - g_coreR * (1.0 - 0.35 * smoothstep(0.0, g_spireLen, abs(p.y)));
    coreD = max(coreD, abs(p.y) - g_spireLen);

    // Radial symmetry for solenoid coils and articulated claw-ribs
    // 8-fold symmetry
    float sector = TAU / 8.0;
    float a = atan(p.z, p.x + 1e-7);
    float r = length(p.xz);

    // Fold angle with bilateral symmetry inside sectors
    a = mod(a + sector * 0.5, sector) - sector * 0.5;
    a = abs(a);
    vec2 pRot = vec2(cos(a), sin(a)) * r;
    vec3 q = vec3(pRot.x, p.y, pRot.y);

    // Articulated claw-ribs extending outward
    vec3 clawP = q - vec3(g_coreR * 1.2, 0.0, 0.0);
    pR(clawP.xy, 0.35 * sin(q.y * 3.0 + g_ph));
    float clawD = length(clawP.xz) - g_clawScale * (0.85 - 0.45 * (q.y / g_spireLen));
    clawD = max(clawD, abs(q.y) - g_spireLen * 0.9);

    // Solenoid helical coils around torus radius
    vec2 torusP = vec2(r - g_coilR, p.y);
    float coilAngle = atan(p.y, r - g_coilR + 1e-7);
    float helix = sin(coilAngle * (4.0 + 8.0 * coil_density) + a * 8.0 + g_ph * 2.0);
    float coilD = length(torusP) - (g_coilThickness + 0.012 * helix);

    // Combine SDF components with smooth union
    float d = smin(coreD, clawD, g_morphK);
    d = smin(d, coilD, g_morphK);

    return d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Obsidian environment lighting with deep metallic dark gloss and specular rims
vec3 envObsidian(vec3 r, vec3 n, vec3 viewDir) {
    float up = r.y;
    // Dark glossy body with subtle blue-grey floor/sky reflection
    vec3 col = mix(vec3(0.015, 0.018, 0.025),
                   vec3(0.080, 0.110, 0.160),
                   smoothstep(-0.40, 0.50, up));

    // Hot key specular light highlight
    vec3 keyDir = normalize(vec3(0.50, 0.85, 0.60));
    float spec = pow(max(dot(r, keyDir), 0.0), 64.0);
    col += vec3(0.95, 0.98, 1.00) * spec * 3.5;

    // Secondary fill light
    vec3 fillDir = normalize(vec3(-0.60, 0.30, -0.50));
    float spec2 = pow(max(dot(r, fillDir), 0.0), 24.0);
    col += glow_tint.rgb * spec2 * 1.2;

    // Deep grazing fresnel rim
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += mix(glow_tint.rgb, vec3(1.0), 0.50) * fres * 1.8;

    return col;
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Hard silhouette border check to guarantee edge = 0
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Phase wraps perfectly over 16 seconds
    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- Spectral morph selector (guide §12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.15 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // 3 Archetypes kernel weights
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0); // Spiked Crown
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0); // Solenoid Cage
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0); // Needle Starburst
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Archetype geometry interpolation
    g_coreR         = w1 * 0.22 + w2 * 0.12 + w3 * 0.06;
    g_coilR         = w1 * 0.32 + w2 * 0.55 + w3 * 0.68;
    g_coilThickness = w1 * 0.02 + w2 * 0.055 + w3 * 0.018;
    g_clawScale     = w1 * 0.08 + w2 * 0.05 + w3 * 0.025;
    g_spireLen      = w1 * 0.65 + w2 * 0.45 + w3 * 0.85;
    g_morphK        = w1 * 0.12 + w2 * 0.06 + w3 * 0.025;

    // Continuous parameter modulation
    g_coilR *= 0.92 + 0.16 * claw_spread;
    g_spireLen *= 0.90 + 0.20 * AUDIO_BEAT;

    // ---- Camera setup (guide §5) ------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Subtle precessional tilt tied to loop integer harmonics
    float pitch = 0.25 * sin(g_ph) + 0.20;
    pR(ro.yz, pitch);
    pR(rd.yz, pitch);

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;

        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.5));
            if (d < 0.001) {
                hit = true;
                break;
            }
            t += d * 0.80;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 viewDir = -rd;
            vec3 refl = reflect(rd, n);

            col = envObsidian(refl, n, viewDir);

            // Core energy seam glow
            float seam = pow(max(0.0, 1.0 - length(p.xz) / (g_coilR + 0.1)), 3.0);
            col += glow_tint.rgb * seam * (1.2 + 1.5 * AUDIO_BEAT);

            alpha = 1.0;
        }
    }

    // Bounded volumetric core glow based on ray closest approach
    float ca = clamp(1.0 - near * 4.8, 0.0, 1.0);
    float glow = (pow(ca, 5.0) * 0.35 + pow(ca, 24.0) * 0.65) * (1.0 - alpha);
    glow *= smoothstep(0.442, 0.08, rr) * (0.50 + 0.80 * AUDIO_BEAT);
    col += glow_tint.rgb * glow * 1.4;
    alpha = clamp(alpha + glow * 0.60, 0.0, 1.0);

    // Tone map and contrast
    col = col / (1.0 + col * 0.28);
    col = pow(max(col, 0.0), vec3(0.92));

    // Premultiply alpha & apply absolute edge mask
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
