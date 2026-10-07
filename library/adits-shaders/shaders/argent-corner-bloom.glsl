/*{
  "ADITS": 1,
  "DESCRIPTION": "A chrome-and-obsidian sphere built from four recursive corner-carved folds, its teeth-shaped gaps breathing open and shut on their own clock while the whole lattice spins (adapted from a widely shared Shadertoy recursive-sphere technique, not an original Adits concept). Mid sets the spin's pace, bass deepens its rhythmic lurch, treble sharpens the chrome glint, and kicks shove the spin forward.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "fractal", "raymarching", "chrome", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "INPUTS": [
    { "NAME": "spinSpeed", "TYPE": "float", "DEFAULT": 1.0,   "MIN": 0.6,  "MAX": 1.8,
      "LABEL": "Spin Speed", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "lurch",     "TYPE": "float", "DEFAULT": 0.333, "MIN": 0.15, "MAX": 0.6,
      "LABEL": "Bass Lurch", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "glint",     "TYPE": "float", "DEFAULT": 0.35,  "MIN": 0.15, "MAX": 0.9,
      "LABEL": "Treble Glint", "BIND": "treble", "BIND_DEPTH": 0.55 }
  ]
}*/

// Recursion depth of the corner-carved sphere fold.
#define RECURSION_LEVELS 4

// 64-step march (the guide's own budget, not just its ceiling) plus a
// 24-step reflection shadow trace: two independent loop bounds, each well
// under the 200-iteration cap, and neither raymarch loop exceeds 64 so
// there is no step-count warning.
#define MAX_STEPS 64
#define SHADOW_STEPS 24

// The bounding sphere the original scene was tuned against: the fin tips
// never reach much past it, so it is kept exactly rather than rescaled.
// ORBIT and FOCAL only change the camera projection, so a silhouette of
// radius BOUND lands at about 0.31 of the plane at any orbit, inside the
// guide's 0.46 visible-frame limit and its roughly-a-third coverage budget.
#define BOUND 5.6
#define ORBIT 18.0
#define FOCAL 1.0

vec3 saturate(vec3 a) { return clamp(a, 0.0, 1.0); }
float saturate(float a) { return clamp(a, 0.0, 1.0); }

vec3 RotateY(vec3 v, float rad)
{
    float c = cos(rad);
    float s = sin(rad);
    return vec3(c * v.x - s * v.z, v.y, s * v.x + c * v.z);
}

// Procedural environment used only for the object's own reflection (never
// drawn behind it): an overhead softbox plus purple and gold side lights.
// Every term is a bounded smoothstep rather than a hard step or a
// near-singular divide, so a rippled normal blends smoothly between them
// instead of flickering white wherever it crosses a hard light boundary --
// that flicker was the white speckle and the leaked-white edges.
vec3 GetEnvColor2(vec3 rayDir, vec3 sunDir)
{
    vec3 final = vec3(1.0) * dot(-rayDir, sunDir) * 0.5 + 0.5;
    final *= 0.125;

    float boxMask = smoothstep(0.0, 0.2, rayDir.y - abs(rayDir.x))
                   * smoothstep(0.0, 0.2, rayDir.y - abs(rayDir.z) * 0.25);
    final = mix(final, vec3(1.3) * max(rayDir.y, 0.0), boxMask);

    float roundBox = length(max(abs(rayDir.xz / max(0.0, rayDir.y)) - vec2(0.9, 4.0), 0.0)) - 0.1;
    final += vec3(0.6) * pow(saturate(1.0 - roundBox * 0.5), 6.0);

    final += vec3(3.2, 2.4, 2.8) * smoothstep(0.97, 0.999, abs(rayDir.x));
    final += vec3(3.2, 2.8, 2.4) * smoothstep(0.97, 0.999, abs(rayDir.z));
    return final;
}

float smin(float a, float b, float k)
{
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

vec2 matMin(vec2 a, vec2 b)
{
    if (a.x < b.x) return a;
    return b;
}

vec3 diagN = normalize(vec3(-1.0));
float cut = 0.77;
float inner = 0.333;
float outness = 1.414;
float finWidth;
float teeth;
float globalTeeth;
float spinTime;

// The recursive corner-carved fold: at each level a sphere is carved by
// mirrored fins running through its cube-corner diagonals, and the carved
// corners become the next level's space, spinning a little faster each
// level (spinTime scaled by a shrinking blend width). "teeth" is a gap
// opened in the fins, and it breathes on its own clock in render() below --
// the one piece of this shader left untouched.
vec2 sphereIter(vec3 p, float radius, float subA)
{
    finWidth = 0.1;
    teeth = globalTeeth;
    float blender = 0.25;
    vec2 final = vec2(1000000.0, 0.0);
    for (int i = 0; i < RECURSION_LEVELS; i++)
    {
        float d = length(p) - radius * outness;

        vec3 corners = abs(p) + diagN * radius;
        float lenCorners = length(corners);
        float subtracter = lenCorners - radius * subA;
        vec3 ap = abs(-p) * 0.7071;
        subtracter = max(subtracter, -(abs(ap.x - ap.y) - finWidth));
        subtracter = max(subtracter, -(abs(ap.y - ap.z) - finWidth));
        subtracter = max(subtracter, -(abs(ap.z - ap.x) - finWidth));
        subtracter = min(subtracter, lenCorners - radius * subA + teeth);
        d = -smin(-d, subtracter, blender);
        final = matMin(final, vec2(d, float(i)));

        corners = RotateY(corners, spinTime * 0.25 / blender);
        p = vec3(corners.x, corners.z, -corners.y);
        radius *= inner;
        teeth *= inner;
        finWidth *= inner;
        blender *= inner;
    }
    float d = length(p) - radius * outness;
    final = matMin(final, vec2(d, 6.0));
    return final;
}

vec2 DistanceToObject(vec3 p)
{
    return sphereIter(p, 5.2 / outness, cut);
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

vec4 render()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // ---- Animate: teeth and cut are left exactly as authored; only the
    // spin -- the object's one continuous "natural move" -- is wired to
    // audio. Mid sets its pace, bass deepens its rhythmic lurch, and a kick
    // shoves it forward a touch (the onset pulse is read directly, never
    // integrated).
    float localTime = TIME * 0.5;
    float rampStep = min(3.0, max(1.0, abs((fract(localTime) - 0.5) * 1.0) * 8.0)) * 0.5 - 0.5;
    rampStep = smoothstep(0.0, 1.0, rampStep);
    float step31 = (max(0.0, (fract(localTime + 0.125) - 0.25))
                   - min(0.0, (fract(localTime + 0.125) - 0.25)) * 3.0) * lurch;

    spinTime = (localTime + step31) * spinSpeed;
    spinTime += AUDIO_KICK * 0.35;

    globalTeeth = rampStep * 0.99;
    cut = max(0.48, min(0.77, localTime));

    // Host camera: CAM_DIR/CAM_UP so orbiting and hand tracking actually
    // move around the object instead of tilting a fixed picture of it.
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
    vec2 distAndMat = vec2(1000000.0, 0.0);
    for (int i = 0; i < MAX_STEPS; i++)
    {
        pos = ro + rd * t;
        distAndMat = DistanceToObject(pos);
        t += distAndMat.x * 0.7;
        if (t > tMax || abs(distAndMat.x) < 0.0025) break;
    }

    // Nothing is drawn outside the object -- the footage belongs behind it.
    // A ray that never actually converges onto the surface within the step
    // budget is treated the same way, as a miss, rather than shaded from an
    // inaccurate position: that was the salt-and-pepper white speckle on
    // the finest, deepest recursion detail, where the march occasionally
    // ran out of steps before truly reaching the surface.
    if (t > tMax || abs(distAndMat.x) >= 0.0025) return vec4(0.0);

    vec3 smallVec = vec3(0.005, 0.0, 0.0);
    vec3 normalU = vec3(distAndMat.x - DistanceToObject(pos - smallVec.xyy).x,
                         distAndMat.x - DistanceToObject(pos - smallVec.yxy).x,
                         distAndMat.x - DistanceToObject(pos - smallVec.yyx).x);
    vec3 normal = normalize(normalU);

    float ambientS = 1.0;
    ambientS *= saturate(DistanceToObject(pos + normal * 0.1).x * 10.0);
    ambientS *= saturate(DistanceToObject(pos + normal * 0.2).x * 5.0);
    ambientS *= saturate(DistanceToObject(pos + normal * 0.4).x * 2.5);
    ambientS *= saturate(DistanceToObject(pos + normal * 0.8).x * 1.25);
    float ambient = ambientS * saturate(DistanceToObject(pos + normal * 1.6).x * 1.25 * 0.5);
    ambient *= saturate(DistanceToObject(pos + normal * 3.2).x * 1.25 * 0.25);
    ambient *= saturate(DistanceToObject(pos + normal * 6.4).x * 1.25 * 0.125);
    ambient = max(0.035, pow(ambient, 0.3));
    ambient = saturate(ambient);

    vec3 ref = normalize(reflect(rd, normal));

    float sunShadow = 1.0;
    float iter = 0.1;
    vec3 nudgePos = pos + normal * 0.02;
    for (int i = 0; i < SHADOW_STEPS; i++)
    {
        float tempDist = DistanceToObject(nudgePos + ref * iter).x;
        sunShadow *= saturate(tempDist * 50.0);
        if (tempDist <= 0.0) break;
        iter += max(0.0, tempDist);
        if (iter > 4.2) break;
    }
    sunShadow = saturate(sunShadow);

    vec3 texColor = vec3(0.85, 0.945 - distAndMat.y * 0.15, 0.93 + distAndMat.y * 0.35) * 0.951;
    if (distAndMat.y == 6.0) texColor = vec3(0.91, 0.1, 0.41) * 10.5;
    texColor = max(texColor, vec3(0.0)) * 0.25;

    vec3 lightColor = vec3(0.0);
    lightColor += vec3(0.1, 0.35, 0.95) * (normal.y * 0.5 + 0.5) * ambient * 0.2;
    lightColor += vec3(1.0) * ((-normal.y) * 0.5 + 0.5) * ambient * 0.2;

    vec3 finalColor = texColor * lightColor;

    vec3 sunDir = normalize(vec3(3.93, 10.82, -1.5));
    vec3 refColor = GetEnvColor2(ref, sunDir) * sunShadow;
    finalColor += refColor * glint * ambient;

    return vec4(finalColor, 1.0);
}

void main()
{
    vec4 res = render();
    vec3 col = sqrt(clamp(res.rgb, 0.0, 1.0));
    float alpha = res.a;
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
