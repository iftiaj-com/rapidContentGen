/*{
  "ADITS": 1,
  "DESCRIPTION": "Two counter-rotating phyllotaxis blooms unfurl from a shared core. The spectral balance morphs the petals from a round warm ember bud toward a needle-sharp violet burst, resting on a cool cyan form in silence, while kicks and hats snap the shift and beats flash the tips.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "bloom", "morph", "audio", "raymarching"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 4.0,
  "INPUTS": [
    { "NAME": "bloomScale", "TYPE": "float", "DEFAULT": 0.90, "MIN": 0.75, "MAX": 1.08,
      "LABEL": "Bloom Scale", "BIND": "bass", "BIND_DEPTH": 0.28 },
    { "NAME": "curlWarp", "TYPE": "float", "DEFAULT": 0.0, "MIN": -0.10, "MAX": 0.50,
      "LABEL": "Petal Curl", "BIND": "mid", "BIND_DEPTH": 0.8 },
    { "NAME": "edgeSharp", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Edge Sparkle", "BIND": "treble", "BIND_DEPTH": 0.6 },
    { "NAME": "formGain", "TYPE": "float", "DEFAULT": 2.6, "MIN": 1.2, "MAX": 3.6,
      "LABEL": "Morph Sensitivity" }
  ]
}*/

// Phyllotaxis bloom SDF adapted from an iq-style voronoi/leaf study for the
// Adits profile: transparent-object raymarch, spectral morph, premultiplied alpha.

vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float voronoi(in vec2 x) {
    vec2 cell = floor(x);
    float d = 1e12;
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
        vec2 offset = vec2(float(i), float(j));
        vec2 pos = hash2(cell + offset);
        vec2 r = cell + offset + pos;
        d = min(d, length(x - r));
    }
    return d;
}

const float PI = 3.14159265359;

void pR(inout vec2 p, float a) {
    p = cos(a) * p + sin(a) * vec2(p.y, -p.x);
}

float smin(float a, float b, float k) {
    float f = clamp(0.5 + 0.5 * ((a - b) / k), 0., 1.);
    return (1. - f) * a + f * b - f * (1. - f) * k;
}

float smax(float a, float b, float k) {
    return -smin(-a, -b, k);
}

// GLSL ES 1.00 has no round() or inverse(); small local replacements.
vec2 round2(vec2 x) {
    return floor(x + 0.5);
}

mat2 inverse2(mat2 m) {
    float det = m[0][0] * m[1][1] - m[1][0] * m[0][1];
    return mat2(m[1][1], -m[0][1], -m[1][0], m[0][0]) / det;
}

// Frame-wide state, computed once in main() from TIME and the spectrum, then
// read by every leaf/albedo evaluation during the march.
float time;
bool lightingPass;
mat3 modelMat;
float gNzSel;
float gLenMulSel;
vec3 gBaseCol;
vec3 gVeinCol;
vec3 gTipCol;
vec3 gFringeCol;

struct Model {
    float d;
    vec3 p;
    vec2 uv;
    vec2 cell;
    float wedges;
    float slice;
    float len;
};

Model leaf(vec3 p, vec3 cellData) {
    vec2 cell = cellData.xy;
    float cellTime = max(cellData.z, 0.);

    float d = 1e12;
    float d2 = 1e12;
    float slice = 1e12;
    float wedge, wedges;

    pR(p.xz, -cell.x);
    pR(p.zy, cell.y);

    vec3 pp = p;

    float len = max(cellTime * 3. - .2, 0.);
    len = pow(len, .33);
    len *= gLenMulSel;
    float llen = len;

    if (cellTime > 0.) {

        float ins = .25;
        p.z += ins;
        vec3 n = normalize(vec3(1, 0, gNzSel));
        wedge = -dot(p, n);
        wedge = max(wedge, dot(p, n * vec3(1, 1, -1)));
        wedge = smax(wedge, p.z - len * 1.12 - ins, len);
        p.z -= ins;

        ins = .2;
        p.z += ins;
        n = normalize(vec3(1, 0, gNzSel + .05));
        float wedge2 = -dot(p, n);
        wedge2 = max(wedge2, dot(p, n * vec3(1, 1, -1)));
        wedge2 = smax(wedge2, p.z - len * .95 - ins, len * .6);
        p.z -= ins;

        float top = p.y - len * .5;
        float curve = smoothstep(0., .2, cellTime);

        len *= mix(1.5, .65, curve);
        float rz = -mix(.2, .7, curve) - curlWarp;
        pR(p.zy, rz);
        slice = length(p - vec3(0, len, 0)) - len;
        d2 = abs(slice) - .05;
        d2 = max(d2, top);

        float edgeK = mix(.085, .02, edgeSharp);
        float d3 = smax(d2, wedge, edgeK);
        float d4 = smax(d2, wedge2, edgeK);
        wedges = smin(wedge, wedge2, .01);
        d3 = smin(d3, d4, .01);
        d = d3;

        p = pp;
        len = llen;
        vec2 uv = p.xz / len;
        return Model(d, p, uv, cell, wedges, slice, len);
    }

    return Model(d, p, vec2(0), vec2(0), 0., 0., 0.);
}

vec3 calcAlbedo(Model model) {
    vec3 col = gBaseCol;

    vec3 p = model.p;
    float len = model.len;
    vec2 cell = model.cell;
    float wedges = model.wedges;
    float slice = model.slice;
    vec2 uv = model.uv;

    float v = voronoi((uv + 4.) * 30.);
    float v2 = voronoi((uv + 4.) * 4. + cell.x);

    col = mix(col, gVeinCol, 1. - v2);
    float tip = length(p - vec3(0, .2, len * .9));

    tip = smoothstep(.5, .0, tip);
    tip *= smoothstep(.07, .0, abs(slice + .01));
    tip *= smoothstep(-.2, .0, wedges);
    tip = pow(tip, mix(1.0, 3.2, edgeSharp));
    col = mix(col, gTipCol, tip);

    float vs = 1. - uv.y * 1.;
    vs *= smoothstep(.0, -.1, wedges);
    vs *= smoothstep(.0, .05, abs(slice));
    v = smoothstep(vs + .1, vs - .5, v * 1.5);
    col = mix(col, gBaseCol * .35, v * v2);

    col *= mix(vec3(1), gFringeCol, smoothstep(.2, 1.8, cell.y) * .75);

    return col;
}

vec3 calcCellData(
    vec2 cell,
    vec2 offset,
    float maxBloomOffset,
    mat2 transform,
    mat2 transformI,
    float stretch,
    float stretchStart,
    float stretchEnd,
    float t
) {
    float sz = maxBloomOffset + PI / 2.;

    cell = transform * cell;
    cell = round2(cell);
    cell += offset;

    cell = transformI * cell;
    cell.y *= stretch / sz / stretchStart;
    cell.y = max(cell.y, .5 / stretchStart);
    cell.y /= stretch / sz / stretchStart;
    cell = transform * cell;

    cell = round2(cell);
    cell = transformI * cell;

    float y = cell.y * (stretch / sz);
    float cellAppearTime = (stretchStart - y) / (stretchStart - stretchEnd);
    float cellTime = t - cellAppearTime;

    cell.y -= maxBloomOffset;

    return vec3(cell, cellTime);
}

Model opU(Model a, Model b) {
    if (a.d < b.d) {
        return a;
    } else {
        return b;
    }
}

mat2 phyllotaxis;
void calcPhyllotaxis() {
    vec2 cc = vec2(5., 8.);
    float aa = atan(cc.x / cc.y);
    float scale = (PI * 2.) / sqrt(cc.x * cc.x + cc.y * cc.y);
    mat2 mRot = mat2(cos(aa), -sin(aa), sin(aa), cos(aa));
    mat2 mScale = mat2(1. / scale, 0, 0, 1. / scale);
    phyllotaxis = mRot * mScale;
}

Model bloom(vec3 p, float t) {
    p.y -= .05;

    float stretchStart = .25;
    float stretchEnd = 1.;
    float stretch = mix(stretchStart, stretchEnd, t);
    float maxBloomOffset = PI / 2.;

    vec2 cell = vec2(
        atan(p.x, p.z),
        atan(p.y, length(p.xz)) + maxBloomOffset
    );

    mat2 mStretch = mat2(1, 0, 0, stretch);
    mat2 transform = phyllotaxis * mStretch;
    mat2 transformI = inverse2(transform);

    Model res = Model(1e12, p, vec2(0), vec2(0), 0., 0., 0.);

    for (int m = 0; m < 3; m++)
    for (int n = 0; n < 3; n++) {
        res = opU(res, leaf(p, calcCellData(cell, vec2(m, n) - 1., maxBloomOffset, transform, transformI, stretch, stretchStart, stretchEnd, t)));
    }

    return res;
}

Model map(vec3 pIn) {
    vec3 p = pIn / bloomScale;
    p *= modelMat;

    float bound = length(p) - 1.3;
    Model result;

    if (bound > .01 && !lightingPass) {
        result = Model(bound, p, vec2(0), vec2(0), 0., 0., 0.);
    } else {
        // A gentle precession instead of the original's full half-turn tumble:
        // that swept the whole bloom edge-on to a fixed camera for much of the
        // loop. The breathing open/close cycle below carries the real motion.
        pR(p.xy, time * -0.25 * PI);

        vec3 pp = p;
        float side = sign(p.y);
        p.y = abs(p.y);
        p.z *= side;

        float t = time + .5 * side;
        t = sin(t * PI - PI / 2.) * .5 + .5;
        pR(p.xz, time * 0.25 * PI);
        Model model = bloom(p, t);

        // The mirrored bloom breathes half a cycle out of phase with the near
        // one, so it is not a copy and has to be unioned everywhere. Gating it
        // on a slab around y = 0 dropped every petal that reached past the
        // slab, which is most of them for part of the cycle, and left a hard
        // planar cut through the flower. The branch saved little in any case:
        // a divergent branch around a bloom evaluation costs the sum of both
        // sides, not the maximum.
        p = pp;
        side *= -1.;
        p.yz *= side;
        t = time + .5 * side;
        t = sin(t * PI - PI / 2.) * .5 + .5;
        pR(p.xz, time * 0.25 * PI);
        model = opU(model, bloom(p, t));

        result = model;
    }

    result.d *= bloomScale;
    return result;
}

vec3 calcNormal(vec3 pos) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0005;
    return normalize(
        k.xyy * map(pos + k.xyy * e).d +
        k.yyx * map(pos + k.yyx * e).d +
        k.yxy * map(pos + k.yxy * e).d +
        k.xxx * map(pos + k.xxx * e).d
    );
}

float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 3; i++) {
        float h = 0.01 + 0.04 * float(i);
        float dd = map(pos + nor * h).d;
        occ += (h - dd) * sca;
        sca *= 0.65;
    }
    return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

mat3 rotX(float a) {
    return mat3(1, 0, 0, 0, cos(a), -sin(a), 0, sin(a), cos(a));
}

mat3 rotY(float a) {
    return mat3(cos(a), 0, sin(a), 0, 1, 0, -sin(a), 0, cos(a));
}

mat3 rotZ(float a) {
    return mat3(cos(a), -sin(a), 0, sin(a), cos(a), 0, 0, 0, 1);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    float distToCenter = length(uv);
    if (distToCenter > 0.47) {
        gl_FragColor = vec4(0.0);
        return;
    }

    calcPhyllotaxis();
    modelMat = rotZ(-.9) * rotX(.05) * rotY(-1.1);

    time = fract(TIME / 4.0) + .35;

    // Spectral morph selector (guide sec. 12): balance, not loudness, decides
    // which archetype is on screen. Never driven from TIME.
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel = clamp((tilt - 0.5) * formGain + 0.5, 0.0, 1.0);

    // Silence rests on the mid "Standard" archetype rather than a div-by-eps extreme.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(0.5, sel, live);

    // Onset pulses shove the selector directly, with no lag of the shader's own.
    sel = clamp(sel + 0.45 * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    float wA = 1.0 - smoothstep(0.15, 0.55, sel); // Round ember bud (bass-heavy)
    float wC = smoothstep(0.45, 0.85, sel);       // Needle violet burst (treble-heavy)
    float wB = clamp(1.0 - wA - wC, 0.0, 1.0);    // Standard cyan bloom (mid, silence rest)

    gNzSel = wA * 0.60 + wB * 0.35 + wC * 0.14;
    gLenMulSel = wA * 0.82 + wB * 1.00 + wC * 1.28;
    gBaseCol = wA * vec3(.10, .02, .01) + wB * vec3(.01, .05, .07) + wC * vec3(.06, .01, .09);
    gVeinCol = wA * vec3(.55, .10, .03) + wB * vec3(.03, .35, .42) + wC * vec3(.35, .03, .45);
    gTipCol = wA * vec3(1.4, .55, .05) + wB * vec3(.05, 1.3, 1.4) + wC * vec3(1.3, .10, 1.1);
    gFringeCol = wA * vec3(1.6, .7, .15) + wB * vec3(.1, 1.0, 2.2) + wC * vec3(1.5, .2, 1.8);

    // Camera from the reserved uniforms, so orbiting the real camera orbits the bloom.
    vec3 ro = CAM_DIR * 3.0;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.1 * ww);

    // Analytic bounding sphere: skip the march entirely for rays that miss.
    float rBound = 1.5;
    float bq = dot(ro, rd);
    float cq = dot(ro, ro) - rBound * rBound;
    float hq = bq * bq - cq;
    if (hq < 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    float sq = sqrt(hq);
    float t = max(-bq - sq, 0.0);
    float tMax = -bq + sq;

    lightingPass = false;
    Model model;
    bool hit = false;
    float d = 0.0;

    for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * t;
        model = map(p);
        d = model.d;
        if (abs(d) < 0.001) {
            hit = true;
            break;
        }
        t += d;
        if (t > tMax) break;
    }

    if (!hit) {
        gl_FragColor = vec4(0.0);
        return;
    }

    lightingPass = true;
    vec3 pos = ro + rd * t;
    vec3 nor = calcNormal(pos);
    float occ = calcAO(pos, nor);

    float amb = sqrt(clamp(0.5 + 0.5 * nor.y, 0.0, 1.0));
    float fre = pow(clamp(1.0 + dot(nor, rd), 0.0, 1.0), 2.0);

    vec3 lin = vec3(0);
    lin += 1.70 * amb * vec3(1.30, 1.00, 0.70) * occ;
    lin += 0.90 * amb * vec3(0.30, 0.80, 1.30);
    lin += 1.00 * fre * vec3(1.00) * occ;

    vec3 albedo = calcAlbedo(model);
    vec3 col = albedo * lin;
    col *= 1.0 + AUDIO_BEAT * 0.5;
    col = pow(max(col, 0.0), vec3(0.4545));

    float edgeMask = 1.0 - smoothstep(0.40, 0.47, distToCenter);
    float alpha = 0.97 * edgeMask;

    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
