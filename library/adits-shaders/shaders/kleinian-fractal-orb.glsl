/*{
  "ADITS": 1,
  "DESCRIPTION": "A glowing kaleidoscopic fractal sphere built from a widely-shared Shadertoy pseudo-Kleinian IFS technique (an inversion-fold formula, not an original Adits concept), precessing slowly with a warm fresnel rim standing in for a reflection. Bass swells the glow, mid warps the fractal's own fold constant and drives the precession, treble sharpens the filaments to fine sparkle, and beats flash the surface.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "fractal", "raymarching", "kleinian", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    { "NAME": "glowGain", "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.50, "MAX": 1.80,
      "LABEL": "Bass Glow", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "spin",     "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.00, "MAX": 1.50,
      "LABEL": "Precession", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "sparkle",  "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.20,
      "LABEL": "Treble Sparkle", "BIND": "treble", "BIND_DEPTH": 0.55 },
    { "NAME": "tint",     "TYPE": "color", "DEFAULT": [0.35, 1.00, 0.55, 1.00],
      "LABEL": "Filament Tint" },
    { "NAME": "rimTint",  "TYPE": "color", "DEFAULT": [0.85, 0.75, 0.55, 1.00],
      "LABEL": "Rim Glow" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 20.0

// The 64-step march and the fractal's own 10-iteration loop live in separate
// functions, so they are two independent loop budgets (64 and 10), not a
// multiplied 640 — both are well inside the 200-iteration cap and the
// 96-step raymarch ceiling. Declared "high" regardless: ten inversion folds
// per march step is real cost even without a normal-tap penalty.
#define MAX_STEPS 64
#define FRACTAL_ITERS 10

// The fractal's own characteristic scale (the 0.7 / -0.7 constants) is tuned
// for world-space coordinates on the order of this bounding sphere's radius,
// so BOUND is left exactly as authored rather than rescaled. Framing is
// adjusted with FOCAL instead, which only changes the projection, not the
// world-space points the fractal ever sees.
#define BOUND 2.0
#define ORBIT 6.9282
#define FOCAL 1.06

float g_spin, g_fold, g_sharp;

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 csqr(vec2 a) { return vec2(a.x * a.x - a.y * a.y, 2.0 * a.x * a.y); }

mat2 rot(float a) {
    return mat2(cos(a), sin(a), -sin(a), cos(a));
}

// Analytic ray/sphere hit (iq's formula). Bounds the march so a missed ray
// costs one quadratic instead of 64 field evaluations (guide §9).
vec2 iSphere(in vec3 ro, in vec3 rd, in vec4 sph) {
    vec3 oc = ro - sph.xyz;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - sph.w * sph.w;
    float h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

float map(in vec3 p) {
    // Rigid spin about world Y, applied once before the fractal fold so the
    // whole structure precesses without touching its internal math.
    p.xz = rot(-g_spin) * p.xz;

    float res = 0.0;
    vec3 c = p;
    for (int i = 0; i < FRACTAL_ITERS; ++i) {
        p = g_fold * abs(p) / dot(p, p) - g_fold;
        p.yz = csqr(p.yz);
        p = p.zxy;
        res += exp(g_sharp * abs(dot(p, c)));
    }
    return res / 2.0;
}

vec3 raymarch(in vec3 ro, vec3 rd, vec2 tminmax) {
    float t = tminmax.x;
    float dt = 0.02;
    vec3 col = vec3(0.0);
    float c = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        t += dt * exp(-2.0 * c);
        if (t > tminmax.y) break;
        c = map(ro + t * rd);
        col = 0.99 * col + 0.08 * vec3(c * c, c, c * c * c);
    }
    return col;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One turn per LOOP, plus a mid-bound wobble at an integer multiple of
    // the loop frequency, so the object still precesses at silence and
    // still loops exactly (§10, §23).
    float ph = fract(TIME / PERIOD);
    g_spin = ph * TAU + spin * 0.4 * sin(ph * TAU * 2.0);

    // Mid actually deforms the fold (a real shape change, not a recolor):
    // the recursive constant is fractal-sensitive, so even this small a
    // perturbation reshapes the whole filament structure. Treble sharpens
    // the filaments themselves rather than only tinting them.
    g_fold  = 0.70 + 0.07 * spin;
    g_sharp = -19.0 - 11.0 * sparkle;

    // Host camera (§5): CAM_DIR/CAM_UP replace the shader's own orbit
    // entirely, so hand tracking and manual orbiting both actually move
    // around the object instead of tilting a fixed picture of it.
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    vec2 tmm = iSphere(ro, rd, vec4(0.0, 0.0, 0.0, BOUND));

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (tmm.x >= 0.0) {
        vec3 raw = raymarch(ro, rd, tmm);
        raw *= glowGain;                    // bass: overall glow scale
        raw.b *= 1.0 + 1.4 * sparkle;        // treble: fine filament sparkle

        vec3 body = tint.rgb * raw;

        // True unit normal on the bounding sphere (BOUND is its radius), used
        // only as a reflection axis for a procedural rim — no textures are
        // available in this profile, so this replaces an environment sample.
        vec3 nor = (ro + tmm.x * rd) / BOUND;
        vec3 refl = reflect(rd, nor);
        float fre = pow(0.5 + clamp(dot(refl, rd), 0.0, 1.0), 3.0) * 1.3;
        vec3 sky = mix(vec3(0.04, 0.03, 0.07), rimTint.rgb, clamp(0.5 + 0.5 * refl.y, 0.0, 1.0));
        body += sky * fre;

        body *= 1.0 + 0.5 * AUDIO_BEAT;      // onset pulse, read directly (§11.5)

        body = 0.5 * log(1.0 + body);        // tone-map the object only (§8)
        body = clamp(body, 0.0, 1.0);

        col = body;
        // Coverage from the object's own brightness rather than a flat
        // hit-mask, so the fractal's dark interior fades toward the footage
        // instead of compositing as a solid disc (§8).
        alpha = clamp(max(body.r, max(body.g, body.b)) * 1.4, 0.0, 1.0);
    }

    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
