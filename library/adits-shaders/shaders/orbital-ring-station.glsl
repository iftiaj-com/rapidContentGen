/*{
  "ADITS": 1,
  "DESCRIPTION": "An orbital ring station: a ribbed habitat wheel with lit window bays, four spokes into a docking hub, and an antenna mast through the axis. The whole station is one distance field under fifteen interpolated numbers, so it morphs by deforming rather than cross-fading, through four hulls: heavy drum, habitat wheel, bladed rotor, needle array. Bass swells the wheel, mid flares the collector blades, treble draws the mast and radial needles out. Rests as the habitat wheel.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "station", "orbital", "metal", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.82, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Hull" },
    { "NAME": "span",  "TYPE": "float", "DEFAULT": 0.94, "MIN": 0.80, "MAX": 1.14,
      "LABEL": "Ring Span", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "reach", "TYPE": "float", "DEFAULT": 0.92, "MIN": 0.72, "MAX": 1.30,
      "LABEL": "Mast Reach", "BIND": "treble", "BIND_DEPTH": 0.50 },
    { "NAME": "glow",  "TYPE": "float", "DEFAULT": 0.52, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Window Glow", "BIND": "level", "BIND_DEPTH": 0.55 },
    { "NAME": "hull",  "TYPE": "color", "DEFAULT": [0.72, 0.78, 0.86, 1.00],
      "LABEL": "Hull Tint" },
    { "NAME": "lamp",  "TYPE": "color", "DEFAULT": [1.00, 0.66, 0.24, 1.00],
      "LABEL": "Window Tint" }
  ]
}*/

// A port of a Shadertoy space station into the Adits profile. Everything the
// original took from a second pass or a texture sampler is gone or rebuilt: no
// earth, no sun disc, no sky, no iChannel lookups, no 250-step march. The
// station is drawn against transparent black, because the live footage is what
// belongs behind it.

#define TAU    6.28318530718
#define PERIOD 24.0
#define MARCH  56          // step budget; the soft cap in the guide is 64
#define SURF   0.0020
#define DIST   3.30        // camera distance, in object units
#define OBJ    0.412       // object radius 1.0 maps to this uv radius
#define BAYS   8.0         // radial bays around the wheel
#define LIMIT  1.02        // largest object radius that stays inside uv 0.46

// ---- primitives ----------------------------------------------------------

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return min(max(q.x, max(q.y, q.z)), 0.0) + length(max(q, 0.0));
}

// Capped cylinder about the y axis.
float sdCapCyl(vec3 p, float r, float h) {
    vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

vec3 rotY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 rotX(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

// ---- the station ---------------------------------------------------------
// One field, and no branch anywhere on the archetype. Every part is analytic,
// and the bays repeat by folding the angle instead of looping, so the cost is
// identical at every point on the morph axis.
//
// m0 = ring radius, ring half height, ring half depth, spoke radius
// m1 = blade reach, blade thickness, blade half height, needle length
// m2 = needle radius, mast length, mast radius, hub radius
// m3 = hub half height, antenna arm length, rib depth, unused
float sdStation(vec3 p, vec4 m0, vec4 m1, vec4 m2, vec4 m3) {
    float rl  = length(p.xz);
    float rad = rl - m0.x;                     // signed offset from the ring line

    // One angle per evaluation, shared by every repeated part. The epsilon
    // keeps atan defined for a ray that runs exactly down the mast axis.
    float a = atan(p.z, p.x + 1e-7);
    float k = TAU / BAYS;
    float aa = mod(a + 0.5 * k, k) - 0.5 * k;  // bay-centred angle
    float ab = mod(a, k) - 0.5 * k;            // half a bay across, for needles
    float tg = aa * rl;                        // tangential arc offset
    float tb = ab * rl;

    // Habitat wheel: a rounded box swept round the axis, ribbed three times
    // per bay. Rib amplitude times frequency stays well under one, so the ribs
    // deform the field without breaking the march.
    vec2 q = abs(vec2(rad, p.y)) - vec2(m0.z, m0.y);
    float wheel = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - 0.014;
    wheel -= m3.z * cos(a * BAYS * 3.0);

    // A rail along each rim of the wheel.
    float rail = length(vec2(rad - m0.z * 0.85, abs(p.y) - m0.y * 1.05)) - 0.013;
    wheel = min(wheel, rail);

    // Collector blades: one flat panel per bay, standing off the outer rim.
    float blade = sdBox(vec3(rad - m0.z - m1.x * 0.5, tg, p.y),
                        vec3(m1.x * 0.5, m1.y, m1.z)) - 0.005;

    // Radial needles between the blades, tapered to a point.
    float nOut = max(rad - m0.z, 0.0);
    float taper = m2.x * max(0.0, 1.0 - nOut / max(m1.w, 1e-3));
    float needle = length(vec2(tb, p.y)) - taper;
    needle = max(needle, rad - m0.z - m1.w);
    needle = max(needle, -rad);

    // Antenna mast through the axis, with cross arms every 0.22 units.
    float mast = max(rl - m2.z, abs(p.y) - m2.y);
    float yy = mod(p.y + 0.11, 0.22) - 0.11;
    vec3 pa = vec3(p.x, yy, p.z);
    float arm = min(sdBox(pa, vec3(m3.y, 0.005, 0.005)),
                    sdBox(pa, vec3(0.005, 0.005, m3.y)));
    arm = max(arm, abs(p.y) - m2.y);
    arm = max(arm, m3.x * 1.25 - abs(p.y));    // clear of the hub
    mast = min(mast, arm);

    // A dish at each end of the mast: one shallow disc, mirrored in y.
    float dish = sdCapCyl(vec3(p.x, abs(p.y) - m2.y * 0.88, p.z),
                          m2.z * 3.6, m2.z * 0.5);
    mast = min(mast, dish);

    // Docking hub and its collar.
    float hub = sdCapCyl(p, m2.w, m3.x) - 0.022;
    float collar = length(vec2(rl - m2.w * 0.94, abs(p.y) - m3.x * 0.55)) - 0.020;
    hub = min(hub, collar);

    // Four spokes from two evaluations: the x pair and the z pair.
    float spokes = min(max(length(p.yz) - m0.w, abs(p.x) - m0.x),
                       max(length(p.xy) - m0.w, abs(p.z) - m0.x));

    float d = min(wheel, min(blade, needle));
    d = min(d, min(mast, hub));
    return min(d, spokes);
}

// Four-tap tetrahedral normal.
vec3 calcNormal(vec3 p, vec4 m0, vec4 m1, vec4 m2, vec4 m3) {
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.0014;
    return normalize(k.xyy * sdStation(p + k.xyy * e, m0, m1, m2, m3) +
                     k.yyx * sdStation(p + k.yyx * e, m0, m1, m2, m3) +
                     k.yxy * sdStation(p + k.yxy * e, m0, m1, m2, m3) +
                     k.xxx * sdStation(p + k.xxx * e, m0, m1, m2, m3));
}

// Eight-step soft shadow. The original marched forty, which is four times the
// whole distance budget the profile allows.
float calcShadow(vec3 p, vec3 l, vec4 m0, vec4 m1, vec4 m2, vec4 m3) {
    float res = 1.0;
    float t = 0.02;
    for (int i = 0; i < 8; i++) {
        float h = sdStation(p + l * t, m0, m1, m2, m3);
        res = min(res, 14.0 * h / t);
        t += max(h, 0.010) * 0.95;
        if (t > 2.0) break;
    }
    return clamp(res, 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n, vec4 m0, vec4 m1, vec4 m2, vec4 m3) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 4; i++) {
        float h = 0.012 + 0.030 * float(i);
        occ += (h - sdStation(p + h * n, m0, m1, m2, m3)) * sca;
        sca *= 0.93;
    }
    return clamp(1.0 - 3.2 * occ, 0.0, 1.0);
}

void main() {
    // Canonical preamble, then a second copy in object units so the whole
    // design can be reasoned about at radius 1.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    vec2 sp = uv / OBJ;

    // One phase for the whole shader, wrapping exactly at LOOP. The station
    // turns once per loop and nods once per loop, so the cycle closes.
    float ph = fract(TIME / PERIOD);
    float spin = TAU * ph;
    float tilt = 0.62 + 0.10 * sin(TAU * ph);

    // --- Selector -----------------------------------------------------------
    // Balance decides which hull this is; loudness only decides how hard it is
    // lit. Never the clock: the identity belongs to the music.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float bal = (md * 0.5 + hi) / sum;              // 0 all bass, 1 all treble
    // bal is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer hulls never arrive.
    float sel = clamp((bal - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips the station to a needle array, a kick packs it back to a drum.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence bal is 0/0, so fade to the chosen resting hull instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x = sel * 3.0;

    // Triangular weights of slope 1.85: each hull holds a plateau and the
    // crossfade is confined to about a third of the axis. The slope must stay
    // under 2.0 or the normalisation divides by nothing.
    float w0 = max(1.0 - abs(x      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(x - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(x - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(x - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One field, fifteen interpolated numbers, so the
    // hull deforms and the march never has two stations to resolve.
    //               drum        wheel       rotor       needles
    float ringR  = 0.600 * w0 + 0.740 * w1 + 0.740 * w2 + 0.680 * w3;
    float ringY  = 0.250 * w0 + 0.110 * w1 + 0.062 * w2 + 0.028 * w3;
    float ringD  = 0.155 * w0 + 0.072 * w1 + 0.044 * w2 + 0.022 * w3;
    float spokeR = 0.050 * w0 + 0.030 * w1 + 0.019 * w2 + 0.011 * w3;
    float bladeL = 0.045 * w0 + 0.110 * w1 + 0.270 * w2 + 0.115 * w3;
    float bladeT = 0.028 * w0 + 0.017 * w1 + 0.010 * w2 + 0.006 * w3;
    float bladeY = 0.190 * w0 + 0.120 * w1 + 0.100 * w2 + 0.044 * w3;
    float needL  = 0.030 * w0 + 0.075 * w1 + 0.120 * w2 + 0.300 * w3;
    float needR  = 0.022 * w0 + 0.013 * w1 + 0.010 * w2 + 0.008 * w3;
    float mastL  = 0.380 * w0 + 0.640 * w1 + 0.810 * w2 + 0.960 * w3;
    float mastR  = 0.038 * w0 + 0.026 * w1 + 0.018 * w2 + 0.011 * w3;
    float hubR   = 0.250 * w0 + 0.180 * w1 + 0.138 * w2 + 0.096 * w3;
    float hubH   = 0.195 * w0 + 0.140 * w1 + 0.108 * w2 + 0.068 * w3;
    float armL   = 0.070 * w0 + 0.110 * w1 + 0.170 * w2 + 0.230 * w3;
    float ribD   = 0.005 * w0 + 0.003 * w1 + 0.002 * w2 + 0.001 * w3;

    // Shared continuous parameters, so the envelope keeps sliding even at a
    // 50/50 blend. The panel sliders ride on top of the morph numbers, and the
    // clock breathes the wheel once per loop.
    float breathe = 1.0 + 0.035 * sin(TAU * ph * 2.0);
    ringR *= span * breathe;
    mastL *= reach;
    needL *= reach;
    armL  *= 0.7 + 0.3 * reach;
    // Mid is the band with no structural role above, so it flares the blades.
    bladeL *= 1.0 + 0.45 * AUDIO_MID;

    // Fit whatever the sliders and the binds asked for back inside the frame,
    // so no reachable value clips at the edge.
    float outer = max(ringR + ringD + max(bladeL, needL), mastL);
    float fitK = min(1.0, LIMIT / max(outer, 1e-3));
    ringR *= fitK; ringY *= fitK; ringD *= fitK; spokeR *= fitK;
    bladeL *= fitK; bladeT *= fitK; bladeY *= fitK;
    needL *= fitK; needR *= fitK;
    mastL *= fitK; mastR *= fitK; hubR *= fitK; hubH *= fitK; armL *= fitK;

    vec4 m0 = vec4(ringR, ringY, ringD, spokeR);
    vec4 m1 = vec4(bladeL, bladeT, bladeY, needL);
    vec4 m2 = vec4(needR, mastL, mastR, hubR);
    vec4 m3 = vec4(hubH, armL, ribD, 0.0);

    // Camera. The ray origin follows CAM_DIR, so orbiting the real camera
    // orbits the station instead of tilting a flat picture of it. The station
    // carries its own spin and tilt by turning the whole frame the other way.
    vec3 ro0 = CAM_DIR * DIST;
    vec3 ww0 = normalize(-ro0);
    vec3 uu0 = normalize(cross(CAM_UP, ww0));
    // Tilt first, then spin about the object axis. The other order couples the
    // two and swings the wheel edge-on twice per loop, which is the one view
    // where a ring station has nothing to show.
    vec3 ro = rotY(rotX(ro0, -tilt), -spin);
    vec3 ww = rotY(rotX(ww0, -tilt), -spin);
    vec3 uu = rotY(rotX(uu0, -tilt), -spin);
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(sp.x * uu + sp.y * vv + DIST * ww);

    // Bound the march with one analytic sphere, so a ray that misses the
    // station costs a quadratic instead of fifty-six field evaluations.
    float bq = dot(ro, rd);
    float cq = dot(ro, ro) - LIMIT * LIMIT * 1.10;
    float hq = bq * bq - cq;
    if (hq < 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    float sq = sqrt(hq);
    float t = max(-bq - sq, 0.0);
    float tMax = -bq + sq;

    float dS = 1.0;
    for (int i = 0; i < MARCH; i++) {
        dS = sdStation(ro + rd * t, m0, m1, m2, m3);
        t += dS * 0.90;
        if (t > tMax || abs(dS) < SURF) break;
    }

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (t < tMax) {
        vec3 p = ro + rd * t;
        vec3 n = calcNormal(p, m0, m1, m2, m3);

        // ---- material from position --------------------------------------
        // Three surfaces, and no material id threaded through the march: the
        // hull, the lit window bays banding the wheel, and the dark collector
        // faces on the blades.
        float rl = length(p.xz);
        float rad = rl - ringR;
        float ang = atan(p.z, p.x + 1e-7);

        // Window ports: twenty-four around the wheel, three rows up its side
        // wall, and the same grid on the hub drum. Crisp rectangles, not a
        // smear, and only where the normal faces sideways rather than up.
        float onRing = smoothstep(ringD * 0.45, ringD * 0.80, abs(rad))
                     * smoothstep(ringY * 1.25, ringY * 0.95, abs(p.y));
        float onHub = smoothstep(hubR * 1.20, hubR * 0.94, rl)
                    * smoothstep(hubH * 1.15, hubH * 0.90, abs(p.y));
        float wall = max(onRing, onHub) * smoothstep(0.62, 0.30, abs(n.y));

        float bayU = ang * (BAYS * 3.0) / TAU;
        float pu = fract(bayU) - 0.5;
        float pv = fract(p.y / max(ringY, 1e-3) * 1.5 + 0.5) - 0.5;
        float port = smoothstep(0.30, 0.19, abs(pu))
                   * smoothstep(0.28, 0.15, abs(pv));
        // A static per-port hash puts some bays dark, so the ring reads as a
        // lived-in hull instead of a uniform grid. Static, so nothing strobes.
        float lit = fract(sin(floor(bayU) * 12.9898 + floor(pv + 0.5) * 4.1414
                              + floor(p.y * 37.0)) * 43758.5453);
        float win = wall * port * (0.22 + 0.78 * step(0.34, lit));

        // The two rim rails run as continuous lights, so the silhouette keeps
        // a hard edge even where no window faces the camera.
        float railD = length(vec2(rad - ringD * 0.85, abs(p.y) - ringY * 1.05)) - 0.013;
        float railM = smoothstep(0.008, -0.004, railD);

        float onBlade = smoothstep(ringD * 1.2, ringD * 2.6, rad)
                      * step(abs(n.y), 0.55);

        // AUDIO_BEAT and AUDIO_HAT already decay, so both are used straight.
        // The floors keep the station lit and the windows on in silence.
        float pulse = 0.30 + 0.70 * snap * AUDIO_BEAT;
        float flicker = 0.75 + 0.25 * AUDIO_HAT;

        // Dark hull, so the lights are what carry the object. A seam line once
        // per bay does the work the geometric ribs used to do, without turning
        // the hull corrugated.
        float seam = smoothstep(0.55, 0.95, abs(cos(ang * BAYS * 3.0)));
        vec3 steel = hull.rgb * (0.115 + 0.075 * seam);
        vec3 albedo = mix(steel, vec3(0.016, 0.030, 0.075), onBlade);

        // A key light that orbits once per loop, so its highlight travels
        // instead of reading as a smudge baked for one camera angle.
        vec3 key = normalize(vec3(2.6 * sin(TAU * ph), 2.2, 2.6 * cos(TAU * ph)) - p);
        vec3 fill = normalize(vec3(-2.2, -1.4, 1.6) - p);

        float ao = calcAO(p, n, m0, m1, m2, m3);
        float sh = calcShadow(p + n * 0.006, key, m0, m1, m2, m3);

        float d1 = max(0.0, dot(n, key));
        float d2 = max(0.0, dot(n, fill));
        vec3 h1 = normalize(key - rd);
        vec3 h2 = normalize(fill - rd);
        float s1 = pow(max(0.0, dot(n, h1)), 96.0);
        float s2 = pow(max(0.0, dot(n, h2)), 40.0);

        vec3 keyCol  = vec3(1.00, 0.90, 0.72);
        vec3 fillCol = vec3(0.24, 0.48, 0.92);

        // Radially symmetric environment term, so it survives the plane
        // tilting under the anamorphic camera.
        float sky = clamp(0.5 + 0.5 * n.y, 0.0, 1.0);
        vec3 ambient = sky * vec3(0.070, 0.086, 0.115)
                     + (1.0 - sky) * vec3(0.030, 0.026, 0.022);

        col = albedo * (d1 * keyCol * sh * 1.35 + d2 * fillCol * 0.70 + ambient * ao)
            + s1 * keyCol * sh * 2.2 * (0.7 + 0.6 * pulse)
            + s2 * fillCol * 0.7;

        // A grazing rim, radially symmetric, so the silhouette separates from
        // the footage at every viewing angle.
        float fres = 1.0 - max(0.0, dot(n, -rd));
        fres = fres * fres * fres;
        col += mix(vec3(0.45, 0.74, 1.00), lamp.rgb, 0.30) * fres * ao * 1.25
             * (0.75 + 0.5 * pulse);

        // Tone map and gamma the object only, never the empty frame.
        col = col / (col + vec3(1.0));
        col = pow(col, vec3(0.4545));

        // The lit window bays and the rim rails go on after the tone map, or
        // the curve pulls every bright emissive toward white and the amber and
        // cyan the design depends on wash out to cream.
        col += lamp.rgb * win * glow * 2.6 * flicker;
        col += vec3(0.24, 0.86, 1.00) * railM * glow * 1.5 * (0.6 + 0.4 * pulse);

        // A solid surface hit, so the silhouette is the coverage.
        alpha = 1.0;
    }

    // Premultiply. Colour is zero everywhere alpha is zero.
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
