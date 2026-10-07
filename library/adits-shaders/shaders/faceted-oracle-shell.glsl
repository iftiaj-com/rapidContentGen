/*{
  "ADITS": 1,
  "DESCRIPTION": "A low-poly shell rasterised triangle by triangle inside the pixel, so its silhouette is cut from straight edges and every facet is flat, with the barycentric distance lighting the wireframe; it rests as a calm six-sided ovoid and buckles into a lobed melon and then a spiked crystal urchin as the spectrum brightens.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "wireframe"],
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
      "LABEL": "Shell Swell", "BIND": "bass", "BIND_DEPTH": 0.55 },
    { "NAME": "buckle",     "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.85,
      "LABEL": "Facet Buckle", "BIND": "mid", "BIND_DEPTH": 0.60 },
    { "NAME": "wire",       "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Wire Light", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "facet_tint", "TYPE": "color", "DEFAULT": [0.20, 0.42, 0.90, 1.00],
      "LABEL": "Facet Tint" },
    { "NAME": "wire_tint",  "TYPE": "color", "DEFAULT": [0.40, 1.00, 0.86, 1.00],
      "LABEL": "Wire Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PI     3.14159265359
#define PERIOD 16.0
#define ORBIT  6.80
#define FOCAL  1.80

// 8 columns of azimuth by 4 rows of polar angle, two triangles a cell.
#define NCOL 8.0
#define NROW 4.0
#define NTRI 64

void pR(inout vec2 p, float a) { p = cos(a) * p + sin(a) * vec2(p.y, -p.x); }

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }

// ------------------------------------------------------------------
// The surface. Three displacement modes, weighted by the selector so
// the ovoid, the melon and the urchin are one function (guide 12.5).
//
// The mode orders are held under the Nyquist limit of the vertex grid:
// six columns cannot carry an azimuth mode above two, and a higher one
// aliases back down into a shape the shell already had. The third
// archetype instead alternates whole vertices, which the grid samples
// exactly, and that is what makes the stellated spikes.
// ------------------------------------------------------------------

float g_R, g_amp, g_ph;
float g_w1, g_w2, g_w3;

vec3 surfPos(vec2 s) {
    float U = s.x * TAU;
    float V = s.y * TAU;
    // cos(V * NCOL/2) is exactly (-1)^column at every grid vertex, and
    // cos(PI * s.x * NROW) is (-1)^row, so their product stellates.
    float par = cos(V * (NCOL * 0.5)) * cos(PI * s.x * NROW);
    float disp = g_w1 * sin(U * 1.0 + V * 2.0 + g_ph)
               + g_w2 * sin(U * 2.0 - V * 3.0 - g_ph * 2.0)
               + g_w3 * par * (0.62 + 0.38 * sin(V * 1.0 + g_ph * 3.0));

    float su = sin(PI * s.x);
    float cu = cos(PI * s.x);
    // The displacement is faded out at the poles so the cap closes
    // instead of tearing into a fan of mismatched vertices.
    float r = g_R * (1.0 + g_amp * disp * su);
    return r * vec3(su * cos(V), cu, su * sin(V));
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

    // Shared parameters, sliding continuously so the envelope keeps
    // moving even at a fifty-fifty blend (guide 12.6).
    g_R   = (0.80 + 0.16 * swell) * (0.97 + 0.05 * sin(ph * TAU));
    g_amp = (g_w1 * 0.26 + g_w2 * 0.36 + g_w3 * 0.55)
          * (0.70 + 0.35 * buckle) * (0.85 + 0.45 * AUDIO_KICK);

    // ---- camera (guide 5). The shell turns by rotating the basis, so
    // the rotation costs nothing per triangle. ------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);

    float spin = ph * TAU;
    float roll = 0.30 * sin(ph * TAU * 2.0);
    pR(ro.xz, spin); pR(ro.yz, roll);
    pR(ww.xz, spin); pR(ww.yz, roll);
    pR(uu.xz, spin); pR(uu.yz, roll);
    pR(vv.xz, spin); pR(vv.yz, roll);

    vec3 lightD = normalize(vec3(0.42, 0.78, 0.46));

    float du = 1.0 / NROW;
    float dv = 1.0 / NCOL;

    float bestZ    = 1e9;
    float bestCov  = 0.0;
    float bestEdge = 1.0;
    vec3  bestN    = vec3(0.0, 1.0, 0.0);
    float bestKey  = 0.0;
    float bestLat  = 0.0;

    for (int k = 0; k < NTRI; k++) {
        float fk   = float(k);
        float par = mod(fk, 2.0);
        float cell = floor(fk * 0.5);
        float ci   = mod(cell, NCOL);
        float ri   = floor(cell / NCOL);

        float u = ri * du;
        float v = ci * dv;
        vec2 A = vec2(u, v);
        vec2 B = vec2(u + du, v + dv);
        vec2 C = vec2(u + du, v);
        if (par > 0.5) { C = B; B = vec2(u, v + dv); }

        vec3 pa = surfPos(A);
        vec3 pb = surfPos(B);
        vec3 pc = surfPos(C);

        vec3 ea = pa - ro, eb = pb - ro, ec = pc - ro;
        float za = dot(ea, ww), zb = dot(eb, ww), zc = dot(ec, ww);
        if (min(za, min(zb, zc)) < 0.20) continue;

        vec2 sa = FOCAL * vec2(dot(ea, uu), dot(ea, vv)) / za;
        vec2 sb = FOCAL * vec2(dot(eb, uu), dot(eb, vv)) / zb;
        vec2 sc = FOCAL * vec2(dot(ec, uu), dot(ec, vv)) / zc;

        vec2 e0 = sb - sa, e1 = sc - sa, e2 = uv - sa;
        float den = e0.x * e1.y - e1.x * e0.y;
        if (den >= -2.0e-4) continue;        // back face, or a pole sliver

        float b1 = (e2.x * e1.y - e1.x * e2.y) / den;
        float b2 = (e0.x * e2.y - e2.x * e0.y) / den;
        float b0 = 1.0 - b1 - b2;
        float mb = min(b0, min(b1, b2));
        if (mb < -0.014) continue;

        // Perspective-correct depth, so a buckled shell sorts properly.
        float zw = 1.0 / (b0 / za + b1 / zb + b2 / zc);
        if (zw >= bestZ) continue;

        bestZ    = zw;
        bestCov  = smoothstep(-0.014, 0.004, mb);
        bestEdge = mb;
        bestN    = normalize(cross(pb - pa, pc - pa));
        bestKey  = ci + ri * NCOL;
        bestLat  = (u + du * 0.5);
    }

    vec3  col   = vec3(0.0);
    float alpha = 0.0;

    if (bestZ < 1e8) {
        vec3 n = bestN;
        vec3 rdv = normalize((ro + ww * bestZ) - ro);

        float dif  = clamp(dot(n, lightD), 0.0, 1.0);
        float bac  = clamp(dot(n, -lightD), 0.0, 1.0);
        float fre  = pow(clamp(1.0 - abs(dot(n, ww)), 0.0, 1.0), 2.4);
        float spec = pow(clamp(dot(reflect(-ww, n), lightD), 0.0, 1.0), 30.0);

        // Every facet gets its own hue offset, which is what makes a
        // flat-shaded shell read as cut stone rather than as a ball.
        float h = hash11(bestKey + 3.0);
        vec3 fc = mix(facet_tint.rgb, wire_tint.rgb, h);
        fc *= 0.35 + 0.95 * hash11(bestKey + 11.0);
        fc = mix(fc, vec3(0.04, 0.05, 0.08), 0.42);

        col = fc * (0.16 + 1.10 * dif + 0.26 * bac)
            + mix(facet_tint.rgb, wire_tint.rgb, bestLat) * fre * (0.55 + 0.85 * wire)
            + vec3(1.0, 0.97, 0.93) * spec * 1.20;

        // The wireframe is the barycentric distance to the nearest edge:
        // a broad sheath with a hot filament running down the middle.
        float me  = max(bestEdge, 0.0);
        float wl  = smoothstep(0.045 + 0.040 * wire, 0.0, me);
        float wlh = smoothstep(0.011 + 0.008 * wire, 0.0, me);
        col += wire_tint.rgb * wl * (0.70 + 1.90 * wire) * (0.70 + 0.90 * AUDIO_SNARE);
        col += vec3(1.0, 0.99, 0.96) * wlh * (0.85 + 1.30 * wire) * (0.60 + 1.10 * AUDIO_HAT);

        alpha = bestCov;
        col *= bestCov;
    }

    // ---- bounded hub glow, well inside the frame edge (guide 8) ------
    float halo = 0.0072 / (dot(uv, uv) + 0.0090) * smoothstep(0.44, 0.06, rr);
    col += mix(facet_tint.rgb, wire_tint.rgb, 0.55) * halo
         * (0.35 + 0.80 * AUDIO_BEAT + 0.40 * wire) * (1.0 - alpha * 0.80);
    alpha = clamp(alpha + halo * 0.30 * (1.0 - alpha), 0.0, 1.0);

    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
