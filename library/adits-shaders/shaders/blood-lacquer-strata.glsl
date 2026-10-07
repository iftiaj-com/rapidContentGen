/*{
  "ADITS": 1,
  "DESCRIPTION": "A glossy orb encased in sculpted blood-red lacquer flanges and obsidian disc strata, rippling with studio reflections and natural precession. Motion derives from its rhythmic undulating displacement.",
  "CREDIT": "gemini-3.7-flash",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "3d", "raymarching", "audio", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "ripple",   "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Flange Ripple", "BIND": "mid", "BIND_DEPTH": 0.40 },
    { "NAME": "sheen",    "TYPE": "float", "DEFAULT": 0.75, "MIN": 0.20, "MAX": 1.20,
      "LABEL": "Lacquer Sheen", "BIND": "treble", "BIND_DEPTH": 0.35 },
    { "NAME": "scale",    "TYPE": "float", "DEFAULT": 0.88, "MIN": 0.70, "MAX": 1.05,
      "LABEL": "Core Swell", "BIND": "bass", "BIND_DEPTH": 0.25 },
    { "NAME": "discs",    "TYPE": "float", "DEFAULT": 9.0,  "MIN": 5.0,  "MAX": 15.0,
      "LABEL": "Disc Count" }
  ]
}*/

#define TAU 6.28318530718
#define MARCH_STEPS 64

// Procedural studio HDRI reflection environment
vec3 studioEnv(vec3 dir) {
    float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(vec3(0.08, 0.04, 0.05), vec3(0.38, 0.24, 0.26), up);
    vec3 ground = mix(vec3(0.02, 0.01, 0.01), vec3(0.09, 0.04, 0.05), 1.0 - up);
    
    // Vertical studio strip softboxes (creates the sleek vertical reflections in the reference)
    vec3 light1 = normalize(vec3(0.5, 0.6, 0.6));
    float strip1 = pow(max(dot(dir, light1), 0.0), 20.0) * 2.5;
    
    vec3 light2 = normalize(vec3(-0.6, 0.3, -0.7));
    float strip2 = pow(max(dot(dir, light2), 0.0), 12.0) * 1.5;

    vec3 light3 = normalize(vec3(0.0, 0.9, 0.2));
    float topRim = pow(max(dot(dir, light3), 0.0), 16.0) * 1.8;

    return sky + ground + vec3(1.0, 0.96, 0.92) * strip1 + vec3(0.95, 0.45, 0.35) * strip2 + vec3(1.0, 0.88, 0.82) * topRim;
}

// Global uniform values for SDF evaluation
float g_phase;
float g_ripple;
float g_discs;
float g_beat;

// Signed distance field of the sculpted disc-flanged sphere
float map(vec3 p) {
    float r = length(p);
    
    // Analytic bounding sphere check
    if (r > 1.25) {
        return r - 1.05;
    }

    // Natural undulating precession
    float t = g_phase * TAU;
    float cRot = cos(t * 0.25);
    float sRot = sin(t * 0.25);
    vec3 tp = p;
    tp.xz = mat2(cRot, -sRot, sRot, cRot) * tp.xz;
    tp.xy = mat2(cos(0.25), -sin(0.25), sin(0.25), cos(0.25)) * tp.xy;

    float x = tp.x;
    float radYZ = length(tp.yz);
    float angYZ = atan(tp.z, tp.y);

    // Natural breathing wave ripple across disc edges
    float wave = sin(angYZ * 4.0 + x * 6.0 + t) * 0.028 * (1.0 + g_ripple)
               + cos(angYZ * 2.0 - t * 1.5) * 0.018;

    // Disc strata envelope: largest in center, tapering to outer edges
    float centerProfile = exp(-x * x * 6.5);
    float baseSphereR = sqrt(max(0.60 * 0.60 - x * x, 0.0));
    
    // Distinct flange ribs
    float ribFreq = g_discs * 2.4;
    float ribCos = cos(x * ribFreq);
    float ribHeight = smoothstep(-0.25, 0.85, ribCos) * (0.22 + 0.16 * centerProfile) * (1.0 + 0.25 * g_beat);

    float targetR = baseSphereR + ribHeight + wave;
    float dFlange = radYZ - targetR;

    // Cap at ends
    float dCap = abs(x) - 0.60;
    float d = max(dFlange, dCap);

    // Inner core sphere blend
    float dCore = r - (0.55 + 0.025 * sin(t * 2.0));
    d = min(d, dCore);

    return d * 0.65;
}

// 4-tap tetrahedral normal (§9)
vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0025;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

// Ambient occlusion in recessed disc grooves
float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 4; i++) {
        float hr = 0.025 + 0.09 * float(i) / 3.0;
        vec3 aopos = nor * hr + pos;
        float dd = map(aopos);
        occ += -(dd - hr) * sca;
        sca *= 0.85;
    }
    return clamp(1.0 - 2.8 * occ, 0.0, 1.0);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float distOrigin = length(uv);

    // Loop-synchronous phase
    g_phase = fract(TIME / 16.0);
    g_beat = AUDIO_BEAT;
    g_ripple = ripple + 0.30 * AUDIO_MID;
    g_discs = discs;

    // Camera setup driven by CAM_DIR and CAM_UP (§5 & §10)
    float effectiveScale = scale * (1.0 + 0.03 * sin(g_phase * TAU * 2.0) + 0.05 * AUDIO_BASS);
    const float ORBIT = 4.6;
    vec3 ro = CAM_DIR * (ORBIT / effectiveScale);
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.85 * ww);

    // Analytic bounding sphere test
    float b = dot(ro, rd);
    float c = dot(ro, ro) - 1.45;
    float h = b * b - c;

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (h > 0.0) {
        float tmin = max(-b - sqrt(h), 0.1);
        float tmax = -b + sqrt(h);
        float t = tmin;
        float hitDist = -1.0;

        for (int i = 0; i < MARCH_STEPS; i++) {
            vec3 p = ro + rd * t;
            float d = map(p);
            if (d < 0.0012) {
                hitDist = t;
                break;
            }
            if (t > tmax) break;
            t += d;
        }

        if (hitDist > 0.0) {
            vec3 p = ro + rd * hitDist;
            vec3 nor = calcNormal(p);
            vec3 ref = reflect(rd, nor);
            float ao = calcAO(p, nor);

            // Transformed local space for material zoning
            float tRot = g_phase * TAU * 0.25;
            vec3 tp = p;
            tp.xz = mat2(cos(tRot), -sin(tRot), sin(tRot), cos(tRot)) * tp.xz;
            tp.xy = mat2(cos(0.25), -sin(0.25), sin(0.25), cos(0.25)) * tp.xy;

            float x = tp.x;
            float centerWeight = exp(-x * x * 7.5);
            float ribPhase = cos(x * g_discs * 2.4);

            // Blood-red lacquer palette
            vec3 deepCrimson = vec3(0.42, 0.02, 0.03);
            vec3 bloodRed    = vec3(0.95, 0.05, 0.07);
            vec3 rubyGlow    = vec3(1.00, 0.18, 0.14);
            vec3 obsidian    = vec3(0.025, 0.018, 0.025);
            vec3 copperSheen = vec3(0.70, 0.24, 0.16);
            vec3 platinumGlint = vec3(0.98, 0.97, 0.95);

            // Prominent central disc gets rich, deep blood-red carmine lacquer
            vec3 baseColor = mix(deepCrimson, bloodRed, centerWeight);
            baseColor = mix(baseColor, rubyGlow, smoothstep(0.3, 0.85, ribPhase) * centerWeight * 0.6);

            // Deep obsidian / midnight lacquer in the grooves and outer rings
            float grooveMask = smoothstep(0.25, -0.35, ribPhase);
            baseColor = mix(baseColor, obsidian, grooveMask * 0.88);
            baseColor = mix(baseColor, mix(obsidian, copperSheen, 0.45), (1.0 - centerWeight) * 0.65);

            // Studio lighting setup
            vec3 keyLig = normalize(vec3(0.5, 0.7, 0.6));
            vec3 rimLig = normalize(vec3(-0.6, 0.4, -0.5));
            vec3 fillLig = normalize(vec3(0.0, -0.8, -0.3));

            float difKey = max(dot(nor, keyLig), 0.0);
            float difRim = max(dot(nor, rimLig), 0.0);
            float difFill = max(dot(nor, fillLig), 0.0);
            float fre = pow(clamp(1.0 + dot(rd, nor), 0.0, 1.0), 3.2);

            // Studio specular highlights & reflections
            vec3 env = studioEnv(ref);
            float speKey = pow(max(dot(ref, keyLig), 0.0), 36.0);
            float speRim = pow(max(dot(ref, rimLig), 0.0), 24.0);

            vec3 diffuse = (difKey * vec3(1.0, 0.92, 0.88) + difRim * vec3(0.85, 0.35, 0.25) + difFill * vec3(0.2, 0.1, 0.15)) * baseColor;
            vec3 specular = (platinumGlint * speKey * 2.2 + copperSheen * speRim * 1.5 + env * (0.8 + 0.3 * fre)) * sheen;

            col = (diffuse + specular * (0.35 + 0.65 * fre)) * ao;

            // Translucent blood-red subsurface transmission along thin disc rims
            float sss = pow(clamp(dot(rd, -keyLig), 0.0, 1.0), 3.5) * smoothstep(0.2, 0.8, ribPhase);
            col += bloodRed * sss * 0.45;

            // Audio kick specular flash
            col += platinumGlint * pow(fre, 2.5) * AUDIO_KICK * 0.50;

            alpha = 1.0;
        }
    }

    // Strict boundary enforcement (§10): strictly 0 before frame edge at 0.5
    float spatialBound = smoothstep(0.46, 0.38, distOrigin);
    alpha *= spatialBound;
    col *= spatialBound;

    // Premultiplied alpha output (§8)
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
