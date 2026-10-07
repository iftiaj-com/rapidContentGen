/*{
  "ADITS": 1,
  "DESCRIPTION": "A bilateral pair of membrane wings on a slim spine, their veins drawn by onion shells cut through a domain that is itself warped, so the venation ripples with the membrane instead of being painted flat on it; it rests folded and half-lit and opens to a spread pair and then to long swept primaries as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "organic"],
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
      "LABEL": "Wing Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "ripple",     "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Membrane Ripple", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "lumen",      "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Vein Light", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "film_tint",  "TYPE": "color", "DEFAULT": [0.16, 0.20, 0.30, 1.00],
      "LABEL": "Membrane Tint" },
    { "NAME": "vein_tint",  "TYPE": "color", "DEFAULT": [1.00, 0.52, 0.20, 1.00],
      "LABEL": "Vein Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0
#define ORBIT  5.90
#define BOUND  1.52

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
// The wing.
//
// The membrane is a thin sheet cut to a wing outline. Its venation is
// onion shells taken through a warped copy of the same coordinates, so
// the veins ripple with the sheet rather than sitting painted flat on
// it, and the fold and sweep of that sheet carry the silhouette from
// closed to spread to swept (guide 12.5).
// ------------------------------------------------------------------

float g_span, g_chord, g_th, g_flap, g_sweep, g_pitch, g_rip, g_ph;
float g_u, g_v;   // spanwise and chordwise coordinates, for shading
float g_mat;      // 0 membrane, 1 spine

vec3 warp(vec3 p) {
    p += 0.16 * sin(p.zxy * 3.1 + g_ph);
    p += 0.07 * sin(p.yzx * 6.3 - g_ph * 2.0);
    return p;
}

float wing(vec3 p) {
    // Span on x, chord on y, thickness on z, so the membrane faces the
    // viewer. Laid flat instead, a wing is edge-on from a camera that
    // orbits in the horizontal plane and there is nothing to see.
    pR(p.xz, g_sweep);
    pR(p.xy, g_flap);
    pR(p.yz, g_pitch);

    float u = p.x;
    float s = clamp(u / max(g_span, 0.01), 0.0, 1.0);

    // Chord tapers to the tip and is scalloped along the trailing edge.
    float chord = g_chord * sqrt(max(1.0 - s * s, 0.0)) * (0.55 + 0.45 * (1.0 - s));
    chord *= 1.0 + 0.12 * cos(s * 9.0 + g_ph);

    float plane = max(abs(p.y + chord * 0.18) - chord, u - g_span);
    plane = max(plane, 0.055 - u);

    // The sheet itself is rippled, which is what keeps it from reading
    // as a cut-out piece of card.
    float lift = g_rip * sin(u * 5.0 + p.y * 3.0 + g_ph) * s;
    float sheet = abs(p.z - lift) - g_th;

    g_u = s;
    g_v = p.y / max(chord, 0.01);
    return max(plane, sheet) * 0.80;
}

float map(vec3 q) {
    vec3 p = q;
    p.x = abs(p.x);                    // bilateral symmetry

    float d = wing(p);
    g_mat = 0.0;

    // Spine: a slim tapered spindle the wings are hung on, standing
    // upright between them.
    float sy = clamp(q.y / 0.60, -1.0, 1.0);
    float body = length(vec2(length(q.xz), q.y - clamp(q.y, -0.55, 0.55)))
               - 0.080 * (1.0 - 0.55 * sy * sy);
    if (body < d) { d = body; g_mat = 1.0; }
    return d;
}

vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0016;
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

    g_span  = w1 * 0.78 + w2 * 1.02 + w3 * 1.20;
    g_chord = w1 * 0.50 + w2 * 0.55 + w3 * 0.42;
    g_th    = w1 * 0.048 + w2 * 0.030 + w3 * 0.019;
    g_sweep = w1 * 0.15 + w2 * 0.42 + w3 * 0.86;

    // The beat is the wingbeat: a full stroke per loop, plus a fold
    // angle that closes the pair right down at the resting archetype.
    float stroke = 0.42 * sin(ph * TAU) + 0.10 * sin(ph * TAU * 2.0);
    g_flap  = (w1 * 0.80 + w2 * 0.38 + w3 * 0.08) + stroke;
    g_pitch = 0.24 * cos(ph * TAU) + 0.10;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    float grow = (0.94 + 0.14 * swell) * (0.98 + 0.03 * sin(ph * TAU));
    g_span  *= grow;
    g_chord *= grow;
    g_rip    = (0.020 + 0.060 * ripple) * (0.85 + 0.40 * AUDIO_KICK);

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    // The pair turns slowly, but never edge-on for long: a membrane
    // seen exactly side-on has almost nothing to show.
    float turn = 0.55 * sin(ph * TAU);
    float roll = 0.18 * sin(ph * TAU * 2.0);
    pR(ro.xz, turn); pR(ro.yz, roll);
    pR(rd.xz, turn); pR(rd.yz, roll);

    vec3 lightD = normalize(vec3(0.40, 0.78, 0.48));

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
            if (d < 0.0009) { hit = true; break; }
            t += d * 0.75;
            if (t > tb1) break;
        }

        if (hit) {
            float mat = g_mat;
            float su = g_u, sv = g_v;
            vec3  n  = calcNormal(p);

            float dif  = clamp(dot(n, lightD), 0.0, 1.0);
            float wrapL = clamp(0.5 + 0.5 * dot(n, lightD), 0.0, 1.0);
            float fre  = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 2.6);
            float spec = pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 46.0);

            if (mat > 0.5) {
                col = film_tint.rgb * (0.10 + 0.85 * dif)
                    + vein_tint.rgb * fre * 0.85
                    + vec3(1.0, 0.97, 0.94) * spec * 1.35;
            } else {
                // Onion shells through a warped copy of the coordinates.
                // Warping first is what makes the venation follow the
                // ripple instead of sitting flat across it.
                vec3 wp = warp(p * 3.0);
                float rad = length(wp);
                float ribs = abs(fract(rad * (1.6 + 2.2 * lumen)) - 0.5);
                float vein = smoothstep(0.085, 0.0, ribs);

                // Ribs running out from the root, and one heavy spar
                // along the leading edge.
                float rays = smoothstep(0.075, 0.0,
                                        abs(fract(sv * 3.5 + su * 1.5) - 0.5));
                float spar = smoothstep(0.22, 0.0, abs(sv + 0.72));

                float film = 0.30 + 0.70 * su;
                col = film_tint.rgb * (0.08 + 0.55 * dif + 0.75 * wrapL * wrapL) * film
                    + vein_tint.rgb * max(vein, rays * 0.8) * (0.55 + 1.65 * lumen)
                                    * (0.55 + 0.85 * AUDIO_BEAT)
                    + vein_tint.rgb * spar * (0.45 + 0.95 * lumen)
                    + mix(film_tint.rgb, vein_tint.rgb, 0.6) * fre * (0.75 + 1.35 * lumen)
                    + vec3(1.0, 0.98, 0.95) * spec * (1.15 + 1.30 * AUDIO_SNARE);
            }
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.4, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.28 + pow(ca, 30.0) * 0.62) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * lumen) * (0.55 + 0.90 * AUDIO_BEAT);
    col += vein_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
