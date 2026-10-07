/*{
  "ADITS": 1,
  "DESCRIPTION": "Silky volumetric vortex ribbon core driven by dual spherical space-inversions and domain-twisted turbulence. Bass expands the inversion core, mid accelerates the vortex twists, treble sharpens filament ridges, and beats pulse core radiance.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "volumetric", "fractal", "audio", "plasma"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "density", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.20, "MAX": 0.90,
      "LABEL": "Inversion Spread", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "twist", "TYPE": "float", "DEFAULT": 2.50, "MIN": 1.00, "MAX": 4.50,
      "LABEL": "Vortex Twist", "BIND": "mid", "BIND_DEPTH": 0.45 },
    { "NAME": "detail", "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.50, "MAX": 2.00,
      "LABEL": "Filament Detail", "BIND": "treble", "BIND_DEPTH": 0.50 },
    { "NAME": "brightness", "TYPE": "float", "DEFAULT": 1.80, "MIN": 0.80, "MAX": 3.00,
      "LABEL": "Core Brightness", "BIND": "beat", "BIND_DEPTH": 0.35 }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 16.0
#define STEPS 64
#define ALPHA_WEIGHT 0.015
#define BASE_STEP 0.025

vec2 rot(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise2D(vec2 p) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    fp = fp * fp * (3.0 - 2.0 * fp);
    float a = hash(ip);
    float b = hash(ip + vec2(1.0, 0.0));
    float c = hash(ip + vec2(0.0, 1.0));
    float d = hash(ip + vec2(1.0, 1.0));
    return mix(mix(a, b, fp.x), mix(c, d, fp.x), fp.y);
}

float noise(vec3 p) {
    vec3 ip = floor(p);
    vec3 fp = fract(p);
    fp = fp * fp * (3.0 - 2.0 * fp);
    vec2 tap = (ip.xy + vec2(37.0, 17.0) * ip.z) + fp.xy;
    float cl_x = noise2D(tap);
    float cl_y = noise2D(tap + vec2(113.0, 7.0));
    return mix(cl_x, cl_y, fp.z);
}

float fbm(vec3 p, float t) {
    p *= 3.5;
    float rz = 0.0;
    float z = 1.0;
    for (int i = 0; i < 4; i++) {
        float n = noise(p - vec3(t * 0.6));
        rz += (sin(n * 4.4) - 0.45) * z;
        z *= 0.47;
        p *= 3.5;
    }
    return rz;
}

vec4 map(vec3 p, float t, float audioSwell) {
    float dtp = dot(p, p);
    p = 0.5 * p / (dtp + 0.2);
    p.xz = rot(p.xz, p.y * twist);
    p.xy = rot(p.xz, p.y * 2.0);
    
    float dtp2 = dot(p, p);
    float morphY = 1.0 + (density - 0.55) * 0.8 + 0.3 * audioSwell;
    p = (morphY + 0.6) * 3.0 * p / (dtp2 - 5.0);
    
    float breathe = sin(t * 2.0) * 0.15;
    float r = clamp(fbm(p * detail, t) * 1.5 - dtp * (0.35 - breathe), 0.0, 1.0);
    vec4 col = vec4(0.5, 1.7, 0.5, 0.96) * r;
    
    float grd1 = clamp((dtp + 0.7) * 0.4, 0.0, 1.0);
    col.b += grd1 * 0.65;
    col.r += (0.24 - grd1 * 0.32);
    
    vec3 lv = mix(p, vec3(0.3), 2.0);
    float grd2 = clamp((col.w - fbm(p + lv * 0.05, t)) * 2.0, 0.01, 1.5);
    vec3 tint = vec3(0.5, 0.4, 0.6) * grd2 + vec3(3.4, 0.05, 0.55);
    col.rgb = max(col.rgb * tint, vec3(0.0));
    col.a *= clamp(dtp * 2.0 - 1.0, 0.0, 1.0) * 0.07 + 0.87;
    
    return col;
}

vec4 vmarch(vec3 ro, vec3 rd, float t, float audioSwell, vec2 fragCoord) {
    vec4 rz = vec4(0.0);
    float tMarch = 2.5;
    tMarch += 0.03 * hash21(fragCoord);
    
    for (int i = 0; i < STEPS; i++) {
        if (rz.a > 0.99 || tMarch > 6.0) break;
        vec3 pos = ro + tMarch * rd;
        vec4 col = map(pos, t, audioSwell);
        float den = col.a;
        col.a *= ALPHA_WEIGHT;
        col.rgb *= col.a * brightness;
        rz += col * (1.0 - rz.a);
        tMarch += BASE_STEP - den * (BASE_STEP - BASE_STEP * 0.015);
    }
    return rz;
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    
    // Scale coordinates to match original framing
    vec2 p = uv * 2.0;
    
    // Exact loop period: all continuous phases wrap seamlessly at PERIOD.
    float ph = fract(TIME / PERIOD);
    float t = TAU * ph;
    
    float audioSwell = AUDIO_BASS * 0.6 + AUDIO_BEAT * 0.4;
    
    const float ORBIT = 4.0;
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    
    float focalLen = 3.3 - sin(t * 2.0) * 0.7;
    vec3 rd = normalize(p.x * uu + p.y * vv + focalLen * ww);
    
    vec4 col = clamp(vmarch(ro, rd, t, audioSwell, gl_FragCoord.xy), 0.0, 1.0);
    
    // Original tonemapping
    col.rgb = pow(col.rgb, vec3(0.9));
    
    // Smooth frame border fade to guarantee edge = 0
    float edgeFade = smoothstep(0.48, 0.42, length(uv));
    float alpha = clamp(col.a * edgeFade, 0.0, 1.0);
    
    vec3 rgb = col.rgb * edgeFade;
    rgb *= alpha;
    
    gl_FragColor = vec4(rgb, alpha);
}
