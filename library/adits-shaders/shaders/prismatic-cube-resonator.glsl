/*{
  "ADITS": 1,
  "DESCRIPTION": "A cube armature of chrome spheres and glowing edge beams that morphs through its spectral identity: heavy copper orb-lattice at bass, a folded prismatic organ in the mids, and a 24-spike iridescent nova at treble. At silence it rests on the cube lattice.",
  "CREDIT": "claude-sonnet-4-6",
  "DATE": "2026-08-23",
  "CATEGORIES": ["generative", "morph", "geometric", "audio", "3d"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.05, "MAX": 1.00,
      "LABEL": "Onset Snap" },
    { "NAME": "bias",  "TYPE": "float", "DEFAULT": 0.08, "MIN": 0.01, "MAX": 1.00,
      "LABEL": "Silence Archetype" },
    { "NAME": "swell", "TYPE": "float", "DEFAULT": 0.90, "MIN": 0.70, "MAX": 1.10,
      "LABEL": "Overall Scale", "BIND": "bass", "BIND_DEPTH": 0.25 },
    { "NAME": "lume",  "TYPE": "float", "DEFAULT": 0.60, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Emissive Level", "BIND": "level", "BIND_DEPTH": 0.50 }
  ]
}*/

#define TAU 6.28318530718

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

float ease3(float w) {
    return w * w * (3.0 - 2.0 * w);
}

mat2 rot2(float ang) {
    float c = cos(ang), s = sin(ang);
    return mat2(c, -s, s, c);
}

float segDist(vec2 uv, vec2 va, vec2 vb) {
    vec2 ab = vb - va;
    float t = clamp(dot(uv - va, ab) / (dot(ab, ab) + 1e-6), 0.0, 1.0);
    return length(uv - (va + ab * t));
}

float beamGlow(vec2 uv, vec2 va, vec2 vb, float bw) {
    float d = segDist(uv, va, vb);
    return (1.0 - smoothstep(bw * 0.6, bw * 1.4, d)) * 0.7
         + 0.0002 / (d * d + 0.0003) * smoothstep(0.40, 0.04, d) * 0.5;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    float ph   = fract(TIME / 24.0);
    float turn = ph * TAU;
    float ramp = ph * 2.0;

    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);

    float lively = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(bias, sel, lively);

    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    float xw = sel * 2.0;
    float w0 = ease3(clamp(1.0 - abs(xw)       * 1.72, 0.0, 1.0));
    float w1 = ease3(clamp(1.0 - abs(xw - 1.0) * 1.72, 0.0, 1.0));
    float w2 = ease3(clamp(1.0 - abs(xw - 2.0) * 1.72, 0.0, 1.0));
    float wsum = w0 + w1 + w2 + 1e-4;
    w0 /= wsum; w1 /= wsum; w2 /= wsum;

    float sc    = swell * (1.0 + 0.025 * sin(turn * 2.0));
    float reach = mix(0.240, 0.340, sel) * sc;
    float hubR  = 0.022 * sc;
    float em    = 0.50 + 1.10 * lume;

    float cs  = reach * 0.82;
    float fy0 =  0.14 * sc;
    float by0 = -0.14 * sc;
    float spinAng = turn * 0.125;

    vec2 v0 = rot2(spinAng) * vec2(-cs,  cs + fy0);
    vec2 v1 = rot2(spinAng) * vec2( cs,  cs + fy0);
    vec2 v2 = rot2(spinAng) * vec2( cs, -cs + fy0);
    vec2 v3 = rot2(spinAng) * vec2(-cs, -cs + fy0);
    vec2 v4 = rot2(spinAng) * vec2(-cs,  cs + by0);
    vec2 v5 = rot2(spinAng) * vec2( cs,  cs + by0);
    vec2 v6 = rot2(spinAng) * vec2( cs, -cs + by0);
    vec2 v7 = rot2(spinAng) * vec2(-cs, -cs + by0);

    float orbR  = reach * 0.17;
    float orbR2 = orbR * orbR;

    float latOrb = 0.0;
    float latRim = 0.0;

    vec2 verts[8];
    verts[0] = v0; verts[1] = v1; verts[2] = v2; verts[3] = v3;
    verts[4] = v4; verts[5] = v5; verts[6] = v6; verts[7] = v7;

    for (int i = 0; i < 8; i++) {
        float d2   = dot(uv - verts[i], uv - verts[i]);
        float body = 1.0 - smoothstep(orbR2 * 0.88, orbR2, d2);
        float rimO = 1.0 - smoothstep(orbR2 * 0.80, orbR2 * 1.22, d2);
        float gl   = 0.0008 / (d2 + 0.0008) * smoothstep(orbR * 1.8, orbR * 0.4, sqrt(d2));
        latOrb += body * 0.7 + gl * 0.4;
        latRim += rimO * 0.5;
    }

    float bw = 0.006 * sc;
    float latBeam = 0.0;
    latBeam += beamGlow(uv, v0, v1, bw);
    latBeam += beamGlow(uv, v1, v2, bw);
    latBeam += beamGlow(uv, v2, v3, bw);
    latBeam += beamGlow(uv, v3, v0, bw);
    latBeam += beamGlow(uv, v4, v5, bw) * 0.55;
    latBeam += beamGlow(uv, v5, v6, bw) * 0.55;
    latBeam += beamGlow(uv, v6, v7, bw) * 0.55;
    latBeam += beamGlow(uv, v7, v4, bw) * 0.55;
    latBeam += beamGlow(uv, v0, v4, bw) * 0.80;
    latBeam += beamGlow(uv, v1, v5, bw) * 0.80;
    latBeam += beamGlow(uv, v2, v6, bw) * 0.80;
    latBeam += beamGlow(uv, v3, v7, bw) * 0.80;
    latBeam = clamp(latBeam, 0.0, 2.0);

    float kickFlash = AUDIO_KICK;
    vec3 copperBrite = vec3(1.00, 0.68, 0.28);
    vec3 amberGlow   = vec3(1.00, 0.88, 0.50);
    vec3 iridBlue    = vec3(0.30, 0.68, 1.00);

    vec3 col0 = copperBrite * latOrb  * (1.20 * em)
              + amberGlow   * latRim  * (0.55 * em)
              + mix(copperBrite, iridBlue, 0.35) * latBeam * (0.85 * em)
              + amberGlow * kickFlash * latOrb * 0.70;

    float cov0 = clamp(latOrb * 0.9 + latRim * 0.5 + latBeam * 0.4, 0.0, 1.2);

    float k1  = (a + turn * 0.5) * (6.0 / TAU);
    float c1  = abs(fract(k1) - 0.5);
    float i1  = mod(floor(k1), 6.0);
    float h1  = hash11(i1 * 2.17 + 3.3);

    float L1    = reach * (0.70 + 0.30 * h1);
    float t1    = r / max(L1, 0.001);
    float ring1 = abs(fract(t1 * 5.0 - ramp * 0.5 + h1) - 0.5);
    float ringW = 0.014 + 0.012 * c1;
    float rband = 1.0 - smoothstep(0.0, ringW, ring1);
    float renv  = smoothstep(0.012, 0.06, r) * (1.0 - smoothstep(0.88, 1.04, t1));

    float ang1 = c1 * (TAU / 6.0) * r;
    float chev = 1.0 - smoothstep(0.004, 0.010, ang1);

    float cr    = abs(fract((t1 + 0.012) * 5.0 - ramp * 0.5 + h1) - 0.5);
    float cb    = abs(fract((t1 - 0.012) * 5.0 - ramp * 0.5 + h1) - 0.5);
    float rgbFr = 1.0 - smoothstep(0.0, ringW, cr);
    float rgbFb = 1.0 - smoothstep(0.0, ringW, cb);

    float beatBulge = 1.0 + 0.06 * AUDIO_BEAT;

    vec3 magenta = vec3(1.00, 0.20, 0.72);
    vec3 cyan    = vec3(0.20, 0.88, 1.00);
    vec3 gold    = vec3(1.00, 0.82, 0.15);
    vec3 violet  = vec3(0.55, 0.15, 1.00);

    float rb1 = rband * renv * beatBulge;
    vec3 col1 = cyan    * clamp(rgbFr - rband, 0.0, 1.0) * renv * (0.70 * em)
              + magenta * clamp(rgbFb - rband, 0.0, 1.0) * renv * (0.70 * em)
              + gold    * rb1         * (1.10 * em)
              + violet  * chev * renv * (0.60 * em);

    float cov1 = clamp(rb1 * 0.90 + chev * renv * 0.40, 0.0, 1.2);

    float k2   = (a - turn * 1.5) * (24.0 / TAU);
    float i2   = mod(floor(k2), 24.0);
    float c2   = abs(fract(k2) - 0.5);
    float h2   = hash11(i2 * 1.83 + 6.1);
    float L2   = reach * (0.82 + 0.24 * h2);
    float t2   = r / max(L2, 0.001);
    float w2g  = 0.003 * (1.0 - 0.65 * clamp(t2, 0.0, 1.0));
    float ang2 = c2 * (TAU / 24.0) * r;
    float lv2  = smoothstep(0.008, 0.022, r) * (1.0 - smoothstep(0.945, 1.01, t2));
    float spine = (1.0 - smoothstep(w2g, w2g + 0.0015, ang2)) * lv2;

    float k2b    = (a - turn * 1.5 + TAU / 48.0) * (24.0 / TAU);
    float c2b    = abs(fract(k2b) - 0.5);
    float ang2b  = c2b * (TAU / 24.0) * r;
    float spine2 = (1.0 - smoothstep(w2g * 0.55, w2g * 0.55 + 0.0010, ang2b)) * lv2 * 0.65;

    float bd2    = fract(t2 * 14.0 - ramp * 3.5 + h2);
    float bead2  = smoothstep(0.60, 0.94, bd2) * smoothstep(1.05, 0.88, bd2);
    float novaBd = (1.0 - smoothstep(w2g * 2.8, w2g * 2.8 + 0.0014, ang2)) * bead2 * lv2;

    float sharpness = 1.0 + 0.30 * AUDIO_SNARE;
    float novaFinal = (spine + spine2) * sharpness;

    vec3 teal  = vec3(0.10, 0.95, 0.82);
    vec3 lemon = vec3(0.95, 1.00, 0.30);
    vec3 pink  = vec3(1.00, 0.38, 0.72);

    vec3 col2 = mix(teal, lemon, t2) * novaFinal * (1.05 * em)
              + pink * novaBd * (0.90 * em);

    float cov2 = clamp(novaFinal * 0.85 + novaBd * 0.65, 0.0, 1.2);

    float nuc  = 1.0 - smoothstep(hubR * 0.75, hubR, r);
    float nucR = 1.0 - smoothstep(0.0012, 0.0044, abs(r - hubR));
    float core = (0.0014 / (dot(uv, uv) + 0.0018)) * (1.0 - smoothstep(0.018, 0.12, r));
    vec3 white = vec3(1.00, 0.99, 0.96);

    vec3 col = col0 * w0 + col1 * w1 + col2 * w2
             + white * nuc  * 1.00
             + gold  * nucR * (0.35 * em)
             + white * core * (0.40 * em);

    col = col / (1.0 + col * 0.25);

    float brim = 1.0 - smoothstep(0.415, 0.478, r);
    col *= brim;

    float shapeCov = cov0 * w0 + cov1 * w1 + cov2 * w2;
    float alpha = (shapeCov * 1.00 + nuc * 1.00 + nucR * 0.55 + core * 0.35) * brim;
    alpha = smoothstep(0.015, 0.85, alpha);
    alpha = clamp(alpha, 0.0, 1.0);

    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
