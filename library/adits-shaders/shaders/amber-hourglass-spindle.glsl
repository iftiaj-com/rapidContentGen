/*{
  "ADITS": 1,
  "DESCRIPTION": "An amber-lit glass hourglass whose lens-shaped bulbs and axial sand grains morph across four states under spectral balance: a fat molten glass bulb, a ribbed brass vase, a faceted crystal gem, and a slender glass spindle trailing a long needle spire. Bass swells the bulbs, treble draws out the spire and facets, mid drives a slow precession. Rests as the molten glass bulb.",
  "CREDIT": "claude-sonnet-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "geometry", "glass", "hourglass", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "sens",       "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",       "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",       "TYPE": "float", "DEFAULT": 0.05, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "swell",      "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.60, "MAX": 1.60,
      "LABEL": "Bulb Swell", "BIND": "bass", "BIND_DEPTH": 0.5 },
    { "NAME": "spireReach", "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.10, "MAX": 1.40,
      "LABEL": "Spire Reach", "BIND": "treble", "BIND_DEPTH": 0.55 },
    { "NAME": "twist",      "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.00, "MAX": 1.20,
      "LABEL": "Precession", "BIND": "mid", "BIND_DEPTH": 0.5 },
    { "NAME": "sandColor",  "TYPE": "color", "DEFAULT": [1.00, 0.62, 0.18, 1.00],
      "LABEL": "Sand Glow" },
    { "NAME": "glassColor", "TYPE": "color", "DEFAULT": [0.35, 0.55, 1.00, 1.00],
      "LABEL": "Glass Rim" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 24.0

// 56-step march plus a 4-tap normal is 60 field evaluations at a hit, inside
// the 96 ceiling. The grain loop below is 4 arithmetic-only iterations, no
// extra map() calls, so it does not add to that budget.
#define MAX_STEPS 56
#define SURF_DIST 0.0012

// The profile below is a distance-to-revolution approximation (radial
// distance only, ignoring the curve's slope), which slightly overestimates
// near the tapered tip. Damping the step keeps the march from overshooting.
#define STEP_DAMP 0.78

#define BULB_H 1.00
#define SPIRE_LEN 0.85
#define SPIRE_R 0.028
#define FACET_N 7.0
#define RIB_FREQ 26.0

// Bounding radius: max belly (0.60 * swell ceiling 1.3) plus rib/facet bulge,
// combined with max half-height (BULB_H + spire ceiling 0.85) as an
// independent worst case. Camera picked so this sphere's own silhouette
// lands at ~0.40 of the frame, inside the 0.46 target from any orbit.
#define BOUND 2.10
#define ORBIT 6.20
#define FOCAL 1.10

float g_bulge, g_rib, g_facet, g_spire, g_belly, g_neck, g_rot;

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

float map(vec3 p) {
    p.xz = rot2D(-g_rot) * p.xz;

    float yy = abs(p.y);
    float x  = clamp(yy / BULB_H, 0.0, 1.0);

    // Radius profile: neckR at x=0, bulges to bellyR at x=0.5, tapers to a
    // point at x=1. g_bulge shapes the taper from a fat round curve to a
    // slender concave spindle.
    float half1     = smoothstep(0.0, 1.0, clamp(x * 2.0, 0.0, 1.0));
    float risePart  = mix(g_neck, g_belly, half1);
    float half2     = clamp((x - 0.5) * 2.0, 0.0, 1.0);
    float fallPart  = g_belly * pow(1.0 - half2, max(g_bulge, 0.1));
    float radius    = mix(risePart, fallPart, step(0.5, x));

    float ang       = atan(p.z, p.x);
    float facetEnv  = smoothstep(0.0, 0.15, x) * smoothstep(1.0, 0.7, x);
    float ribEnv    = smoothstep(0.02, 0.20, x) * smoothstep(0.98, 0.75, x);
    radius *= 1.0 + g_facet * cos(ang * FACET_N) * facetEnv;
    radius *= 1.0 + g_rib   * sin(yy * RIB_FREQ)  * ribEnv;

    // A thin needle continuing past the bulb's point, blended in near x=1.
    float spireLen  = g_spire * SPIRE_LEN;
    float sy        = clamp(yy - BULB_H, 0.0, spireLen);
    float spireFade = smoothstep(0.0, 0.05, spireLen);
    float spireRad  = SPIRE_R * (1.0 - sy / max(spireLen, 1e-4)) * spireFade;
    float tSpire    = smoothstep(BULB_H - 0.03, BULB_H + 0.03, yy);
    radius = mix(radius, spireRad, tSpire);

    return length(p.xz) - radius;
}

// 4 taps instead of 6 (guide §9).
vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) +
                      k.yyx * map(p + k.yyx * e) +
                      k.yxy * map(p + k.yxy * e) +
                      k.xxx * map(p + k.xxx * e));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Morph selector (§12.2/12.3): spectral tilt, expanded and shoved by the
    // onset pulses directly (§12.4 forbids TIME-windowed easing here).
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    float live    = smoothstep(0.02, 0.12, lo + md + hi);
    float selNorm = mix(rest, sel, live);
    float axis    = selNorm * 3.0;

    // Triangular kernel, slope 1.5, one archetype per integer position:
    // 0 molten bulb, 1 ribbed vase, 2 faceted gem, 3 needle spindle.
    vec4 w;
    w.x = max(0.0, 1.0 - 1.5 * abs(axis - 0.0));
    w.y = max(0.0, 1.0 - 1.5 * abs(axis - 1.0));
    w.z = max(0.0, 1.0 - 1.5 * abs(axis - 2.0));
    w.w = max(0.0, 1.0 - 1.5 * abs(axis - 3.0));
    w /= (w.x + w.y + w.z + w.w + 1e-4);

    g_bulge = dot(w, vec4(0.70, 1.10, 1.45, 2.30));
    g_rib   = dot(w, vec4(0.00, 0.34, 0.08, 0.02));
    g_facet = dot(w, vec4(0.00, 0.05, 0.50, 0.10));
    g_spire = dot(w, vec4(0.00, 0.06, 0.36, 1.00)) * spireReach;
    g_belly = dot(w, vec4(0.60, 0.50, 0.42, 0.27)) * swell;
    g_neck  = dot(w, vec4(0.10, 0.085, 0.07, 0.045)) * swell;

    // One turn per LOOP, plus a mid-bound precession wobble at an integer
    // multiple of the loop frequency, so silence still loops exactly (§10).
    float ph = fract(TIME / PERIOD);
    g_rot = ph * TAU + twist * 0.5 * sin(ph * TAU * 3.0);

    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // Analytic sphere bound: rays that miss the object cost one quadratic
    // instead of a full march (§9).
    float b = dot(ro, rd);
    float cq = dot(ro, ro) - BOUND * BOUND;
    float h = b * b - cq;

    bool hit = false;
    vec3 p = ro;
    if (h > 0.0) {
        float hs = sqrt(h);
        float t  = max(-b - hs, 0.0);
        float t1 = -b + hs;
        for (int i = 0; i < MAX_STEPS; i++) {
            p = ro + rd * t;
            float d = map(p);
            if (d < SURF_DIST) { hit = true; break; }
            t += d * STEP_DAMP;
            if (t > t1) break;
        }
    }

    // Shared nucleus (§12.6): a glowing axial rod and travelling sand grains,
    // always present regardless of archetype. The axis is world Y regardless
    // of g_rot, since the object only spins about that axis.
    vec3 axisDir = vec3(0.0, 1.0, 0.0);
    vec3 dperp = rd - dot(rd, axisDir) * axisDir;
    vec3 eperp = ro - dot(ro, axisDir) * axisDir;
    float dd = dot(dperp, dperp);
    float tc = dd > 1e-6 ? -dot(eperp, dperp) / dd : 0.0;
    float distAxis = length(eperp + dperp * tc);
    float yc = ro.y + rd.y * tc;

    float core = 0.0009 / (distAxis * distAxis + 0.0006) *
                 smoothstep(BULB_H * 1.1, 0.0, abs(yc));

    float totalHeight = BULB_H + g_spire * SPIRE_LEN;
    float grain = 0.0;
    for (int i = 0; i < 4; i++) {
        float off      = float(i) / 4.0;
        float phase    = fract(ph * 6.0 + off);
        float travelY  = mix(-totalHeight, totalHeight, phase);
        float grainRad = 0.0006 / (distAxis * distAxis + 0.0004);
        grain += grainRad * smoothstep(0.06, 0.0, abs(yc - travelY));
    }
    grain *= 0.6 + 0.4 * AUDIO_BEAT;

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (hit) {
        vec3 n = calcNormal(p);
        vec3 viewDir = -rd;
        float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 2.5);
        float shade = 0.4 + 0.6 * clamp(dot(n, normalize(vec3(0.4, 0.8, 0.5))), 0.0, 1.0);

        vec3 body = mix(sandColor.rgb, glassColor.rgb, clamp(fres + g_facet * 0.6, 0.0, 1.0)) * shade;
        body *= 1.0 + 0.5 * AUDIO_BEAT + 0.5 * hi;

        col = body;
        alpha = 1.0;
    }

    col   += sandColor.rgb * core * 1.4;
    alpha += clamp(core * 1.4, 0.0, 1.0);
    col   += mix(sandColor.rgb, glassColor.rgb, 0.5) * grain * 1.6;
    alpha += clamp(grain * 1.6, 0.0, 1.0);

    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
