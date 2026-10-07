/*{
  "ADITS": 1,
  "DESCRIPTION": "A deep-water bouquet grown by recursion, on the branch-on-a-sphere construction from a widely shared Shadertoy fractal, with direction snapping standing in for its Fibonacci lookup. A nucleus sprouts twenty fronds, each of those twenty more, three deep, every floret breathing on its own clock. Eight numbers morph it through four forms: fused indigo bulb, teal coral bouquet, antler thicket, magenta needle nova. Bass thickens the fronds, mid curls them, treble hones the tips. Rests as the bouquet.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-23",
  "CATEGORIES": ["raymarching", "morph", "recursive", "coral", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.58, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "bulk",  "TYPE": "float", "DEFAULT": 0.95, "MIN": 0.60, "MAX": 1.50,
      "LABEL": "Frond Thickness", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "sway",  "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.05, "MAX": 0.80,
      "LABEL": "Frond Sway", "BIND": "mid", "BIND_DEPTH": 0.55 },
    { "NAME": "glint", "TYPE": "float", "DEFAULT": 0.90, "MIN": 0.30, "MAX": 2.00,
      "LABEL": "Tip Glint", "BIND": "treble", "BIND_DEPTH": 0.60 },
    { "NAME": "tipCol",  "TYPE": "color", "DEFAULT": [0.95, 0.13, 0.58, 1.00],
      "LABEL": "Tip Colour" },
    { "NAME": "coreCol", "TYPE": "color", "DEFAULT": [0.06, 0.74, 0.78, 1.00],
      "LABEL": "Core Colour" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define PHI    1.61803398875
#define IPHI   0.61803398875

// Three generations of branching. Twenty fronds each, so eight thousand tips
// come out of one distance field and three loop iterations.
#define LEVELS 3

// 64 march steps, a 4-tap normal and one material evaluation at the hit: 69
// distance calls, inside the 96 ceiling. The step factor is generous because
// the accumulated scale below folds the lateral squeeze in, which makes the
// field conservative rather than optimistic.
#define MAX_STEPS  64
#define STEP_SCALE 0.75

// Worst-case object radius over every archetype, slider and bind, from the
// geometric series (1 + sep) / (1 - childR) + rad. BOUND is the bounding
// sphere the march runs inside; REF is what the focal length is fitted to.
#define BOUND 2.45
#define REF   2.35
#define ORBIT 7.00
// Fitted so REF lands at 0.395 of the plane, well inside the frame edge at
// 0.5. That leaves the default state under a third of the frame and the
// fattest reachable state, bulb archetype with the bass bind at its maximum,
// still around a third rather than eating the footage.
#define FOCAL 1.13

// Morph parameters, written once in main and read by the distance field.
// Globals rather than a long argument list: the field is called 69 times.
float gSep;    // child sphere centre, above the parent surface
float gChR;    // child sphere radius, as a fraction of the parent
float gRad;    // frond radius, in parent units
float gDown;   // how far the stem sinks into the parent
float gFlare;  // lateral squeeze, so a frond can be a blade or a needle
float gBlend;  // smooth-union radius, fused bulbs to separate spines
float gCurl;   // twist and flare amplitude of the living motion
float gHub;    // nucleus radius, after the kick swell
float gNuc;    // nucleus radius the archetype asks for
float gA;      // loop angle, TAU at the end of the cycle
vec3  gC0, gC1, gC2, gC3, gCV;   // nucleus, stem, mid, tip, hue waypoint

mat2 rot2(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, s, -s, c);
}

float hash13(vec3 p) {
    return fract(sin(dot(p, vec3(27.17, 43.71, 91.13))) * 43758.5453);
}

// Polynomial smooth minimum. The blend radius is what turns four separate
// spines into one fused bulb without changing how many bodies are evaluated.
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Nearest of the twenty dodecahedron vertices, branchless and without a
// search loop. The vertices fall into four sign-symmetric families, so the
// best member of each family is read straight off the absolute value and only
// the four families are compared. This is the cheap stand-in for a spherical
// Fibonacci lookup: four dot products instead of a logarithm, an arctangent
// and a four-candidate search, which is what makes three generations of it
// affordable inside a march.
vec3 dodecaSnap(vec3 w) {
    vec3 s = sign(w + vec3(1e-7));
    vec3 a = abs(w);
    float d0 = a.x + a.y + a.z;                 // cube corners
    float d1 = a.y * IPHI + a.z * PHI;          // golden rectangle, x = 0
    float d2 = a.x * IPHI + a.y * PHI;          // ... y = 0
    float d3 = a.x * PHI  + a.z * IPHI;         // ... z = 0
    vec3 q = s;
    float best = d0;
    q = mix(q, vec3(0.0, s.y * IPHI, s.z * PHI), step(best, d1));
    best = max(best, d1);
    q = mix(q, vec3(s.x * IPHI, s.y * PHI, 0.0), step(best, d2));
    best = max(best, d2);
    q = mix(q, vec3(s.x * PHI, 0.0, s.z * IPHI), step(best, d3));
    return q * 0.57735027;                      // every family has length sqrt(3)
}

// Orthonormal frame with z along w. w is always a snapped vertex direction and
// none of the twenty has |y| = 1, so the frame never degenerates.
mat3 makeBase(vec3 w) {
    float k = inversesqrt(max(1.0 - w.y * w.y, 1e-3));
    return mat3(vec3(-w.z, 0.0, w.x) * k,
                vec3(-w.x * w.y, 1.0 - w.y * w.y, -w.y * w.z) * k,
                w);
}

// Capsule from the origin to (0, 0, b), so a negative b points the stem back
// down into the body it grew from.
float sdCapsule(vec3 p, float b, float r) {
    float h = clamp(p.z / b, 0.0, 1.0);
    return length(p - vec3(0.0, 0.0, b) * h) - r;
}

// The whole object. mat carries rgb and a cheap self-occlusion term the
// recursion produces for free: a frond that only just wins the minimum is
// sitting in a crevice, and a crevice is dark.
float mapObj(vec3 p, out vec4 mat, bool doMat) {
    // One slow turn and one nod per loop, so the head reads as a solid body
    // and no highlight sits baked in one place.
    p.xz = rot2(gA) * p.xz;
    p.yz = rot2(0.20 * sin(gA)) * p.yz;

    float d = length(p) - gHub;
    mat = vec4(gC0, 1.0);

    float s = 1.0;          // accumulated scale, for the distance correction
    float kk = gBlend;      // blend radius, shrinking with the features
    float fid = 0.0;        // which of the twenty fronds this branch belongs to

    for (int i = 0; i < LEVELS; i++) {
        vec3 w = p * inversesqrt(max(dot(p, p), 1e-8));
        vec3 q = dodecaSnap(w);
        float bid = hash13(q);

        if (i == 0) {
            fid = bid;
            // A broad dome under every frond, so the nucleus is a studded
            // pomegranate rather than a bare ball once the head opens out and
            // exposes it, and so the two read as one grown body.
            d -= 0.075 * smoothstep(0.72, 0.99, dot(w, q));
        }

        // Snap to the branch point and stand the frame up on the surface.
        p -= q;
        p = p * makeBase(q);

        // Each of the twenty fronds keeps its own phase, so the head crawls
        // instead of pulsing as one lump. Two beats per loop, an integer, so
        // the whole motion closes with the cycle.
        float lph = 2.0 * gA + fid * TAU + float(i) * 2.09;
        float breathe = 1.0 + 0.10 * sin(lph);

        float sc = 1.0 / gChR;
        p *= sc;
        p.xy *= gFlare;
        p.xy = rot2(gCurl * sin(lph + float(i))) * p.xy;

        // Every primary frond gets its own reach and its own girth, so the
        // colony is uneven the way a grown thing is, not a stamped pattern.
        float sep  = gSep * breathe * (0.88 + 0.24 * fid);
        float zoff = sc * sep;
        float capL = sc * (sep + gDown);
        float capR = sc * gRad * (0.80 + 0.45 * fract(fid * 7.31));

        // The stem opens and shuts like a trumpet. This is the motion that
        // reads most as life, so it is the one the mid band drives.
        p.z -= zoff - length(p.xy) * (0.10 * gCurl * cos(lph));

        s *= sc * gFlare;
        float dd = sdCapsule(p, -capL, capR) / s;

        if (doMat) {
            // Hue belongs to the primary frond, not to the twig, so a whole
            // floret shares a colour and its neighbour is a different one.
            // The walk from the core colour to the tip colour goes through a
            // violet waypoint: interpolated straight, two near-complementary
            // colours cross through grey and the whole head turns pastel.
            float u2 = fid * 2.0;
            vec3 fc = mix(mix(gC2, gCV, clamp(u2, 0.0, 1.0)),
                          gC3, clamp(u2 - 1.0, 0.0, 1.0));
            // Push the walk away from grey: two saturated neighbours read as
            // a colony, two desaturated ones read as one lilac mass.
            fc = max(vec3(0.0), mix(vec3(dot(fc, vec3(0.333))), fc, 1.40));
            // Then flatten the value so hue is the only thing that varies
            // across the colony. Without it the blue quarter of the walk
            // reads as a dim patch for half of every rotation.
            fc *= clamp(0.52 / (dot(fc, vec3(0.30, 0.59, 0.11)) + 1e-3), 0.75, 1.90);
            float lr = float(i) * 0.5;              // 0 stem, 1 tip
            vec3 lc = mix(gC1, fc, lr) * (0.60 + 0.50 * lr);
            // A light twig-level jitter on top, so the floret is not flat.
            lc *= 0.86 + 0.28 * bid;
            if (dd < d) {
                mat.w *= smoothstep(0.0, 3.5 / s, d - dd);
                mat.rgb = lc;
            } else {
                mat.w *= 0.45 + 0.55 * smoothstep(0.0, 1.2 / s, dd - d);
            }
        }

        d = smin(d, dd, kk);
        kk *= gChR;
    }

    return d;
}

// Four-tap tetrahedral normal, per the performance rules.
vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.0016;
    vec4 mm;
    return normalize(k.xyy * mapObj(p + k.xyy * e, mm, false) +
                     k.yyx * mapObj(p + k.yyx * e, mm, false) +
                     k.yxy * mapObj(p + k.yxy * e, mm, false) +
                     k.xxx * mapObj(p + k.xxx * e, mm, false));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // --- Selector -----------------------------------------------------------
    // Which bouquet this is comes from the balance of the bands, never from
    // the clock, and nothing on this path is smoothed or windowed.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    // tilt is a ratio of three smoothed averages and barely moves on its own,
    // so it is expanded hard around its rest point or the outer forms never
    // arrive.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // The onset pulses already decay. Used straight they shove the identity
    // within the transient instead of over a bar.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x = sel * 3.0;

    // Triangular weights, slope 1.85. Each archetype gets a plateau and the
    // crossfade is confined to about a third of the axis.
    float w0 = max(1.0 - abs(x      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(x - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(x - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(x - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One branching field, seven interpolated numbers,
    // so the body deforms and the march never has two shapes to resolve.
    //         bulb          bouquet       antler        nova
    gSep   = 0.120 * w0 + 0.240 * w1 + 0.520 * w2 + 0.660 * w3;
    gChR   = 0.520 * w0 + 0.400 * w1 + 0.260 * w2 + 0.200 * w3;
    gRad   = 0.320 * w0 + 0.190 * w1 + 0.070 * w2 + 0.034 * w3;
    // The stem always sinks past the nucleus surface, which is why gDown has
    // to rise as gNuc falls: a short stem on a small nucleus floats free.
    gDown  = 0.700 * w0 + 0.600 * w1 + 0.620 * w2 + 0.780 * w3;
    gNuc   = 0.950 * w0 + 0.850 * w1 + 0.620 * w2 + 0.420 * w3;
    gFlare = 0.850 * w0 + 0.950 * w1 + 1.250 * w2 + 1.550 * w3;
    gBlend = 0.340 * w0 + 0.240 * w1 + 0.090 * w2 + 0.022 * w3;
    gCurl  = 0.450 * w0 + 0.320 * w1 + 0.200 * w2 + 0.090 * w3;

    // Bass thickens every frond; mid sets how hard the head curls and sways.
    gRad  *= bulk;
    gCurl *= sway / 0.30;

    // Phase wraps exactly at LOOP = 16 s. This is the only place TIME appears.
    float ph = fract(TIME / PERIOD);
    gA = TAU * ph;

    // A kick swells the nucleus. AUDIO_KICK already decays, so it is a plain
    // multiplier and the nucleus rests at 1.0 in silence.
    gHub = gNuc * (1.0 + 0.05 * AUDIO_KICK + 0.012 * sin(2.0 * gA));

    gC0 = vec3(0.012, 0.015, 0.032);
    gC1 = vec3(0.060, 0.240, 0.270);
    gC2 = coreCol.rgb;
    gC3 = tipCol.rgb;
    gCV = vec3(0.50, 0.22, 1.00);   // the violet the hue walk passes through

    // Camera from the reserved uniforms, so orbiting the anamorphic camera
    // orbits the bouquet. CAM_UP keeps the basis valid from directly above.
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // Analytic bound. A ray that misses costs one quadratic, not 64 field
    // evaluations, and a ray that hits starts at the shell.
    float bq = dot(ro, rd);
    float cq = dot(ro, ro) - BOUND * BOUND;
    float hq = bq * bq - cq;

    // Nothing is drawn outside the object: no halo, no haze, no backdrop.
    if (hq < 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float sq = sqrt(hq);
    float t0 = max(-bq - sq, 0.0);
    float tMax = -bq + sq;

    float t = t0;
    float dS = 1.0;
    vec4 mm;
    for (int i = 0; i < MAX_STEPS; i++) {
        dS = mapObj(ro + rd * t, mm, false);
        if (dS < 0.0018 || t > tMax) break;
        t += dS * STEP_SCALE;
    }

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (t <= tMax && dS < 0.010) {
        vec3 p = ro + rd * t;
        vec3 nor = calcNormal(p);
        vec3 upp = p * inversesqrt(max(dot(p, p), 1e-6));

        vec4 mate;
        mapObj(p, mate, true);
        vec3 alb = mate.rgb;
        float ao = clamp(mate.w, 0.05, 1.0);

        // Depth grade. Interior fronds sit in the colony's own shadow, so the
        // eye reads the head as a volume instead of a patterned disc. Every
        // emissive term below is gated on it too: an unweighted rim would
        // paint the nucleus in the tip colour the moment the head opens out.
        float rr = length(p);
        float dep = smoothstep(0.95, 2.05, rr);
        alb *= mix(0.14, 1.0, dep);

        // Two lights, counter-rotating once per loop. Neither is pinned to the
        // camera, so no highlight bakes in place once the plane tilts, and
        // because they are opposed the head never turns its dark side to the
        // viewer for half the cycle: the hue balance rotates, the exposure
        // does not.
        vec3 lig  = normalize(vec3( 1.40 * sin(gA),  0.85,  1.40 * cos(gA)));
        vec3 lig2 = normalize(vec3(-1.30 * sin(gA), -0.45, -1.30 * cos(gA)));
        float dif  = clamp(0.18 + 0.82 * dot(nor, lig ), 0.0, 1.0);
        float dif2 = clamp(0.18 + 0.82 * dot(nor, lig2), 0.0, 1.0);
        col  = alb * dif * vec3(1.06, 0.94, 1.12) * 1.70 * (0.32 + 0.68 * ao);
        col += alb * dif2 * (gC2 * 0.85 + vec3(0.30, 0.34, 0.42)) * 0.85 * ao;

        // Radial dome term, which survives being wrapped or rotated.
        float dome = clamp(0.32 + 0.68 * dot(nor, upp), 0.0, 1.0);
        col += alb * dome * vec3(0.10, 0.17, 0.36) * 1.15 * ao;

        // Wet specular. Treble sharpens it from a broad sheen to a hard glint.
        vec3 hal = normalize(lig - rd);
        float spe = pow(clamp(dot(nor, hal), 0.0, 1.0), 14.0 + 90.0 * glint * 0.5);
        // Dark lacquer takes far less of the highlight than a lit frond does,
        // which keeps the nucleus from reading as a plastic marble.
        float shine = 0.20 + 0.80 * clamp(1.9 * max(alb.r, max(alb.g, alb.b)), 0.0, 1.0);
        col += vec3(1.00, 0.94, 1.00) * spe * shine * (0.55 + 1.10 * glint)
             * ao * (0.20 + 0.80 * dep);

        // Tip emission on the fresnel edge, flashed by the beat. AUDIO_BEAT
        // already decays, and the floor keeps the tips lit in silence.
        float fre = clamp(1.0 + dot(rd, nor), 0.0, 1.0);
        fre *= fre;
        col += gC3 * fre * fre * glint * (0.80 + 1.80 * AUDIO_BEAT)
             * ao * (0.10 + 0.90 * dep);

        // Shallow subsurface bleed, so the thick forms are not flat.
        col += 0.30 * alb * alb * fre * ao;

        // The nucleus is a lantern the colony is grown around: a small pooled
        // emission, flared by a kick, and zero past the innermost fronds.
        col += gC2 * (0.10 + 0.48 * AUDIO_KICK)
             * smoothstep(gHub * 1.45, gHub * 0.95, rr) * (0.10 + 1.25 * fre);

        // Tone map and gamma the object only, never the empty frame.
        col = col / (col + vec3(0.92));
        col = pow(col, vec3(0.4545));

        alpha = 1.0;
    }

    // Premultiply. Colour is zero wherever alpha is zero.
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
