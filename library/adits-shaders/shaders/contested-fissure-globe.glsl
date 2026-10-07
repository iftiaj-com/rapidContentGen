/*{
  "ADITS": 1,
  "DESCRIPTION": "A dark mineral globe cracked open by three colonies of living light, each draining its own territory through channels that thicken as they converge on its nucleus; the three bands of the spectrum are the three vigours, so bass, mid and treble literally widen and collapse the territories against each other and the map on the object is never twice the same.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-26",
  "CATEGORIES": ["generative", "3d", "audio", "morph", "organic"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "morph_gain",  "TYPE": "float", "DEFAULT": 0.84, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Morph Sensitivity" },
    { "NAME": "rest_form",   "TYPE": "float", "DEFAULT": 0.10, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Rest Archetype" },
    { "NAME": "contest",     "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Territory Contest" },
    { "NAME": "meander",     "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.05, "MAX": 0.84,
      "LABEL": "Channel Meander", "BIND": "mid", "BIND_DEPTH": 0.55 },
    { "NAME": "emissive",    "TYPE": "float", "DEFAULT": 0.42, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Colony Light", "BIND": "treble", "BIND_DEPTH": 0.70 },
    { "NAME": "stone_tint",  "TYPE": "color", "DEFAULT": [0.10, 0.10, 0.13, 1.00],
      "LABEL": "Stone Tint" },
    { "NAME": "colony_tint", "TYPE": "color", "DEFAULT": [1.00, 0.52, 0.14, 1.00],
      "LABEL": "Colony Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PI     3.14159265359
#define PERIOD 16.0
#define ORBIT  4.40
#define BOUND  1.02

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
// Three colonies.
//
// Each holds a nucleus on the globe and a vigour. The partition is the
// angular distance to a nucleus divided by that colony's vigour, so a
// colony that gains vigour widens its territory at its neighbours'
// expense. The three vigours are the three spectral bands, which is
// what puts the map itself under the music rather than only the light.
// ------------------------------------------------------------------

float g_ph, g_R, g_wall, g_cut, g_pierce, g_cw, g_freq, g_mean, g_hue;
vec3  g_n0, g_n1, g_n2;
vec3  g_t0, g_t1, g_t2;   // a tangent for each nucleus, to take an azimuth
float g_v0, g_v1, g_v2;

float g_own;    // which colony owns this sample
float g_arc;    // angular distance to its nucleus, normalised
float g_chan;   // distance to the nearest channel line
float g_edge;   // nearness to a territory border

vec3 colonyCol(float i) {
    vec3 c = 0.55 + 0.45 * cos(TAU * (i / 3.0 + g_hue) + vec3(0.0, 2.094, 4.188));
    return mix(colony_tint.rgb, c, 0.72);
}

// Channels converging on a nucleus: contour lines of the azimuth around
// it, so they all run inward, wandering under a warp and thickening as
// they gather. A network drawn without that convergence reads as veins
// on a ball, not as drainage.
float channelAt(vec3 d, vec3 nuc, vec3 tan0, out float arcOut) {
    float ca = clamp(dot(d, nuc), -1.0, 1.0);
    float arc = acos(ca) / PI;
    arcOut = arc;

    vec3 bt = normalize(cross(nuc, tan0));
    float az = atan(dot(d, bt), dot(d, tan0));

    float warp = g_mean * (sin(arc * 6.4 + az * 2.0 + g_ph)
                         + 0.55 * sin(arc * 11.7 - az * 3.0 - g_ph * 2.0));
    float lines = fract((az + warp) * (g_freq / TAU) + 0.5) - 0.5;

    // The azimuth lines crowd together near the nucleus, so the measure
    // is scaled by how far out the sample is. Scaling by sin of the arc
    // instead also collapses it at the far pole, and the whole antipodal
    // cap then reads as one solid channel.
    float across = abs(lines) * clamp(0.38 + arc * 1.10, 0.20, 1.0);

    // The azimuth lines meet at the nucleus itself, which is a singular
    // point: every channel is there at once and the pixel aliases. The
    // nucleus is a pool rather than a channel, so the measure is lifted
    // clear of the channel test in the last little way in.
    across = mix(across, 0.5, smoothstep(0.075, 0.015, arc));
    return across;
}

float terrainRadius(vec3 d) {
    // Weighted partition. Dividing by vigour is what lets a colony push
    // its border outward without moving its nucleus.
    float a0 = acos(clamp(dot(d, g_n0), -1.0, 1.0)) / g_v0;
    float a1 = acos(clamp(dot(d, g_n1), -1.0, 1.0)) / g_v1;
    float a2 = acos(clamp(dot(d, g_n2), -1.0, 1.0)) / g_v2;

    float best = a0; float own = 0.0;
    if (a1 < best) { best = a1; own = 1.0; }
    if (a2 < best) { best = a2; own = 2.0; }
    g_own = own;

    // How close the sample sits to the watershed between two colonies.
    float second = max(max(min(a0, a1), min(a1, a2)), min(a0, a2));
    g_edge = smoothstep(0.10, 0.0, second - best);

    float arc;
    float across;
    if (own < 0.5)      across = channelAt(d, g_n0, g_t0, arc);
    else if (own < 1.5) across = channelAt(d, g_n1, g_t1, arc);
    else                across = channelAt(d, g_n2, g_t2, arc);
    g_arc = arc;
    g_chan = across;

    // A channel that carries more gathers wider, so the width grows as
    // it nears the nucleus it drains into.
    float wid = g_cw * (1.15 - 0.45 * arc);
    float cut = smoothstep(wid, 0.0, across);

    // The watershed seals over into cold stone and stands slightly proud.
    return g_R * (1.0 - g_cut * cut + 0.020 * g_edge);
}

float map(vec3 p) {
    float r = length(p);
    if (r < 1e-5) return -g_R;
    vec3 d = p / r;
    float surf = terrainRadius(d);

    float outer = r - surf;
    float inner = (surf - g_wall) - r;
    float dd = max(outer, inner);

    // Once the wall is thin the deepest channel breaks right through it.
    // A pierce width at or below zero reaches nothing, since the across
    // measure never goes negative.
    dd = max(dd, (g_pierce - g_chan) * 0.50);
    return dd * 0.85;
}

// Three tangent samples: the surface is a height over the sphere, so its
// slope only ever has two components.
vec3 terrainNormal(vec3 p) {
    vec3 d = normalize(p);
    vec3 ax = abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tu = normalize(cross(ax, d));
    vec3 tv = cross(d, tu);
    float e = 0.0045;
    float r0 = terrainRadius(d);
    float ru = terrainRadius(normalize(d + tu * e));
    float rv = terrainRadius(normalize(d + tv * e));
    return normalize(d - (tu * (ru - r0) + tv * (rv - r0)) / (e * max(r0, 1e-4)));
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

    g_cut    = w1 * 0.045 + w2 * 0.130 + w3 * 0.215;
    g_wall   = w1 * 0.520 + w2 * 0.180 + w3 * 0.070;
    g_cw     = w1 * 0.055 + w2 * 0.085 + w3 * 0.120;
    g_pierce = w1 * -1.00 + w2 * 0.011 + w3 * 0.034;
    g_freq   = w1 * 9.00  + w2 * 14.00 + w3 * 20.00;

    // The three vigours are the three bands. At silence all three sit at
    // one, so the partition is an even three-way split and the resting
    // state is balanced rather than owned by whichever band led last.
    float cg = 0.35 + 1.55 * contest;
    g_v0 = 1.0 + cg * lo;
    g_v1 = 1.0 + cg * md;
    g_v2 = 1.0 + cg * hi;

    // Shared parameters, sliding across the whole selector range so the
    // envelope keeps moving even at a fifty-fifty blend (guide 12.6).
    g_R    = (0.78 + 0.06 * AUDIO_LEVEL) * (0.98 + 0.03 * sin(ph * TAU));
    g_mean = 0.20 + 0.85 * meander;
    g_hue  = 0.06 * sin(ph * TAU);

    // Nuclei on their own slow drift, so the partition is never rigid.
    float o0 = g_ph + 0.4, o1 = g_ph + 2.5, o2 = g_ph + 4.6;
    g_n0 = normalize(vec3(cos(o0), 0.30 + 0.16 * sin(g_ph * 2.0), sin(o0)));
    g_n1 = normalize(vec3(cos(o1), -0.05 + 0.18 * cos(g_ph * 2.0), sin(o1)));
    g_n2 = normalize(vec3(cos(o2), -0.30 + 0.14 * sin(g_ph * 3.0), sin(o2)));

    // A tangent per nucleus, so the azimuth around it is well defined.
    g_t0 = normalize(cross(g_n0, vec3(0.0, 1.0, 0.031)));
    g_t1 = normalize(cross(g_n1, vec3(0.0, 1.0, 0.031)));
    g_t2 = normalize(cross(g_n2, vec3(0.0, 1.0, 0.031)));

    // ---- camera (guide 5) -------------------------------------------
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);

    vec3 lightD = normalize(vec3(0.42, 0.74, 0.52));

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
            if (d < 0.0009) { hit = true; break; }
            t += d * 0.70;
            if (t > tb1) break;
        }

        if (hit) {
            vec3 n = terrainNormal(p);
            float own = g_own;
            float arc = g_arc;
            float across = g_chan;
            float edge = g_edge;

            float dif = clamp(dot(n, lightD), 0.0, 1.0);
            float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);

            float wid = g_cw * (1.15 - 0.45 * arc);
            float inChan = smoothstep(wid, wid * 0.25, across);
            // Load carried: a channel gathers as it nears its nucleus, so
            // it is brightest at the trunk and faint at the headwaters.
            float load = inChan * (0.30 + 0.95 * (1.0 - arc));

            // A pulse running down the channel toward the nucleus it
            // drains into, one pass per loop, snapped by the kick.
            float front = fract(-ph * 2.0 + 1.0);
            float pulse = smoothstep(0.13, 0.0, abs(arc - front)) * inChan
                        * (0.35 + 1.75 * AUDIO_KICK);

            // The pool the channels drain into, standing in for the
            // singular point they all converge on.
            float pool = smoothstep(0.085, 0.012, arc);

            vec3 cc = colonyCol(own);
            float vig = (own < 0.5) ? g_v0 : ((own < 1.5) ? g_v1 : g_v2);
            float share = clamp((vig - 1.0) * 0.85, 0.0, 1.0);

            // Cold stone everywhere the colonies have not reached, with
            // the watershed sealed over and standing slightly proud.
            vec3 stone = stone_tint.rgb * (0.16 + 0.95 * dif);
            stone = mix(stone, stone_tint.rgb * 0.45, edge);

            col = stone
                + cc * load * (1.25 + 2.80 * emissive) * (0.70 + 0.60 * share)
                     * (0.70 + 0.80 * AUDIO_BEAT)
                + cc * pulse * (1.20 + 2.20 * emissive)
                + cc * pool * (1.10 + 2.40 * emissive) * (0.65 + 0.95 * AUDIO_BEAT)
                + mix(stone_tint.rgb, cc, 0.75) * fre * (0.45 + 0.95 * emissive)
                + vec3(1.0, 0.97, 0.94)
                  * pow(clamp(dot(reflect(rd, n), lightD), 0.0, 1.0), 40.0) * 0.55;
            alpha = 1.0;
        }
    }

    // ---- bounded sheath from the closest approach (guide 8) ----------
    float ca = clamp(1.0 - near * 5.6, 0.0, 1.0);
    float sheath = (pow(ca, 6.0) * 0.28 + pow(ca, 30.0) * 0.60) * (1.0 - alpha);
    sheath *= smoothstep(0.442, 0.10, rr) * (0.40 + 0.60 * emissive)
            * (0.55 + 0.90 * AUDIO_BEAT);
    col += colony_tint.rgb * sheath;
    alpha = clamp(alpha + sheath * 0.55, 0.0, 1.0);

    col = col / (1.0 + col * 0.30);
    col = pow(max(col, 0.0), vec3(0.90));
    alpha = clamp(alpha, 0.0, 1.0) * bound;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
