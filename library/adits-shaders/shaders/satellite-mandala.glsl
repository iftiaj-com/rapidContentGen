/*{
  "ADITS": 1,
  "DESCRIPTION": "A kinetic satellite mandala: a faceted low-poly core that never changes, ringed by thirty-two satellites on a Fibonacci shell that each change species on their own schedule. Each is one orb, spoke and needle under six interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: heavy orb, spiked orb, barbed spike, needle node. Bass swells the shell into orbs, treble draws it out to needles. Rests as the spiked orb.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-20",
  "CATEGORIES": ["generative", "morph", "mandala", "lowpoly", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",     "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",     "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",     "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "coreSize", "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.22, "MAX": 0.44,
      "LABEL": "Core Size", "BIND": "level", "BIND_DEPTH": 0.30 },
    { "NAME": "spread",   "TYPE": "float", "DEFAULT": 0.70, "MIN": 0.55, "MAX": 0.84,
      "LABEL": "Satellite Orbit", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "spike",    "TYPE": "float", "DEFAULT": 0.17, "MIN": 0.05, "MAX": 0.30,
      "LABEL": "Needle Length", "BIND": "treble", "BIND_DEPTH": 0.5 },
    { "NAME": "wire",     "TYPE": "bool",  "DEFAULT": false,
      "LABEL": "Wireframe" }
  ]
}*/

#define TAU        6.28318530718
#define GOLDEN     3.88322207745   // 2*PI / phi, the Fibonacci-sphere step
#define NSAT       32              // satellite orbs on the shell
#define NFACE      30              // slab pairs, so 60 facets on the core
#define ORB_R      0.100           // orb radius in object units
#define OBJ_SCALE  0.400           // object radius 1.0 maps to this uv radius
#define DIST       3.40            // camera distance, in object units

// How far the per-satellite selector is spread across the shell. The change
// then crosses it pole to pole instead of flipping all thirty-two at once.
#define STAGGER 1.05

// Two fixed studio lights, exactly the pair the original scene used: a cyan
// key from above and a magenta fill from below. They live in world space, so
// the spinning object carries highlights across its facets.
#define L1 vec3( 0.3814,  0.7628,  0.5240)
#define L2 vec3(-0.3814, -0.7628, -0.5240)
#define C1 vec3( 0.15,  1.00,  1.00)
#define C2 vec3( 1.00,  0.10,  0.62)

float hash11(float p) {
    return fract(sin(p * 127.1) * 43758.5453);
}

vec3 rotY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 rotX(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

// Object space back to the fixed frame the lights live in.
vec3 toWorld(vec3 p, float spin, float tilt) {
    return rotY(rotX(p, tilt), spin);
}

// Returns the distance to the segment in x, and how far along it in y, so the
// needle can taper from base to point the way a cone does.
vec2 segDistH(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return vec2(length(pa - ba * h), h);
}

// Flat-shaded metal under the two studio lights. The white ambient term is
// deliberately strong: two saturated lights alone multiply every base colour
// toward their own hue, which is what turns a pink facet teal.
vec3 litSurface(vec3 n, vec3 v, vec3 base, float metal, float rough) {
    float d1 = max(dot(n, L1), 0.0);
    float d2 = max(dot(n, L2), 0.0);
    vec3 h1 = normalize(L1 + v);
    vec3 h2 = normalize(L2 + v);
    float sh = mix(110.0, 18.0, rough);
    float s1 = pow(max(dot(n, h1), 0.0), sh);
    float s2 = pow(max(dot(n, h2), 0.0), sh);
    float fres = 1.0 - max(dot(n, v), 0.0);
    fres = fres * fres * fres;
    float key = 0.66 * d1 + 0.50 * d2;                  // white shaping
    vec3 wash = C1 * d1 * 0.34 + C2 * d2 * 0.34;        // coloured rim wash
    vec3 diffuse = base * (0.30 + key) + base * wash;
    vec3 spec = (C1 * s1 + C2 * s2) * mix(0.45, 1.7, metal);
    return diffuse + spec + base * fres * 0.70;
}

void main() {
    // Canonical preamble, then a second copy scaled into object units so the
    // whole design can be reasoned about at radius 1.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;
    vec2 sp = uv / OBJ_SCALE;

    // One phase for the whole shader. Every rate below is an integer multiple
    // of it, so the 16 s loop closes exactly. Nothing on the morph path reads
    // it: which satellite is which belongs to the music, not to the clock.
    float ph = fract(TIME / 16.0);
    float spin = TAU * ph;                    // one full turn per loop
    float tilt = 0.16 * sin(TAU * ph);        // one nod per loop
    float breathe = 1.0 + 0.05 * sin(TAU * ph * 2.0);
    float pulse   = 1.0 + 0.22 * sin(TAU * ph * 3.0);

    // Fit the object inside the frame whatever the sliders and binds ask for.
    // uv only reaches 0.5 on the axes, so the tip budget is radius 1.12 here.
    float sSpread = spread * breathe;
    float sSpike  = spike * pulse;
    float fitK = min(1.0, 1.12 / max(sSpread + sSpike + ORB_R, 0.001));
    sSpread *= fitK;
    sSpike  *= fitK;
    float orbR  = ORB_R * fitK;
    float coreR = coreSize * fitK;

    // --- Selector -------------------------------------------------------------
    // Balance decides which satellite; loudness only decides how hard it flares.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt2 = (md * 0.5 + hi) / sum;           // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt2 - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws a satellite out to a needle, a kick swells it into an orb.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry. AUDIO_BEAT
    // already decays, so it is used straight and the floor keeps the rim lit in
    // silence.
    float flare = 0.40 + 0.75 * snap * AUDIO_BEAT;

    // Camera. The ray origin follows CAM_DIR, so orbiting the real camera
    // orbits the object instead of tilting a flat picture of it.
    vec3 ro0 = CAM_DIR * DIST;
    vec3 ww0 = normalize(-ro0);
    vec3 uu0 = normalize(cross(CAM_UP, ww0));

    // Spin the object by turning the whole camera frame the other way.
    vec3 ro = rotX(rotY(ro0, -spin), -tilt);
    vec3 ww = rotX(rotY(ww0, -spin), -tilt);
    vec3 uu = rotX(rotY(uu0, -spin), -tilt);
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(sp.x * uu + sp.y * vv + DIST * ww);

    // Incremental rotation for the Fibonacci sequences: four multiplies per
    // step instead of a sine and a cosine, which matters at 60-odd steps.
    float cA = cos(GOLDEN);
    float sA = sin(GOLDEN);

    // ---- Faceted core: the shared part, which never changes species --------
    // The original was a subdivided icosahedron. Here the same read comes from
    // the intersection of NFACE centrally symmetric slabs: an exact convex
    // polyhedron with exact per-face normals and an angular silhouette, for
    // one cheap pass and no marching at all.
    float tNear = -1.0e9;
    float tFar  =  1.0e9;
    vec3  coreN = vec3(0.0, 1.0, 0.0);
    float faceId = 0.0;
    float coreMiss = 0.0;

    vec2 rt = vec2(1.0, 0.0);
    for (int i = 0; i < NFACE; i++) {
        float y = 1.0 - float(i) / float(NFACE);       // upper hemisphere only:
        float rr = sqrt(max(0.0, 1.0 - y * y));        // each slab covers both signs
        vec3 n = vec3(rt.x * rr, y, rt.y * rr);
        rt = vec2(rt.x * cA - rt.y * sA, rt.x * sA + rt.y * cA);

        float o  = dot(ro, n);
        float dv = dot(rd, n);
        if (abs(dv) < 1.0e-5) {
            if (abs(o) > coreR) coreMiss = 1.0;
        } else {
            float t1 = (-coreR - o) / dv;
            float t2 = ( coreR - o) / dv;
            float tn = min(t1, t2);
            float tf = max(t1, t2);
            if (tn > tNear) {
                tNear = tn;
                coreN = dv > 0.0 ? -n : n;
                faceId = float(i);
            }
            tFar = min(tFar, tf);
        }
    }
    float coreHit = (coreMiss < 0.5 && tNear <= tFar && tFar > 0.0) ? 1.0 : 0.0;
    float coreT = coreHit > 0.5 ? max(tNear, 0.0) : 1.0e9;

    // ---- Satellite shell --------------------------------------------------
    float bestT = 1.0e9;
    vec3  orbN  = vec3(0.0, 1.0, 0.0);
    float orbId = 0.0;
    float orbHit = 0.0;
    float needleMask = 0.0;
    float needleDepth = 1.0e9;
    float strutMask = 0.0;
    float strutDepth = 1.0e9;
    float wireOrb = 0.0;
    float halo = 0.0;

    rt = vec2(1.0, 0.0);
    for (int i = 0; i < NSAT; i++) {
        float fi = float(i);
        float y = 1.0 - (fi / float(NSAT - 1)) * 2.0;
        float rr = sqrt(max(0.0, 1.0 - y * y));
        vec3 dir = vec3(rt.x * rr, y, rt.y * rr);
        rt = vec2(rt.x * cA - rt.y * sA, rt.x * sA + rt.y * cA);

        // Per-satellite selector. The shell index runs pole to pole, so it
        // doubles as the sweep coordinate; the hash keeps that sweep from
        // looking mechanical. Both are static, so at a fixed spectrum the
        // mandala holds still: the wave is positioned by the music.
        float uS = fi / float(NSAT - 1);
        float jt = hash11(fi * 2.71 + 9.0);
        float xj = clamp(x0 + STAGGER * (0.66 * (uS - 0.5) + 0.34 * (jt - 0.5)),
                         0.0, 3.0);

        // Triangular weights of slope 1.85. Support is 1/1.85 either side of a
        // centre and the centres are spaced 1.0, so neighbours overlap over
        // 2/1.85 - 1 = 0.081 of the axis and the sum is never zero. The slope
        // must stay below 2.0 or the normalisation divides by nothing.
        float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
        float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
        float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
        float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
        float ws = w0 + w1 + w2 + w3;
        w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

        // Parameter-space morph. One orb, spoke and needle under six numbers, so
        // the satellite deforms and no fragment shows two forms at half alpha.
        //             orb        spiked     spike      needle
        float orbM = 1.45 * w0 + 1.00 * w1 + 0.72 * w2 + 0.42 * w3;   // orb radius
        float splM = 0.40 * w0 + 1.00 * w1 + 1.30 * w2 + 1.55 * w3;   // needle
        float nwM  = 1.90 * w0 + 1.00 * w1 + 0.70 * w2 + 0.40 * w3;   // needle gauge
        float swM  = 1.70 * w0 + 1.00 * w1 + 0.72 * w2 + 0.42 * w3;   // spoke gauge
        float spdM = 0.92 * w0 + 1.00 * w1 + 1.05 * w2 + 1.10 * w3;   // orbit
        float hlM  = 0.55 * w0 + 1.00 * w1 + 1.25 * w2 + 1.60 * w3;   // halo

        // Per-satellite fit. The global fitK above cannot know which form this
        // satellite took, so its own reach is clamped here instead: that keeps
        // the longest needle inside radius 1.12 without shrinking the whole
        // mandala to make room for a form most satellites are not in.
        float sat  = sSpread * spdM;
        float spk  = sSpike * splM;
        float orbI = orbR * orbM;
        float fk   = min(1.0, 1.12 / max(sat + spk + orbI, 0.001));
        sat *= fk; spk *= fk; orbI *= fk;

        vec3 P = dir * sat;

        // Analytic ray-sphere: one quadratic per orb, no marching.
        vec3 oc = ro - P;
        float b = dot(oc, rd);
        float c = dot(oc, oc) - orbI * orbI;
        float h = b * b - c;
        if (h > 0.0) {
            float t = -b - sqrt(h);
            if (t > 0.001 && t < bestT) {
                bestT = t;
                orbN  = (ro + rd * t - P) / orbI;
                orbId = fi;
                orbHit = 1.0;
            }
        }

        // Silhouette ring, used by the see-through wireframe mode.
        float dRay = length(cross(P - ro, rd));
        wireOrb = max(wireOrb, smoothstep(orbI, orbI * 0.93, dRay)
                             - smoothstep(orbI * 0.90, orbI * 0.80, dRay));

        // Radial shaft from the core out to the orb: the spoke that makes the
        // arrangement read as one mandala rather than a cloud of loose balls.
        // Its depth is interpolated along the segment, so the core correctly
        // hides the half of every far-side shaft that passes behind it.
        vec3 relS0 = dir * (coreR * 0.90) - ro;
        vec3 relS1 = dir * (sat - orbI * 0.40) - ro;
        float z0 = dot(relS0, ww);
        float z1 = dot(relS1, ww);
        if (z0 > 0.15 && z1 > 0.15) {
            vec2 s0 = vec2(dot(relS0, uu), dot(relS0, vv)) * (DIST / z0);
            vec2 s1 = vec2(dot(relS1, uu), dot(relS1, vv)) * (DIST / z1);
            vec2 sg = segDistH(sp, s0, s1);
            float ws = 0.026 * swM * (DIST / z1) * (1.0 - 0.25 * sg.y);
            float ms = smoothstep(ws, ws * 0.35, sg.x);
            float zmid = mix(z0, z1, sg.y);
            if (ms > strutMask) {
                strutMask = ms;
                strutDepth = zmid;
            }
        }

        // Needle. At this thickness a projected segment and a real cone are
        // indistinguishable, and the segment costs a fraction of a quadratic.
        vec3 relB = (P + dir * (orbI * 0.55)) - ro;
        vec3 relT = (P + dir * (orbI + spk)) - ro;
        float zb = dot(relB, ww);
        float zt = dot(relT, ww);
        if (zb > 0.15 && zt > 0.15) {
            vec2 sb = vec2(dot(relB, uu), dot(relB, vv)) * (DIST / zb);
            vec2 st = vec2(dot(relT, uu), dot(relT, vv)) * (DIST / zt);
            vec2 seg = segDistH(sp, sb, st);
            float dseg = seg.x;
            // Taper to a point, so the needle reads as the cone it replaces.
            float w = 0.0155 * nwM * (DIST / zb) * (1.0 - 0.92 * seg.y);
            float m = smoothstep(w, w * 0.25, dseg);
            if (m > needleMask) {
                needleMask = m;
                needleDepth = zb;
            }
            halo += 0.00022 * hlM / (dseg * dseg + 0.0026);
        }
    }

    // ---- Shading ----------------------------------------------------------
    vec3 col = vec3(0.0);
    float cvr = 0.0;
    vec3 vDir = -rd;

    if (wire) {
        // The original's wireframe mode: additive, see-through, cold blue.
        vec3 wireCol = vec3(0.35, 0.72, 1.00);
        float edge = 0.0;

        if (coreHit > 0.5) {
            // An edge is where a second face plane is also nearly touching, so
            // the two smallest slacks are tracked and the smaller discarded:
            // the smallest always belongs to the face we are standing on.
            vec3 pIn  = ro + rd * max(tNear, 0.0);
            vec3 pOut = ro + rd * tFar;
            float in1 = 1.0e9, in2 = 1.0e9;
            float out1 = 1.0e9, out2 = 1.0e9;

            vec2 r2 = vec2(1.0, 0.0);
            for (int j = 0; j < NFACE; j++) {
                float y2 = 1.0 - float(j) / float(NFACE);
                float rr2 = sqrt(max(0.0, 1.0 - y2 * y2));
                vec3 n2 = vec3(r2.x * rr2, y2, r2.y * rr2);
                r2 = vec2(r2.x * cA - r2.y * sA, r2.x * sA + r2.y * cA);

                float si = abs(coreR - abs(dot(pIn, n2)));
                if (si < in1) { in2 = in1; in1 = si; }
                else if (si < in2) { in2 = si; }

                float so = abs(coreR - abs(dot(pOut, n2)));
                if (so < out1) { out2 = out1; out1 = so; }
                else if (so < out2) { out2 = so; }
            }
            float ew = 0.011;
            edge = max(smoothstep(ew, 0.0, in2), smoothstep(ew, 0.0, out2) * 0.7);
        }

        float wireAmt = clamp(edge * 0.95
                            + clamp(wireOrb, 0.0, 1.0)
                            + strutMask * 0.70
                            + needleMask * 0.85, 0.0, 1.0);
        col = wireCol * wireAmt * (1.0 + flare * 0.9);
        col += wireCol * halo * flare * 0.45;
        cvr = clamp(wireAmt + halo * flare * 0.30, 0.0, 1.0);
    } else {
        float surfT = 1.0e9;
        if (orbHit > 0.5 && bestT < coreT) {
            vec3 nW = toWorld(orbN, spin, tilt);
            vec3 vW = toWorld(vDir, spin, tilt);
            vec3 base = mix(vec3(0.62, 0.95, 0.78), vec3(0.96, 1.00, 0.97),
                            hash11(orbId * 7.31 + 3.0));
            col = litSurface(nW, vW, base, 0.85, 0.18);
            cvr = 1.0;
            surfT = bestT;
        } else if (coreHit > 0.5) {
            vec3 nW = toWorld(coreN, spin, tilt);
            vec3 vW = toWorld(vDir, spin, tilt);
            // Per-facet colour: the pale pink, teal, plum and magenta the
            // original cycled through, scattered across the facets instead.
            // Adding the loop phase walks each facet through the palette at
            // its own moment, which is the six-state morph without the mush
            // that blending two colours together would produce.
            float hh = fract(hash11(faceId * 3.17 + 1.0) + ph);
            vec3 base;
            if (hh < 0.24)      base = vec3(0.97, 0.74, 0.82);   // pale rose
            else if (hh < 0.46) base = vec3(0.04, 0.62, 0.66);   // teal
            else if (hh < 0.68) base = vec3(0.26, 0.06, 0.20);   // dark plum
            else if (hh < 0.86) base = vec3(0.86, 0.16, 0.50);   // magenta
            else                base = vec3(0.90, 0.93, 0.97);   // chrome white
            col = litSurface(nW, vW, base, 0.95, 0.12);
            cvr = 1.0;
            surfT = coreT;
        }

        // Spokes, then needles over them, each hidden by anything nearer.
        float sVis = strutDepth < surfT ? strutMask : 0.0;
        vec3 sCol = vec3(0.17, 0.07, 0.32)
                  + vec3(0.42, 0.55, 0.95) * 0.30 * (1.0 - sVis);
        col = mix(col, sCol, sVis);
        cvr = max(cvr, sVis);

        float nVis = needleDepth < surfT ? needleMask : 0.0;
        vec3 nCol = vec3(0.05, 0.07, 0.11)
                  + vec3(0.35, 0.62, 0.85) * 0.40 * (1.0 - nVis);
        col = mix(col, nCol, nVis);
        cvr = max(cvr, nVis);

        col += vec3(0.35, 0.85, 1.00) * halo * flare * 0.50;
        cvr = clamp(cvr + halo * flare * 0.28, 0.0, 1.0);
    }

    // Soft knee: two coloured speculars on metal clip to flat white without
    // one, which throws away exactly the hue that makes it read as metal.
    col = col / (1.0 + col * 0.32);

    // Frame bound. The object tops out at 0.448 uv, so this only ever trims
    // the halo, and it reaches zero before the border at 0.5.
    float frame = smoothstep(0.492, 0.452, length(uv));
    col *= frame;
    cvr *= frame;

    float alpha = clamp(cvr, 0.0, 1.0);
    col *= alpha;
    gl_FragColor = vec4(col, alpha);
}
