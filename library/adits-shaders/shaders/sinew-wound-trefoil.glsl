/*{
  "ADITS": 1,
  "DESCRIPTION": "A wet black knot laced with glowing veins, traced from a ridged field that rotates itself as it climbs in frequency so the partings wind around the body rather than sitting flat on it; it rests as a heavy three-crossing trefoil and tightens into a five-crossing knot and then a seven-crossing cable as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "biomech"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain", "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",  "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.10, "MAX": 0.76,
      "LABEL": "Knot Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "carve",      "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.05, "MAX": 0.88,
      "LABEL": "Fibre Carve", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "sheen",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Wet Sheen", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "body_tint",  "TYPE": "color", "DEFAULT": [0.14, 0.10, 0.12, 1.00],
      "LABEL": "Body Tint" },
    { "NAME": "seam_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.34, 0.44, 1.00],
      "LABEL": "Seam Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  6.40
#define BOUND  1.38
#define NUDGE  0.739513
#define NORM   0.804480    // 1 / sqrt(1 + NUDGE * NUDGE)

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

bool sph(vec3 ro, vec3 rd, float ra, out float t0, out float t1) {
    t0 = 0.0;
    t1 = 0.0;
    float b = dot(ro, rd);
    float c = dot(ro, ro) - ra * ra;
    float h = b * b - c;
    if (h < 0.0) return false;
    h = sqrt(h);
    t0 = -b - h;
    t1 = -b + h;
    return t1 > 0.0;
}

// ------------------------------------------------------------------
// The fibre field.
//
// Sin and cos are added at a rising frequency while the coordinate is
// rotated by a fixed perpendicular nudge each pass. That rotation is
// what makes the ridges wind rather than stack, and the abs is what
// makes them ridges instead of waves. No texture and no hash, so the
// field is identical on every machine.
// ------------------------------------------------------------------

float g_ph;

float fibreField(vec3 p) {
    float n = 0.0;
    float it = 1.0;
    for (int i = 0; i < 6; i++) {
        float k = float(i) + 1.0;                 // integer, so the drift closes
        n += -abs(sin(p.y * it + g_ph * k) + cos(p.x * it - g_ph * k)) / it;
        p.xy += vec2(p.y, -p.x) * NUDGE;  p.xy *= NORM;
        p.xz += vec2(p.z, -p.x) * NUDGE;  p.xz *= NORM;
        it *= 1.733733;
    }
    return n * 0.31 + 1.0;                        // roughly 0 .. 1
}

// ------------------------------------------------------------------
// The knot. A twisted torus: rotating the cross-section by a half
// integer multiple of the lap angle and mirroring it turns the ring
// into a knot that still closes. Three crossings are summed by the
// morph weights, since a fractional twist between them would leave a
// seam running the whole way round (guide 12.5).
// ------------------------------------------------------------------

float g_Rm, g_lobe, g_tube, g_amp;
float g_w1, g_w2, g_w3;
float g_fib;   // fibre value at the sample, read back for colour

float knot(vec2 q, float th, float tw, float lobe, float tube) {
    pR(q, th * tw + g_ph);
    return length(vec2(abs(q.x) - lobe, q.y)) - tube;
}

float map(vec3 p) {
    float th = atan(p.z, p.x);
    vec2  q  = vec2(length(p.xz) - g_Rm, p.y);

    float d = g_w1 * knot(q, th, 1.5, g_lobe * 1.00, g_tube * 1.00)
            + g_w2 * knot(q, th, 2.5, g_lobe * 0.92, g_tube * 0.74)
            + g_w3 * knot(q, th, 3.5, g_lobe * 0.84, g_tube * 0.56);

    float f = fibreField(p * 4.2);
    g_fib = f;
    return d - g_amp * (f - 0.5);
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0022;
    return normalize(k.xyy * map(p + k.xyy * e) +
                     k.yyx * map(p + k.yyx * e) +
                     k.yxy * map(p + k.yxy * e) +
                     k.xxx * map(p + k.xxx * e));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    float rr = length(uv);
    float bound = smoothstep(0.478, 0.442, rr);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float ph = fract(TIME / PERIOD);
    g_ph = ph * TAU;

    // ---- spectral morph selector (guide 12.2 - 12.4, 12.7) ----------
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tiltS = (md * 0.5 + hi) / sum;
    float sel = clamp((tiltS - 0.5) * (1.6 + 3.4 * morph_gain) + 0.5, 0.0, 1.0);
    sel = clamp(sel + 0.38 * (AUDIO_HAT - AUDIO_KICK) + 0.18 * AUDIO_SNARE, 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest_form, sel, live);

    g_w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    g_w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    g_w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = g_w1 + g_w2 + g_w3 + 1e-4;
    g_w1 /= ws; g_w2 /= ws; g_w3 /= ws;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_Rm   = (0.80 + 0.14 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_lobe = 0.20 + 0.06 * swell;
    g_tube = (0.155 + 0.045 * swell) * (0.92 + 0.14 * AUDIO_KICK);
    g_amp  = (0.022 + 0.050 * carve) * (0.85 + 0.35 * AUDIO_KICK);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    float spin = ph * TAU;
    float tip  = 0.40 * sin(ph * TAU) + 0.20;
    pR(ro.yz, tip); pR(ro.xz, spin);
    pR(rd.yz, tip); pR(rd.xz, spin);

    vec3 lightD = normalize(vec3(0.46, 0.76, 0.46));

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 48; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0012) { hit = true; break; }
            t += d * 0.52;      // the carve softens the bound
            if (t > tb1) break;
        }

        if (hit) {
            float f = g_fib;
            vec3  n = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            float bac  = clamp(dot(n, -lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 5.0);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 60.0);
            float sp2  = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 12.0);

            // Wet tissue. A contour family through the ridged field
            // draws the partings between fibre bundles, which is what
            // reads as carved even where the march smoothed the relief.
            float groove = smoothstep(0.085 + 0.055 * carve, 0.0,
                                      abs(fract(f * 11.0) - 0.5));
            float crev = smoothstep(0.58, 0.16, f);

            col = body_tint.rgb * (0.16 + 1.15 * dif + 0.32 * bac)
                + body_tint.rgb * sp2 * (0.40 + 0.60 * sheen)
                + seam_tint.rgb * groove * (0.70 + 1.90 * sheen)
                                * (0.55 + 0.95 * AUDIO_BEAT)
                + seam_tint.rgb * crev * (0.18 + 0.55 * sheen)
                + seam_tint.rgb * fre * (0.70 + 1.05 * sheen)
                + vec3(1.0, 0.97, 0.95) * spec * (1.55 + 1.25 * AUDIO_SNARE);
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.4, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.34 + pow(ca, 30.0) * 0.72) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * sheen) * (0.55 + 0.90 * AUDIO_BEAT);
    col += seam_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
