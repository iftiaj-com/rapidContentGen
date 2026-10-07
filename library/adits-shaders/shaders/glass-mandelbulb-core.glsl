/*{
  "ADITS": 1,
  "DESCRIPTION": "Solar supernova Mandelbulb crystal with fiery blood-orange magma mantle, white-hot central singularity, obsidian shadows, and golden coronal flame rims. Bass expands fractal power and thermonuclear radiance, mid twists solar flare orbital filaments, treble sharpens solar coronal rim glints, and beats trigger solar flare shockwaves.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "fractal", "solar", "fire", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "power", "TYPE": "float", "DEFAULT": 8.00, "MIN": 4.00, "MAX": 12.00,
      "LABEL": "Fractal Power", "BIND": "bass", "BIND_DEPTH": 0.35 },
    { "NAME": "twist", "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.20, "MAX": 2.50,
      "LABEL": "Solar Flare Twist", "BIND": "mid", "BIND_DEPTH": 0.45 },
    { "NAME": "coronalGleam", "TYPE": "float", "DEFAULT": 1.10, "MIN": 0.20, "MAX": 2.50,
      "LABEL": "Corona Gleam", "BIND": "treble", "BIND_DEPTH": 0.35 },
    { "NAME": "glow", "TYPE": "float", "DEFAULT": 1.40, "MIN": 0.50, "MAX": 3.00,
      "LABEL": "Solar Core Radiance", "BIND": "beat", "BIND_DEPTH": 0.40 }
  ]
}*/

#define TAU             6.28318530718
#define PERIOD          16.0

#define TOLERANCE       0.0008
#define MAX_RAY_LENGTH  9.0
#define MAX_RAY_MARCHES 56
#define NORM_OFF        0.008
#define MAX_BOUNCES     3
#define FRACTAL_LOOPS   4

const vec3 skyColTop  = vec3(1.6, 0.26, 0.02);
const vec3 skyColBot  = vec3(0.8, 0.07, 0.004);
const vec3 deepBase   = vec3(0.006, 0.001, 0.0002);
const vec3 lightPos   = vec3(2.5, 7.0, 3.5);
const float initt     = 0.04;

mat3 rot_y(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 rot_x(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
}

mat3 rot_z(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}

float box(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float rayPlane(vec3 ro, vec3 rd, vec4 p) {
    return -(dot(ro, p.xyz) + p.w) / max(abs(dot(rd, p.xyz)), 0.0001);
}

float mandelBulb(vec3 p, float t, float pwr, float tw) {
    vec3 z = p;
    float r = 0.0;
    float theta = 0.0;
    float phi = 0.0;
    float dr = 1.0;
    
    for (int i = 0; i < FRACTAL_LOOPS; ++i) {
        r = length(z);
        if (r > 2.0) break;
        theta = atan(z.y, z.x);
        phi = asin(clamp(z.z / max(r, 0.001), -1.0, 1.0)) + t * 0.20 * tw;
        
        dr = pow(r, pwr - 1.0) * dr * pwr + 1.0;
        r = pow(r, pwr);
        theta = theta * pwr;
        phi = phi * pwr;
        
        z = r * vec3(cos(theta) * cos(phi), sin(theta) * cos(phi), sin(phi)) + p;
    }
    return 0.5 * log(max(r, 1.0001)) * r / max(dr, 0.001);
}

float df(vec3 p, mat3 g_rot, float t, float pwr, float tw) {
    p = g_rot * p;
    const float z1 = 0.70;
    return mandelBulb(p / z1, t, pwr, tw) * z1;
}

vec3 calcNormal(vec3 pos, mat3 g_rot, float t, float pwr, float tw) {
    const vec2 k = vec2(1.0, -1.0);
    float e = NORM_OFF;
    return normalize(
        k.xyy * df(pos + k.xyy * e, g_rot, t, pwr, tw) +
        k.yyx * df(pos + k.yyx * e, g_rot, t, pwr, tw) +
        k.yxy * df(pos + k.yxy * e, g_rot, t, pwr, tw) +
        k.xxx * df(pos + k.xxx * e, g_rot, t, pwr, tw)
    );
}

float rayMarch(vec3 ro, vec3 rd, float dfactor, mat3 g_rot, float t, float pwr, float tw, out int iterCount) {
    float marchDist = 0.0;
    iterCount = MAX_RAY_MARCHES;
    for (int i = 0; i < MAX_RAY_MARCHES; ++i) {
        if (marchDist > MAX_RAY_LENGTH) {
            marchDist = MAX_RAY_LENGTH;
            break;
        }
        float d = dfactor * df(ro + rd * marchDist, g_rot, t, pwr, tw);
        if (d < TOLERANCE) {
            iterCount = i;
            break;
        }
        marchDist += d * 0.78;
    }
    return marchDist;
}

vec3 solarEnvironment(vec3 ro, vec3 rd) {
    vec3 col = vec3(0.006, 0.001, 0.0002);
    
    // Top softbox solar flare panel
    float tp0 = rayPlane(ro, rd, vec4(0.0, 1.0, 0.0, 4.5));
    if (tp0 > 0.0) {
        vec3 pos = ro + tp0 * rd;
        float db = box(pos.xz, vec2(5.0, 7.0)) - 1.0;
        col += skyColTop * 2.0 * smoothstep(0.3, 0.0, db);
        col += skyColTop * 0.5 * exp(-0.6 * max(db, 0.0));
    }
    
    // Bottom rim magma orange panel
    float tp1 = rayPlane(ro, rd, vec4(0.0, -1.0, 0.0, 5.0));
    if (tp1 > 0.0) {
        vec3 pos = ro + tp1 * rd;
        float db = box(pos.xz, vec2(6.0, 6.0)) - 1.0;
        col += skyColBot * 1.5 * smoothstep(0.3, 0.0, db);
        col += skyColBot * 0.4 * exp(-0.5 * max(db, 0.0));
    }
    
    return col;
}

vec4 renderSolarCrystal(vec3 ro, vec3 rd, mat3 g_rot, float t, float pwr, float tw, float gleam, float pulse) {
    vec3 agg = vec3(0.0);
    vec3 ragg = vec3(1.0);
    float totalAlpha = 0.0;
    
    bool isInside = df(ro, g_rot, t, pwr, tw) < 0.0;
    
    for (int bounce = 0; bounce < MAX_BOUNCES; ++bounce) {
        float dfactor = isInside ? -1.0 : 1.0;
        float mragg = max(max(ragg.x, ragg.y), ragg.z);
        if (mragg < 0.025) break;
        
        int iter;
        float st = rayMarch(ro, rd, dfactor, g_rot, t, pwr, tw, iter);
        
        if (st >= MAX_RAY_LENGTH) {
            if (bounce > 0) {
                agg += ragg * solarEnvironment(ro, rd);
            }
            break;
        }
        
        if (bounce == 0) {
            totalAlpha = 1.0;
        }
        
        vec3 sp = ro + rd * st;
        vec3 sn = dfactor * calcNormal(sp, g_rot, t, pwr, tw);
        
        // Ambient cavity occlusion (charred ember crevices)
        float iterFrac = float(iter) / float(MAX_RAY_MARCHES);
        float cavity = clamp(1.0 - iterFrac * 0.92, 0.03, 1.0);
        
        // Fresnel reflection
        float fre = clamp(1.0 + dot(rd, sn), 0.0, 1.0);
        float fresnel = mix(0.08, 1.0, fre * fre);
        
        vec3 ld = normalize(lightPos - sp);
        float dif = max(dot(ld, sn), 0.0);
        vec3 ref = reflect(rd, sn);
        float spec = pow(max(dot(ref, ld), 0.0), 36.0);
        
        // Refraction in volcanic glass
        float baseIOR = 1.16;
        vec3 refr = refract(rd, sn, !isInside ? baseIOR : 1.0 / baseIOR);
        if (refr == vec3(0.0)) refr = ref;
        
        vec3 envRef = solarEnvironment(sp, ref);
        
        vec3 col = vec3(0.0);
        
        // Blood orange/crimson smoked glass base body
        vec3 magmaMantle = vec3(0.42, 0.045, 0.006);
        col += mix(deepBase, magmaMantle, dif * 0.75) * cavity;
        
        // Fiery solar coronal rim reflections and golden glints
        vec3 coronalRim = mix(vec3(1.8, 0.22, 0.01), vec3(3.0, 0.85, 0.05), fre);
        col += (envRef * 0.55 + coronalRim * 0.40 * gleam) * fresnel + vec3(1.0, 0.75, 0.3) * spec * 1.1;
        
        // Multi-layer Supernova Core
        if (isInside) {
            float dist = length(sp);
            
            // 1. Pinpoint white-hot central stellar singularity
            vec3 singularity = vec3(7.0, 6.5, 5.5) * exp(-dist * 20.0);
            
            // 2. Solar gold thermonuclear plasma
            vec3 goldCorona = vec3(2.8, 0.85, 0.04) * exp(-dist * 4.8);
            
            // 3. Blood orange fiery mantle
            vec3 orangeMantle = vec3(2.2, 0.22, 0.01) * exp(-dist * 2.0);
            
            vec3 coreCol = singularity + goldCorona + orangeMantle;
            vec3 causticFlare = coreCol * glow * (0.8 + 0.8 * pulse);
            
            agg += ragg * causticFlare * 0.85;
            
            // Heavy absorption in volcanic glass (absorbs blue/green strongly)
            ragg *= exp(-(st + initt) * vec3(0.7, 2.0, 4.5));
        }
        
        agg += ragg * col * cavity;
        
        if (refr == ref) {
            rd = ref;
        } else {
            ragg *= 0.74;
            isInside = !isInside;
            rd = refr;
        }
        
        ro = sp + initt * rd;
    }
    
    return vec4(agg, totalAlpha);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    
    // Exact loop period: all continuous phases wrap seamlessly at PERIOD.
    float ph = fract(TIME / PERIOD);
    float t = TAU * ph;
    
    float pulse = AUDIO_BEAT * 0.8 + AUDIO_KICK * 0.6;
    
    mat3 g_rot = rot_x(t * 0.18 + 0.1) * rot_y(t * 0.28) * rot_z(sin(t * 0.5) * 0.08);
    
    const float ORBIT = 3.8;
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    
    const float fov = 1.8;
    vec3 rd = normalize(uv.x * uu + uv.y * vv + fov * ww);
    
    vec4 result = renderSolarCrystal(ro, rd, g_rot, t, power, twist, coronalGleam, pulse);
    
    // ACES cinematic tonemapping
    vec3 col = max(result.rgb, vec3(0.0)) * 0.65;
    col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
    
    // sRGB gamma
    col = mix(1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, 12.92 * col, step(col, vec3(0.0031308)));
    
    // Smooth frame border fade to guarantee edge = 0
    float edgeFade = smoothstep(0.48, 0.40, length(uv));
    float alpha = clamp(result.a * edgeFade, 0.0, 1.0);
    
    col *= edgeFade;
    col *= alpha;
    
    gl_FragColor = vec4(col, alpha);
}
