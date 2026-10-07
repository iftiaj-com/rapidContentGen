/*{
  "ADITS": 1,
  "DESCRIPTION": "A circular matrix of kinetic voxel columns and volumetric god rays that morphs across spectral archetypes: brutalist obsidian monoliths at bass, a spiraling geometric citadel in the mids, and an iridescent laser spire grid at treble.",
  "CREDIT": "Gemini 3.7 Flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "morph", "geometric", "audio", "3d"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Onset Snap" },
    { "NAME": "bias",  "TYPE": "float", "DEFAULT": 0.08, "MIN": 0.01, "MAX": 1.00,
      "LABEL": "Silence Archetype" },
    { "NAME": "swell", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.60, "MAX": 1.10,
      "LABEL": "Matrix Scale", "BIND": "bass", "BIND_DEPTH": 0.25 },
    { "NAME": "lume",  "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Luminescence", "BIND": "level", "BIND_DEPTH": 0.45 },
    { "NAME": "warp",  "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Harmonic Twist", "BIND": "mid", "BIND_DEPTH": 0.35 }
  ]
}*/

#define PI 3.14159265359
#define TAU 6.28318530718

float rand(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 ip = floor(p);
    vec2 u = fract(p);
    u = u * u * (3.0 - 2.0 * u);
    float res = mix(
        mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
        mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x),
        u.y
    );
    return res * res;
}

float fbm(vec2 p) {
    float r = 0.0;
    float amp = 1.0;
    float freq = 1.0;
    for (int i = 0; i < 3; i++) {
        r += amp * noise(freq * p);
        amp *= 0.5;
        freq *= 2.0;
    }
    return r;
}

mat2 rot(float th) {
    float c = cos(th), s = sin(th);
    return mat2(c, -s, s, c);
}

float ease3(float w) {
    return w * w * (3.0 - 2.0 * w);
}

float cio(float t) {
    return t < 0.5
        ? 0.5 * (1.0 - sqrt(max(0.0, 1.0 - 4.0 * t * t)))
        : 0.5 * (sqrt(max(0.0, (3.0 - 2.0 * t) * (2.0 * t - 1.0))) + 1.0);
}

float calcAnimHeight(vec2 p, float turn, float sel, float warpVal) {
    float tPhase = turn;
    float cPhase = fract(tPhase / TAU);
    
    // Archetype 0: Low bass heavy brutalist ripple
    float h0 = fbm(p * 0.45 + vec2(cos(tPhase * 0.5), sin(tPhase * 0.5)) * 0.8);
    float r0 = length(p);
    float wave0 = sin(r0 * 3.5 - tPhase * 2.0) * 0.5 + 0.5;
    h0 = (h0 * 0.7 + wave0 * 0.45) * smoothstep(2.4, 0.2, r0);
    
    // Archetype 1: Mid stepped kinetic vortex
    vec2 p1 = rot(cio(cPhase) * 2.5 * warpVal + r0 * 0.4) * p;
    float h1 = fbm(p1 * 0.75 + tPhase * 0.35);
    float stepTier = floor(h1 * 4.0) / 4.0;
    h1 = mix(h1, stepTier, 0.45) * 1.1;
    
    // Archetype 2: Treble high-frequency needle resonance
    vec2 p2 = rot(-tPhase * 0.75) * p;
    float h2 = noise(p2 * 2.2 + vec2(sin(tPhase * 2.0), cos(tPhase * 2.0)));
    float needleSpike = pow(noise(p2 * 4.5 - tPhase), 2.5) * 2.2;
    h2 = (h2 * 0.4 + needleSpike * 0.8) * (1.0 + 0.4 * AUDIO_SNARE);
    
    // Blend archetypes across spectral selector
    float xw = sel * 2.0;
    float w0 = ease3(clamp(1.0 - abs(xw) * 1.72, 0.0, 1.0));
    float w1 = ease3(clamp(1.0 - abs(xw - 1.0) * 1.72, 0.0, 1.0));
    float w2 = ease3(clamp(1.0 - abs(xw - 2.0) * 1.72, 0.0, 1.0));
    float wsum = w0 + w1 + w2 + 1e-4;
    w0 /= wsum; w1 /= wsum; w2 /= wsum;
    
    float h = h0 * w0 + h1 * w1 + h2 * w2;
    
    // Rhythm pulse kicks
    float kickPls = AUDIO_KICK * 0.35 * smoothstep(1.8, 0.0, length(p));
    return clamp(h * 1.25 + kickPls, 0.02, 1.8);
}

float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// Global scene configuration values passed to distance estimator
float g_turn;
float g_sel;
float g_warp;
float g_scale;

float map(vec3 p) {
    float boundR = 2.15 * g_scale;
    float rXZ = length(p.xz);
    float bd = rXZ - boundR;
    if (bd > 0.35) {
        return bd;
    }
    
    float cellSz = mix(0.16, 0.11, g_sel) * g_scale;
    vec2 id = floor((p.xz + 0.5 * cellSz) / cellSz);
    vec2 centerPos = id * cellSz;
    
    // Individual column height based on morph
    float h = calcAnimHeight(centerPos / max(g_scale, 0.01), g_turn, g_sel, g_warp) * 0.55 * g_scale;
    
    // Local box coordinate
    vec2 localXZ = p.xz - centerPos;
    float bw = cellSz * mix(0.36, 0.22, g_sel);
    
    vec3 q = vec3(localXZ.x, p.y - h * 0.5, localXZ.y);
    float boxDist = sdBox(q, vec3(bw, h * 0.5, bw));
    
    // Cylindrical boundary mask
    float discMask = rXZ - boundR;
    return max(boxDist, discMask) * 0.65;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.002;
    return normalize(
        k.xyy * map(p + k.xyy * e) +
        k.yyx * map(p + k.yyx * e) +
        k.yxy * map(p + k.yxy * e) +
        k.xxx * map(p + k.xxx * e)
    );
}

vec2 trace(vec3 ro, vec3 rd, float maxDist) {
    float t = 0.0;
    float d = 0.0;
    for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * t;
        d = map(p);
        if (d < 0.0015 || t > maxDist) {
            break;
        }
        t += d;
    }
    return vec2(t, d);
}

vec3 acesFilm(const vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float screenR = length(uv);

    // Exact loop period: 16.0 seconds
    float ph = fract(TIME / 16.0);
    float turn = ph * TAU;

    // Spectral morph selector calculation
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);

    // Silence fallback smoothly blends into configured bias archetype
    float lively = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(bias, sel, lively);

    // Onset pulses provide instantaneous transient snaps
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    // Global parameters for map evaluation
    g_turn = turn;
    g_sel = sel;
    g_warp = warp;
    g_scale = swell * (1.0 + 0.04 * sin(turn * 2.0));

    // Palette archetypes
    // Archetype 0: Deep Obsidian / Molten Amber Core
    vec3 col0_base = vec3(0.12, 0.07, 0.05);
    vec3 col0_glow = vec3(1.00, 0.55, 0.15);
    // Archetype 1: Kinetic Stepped Citadel (Cyan / Gold / Emerald)
    vec3 col1_base = vec3(0.05, 0.10, 0.14);
    vec3 col1_glow = vec3(0.15, 0.85, 0.95);
    // Archetype 2: Prismatic Laser Needle Matrix (Neon Magenta / Electric Violet / White)
    vec3 col2_base = vec3(0.12, 0.04, 0.14);
    vec3 col2_glow = vec3(1.00, 0.25, 0.80);

    float xw = sel * 2.0;
    float w0 = ease3(clamp(1.0 - abs(xw) * 1.72, 0.0, 1.0));
    float w1 = ease3(clamp(1.0 - abs(xw - 1.0) * 1.72, 0.0, 1.0));
    float w2 = ease3(clamp(1.0 - abs(xw - 2.0) * 1.72, 0.0, 1.0));
    float wsum = w0 + w1 + w2 + 1e-4;
    w0 /= wsum; w1 /= wsum; w2 /= wsum;

    vec3 baseMatCol = col0_base * w0 + col1_base * w1 + col2_base * w2;
    vec3 glowMatCol = col0_glow * w0 + col1_glow * w1 + col2_glow * w2;

    // View-aligned camera using host CAM_DIR and CAM_UP
    const float ORBIT = 7.5;
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ta = vec3(0.0, -0.15, 0.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.85 * ww);

    // Primary raymarch
    vec2 tr = trace(ro, rd, 18.0);
    vec3 col = vec3(0.0);
    float hitAlpha = 0.0;

    if (tr.x < 18.0 && tr.y < 0.003) {
        vec3 pos = ro + rd * tr.x;
        vec3 nor = calcNormal(pos);

        // Lighting
        vec3 lp = vec3(0.0, 4.5 * g_scale, 0.0);
        vec3 ld = normalize(lp - pos);
        float diff = max(dot(nor, ld), 0.0);
        float fres = pow(clamp(1.0 + dot(nor, rd), 0.0, 1.0), 3.0);
        float colH = max(pos.y + 0.1, 0.0) / (1.2 * g_scale);
        
        // Emissive vertical column glow
        float emissive = pow(colH, 2.5) * (1.2 + 0.8 * lume) * (0.8 + 0.5 * AUDIO_BEAT);
        float discBound = smoothstep(2.15 * g_scale, 1.6 * g_scale, length(pos.xz));

        vec3 surfCol = baseMatCol * (diff * 0.8 + 0.2) +
                       glowMatCol * emissive * discBound +
                       vec3(1.0, 0.95, 0.9) * fres * 0.65;
        
        col = surfCol;
        hitAlpha = smoothstep(18.0, 14.0, tr.x) * discBound;
    }

    // Volumetric god-ray accumulation
    vec3 lp = vec3(0.0, 4.5 * g_scale, 0.0);
    float vol = 0.0;
    float s = 4.2;
    for (int j = 0; j < 36; j++) {
        vec3 vpos = ro + rd * s;
        vec3 toLight = -normalize(lp - vpos);
        float tFloor = -(lp.y - 0.2) / max(toLight.y, 0.001);
        vec3 ppos = lp + toLight * tFloor;
        
        float rPlane = length(ppos.xz);
        if (rPlane < 2.2 * g_scale) {
            float sampleH = calcAnimHeight(ppos.xz / max(g_scale, 0.01), g_turn, g_sel, g_warp);
            float beam = pow(sampleH, 2.8) * 0.024 *
                         smoothstep(-0.2, 1.8 * g_scale, vpos.y) *
                         smoothstep(2.2 * g_scale, 0.4 * g_scale, rPlane);
            vol += beam;
        }
        s += 0.14;
    }

    // Add volumetric radiance
    float volBrightness = (0.7 + 1.2 * lume) * (1.0 + 0.4 * AUDIO_LEVEL);
    col += glowMatCol * vol * volBrightness * 2.2;

    // Tonemap and color finish
    col = acesFilm(col * 0.85);
    col = pow(col, vec3(1.0 / 2.2));

    // Spatial bounding falloff to prevent edge clipping (Guide §10)
    float edgeBound = 1.0 - smoothstep(0.42, 0.485, screenR);
    col *= edgeBound;

    // Strict premultiplied alpha derivation
    float volAlpha = clamp(vol * 1.6, 0.0, 1.0);
    float alpha = clamp(hitAlpha * 0.95 + volAlpha * 0.85, 0.0, 1.0) * edgeBound;
    alpha = smoothstep(0.01, 0.92, alpha);
    alpha = clamp(alpha, 0.0, 1.0);

    // Premultiply
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
