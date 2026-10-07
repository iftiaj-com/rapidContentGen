/*{
  "ADITS": 1,
  "DESCRIPTION": "A pulsating KIFS fractal lattice resonator with orbiting reflective tendrils, geometric nodes, and harmonic light cores that respond dynamically to audio transients.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "fractal", "kifs", "3d", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Fractal Morph", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "swell", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.60, "MAX": 1.15,
      "LABEL": "Core Swell", "BIND": "bass", "BIND_DEPTH": 0.35 },
    { "NAME": "glow",  "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Emission Glow", "BIND": "treble", "BIND_DEPTH": 0.50 },
    { "NAME": "tint",  "TYPE": "color", "DEFAULT": [0.95, 0.30, 0.40, 1.00],
      "LABEL": "Core Tint" }
  ]
}*/

#define TAU 6.28318530718

vec3 g_objcol;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

mat2 rot2(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, s, -s, c);
}

float de(vec3 pos, float timeVal, float morphVal, float audioKick) {
    float t = mod(timeVal, 16.0);
    float a = (smoothstep(12.0, 14.0, t) * 6.0 - smoothstep(4.0, 0.0, t) * 3.0) + morphVal * 1.5;
    float f = sin(timeVal * 3.0 + sin(timeVal * 12.0) * 0.2) + audioKick * 0.8;
    
    pos.xz *= rot2(timeVal * 0.4 + 0.5);
    pos.yz *= rot2(timeVal * 0.3);
    
    vec3 p = pos;
    float s = 1.0;
    for (int i = 0; i < 4; i++) {
        p = abs(p) * 1.3 - 0.5 - f * 0.1 - a * 0.2;
        p.xy *= rot2(0.785398);
        p.xz *= rot2(0.785398);
        s *= 1.3;
    }
    float fra = length(p) / s - 0.4;
    
    pos.xy *= rot2(timeVal * 0.35);
    p = abs(pos) - 2.0 - a * 0.25;
    float d = length(p) - 0.7;
    d = min(d, max(length(p.xz) - 0.1, p.y));
    d = min(d, max(length(p.yz) - 0.1, p.x));
    d = min(d, max(length(p.xy) - 0.1, p.z));
    
    p = abs(pos);
    p.x -= 3.5 + a * 0.25 + f * 0.4;
    d = min(d, length(p) - 0.7);
    d = min(d, length(p.yz - abs(sin(p.x * 0.5 - timeVal * 6.0) * 0.3)));
    
    p = abs(pos);
    p.y -= 3.5 + a * 0.25 + f * 0.4;
    d = min(d, length(p) - 0.7);
    d = min(d, max(length(p.xz) - 0.1, p.y));
    d = min(d, fra);
    
    vec3 baseColor = abs(p) * 0.25 + vec3(0.15, 0.25, 0.45);
    if (d == fra) {
        baseColor = tint.rgb * 1.8 + vec3(0.2, 0.1, 0.05) * f;
    }
    g_objcol = baseColor;
    return d;
}

vec3 calcNormal(vec3 p, float timeVal, float morphVal, float audioKick) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.006;
    return normalize(
        k.xyy * de(p + k.xyy * e, timeVal, morphVal, audioKick) +
        k.yyx * de(p + k.yyx * e, timeVal, morphVal, audioKick) +
        k.yxy * de(p + k.yxy * e, timeVal, morphVal, audioKick) +
        k.xxx * de(p + k.xxx * e, timeVal, morphVal, audioKick)
    );
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    
    float rad = length(uv);
    float boundMask = smoothstep(0.48, 0.36, rad);
    if (boundMask <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    float timeVal = TIME * (TAU / 16.0);
    float kickVal = AUDIO_KICK + AUDIO_BEAT * 0.5;
    float morphVal = morph + AUDIO_MID * 0.4;
    float scaleFactor = max(0.5, swell * (0.90 + 0.12 * AUDIO_BASS));
    
    const float ORBIT = 14.5;
    vec3 ro = CAM_DIR * (ORBIT / scaleFactor);
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.25 * ww);
    
    vec3 p = ro;
    vec3 col = vec3(0.0);
    float td = 0.0;
    const float maxdist = 30.0;
    float alphaAcc = 0.0;
    
    float noise = hash12(gl_FragCoord.xy + fract(TIME)) * 0.15;
    
    for (int i = 0; i < 64; i++) {
        float d = de(p, timeVal, morphVal, kickVal);
        float d_jitter = d * (1.0 - noise);
        
        if (d_jitter < 0.001) {
            vec3 n = calcNormal(p, timeVal, morphVal, kickVal);
            rd = reflect(rd, n);
            d = 0.08;
            alphaAcc += 0.05;
        }
        
        float stepSize = max(0.015, abs(d));
        p += stepSize * rd;
        td += stepSize;
        
        if (td > maxdist) break;
        
        if (d < 0.6) {
            float atten = 1.0 / (1.0 + stepSize * stepSize * 5.0);
            col += 0.012 * g_objcol * atten * (glow * 1.5 + kickVal * 0.4);
            alphaAcc += 0.014 * atten;
        }
    }
    
    col = pow(col, vec3(1.6)) * 2.2;
    
    float alpha = clamp(alphaAcc * 1.3 + length(col) * 0.65, 0.0, 1.0);
    alpha *= boundMask;
    col *= alpha;
    
    gl_FragColor = vec4(col, alpha);
}
