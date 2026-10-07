/*{
  "ADITS": 1,
  "DESCRIPTION": "A wet black lacquer pinecone: ninety shingled scales on a spiral lattice around an incandescent ember body, each scale one flattened round cone under seven interpolated numbers. It rests as an open cone with the ember showing between the scales, seals into an armoured pod under bass, droops into a long-petalled bloom through the mids, and bursts into a needle nova on treble, every scale crossing on its own static offset.",
  "CREDIT": "claude-fable-5-1",
  "DATE": "2026-10-02",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "obsidian", "botanical"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Body Swell", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "curl",       "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Scale Curl", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "ember",      "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Ember Glow", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "snap",       "TYPE": "float", "DEFAULT": 0.26, "MIN": 0.00, "MAX": 0.33,
      "LABEL": "Onset Snap" },
    { "NAME": "ember_tint", "TYPE": "color", "DEFAULT": [1.00, 0.52, 0.16, 1.00],
      "LABEL": "Ember Tint" },
    { "NAME": "rim_tint",   "TYPE": "color", "DEFAULT": [0.55, 0.78, 1.00, 1.00],
      "LABEL": "Rim Light Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  6.5
#define FOCAL  2.0
#define BOUND  1.42
#define NSC    10.0
#define NROWS  9.0
#define PHI0   0.40
#define PHI1   2.62
#define DPHI   0.24667
#define CELL   0.62831853
#define DELTA  0.382
#define S0     0.33

// Archetype tables, A0 pod .. A3 nova, bass-heavy at 0 and brightest at 3.
const vec4 T_TILT = vec4(0.12, 1.25, 1.95, 1.57);
const vec4 T_LEN  = vec4(1.05, 1.35, 1.95, 2.50);
const vec4 T_WID  = vec4(0.42, 0.42, 0.26, 0.11);
const vec4 T_FLAT = vec4(0.20, 0.22, 0.22, 0.55);
const vec4 T_TAPB = vec4(0.75, 0.55, 1.00, 1.00);
const vec4 T_TAPT = vec4(1.00, 1.00, 0.30, 0.10);
const vec4 T_CURL = vec4(-0.35, 0.30, 0.90, 0.05);
const vec4 T_BODA = vec4(0.60, 0.52, 0.44, 0.30);
const vec4 T_BODB = vec4(0.88, 0.86, 0.78, 0.52);
const vec4 T_GLOW = vec4(0.35, 0.80, 1.00, 1.50);

float g_X, g_A, g_B, g_sz, g_rowShift, g_curlF, g_kick;
float g_spin, g_tilt, g_prec;

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

float hash12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float p4(vec4 v, float s0, float s1, float s2) {
    return v.x + (v.y - v.x) * s0 + (v.z - v.y) * s1 + (v.w - v.z) * s2;
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

// Round cone along +y from 0 to h, radius r1 at the base and r2 at the tip.
float sdRoundCone(vec3 p, float r1, float r2, float h) {
    vec2 q = vec2(length(p.xz), p.y);
    float b = (r1 - r2) / h;
    float a = sqrt(1.0 - b * b);
    float k = dot(q, vec2(-b, a));
    if (k < 0.0) return length(q) - r1;
    if (k > a * h) return length(q - vec2(0.0, h)) - r2;
    return dot(q, vec2(a, b)) - r1;
}

vec3 toObj(vec3 p) { pR(p.xz, -g_prec); pR(p.yz, -g_tilt); pR(p.xz, -g_spin); return p; }
vec3 toWorld(vec3 p) { pR(p.xz, g_spin); pR(p.yz, g_tilt); pR(p.xz, g_prec); return p; }

float bodyDist(vec3 p) {
    return (length(p / vec3(g_A, g_B, g_A)) - 1.0) * min(g_A, g_B);
}

// One scale: row fj at polar angle (sphi, cphi), lateral cell fk.
float scaleDist(vec3 p, float fj, float fk, float sphi, float cphi, float sz, float nInv, float tInv) {
    float thc = (fk + fj * DELTA) * CELL;
    float ct = cos(thc), st = sin(thc);
    vec3 base = vec3(g_A * sphi * ct, g_B * cphi, g_A * sphi * st);
    vec3 n    = vec3(sphi * ct / g_A, cphi / g_B, sphi * st / g_A) * nInv;
    vec3 tup  = vec3(-g_A * cphi * ct, g_B * sphi, -g_A * cphi * st) * tInv;
    vec3 w    = cross(tup, n);

    // Static per-scale stagger on the selector axis: a sweep around the ring
    // plus a small hash, so a crossing turns over as a wave (guide 12.6).
    float km   = mod(fk, NSC);
    float stag = 0.22 * cos(2.0 * thc + 1.9 * fj) + 0.06 * (hash12(vec2(fj, km)) - 0.5);
    float xs   = clamp(g_X + stag, 0.0, 3.0);
    float s0 = smoothstep(0.333, 0.667, xs);
    float s1 = smoothstep(1.333, 1.667, xs);
    float s2 = smoothstep(2.333, 2.667, xs);

    float tilt = p4(T_TILT, s0, s1, s2) - 0.14 * g_kick;
    float len  = p4(T_LEN,  s0, s1, s2) * sz;
    float hw   = min(p4(T_WID, s0, s1, s2) * sz, 0.47 * CELL * g_A * sphi);
    float squash = p4(T_FLAT, s0, s1, s2);
    float tapB = p4(T_TAPB, s0, s1, s2);
    float tapT = p4(T_TAPT, s0, s1, s2);
    float bend = p4(T_CURL, s0, s1, s2) * g_curlF;

    float cs = cos(tilt), sn = sin(tilt);
    vec3 dir = cs * tup + sn * n;      // along the scale
    vec3 up  = cs * n - sn * tup;      // the scale's outer face

    vec3 q = p - base;
    vec3 l = vec3(dot(q, w), dot(q, dir), dot(q, up));

    // Cheap bend: the tip curls toward the outer face.
    float ba = bend * l.y / len;
    float bc = cos(ba), bs = sin(ba);
    l.yz = vec2(bc * l.y - bs * l.z, bs * l.y + bc * l.z);

    l.z /= squash;
    return sdRoundCone(l, hw * tapB, hw * tapT, len) * squash * 0.9;
}

float map(vec3 p) {
    float d = bodyDist(p);

    float rxz = length(p.xz);
    float th  = atan(p.z, p.x + 1e-6);
    float phi = atan(rxz / g_A, p.y / g_B);
    float j0  = floor((phi + g_rowShift - PHI0) / DPHI);

    float ds = 1e9;
    for (int ji = -1; ji <= 1; ji++) {
        float fj   = clamp(j0 + float(ji), 0.0, NROWS - 1.0);
        float phij = PHI0 + (fj + 0.5) * DPHI;
        float sphi = sin(phij), cphi = cos(phij);
        float sz   = g_sz * mix(1.0, sphi, 0.8);
        float nInv = 1.0 / length(vec2(sphi / g_A, cphi / g_B));
        float tInv = 1.0 / length(vec2(g_A * cphi, g_B * sphi));
        float u    = th / CELL - fj * DELTA;
        float kA   = floor(u);
        ds = min(ds, scaleDist(p, fj, kA,       sphi, cphi, sz, nInv, tInv));
        ds = min(ds, scaleDist(p, fj, kA + 1.0, sphi, cphi, sz, nInv, tInv));
    }
    return smin(d, ds, 0.015);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0014;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Studio environment for the wet lacquer, looked up in world space so the
// horizon line stays put while the object turns.
vec3 envLacquer(vec3 r) {
    float up = r.y;
    vec3 e = mix(vec3(0.03, 0.035, 0.05), vec3(0.30, 0.34, 0.42), smoothstep(-0.5, 0.7, up));
    e += vec3(0.85, 0.92, 1.0) * smoothstep(0.09, 0.0, abs(up - 0.03)) * 0.30;
    e += vec3(1.0, 0.96, 0.9) * pow(max(dot(r, normalize(vec3(0.4, 0.8, 0.45))), 0.0), 64.0) * 2.2;
    e += vec3(0.6, 0.8, 1.0) * pow(max(dot(r, normalize(vec3(-0.6, 0.25, -0.7))), 0.0), 18.0) * 1.1;
    return e;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    float phase = ph * TAU;

    // ---- Spectral morph selector (guide 12.2 - 12.4, 12.7) ----
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float x = (tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5;
    x += snap * (AUDIO_HAT - AUDIO_KICK);
    float sel  = smoothstep(0.0, 1.0, x);
    float live = smoothstep(0.02, 0.12, max(lo + md + hi, AUDIO_LEVEL));
    sel = mix(rest_form, sel, live);
    g_X = sel * 3.0;

    // Shared body parameters from the unstaggered selector.
    float s0 = smoothstep(0.333, 0.667, g_X);
    float s1 = smoothstep(1.333, 1.667, g_X);
    float s2 = smoothstep(2.333, 2.667, g_X);
    float sw = (0.85 + 0.30 * swell) * (1.0 + 0.025 * sin(2.0 * phase));
    g_A  = p4(T_BODA, s0, s1, s2) * sw;
    g_B  = p4(T_BODB, s0, s1, s2) * sw;
    g_sz = S0 * sw;
    g_curlF = 0.6 + 1.2 * curl;
    g_kick  = AUDIO_KICK;
    float glowArch = p4(T_GLOW, s0, s1, s2);
    float tiltAvg  = p4(T_TILT, s0, s1, s2);
    float lenAvg   = p4(T_LEN,  s0, s1, s2) * g_sz;
    g_rowShift = 0.5 * lenAvg * cos(tiltAvg) / g_B;

    // Object pose: a fixed lean, one spin per loop, nutation at two per loop.
    g_spin = phase;
    g_tilt = 0.52 + 0.10 * sin(2.0 * phase);
    g_prec = -phase;

    // ---- Camera (guide 5) ----
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    vec3 roo = toObj(ro);
    vec3 rdo = toObj(rd);

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float glow = glowArch * (0.35 + 1.3 * ember) * (0.75 + 0.5 * AUDIO_BEAT);
    vec3  emb  = mix(ember_tint.rgb, vec3(1.0, 0.97, 0.9), smoothstep(0.9, 2.4, glow));

    float tb0, tb1;
    if (sph(roo, rdo, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.0);
        bool hit = false;
        vec3 p = roo + rdo * t;
        for (int i = 0; i < 60; i++) {
            p = roo + rdo * t;
            float d = map(p);
            near = min(near, d);
            if (d < 0.0008) { hit = true; break; }
            t += d * 0.9;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n  = calcNormal(p);
            vec3 nw = toWorld(n);
            vec3 refl = reflect(rd, nw);
            float ndv = clamp(dot(n, -rdo), 0.0, 1.0);
            float f1 = 1.0 - ndv;
            float f2 = f1 * f1;
            float fres = f2 * f2 * f1;

            float dB = bodyDist(p);
            float bodyMask = smoothstep(0.02, 0.004, dB);
            float ao = clamp(map(p + n * 0.05) / 0.05, 0.2, 1.0);

            // Wet black lacquer: a dark dielectric reflecting the studio.
            vec3 env = envLacquer(refl);
            vec3 lacquer = env * (0.18 + 0.82 * fres) * 2.4 * ao
                         + rim_tint.rgb * fres * 1.3;

            // Ember: the body burns, and the undersides of the scales catch it.
            float burn  = 0.85 + 0.15 * sin(3.0 * phase + 5.0 * p.y);
            float under = max(dot(n, -normalize(p)), 0.0) * exp(-max(dB, 0.0) * 9.0);
            float amb   = exp(-max(dB, 0.0) * 4.0) * 0.6;
            float emis  = glow * burn * (bodyMask * 1.7 * (0.6 + 0.4 * ndv)
                        + (1.0 - bodyMask) * (under * 1.2 + amb) * ao);

            col = lacquer * (1.0 - 0.75 * bodyMask) + emb * emis;
            alpha = 1.0;
        }
    }

    // ---- Bounded ember sheath around the silhouette (guide 8) ----
    float ca = smoothstep(0.22, 0.0, near);
    float sheath = (ca * ca * 0.22 + pow(ca, 10.0) * 0.55) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.12, rr) * glowArch * (0.3 + 0.7 * ember) * (0.7 + 0.5 * AUDIO_BEAT);
    col += emb * sheath * 0.9;
    alpha = clamp(alpha + sheath * 0.6, 0.0, 1.0);

    // Tone map the object only, then premultiply.
    col = col / (1.0 + col * 0.32);
    col = pow(max(col, 0.0), vec3(0.92));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
