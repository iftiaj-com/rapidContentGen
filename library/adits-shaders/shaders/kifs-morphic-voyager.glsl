/*{
  "ADITS": 1,
  "DESCRIPTION": "A morphing KIFS kaleidoscope traversing house, sailboat, starcraft, and orbital ring archetypes with neon filigree edges, diagonal blueprint hatching, and rapid transient-driven transformations.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["morph", "kifs", "generative", "fractal", "3d", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph",    "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.05, "MAX": 0.95,
      "LABEL": "Morph Balance", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "fold",     "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "KIFS Fold Shift", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "glow",     "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Filigree Glow", "BIND": "treble", "BIND_DEPTH": 0.50 },
    { "NAME": "tint",     "TYPE": "color", "DEFAULT": [0.10, 0.85, 0.95, 1.00],
      "LABEL": "Primary Glow" },
    { "NAME": "accent",   "TYPE": "color", "DEFAULT": [1.00, 0.35, 0.65, 1.00],
      "LABEL": "Accent Tint" }
  ]
}*/

#define MAX_STEPS 64
#define EPS 0.001
#define RENDER_DIST 5.0
#define AO_SAMPLES 4.0
#define AO_RANGE 80.0

#define PI 3.14159265359
#define TAU 6.28318530718
#define saturate(x) clamp(x, 0.0, 1.0)

// Global morph weights & precomputed KIFS parameters
float _house = 0.0;
float _boat = 0.0;
float _spaceship = 0.0;
float _atmosphere = 0.0;
mat3 _kifsRot = mat3(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
float _kifsOffset = 0.07;
float _timeVal = 0.0;

// Rotate 2D space with given angle
void tRotate(inout vec2 p, float angle) {
    float s = sin(angle), c = cos(angle);
    p = mat2(c, -s, s, c) * p;
}

// Divide 2D space into s chunks around the center
void tFan(inout vec2 p, float s) {
    float k = s / TAU;
    tRotate(p, -floor(atan(p.y, p.x) * k + 0.5) / k);
}

// Rectangle distance
float sdRect(vec2 p, vec2 r) {
    p = abs(p) - r;
    return min(max(p.x, p.y), 0.0) + length(max(p, 0.0));
}

// Box distance
float sdBox(vec3 p, vec3 r) {
    p = abs(p) - r;
    return min(max(p.x, max(p.y, p.z)), 0.0) + length(max(p, 0.0));
}

// Sphere distance
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

// 3D cross distance
float sdCross(vec3 p, vec3 r) {
    p = abs(p) - r;
    if (p.x < p.y) p.xy = p.yx;
    if (p.y < p.z) p.yz = p.zy;
    if (p.x < p.y) p.xy = p.yx;
    return length(min(p.yz, 0.0)) - max(p.y, 0.0);
}

// Boolean operations
float opU(float a, float b) {
    return min(a, b);
}

float opI(float a, float b) {
    return max(a, b);
}

float opS(float a, float b) {
    return max(a, -b);
}

float opSU(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Archetype 0: House distance
float sdHouse(vec3 p) {
    p.y += 0.075;
    vec3 boxDim = vec3(0.2, 0.15, 0.2);
    
    // Walls
    float d = sdBox(p, boxDim);
    
    // Windows
    vec3 q = abs(p);
    vec3 windSize = vec3(0.04, 0.04, 0.06);
    q -= windSize + vec3(0.005);
    d = opI(d, opU(sdCross(q, windSize), 0.11 - abs(p.y)));
    
    // Roof
    q = p;
    q.y -= 0.38;
    tFan(q.xz, 4.0);
    tRotate(q.xy, 0.78539816);
    d = opU(d, sdBox(q, vec3(0.35, 0.01, 0.35)));
    
    // Hollow interior
    d = opS(d, sdBox(p, boxDim - vec3(0.02)));
    return d;
}

// Archetype 1: Sailboat distance
float sdBoat(vec3 p) {
    // Mast
    float d = sdBox(p + vec3(0.0, 0.05, 0.0), vec3(0.01, 0.2, 0.01));
    
    // Sail
    vec3 q = p + vec3(0.0, -0.05, 0.12);
    float a = sdSphere(q, 0.2);
    a = opS(a, sdSphere(q, 0.195));
    q.x = abs(q.x);
    tRotate(q.yx, 0.1);
    a = opI(a, sdBox(q - vec3(0.0, 0.0, 0.1), vec3(0.1)));
    d = opU(d, a);
    
    // Hull
    p.x = abs(p.x);
    p.x += 0.1;
    a = sdSphere(p, 0.3);
    a = opS(a, sdSphere(p, 0.29));
    a = opI(a, p.y + 0.15);
    d = opU(d, a);
    return d;
}

// Archetype 2: Starcraft distance
float sdSpaceship(vec3 p) {
    tFan(p.xz, 6.0);
    p.x += 0.3;
    
    // Cap
    float d = sdSphere(p, 0.4);
    d = opS(d, p.y - 0.12);
    
    // Body
    d = opU(d, sdSphere(p, 0.39));
    
    // Stabilizer fins
    d = opU(d, opI(sdSphere(p + vec3(0.0, 0.24, 0.0), 0.41), sdRect(p.zx, vec2(0.005, 0.5))));
    d = opS(d, sdSphere(p + vec3(0.0, 0.3, 0.0), 0.37));
    d = opS(d, p.y + 0.25);
    return d;
}

// Archetype 3: Orbital halo ring atmosphere distance
float sdAtmosphere(vec3 p, float timeVal) {
    tRotate(p.yz, timeVal);
    vec3 q = p;
    tFan(q.xz, 12.0);
    float d = sdBox(q - vec3(0.3, 0.0, 0.0), vec3(0.01));
    tRotate(p.yx, timeVal);
    q = p;
    tFan(q.yz, 12.0);
    d = opU(d, sdBox(q - vec3(0.0, 0.23, 0.0), vec3(0.01)));
    tRotate(p.xz, timeVal);
    q = p;
    tFan(q.yx, 12.0);
    d = opU(d, sdBox(q - vec3(0.0, 0.16, 0.0), vec3(0.01)));
    return d;
}

// Scene Distance Estimator with smooth archetype blending and KIFS fractal folding
float map(vec3 p) {
    float d = 5.0;
    if (_house > 0.001) d = sdHouse(p) + 0.1 - _house * 0.1;
    if (_boat > 0.001) d = opU(d, sdBoat(p) + 0.1 - _boat * 0.1);
    if (_spaceship > 0.001) d = opU(d, sdSpaceship(p) + 0.1 - _spaceship * 0.1);
    if (_atmosphere > 0.001) d = opU(d, sdAtmosphere(p, _timeVal) + 0.1 - _atmosphere * 0.1);
    
    // Constant loop bound (4 iterations)
    float s = 1.0;
    for (int i = 0; i < 4; ++i) {
        tFan(p.xz, 10.0);
        p = abs(p);
        p -= _kifsOffset;
        p *= _kifsRot;
        s *= 2.0;
    }
    
    return opSU(d, sdBox(p * s, vec3(s / 17.0)) / s, 0.1);
}

// Raymarching trace function with maximum step budget of 64
float trace(vec3 ro, vec3 rd, float maxDist, out float steps, out float nt) {
    float total = 0.0;
    steps = 0.0;
    nt = 100.0;
    
    for (int i = 0; i < MAX_STEPS; ++i) {
        steps += 1.0;
        float d = map(ro + rd * total);
        nt = min(d, nt);
        total += d;
        if (d < EPS || maxDist < total) break;
    }
    
    return total;
}

// 4-tap tetrahedral normal computation
vec3 getNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(
        k.xyy * map(p + k.xyy * e) +
        k.yyx * map(p + k.yyx * e) +
        k.yxy * map(p + k.yxy * e) +
        k.xxx * map(p + k.xxx * e)
    );
}

// Ambient occlusion estimator
float calculateAO(vec3 p, vec3 n) {
    float r = 0.0, w = 1.0;
    for (int i = 1; i <= 4; i++) {
        float d = float(i) / (AO_SAMPLES * AO_RANGE);
        r += w * (d - map(p + n * d));
        w *= 0.5;
    }
    return 1.0 - saturate(r * AO_RANGE);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    
    // Bounded spatial mask keeping object comfortably inside visible frame
    float rad = length(uv);
    float boundMask = smoothstep(0.48, 0.38, rad);
    if (boundMask <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    // Deriving time phase from 16.0s loop
    float tPhase = fract(TIME / 16.0);
    _timeVal = tPhase * TAU;
    
    // Audio Spectral Balance and transient detection for fast, snappy morphing
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sumAudio = lo + md + hi + 0.001;
    float spectralTilt = (md * 0.5 + hi) / sumAudio;
    
    // Onset pulses shove selector onto distinct archetypes
    float onsetSnap = (AUDIO_HAT * 0.8 + AUDIO_SNARE * 0.4 - AUDIO_KICK * 1.1) * 0.35;
    
    // Idle progression smoothly cycles through archetypes in silence
    float idleSel = tPhase * 4.0;
    float liveGain = smoothstep(0.02, 0.15, lo + md + hi);
    float dynamicSel = spectralTilt * 3.2 + onsetSnap * 2.0;
    
    // Selector combining smooth flow with fast transients
    float sel = mix(idleSel + morph * 2.0, dynamicSel + morph * 2.0, liveGain);
    sel = mod(sel, 4.0);
    
    // Narrow bell-curve weights for clean archetype dominance
    float w0 = max(0.0, 1.0 - abs(sel - 0.0) * 1.4);
    if (sel > 2.2) w0 = max(w0, 1.0 - abs(sel - 4.0) * 1.4);
    float w1 = max(0.0, 1.0 - abs(sel - 1.0) * 1.4);
    float w2 = max(0.0, 1.0 - abs(sel - 2.0) * 1.4);
    float w3 = max(0.0, 1.0 - abs(sel - 3.0) * 1.4);
    
    w0 = smoothstep(0.0, 1.0, w0);
    w1 = smoothstep(0.0, 1.0, w1);
    w2 = smoothstep(0.0, 1.0, w2);
    w3 = smoothstep(0.0, 1.0, w3);
    
    float wSum = w0 + w1 + w2 + w3 + 0.0001;
    _house = w0 / wSum;
    _boat = w1 / wSum;
    _spaceship = w2 / wSum;
    _atmosphere = w3 / wSum;
    
    // KIFS rotation matrix animated with time and audio treble
    float a = -hi * 0.7 + sin(_timeVal * 0.8) * 0.25 + 0.9;
    float s = sin(a), c = cos(a);
    mat3 r1 = mat3(c, -s, 0.0,  s, c, 0.0,  0.0, 0.0, 1.0);
    mat3 r2 = mat3(1.0, 0.0, 0.0,  0.0, c, -s,  0.0, s, c);
    mat3 r3 = mat3(c, 0.0, s,  0.0, 1.0, 0.0,  -s, 0.0, c);
    _kifsRot = r1 * r2 * r3;
    
    // KIFS offset controlled by fold input and bass
    _kifsOffset = 0.06 + fold * 0.07 + lo * 0.04;
    
    // True 3D camera orientation following host CAM_DIR and CAM_UP
    float scale = 0.95 + lo * 0.12;
    const float ORBIT = 2.4;
    vec3 ro = CAM_DIR * (ORBIT / scale);
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.75 * ww);
    
    // Light is positioned relative to camera orbit
    vec3 light = ro + uu * -1.2 + vv * 0.8;
    
    // March scene
    float steps, outline, dist = trace(ro, rd, RENDER_DIST, steps, outline);
    
    // Hit point coordinates
    vec3 p = ro + rd * dist;
    
    // Surface normal & lighting vectors
    vec3 normal = getNormal(p);
    vec3 l = normalize(light - p);
    
    // Lighting components
    float ambient = 0.12;
    float diffuse = max(0.0, dot(l, normal));
    float specular = pow(max(0.0, dot(reflect(-l, normal), -rd)), 6.0);
    float ao = calculateAO(p, normal);
    
    // Geometric edge detection
    float edgeWidth = 0.002;
    float edge = smoothstep(0.9, 0.0, dot(normal, getNormal(p - normal * edgeWidth))) * step(length(p), 1.3);
    
    // Outline from closest distance
    outline = smoothstep(0.008, 0.0, outline) * step(0.85, length(p));
    
    // Diagonal holographic etched blueprint hatching
    vec2 strokes = sin(vec2(uv.x + uv.y, uv.x - uv.y) * 40.0 * PI) * 0.5 + 0.5;
    
    // Highlights from AO and marching density
    float highlights = (steps / float(MAX_STEPS) + sqrt(max(0.0, 1.0 - ao))) * step(length(p), 1.3) * 0.5;
    highlights = floor(highlights * 6.0) / 6.0;
    
    // Fog attenuation
    float fog = saturate(length(ro) - dist * dist * 0.22);
    float lightVal = (ambient + diffuse + specular) * fog;
    lightVal = floor(lightVal * 6.0) / 6.0;
    
    // Color synthesis from palette inputs and morph states
    vec3 archetypeCol = _house * vec3(1.0, 0.75, 0.3) +
                       _boat * vec3(0.2, 0.95, 0.8) +
                       _spaceship * vec3(0.9, 0.3, 0.95) +
                       _atmosphere * vec3(0.3, 0.6, 1.0);
    
    vec3 baseShade = mix(tint.rgb * 0.6, accent.rgb * 1.1, saturate(diffuse * 0.8 + specular * 1.2));
    baseShade += archetypeCol * 0.4;
    
    // Shading composition with strokes & filigree edge glow
    vec3 col = baseShade * (lightVal * 0.8 + highlights * 0.4) * (strokes.x * 0.35 + 0.65);
    col += (accent.rgb * 1.5 + vec3(0.9, 0.95, 1.0)) * (edge * 2.4 + outline * 1.8) * (glow * 1.2 + hi * 0.8);
    col += tint.rgb * (AUDIO_BEAT * 0.4 + AUDIO_KICK * 0.3) * fog;
    
    // Alpha calculation strictly against transparent black
    float alpha = saturate((diffuse * 0.75 + specular * 0.9 + edge * 1.4 + outline * 1.2 + highlights * 0.5) * fog);
    alpha *= boundMask;
    
    // Premultiplied alpha output
    col *= alpha;
    
    gl_FragColor = vec4(col, alpha);
}
