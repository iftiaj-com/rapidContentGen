/*{
  "ADITS": 1,
  "DESCRIPTION": "A hard-surfaced titanium relic built from four octahedral KIFS folds, tumbling on a fixed loop with every corner rim-worn. The fold chain is one primitive under nine interpolated numbers, so the solid morphs by deforming, not cross-fading, through four forms: blocky monolith cluster, spiked relic, tall spire stack, thin blade shard. Bass deepens the hinge breathing, mid opens the second hinge, treble raises the edge wear. Rests as the spiked relic.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["raymarching", "morph", "solid", "mechanical", "fractal"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "sens",       "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",       "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",       "TYPE": "float", "DEFAULT": 0.33, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "foldAmt",    "TYPE": "float", "DEFAULT": 0.20, "MIN": 0.08, "MAX": 0.30,
      "LABEL": "Fold Depth", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "skew",       "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.00, "MAX": 0.90,
      "LABEL": "Hinge Skew", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "wear",       "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.04, "MAX": 0.65,
      "LABEL": "Edge Wear", "BIND": "treble", "BIND_DEPTH": 0.5 },
    { "NAME": "albedoTint", "TYPE": "color", "DEFAULT": [0.82, 0.85, 0.88, 1.00],
      "LABEL": "Metal Colour" },
    { "NAME": "edgeTint",   "TYPE": "color", "DEFAULT": [1.00, 0.90, 0.72, 1.00],
      "LABEL": "Wear Colour" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 24.0

// 52 marching steps, a 4-tap normal, a 4-tap occlusion and an 8-step shadow:
// 68 fractal distance evaluations at a hit, inside the guide's 96 ceiling. Each
// evaluation runs four folds, so this is the expensive end of "high".
#define MAX_STEPS 52
#define SURF_DIST 0.0012

// The trim shell's largest half-axis is 1.70, so the object never leaves a
// sphere of that radius. FOCAL is set so that sphere's silhouette lands at 0.44
// of the plane at any camera orbit, inside the visible frame edge at 0.5.
#define BOUND 1.85
#define ORBIT 5.00
#define FOCAL 1.10

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// One octahedral KIFS fold, the Sierpinski-octahedron form. The three
// half-space folds keep the branches separated, which is what gives the solid
// bold spikes and a readable silhouette instead of the fine rubble a plain
// sort-and-offset fold produces. Called four times in sequence rather than from
// a loop: a four-iteration loop inside the march would multiply out past the
// 200-iteration budget for identical work, and the rotation matrices are built
// once per distance evaluation and passed in.
vec3 kifsFold(vec3 p, mat2 h1, mat2 h2, float scale, float off) {
    p = abs(p);
    if (p.x + p.y < 0.0) p.xy = -p.yx;
    if (p.x + p.z < 0.0) p.xz = -p.zx;
    if (p.y + p.z < 0.0) p.yz = -p.zy;

    // Mechanical hinge rotation.
    p.xy *= h1;
    p.xz *= h2;

    // Scale and extrude outward from the fold centre.
    return p * scale - off * (scale - 1.0);
}

// Signed distance to the relic.
//   m0 = (first hinge, second hinge, per-fold scale, total scale)
//   m1 = (extrusion offset, box half-extent, unused, hinge breathing)
//   m2 = (shell half-axes x, y, z, unused)
float sdRelic(vec3 p, float a, vec4 m0, vec4 m1, vec4 m2) {
    // Global tumble: two turns on one axis, one on the other, so the pose
    // returns exactly at the end of the loop.
    p.xz *= rot2D(2.0 * a);
    p.yz *= rot2D(a);

    // Hinge angles breathe with the loop. The breathing is an amplitude, never
    // an iteration count, so the per-pixel cost cannot move with the audio.
    mat2 h1 = rot2D(m0.x + sin(2.0 * a) * m1.w);
    mat2 h2 = rot2D(m0.y + cos(a) * m1.w * 0.75);
    float off = m1.x;

    // The pre-fold position, kept so the shell below can carve the fractal.
    vec3 p0 = p;

    p = kifsFold(p, h1, h2, m0.z, off);
    p = kifsFold(p, h1, h2, m0.z, off);
    p = kifsFold(p, h1, h2, m0.z, off);
    p = kifsFold(p, h1, h2, m0.z, off);

    // Base primitive: a sharp cube, giving the fractal field.
    vec3 q = abs(p) - vec3(m1.y);
    float box = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
    float frac = box / m0.w;

    // The shell is a loose trim, not a carve: it only cuts the outliers the
    // fold chain throws past the silhouette, and its flat cut faces read as
    // machined boundaries. Left off, the fine archetypes scatter debris to the
    // frame corners and stop reading as one object.
    float shell = (length(p0 / m2.xyz) - 1.0)
                * min(m2.x, min(m2.y, m2.z));

    return max(frac, shell);
}

float rayMarch(vec3 ro, vec3 rd, float t0, float tMax, float a,
               vec4 m0, vec4 m1, vec4 m2) {
    float dO = t0;
    for (int i = 0; i < MAX_STEPS; i++) {
        float dS = sdRelic(ro + rd * dO, a, m0, m1, m2);
        dO += dS * 0.85;    // relaxation: the KIFS distance underestimates
        if (dO > tMax || abs(dS) < SURF_DIST) break;
    }
    return dO;
}

// Four-tap tetrahedral normal.
vec3 calcNormal(vec3 p, float a, vec4 m0, vec4 m1, vec4 m2) {
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.0012;
    return normalize(k.xyy * sdRelic(p + k.xyy * e, a, m0, m1, m2) +
                     k.yyx * sdRelic(p + k.yyx * e, a, m0, m1, m2) +
                     k.yxy * sdRelic(p + k.yxy * e, a, m0, m1, m2) +
                     k.xxx * sdRelic(p + k.xxx * e, a, m0, m1, m2));
}

// Eight-step soft shadow. Short on purpose: the old version marched twenty,
// which put the whole shader over the distance-evaluation budget.
float calcShadow(vec3 ro, vec3 rd, float a, vec4 m0, vec4 m1, vec4 m2) {
    float res = 1.0;
    float t = 0.02;
    for (int i = 0; i < 8; i++) {
        float h = sdRelic(ro + rd * t, a, m0, m1, m2);
        res = min(res, 12.0 * h / t);
        t += max(h, 0.006) * 0.95;
        if (t > 2.2) break;
    }
    return clamp(res, 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n, float a, vec4 m0, vec4 m1, vec4 m2) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 4; i++) {
        float h = 0.010 + 0.024 * float(i);
        occ += (h - sdRelic(p + h * n, a, m0, m1, m2)) * sca;
        sca *= 0.94;
    }
    return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // --- Selector -------------------------------------------------------------
    // Balance decides which solid this is; loudness only decides how hard it is
    // lit. The old file had no morph at all, so the relic was one shape.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;             // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than
    // any one band. Expanded around the rest point, or the outer forms never
    // arrive and the morph fails silently.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // splits the solid into blades, a kick packs it back to a monolith.
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

    // Parameter-space morph. One fold chain, nine interpolated numbers, so the
    // solid deforms and the march never has two shapes to resolve.
    //              monolith  relic     spire     shard
    float hinge1 = 0.070 * w0 + 0.220 * w1 + 0.420 * w2 + 0.640 * w3;
    float hinge2 = -0.06 * w0 - 0.160 * w1 - 0.320 * w2 - 0.520 * w3;
    float scale = 1.550 * w0 + 1.750 * w1 + 1.900 * w2 + 2.000 * w3;
    float offs  = 0.800 * w0 + 0.900 * w1 + 0.970 * w2 + 1.020 * w3;
    // The box has to stay large enough that adjacent fold copies touch, or the
    // solid breaks into disconnected dust. Copies are separated by
    // offs * (scale - 1) in folded space, so the half-extent tracks that.
    float boxU  = 0.640 * w0 + 0.560 * w1 + 0.530 * w2 + 0.510 * w3;
    // The trim shell: a ball at the heavy end, a spindle through the mids, a
    // flattened disc at the fine end. Every archetype fills a similar share of
    // the frame.
    float shX = 1.500 * w0 + 1.560 * w1 + 1.050 * w2 + 1.620 * w3;
    float shY = 1.500 * w0 + 1.560 * w1 + 1.700 * w2 + 1.620 * w3;
    float shZ = 1.500 * w0 + 1.560 * w1 + 1.050 * w2 + 0.820 * w3;

    // The total scale after four folds, computed once per pixel rather than in
    // the fold chain.
    float ks = scale * scale;
    ks = ks * ks;

    // Mid opens the second hinge, which deforms the fractal rather than merely
    // brightening it.
    vec4 m0 = vec4(hinge1, hinge2 - skew * 0.55, scale, ks);
    vec4 m1 = vec4(offs, boxU, 0.0, foldAmt);
    vec4 m2 = vec4(shX, shY, shZ, 0.0);

    // Phase wraps exactly at LOOP = 24 s.
    float ph = fract(TIME / PERIOD);
    float a = TAU * ph;

    // Camera from the reserved uniforms, so the real camera orbits the relic
    // instead of tilting a flat picture of it. CAM_UP keeps the basis valid
    // when the viewer is directly above or below.
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // Analytic bounding sphere: a ray that misses costs one quadratic instead
    // of 52 fractal distance evaluations.
    float bq = dot(ro, rd);
    float cq = dot(ro, ro) - BOUND * BOUND;
    float hq = bq * bq - cq;

    // Nothing is drawn outside the object. No studio backdrop: the live footage
    // is what belongs behind the relic.
    if (hq < 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float sq = sqrt(hq);
    float t0 = max(-bq - sq, 0.0);
    float tMax = -bq + sq;

    float d = rayMarch(ro, rd, t0, tMax, a, m0, m1, m2);

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (d < tMax) {
        vec3 p = ro + rd * d;
        vec3 n = calcNormal(p, a, m0, m1, m2);

        // The key light orbits once per loop rather than sitting in a fixed
        // direction, so its highlight travels instead of reading as a baked
        // smudge once the plane rotates. The fill is fixed in the object's own
        // space, so it travels with the relic.
        vec3 lightDir1 = normalize(vec3(3.0 * sin(a), 4.0, 3.0 * cos(a)) - p);
        vec3 lightDir2 = normalize(vec3(-3.0, -2.0, -1.0) - p);

        float ao = calcAO(p, n, a, m0, m1, m2);
        float shadow = calcShadow(p + n * 0.004, lightDir1, a, m0, m1, m2);

        // AUDIO_BEAT already decays, so it is used straight and the floor keeps
        // the relic lit in silence.
        float pulse = 0.25 + 0.75 * snap * AUDIO_BEAT;

        float diff1 = max(0.0, dot(n, lightDir1));
        vec3 half1 = normalize(lightDir1 - rd);
        float spec1 = pow(max(0.0, dot(n, half1)), 128.0);

        float diff2 = max(0.0, dot(n, lightDir2));
        vec3 half2 = normalize(lightDir2 - rd);
        float spec2 = pow(max(0.0, dot(n, half2)), 64.0);

        // Ambient environment term, radially symmetric so it survives the plane
        // tilting.
        float sky = clamp(0.5 + 0.5 * n.y, 0.0, 1.0);
        float ground = 1.0 - sky;
        vec3 ambient = sky * vec3(0.055, 0.070, 0.095)
                     + ground * vec3(0.028, 0.022, 0.016);

        // A warm key and a cool fill, so the metal carries a colour split
        // rather than the flat mid-grey the guide warns disappears over footage.
        vec3 lightCol1 = vec3(1.00, 0.84, 0.58);
        vec3 lightCol2 = vec3(0.26, 0.52, 0.95);

        vec3 diffuse = diff1 * lightCol1 * shadow * 1.30
                     + diff2 * lightCol2 * 0.75;
        vec3 specular = spec1 * lightCol1 * shadow * 2.6 * (0.7 + 0.6 * pulse)
                      + spec2 * lightCol2 * 0.8;

        // A cool grazing rim, radially symmetric, so the silhouette separates
        // from the footage at every viewing angle.
        float NdotV = max(0.0, dot(n, -rd));
        float fres = 1.0 - NdotV;
        fres = fres * fres * fres;

        col = albedoTint.rgb * (diffuse + ambient * ao) + specular
            + mix(edgeTint.rgb, vec3(0.45, 0.72, 1.0), 0.55) * fres * ao * 1.1;

        // Edge wear: the sharp corners read brighter, driven by inverse
        // occlusion, which is where a machined relic catches light.
        float edge = clamp(1.0 - ao, 0.0, 1.0);
        col += edgeTint.rgb * edge * wear * 2.2 * (0.8 + 0.5 * pulse);

        // Tone map and gamma the object only, never the empty frame.
        col = col / (col + vec3(1.0));
        col = pow(col, vec3(0.4545));

        // Solid surface hit: the silhouette is the coverage.
        alpha = 1.0;
    }

    // Premultiply. Colour is zero wherever alpha is zero.
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
