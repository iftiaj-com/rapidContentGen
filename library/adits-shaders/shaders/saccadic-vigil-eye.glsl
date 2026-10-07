/*{
  "ADITS": 1,
  "DESCRIPTION": "An obsidian eye that holds the viewer, darts away in hard saccades and blinks behind a turning armature; it rests as a hooded lidded orb and morphs into an aperture of nine blades and then a corona of needles as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.12, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.30, "MIN": 0.10, "MAX": 0.80,
      "LABEL": "Orb Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "bristle",    "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.10, "MAX": 0.90,
      "LABEL": "Armature Flare", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "fibre",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Iris Fibre Light", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "iris_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.58, 0.14, 1.00],
      "LABEL": "Iris Tint" },
    { "NAME": "rim_tint",   "TYPE": "color", "DEFAULT": [0.26, 0.86, 1.00, 1.00],
      "LABEL": "Rim & Vein Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  8.4

// ------------------------------------------------------------------
// small utilities
// ------------------------------------------------------------------

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
vec2  hash21(float n) { return fract(sin(vec2(n * 127.1, n * 311.7)) * 43758.5453123); }

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

// Nearest / far root of a ray against a sphere. Returns false on a miss.
bool sph(vec3 ro, vec3 rd, vec3 ce, float ra, out float t0, out float t1) {
    t0 = 0.0;
    t1 = 0.0;
    vec3 oc = ro - ce;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - ra * ra;
    float h = b * b - c;
    if (h < 0.0) return false;
    h = sqrt(h);
    t0 = -b - h;
    t1 = -b + h;
    return t1 > 0.0;
}

// ------------------------------------------------------------------
// The armature: one radial blade field, three settings. Count, reach,
// width, thickness, twist and taper are blended by the morph weights,
// so two hood plates, nine aperture blades and a needle nova are all
// the same evaluation (guide 12.5).
// ------------------------------------------------------------------

float g_cnt, g_len, g_wid, g_thk, g_tilt, g_sharp;

vec3 coronaFold(vec3 p) {
    float a = atan(p.y, p.x);
    float r = length(p.xy);
    float sect = TAU / g_cnt;
    float aa = mod(a + 0.5 * sect, sect) - 0.5 * sect;
    vec3 s = vec3(cos(aa) * r, sin(aa) * r, p.z);
    pR(s.yz, g_tilt);
    return s;
}

float bladeTaper(float u) { return mix(1.0, 1.0 - u * u, g_sharp); }

float bladeDist(vec3 s) {
    float u  = clamp((s.x - 0.90) / max(g_len - 0.90, 0.02), 0.0, 1.0);
    float tp = bladeTaper(u);
    vec3 e = vec3(s.x - clamp(s.x, 0.90, g_len),
                  abs(s.y) - g_wid * tp,
                  abs(s.z) - g_thk * tp);
    return length(max(e, 0.0)) + min(max(e.x, max(e.y, e.z)), 0.0);
}

float coronaSDF(vec3 p) { return bladeDist(coronaFold(p)); }

vec3 coronaNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0018;
    return normalize(k.xyy * coronaSDF(p + k.xyy * e) +
                     k.yyx * coronaSDF(p + k.yyx * e) +
                     k.yxy * coronaSDF(p + k.yxy * e) +
                     k.xxx * coronaSDF(p + k.xxx * e));
}

// ------------------------------------------------------------------
// Saccades. Eight held gaze offsets per loop, each reached in a hard
// snap. The index is wrapped with mod, so offset -1 is offset 7 and
// the dart across the loop boundary is identical to every other dart.
// ------------------------------------------------------------------

vec2 gazeOffset(float i) {
    vec2 h = hash21(mod(i, 8.0) + 1.7) - 0.5;
    return vec2(h.x * 1.05, h.y * 0.62);
}

// ------------------------------------------------------------------

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.492, 0.455, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);

    // ---- spectral morph selector (guide 12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    float flare = 0.92 + 0.14 * bristle + 0.05 * AUDIO_KICK;
    g_cnt   =  w1 *  2.00 + w2 *  9.000 + w3 * 26.000;
    g_len   = (w1 *  1.74 + w2 *  1.520 + w3 *  1.880) * flare;
    g_wid   =  w1 *  0.52 + w2 *  0.185 + w3 *  0.042;
    g_thk   =  w1 *  0.10 + w2 *  0.042 + w3 *  0.028;
    g_sharp =  w1 *  0.55 + w2 *  0.780 + w3 *  1.000;
    g_tilt  =  w2 *  0.85 + 0.25 * sin(ph * TAU * 2.0);

    // ---- camera (guide 5: driven from CAM_DIR so it really orbits) --
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    vec3 lightO = normalize(vec3(0.55, 0.72, 0.42));

    // ---- gaze: holds on the viewer, darts off, tremors -------------
    float seg  = floor(ph * 8.0);
    float f    = fract(ph * 8.0);
    float snap = smoothstep(0.0, mix(0.16, 0.04, clamp(AUDIO_SNARE, 0.0, 1.0)), f);
    vec2  off  = mix(gazeOffset(seg - 1.0), gazeOffset(seg), snap);
    off += 0.018 * vec2(sin(ph * TAU * 7.0), cos(ph * TAU * 11.0));
    vec3 gz = normalize(CAM_DIR + uu * off.x + vv * off.y);
    vec3 gx = normalize(cross(CAM_UP, gz));
    vec3 gy = cross(gz, gx);

    // ---- the orb and its corneal bulge, both analytic ---------------
    float orbR = 0.88 + 0.30 * swell;
    vec3  cc   = gz * (orbR * 0.5343);
    float cR   = orbR * 0.60;

    float ts0, ts1, tc0, tc1;
    bool hS = sph(ro, rd, vec3(0.0), orbR, ts0, ts1);
    bool hC = sph(ro, rd, cc, cR, tc0, tc1);
    float tEye = 1e9;
    float onCornea = 0.0;
    if (hS && ts0 > 0.0) { tEye = ts0; }
    if (hC && tc0 > 0.0 && tc0 < tEye) { tEye = tc0; onCornea = 1.0; }

    // ---- the armature, marched in its own rotating frame ------------
    float spin = ph * TAU;
    float wob  = 0.30 * sin(ph * TAU * 2.0);
    vec3 roA = ro, rdA = rd, lightA = lightO;
    pR(roA.xy, spin);    pR(roA.yz, wob);
    pR(rdA.xy, spin);    pR(rdA.yz, wob);
    pR(lightA.xy, spin); pR(lightA.yz, wob);

    float tb0, tb1;
    float tHitC = -1.0;
    vec3  pC = vec3(0.0);
    if (sph(roA, rdA, vec3(0.0), 2.30, tb0, tb1)) {
        float t = max(tb0, 0.0);
        float tmax = min(tb1, tEye);
        for (int i = 0; i < 48; i++) {
            vec3 p = roA + rdA * t;
            float d = coronaSDF(p);
            if (d < 0.0016) { tHitC = t; pC = p; break; }
            t += d * 0.72;
            if (t > tmax) break;
        }
    }

    vec3  col   = vec3(0.0);
    float alpha = 0.0;

    if (tHitC > 0.0) {
        // ---------------- armature blade -----------------------------
        vec3 n = coronaNormal(pC);
        vec3 s = coronaFold(pC);
        float u   = clamp((s.x - 0.90) / max(g_len - 0.90, 0.02), 0.0, 1.0);
        float acr = clamp(abs(s.y) / max(g_wid * bladeTaper(u), 1e-4), 0.0, 1.0);

        float dif  = clamp(dot(n, lightA), 0.0, 1.0);
        float fre  = pow(clamp(1.0 + dot(n, rdA), 0.0, 1.0), 5.0);
        float spec = pow(clamp(dot(reflect(rdA, n), lightA), 0.0, 1.0), 46.0);

        float edgeL = smoothstep(0.62, 0.99, acr);
        float spine = smoothstep(0.20, 0.0, acr);
        float tipG  = smoothstep(0.50, 1.0, u);
        vec3  hot   = mix(rim_tint.rgb, iris_tint.rgb, sel);

        col = vec3(0.016, 0.019, 0.026) * (0.25 + 0.80 * dif)
            + hot * edgeL * (1.05 + 0.95 * bristle)
            + hot * spine * (0.30 + 0.70 * AUDIO_SNARE)
            + hot * tipG  * (0.35 + 1.20 * AUDIO_SNARE)
            + rim_tint.rgb * fre * 1.10
            + vec3(1.0, 0.97, 0.92) * spec * 1.30;
        alpha = 1.0;

    } else if (tEye < 1.0e8) {
        // ---------------- the eye ------------------------------------
        vec3 pe  = ro + rd * tEye;
        vec3 nrm = mix(normalize(pe), normalize(pe - cc), onCornea);
        vec3 q   = vec3(dot(pe, gx), dot(pe, gy), dot(pe, gz));
        vec3 sd  = normalize(q);
        float polar = acos(clamp(sd.z, -1.0, 1.0));

        float dif  = clamp(dot(nrm, lightO), 0.0, 1.0);
        float fre  = pow(clamp(1.0 + dot(nrm, rd), 0.0, 1.0), 4.0);
        float spec = pow(clamp(dot(reflect(rd, nrm), lightO), 0.0, 1.0), 120.0);

        vec3 c = vec3(0.014, 0.017, 0.024) * (0.22 + 0.70 * dif)
               + rim_tint.rgb * fre * 1.85
               + vec3(1.0) * spec * 2.40;

        // scleral veins: filaments that crawl, brightest away from the iris
        float va   = atan(sd.y, sd.x);
        float vw   = sin(va * 7.0 + sin(polar * 5.0 + ph * TAU) * 1.7);
        float vein = smoothstep(0.13, 0.0, abs(vw))
                   * smoothstep(0.58, 1.35, polar)
                   * smoothstep(3.05, 2.20, polar);
        c += rim_tint.rgb * vein * (0.35 + 1.9 * fibre) * (0.55 + 1.2 * AUDIO_BEAT);

        // iris, read through the refracting cornea. The refracted hit is
        // normalised by the span the limbus maps to, so the disc fills
        // the corneal cap whatever the viewing angle.
        vec3  rf = refract(rd, nrm, 1.0 / 1.34);
        vec3  rl = vec3(dot(rf, gx), dot(rf, gy), dot(rf, gz));
        float tt = (orbR * 0.50 - q.z) / min(rl.z, -0.05);
        vec2  ip = (q.xy + rl.xy * tt) / orbR;
        float ir = length(ip) / 0.385;
        float ia = atan(ip.y, ip.x);

        float pupR  = mix(0.42, 0.16, clamp(AUDIO_KICK * 1.15 + AUDIO_LEVEL * 0.45, 0.0, 1.0));
        float cells = 34.0;
        float cx    = ia / TAU * cells + 0.5;
        float h1    = hash11(mod(floor(cx), cells) + 5.0);
        float cf    = fract(cx) - 0.5;
        float strk  = smoothstep(0.50, 0.05 + 0.32 * h1, abs(cf) * 2.0);
        float crypt = 0.45 + 0.55 * sin(ir * 26.0 + h1 * 9.0 + ph * TAU * 2.0);
        float band  = smoothstep(pupR, pupR + 0.10, ir) * smoothstep(1.00, 0.86, ir);

        vec3 icol = iris_tint.rgb * (0.35 + 2.10 * strk * crypt) * (0.55 + 1.70 * fibre) * band;
        // collarette: a bright ring just outside the pupil, snapping on the beat
        icol += mix(iris_tint.rgb, vec3(1.0), 0.35)
              * smoothstep(0.07, 0.0, abs(ir - pupR - 0.16)) * (0.80 + 1.90 * AUDIO_BEAT);
        // limbal ring: a hard dark boundary at the edge of the disc
        icol *= 1.0 - 0.92 * smoothstep(0.80, 0.97, ir) * smoothstep(1.14, 0.97, ir);
        // pupil: dead black, with one hard catchlight so it reads as glass
        icol *= smoothstep(pupR - 0.05, pupR + 0.05, ir);
        icol += vec3(1.0) * spec * 2.2;

        float irisMask = onCornea * smoothstep(1.13, 1.02, ir) * smoothstep(0.72, 0.60, polar);
        c = mix(c, icol, irisMask);

        // nictitating membrane: four blinks a loop, sharp shut, slow open
        float bt    = fract(ph * 4.0);
        float blink = smoothstep(0.0, 0.035, bt) * smoothstep(0.115, 0.075, bt);
        float lidY  = mix(1.35, -1.18, blink) * orbR;
        float cover = smoothstep(lidY - 0.02, lidY + 0.02, pe.y);
        float seam  = smoothstep(0.05, 0.0, abs(pe.y - lidY)) * smoothstep(0.0, 0.12, blink);
        vec3  lidC  = vec3(0.009, 0.011, 0.016) * (0.25 + 0.70 * dif) + rim_tint.rgb * fre * 1.40;
        c = mix(c, lidC, cover);
        c += mix(rim_tint.rgb, iris_tint.rgb, 0.45) * seam * (1.10 + 1.60 * AUDIO_HAT);

        col = c;
        alpha = 1.0;
    }

    // ---- bounded halo, never reaching the frame edge (guide 8) ------
    float halo = 0.0075 / (dot(uv, uv) + 0.0080) * smoothstep(0.45, 0.05, rr);
    col += mix(rim_tint.rgb, iris_tint.rgb, sel) * halo
         * (0.35 + 0.85 * AUDIO_BEAT + 0.40 * fibre) * (1.0 - alpha * 0.80);
    alpha = clamp(alpha + halo * 0.28 * (1.0 - alpha), 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.88));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
