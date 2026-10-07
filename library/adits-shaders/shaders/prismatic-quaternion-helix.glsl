/*{
  "ADITS": 1,
  "DESCRIPTION": "A polished quaternion Julia fractal: an interlocking chrome ribbon that continuously twists and reforms. Bass swells its glow and reach, mid warps and tilts the fractal's own core parameter for a real silhouette change, treble tightens filament banding into sparkle, and beats snap a bright pulse through the surface.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "fractal", "quaternion", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "glow",    "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.55, "MAX": 1.80,
      "LABEL": "Bass Glow", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "warp",    "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Mid Warp", "BIND": "mid", "BIND_DEPTH": 0.70 },
    { "NAME": "sparkle", "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.00, "MAX": 1.20,
      "LABEL": "Treble Sparkle", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "tint",    "TYPE": "color", "DEFAULT": [0.12, 0.55, 1.00, 1.00],
      "LABEL": "Body Tint" },
    { "NAME": "rimTint", "TYPE": "color", "DEFAULT": [1.00, 0.18, 0.62, 1.00],
      "LABEL": "Rim Glow" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 24.0

// Two independent, small loop budgets rather than one multiplied total: the
// 64-step march (and the 40-step shadow march) each call map(), which owns
// its own separate 10-iteration loop. Neither nests the other in source, so
// both stay far under the 200-iteration cap (guide §9, kleinian-fractal-orb.glsl
// precedent). calcNormal is analytic (METHOD 3 style) and calls map() zero
// times, so the 4-tap normal budget is not even in play.
#define MAX_STEPS     64
#define SHADOW_STEPS  40
#define FRACTAL_ITERS 10

#define BOUND 2.3
#define ORBIT 3.7
#define FOCAL 1.05

vec4 qsqr(in vec4 a) {
    return vec4( a.x*a.x - a.y*a.y - a.z*a.z - a.w*a.w,
                 2.0*a.x*a.y,
                 2.0*a.x*a.z,
                 2.0*a.x*a.w );
}
vec4 qconj(in vec4 a) { return vec4(a.x, -a.yzw); }
float qlength2(in vec4 q) { return dot(q, q); }

mat3 rotY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, -s,  0.0, 1.0, 0.0,  s, 0.0, c);
}
mat3 rotX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1.0, 0.0, 0.0,  0.0, c, s,  0.0, -s, c);
}

// Quaternion Julia distance estimate. `rot` carries the fractal's own slow
// self-turn, applied here rather than to the camera so the object keeps
// turning under itself even when CAM_DIR is held still by the host. `scale`
// is bass-driven uniform zoom (sample at p/scale, distance back out by
// scale) so bass reads as a real swell in reach, not only in brightness.
float map(in vec3 p, in mat3 rot, in vec4 c, in float scale, out vec4 oTrap) {
    vec4 z = vec4(rot * (p / scale), 0.0);
    float md2 = 1.0;
    float mz2 = dot(z, z);
    vec4 trap = vec4(abs(z.xyz), dot(z, z));

    for (int i = 0; i < FRACTAL_ITERS; i++) {
        md2 *= 4.0 * mz2;
        z = qsqr(z) + c;
        trap = min(trap, vec4(abs(z.xyz), dot(z, z)));
        mz2 = qlength2(z);
        if (mz2 > 4.0) break;
    }
    oTrap = trap;
    return 0.25 * sqrt(mz2 / md2) * log(mz2) * scale;
}

// Analytic gradient via the chain rule on the quaternion iteration (no extra
// map() calls at all), transformed back out of the fractal's rotated frame
// with invRot = transpose(rot) since rot is a pure rotation. The isotropic
// `scale` divide does not change the gradient's direction, only its
// magnitude, so it is safe to omit before normalize().
vec3 calcNormal(in vec3 p, in mat3 rot, in mat3 invRot, in vec4 c, in float scale) {
    vec4 z = vec4(rot * (p / scale), 0.0);
    vec4 J0 = vec4(1.0, 0.0, 0.0, 0.0);
    vec4 J1 = vec4(0.0, 1.0, 0.0, 0.0);
    vec4 J2 = vec4(0.0, 0.0, 1.0, 0.0);

    for (int i = 0; i < FRACTAL_ITERS; i++) {
        vec4 cz = qconj(z);
        J0 = vec4( dot(J0, cz), dot(J0.xy, z.yx), dot(J0.xz, z.zx), dot(J0.xw, z.wx) );
        J1 = vec4( dot(J1, cz), dot(J1.xy, z.yx), dot(J1.xz, z.zx), dot(J1.xw, z.wx) );
        J2 = vec4( dot(J2, cz), dot(J2.xy, z.yx), dot(J2.xz, z.zx), dot(J2.xw, z.wx) );
        z = qsqr(z) + c;
        if (qlength2(z) > 4.0) break;
    }

    vec3 v = vec3( dot(J0, z), dot(J1, z), dot(J2, z) );
    return normalize(invRot * v);
}

// Analytic ray/sphere hit, bounding the march so a missed ray costs one
// quadratic instead of MAX_STEPS field evaluations (guide §9).
vec2 iSphere(in vec3 ro, in vec3 rd, in vec4 sph) {
    vec3 oc = ro - sph.xyz;
    float b = dot(oc, rd);
    float cc = dot(oc, oc) - sph.w * sph.w;
    float h = b * b - cc;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

float softshadow(in vec3 ro, in vec3 rd, in mat3 rot, in vec4 c, in float scale, float mint, float k) {
    float res = 1.0;
    float t = mint;
    for (int i = 0; i < SHADOW_STEPS; i++) {
        vec4 kk;
        float h = map(ro + rd * t, rot, c, scale, kk);
        res = min(res, k * h / t);
        if (res < 0.005) break;
        t += clamp(h, 0.01, 0.3);
    }
    return clamp(res, 0.0, 1.0);
}

vec4 renderObject(in vec3 ro, in vec3 rd, in mat3 rot, in mat3 invRot, in vec4 c,
                   in float scale, in vec2 tminmax, in float pulse) {
    vec4 tra = vec4(0.0);
    float t = tminmax.x;
    float resT = -1.0;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec4 tmp;
        float h = map(ro + rd * t, rot, c, scale, tmp);
        if (h < 0.0008) { resT = t; tra = tmp; break; }
        t += h;
        if (t > tminmax.y) break;
    }
    if (resT < 0.0) return vec4(0.0);

    vec3 pos = ro + resT * rd;
    vec3 nor = calcNormal(pos, rot, invRot, c, scale);

    // Orbit-trap occlusion: pinches shadow into the fractal's own creases
    // instead of a flat hit-mask.
    float occ = clamp(2.2 * tra.w - 0.10, 0.0, 1.0);

    const vec3 sun = vec3(0.588, 0.686, 0.429);
    float dif  = clamp(dot(sun, nor), 0.0, 1.0);
    float dif2 = clamp(dot(-sun, nor), 0.0, 1.0);       // fill from behind: no dead-black side
    float sha  = softshadow(pos + nor * 0.004, sun, rot, c, scale, 0.02, 24.0);
    vec3  hal  = normalize(sun - rd);
    float spe  = pow(clamp(dot(hal, nor), 0.0, 1.0), 40.0);
    float fre  = pow(1.0 - clamp(dot(-rd, nor), 0.0, 1.0), 5.0);

    // Treble bands the surface directly from the orbit trap: raising
    // sparkle raises the band frequency, which reads as a fine filament
    // texture tightening rather than just a colour change.
    float band = 0.5 + 0.5 * sin(tra.w * (26.0 + 60.0 * sparkle) + t * 1.5);
    band = pow(band, 3.0) * sparkle;

    vec3 body      = tint.rgb * (0.32 + 0.68 * dif * sha + 0.22 * dif2) * occ;
    vec3 rim       = rimTint.rgb * fre * (0.85 + 0.85 * occ);
    vec3 highlight = mix(rimTint.rgb, vec3(1.0), 0.4) * (spe * sha * 1.1 + band * 0.9) * (0.7 + sparkle);

    vec3 col = body * 1.4 + rim * 1.3 + highlight;
    col *= glow * (1.0 + 0.9 * pulse);          // onset pulse, read directly (§11.5)

    return vec4(col, 1.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent (§7).
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Exact loop at PERIOD (§10, §23): every trig multiplier of `t` below is
    // a plain integer, so the whole animation wraps with no seam.
    float ph = fract(TIME / PERIOD);
    float t = TAU * ph;

    // The same four-frequency drift the object was built on, now looped
    // exactly. Mid then warps the constant directly — a real deformation of
    // the fractal, not a recolour — and rides straight on the host's own
    // audio envelope (no smoothing of our own, per §11.4), so the warp
    // tracks the music with no added lag.
    vec4 cBase = 0.45 * cos(vec4(0.5, 3.9, 1.4, 1.1) + t * vec4(1.0, 2.0, 3.0, 5.0))
                 - vec4(0.3, 0.0, 0.0, 0.0);
    vec4 c = cBase + warp * 0.42 * vec4(0.0, sin(t * 7.0), cos(t * 5.0), sin(t * 3.0));

    // Onset pulses shove the constant further for an instant snap-morph on
    // the beat, on top of the continuous mid-driven warp above.
    float pulse = AUDIO_BEAT * 0.85 + AUDIO_KICK * 0.6;
    c += pulse * 0.11 * vec4(0.0, 0.4, -0.3, 0.2);

    // Bass swells reach: a real zoom of the sampled field, not merely a
    // brightness change, so bass reads as scale/thickness per the guide's
    // per-band mapping.
    float scale = 1.0 + 0.28 * (glow - 1.0);

    // The fractal's own slow turn, independent of the viewer's camera, so
    // the object keeps the original living, twisting flow even when
    // CAM_DIR is held still. Mid also tilts it further: a directly visible
    // reorientation, on top of the c-warp above.
    float ay = t;
    float bx = 0.35 * sin(2.0 * t) + (warp - 0.35) * 1.3;
    mat3 rot    = rotY(ay) * rotX(bx);
    mat3 invRot = rotX(-bx) * rotY(-ay);

    // Host camera (§5): CAM_DIR / CAM_UP replace the old self-driven orbit
    // entirely, so orbiting or hand tracking actually moves around the
    // object instead of tilting a fixed picture of it.
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    vec2 tminmax = iSphere(ro, rd, vec4(0.0, 0.0, 0.0, BOUND * scale));

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (tminmax.x >= 0.0) {
        vec4 result = renderObject(ro, rd, rot, invRot, c, scale, tminmax, pulse);
        col = result.rgb;
        alpha = result.a;
    }

    // Tame the emissive highlights, lift the mids a touch, then gamma.
    col = col * 1.15 / (1.0 + col);
    col = pow(max(col, 0.0), vec3(0.4545));

    // Gentle saturation lift: over dark, busy footage a slightly desaturated
    // emissive object disappears (§10 wants bright, saturated).
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = clamp(mix(vec3(luma), col, 1.55), 0.0, 1.0);

    // Smooth frame-border fade so `edge` reads 0 even if a filament grazes
    // the bounding sphere near the silhouette limit (§10, §20).
    float edgeFade = smoothstep(0.48, 0.40, length(uv));
    alpha *= edgeFade;
    col *= edgeFade;

    col *= alpha;                                // premultiply (§8)
    gl_FragColor = vec4(col, alpha);
}
