/*{
  "ADITS": 1,
  "DESCRIPTION": "A holographic brass astrolabe that morphs between rings, a star core, and a spindle.",
  "CREDIT": "gemini-3.1-pro",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "holo", "morph", "brass", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    {
      "NAME": "glow_intensity",
      "TYPE": "float",
      "DEFAULT": 0.5,
      "MIN": 0.1,
      "MAX": 1.0,
      "LABEL": "Glow",
      "BIND": "bass",
      "BIND_DEPTH": 0.5
    },
    {
      "NAME": "expansion",
      "TYPE": "float",
      "DEFAULT": 0.02,
      "MIN": 0.0,
      "MAX": 0.1,
      "LABEL": "Expansion",
      "BIND": "mid",
      "BIND_DEPTH": 1.0
    },
    {
      "NAME": "detail",
      "TYPE": "float",
      "DEFAULT": 0.6,
      "MIN": 0.2,
      "MAX": 1.0,
      "LABEL": "Detail",
      "BIND": "treble",
      "BIND_DEPTH": 0.4
    }
  ]
}*/

#define PERIOD 20.0
#define PI 3.14159265359

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

float sdCylinder(vec3 p, vec3 c) {
    return length(p.xz - c.xy) - c.z;
}

float mapArchetype1(vec3 p, float ph) {
    // Rings
    p.xy *= rot(ph * PI * 2.0);
    p.xz *= rot(ph * PI * 4.0);
    float d = sdTorus(p, vec2(0.25 + expansion, 0.015));
    d = min(d, sdTorus(p.zyx, vec2(0.18 + expansion*0.5, 0.015)));
    d = min(d, sdTorus(p.xzy, vec2(0.1, 0.015)));
    return d;
}

float mapArchetype2(vec3 p, float ph) {
    // Star core
    p.yz *= rot(ph * PI * 2.0);
    p.xz *= rot(ph * PI * 2.0);
    float d = sdOctahedron(p, 0.2 + expansion);
    // Add some spikes
    p.xy *= rot(PI / 4.0);
    d = min(d, sdOctahedron(p, 0.2 + expansion));
    return d;
}

float mapArchetype3(vec3 p, float ph) {
    // Spindle
    p.xz *= rot(ph * PI * 2.0);
    float d = sdCylinder(p, vec3(0.0, 0.0, 0.03 + expansion*0.2));
    // add horizontal discs
    p.y = mod(p.y + 0.08, 0.16) - 0.08;
    d = min(d, sdTorus(p, vec2(0.12 + expansion, 0.015)));
    return d;
}

// Global morph selector
float getSelector() {
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    // Stretch to 0-2 range for 3 archetypes
    return clamp(tilt * 2.0, 0.0, 2.0);
}

float map(vec3 p) {
    float ph = fract(TIME / PERIOD);
    float d1 = mapArchetype1(p, ph);
    float d2 = mapArchetype2(p, ph);
    float d3 = mapArchetype3(p, ph);
    
    float sel = getSelector();
    float w1 = max(0.0, 1.0 - abs(sel - 0.0));
    float w2 = max(0.0, 1.0 - abs(sel - 1.0));
    float w3 = max(0.0, 1.0 - abs(sel - 2.0));
    
    // Normalize weights
    float sum = w1 + w2 + w3 + 1e-5;
    w1 /= sum; w2 /= sum; w3 /= sum;
    
    return d1 * w1 + d2 * w2 + d3 * w3;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.0012;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    
    // Bounding circle
    float distToCenter = length(uv);
    if (distToCenter > 0.5) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    // Camera
    const float ORBIT = 1.0;
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.6 * ww);
    
    // Raymarch
    float t = 0.0;
    float d = 0.0;
    float minD = 100.0;
    for(int i = 0; i < 64; i++) {
        vec3 p = ro + rd * t;
        d = map(p);
        minD = min(minD, d);
        if(d < 0.001 || t > 2.5) break;
        t += d;
    }
    
    vec3 col = vec3(0.0);
    float alpha = 0.0;
    
    // Snaps on beats
    float flash = max(AUDIO_BEAT, AUDIO_KICK) * 0.5;
    
    if(d < 0.001) {
        vec3 p = ro + rd * t;
        vec3 n = calcNormal(p);
        
        // Holographic viewing angle (Fresnel)
        float fresnel = 1.0 - max(0.0, dot(ww, n));
        
        float sel = getSelector();
        vec3 col1 = vec3(0.8, 0.5, 0.1); // Darker Brass
        vec3 col2 = vec3(0.1, 0.7, 0.9); // Holo blue
        vec3 col3 = vec3(0.8, 0.1, 0.6); // Holo pink
        
        float w1 = max(0.0, 1.0 - abs(sel - 0.0));
        float w2 = max(0.0, 1.0 - abs(sel - 1.0));
        float w3 = max(0.0, 1.0 - abs(sel - 2.0));
        float sum = w1 + w2 + w3 + 1e-5;
        w1 /= sum; w2 /= sum; w3 /= sum;
        
        vec3 baseColor = col1 * w1 + col2 * w2 + col3 * w3;
        
        // Iridescence based on position and normal. Whole cycles per loop so the
        // 20 s seam is clean: 6 cycles is about the 2 rad/s it used to run at.
        float ph = fract(TIME / PERIOD);
        vec3 iridescent = 0.5 + 0.5 * cos(ph * 2.0 * PI * 6.0 + p.yxy * 10.0 + vec3(0,2,4));
        
        // Combine base color with iridescence for holographic feel
        vec3 matCol = mix(baseColor, iridescent, fresnel * detail);
        
        // Specular lighting for brass
        vec3 l = normalize(vec3(1.0, 2.0, -1.0));
        vec3 h = normalize(l + ww);
        float spec = pow(max(0.0, dot(n, h)), 32.0);
        float diff = max(0.0, dot(n, l));
        
        col = matCol * (diff * 0.5 + 0.2) + spec * 0.8 * baseColor;
        
        // Scanline/Holo effect
        float scanline = sin(p.y * 50.0 - ph * 2.0 * PI * 16.0) * 0.5 + 0.5;
        col += scanline * fresnel * 0.3 * detail;
        
        col += flash * iridescent;
        
        // Tame the alpha to allow some transparency, characteristic of holo
        alpha = mix(0.9, 0.5, fresnel);
    }
    
    // Glow based on minD, but only outside the object
    float glow = exp(-minD * 40.0) * glow_intensity;
    // Tame the glow color so it doesn't wash out everything to white
    vec3 glowCol = vec3(0.6, 0.3, 0.1) * (1.0 - getSelector()) + vec3(0.1, 0.4, 0.6) * getSelector();
    col += glowCol * glow * 0.5;
    alpha += glow * 0.4;
    
    // Fade out alpha smoothly near edge
    float mask = smoothstep(0.48, 0.40, distToCenter);
    alpha *= mask;
    col *= mask; // Premultiply
    
    alpha = clamp(alpha, 0.0, 1.0);
    
    gl_FragColor = vec4(col, alpha);
}
