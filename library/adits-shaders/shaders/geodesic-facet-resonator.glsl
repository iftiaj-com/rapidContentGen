/*{
  "ADITS": 1,
  "DESCRIPTION": "An icosahedral geodesic resonator morphing between resonant armor, harmonic wave plates, and crystalline iris filigree driven by audio balance.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "3d", "audio", "morph"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "morph_bias", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.20, "MAX": 0.80,
      "LABEL": "Core Swell", "BIND": "bass", "BIND_DEPTH": 0.50 },
    { "NAME": "glow_power", "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Edge Glow", "BIND": "treble", "BIND_DEPTH": 0.60 },
    { "NAME": "tint",       "TYPE": "color", "DEFAULT": [0.20, 0.85, 1.00, 1.00],
      "LABEL": "Cyan Seam Tint" },
    { "NAME": "accent_tint","TYPE": "color", "DEFAULT": [1.00, 0.35, 0.75, 1.00],
      "LABEL": "Magenta Core Tint" }
  ]
}*/

#define PI 3.14159265359
#define TAU 6.28318530718
#define PERIOD 16.0

// --------------------------------------------------------
// HG_SDF & Folding Utilities
// --------------------------------------------------------

void pR(inout vec2 p, float a) {
    p = cos(a) * p + sin(a) * vec2(p.y, -p.x);
}

float pReflect(inout vec3 p, vec3 planeNormal, float offset) {
    float t = dot(p, planeNormal) + offset;
    if (t < 0.0) {
        p = p - (2.0 * t) * planeNormal;
    }
    return sign(t);
}

float smax(float a, float b, float r) {
    float m = max(a, b);
    if ((-a < r) && (-b < r)) {
        return max(m, -(r - sqrt((r + a) * (r + a) + (r + b) * (r + b))));
    } else {
        return m;
    }
}

// --------------------------------------------------------
// Icosahedron domain mirroring
// --------------------------------------------------------

const vec3 nc = vec3(-0.5, -0.80901699437, 0.30901699437);
const vec3 pca = vec3(0.0, 0.35682208977, 0.93417235896);
const vec3 pab = vec3(0.0, 0.0, 1.0);
const vec3 facePlane = vec3(0.0, 0.35682208977, 0.93417235896);
const vec3 uPlane = vec3(0.0, 0.93417235896, -0.35682208977);
const vec3 vPlane = vec3(1.0, 0.0, 0.0);
const float faceRadius = 0.38196601125;

void pModIcosahedron(inout vec3 p) {
    p = abs(p);
    pReflect(p, nc, 0.0);
    p.xy = abs(p.xy);
    pReflect(p, nc, 0.0);
    p.xy = abs(p.xy);
    pReflect(p, nc, 0.0);
}

// --------------------------------------------------------
// Triangle tiling
// --------------------------------------------------------

const float sqrt3 = 1.7320508075688772;
const float i3 = 0.5773502691896258;
const mat2 cart2hex = mat2(1.0, 0.0, 0.5773502691896258, 1.1547005383792515);
const mat2 hex2cart = mat2(1.0, 0.0, -0.5, 0.8660254037844386);

struct TriPoints {
    vec2 a;
    vec2 b;
    vec2 c;
    vec2 center;
    vec2 ab;
    vec2 bc;
    vec2 ca;
};

TriPoints closestTriPoints(vec2 p) {
    vec2 pTri = cart2hex * p;
    vec2 pi = floor(pTri);
    vec2 pf = fract(pTri);

    float split1 = step(pf.y, pf.x);
    float split2 = step(pf.x, pf.y);

    vec2 a = vec2(split1, 1.0) + pi;
    vec2 b = vec2(1.0, split2) + pi;
    vec2 c = pi;

    a = hex2cart * a;
    b = hex2cart * b;
    c = hex2cart * c;

    vec2 center = (a + b + c) * 0.33333333;
    vec2 ab = (a + b) * 0.5;
    vec2 bc = (b + c) * 0.5;
    vec2 ca = (c + a) * 0.5;

    return TriPoints(a, b, c, center, ab, bc, ca);
}

struct TriPoints3D {
    vec3 a;
    vec3 b;
    vec3 c;
    vec3 center;
    vec3 ab;
    vec3 bc;
    vec3 ca;
};

vec3 faceToSphere(vec2 facePoint) {
    return normalize(facePlane + (uPlane * facePoint.x) + (vPlane * facePoint.y));
}

TriPoints3D geodesicTriPoints(vec3 p, float subdivisions) {
    vec3 pn = normalize(p);
    float denominator = dot(facePlane, pn);
    float t = -1.0 / -denominator;
    vec3 ip = pn * t;
    vec2 uv = vec2(dot(ip, uPlane), dot(ip, vPlane));

    float uvScale = subdivisions / faceRadius * 0.5;
    TriPoints points = closestTriPoints(uv * uvScale);

    vec3 a = faceToSphere(points.a / uvScale);
    vec3 b = faceToSphere(points.b / uvScale);
    vec3 c = faceToSphere(points.c / uvScale);
    vec3 center = faceToSphere(points.center / uvScale);
    vec3 ab = faceToSphere(points.ab / uvScale);
    vec3 bc = faceToSphere(points.bc / uvScale);
    vec3 ca = faceToSphere(points.ca / uvScale);

    return TriPoints3D(a, b, c, center, ab, bc, ca);
}

// --------------------------------------------------------
// Color Palette
// --------------------------------------------------------

vec3 pal(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}

vec3 jewelPalette(float n) {
    return pal(n, vec3(0.5, 0.5, 0.5), vec3(0.5, 0.4, 0.6), vec3(1.0, 1.0, 1.0), vec3(0.1, 0.35, 0.65));
}

// --------------------------------------------------------
// Geometry Model
// --------------------------------------------------------

struct HexSpec {
    float roundTop;
    float roundCorner;
    float height;
    float thickness;
    float gap;
};

struct Model {
    float dist;
    vec3 albedo;
    float glow;
};

Model hexModel(
    vec3 p,
    vec3 hexCenter,
    vec3 edgeA,
    vec3 edgeB,
    HexSpec spec,
    float coreAudio,
    float phTime
) {
    float edgeADist = dot(p, edgeA) + spec.gap;
    float edgeBDist = dot(p, edgeB) - spec.gap;
    float edgeDist = smax(edgeADist, -edgeBDist, spec.roundCorner);

    float lp = length(p);
    float outerDist = lp - spec.height;
    float d = smax(edgeDist, outerDist, spec.roundTop);

    float innerDist = lp - spec.height + spec.thickness;
    d = smax(d, -innerDist, spec.roundTop);

    // Dynamic coloring
    float faceBlend = clamp((spec.height - lp) / max(spec.thickness, 0.001), 0.0, 1.0);
    vec3 plateDark = vec3(0.04, 0.05, 0.09);
    vec3 plateOuter = vec3(0.12, 0.14, 0.22);
    vec3 color = mix(plateOuter, plateDark, step(0.5, faceBlend));

    // Seam and edge luminescence
    float palShift = dot(hexCenter, pca) * 3.0 + lp * 0.8 + phTime * 0.2 + coreAudio * 0.5;
    vec3 edgeSpectrum = mix(tint.rgb, jewelPalette(palShift), 0.65) * 1.6;
    edgeSpectrum += accent_tint.rgb * (0.3 + 0.7 * AUDIO_BEAT);

    float edgeBlend = smoothstep(-0.035, -0.003, edgeDist);
    color = mix(color, edgeSpectrum, edgeBlend);

    return Model(d, color, edgeBlend);
}

Model opU(Model m1, Model m2) {
    if (m1.dist < m2.dist) {
        return m1;
    } else {
        return m2;
    }
}

// Global uniforms/state evaluated per ray
float g_subdivisions;
HexSpec g_spec;
float g_coreAudio;
float g_phTime;

Model geodesicModel(vec3 p) {
    pModIcosahedron(p);

    TriPoints3D points = geodesicTriPoints(p, g_subdivisions);

    vec3 edgeAB = normalize(cross(points.center, points.ab));
    vec3 edgeBC = normalize(cross(points.center, points.bc));
    vec3 edgeCA = normalize(cross(points.center, points.ca));

    Model mB = hexModel(p, points.b, edgeAB, edgeBC, g_spec, g_coreAudio, g_phTime);
    Model mC = hexModel(p, points.c, edgeBC, edgeCA, g_spec, g_coreAudio, g_phTime);
    Model mA = hexModel(p, points.a, edgeCA, edgeAB, g_spec, g_coreAudio, g_phTime);

    Model model = opU(mB, opU(mC, mA));

    // Central glowing core sphere
    float coreDist = length(p) - (1.10 + 0.18 * AUDIO_BASS + 0.12 * AUDIO_KICK);
    if (coreDist < model.dist) {
        vec3 coreColor = mix(accent_tint.rgb, tint.rgb, 0.4) * (2.2 + 1.8 * AUDIO_BEAT);
        model = Model(coreDist, coreColor, 1.0);
    }

    return model;
}

Model map(vec3 p) {
    pR(p.xz, g_phTime * TAU * 0.08);
    pR(p.yz, g_phTime * TAU * 0.05);
    return geodesicModel(p);
}

// --------------------------------------------------------
// Lighting & Normal
// --------------------------------------------------------

vec3 calcNormal(vec3 pos) {
    const vec2 k = vec2(1.0, -1.0);
    const float eps = 0.002;
    return normalize(
        k.xyy * map(pos + k.xyy * eps).dist +
        k.yyx * map(pos + k.yyx * eps).dist +
        k.yxy * map(pos + k.yxy * eps).dist +
        k.xxx * map(pos + k.xxx * eps).dist
    );
}

vec3 doLighting(Model model, vec3 pos, vec3 nor, vec3 rd) {
    vec3 lightPos = normalize(vec3(0.6, 0.8, -0.7));
    vec3 backLightPos = normalize(vec3(-0.6, -0.4, 0.8));

    float dif = clamp(dot(nor, lightPos), 0.0, 1.0);
    float bac = pow(clamp(dot(nor, backLightPos), 0.0, 1.0), 2.0);
    float fre = pow(clamp(1.0 + dot(nor, rd), 0.0, 1.0), 3.0);
    float amb = 0.5 + 0.5 * nor.y;

    vec3 lin = vec3(0.0);
    lin += 1.4 * dif * vec3(0.95, 0.95, 1.0);
    lin += 0.6 * amb * vec3(0.2, 0.3, 0.5);
    lin += 0.5 * bac * (tint.rgb * 0.8);
    lin += 0.8 * fre * (mix(vec3(1.0), accent_tint.rgb, 0.4));

    vec3 col = mix(model.albedo * lin, model.albedo, model.glow);
    return col;
}

// Ray-Sphere intersection for early bounding skip
bool raySphereIntersect(vec3 ro, vec3 rd, float rad, out float tNear, out float tFar) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - rad * rad;
    float h = b * b - c;
    if (h < 0.0) return false;
    float sq = sqrt(h);
    tNear = max(0.0, -b - sq);
    tFar = -b + sq;
    return tFar > 0.0;
}

// --------------------------------------------------------
// Main Raymarch & Shading
// --------------------------------------------------------

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    float rad = length(uv);
    float boundMask = smoothstep(0.48, 0.38, rad);
    if (boundMask <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Audio-driven Morph Selector (§12)
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;

    float sel = clamp((tilt - 0.5) * (1.5 + 3.5 * morph_gain) + morph_bias, 0.0, 1.0);
    sel = clamp(sel + 0.35 * (AUDIO_HAT - AUDIO_KICK) + 0.20 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.01, 0.08, lo + md + hi);
    sel = mix(morph_bias, sel, live);

    // Continuous time phase
    float ph = fract(TIME / PERIOD);
    g_phTime = ph;
    g_coreAudio = AUDIO_LEVEL + 0.5 * AUDIO_BEAT;

    // Archetype 1: Resonant Armor (Bass heavy)
    float sub1 = mix(2.4, 3.2, cos(ph * TAU) * 0.5 + 0.5);
    HexSpec spec1 = HexSpec(
        0.05 / sub1,
        0.10 / sub1,
        mix(1.70, 1.95, (cos(ph * TAU * 3.0) * 0.5 + 0.5)),
        1.80,
        0.006 + 0.008 * AUDIO_BASS
    );

    // Archetype 2: Harmonic Ribs (Mid heavy)
    float sub2 = mix(1.8, 2.8, sin(ph * TAU * 0.5) * 0.5 + 0.5);
    HexSpec spec2 = HexSpec(
        0.03 / sub2,
        0.08 / sub2,
        mix(1.60, 1.90, sin(ph * TAU * 2.0) * 0.5 + 0.5),
        0.15,
        0.012 + 0.015 * AUDIO_MID
    );

    // Archetype 3: Crystal Iris Filigree (Treble/Snap heavy)
    float sub3 = mix(4.2, 5.0, cos(ph * TAU * 0.5) * 0.5 + 0.5);
    HexSpec spec3 = HexSpec(
        0.02 / sub3,
        0.05 / sub3,
        1.85,
        0.08,
        mix(0.02, 0.35, (cos(ph * TAU) * 0.5 + 0.5)) / sub3 + 0.02 * AUDIO_TREBLE
    );

    // Smooth blending across archetypes
    float w1 = clamp(1.0 - sel * 2.0, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) * 2.0, 0.0, 1.0);
    float w3 = clamp((sel - 0.5) * 2.0, 0.0, 1.0);
    float wSum = w1 + w2 + w3 + 1e-4;
    w1 /= wSum; w2 /= wSum; w3 /= wSum;

    g_subdivisions = w1 * sub1 + w2 * sub2 + w3 * sub3;
    g_spec = HexSpec(
        w1 * spec1.roundTop + w2 * spec2.roundTop + w3 * spec3.roundTop,
        w1 * spec1.roundCorner + w2 * spec2.roundCorner + w3 * spec3.roundCorner,
        w1 * spec1.height + w2 * spec2.height + w3 * spec3.height,
        w1 * spec1.thickness + w2 * spec2.thickness + w3 * spec3.thickness,
        w1 * spec1.gap + w2 * spec2.gap + w3 * spec3.gap
    );

    // Camera setup using CAM_DIR & CAM_UP
    float scaleFactor = 0.85 + 0.25 * swell;
    const float ORBIT = 5.2;
    vec3 ro = CAM_DIR * (ORBIT / scaleFactor);
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    float tNear, tFar;
    if (raySphereIntersect(ro, rd, 2.2, tNear, tFar)) {
        float t = tNear;
        float currentDist = 0.01;
        Model hitModel;
        bool hit = false;
        vec3 p = ro + rd * t;

        for (int i = 0; i < 64; i++) {
            p = ro + rd * t;
            hitModel = map(p);
            currentDist = hitModel.dist;
            t += currentDist * 0.90;

            if (currentDist < 0.001) {
                hit = true;
                break;
            }
            if (t > tFar) break;
        }

        if (hit) {
            vec3 nor = calcNormal(p);
            col = doLighting(hitModel, p, nor, rd);
            alpha = 1.0;
        }

        // Add soft atmospheric core glow around object
        float glowTerm = (glow_power * 0.8 + 0.4 * AUDIO_BEAT);
        float halo = 0.015 / (dot(uv, uv) + 0.02) * glowTerm;
        vec3 haloCol = mix(tint.rgb, accent_tint.rgb, sel) * halo;
        col += haloCol * (1.0 - alpha * 0.7);
        alpha = clamp(alpha + halo * 0.35, 0.0, 1.0);
    }

    // Tone map and bound
    col = pow(col, vec3(0.85));
    alpha = clamp(alpha, 0.0, 1.0) * boundMask;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
