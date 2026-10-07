/*{
  "ADITS": 1,
  "DESCRIPTION": "A starburst of flat kite-cut glass blades around a white-hot nucleus, each blade a translucent ultramarine crystal lit from inside by marbled veins that crawl along its length; it rests as a corona of a few great petals among small motes, spreads into a wide ring of dark slabs with glowing veins, and closes into a dense needle nova as the spectrum brightens.",
  "CREDIT": "claude-fable-5-1",
  "DATE": "2026-09-11",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "crystal"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.08, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.10, "MAX": 0.76,
      "LABEL": "Corona Reach", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "pitch",      "TYPE": "float", "DEFAULT": 0.38, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Blade Pitch", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "veins",      "TYPE": "float", "DEFAULT": 0.48, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Vein Glow", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "flare",      "TYPE": "float", "DEFAULT": 0.12, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Core Flare", "BIND": "kick", "BIND_DEPTH": 0.80 },
    { "NAME": "glass_tint", "TYPE": "color", "DEFAULT": [0.20, 0.26, 1.00, 1.00],
      "LABEL": "Glass Colour" },
    { "NAME": "vein_tint",  "TYPE": "color", "DEFAULT": [0.78, 0.88, 1.00, 1.00],
      "LABEL": "Vein Colour" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  7.0
#define FOCAL  1.8
#define CORE_R 0.10
#define BLADES 56

// ------------------------------------------------------------------
// Solved in closed form; nothing here is marched.
//
// A blade is a kite: a thin slab cut to a rhombus, its outer point long
// and its inner end blunted. A ray against that convex solid is eight
// plane clips, and the clip that sets the entry depth also hands back
// the surface normal and the depth at which the ray leaves, so the
// thickness of glass the ray crosses is known for free. The interior
// glow is scaled by that thickness, which is why the flat faces read
// as lit panes and the edges as brighter seams, the way real glass does.
//
// Each blade also gets a soft halo from the closest approach between
// the view ray and its long axis: a bloom for the price of one segment
// test.
//
// Reach budget: the longest blade in any archetype, at full swell and
// a full flare, tips out near 1.62 world units, and the widest
// out-of-plane spread brings a blade about 0.4 units toward the eye.
// That projects to about 0.43 of the frame, inside the 0.46 limit.
// ------------------------------------------------------------------

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; return fract(p * (p + p)); }

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

float raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b, out float s, out float u) {
    vec3 ab = b - a;
    vec3 w = ro - a;
    float uu = dot(ab, ab);
    float ru = dot(rd, ab);
    float rw = dot(rd, w);
    float uw = dot(ab, w);
    float den = ru * ru - uu;
    u = abs(den) < 1e-6 ? 0.0 : clamp((rw * ru - uw) / den, 0.0, 1.0);
    s = max(u * ru - rw, 0.0);
    return length(ro + rd * s - (a + ab * u));
}

// Clip the ray against the half-space dot(p, n) <= d in the blade frame.
void clipPlane(vec3 lo, vec3 ld, vec3 n, float d, inout float tN, inout float tF, inout vec3 nrm) {
    float den = dot(n, ld);
    den += (den >= 0.0) ? 1e-7 : -1e-7;
    float tp = (d - dot(n, lo)) / den;
    if (den < 0.0) {
        if (tp > tN) { tN = tp; nrm = n; }
    } else {
        tF = min(tF, tp);
    }
}

// Archetype-interpolated parameters, set once per frame.
float g_rMin, g_rMax, g_L, g_W, g_T, g_z, g_pitch, g_veinPow, g_body, g_heat, g_mote;

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    float phase = ph * TAU;

    // ---- spectral morph selector (guide 12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.36 * (AUDIO_HAT - AUDIO_KICK) + 0.16 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);   // petal corona
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);   // dark vein ring
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);   // needle nova
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // Shared parameter: reach slides continuously across the selector.
    float grow = (0.92 + 0.16 * swell) * (0.985 + 0.015 * sin(phase));
    g_rMin    = (w1 * 0.36  + w2 * 0.78  + w3 * 0.16 ) * grow;
    g_rMax    = (w1 * 1.00  + w2 * 1.08  + w3 * 0.90 ) * grow;
    g_L       = (w1 * 0.38  + w2 * 0.30  + w3 * 0.42 ) * grow;
    g_W       = (w1 * 0.120 + w2 * 0.080 + w3 * 0.022) * grow;
    g_T       = (w1 * 0.036 + w2 * 0.030 + w3 * 0.012) * grow;
    g_z       =  w1 * 0.30  + w2 * 0.22  + w3 * 0.75;
    g_pitch   = (w1 * 0.55  + w2 * 0.60  + w3 * 0.35 ) * (0.40 + 1.20 * pitch);
    g_veinPow =  w1 * 2.0   + w2 * 8.0   + w3 * 1.4;
    g_body    =  w1 * 0.60  + w2 * 0.12  + w3 * 0.42;
    g_heat    = (w1 * 0.90  + w2 * 0.72  + w3 * 1.30 ) * (0.35 + 1.00 * veins);
    g_mote    =  w1;

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // The corona spins once per loop in its own plane and nods once.
    float nod = 0.30 * sin(phase);
    pR(ro.xy, phase); pR(ro.yz, nod);
    pR(rd.xy, phase); pR(rd.yz, nod);

    vec3 keyL = normalize(vec3(0.35, 0.75, 0.55));
    float coreI = 1.0 + 1.6 * flare + 0.6 * AUDIO_BEAT;

    float s0, s1;
    bool cHit = sph(ro, rd, CORE_R, s0, s1) && s0 > 0.0;
    float tC = cHit ? s0 : 1e9;

    float bestT = tC;
    vec3  bestN = vec3(0.0);
    vec3  bestPl = vec3(0.0);
    float bestTh = 0.0;
    float bestH0 = 0.0, bestH1 = 0.0, bestH2 = 0.0;
    bool  bladeHit = false;
    float glowHalo = 0.0;

    for (int i = 0; i < BLADES; i++) {
        float fi = float(i);
        float h0 = hash11(fi + 0.13);
        float h1 = hash11(fi + 7.71);
        float h2 = hash11(fi + 3.37);
        float h3 = hash11(fi + 9.02);

        // A disc of directions with an out-of-plane spread, wider for the
        // nova so it fills out into an urchin rather than a flat star.
        float th = fi * 2.3999632;
        float zj = (h3 - 0.5) * g_z;
        vec3 dir = normalize(vec3(cos(th), sin(th), zj));

        // In the petal corona most blades shrink to motes and a few stay
        // great petals; the other archetypes size them evenly.
        float sz = mix(1.0, 0.28 + 0.72 * h0 * h0, g_mote);
        float L = g_L * sz * (0.75 + 0.50 * h1);
        float W = g_W * sz * (0.70 + 0.60 * h2);
        float T = g_T * (0.70 + 0.60 * h3);

        float rad = mix(g_rMin, g_rMax, h1) + flare * 0.08 * (0.4 + 0.6 * h2);
        vec3 c = dir * rad;

        // Long axis radial; the flat face starts toward the viewer and is
        // pitched about the axis by a fixed cant plus a wobble that is an
        // integer harmonic of the loop.
        vec3 e0 = dir;
        vec3 e1 = normalize(cross(vec3(0.0, 0.0, 1.0), e0));
        vec3 e2 = cross(e0, e1);
        float pa = (h2 - 0.5) * 2.4 * g_pitch + 0.35 * g_pitch * sin(phase * 2.0 + h0 * TAU);
        vec3 f1 = e1 * cos(pa) + e2 * sin(pa);
        vec3 f2 = cross(e0, f1);

        vec3 lo3 = ro - c;
        vec3 lol = vec3(dot(lo3, e0), dot(lo3, f1), dot(lo3, f2));
        vec3 ldl = vec3(dot(rd, e0), dot(rd, f1), dot(rd, f2)) + vec3(1e-6);

        // Slabs: thickness, and a length run from -0.6L (blunt end) to L (point).
        vec3 lob = lol - vec3(0.20 * L, 0.0, 0.0);
        vec3 he = vec3(0.80 * L, 9.0, T);
        vec3 m = 1.0 / ldl;
        vec3 n = m * lob;
        vec3 k = abs(m) * he;
        vec3 t1 = -n - k;
        vec3 t2 = -n + k;
        float tN = max(max(t1.x, t1.y), t1.z);
        float tF = min(min(t2.x, t2.y), t2.z);
        vec3 nl = -sign(ldl) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);

        // The kite: |y| <= W (1 - |x| / L), four planes.
        float q = W / L;
        float inv = inversesqrt(1.0 + q * q);
        vec3 k1 = vec3( q,  1.0, 0.0) * inv;
        vec3 k2 = vec3(-q,  1.0, 0.0) * inv;
        vec3 k3 = vec3( q, -1.0, 0.0) * inv;
        vec3 k4 = vec3(-q, -1.0, 0.0) * inv;
        float kd = W * inv;
        clipPlane(lol, ldl, k1, kd, tN, tF, nl);
        clipPlane(lol, ldl, k2, kd, tN, tF, nl);
        clipPlane(lol, ldl, k3, kd, tN, tF, nl);
        clipPlane(lol, ldl, k4, kd, tN, tF, nl);

        if (tN < tF && tF > 0.0 && tN < bestT) {
            bestT = tN;
            bestN = nl.x * e0 + nl.y * f1 + nl.z * f2;
            bestPl = lol + ldl * tN;
            bestTh = (tF - tN) / max(2.0 * T, 1e-4);
            bestH0 = h0; bestH1 = h1; bestH2 = h2;
            bladeHit = true;
        }

        // Halo along the axis of the blade, brighter on the larger blades
        // and dimmer on the dark-slab ring.
        vec3 a = c - e0 * (0.6 * L);
        vec3 b = c + e0 * L;
        float s, u;
        float dH = raySeg(ro, rd, a, b, s, u);
        float hw = W * 1.4 + 0.012;
        float halo = exp(-dH * dH / (hw * hw)) * (0.7 + 0.3 * sin(phase * 2.0 + h1 * TAU));
        halo *= sz * (0.55 + 0.45 * u) * g_heat * (0.05 + 0.20 * g_body);
        glowHalo += halo;
    }

    vec3  col   = vec3(0.0);
    float alpha = 0.0;

    if (bladeHit) {
        vec3 p = ro + rd * bestT;
        vec3 n = bestN;
        vec3 pl = bestPl;

        // Marbled veins running the length of the blade, crawling once per
        // loop. The vein power of the archetype decides whether the whole
        // pane is lit or only a few bright threads on dark glass.
        float m1 = sin(pl.x * (7.0 + 5.0 * bestH0)
                     + 1.6 * sin(pl.y * 14.0 + bestH1 * TAU)
                     + bestH2 * TAU + phase);
        float marble = 0.5 + 0.5 * m1;
        float vein = pow(marble, g_veinPow);
        float thick = clamp(bestTh, 0.0, 2.5);
        float inner = vein * g_heat * (0.55 + 0.45 * thick) * (1.0 + 0.8 * AUDIO_BEAT);

        vec3 Lc = -normalize(p);
        float wrap = clamp(dot(n, Lc) * 0.5 + 0.5, 0.0, 1.0);
        float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
        vec3 R = reflect(rd, n);
        float spec = pow(clamp(dot(R, keyL), 0.0, 1.0), 60.0);
        float specC = pow(clamp(dot(R, Lc), 0.0, 1.0), 24.0);

        // Body colour deepens toward violet where the glass is thick.
        vec3 deep = mix(glass_tint.rgb, glass_tint.rgb * vec3(0.9, 0.5, 1.0), 0.5 * clamp(thick - 1.0, 0.0, 1.0));
        vec3 glass = deep * g_body * (0.45 + 0.75 * wrap * coreI);
        col = glass
            + mix(vein_tint.rgb, glass_tint.rgb, 0.35) * inner * 1.6
            + mix(glass_tint.rgb, vein_tint.rgb, 0.40) * fre * (0.25 + 0.55 * g_body)
            + mix(vein_tint.rgb, glass_tint.rgb, 0.35) * spec * 0.6
            + glass_tint.rgb * specC * coreI * 0.5;

        // Dark glass lets a little footage through; lit veins do not.
        alpha = mix(0.78, 1.0, clamp(inner + fre, 0.0, 1.0));
    } else if (cHit) {
        // The nucleus: white-hot, tinted at its limb.
        vec3 p = ro + rd * tC;
        vec3 n = p / CORE_R;
        float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 2.0);
        col = mix(vec3(1.0, 0.98, 0.96), glass_tint.rgb, fre * 0.7) * (2.2 + 1.2 * coreI);
        alpha = 1.0;
    }

    // ---- nucleus bloom and rays, bounded well inside the frame ----------
    float coreGlow = 0.010 / (rr * rr + 0.0025) * smoothstep(0.34, 0.02, rr);
    float ang = atan(uv.y, uv.x);
    float rays = pow(abs(cos(ang * 3.0 + phase)), 14.0) * smoothstep(0.36, 0.04, rr) * 0.10;
    float coreCov = (coreGlow * 0.55 + rays) * coreI;
    col += mix(vec3(1.0), glass_tint.rgb, 0.70) * coreCov;
    alpha += coreCov * 0.8;

    // ---- blade halos --------------------------------------------------
    col += mix(glass_tint.rgb, vein_tint.rgb, 0.30) * glowHalo * 1.3;
    alpha += glowHalo * 0.8;

    col = col / (1.0 + col * 0.28);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
