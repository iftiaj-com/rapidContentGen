/*{
  "ADITS": 1,
  "DESCRIPTION": "A fibonacci-sphere tentacle creature that spins and bunches its own tendrils faster on the mids, swells its body on the bass, sharpens its surface grain on the treble, and snaps a tighter twist on every kick.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "3d", "organic", "tentacle", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "INPUTS": [
    { "NAME": "spinSpeed", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.7, "MAX": 1.5,
      "LABEL": "Spin Speed", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "swell", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.9, "MAX": 1.15,
      "LABEL": "Body Swell", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "detailAmt", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.15, "MAX": 1.1,
      "LABEL": "Surface Detail", "BIND": "treble", "BIND_DEPTH": 0.6 }
  ]
}*/

const float PI  = 3.14159265359;
const float PHI = 1.61803398875;

// GLSL ES 1.00 has neither round() nor transpose(); both are used below.
float round(float x) { return floor(x + 0.5); }

mat3 transposeMat3(mat3 m)
{
    return mat3(m[0][0], m[1][0], m[2][0],
                m[0][1], m[1][1], m[2][1],
                m[0][2], m[1][2], m[2][2]);
}

float hash31(vec3 p)
{
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

// Procedural value-noise FBM source, replacing a tiled noise texture (no samplers in this profile).
float noise3D(vec3 p)
{
    vec3 ip = floor(p);
    vec3 fp = fract(p);
    fp = fp * fp * (3.0 - 2.0 * fp);

    float n000 = hash31(ip + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(ip + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(ip + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(ip + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(ip + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(ip + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(ip + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(ip + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, fp.x);
    float nx10 = mix(n010, n110, fp.x);
    float nx01 = mix(n001, n101, fp.x);
    float nx11 = mix(n011, n111, fp.x);

    float nxy0 = mix(nx00, nx10, fp.y);
    float nxy1 = mix(nx01, nx11, fp.y);

    return mix(nxy0, nxy1, fp.z);
}

vec2 inverseSF(vec3 p, float n, out vec3 outq)
{
    float m = 1.0 - 1.0 / n;

    float phi = min(atan(p.y, p.x), PI), cosTheta = p.z;

    float k  = max(2.0, floor(log(n * PI * sqrt(5.0) * (1.0 - cosTheta * cosTheta)) / log(PHI + 1.0)));
    float Fk = pow(PHI, k) / sqrt(5.0);
    vec2  F  = vec2(round(Fk), round(Fk * PHI)); // k, k+1

    vec2 ka = 2.0 * F / n;
    vec2 kb = 2.0 * PI * (fract((F + 1.0) * PHI) - (PHI - 1.0));

    mat2 iB = mat2(ka.y, -ka.x,
                    kb.y, -kb.x) / (ka.y * kb.x - ka.x * kb.y);

    vec2 c = floor(iB * vec2(phi, cosTheta - m));
    float d = 8.0;
    float j = 0.0;
    for (int s = 0; s < 4; s++)
    {
        vec2 uv = vec2(float(s - 2 * (s / 2)), float(s / 2));

        float i = round(dot(F, uv + c));

        float phi = 2.0 * PI * fract(i * PHI);
        float cosTheta = m - 2.0 * i / n;
        float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

        vec3 q = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
        float squaredDistance = dot(q - p, q - p);
        if (squaredDistance < d)
        {
            outq = q;
            d = squaredDistance;
            j = i;
        }
    }
    return vec2(j, sqrt(d));
}

vec2 intersectSphere(vec3 ro, vec3 rd, vec3 org, float rad)
{
   float a = dot(rd, rd);
   float b = 2.0 * dot(rd, ro - org);
   float c = dot(ro - org, ro - org) - rad * rad;
   float desc = b * b - 4.0 * a * c;
   if (desc < 0.0)
      return vec2(1, 0);

   return vec2((-b - sqrt(desc)) / (2.0 * a), (-b + sqrt(desc)) / (2.0 * a));
}

// polynomial smooth min, iq: https://iquilezles.org/articles/smin
float smin(float a, float b, float k)
{
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float smax(float a, float b, float k) { return -smin(-a, -b, k); }

mat3 rotX(float a)
{
    return mat3(1.0, 0.0, 0.0,
                0.0, cos(a), sin(a),
                0.0, -sin(a), cos(a));
}

mat3 rotY(float a)
{
    return mat3(cos(a), 0.0, sin(a),
                0.0, 1.0, 0.0,
                -sin(a), 0.0, cos(a));
}

float time;
float spinTime;

// Rotation matrix for one spherical layer. spinTime carries the mid-band drive,
// so the tentacles' own spin is the audio-reactive feature (see INPUTS above).
mat3 rot(float r)
{
    float t = spinTime - r * 2.0;
    float s = 0.5 + 0.5 * r;
    return rotX(cos(t / 1.5) * s) * rotY(sin(t / 3.0) * s);
}

// Scene SDF, unchanged from its original morphing behaviour aside from the
// kick snap on the bunching factor k.
float dist(vec3 p)
{
    const float nPts = 35.0;

    vec3 op = p;

    p = rot(length(p)) * p;

    // Rotational velocity estimate.
    float diff = distance(p, rot(length(op) - 1e-2) * op);

    // Bunching factor: tentacles pull in when spinning fast, and AUDIO_KICK
    // gives that same natural bunching an extra snap on each kick.
    float k = max(1e-3, 1.0 + diff * 1.0 + AUDIO_KICK * 0.5);

    p *= k;
    op *= k;

    vec3 q;
    vec2 sf = inverseSF(normalize(p), nPts, q);

    q *= k;

    float d = length(p);

    // Alternating tentacle lengths based on spiral point ID.
    float r3 = (mod(sf.x, 3.0) < 1.0) ? 1.0 : 1.45;
    float r2 = r3 / k;

    d = smax(sf.y - diff * 2.2 - 0.04 / dot(p, p), d - r3, 32.0 / 200.0);

    // Spheres at the tentacle tips, built in the unrotated sample space so
    // they stay spherical.
    q = transposeMat3(rot(r2 + 0.05)) * q;
    d = smin(d, length(op - q * r2) - 0.1, 32.0 / 200.0);

    return min(d * 0.6 / k, 0.2);
}

// Fine surface grain, only used to perturb the normal. Its influence on the
// final normal is weighted by detailAmt (treble), not its own amplitude.
float bump(vec3 p)
{
    p = rot(length(p)) * p;
    float f = 0.0;
    for (int i = 0; i < 3; i++)
        f += noise3D(p * exp2(float(i))) / exp2(float(i) + 1.0);
    return f * (1.0 - smoothstep(1.3, 1.5, length(p))) * 0.5;
}

// Body-swell wrapper (bass): scales the whole object about the origin.
float map(vec3 p)
{
    return dist(p / swell) * swell;
}

// Geometry field plus a treble-weighted slice of the bump field, so a single
// 4-tap tetrahedral difference (guide §9) yields both at once.
float surf(vec3 p)
{
    return map(p) + bump(p) * detailAmt * 0.15;
}

vec3 getNormal(vec3 p)
{
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.02;
    return normalize(k.xyy * surf(p + k.xyy * e) +
                      k.yyx * surf(p + k.yyx * e) +
                      k.yxy * surf(p + k.yxy * e) +
                      k.xxx * surf(p + k.xxx * e));
}

// Pyramid waveform.
float tri(float x)
{
    return min(fract(x) * 2.0, 2.0 - 2.0 * fract(x));
}

vec4 render()
{
    time = TIME;
    spinTime = TIME * spinSpeed;

    // Canonical preamble (guide §7): aspect-correct, resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // CAM_DIR/CAM_UP drive the ray basis so the object is genuinely orbitable
    // and responds to hand tracking; the small sway on top is the object's
    // own idle drift, not a substitute for the real camera.
    const float ORBIT = 3.6;
    vec3 ro = CAM_DIR * ORBIT;
    ro.y += sin(time / 4.0) * 0.03;
    ro.x += sin(time / 5.0) * 0.03;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 0.75 * ww);

    // Analytic bounding-sphere clip, sized to the largest reachable swell.
    float bound = 1.6 * swell;
    vec2 spheret = intersectSphere(ro, rd, vec3(0.0), bound);
    if (spheret.x > spheret.y)
        return vec4(0.0);

    float t = max(spheret.x, 0.0);
    float maxt = spheret.y;

    float d = bound;
    for (int i = 0; i < 64; i++)
    {
        d = map(ro + rd * t);
        if (abs(d) < 1e-4 || t > maxt) break;
        t += d;
    }

    float coverage = (t > maxt) ? 0.0 : (1.0 - smoothstep(0.0, 0.02, max(d, 0.0)));
    if (coverage <= 0.0)
        return vec4(0.0);

    vec3 rp = ro + rd * t;
    vec3 n = getNormal(rp);
    vec3 r = reflect(rd, n);
    float l = length(rp);
    float lc = l / swell; // radius normalised back to the unscaled body pattern
    float fr = clamp(1.0 - dot(n, -rd), 0.0, 1.0);

    // Fake shadowing for the specular highlight and backlight, simulating a
    // spherical occluder for the body at the object's centre.
    float bodyR = 0.5 * swell;
    float cone = cos(atan(bodyR / l));

    float specshad  = 1.0 - smoothstep(-0.1, 0.1, dot(r, normalize(-rp)) - cone);
    float specshad2 = 1.0 - smoothstep(-0.3, 0.3, dot(r, normalize(-rp)) - cone);

    // Fixed ambient tint standing in for the pale backdrop bounce light the
    // object was originally lit against (no full-frame background is drawn).
    vec3 ambient = vec3(0.75) * mix(vec3(0.5, 0.5, 1.0), vec3(1.0), 0.6);

    // Backlight / fake SSS.
    vec3 col = ambient * mix(vec3(0.2, 0.5, 1.0) / 2.0, vec3(1.0, 0.9, 0.8).bgr, specshad2 * pow(fr, 0.8));

    // Fake AO from the centre of the body.
    col *= vec3(pow(mix(0.5 + 0.5 * dot(n, normalize(-rp)), 1.0, smoothstep(0.0, 1.5, lc)), 0.5));

    // Slight AO / diffuse bleeding.
    col *= mix(vec3(0.75, 1.0, 0.75), vec3(1.0), smoothstep(0.1, 0.8, lc));

    vec3 c = col;

    // Blue / green alternating pattern.
    col = mix(c.bbb * vec3(0.5, 1.0, 0.5), col, smoothstep(0.3, 0.7, tri(lc * 4.0)));

    // Yellow tips, with a treble-onset sparkle.
    col = mix(col, c.bbb * vec3(1.0, 1.0, 0.5), smoothstep(1.4, 1.5, lc));
    col += vec3(1.0, 1.0, 0.4) * smoothstep(1.4, 1.5, lc) * 0.11 * (1.0 + AUDIO_HAT * 0.5);

    // Specular highlight, flared on the beat.
    col += specshad * 0.9 * smoothstep(0.4, 0.7, dot(r, normalize(vec3(1.0)))) * fr * (1.0 + AUDIO_BEAT * 0.6);

    // Depth mist, localised to the object by construction (added only where
    // coverage > 0, i.e. only on returned hit pixels).
    col += mix(vec3(0.5, 0.5, 1.0), vec3(0.0), exp(-t / 25.0));

    return vec4(col, coverage);
}

void main()
{
    vec4 res = render();

    vec3 col = res.rgb;
    float alpha = clamp(res.a, 0.0, 1.0);

    // Contrast, gamma, and a light procedural dither, applied to the
    // straight colour before it is premultiplied.
    col = col * 1.2 - 0.05;
    col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
    col += (hash31(vec3(gl_FragCoord.xy, 1.0)) - 0.5) * (1.0 / 128.0);

    // §8: premultiplied alpha, zero everywhere the object is not.
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
