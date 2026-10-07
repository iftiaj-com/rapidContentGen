/*{
  "ADITS": 1,
  "DESCRIPTION": "A raymarched obsidian void flower hovering on a 24 fps kinetoscope step, its iridescent rim and hovering gait unchanging, its fourteen petals changing species together under spectral balance. The petal field is one lobed extrusion under seven interpolated numbers, so the body morphs by deforming, not cross-fading, through four forms: heavy obsidian bulb, fourteen-petal pansy, long urchin spine, needle nova. Bass extends the petals, mid warps the surface, treble lifts the rim. Rests as the pansy.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["raymarching", "morph", "creature", "void", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "spikes", "TYPE": "float", "DEFAULT": 1.30, "MIN": 0.95, "MAX": 1.60,
      "LABEL": "Petal Length", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "warp",   "TYPE": "float", "DEFAULT": 0.022, "MIN": 0.004, "MAX": 0.045,
      "LABEL": "Petal Warp", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "rim",    "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.40, "MAX": 2.00,
      "LABEL": "Rim Glow", "BIND": "treble", "BIND_DEPTH": 0.5 },
    { "NAME": "violet", "TYPE": "color", "DEFAULT": [0.55, 0.08, 0.92, 1.00],
      "LABEL": "Rim Colour" },
    { "NAME": "cyan",   "TYPE": "color", "DEFAULT": [0.05, 0.85, 0.95, 1.00],
      "LABEL": "Core Colour" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 16.0

// 64 marching steps at a 0.55 step factor, plus a 4-tap normal and a 4-tap
// occlusion: 72 distance evaluations at a hit, inside the guide's 96 ceiling.
// The step factor is what the lobed radial field needs, because a radius-by-
// direction field is not Lipschitz-1 and a full step overshoots into the gap
// between petals.
#define MAX_STEPS 64
#define STEP_SCALE 0.55
#define SURF_DIST 0.0018

// Bounding radius of the flower at its largest: the clamped petal reach plus
// the surface displacement and the hover offset.
#define BOUND 2.05

// Hard ceiling on the petal reach, so the silhouette is bounded whatever the
// archetype and the bass bind ask for together.
#define REACH_MAX 1.85

// Camera distance and focal length. Face on, the widest reachable petal tip
// lands at FOCAL * 1.85 / ORBIT = 0.43 of the plane, inside the visible frame
// edge at 0.5. The flower is close to planar, so orbiting foreshortens it
// rather than growing it, out to about 70 degrees off axis.
#define ORBIT 7.00
#define FOCAL 1.62

// Fourteen petals, from a seven-fold cosine. An integer, or the seam at the
// angular wrap opens. The apparent count is halved by modulating petal length
// rather than by moving the fold count, which would open that seam.
#define LOBES 7.0

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// Polynomial smooth minimum, for organic blending between hub and petals.
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Signed distance to the void flower.
//   m0 = (lobe sharpness, hub radius, petal thickness, blend k)
//   m1 = (petal reach, filament frequency, alternation, surface warp)
float sdFlower(vec3 p, float a, vec4 m0, vec4 m1) {
    // Low-frequency hovering float, four cycles per loop.
    p.y -= sin(4.0 * a) * 0.10 + 0.04;

    // The flower turns once per loop in its own plane and tumbles gently out
    // of it, so it reads as a solid body rather than as a decal.
    p.xy *= rot2D(a);
    p.yz *= rot2D(sin(a) * 0.22);

    float lp = length(p);
    float rxy = length(p.xy);
    float raw = atan(p.y, p.x);        // one atan per evaluation

    // Fourteen lobes, seam free: an exponential narrowing of a seven-fold
    // cosine. Broad at a low sharpness, a needle at a high one, and cheaper
    // than pow inside a marching loop.
    float lobe = exp(-m0.x * (1.0 - abs(cos(raw * LOBES))));

    // Seven-fold smooth alternation, so half the petals fall back and the
    // apparent count halves without a discontinuity in the field.
    float alt = 1.0 - m1.z * (0.5 + 0.5 * cos(LOBES * raw));

    // All-pass travelling wave along the petals. Ten whole turns per loop, so
    // it closes with the loop.
    float wave = sin(10.0 * a - lp * 9.0 + 2.0 * atan(8.0)) * 0.030;
    float reach = min(m1.x * alt + wave, REACH_MAX);

    // The petal outline in the flower plane, then extruded with a domed
    // thickness profile so the body is thickest at the hub.
    float hub = m0.y;
    float rEdge = hub * 0.85 + (reach - hub * 0.85) * lobe;
    float u = clamp(rxy / max(reach, 1e-3), 0.0, 1.0);
    float thick = m0.z * sqrt(max(0.0, 1.0 - u * u)) + 0.010;
    float petal = max(rxy - rEdge, abs(p.z) - thick);

    float d = smin(lp - hub, petal, m0.w);

    // Petal surface warp and the fine filament ripple.
    d += sin(p.x * 9.0 + a) * sin(p.y * 9.0) * sin(p.z * 9.0) * m1.w
       + sin(rxy * m1.y - 3.0 * a) * 0.007;

    return d;
}

// Sphere tracing between the bounding sphere's entry and exit.
float rayMarch(vec3 ro, vec3 rd, float t0, float tMax, float a,
               vec4 m0, vec4 m1) {
    float dO = t0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float dS = sdFlower(ro + rd * dO, a, m0, m1);
        dO += dS * STEP_SCALE;
        if (dO > tMax || abs(dS) < SURF_DIST) break;
    }
    return dO;
}

// Four-tap tetrahedral normal. The six-tap central difference would cost two
// extra distance evaluations per hit for no visible gain.
vec3 calcNormal(vec3 p, float a, vec4 m0, vec4 m1) {
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.0018;
    return normalize(k.xyy * sdFlower(p + k.xyy * e, a, m0, m1) +
                     k.yyx * sdFlower(p + k.yyx * e, a, m0, m1) +
                     k.yxy * sdFlower(p + k.yxy * e, a, m0, m1) +
                     k.xxx * sdFlower(p + k.xxx * e, a, m0, m1));
}

// Ambient occlusion for the crevices between petals. Four taps, counted
// against the same budget as the march.
float calcAO(vec3 p, vec3 n, float a, vec4 m0, vec4 m1) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 4; i++) {
        float h = 0.014 + 0.050 * float(i);
        occ += (h - sdFlower(p + h * n, a, m0, m1)) * sca;
        sca *= 0.90;
    }
    return clamp(1.0 - 1.7 * occ, 0.0, 1.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // --- Selector -------------------------------------------------------------
    // Read from the audio uniforms directly, never from the quantised clock
    // below: which flower this is belongs to the music, not to the stutter.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;             // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than
    // any one band. Expanded around the rest point, or the outer forms never
    // arrive and the morph fails silently.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws the petals out to needles, a kick packs them back to a bulb.
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

    // Parameter-space morph. One lobed extrusion, seven interpolated numbers,
    // so the whole body deforms and the march never has two shapes to resolve.
    //              bulb      pansy     urchin    nova
    float sharpK = 0.350 * w0 + 1.800 * w1 + 5.500 * w2 + 13.00 * w3;
    float hubR  = 0.720 * w0 + 0.460 * w1 + 0.320 * w2 + 0.220 * w3;
    float thick = 0.550 * w0 + 0.260 * w1 + 0.150 * w2 + 0.085 * w3;
    float kB    = 0.300 * w0 + 0.160 * w1 + 0.090 * w2 + 0.050 * w3;
    float lenM  = 1.050 * w0 + 1.600 * w1 + 1.780 * w2 + 1.850 * w3;
    float ripF  = 12.00 * w0 + 22.00 * w1 + 30.00 * w2 + 44.00 * w3;
    float altM  = 0.000 * w0 + 0.000 * w1 + 0.300 * w2 + 0.620 * w3;

    // Bass extends the petals around the archetype's own reach.
    vec4 m0 = vec4(sharpK, hubR, thick, kB);
    vec4 m1 = vec4(lenM * (spikes / 1.30), ripF, altM, warp);

    // Phase wraps exactly at LOOP = 16 s, quantised to 384 steps for the 24 fps
    // kinetoscope stutter. Quantising the wrapped phase rather than raw time is
    // what lets the stutter loop as well as the motion.
    float ph = floor(fract(TIME / PERIOD) * 384.0) / 384.0;
    float a = TAU * ph;

    // Camera from the reserved uniforms, so orbiting the anamorphic camera
    // orbits the flower instead of tilting a flat picture of it. CAM_UP keeps
    // the basis valid when the viewer is directly above or below.
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // Analytic bounding sphere. A ray that misses costs one quadratic instead
    // of 64 distance evaluations, and a ray that hits starts at the shell.
    float bq = dot(ro, rd);
    float cq = dot(ro, ro) - BOUND * BOUND;
    float hq = bq * bq - cq;

    // Nothing is drawn outside the object. No halo, no haze, no backdrop: the
    // live footage is what belongs behind the flower.
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
        vec3 lightDir = normalize(vec3(1.5 * sin(a), 2.2, 1.5 * cos(a)));

        // Deep obsidian base albedo.
        vec3 voidAlbedo = vec3(0.020, 0.020, 0.028);

        // Iridescent rim emission, driven radially rather than by the camera,
        // so it still reads once the plane rotates. AUDIO_BEAT already decays,
        // so it is used straight and the floor keeps the rim lit in silence.
        float pulse = 0.25 + 0.75 * snap * AUDIO_BEAT;
        float NdotV = max(0.0, dot(n, -rd));
        float fres = 1.0 - NdotV;
        fres = fres * fres;
        fres = fres * fres;
        vec3 rimGlow = mix(violet.rgb, cyan.rgb,
                           0.5 + 0.5 * sin(length(p) * 6.0 - 2.0 * a));
        rimGlow *= fres * rim * 3.0 * (0.75 + 0.5 * pulse);

        // A second, inner emission band along the petal ribs, so the body is
        // not lit only at its outline.
        float rib = 0.5 + 0.5 * sin(length(p.xy) * ripF * 1.4 - 3.0 * a);
        rimGlow += mix(cyan.rgb, violet.rgb, rib) * rib * rib * 0.055 * rim;

        // Sharp specular highlight from the travelling light.
        vec3 halfVec = normalize(lightDir - rd);
        float spec = pow(max(0.0, dot(n, halfVec)), 200.0);

        col = voidAlbedo * ao * 0.35 + rimGlow
            + vec3(1.0, 0.96, 0.90) * spec * 3.2;
        col *= ao;

        // Tone map and gamma the object only, never the empty frame.
        col = col / (col + vec3(0.9));
        col = pow(col, vec3(0.4545));

        // Solid surface hit: the silhouette is the coverage.
        alpha = 1.0;
    }

    // Premultiply. Colour is zero wherever alpha is zero.
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
