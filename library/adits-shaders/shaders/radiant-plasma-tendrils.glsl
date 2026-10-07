/*{
  "ADITS": 1,
  "DESCRIPTION": "A swirling cosmic plasma orb featuring volumetric fluid tendrils and inner turbulent flow reflection. The sphere frame stays strictly locked in size while audio dynamically multiplies the number of writhing tendril rays, extends their reach, and accelerates plasma turbulence.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-22",
  "CATEGORIES": ["3d", "volumetric", "plasma", "generative", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "glowPower", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.40,
      "LABEL": "Plasma Glow", "BIND": "level", "BIND_DEPTH": 0.35 },
    { "NAME": "rayDensity","TYPE": "float", "DEFAULT": 0.60, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Tendril Count", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "reachDrive","TYPE": "float", "DEFAULT": 0.75, "MIN": 0.30, "MAX": 1.10,
      "LABEL": "Tendril Reach", "BIND": "mid", "BIND_DEPTH": 0.35 },
    { "NAME": "turbRate",  "TYPE": "float", "DEFAULT": 0.65, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Swirl Rate", "BIND": "hat", "BIND_DEPTH": 0.30 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718
#define MAX_RAYS 10
#define VOLUMETRIC_STEPS 10
#define MAX_ITER 14
#define FAR 5.5

mat2 mm2(in float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

// Procedural 3D noise replacing texture sampler
float noise3D(vec3 p) {
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

mat3 m3 = mat3(
     0.00,  0.80,  0.60,
    -0.80,  0.36, -0.48,
    -0.60, -0.48,  0.64
);

// Inner turbulent plasma flow
float flow(in vec3 p, in float animTime) {
    float z = 2.0;
    float rz = 0.0;
    vec3 bp = p;
    for (int i = 1; i < 4; i++) {
        p += animTime * 0.1;
        rz += (sin(noise3D(p + animTime * 0.8) * 6.0) * 0.5 + 0.5) / z;
        p = mix(bp, p, 0.6);
        z *= 2.0;
        p *= 2.01;
        p *= m3;
    }
    return rz;
}

// Sine displacement harmonics
float sins(in float x, in float animTime) {
    float rz = 0.0;
    float z = 2.0;
    for (int i = 0; i < 3; i++) {
        rz += abs(fract(x * 1.4) - 0.5) / z;
        x *= 1.3;
        z *= 1.15;
        x -= animTime * 0.65 * z;
    }
    return rz;
}

// Distance to segment
float segm(vec3 p, vec3 a, vec3 b) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) * 0.5;
}

// Curved procedural path for tendril
vec3 path(in float i, in float d, in float animTime) {
    vec3 en = vec3(0.0, 0.0, 1.0);
    float sns2 = sins(d + i * 0.5, animTime) * 0.22;
    float sns  = sins(d + i * 0.6, animTime) * 0.21;
    en.xz *= mm2((hash11(i * 10.569) - 0.5) * 6.2 + sns2);
    en.xy *= mm2((hash11(i * 4.732) - 0.5) * 6.2 + sns);
    return en;
}

// Tendril SDF map
vec2 map(vec3 p, float i, in float animTime, in float reach) {
    float lp = length(p);
    vec3 bg = vec3(0.0);
    vec3 en = path(i, lp * (1.0 / reach), animTime) * reach;

    float ins = smoothstep(0.11, 0.46, lp);
    float outs = 0.15 + smoothstep(0.0, 0.15, abs(lp - reach));
    p *= ins * outs;
    float id = ins * outs;

    float rz = segm(p, bg, en) - 0.011;
    return vec2(rz, id);
}

// Raymarch to find tendril surface
float march(in vec3 ro, in vec3 rd, in float startf, in float maxd, in float j, in float animTime, in float reach) {
    float precis = 0.002;
    float h = 0.5;
    float d = startf;
    for (int i = 0; i < MAX_ITER; i++) {
        if (abs(h) < precis || d > maxd) break;
        d += h * 1.2;
        float res = map(ro + rd * d, j, animTime, reach).x;
        h = res;
    }
    return d;
}

// Volumetric raymarching inside the tendril
vec3 vmarch(in vec3 ro, in vec3 rd, in float j, in vec3 orig, in float animTime, in float reach, in float kick) {
    vec3 p = ro;
    vec2 r = vec2(0.0);
    vec3 sum = vec3(0.0);
    for (int i = 0; i < VOLUMETRIC_STEPS; i++) {
        r = map(p, j, animTime, reach);
        p += rd * 0.038;
        float lp = length(p);

        vec3 col = sin(vec3(1.05, 2.5, 1.52) * 3.94 + r.y) * 0.85 + 0.45;
        col.rgb *= smoothstep(0.0, 0.02, -r.x);
        col *= smoothstep(0.04, 0.22, abs(lp - reach * 1.05));
        col *= smoothstep(0.08, 0.34, lp);

        float nSample = noise3D(p * 2.0 + j * 13.0 + animTime * 1.5);
        float atten = max(log(max(distance(p, orig) - 1.8, 0.01)) + 0.75, 0.2);
        sum += abs(col) * 4.8 * (1.2 - nSample * 1.1) / atten * (1.0 + kick);
    }
    return sum;
}

// Sphere collision
vec2 iSphere2(in vec3 ro, in vec3 rd, in float rad) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - rad * rad;
    float h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    return vec2(-b - sqrt(h), -b + sqrt(h));
}

void main() {
    // Canonical preamble
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Strict boundary early exit
    float distToCenter = length(uv);
    if (distToCenter > 0.46) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Seamless loop phase
    float ph = fract(TIME / 12.0);
    float animTime = ph * TAU * turbRate;

    // Audio reactivity
    float bass = AUDIO_BASS;
    float mid = AUDIO_MID;
    float treble = AUDIO_TREBLE;
    float kick = AUDIO_KICK;
    float beat = AUDIO_BEAT;

    // Fixed camera distance: NO overall-size zooming/pulsing
    float camDist = 4.6;
    vec3 ro = CAM_DIR * camDist;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.25 * ww);

    // Analytic bounding sphere check: exit immediately for rays that miss
    float bSphereRad = 1.65;
    vec2 bSph = iSphere2(ro, rd, bSphereRad);
    if (bSph.y < 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    vec3 bro = ro;
    vec3 brd = rd;
    vec3 col = vec3(0.0);

    // Audio drives tendril ray count and reach length
    float activeRays = mix(4.0, float(MAX_RAYS), clamp(rayDensity + bass * 0.45 + kick * 0.25, 0.0, 1.0));
    float reach = mix(0.75, 1.20, clamp(reachDrive + mid * 0.35, 0.0, 1.0));

    // Multi-ray volumetric tendril marching (original visual algorithm)
    for (int j = 1; j <= MAX_RAYS; j++) {
        float fj = float(j);
        if (fj > activeRays + 0.5) continue;
        float rayWeight = clamp(activeRays - fj + 1.0, 0.0, 1.0);

        ro = bro;
        rd = brd;

        mat2 mm = mm2((animTime * 0.12 + (fj + 1.0) * 5.1) * fj * 0.25);
        ro.xy *= mm; rd.xy *= mm;
        ro.xz *= mm; rd.xz *= mm;

        float rz = march(ro, rd, max(bSph.x, 1.5), FAR, fj, animTime, reach);
        if (rz < FAR) {
            vec3 pos = ro + rz * rd;
            vec3 vcol = vmarch(pos, rd, fj, bro, animTime, reach, kick * 0.35);
            col = max(col, vcol * rayWeight);
        }
    }

    // Inner turbulent plasma core sphere reflection (original visual algorithm)
    ro = bro;
    rd = brd;
    float coreRad = 0.95;
    vec2 sph = iSphere2(ro, rd, coreRad);

    if (sph.x > 0.0) {
        vec3 pos = ro + rd * sph.x;
        vec3 pos2 = ro + rd * sph.y;
        vec3 rf = reflect(rd, pos);
        vec3 rf2 = reflect(rd, pos2);

        float nz  = max(-log(max(abs(flow(rf  * 1.2,  animTime) - 0.01), 0.001)), 0.0);
        float nz2 = max(-log(max(abs(flow(rf2 * 1.2, -animTime) - 0.01), 0.001)), 0.0);

        vec3 coreCol = (0.12 * nz * nz * vec3(0.12, 0.15, 0.75) +
                        0.07 * nz2 * nz2 * vec3(0.75, 0.20, 0.65)) * (0.8 + glowPower + beat * 0.3);
        col += coreCol;
    }

    // Radiance tuning
    col *= glowPower * 1.35;

    // Accurate alpha derivation from accumulated radiance
    float lum = dot(col, vec3(0.35, 0.55, 0.25));
    float alpha = clamp(lum * 1.25, 0.0, 1.0);

    // Frame boundary softness: smoothly reach zero at radius 0.44
    float edgeMask = 1.0 - smoothstep(0.38, 0.44, distToCenter);
    col *= edgeMask;
    alpha *= edgeMask;

    // Premultiplied alpha write
    gl_FragColor = vec4(col * alpha, alpha);
}
