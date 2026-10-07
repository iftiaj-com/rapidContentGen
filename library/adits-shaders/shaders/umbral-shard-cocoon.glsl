/*{
  "ADITS": 1,
  "DESCRIPTION": "An alien seed pod tumbling slowly in the dark: twelve faceted shell plates, set on a dodecahedral frame, hinged open around a pulsing plasma core along bioluminescent seams. Bass blooms the shell open to reveal the core, mid sets the pod's zero-gravity tumble, treble sharpens the glowing seams, and kicks make the whole shell flinch wider.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "alien", "space", "raymarching", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "INPUTS": [
    { "NAME": "bloomAmt",    "TYPE": "float", "DEFAULT": 0.12, "MIN": 0.0,  "MAX": 0.85,
      "LABEL": "Shell Bloom", "BIND": "bass", "BIND_DEPTH": 0.65 },
    { "NAME": "tumbleSpeed", "TYPE": "float", "DEFAULT": 1.0,  "MIN": 0.4,  "MAX": 1.6,
      "LABEL": "Tumble Speed", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "crackGlow",   "TYPE": "float", "DEFAULT": 0.5,  "MIN": 0.15, "MAX": 1.3,
      "LABEL": "Seam Glow", "BIND": "treble", "BIND_DEPTH": 0.6 },
    { "NAME": "coreTint",  "TYPE": "color", "DEFAULT": [0.30, 1.00, 0.62, 1.00],
      "LABEL": "Core Plasma" },
    { "NAME": "shellTint", "TYPE": "color", "DEFAULT": [0.16, 0.11, 0.15, 1.00],
      "LABEL": "Shell Chitin" }
  ]
}*/

// Twelve shell plates, one per icosahedron-vertex axis (the dual of a
// dodecahedron's twelve faces).
#define PLATE_COUNT 12

// A 64-step march plus a 4-tap AO probe: two independent loop bounds, both
// far under the 200-iteration cap, neither exceeding 64 steps. Every field
// evaluated in either loop is an exact analytic primitive (a sphere and
// twelve rounded boxes, combined by a plain union), so convergence is fast
// and clean -- there is no approximate, distorted field here to underrun
// the step budget on.
#define MAX_STEPS 64
#define AO_STEPS 4

#define CORE_R 0.42
#define PLATE_HALF_X 0.28
#define PLATE_HALF_Y 0.09
#define PLATE_HALF_Z 0.28
#define PLATE_ROUND 0.045
#define REST_GAP 0.08
#define BLOOM_RANGE 0.42

// The shell's largest reachable corner, at full bloom, sits just over 1.1
// world units out; BOUND leaves headroom. ORBIT and FOCAL only change the
// camera projection, landing that silhouette at about 0.38 of the plane at
// any orbit and bloom level, inside the guide's 0.46 visible-frame limit --
// the pod itself is a sparse cage of plates, not a solid ball, so actual
// pixel coverage stays well under the roughly-a-third budget even at that
// silhouette size.
#define BOUND 1.2
#define ORBIT 3.2
#define FOCAL 1.0

// One of twelve fixed icosahedron-vertex directions, hand-enumerated rather
// than stored in an array to avoid dynamic array indexing, which some
// GLSL ES 1.00 drivers handle poorly.
vec3 axisDir(int i)
{
    if (i == 0)  return vec3( 0.0,       0.525731,  0.850651);
    if (i == 1)  return vec3( 0.0,       0.525731, -0.850651);
    if (i == 2)  return vec3( 0.0,      -0.525731,  0.850651);
    if (i == 3)  return vec3( 0.0,      -0.525731, -0.850651);
    if (i == 4)  return vec3( 0.525731,  0.850651,  0.0);
    if (i == 5)  return vec3( 0.525731, -0.850651,  0.0);
    if (i == 6)  return vec3(-0.525731,  0.850651,  0.0);
    if (i == 7)  return vec3(-0.525731, -0.850651,  0.0);
    if (i == 8)  return vec3( 0.850651,  0.0,        0.525731);
    if (i == 9)  return vec3( 0.850651,  0.0,       -0.525731);
    if (i == 10) return vec3(-0.850651,  0.0,        0.525731);
    return                   vec3(-0.850651,  0.0,       -0.525731); // i == 11
}

// Any unit vector perpendicular to v, picked by crossing with whichever
// world axis v is least aligned with -- robust for all twelve fixed axes,
// none of which are degenerate cases here, but cheap and safe regardless.
vec3 anyPerp(vec3 v)
{
    vec3 a = abs(v);
    vec3 other;
    if (a.x <= a.y && a.x <= a.z) other = vec3(1.0, 0.0, 0.0);
    else if (a.y <= a.z) other = vec3(0.0, 1.0, 0.0);
    else other = vec3(0.0, 0.0, 1.0);
    return normalize(cross(v, other));
}

vec3 mat3Min(vec3 a, vec3 b)
{
    if (a.x < b.x) return a;
    return b;
}

vec2 sphereBound(vec3 ro, vec3 rd, float rad)
{
    float b = dot(ro, rd);
    float c = dot(ro, ro) - rad * rad;
    float h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

// Set once per frame in render(), before the march: the tumble rotation and
// the audio-driven bloom envelope. Kept as globals so the many calls into
// DistanceToObject below (march, normal, AO) do not each recompute them.
mat2 rotXZ = mat2(1.0);
mat2 rotYZ = mat2(1.0);
float bloomBase = 0.0;

// x = signed distance, y = material id (-1 = core, 0..11 = plate index),
// z = seam-edge factor (0 away from a plate's rim, 1 right at it).
vec3 DistanceToObject(vec3 p)
{
    p.xz = rotXZ * p.xz;
    p.yz = rotYZ * p.yz;

    vec3 best = vec3(length(p) - CORE_R, -1.0, 0.0);

    for (int i = 0; i < PLATE_COUNT; i++)
    {
        vec3 axis = axisDir(i);

        // Each plate breathes on its own fixed, index-derived phase (never
        // integrated, purely a function of TIME and i each frame) so the
        // shell opens unevenly, like a living thing rather than a machine.
        float phase = fract(float(i) * 0.6180339887) * 6.28318530718;
        float wobble = 0.6 + 0.4 * sin(TIME * 0.4 + phase);
        float shellDist = CORE_R + REST_GAP + bloomBase * BLOOM_RANGE * wobble;

        vec3 b1 = anyPerp(axis);
        vec3 c1 = cross(axis, b1);
        vec3 lp = p - axis * shellDist;
        vec3 lc = vec3(dot(lp, b1), dot(lp, axis), dot(lp, c1));

        vec3 q = abs(lc) - vec3(PLATE_HALF_X, PLATE_HALF_Y, PLATE_HALF_Z);
        float d = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - PLATE_ROUND;

        float rim = max(abs(lc.x) - PLATE_HALF_X * 0.94, abs(lc.z) - PLATE_HALF_Z * 0.94);
        float edge = smoothstep(-0.015, 0.0, rim);

        best = mat3Min(best, vec3(d, float(i), edge));
    }

    return best;
}

vec4 render()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // ---- Audio: the pod's one continuous "natural move" is its breathing
    // bloom (bass) and its slow zero-gravity tumble (mid); treble sharpens
    // the bioluminescent seams, and a kick is read directly, making the
    // whole shell flinch a little wider (never integrated over time).
    bloomBase = clamp(bloomAmt + AUDIO_KICK * 0.22, 0.0, 1.05);

    float tumbleA = TIME * 0.11 * tumbleSpeed;
    float tumbleB = TIME * 0.07 * tumbleSpeed;
    float ca = cos(tumbleA), sa = sin(tumbleA);
    rotXZ = mat2(ca, -sa, sa, ca);
    float cb = cos(tumbleB), sb = sin(tumbleB);
    rotYZ = mat2(cb, -sb, sb, cb);

    // Host camera: CAM_DIR/CAM_UP so orbiting and hand tracking actually
    // move around the pod instead of tilting a fixed picture of it.
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    vec2 bound = sphereBound(ro, rd, BOUND);
    if (bound.y < 0.0 || bound.x > bound.y) return vec4(0.0);

    float t = max(bound.x, 0.0);
    float tMax = bound.y;
    vec3 pos = ro + rd * t;
    vec3 hit = vec3(1000000.0, -1.0, 0.0);
    for (int i = 0; i < MAX_STEPS; i++)
    {
        pos = ro + rd * t;
        hit = DistanceToObject(pos);
        t += hit.x * 0.9;
        if (t > tMax || abs(hit.x) < 0.0015) break;
    }

    // Nothing is drawn outside the pod -- the footage belongs behind it.
    // A ray that never actually converges within the step budget is
    // treated the same way, as a miss, rather than shaded from an
    // inaccurate position.
    if (t > tMax || abs(hit.x) >= 0.0015) return vec4(0.0);

    const vec2 k = vec2(1.0, -1.0);
    float e = 0.0025;
    vec3 normal = normalize(k.xyy * DistanceToObject(pos + k.xyy * e).x +
                             k.yyx * DistanceToObject(pos + k.yyx * e).x +
                             k.yxy * DistanceToObject(pos + k.yxy * e).x +
                             k.xxx * DistanceToObject(pos + k.xxx * e).x);

    float ao = 1.0;
    float aoScale = 1.0;
    for (int i = 0; i < AO_STEPS; i++)
    {
        float h = 0.02 + 0.035 * float(i);
        ao -= (h - DistanceToObject(pos + normal * h).x) * aoScale;
        aoScale *= 0.72;
    }
    ao = clamp(ao, 0.05, 1.0);

    vec3 lightDir = normalize(vec3(0.4, 0.65, 0.35));
    float diff = max(0.0, dot(normal, lightDir));
    vec3 halfV = normalize(lightDir - rd);
    float spec = pow(max(0.0, dot(normal, halfV)), 40.0);

    float sky = clamp(0.5 + 0.5 * normal.y, 0.0, 1.0);
    vec3 ambient = mix(vec3(0.03, 0.025, 0.05), vec3(0.05, 0.06, 0.07), sky);

    // Cool grazing rim, radially symmetric, so the silhouette separates
    // from the footage at every viewing angle.
    float fres = pow(1.0 - max(0.0, dot(normal, -rd)), 3.0);

    vec3 col;
    if (hit.y < -0.5)
    {
        // Core: self-lit plasma, pulsing on its own slow clock plus the
        // beat (the onset pulse is read directly, per the guide, never
        // integrated).
        float pulse = 0.6 + 0.4 * sin(TIME * 1.3);
        pulse *= 1.0 + 0.6 * AUDIO_BEAT;
        col = coreTint.rgb * (3.2 + pulse * 1.8);
        col += vec3(1.0) * fres * 0.4;
    }
    else
    {
        vec3 base = shellTint.rgb * (diff * 0.8 + ambient * 1.4) * ao;
        base += vec3(1.0, 0.95, 0.9) * spec * 0.6 * ao;
        base += mix(vec3(0.35, 0.55, 0.95), coreTint.rgb, 0.3) * fres * 0.4;
        // Bioluminescent seam at each plate's own rim, sharpened by treble.
        base += coreTint.rgb * hit.z * crackGlow * 1.3;
        col = base;
    }

    // Tone-map and gamma the pod only, never the empty frame.
    col = col / (col + vec3(1.0));
    col = pow(col, vec3(0.4545));

    return vec4(col, 1.0);
}

void main()
{
    vec4 res = render();
    vec3 col = res.rgb;
    float alpha = res.a;
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
