/*{
  "ADITS": 1,
  "DESCRIPTION": "A volumetric nova shroud: a lens of glowing gas wrapped in ridged spiral filaments around a white-hot nucleus, built from the widely-shared Shadertoy supernova technique (a lens primitive summed with ridged spiral noise, not an original Adits concept). It turns once per loop while a closed drift path slides its interior through it. Bass thickens the gas and opens the shroud out, mid sloshes and twists the interior, treble draws the filaments finer, beats brighten the nucleus, a kick inflates it.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "volumetric", "raymarching", "nebula", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "reach",      "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.20, "MAX": 0.85,
      "LABEL": "Gas Density", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "churn",      "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Inner Churn", "BIND": "mid", "BIND_DEPTH": 0.55 },
    { "NAME": "filament",   "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Filament Detail", "BIND": "treble", "BIND_DEPTH": 0.55 },
    { "NAME": "flare",      "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Nucleus Flare", "BIND": "beat", "BIND_DEPTH": 0.50 },
    { "NAME": "glow",       "TYPE": "float", "DEFAULT": 1.05, "MIN": 0.50, "MAX": 1.80,
      "LABEL": "Emission" },
    { "NAME": "coreTint",   "TYPE": "color", "DEFAULT": [1.00, 0.62, 0.30, 1.00],
      "LABEL": "Nucleus Tint" },
    { "NAME": "shroudTint", "TYPE": "color", "DEFAULT": [0.42, 0.70, 1.00, 1.00],
      "LABEL": "Shroud Tint" }
  ]
}*/

#define TAU     6.28318530718
#define PERIOD  24.0
#define STEPS   64
#define ORBIT   6.6
#define FOCAL   1.10
#define NUDGE   0.9
// 1.0 / sqrt(1.0 + NUDGE * NUDGE), so the spiral rotation keeps its scale.
#define NORMALIZER 0.74329414

// Motion state, computed once in main() and read by gas(). GLSL ES 1.00 has no
// closures and the field is sampled 64 times a pixel, so recomputing this per
// step would pay for three sines a step for nothing.
vec3  gDrift;
float gSpin;
float gTwist;
float gFine;
float gScale;

mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// The shroud's envelope: an ellipsoid squashed on its y axis, so it reads as a
// lens edge-on and as a disc from above. Scaled by the smallest radius, which
// is the usual cheap way to keep an ellipsoid's field near unit gradient.
float lens(vec3 p, vec3 r) {
    return (length(p / r) - 1.0) * min(min(r.x, r.y), r.z);
}

// Ridged spiral noise, after otaviogood: sine layers, each rotated off the last
// and stepped up in frequency, so the ridges read as drawn filaments rather
// than as grain. Five layers instead of the usual eight, both to keep the march
// affordable at 64 steps and because the layers above that put ridges under two
// pixels wide, which alias into speckle rather than reading as detail.
float spiral(vec3 p) {
    float n = 0.0;
    float iter = 2.0;
    for (int i = 0; i < 5; i++) {
        n -= abs(sin(p.y * iter) + cos(p.x * iter)) / iter;
        p.xy += vec2(p.y, -p.x) * NUDGE;
        p.xy *= NORMALIZER;
        p.xz += vec2(p.z, -p.x) * NUDGE;
        p.xz *= NORMALIZER;
        iter *= 1.733733;
    }
    return n;
}

// Local gas strength, 0 to 1. Two factors, and keeping them apart is the whole
// composition: the lens envelope fixes the silhouette, and the filament sheets
// are what moves inside it.
float gas(vec3 p, float band) {
    vec3 q = p * gScale;

    // The envelope, sampled unmoved, so the object stays a symmetric lens
    // anchored on the nucleus whatever the interior is doing.
    float body = smoothstep(0.55, -0.35, lens(q, vec3(2.90, 1.45, 2.90)));

    // Only the filaments move: one turn per loop, a shear about the lens axis,
    // and a slide along a closed path. That is the flow seen inside. They are
    // mirrored on the world x axis first, before anything turns, so the object
    // stays bilaterally symmetric and reads as designed rather than as a cloud.
    vec3 s = vec3(abs(q.x), q.y, q.z);
    s.xz = rot(gSpin) * s.xz;
    s.xz = rot(gTwist * s.y * 0.28) * s.xz;
    s += gDrift;
    float f = spiral(s.zxy * (0.5123 * gFine) + 100.0) * 3.0 + 3.2;

    // The sheets are the zero set of that field; band is their half-width, so
    // treble narrowing it draws the filaments finer.
    return body * smoothstep(band, band * 0.45, abs(f));
}

// Radius carries the hue, from the warm nucleus out to the cool shroud, and the
// local gas strength only brightens it. Keeping hue off the accumulated density
// is what stops the gas washing out to grey.
vec3 shade(float dens, float r) {
    float k = smoothstep(0.35, 1.55, r);
    vec3 hue = mix(coreTint.rgb * 1.40, shroudTint.rgb * 1.10, k);
    return hue * (0.22 + 0.85 * dens);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Phase wraps exactly at LOOP = 24 s. Every animated quantity below comes
    // from it, so the object loops seamlessly at any clock speed.
    float ph = fract(TIME / PERIOD);
    float ang = TAU * ph;

    // Camera from the host, so orbiting the real camera orbits the shroud
    // instead of tilting a flat picture of it.
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // The one onset pulse read straight from the body. It already decays, so it
    // is used as a plain multiplier and never integrated.
    float kick = AUDIO_KICK;

    // Bass swells the envelope and thickens the gas in it. A kick inflates the
    // whole structure on top of that, for the third of a second it decays over.
    gScale = 2.0 / (mix(0.88, 1.20, reach) * (1.0 + 0.14 * kick));
    float thick = mix(0.60, 1.75, reach);

    // The outer safety net. It sits just outside the widest the envelope can
    // reach, so a stray wisp can never be sliced by the frame border.
    float outer = 2.15;
    float inner = 1.25;

    // Treble narrows the filament sheets and draws them finer.
    float band = mix(0.62, 0.16, filament);
    gFine = mix(0.82, 1.34, filament);

    // Interior motion. The filaments turn once per loop and a closed drift path
    // slides them through the envelope, so the inside keeps flowing without the
    // clock having to run away. Mid sloshes them further and twists them harder.
    gSpin = ang;
    gDrift = vec3(sin(ang), 0.42 * sin(2.0 * ang), cos(ang)) * (0.40 + 1.45 * churn);
    gTwist = 0.35 + 1.30 * churn;

    // Analytic bound on the march: a ray that misses costs one quadratic, and
    // it leaves t past tFar so the loop breaks on its first test.
    float bound = outer + 0.10;
    float ca = dot(ro, rd);
    float disc = ca * ca - (dot(ro, ro) - bound * bound);
    float sq = sqrt(max(disc, 0.0));
    float tFar = disc < 0.0 ? -1.0 : -ca + sq;
    float t = max(-ca - sq, 0.0);

    // Fixed step across the bounded span, so every filament sheet gets sampled
    // instead of stepped over, plus one hash of dither on the entry point so
    // the slices do not band. Static per pixel: one hash for the whole march.
    float dt = max(tFar - t, 0.0) / float(STEPS) + 1e-4;
    t += dt * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);

    vec4 sum = vec4(0.0);

    for (int i = 0; i < STEPS; i++) {
        if (t > tFar || sum.a > 0.99) break;

        vec3 pos = ro + t * rd;
        float lr = length(pos);

        // The envelope that bounds the object. It reaches zero at "outer", well
        // inside the frame, so no wisp can be sliced by the border.
        float env = smoothstep(outer, inner, lr);

        float dens = gas(pos, band) * env;

        if (dens > 0.01) {
            float dCov = clamp(dens * thick * dt * 3.2, 0.0, 1.0);
            sum.rgb += shade(dens, lr) * dCov * (1.0 - sum.a);
            sum.a += dCov * (1.0 - sum.a);
        }

        t += dt;
    }

    sum = clamp(sum, 0.0, 1.0);
    sum.rgb = sum.rgb * sum.rgb * (3.0 - 2.0 * sum.rgb);   // contrast, not mud
    // The same curve on coverage. It pushes the thinnest gas to nothing, which
    // is what keeps the object from laying a faint veil over the footage.
    sum.a = sum.a * sum.a * (3.0 - 2.0 * sum.a);

    // The nucleus, in closed form: the line integral of a 1/r^2 kernel along
    // the ray. One dot product instead of 64 samples, and it cannot band. Both
    // terms fall off with the ray's closest approach, so both are bounded.
    float b2 = max(dot(ro, ro) - ca * ca, 0.0);
    float star = 0.032 / (b2 * 5.0 + 0.012);
    float halo = exp(-b2 * 5.2);

    float flareAmt = flare * (0.85 + 0.6 * kick);
    vec3 core = coreTint.rgb * star * (0.80 + 1.60 * flareAmt)
              + mix(coreTint.rgb, shroudTint.rgb, 0.45) * halo * (0.45 + 1.15 * flareAmt);
    core *= 1.0 - 0.55 * sum.a;   // gas in front of the nucleus occludes it

    // Coverage: the marched alpha plus the nucleus's own falloff. Nothing here
    // is frame-wide, so alpha stays zero everywhere the object is not.
    float coreA = clamp(star * 0.90 + halo * 0.30, 0.0, 1.0);
    float alpha = clamp(sum.a * 1.15 + coreA * 0.90, 0.0, 1.0);

    // The march accumulated premultiplied light, so divide the coverage back
    // out here: col is a straight colour from this line on, and the write below
    // premultiplies it exactly once. Doing it twice is what puts a dark fringe
    // around a volumetric object. The min() stops the divide exploding on the
    // thinnest gas, where alpha is close to the guard.
    vec3 col = min((sum.rgb + core) * glow / max(alpha, 0.02), vec3(3.5));

    // Frame guard: reaches zero at 0.45, inside the visible edge at 0.5.
    alpha *= 1.0 - smoothstep(0.395, 0.450, length(uv));

    col *= alpha;   // premultiply
    gl_FragColor = vec4(col, alpha);
}
