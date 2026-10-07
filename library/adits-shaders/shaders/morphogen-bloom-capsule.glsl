/*{
  "ADITS": 1,
  "DESCRIPTION": "A wet black seed capsule wearing a living morphogen skin, its markings crawling as the pattern threshold slides; it rests as a closed egg speckled with raised bosses and opens into a ridged pod veined with labyrinth channels and then a flared crown eaten through with pores.",
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
      "LABEL": "Capsule Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "grain",      "TYPE": "float", "DEFAULT": 0.36, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Pattern Grain", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "pigment",    "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Pigment Light", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "shell_tint", "TYPE": "color", "DEFAULT": [0.10, 0.13, 0.14, 1.00],
      "LABEL": "Shell Tint" },
    { "NAME": "mark_tint",  "TYPE": "color", "DEFAULT": [0.44, 1.00, 0.52, 1.00],
      "LABEL": "Marking Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  7.40
#define BOUND  1.62

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
// The morphogen field.
//
// A Gray-Scott run needs a feedback buffer, which this profile does not
// have, so the pattern is built the other way round: four incommensurate
// waves interfere, and the level the field is cut at decides the regime.
// Cutting high leaves isolated bosses, cutting at zero leaves labyrinth
// channels, cutting low leaves pores. That is the same spots-to-maze
// sweep the feed and kill rates produce, under one scalar.
// ------------------------------------------------------------------

float g_k, g_ph, g_thresh, g_edge, g_relief;
float g_mark;    // pattern value at the sample, read back for colour

float morphogen(vec3 p) {
    float f = sin(dot(p, vec3( 1.00,  0.62,  0.31)) * g_k + g_ph)
            + sin(dot(p, vec3(-0.44,  1.00,  0.77)) * g_k - g_ph * 2.0)
            + sin(dot(p, vec3( 0.71, -0.35,  1.00)) * g_k + g_ph * 3.0)
            + sin(dot(p, vec3(-0.86, -0.52,  0.63)) * g_k - g_ph);
    return f * 0.25;
}

// ------------------------------------------------------------------
// The capsule. One lobed egg whose groove depth and flare carry the
// silhouette, with the morphogen cut into its wall (guide 12.5).
// ------------------------------------------------------------------

float g_R, g_N, g_groove, g_open, g_twist;

float map(vec3 p) {
    float r = length(p);
    if (r < 1e-4) return -g_R;
    vec3 n = p / r;
    float a = atan(p.z, p.x);

    float g = cos(a * g_N + n.y * g_twist);
    float open = g_open * smoothstep(-0.25, 1.0, n.y);
    float R = g_R * (1.0 - 0.30 * n.y * n.y)
                  * (1.0 + g_groove * g + open * (0.5 + 0.5 * g));

    float f = morphogen(p);
    g_mark = f;
    float mark = smoothstep(-g_edge, g_edge, f - g_thresh);
    R -= g_relief * (mark - 0.5);

    return (r - R) * 0.62;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0030;
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

    float w1 = clamp(1.0 - abs(sel)       / 0.33, 0.0, 1.0);
    float w2 = clamp(1.0 - abs(sel - 0.5) / 0.33, 0.0, 1.0);
    float w3 = clamp(1.0 - abs(sel - 1.0) / 0.33, 0.0, 1.0);
    float ws = w1 + w2 + w3 + 1e-4;
    w1 /= ws; w2 /= ws; w3 /= ws;

    // The regime slides with the selector: bosses, then channels, then
    // pores. Everything else is silhouette.
    g_thresh = w1 *  0.42 + w2 *  0.00 + w3 * -0.42;
    g_groove = w1 *  0.05 + w2 *  0.15 + w3 *  0.22;
    g_open   = w1 *  0.00 + w2 *  0.20 + w3 *  0.42;
    g_N      = w1 *  5.00 + w2 *  7.00 + w3 *  9.00;
    g_twist  = w1 *  0.60 + w2 *  1.60 + w3 *  2.80;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_R      = (0.82 + 0.16 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_k      = 24.0 + 26.0 * grain;
    g_edge   = 0.055 + 0.130 * (1.0 - pigment);
    g_relief = (0.016 + 0.028 * grain) * (0.80 + 0.60 * AUDIO_KICK);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // The capsule turns once per loop, marched in its own frame, so the
    // markings stay painted on the shell instead of swimming over it.
    float spin = ph * TAU;
    float roll = 0.26 * sin(ph * TAU * 2.0);
    pR(ro.xz, spin); pR(ro.yz, roll);
    pR(rd.xz, spin); pR(rd.yz, roll);

    vec3 lightD = normalize(vec3(0.46, 0.78, 0.44));

    vec3  col   = vec3(0.0);
    float alpha = 0.0;
    float near  = 1e9;

    float tb0, tb1;
    if (sph(ro, rd, BOUND, tb0, tb1)) {
        float t = max(tb0, 0.02);
        bool hit = false;
        vec3 p = ro + rd * t;
        for (int i = 0; i < 56; i++) {
            p = ro + rd * t;
            float d = map(p);
            near = min(near, d / max(t, 0.6));
            if (d < 0.0012) { hit = true; break; }
            t += d * 0.50;
            if (t > tb1) break;
        }

        if (hit) {
            float f = g_mark;
            vec3  n = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            float bac  = clamp(dot(n, -lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.4);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 58.0);

            float mark = smoothstep(-g_edge, g_edge, f - g_thresh);
            // The wall of the pattern, where the two phases meet, is where
            // the pigment concentrates and where the light gets out.
            float wall = smoothstep(g_edge * 1.25, 0.0, abs(f - g_thresh));

            vec3 wet = shell_tint.rgb * (0.10 + 0.72 * dif + 0.22 * bac);
            wet += vec3(1.0, 0.98, 0.94) * spec * 1.55;
            wet += mix(mark_tint.rgb, vec3(1.0), 0.25) * fre * (0.45 + 0.70 * pigment);

            col = wet
                + mark_tint.rgb * mark * (0.04 + 0.13 * pigment) * (0.35 + 0.85 * dif)
                + mark_tint.rgb * wall * (1.05 + 2.10 * pigment)
                                * (0.65 + 0.85 * AUDIO_BEAT);
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.0, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.36 + pow(ca, 30.0) * 0.78) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * pigment) * (0.55 + 0.90 * AUDIO_BEAT);
    col += mix(mark_tint.rgb, vec3(1.0, 0.92, 0.70), 0.25) * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
