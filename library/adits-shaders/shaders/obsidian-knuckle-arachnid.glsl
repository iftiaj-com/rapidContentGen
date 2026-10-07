/*{
  "ADITS": 1,
  "DESCRIPTION": "A raymarched arachnid of obsidian and iridescent metal, its rippled core and five counter-rotating tendrils unchanging, its eight knuckled legs changing species together under spectral balance. The leg is one beaded capsule under ten interpolated numbers, so the body morphs by deforming through four forms: crab claw, knuckled spider leg, harvestman stilt, beaded filament. Bass extends the span, mid drives the obsidian-to-metal blend, treble fires the pulse. Rests as the spider leg.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["raymarching", "morph", "creature", "metal", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",         "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",         "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",         "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "legSpan",      "TYPE": "float", "DEFAULT": 1.55, "MIN": 1.25, "MAX": 1.70,
      "LABEL": "Leg Span", "BIND": "bass", "BIND_DEPTH": 0.4 },
    { "NAME": "iridescence",  "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Iridescence", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "neon",         "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.10, "MAX": 1.60,
      "LABEL": "Energy Pulse", "BIND": "treble", "BIND_DEPTH": 0.55 },
    { "NAME": "neonTint",     "TYPE": "color", "DEFAULT": [0.10, 1.00, 0.30, 1.00],
      "LABEL": "Energy Colour" },
    { "NAME": "rimTint",      "TYPE": "color", "DEFAULT": [0.50, 0.12, 0.85, 1.00],
      "LABEL": "Rim Colour" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 16.0

// 56 marching steps, plus a 4-tap normal and a 4-tap occlusion, is 64 distance
// evaluations at a hit, which is the guide's whole budget. The march starts at
// the bounding sphere, so every step is spent inside the shell the body
// actually occupies.
#define MAX_STEPS 56
#define STEP_SCALE 0.90
#define SURF_DIST 0.002

// Hard ceiling on the leg reach, so the silhouette is bounded whatever the
// archetype and the bass bind ask for together.
#define REACH_MAX 2.20

// Bounding radius: the clamped reach, plus the out-of-plane leg undulation,
// the limb thickness, the hover offset and the surface ripple.
#define BOUND 2.45

// Camera distance and focal length. The body is close to planar, so face on is
// its widest view: the longest reachable leg lands at FOCAL * 2.20 / ORBIT =
// 0.44 of the plane, inside the visible frame edge at 0.5. Orbiting
// foreshortens it rather than growing it, out to about 70 degrees off axis.
#define ORBIT 7.00
#define FOCAL 1.40

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Polar domain repetition: folds the plane into N symmetrical sectors, with the
// sector axis along +x. N must be an integer or the seam at the wrap opens.
vec2 pModPolar(vec2 p, float repetitions) {
    float angle = TAU / repetitions;
    float a = atan(p.y, p.x) + angle * 0.5;
    float r = length(p);
    a = mod(a, angle) - angle * 0.5;
    return vec2(cos(a), sin(a)) * r;
}

// Signed distance to the arachnid.
//   m0 = (leg reach, base thickness, taper, core radius)
//   m1 = (knuckle spacing, knuckle radius, out-of-plane bend, blend k)
float sdArachnid(vec3 p, float a, vec4 m0, vec4 m1) {
    // Hover and drift. Every coefficient is a whole number of turns per loop,
    // and every rate is slow at 1x, because the host clock can run at 10x.
    p.y -= sin(2.0 * a) * 0.14;
    p.xy *= rot2D(a);
    p.yz *= rot2D(sin(a) * 0.24);

    vec3 p0 = p;

    // Shared core. It never changes species, so something solid holds the
    // centre through every transition.
    float core = length(p) - m0.w;
    core -= sin(p.x * 12.0) * sin(p.y * 12.0) * sin(p.z * 12.0) * 0.030;

    float d = core;

    // Eight radial legs, folded into the body's own plane so the arachnid is
    // seen spread out rather than edge on.
    vec3 pl = p;
    pl.xy = pModPolar(pl.xy, 8.0);
    // The legs undulate out of the plane, which is what makes them read as
    // limbs with a gait instead of as spokes.
    pl.z += sin(pl.x * 2.5 - 4.0 * a) * m1.z * pl.x;

    float legThick = m0.y - pl.x * m0.z;
    float leg = length(pl.yz) - max(legThick, 0.004);
    leg = max(leg, pl.x - m0.x);
    leg = max(leg, 0.12 - pl.x);

    // Knuckle nodes travelling out along each leg. The axial repetition is
    // clamped to the leg extent: without those two max() terms the mod()
    // repeats spheres through all of space, which fills the frame with
    // geometry and reads as a background rather than as an object.
    float scroll = (a / TAU) * 6.0;
    float nodes = length(vec3(mod(pl.x - scroll, m1.x) - m1.x * 0.5, pl.y, pl.z))
                - m1.y;
    nodes = max(nodes, pl.x - m0.x);
    nodes = max(nodes, 0.12 - pl.x);

    d = smin(d, leg, m1.w);
    d = smin(d, nodes, m1.w * 0.85);

    // Five finer tendrils. Shared: they counter-rotate at a fixed length and
    // never change species.
    vec3 pt = p0;
    pt.xy *= rot2D(-2.0 * a);
    pt.xy = pModPolar(pt.xy, 5.0);
    pt.z -= sin(pt.x * 5.0 + 5.0 * a) * 0.16;
    float tendrils = length(pt.yz) - 0.020;
    tendrils = max(tendrils, pt.x - 1.30);
    tendrils = max(tendrils, 0.15 - pt.x);

    d = smin(d, tendrils, 0.10);

    // Micro surface ripple.
    d += sin(length(p0) * 26.0 - 6.0 * a) * 0.005;

    return d;
}

// Sphere tracing between the bounding sphere's entry and exit.
float rayMarch(vec3 ro, vec3 rd, float t0, float tMax, float a,
               vec4 m0, vec4 m1) {
    float dO = t0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float dS = sdArachnid(ro + rd * dO, a, m0, m1);
        dO += dS * STEP_SCALE;
        if (dO > tMax || abs(dS) < SURF_DIST) break;
    }
    return dO;
}

// Four-tap tetrahedral normal.
vec3 calcNormal(vec3 p, float a, vec4 m0, vec4 m1) {
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.002;
    return normalize(k.xyy * sdArachnid(p + k.xyy * e, a, m0, m1) +
                     k.yyx * sdArachnid(p + k.yyx * e, a, m0, m1) +
                     k.yxy * sdArachnid(p + k.yxy * e, a, m0, m1) +
                     k.xxx * sdArachnid(p + k.xxx * e, a, m0, m1));
}

// Ambient occlusion. Four taps, counted against the same budget as the march.
float calcAO(vec3 p, vec3 n, float a, vec4 m0, vec4 m1) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 4; i++) {
        float h = 0.016 + 0.052 * float(i);
        occ += (h - sdArachnid(p + h * n, a, m0, m1)) * sca;
        sca *= 0.86;
    }
    return clamp(1.0 - 2.0 * occ, 0.0, 1.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // --- Selector -------------------------------------------------------------
    // Balance decides which leg species this is; loudness only decides how hard
    // it is lit. The old file blended obsidian and metal from sin(TIME), which
    // is the slideshow the guide rejects: the identity is the music's now.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;             // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than
    // any one band. Expanded around the rest point, or the outer forms never
    // arrive and the morph fails silently.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws the legs out to filaments, a kick pulls them back to claws.
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

    // Parameter-space morph. One beaded capsule, ten interpolated numbers, so
    // the whole body deforms and the march never has two shapes to resolve.
    //              claw      spider    stilt     filament
    float spanM = 0.800 * w0 + 1.150 * w1 + 1.280 * w2 + 1.350 * w3;
    float thick = 0.110 * w0 + 0.064 * w1 + 0.034 * w2 + 0.016 * w3;
    float taper = 0.034 * w0 + 0.019 * w1 + 0.011 * w2 + 0.0055 * w3;
    float coreR = 0.420 * w0 + 0.280 * w1 + 0.200 * w2 + 0.150 * w3;
    float nodeS = 0.450 * w0 + 0.600 * w1 + 0.400 * w2 + 0.220 * w3;
    float nodeR = 0.125 * w0 + 0.085 * w1 + 0.055 * w2 + 0.030 * w3;
    float bendM = 0.060 * w0 + 0.140 * w1 + 0.185 * w2 + 0.210 * w3;
    float blendK = 0.240 * w0 + 0.160 * w1 + 0.100 * w2 + 0.065 * w3;
    // The palette rides the same selector: obsidian at the heavy end,
    // iridescent metal at the fine end.
    float metalM = 0.100 * w0 + 0.450 * w1 + 0.760 * w2 + 1.000 * w3;
    float pulseF = 8.000 * w0 + 12.00 * w1 + 17.00 * w2 + 24.00 * w3;

    // Bass extends the span around the archetype's own reach.
    vec4 m0 = vec4(min(legSpan * spanM, REACH_MAX), thick, taper, coreR);
    vec4 m1 = vec4(nodeS, nodeR, bendM, blendK);

    // Phase wraps exactly at LOOP = 16 s.
    float ph = fract(TIME / PERIOD);
    float a = TAU * ph;

    // Camera from the reserved uniforms, so the real camera orbits the arachnid
    // instead of tilting a flat picture of it. CAM_UP keeps the basis valid
    // when the viewer is directly above or below.
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // Analytic bounding sphere: a ray that misses costs one quadratic instead
    // of 56 distance evaluations.
    float bq = dot(ro, rd);
    float cq = dot(ro, ro) - BOUND * BOUND;
    float hq = bq * bq - cq;

    // Nothing is drawn outside the object. No aura, no haze: the live footage
    // is what belongs behind the arachnid.
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

        // The key light orbits once per loop rather than sitting in a fixed
        // direction, so its highlight travels instead of reading as a baked
        // smudge once the plane rotates.
        vec3 lightDir = normalize(vec3(1.4 * sin(a), 2.4, 1.4 * cos(a)));
        float NdotL = max(0.0, dot(n, lightDir));
        float NdotV = max(0.0, dot(n, -rd));
        vec3 halfVec = normalize(lightDir - rd);

        float fres = 1.0 - NdotV;
        fres = fres * fres;
        fres = fres * fres;
        float spec = pow(max(0.0, dot(n, halfVec)), 220.0);

        float dCore = length(p);

        // AUDIO_BEAT already decays, so it is used straight and the floor keeps
        // the body lit in silence.
        float pulse = 0.25 + 0.75 * snap * AUDIO_BEAT;

        // Obsidian at one end of the selector, iridescent metal at the other.
        // Both are shading, so the per-pixel cost does not move with the audio.
        // Banded radially rather than along one axis, so the oxide film
        // reads the same on every leg and survives the plane rotating.
        vec3 irid = 0.5 + 0.5 * cos(3.2 * dCore + 2.0 * a + vec3(0.0, 2.0, 4.0));
        // Squared, so the oxide film reads as saturated colour rather than as
        // pastel.
        irid *= irid;
        float blend = clamp(metalM * iridescence * 1.4, 0.0, 1.0);

        vec3 albedo = mix(vec3(0.012, 0.012, 0.018), irid * 0.58, blend);
        vec3 specCol = mix(vec3(0.70, 0.85, 1.00) * 1.3, irid * 2.4, blend) * spec;

        // Radial environment reflection rather than a camera-matched key light.
        vec3 refl = reflect(rd, n);
        float env = max(0.0, dot(refl, normalize(vec3(0.0, 1.0, 1.0))));
        env = env * env; env = env * env;
        vec3 envCol = mix(vec3(0.10, 0.10, 0.16), irid, blend) * env * 0.80 * fres;

        // Energy pulse travelling out from the core. Its frequency rides the
        // selector, so the fine forms carry finer bands.
        float band = max(0.0, sin(dCore * pulseF - 8.0 * a));
        band = band * band; band = band * band;
        vec3 neonCol = mix(neonTint.rgb, rimTint.rgb, 0.35 + 0.35 * sin(2.0 * a))
                     * band * 7.0 * neon * (0.55 + 0.75 * pulse);

        col = albedo * (0.12 + 0.95 * NdotL) * ao
            + specCol * ao
            + envCol * ao
            + neonCol
            + mix(rimTint.rgb, vec3(1.0), blend) * fres * ao * 0.26
              * (0.8 + 0.5 * pulse);

        // Tone map and gamma the object only, never the empty frame.
        col = col / (col + vec3(1.35));
        col = pow(col, vec3(0.4545));

        // Solid surface hit: the silhouette is the coverage.
        alpha = 1.0;
    }

    // Premultiply. Colour is zero wherever alpha is zero.
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
