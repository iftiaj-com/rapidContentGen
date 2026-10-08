/*{
  "ADITS": 1,
  "DESCRIPTION": "A glossy obsidian bipyramidal cage enclosing a pulsing bioluminescent core. It rests as a smooth fused carapace pod, unfolds into an articulated skeletal harness, and extends into a needle-spined polyhedral star under spectral audio drive.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.10, "MAX": 0.78,
      "LABEL": "Harness Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "warp",       "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Strut Flex", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "glow",       "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Core Flare", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "chitin_tint", "TYPE": "color", "DEFAULT": [0.08, 0.10, 0.14, 1.00],
      "LABEL": "Chitin Tint" },
    { "NAME": "core_tint",   "TYPE": "color", "DEFAULT": [0.15, 0.85, 1.00, 1.00],
      "LABEL": "Core Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  4.80
#define BOUND  1.12

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

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

float smax(float a, float b, float k) {
    return -smin(-a, -b, k);
}

// Global parameters updated per frame by the morph selector
float g_ph, g_scale, g_gap, g_spine, g_k, g_coreR;
float g_matId; // 0.0 = obsidian chitin carapace, 1.0 = inner core

// 5-fold symmetric bipyramidal skeletal harness
float map(vec3 p) {
    float ph = g_ph;

    // Slight slow undulating breathing
    vec3 q = p;
    float rad = length(q.xz);
    float ang = atan(q.z, q.x);

    // 5-fold angular domain repetition for harness symmetry
    float sector = TAU / 5.0;
    float an = mod(ang + sector * 0.5, sector) - sector * 0.5;
    vec2 p2d = vec2(cos(an), sin(an)) * rad;
    vec3 q5 = vec3(p2d.x, q.y, p2d.y);

    // Primitive 1: Central bioluminescent core sphere
    float dCore = length(p) - g_coreR;

    // Primitive 2: Upper and lower bipyramid cones/slits
    // Base bipyramid distance via plane intersection & scaling
    float hCap = 0.72 * g_scale;
    float rBase = 0.48 * g_scale;

    // Slanted facet plane for bipyramid shell
    float facet = (q5.x * rBase + abs(q5.y) * hCap) / sqrt(rBase * rBase + hCap * hCap) - (rBase * hCap) / sqrt(rBase * rBase + hCap * hCap);

    // Longitudinal carving channels separating the 5 ribs
    float channelWidth = 0.06 * g_scale + g_gap * 0.14;
    float channel = abs(q5.z) - channelWidth;

    // Shell thickness
    float thickness = 0.045 * g_scale;
    float dShell = max(facet, -facet - thickness);

    // Articulate ribs by cutting channels into the shell
    float dHarness = max(dShell, -channel);

    // Add sharp needle spines at corner vertices (Archetype 3 morph feature)
    if (g_spine > 0.01) {
        vec3 spinePos = q5 - vec3(rBase * 0.85, 0.0, 0.0);
        float dSpine = length(spinePos.yz) - 0.012 * g_scale;
        dSpine = max(dSpine, abs(spinePos.x) - g_spine * 0.28);
        dHarness = smin(dHarness, dSpine, 0.03);
    }

    // Blend core and outer harness smooth minimum
    float dCombined = smin(dHarness, dCore + 0.05, g_k);

    if (dCore < dHarness) {
        g_matId = 1.0;
    } else {
        g_matId = 0.0;
    }

    return dCombined * 0.85;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Studio environment reflection for glossy obsidian carapace
vec3 envObsidian(vec3 r) {
    float up = r.y;
    vec3 c = mix(chitin_tint.rgb * 0.15, chitin_tint.rgb * 0.85, smoothstep(-0.4, 0.6, up));
    // Key highlight studio strip
    c += vec3(0.95, 0.98, 1.00) * pow(max(dot(r, normalize(vec3(0.5, 0.7, 0.5))), 0.0), 48.0) * 2.8;
    // Secondary specular rim light
    c += core_tint.rgb * pow(max(dot(r, normalize(vec3(-0.6, -0.3, -0.6))), 0.0), 16.0) * 0.85;
    return c;
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);

    // Strict silhouette border culling to prevent frame clipping (0.48 max radius)
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- spectral morph selector (guide §12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    // Morph archetypes weighting kernel
    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Archetype parameters interpolated spectrally
    // Archetype 1: Fused compact pod
    // Archetype 2: Articulated bipyramidal skeletal harness
    // Archetype 3: Needle-spined polyhedral star
    g_scale = w1 * 0.72 + w2 * 0.88 + w3 * 1.05;
    g_gap   = w1 * 0.00 + w2 * 0.55 + w3 * 1.10;
    g_spine = w1 * 0.00 + w2 * 0.10 + w3 * 0.85;
    g_k     = w1 * 0.14 + w2 * 0.06 + w3 * 0.02;
    g_coreR = w1 * 0.18 + w2 * 0.24 + w3 * 0.30;

    // Continuous audio adjustments
    float grow = (0.92 + 0.18 * swell) * (0.98 + 0.03 * sin(g_ph));
    g_scale *= grow;
    g_gap   += warp * 0.25;
    g_coreR *= (0.90 + 0.25 * glow + 0.15 * AUDIO_KICK);

    // ---- camera from CAM_DIR and CAM_UP (guide §5) -------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // Slow organic precession matching integer loop phase
    float spin = g_ph;
    float pitch = 0.28 * sin(g_ph);
    pR(ro.xz, spin); pR(ro.yz, pitch);
    pR(rd.xz, spin); pR(rd.yz, pitch);

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
            near = min(near, d / max(t, 0.6));
            if (d < 0.0009) { hit = true; break; }
            t += d * 0.75;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Shading: Obsidian Biomech material
            // Deep obsidian gloss body with intense specular fresnel rim
            vec3 env = envObsidian(refl);
            float fresnel = pow(1.0 - ndv, 4.0);

            // Outer obsidian carapace shading
            vec3 carapaceCol = chitin_tint.rgb * 0.20 + env * (0.35 + 0.65 * fresnel);
            carapaceCol += vec3(0.9, 0.95, 1.0) * pow(fresnel, 2.0) * 0.75;

            // Internal bioluminescent core illumination
            float coreGlow = smoothstep(g_coreR + 0.10, g_coreR - 0.05, length(p));
            vec3 coreEmissive = core_tint.rgb * (1.8 + 2.2 * glow) * (0.7 + 0.6 * AUDIO_BEAT);

            col = mix(carapaceCol, coreEmissive, g_matId * 0.85);
            // Self-occlusion and rim highlight boost
            col += core_tint.rgb * fresnel * (0.4 + 0.8 * glow);
            alpha = 1.0;
        }
    }

    // Bounded atmospheric sheath from closest approach (guide §8)
    float ca = clamp(1.0 - near * 5.2, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.35 + pow(ca, 24.0) * 0.65) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.45 + 0.55 * glow) * (0.60 + 0.80 * AUDIO_BEAT);
    col += core_tint.rgb * sheath * 1.2;
    alpha = clamp(alpha + sheath * 0.60, 0.0, 1.0);

    // Tone mapping and premultiplication
    col = col / (1.0 + col * 0.38);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
