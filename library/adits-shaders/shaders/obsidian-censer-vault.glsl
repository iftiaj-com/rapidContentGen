/*{
  "ADITS": 1,
  "DESCRIPTION": "A floating biomechanical censer enclosed by nested obsidian vault arches. Low frequencies swell the heavy central vessel, mids rotate the floating mechanical ribs, and highs ignite glowing energy seams across its carapace.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-03-31",
  "CATEGORIES": ["generative", "3d", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_sens",    "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_bias",     "TYPE": "float", "DEFAULT": 0.00, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "vault_scale",   "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.15, "MAX": 0.65,
      "LABEL": "Vault Scale", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "rib_spin",      "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Rib Spin", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "seam_glow",     "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Seam Glow", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "obsidian_tint", "TYPE": "color", "DEFAULT": [0.08, 0.09, 0.12, 1.00],
      "LABEL": "Obsidian Tint" },
    { "NAME": "seam_tint",     "TYPE": "color", "DEFAULT": [0.20, 0.85, 1.00, 1.00],
      "LABEL": "Energy Seam Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.50
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

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float g_ph, g_scale, g_spin, g_seam_val;
float g_arch0_w, g_arch1_w, g_arch2_w;

float map(vec3 p) {
    vec3 origP = p;

    // Core censer vessel (shared nucleus for stability across morphs)
    float dCore = length(p) - (0.22 + 0.05 * sin(g_ph * 2.0));
    float dSeamPattern = sin(p.x * 20.0 + g_ph) * sin(p.y * 20.0) * sin(p.z * 20.0);
    dCore += 0.012 * dSeamPattern;

    // Archetype 0: Monolithic Censer (Heavy armored urn & nested arches)
    float dArch0 = 1e4;
    {
        vec3 p0 = p;
        pR(p0.xz, g_ph * 0.5);
        float body = sdTorus(p0, vec2(0.42 * g_scale, 0.14));
        body = smin(body, sdCapsule(p0, vec3(0.0, -0.45 * g_scale, 0.0), vec3(0.0, 0.45 * g_scale, 0.0), 0.18), 0.08);

        // Shell plates
        vec3 pPlates = p0;
        float angle = atan(pPlates.z, pPlates.x);
        float sec = TAU / 6.0;
        float aMod = mod(angle + sec * 0.5, sec) - sec * 0.5;
        vec2 q = vec2(length(pPlates.xz), pPlates.y);
        q = vec2(cos(aMod) * q.x, q.y);
        float plates = sdBox(vec3(q.x - 0.52 * g_scale, q.y, 0.0), vec3(0.06, 0.35 * g_scale, 0.12));

        dArch0 = smin(body, plates, 0.06);
    }

    // Archetype 1: Ribbed Armillary (Interlocking mechanical rib cages)
    float dArch1 = 1e4;
    {
        vec3 p1 = p;
        pR(p1.xz, g_ph + g_spin);
        pR(p1.xy, g_ph * 0.7);

        float ring1 = sdTorus(p1, vec2(0.55 * g_scale, 0.035));

        vec3 p1b = p;
        pR(p1b.yz, g_ph * 1.3 - g_spin);
        pR(p1b.xz, -g_ph * 0.8);
        float ring2 = sdTorus(p1b, vec2(0.68 * g_scale, 0.030));

        // Rib spokes
        vec3 pSpokes = p1;
        float aSpoke = atan(pSpokes.z, pSpokes.x);
        float secSpoke = TAU / 8.0;
        float aSMod = mod(aSpoke + secSpoke * 0.5, secSpoke) - secSpoke * 0.5;
        vec3 pS = vec3(cos(aSMod) * length(pSpokes.xz), pSpokes.y, sin(aSMod) * length(pSpokes.xz));
        float spokes = sdCapsule(pS, vec3(0.20, 0.0, 0.0), vec3(0.55 * g_scale, 0.0, 0.0), 0.025);

        dArch1 = min(min(ring1, ring2), spokes);
    }

    // Archetype 2: Stellar Spire (Radiating obsidian blades & filigree)
    float dArch2 = 1e4;
    {
        vec3 p2 = p;
        pR(p2.xz, -g_ph * 1.2);

        float spire = sdCapsule(p2, vec3(0.0, -0.65 * g_scale, 0.0), vec3(0.0, 0.65 * g_scale, 0.0), 0.08);

        // Radiant blades
        float aBlade = atan(p2.z, p2.x);
        float secBlade = TAU / 12.0;
        float aBMod = mod(aBlade + secBlade * 0.5, secBlade) - secBlade * 0.5;
        vec2 qB = vec2(cos(aBMod) * length(p2.xz), p2.y);
        float blades = sdBox(vec3(qB.x - 0.45 * g_scale, qB.y, 0.0), vec3(0.18, 0.04 + 0.25 * (1.0 - abs(qB.y)), 0.015));

        dArch2 = smin(spire, blades, 0.04);
    }

    // Blend archetypes spectrally
    float dMorph = g_arch0_w * dArch0 + g_arch1_w * dArch1 + g_arch2_w * dArch2;

    return smin(dCore, dMorph, 0.08);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Studio reflection environment for glossy obsidian material
vec3 envObsidian(vec3 r, vec3 viewDir) {
    float up = r.y;
    vec3 baseEnv = mix(obsidian_tint.rgb * 0.4,
                       vec3(0.25, 0.28, 0.35),
                       smoothstep(-0.4, 0.6, up));

    // Key light specular highlight
    vec3 keyDir = normalize(vec3(0.5, 0.85, 0.4));
    float keySpec = pow(max(dot(r, keyDir), 0.0), 64.0);

    // Rim highlight
    vec3 rimDir = normalize(vec3(-0.6, 0.2, -0.5));
    float rimSpec = pow(max(dot(r, rimDir), 0.0), 24.0);

    return baseEnv + vec3(1.0, 0.98, 0.92) * keySpec * 3.5 + seam_tint.rgb * rimSpec * 1.5;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- spectral morph selector (guide §12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_sens) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_bias, sel, live);

    // Archetype weights (narrow triangular kernel, guide §12.6)
    g_arch0_w = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    g_arch1_w = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    g_arch2_w = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = g_arch0_w + g_arch1_w + g_arch2_w + 1e-4;
    g_arch0_w /= ws; g_arch1_w /= ws; g_arch2_w /= ws;

    // Bind parameters sliding smoothly
    g_scale    = (0.85 + 0.30 * vault_scale) * (0.95 + 0.05 * sin(g_ph));
    g_spin     = 0.5 * rib_spin * g_ph;
    g_seam_val = seam_glow * (0.6 + 0.4 * AUDIO_BEAT);

    // ---- camera ray setup from CAM_DIR and CAM_UP (guide §5) ---------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float tip = 0.25 * sin(g_ph) + 0.20;
    pR(ro.yz, tip);
    pR(rd.yz, tip);

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
            t += d * 0.80;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = calcNormal(p);
            vec3 refl = reflect(rd, n);
            float ndv = max(dot(n, -rd), 0.0);

            // Fresnel rim (obsidian biomech styling)
            float fresnel = pow(1.0 - ndv, 3.5);

            // Environment specular reflection
            vec3 envColor = envObsidian(refl, -rd);

            // Energy seam glowing veins embedded in the carapace
            float seamPattern = sin(p.x * 25.0 + g_ph) * sin(p.y * 25.0) * sin(p.z * 25.0);
            float seamEmissive = smoothstep(0.4, 0.95, seamPattern) * g_seam_val;
            vec3 seamColor = seam_tint.rgb * seamEmissive * 2.8;

            // Shaded surface composition
            col = obsidian_tint.rgb * (0.15 + 0.35 * ndv)
                + envColor * (0.50 + 0.50 * fresnel)
                + seamColor
                + seam_tint.rgb * fresnel * 0.85;

            alpha = 1.0;
        }
    }

    // Bounded atmospheric sheath around closest ray approach (guide §8)
    float ca = clamp(1.0 - near * 5.0, 0.0, 1.0);
    float sheath = (pow(ca, 5.0) * 0.25 + pow(ca, 24.0) * 0.55) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.35 + 0.65 * g_seam_val);
    col += seam_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.50, 0.0, 1.0);

    // Tone mapping and gamma correction
    col = col / (1.0 + col * 0.28);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
