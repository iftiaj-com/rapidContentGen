/*{
  "ADITS": 1,
  "DESCRIPTION": "A raymarched gimbal spinner: a hollowed octahedral core inside three counter-rotating gimbal rings, neither of which changes, throwing eight swept blades that change species together under spectral balance. The blade is one tapered plate under eight interpolated numbers, so the rotor morphs by deforming through four forms: short turbine paddle, swept crystal blade, long scythe, needle rake. Bass lifts the core glow, mid twists the sweep, treble runs the ring shimmer. Rests as the crystal blade.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["raymarching", "morph", "mechanical", "artifact", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    { "NAME": "sens",      "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",      "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",      "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "coreGlow",  "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.40, "MAX": 2.20,
      "LABEL": "Core Glow", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "sweep",     "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.10, "MAX": 1.60,
      "LABEL": "Blade Twist", "BIND": "mid", "BIND_DEPTH": 0.45 },
    { "NAME": "shimmer",   "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.00, "MAX": 1.20,
      "LABEL": "Ring Shimmer", "BIND": "treble", "BIND_DEPTH": 0.5 },
    { "NAME": "emissiveA", "TYPE": "color", "DEFAULT": [0.00, 0.80, 1.00, 1.00],
      "LABEL": "Core Emissive" },
    { "NAME": "emissiveB", "TYPE": "color", "DEFAULT": [0.40, 0.10, 0.80, 1.00],
      "LABEL": "Ring Emissive" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 20.0

// 48 marching steps, a 4-tap normal, a 6-step shadow and a 4-tap occlusion is
// 62 field evaluations at a hit, plus two cheap sub-field re-tests for the
// material select. The old version spent 101, past the 96 ceiling, on a field
// this heavy.
#define MAX_STEPS 48
#define SURF_DIST 0.0012

// Hard ceiling on the blade tip radius, so the silhouette is bounded whatever
// the archetype and the bind ask for together.
#define TIP_MAX 2.20

// Bounding radius: the blade tips at full extension plus the plate thickness
// and the model wobble.
#define BOUND 2.30

// Camera distance and focal length. The mechanism is fully three-dimensional,
// so the bounding sphere's own silhouette is the limit: it lands at
// BOUND * FOCAL / sqrt(ORBIT^2 - BOUND^2) = 0.44 of the plane, inside the
// visible frame edge at 0.5, from any orbit.
#define ORBIT 6.50
#define FOCAL 1.16

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Gravimetric stabiliser core: an octahedron hollowed into a skeleton. Shared,
// so it never changes species and always holds the centre.
float sdCore(vec3 p, float a) {
    p.xz *= rot2D(2.0 * a);
    p.yz *= rot2D(a);

    float core = sdOctahedron(p, 0.45);

    // Hollow out the flat faces.
    core = max(core, -sdBox(p, vec3(0.25)));

    // Axis cuts.
    core = max(core, -sdBox(p, vec3(0.50, 0.05, 0.05)));
    core = max(core, -sdBox(p, vec3(0.05, 0.50, 0.05)));
    core = max(core, -sdBox(p, vec3(0.05, 0.05, 0.50)));

    return core;
}

// Three gimbal rings, each on its own whole-turn rate. Shared: they never
// change species. Every rate is slow at 1x, because the host clock can run
// the whole mechanism at 10x.
float sdRings(vec3 p, float a) {
    // Each ring's plane is tilted first, then it spins inside that plane. The
    // rings sit near the viewer's plane rather than edge on, which is what
    // makes the cage read as a gimbal instead of as three lines.

    // Ring 1: inner bearing.
    vec3 p1 = p;
    p1.yz *= rot2D(0.62);
    p1.xy *= rot2D(-2.0 * a);
    float ring1 = max(abs(length(p1.xy) - 0.60) - 0.030, abs(p1.z) - 0.030);

    // Ring 2: harmonic resonance ring, with twelve notches.
    vec3 p2 = p;
    p2.xz *= rot2D(-0.45);
    p2.yz *= rot2D(-0.30);
    p2.xy *= rot2D(a);
    float r2 = length(p2.xy);
    float ring2 = max(abs(r2 - 0.82) - 0.040, abs(p2.z) - 0.022);

    float a2 = atan(p2.y, p2.x);
    float h = TAU / 12.0;
    a2 = mod(a2 + h * 0.5, h) - h * 0.5;
    vec3 q2 = vec3(r2 * cos(a2) - 0.82, r2 * sin(a2), p2.z);
    ring2 = max(ring2, -sdBox(q2, vec3(0.10, 0.03, 0.05)));

    // Ring 3: outer magnetic levitation bearing.
    vec3 p3 = p;
    p3.yz *= rot2D(-0.42);
    p3.xz *= rot2D(0.38);
    p3.xy *= rot2D(-a);
    float ring3 = max(abs(length(p3.xy) - 1.02) - 0.050, abs(p3.z) - 0.040);

    return min(ring1, min(ring2, ring3));
}

// Eight swept blades.
//   m0 = (hub offset, half length, half width, half thickness)
//   m1 = (thickness taper, width taper, notch size, twist multiplier)
float sdBlades(vec3 p, float a, vec4 m0, vec4 m1) {
    // The rotor disc lies in the viewer's plane, so the eight blades read as a
    // spinner rather than foreshortening into a bar.
    p.xy *= rot2D(-3.0 * a);

    float r = length(p.xy);
    float ang = atan(p.y, p.x);

    // Spiral twist. The twist is an amplitude, so the cost of the march does
    // not move with the audio, only the shape does.
    ang += r * m1.w;

    float h = TAU / 8.0;
    ang = mod(ang + h * 0.5, h) - h * 0.5;

    // In this frame the sector axis is +x, the in-plane width is y and the
    // plate thickness is z.
    vec3 q = vec3(r * cos(ang), r * sin(ang), p.z);
    q.x -= m0.x;

    float blade = sdBox(q, vec3(m0.y, m0.z, m0.w));

    // Sharp tapers for the cutting edge.
    blade = max(blade, abs(q.z) - m0.w + q.x * m1.x);
    blade = max(blade, abs(q.y) - m0.z + q.x * m1.y);

    // Mechanical notch on the trailing edge.
    blade = max(blade, -sdBox(q - vec3(m0.y * 0.35, m0.z * 0.35, 0.0),
                              vec3(m1.z, m1.z * 0.8, m1.z * 1.6)));

    return blade;
}

// The model wobble lives here rather than on the camera: tilting the camera
// would fight CAM_DIR, while tilting the model leaves the real camera in
// charge of the viewpoint.
vec3 modelSpace(vec3 p, float a) {
    p.xy *= rot2D(sin(2.0 * a) * 0.10);
    return p;
}

float map(vec3 p, float a, vec4 m0, vec4 m1) {
    p = modelSpace(p, a);
    float d = sdCore(p, a);
    d = min(d, sdRings(p, a));
    d = min(d, sdBlades(p, a, m0, m1));
    return d;
}

float rayMarch(vec3 ro, vec3 rd, float t0, float tMax, float a,
               vec4 m0, vec4 m1) {
    float dO = t0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float dS = map(ro + rd * dO, a, m0, m1);
        dO += dS * 0.65;    // relaxation for the spatial twist in the blades
        if (dO > tMax || abs(dS) < SURF_DIST) break;
    }
    return dO;
}

// Four-tap tetrahedral normal.
vec3 calcNormal(vec3 p, float a, vec4 m0, vec4 m1) {
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.0012;
    return normalize(k.xyy * map(p + k.xyy * e, a, m0, m1) +
                     k.yyx * map(p + k.yyx * e, a, m0, m1) +
                     k.yxy * map(p + k.yxy * e, a, m0, m1) +
                     k.xxx * map(p + k.xxx * e, a, m0, m1));
}

// Six-step soft shadow. Short on purpose: the old version marched twenty,
// which put the whole shader well over the evaluation budget.
float calcShadow(vec3 ro, vec3 rd, float a, vec4 m0, vec4 m1) {
    float res = 1.0;
    float t = 0.03;
    for (int i = 0; i < 6; i++) {
        float hh = map(ro + rd * t, a, m0, m1);
        res = min(res, 8.0 * hh / t);
        t += max(hh, 0.010) * 0.75;
        if (t > 3.0) break;
    }
    return clamp(res, 0.08, 1.0);
}

float calcAO(vec3 p, vec3 n, float a, vec4 m0, vec4 m1) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 4; i++) {
        float hh = 0.02 + 0.045 * float(i);
        occ += (hh - map(p + hh * n, a, m0, m1)) * sca;
        sca *= 0.86;
    }
    return clamp(1.0 - 2.0 * occ, 0.0, 1.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // --- Selector -------------------------------------------------------------
    // Balance decides which blade species this is; loudness only decides how
    // hard it burns. The old file had no morph at all, so the rotor was one
    // fixed mechanism.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;             // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than
    // any one band. Expanded around the rest point, or the outer forms never
    // arrive and the morph fails silently.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws the blades out to needles, a kick pulls them back to paddles.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to the chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x = sel * 3.0;

    // Triangular weights of slope 1.85. Support is 1/1.85 either side of a
    // centre and the centres are spaced 1.0, so neighbours overlap over
    // 2/1.85 - 1 = 0.081 of the axis and the sum is never zero. The slope must
    // stay below 2.0 or the normalisation divides by nothing.
    float w0 = max(1.0 - abs(x      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(x - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(x - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(x - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One tapered plate, eight interpolated numbers, so
    // the rotor deforms and the march never has two shapes to resolve.
    //              paddle    blade     scythe    needle
    float hubOff = 1.150 * w0 + 1.250 * w1 + 1.350 * w2 + 1.420 * w3;
    float halfL  = 0.500 * w0 + 0.580 * w1 + 0.680 * w2 + 0.750 * w3;
    float halfW  = 0.280 * w0 + 0.150 * w1 + 0.085 * w2 + 0.045 * w3;
    float halfT  = 0.090 * w0 + 0.040 * w1 + 0.024 * w2 + 0.014 * w3;
    float tapT   = 0.030 * w0 + 0.080 * w1 + 0.130 * w2 + 0.180 * w3;
    float tapW   = 0.090 * w0 + 0.250 * w1 + 0.380 * w2 + 0.520 * w3;
    float notch  = 0.130 * w0 + 0.090 * w1 + 0.055 * w2 + 0.030 * w3;
    float twistM = 0.350 * w0 + 1.000 * w1 + 1.700 * w2 + 2.300 * w3;

    // Clamp the tip so the silhouette is bounded whatever the archetype asks.
    float tip = min(hubOff + halfL, TIP_MAX);
    halfL = tip - hubOff;

    vec4 m0 = vec4(hubOff, halfL, halfW, halfT);
    // Mid twists the sweep, which is what makes the rotor deform rather than
    // merely brighten.
    vec4 m1 = vec4(tapT, tapW, notch, twistM * sweep);

    // Phase wraps exactly at LOOP = 20 s. Every rate is a whole number of turns
    // per loop, so the mechanism returns to its start pose.
    float ph = fract(TIME / PERIOD);
    float a = TAU * ph;

    // Camera from the reserved uniforms, so orbiting the anamorphic camera
    // orbits the mechanism instead of tilting a flat picture of it. CAM_UP
    // keeps the basis valid when the viewer is directly above or below.
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // Analytic bounding sphere: a ray that misses costs one quadratic instead
    // of 48 field evaluations.
    float bq = dot(ro, rd);
    float cq = dot(ro, ro) - BOUND * BOUND;
    float hq = bq * bq - cq;

    // Nothing is drawn outside the object. No blueprint grid, no backdrop: the
    // live footage is what belongs behind the mechanism.
    if (hq < 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float sq = sqrt(hq);
    float t0 = max(-bq - sq, 0.0);
    float tMax = -bq + sq;

    float d = rayMarch(ro, rd, t0, tMax, a, m0, m1);

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (d < tMax) {
        vec3 p = ro + rd * d;
        vec3 n = calcNormal(p, a, m0, m1);
        float ao = calcAO(p, n, a, m0, m1);

        // AUDIO_BEAT already decays, so it is used straight and the floor keeps
        // the mechanism lit in silence.
        float pulse = 0.25 + 0.75 * snap * AUDIO_BEAT;

        // Material select. The two moving parts are re-tested in model space,
        // which is where their distance fields are defined.
        vec3 pm = modelSpace(p, a);
        float dCore = sdCore(pm, a);
        float dBlades = sdBlades(pm, a, m0, m1);

        float NdotV = max(0.0, dot(n, -rd));

        vec3 albedo;
        vec3 emissive;
        float metallic;
        float roughness;

        if (dCore < 0.02) {
            // Gravimetric stabiliser core: dark alloy with an inner edge glow.
            albedo = vec3(0.06, 0.08, 0.13);
            metallic = 0.90;
            roughness = 0.20;
            // The skeleton's cut edges are where the reactor light escapes, so
            // the occlusion term is inverted to find them.
            float edges = clamp(1.0 - ao * 1.15, 0.0, 1.0);
            float rimC = 1.0 - NdotV;
            rimC = rimC * rimC;
            emissive = emissiveA.rgb * (edges * 3.2 + rimC * 2.0) * coreGlow
                     * (0.7 + 0.6 * pulse);
        } else if (dBlades < 0.02) {
            // Crystalline energy transducers: violet crystal with a bright rim.
            albedo = vec3(0.30, 0.19, 0.58);
            metallic = 0.50;
            roughness = 0.10;
            float rimF = 1.0 - NdotV;
            rimF = rimF * rimF;
            rimF = rimF * rimF;
            emissive = mix(emissiveA.rgb, emissiveB.rgb, 0.35) * rimF * 6.5
                     * coreGlow * (0.7 + 0.6 * pulse);
        } else {
            // Harmonic resonance rings: matte brushed alloy with a travelling
            // shimmer at four bands per loop, slow enough to still read as a
            // shimmer when the host clock runs hard.
            albedo = vec3(0.22, 0.25, 0.33);
            metallic = 0.80;
            roughness = 0.45;
            emissive = emissiveB.rgb
                     * clamp(sin(length(pm) * 16.0 - 4.0 * a), 0.0, 1.0)
                     * shimmer * 3.0;
        }

        // The key light orbits once per loop rather than sitting in a fixed
        // direction, so its highlight travels instead of reading as a baked
        // smudge once the plane rotates.
        vec3 lightDir = normalize(vec3(1.6 * sin(a), 3.0, 1.6 * cos(a)));
        float shadow = calcShadow(p + n * 0.006, lightDir, a, m0, m1);

        vec3 f0 = mix(vec3(0.04), albedo, metallic);
        vec3 diffuseColor = albedo * (1.0 - metallic);

        float NdotL = max(0.0, dot(n, lightDir));
        vec3 H = normalize(lightDir - rd);
        float NdotH = max(0.0, dot(n, H));

        vec3 specular = f0 * pow(NdotH, mix(16.0, 220.0, 1.0 - roughness)) * 3.4;
        vec3 diffuse = diffuseColor * NdotL;
        vec3 ambient = mix(vec3(0.04, 0.07, 0.14), vec3(0.13, 0.09, 0.18),
                           n.y * 0.5 + 0.5) * albedo;

        col = (diffuse + specular) * shadow * vec3(1.45, 1.35, 1.60);
        col += ambient * ao;
        col += emissive;

        // Environment reflection, on the surface only.
        vec3 ref = reflect(rd, n);
        float fq = 1.0 - NdotV;
        fq = fq * fq * fq * fq * fq;
        float fresnel = f0.x + (1.0 - f0.x) * fq;
        col += vec3(0.10, 0.20, 0.40) * max(0.0, ref.y) * fresnel
             * metallic * ao * 3.0;

        // Tone map and gamma the object only, never the empty frame.
        col = col / (col + vec3(0.8));
        col = pow(col, vec3(0.4545));

        // Solid surface hit: the silhouette is the coverage.
        alpha = 1.0;
    }

    // Premultiply. Colour is zero wherever alpha is zero.
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
