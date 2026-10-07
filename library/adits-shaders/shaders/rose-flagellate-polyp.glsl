/*{
  "ADITS": 1,
  "DESCRIPTION": "A coral colony grown by a smooth-mirror recursive fold, on the bifurcating sphere-chain construction from a widely shared Shadertoy creature. Ten folds give limbs that writhe, a tail that lashes, and a swell travelling out along the chain, every joint on its own clock. Twelve numbers morph it through four forms: fused rose polyp, branched coral hand, two-ended spined spindle, pearl quill nova. Bass swells the lobes, mid writhes it, treble hones the nap. Rests as the coral hand.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-23",
  "CATEGORIES": ["raymarching", "morph", "recursive", "coral", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "high",
  "ASPECT": "square",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.88, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.66, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "girth",  "TYPE": "float", "DEFAULT": 1.00, "MIN": 0.70, "MAX": 1.30,
      "LABEL": "Lobe Girth", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "writhe", "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.06, "MAX": 0.85,
      "LABEL": "Writhe", "BIND": "mid", "BIND_DEPTH": 0.55 },
    { "NAME": "quill",  "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.30, "MAX": 1.80,
      "LABEL": "Bristle Hone", "BIND": "treble", "BIND_DEPTH": 0.60 },
    { "NAME": "fleshCol", "TYPE": "color", "DEFAULT": [1.00, 0.43, 0.34, 1.00],
      "LABEL": "Flesh Colour" },
    { "NAME": "tipCol",   "TYPE": "color", "DEFAULT": [1.00, 0.90, 0.84, 1.00],
      "LABEL": "Tip Colour" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 12.0

// Ten folds. Each one rotates the frame, smooth-mirrors it about x and steps
// out along that axis, so level i owns 2^i mirrored copies of one sphere and
// the whole colony is a single euclidean distance field. Nothing scales the
// coordinates, only the offsets and the radii, which is what keeps the field
// honest enough to march at a generous step.
#define LEVELS 10

// 46 march steps, a 4-tap normal, one material evaluation and one thickness
// probe at the hit: 52 field calls, inside the 96 ceiling. The field is a true
// euclidean distance, not a scaled fold, so it does not need the timid step a
// scale-corrected fractal does and 46 steps clear the bounding shell.
#define MAX_STEPS  46
#define STEP_SCALE 0.80

// Worst-case reach, from the geometric series sep/(1 - taper) plus the fattest
// reachable lobe and the smooth-union bulge, over every archetype, slider and
// bind: about 1.90. BOUND is the sphere the march runs inside.
#define BOUND 2.05
#define ORBIT 7.00
// Fitted against measured frames rather than the bound: the folds rotate the
// chain out of alignment, so the apparent radius is roughly two thirds of the
// worst-case reach and a focal length fitted to the bound draws a small object
// in the middle of an empty frame.
#define FOCAL 2.62

// Smoothing on the mirror. A hard abs() puts a crease down every fold and the
// normal flips across it; sqrt(x*x + e) rounds the seam for the cost of the
// square root the sphere needed anyway.
#define MIRROR 2.0e-5

// Papilla pitch, in units of one lobe radius. The amplitude is written as a
// fraction of the same radius and the frequency as its reciprocal, so amplitude
// times frequency is identical at every level: the bump keeps the same relative
// depth on the trunk and on the finest tip, and the field stays inside its
// Lipschitz bound wherever the taper has got to.
#define RIPF 30.0

// Per-level geometry, built once per pixel in main and read by the field, which
// runs 52 times. Everything here depends on the level and the clock but not on
// the sample point, so precomputing it lifts every trigonometric call out of the
// inner loop and leaves two square roots, three fracts and a smooth minimum.
vec4 gRot[LEVELS];   // cos/sin of the body twist, cos/sin of the tail whip
vec3 gGeo[LEVELS];   // fold offset, lobe radius, blend radius
vec2 gRip[LEVELS];   // papilla amplitude, papilla pitch

float gHub;                    // nucleus radius, after the kick swell
float gHubA, gHubF;            // nucleus nap, amplitude and pitch
float gA;                      // loop angle, TAU at the end of the cycle
float gCa, gSa, gCn, gSn;      // the object's own turn and nod
vec3  gC0, gC1, gC2, gC3, gCV; // nucleus, core, flesh, tip, crevice

// Polynomial smooth minimum. The blend radius is what turns ten separate
// beads into one fused lobe without changing how many bodies are evaluated.
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// The whole colony. mat carries rgb and a self-occlusion term the recursion
// gives away for free: a lobe that only just loses the minimum is sitting in
// a crevice beside its neighbour, and a crevice is dark.
float mapObj(vec3 p, out vec4 mat, bool doMat) {
    // One slow turn and one nod per loop, so no highlight bakes into one spot
    // and the silhouette keeps presenting a different profile.
    p.xz = vec2(gCa * p.x - gSa * p.z, gSa * p.x + gCa * p.z);
    p.yz = vec2(gCn * p.y - gSn * p.z, gSn * p.y + gCn * p.z);

    // The nucleus every archetype shares. It is what stops the middle of the
    // frame thinning out to nothing while one form hands over to the next, and
    // it carries the same nap so it does not read as a bare balloon under all
    // that texture.
    vec3 hn = abs(fract(p * gHubF) - 0.5);
    float d  = length(p) - gHub + gHubA * (hn.x + hn.y + hn.z - 0.75);
    float dm = d;
    vec3  cw = gC0;
    float occ = 0.0;

    for (int i = 0; i < LEVELS; i++) {
        vec4 R = gRot[i];
        vec3 G = gGeo[i];

        // Twist the frame twice: once about the growth axis, which coils the
        // trunk, and once across it, which is the lash that runs down the tail.
        p.xz = vec2(R.x * p.x - R.y * p.z, R.y * p.x + R.x * p.z);
        p.yz = vec2(R.z * p.y - R.w * p.z, R.w * p.y + R.z * p.z);

        // Smooth mirror, then step out. One line, and it is the whole
        // bifurcation: every level doubles the branch count.
        p.x = sqrt(p.x * p.x + MIRROR) - G.x;

        // The lobe, plus the nap that makes it flesh rather than plastic.
        // Three triangle waves summed, one per axis: a lattice of papillae
        // instead of the parallel rings a single sine draws, and no
        // transcendental in the inner loop to pay for it.
        vec2 P = gRip[i];
        vec3 nap = abs(fract(p * P.y) - 0.5);
        float dd = length(p) - G.y + P.x * (nap.x + nap.y + nap.z - 0.75);

        if (doMat) {
            // Occlusion first, against the previous best, or a new winner
            // would always measure a gap of zero and read as pure crevice.
            occ += 0.055 * (1.0 - smoothstep(0.0, G.z * 2.0 + 0.030, abs(dd - dm)));

            // Colour walks out along the chain: crimson at the core, coral
            // flesh through the body, pearl at the tips. Depth in the
            // recursion is the only thing that sets hue, so a branch reads as
            // one grown limb rather than a stack of unrelated beads.
            float u = float(i) * (1.0 / float(LEVELS - 1));
            vec3 lc = mix(mix(gC1, gC2, smoothstep(0.0, 0.20, u)),
                          gC3, smoothstep(0.76, 1.0, u));
            if (dd < dm) { dm = dd; cw = lc; }
        }

        d = smin(d, dd, G.z);
    }

    mat = vec4(cw, clamp(1.0 - occ, 0.06, 1.0));
    return d;
}

// Four-tap tetrahedral normal, per the performance rules.
vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    float e = 0.0014;
    vec4 mm;
    return normalize(k.xyy * mapObj(p + k.xyy * e, mm, false) +
                     k.yyx * mapObj(p + k.yyx * e, mm, false) +
                     k.yxy * mapObj(p + k.yxy * e, mm, false) +
                     k.xxx * mapObj(p + k.xxx * e, mm, false));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // --- Selector -----------------------------------------------------------
    // Which colony this is comes from the balance of the bands, never from the
    // clock, and nothing on this path is smoothed or windowed.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;
    // tilt is a ratio of three smoothed averages and barely moves on its own,
    // so it is expanded hard around its rest point or the outer forms never
    // arrive at all.
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // The onset pulses already decay. Used straight they shove the identity
    // inside the transient rather than over a bar.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x = sel * 3.0;

    // Triangular weights, slope 1.85. Each archetype holds a clean plateau
    // over most of its unit of the axis and the crossfade is confined to the
    // narrow band either side of a boundary, so the object spends its time
    // being one form rather than an average of two. Every one of the three
    // midpoints was rendered and checked: a blend has to be a plausible
    // creature too, and an earlier parameter set had one that collapsed into a
    // smooth shell.
    float w0 = max(1.0 - abs(x      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(x - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(x - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(x - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One folded field, twelve interpolated numbers, so
    // the body deforms into the next form and the march never has two shapes
    // to resolve at once.
    //
    // Spacing and blend radius are written as ratios of the lobe radius, not
    // as lengths. That is the whole trick: a level's beads then stay welded
    // into a limb however far the radius has tapered, so an archetype can run
    // out to a fine point without the chain breaking into loose dust.
    //             polyp         hand          spindle       nova
    float sepK   = 1.550 * w0 + 1.850 * w1 + 1.950 * w2 + 2.300 * w3;
    float bk     = 1.200 * w0 + 1.050 * w1 + 0.850 * w2 + 0.620 * w3;
    float taper  = 0.760 * w0 + 0.820 * w1 + 0.895 * w2 + 0.860 * w3;
    float tip    = 0.100 * w0 + 0.450 * w1 + 0.450 * w2 + 0.300 * w3;
    float rad    = 0.195 * w0 + 0.150 * w1 + 0.115 * w2 + 0.085 * w3;
    // The turn each fold applies, decaying with the taper. It is the single
    // number that decides silhouette: near zero the mirrored chain runs almost
    // straight out and the body is a two-ended spindle; large, it scrambles the
    // trunk and throws limbs in every direction. Nothing here uses a
    // non-decaying turn, because a constant turn winds the chain into a tight
    // shell and any blend that lands halfway into one collapses.
    float tw1    = 2.400 * w0 + 5.000 * w1 + 0.450 * w2 + 7.400 * w3;
    float tw2    = 0.500 * w0 - 1.200 * w1 - 0.150 * w2 - 0.550 * w3;
    float curl   = 0.340 * w0 + 0.280 * w1 + 0.200 * w2 + 0.120 * w3;
    float whip   = 0.160 * w0 + 0.300 * w1 + 0.480 * w2 + 0.240 * w3;
    float peri   = 0.340 * w0 + 0.260 * w1 + 0.160 * w2 + 0.090 * w3;
    float ripA   = 0.008 * w0 + 0.010 * w1 + 0.009 * w2 + 0.011 * w3;
    float nuc    = 0.340 * w0 + 0.240 * w1 + 0.190 * w2 + 0.150 * w3;

    // Bass swells every lobe, mid decides how hard the body writhes and how
    // far the tail lashes. The papilla amplitude is capped rather than scaled
    // straight off the treble: past the cap the displacement outruns its own
    // gradient and the field breaks up instead of getting sharper.
    rad  *= girth;
    curl *= writhe / 0.32;
    whip *= writhe / 0.32;
    ripA  = min(ripA * (0.50 + 0.60 * quill), 0.011);

    // Phase wraps exactly at LOOP = 12 s. This is the only place TIME appears.
    float ph = fract(TIME / PERIOD);
    gA = TAU * ph;

    gCa = cos(gA);          gSa = sin(gA);
    // The nod is a sine of the loop angle, not a fraction of it. A fraction
    // would ramp to 1.38 rad and snap back to zero at the seam.
    float nod = 0.22 * sin(gA);
    gCn = cos(nod);         gSn = sin(nod);

    // A kick swells the nucleus. AUDIO_KICK already decays, so it is a plain
    // multiplier and the nucleus rests at its archetype size in silence.
    gHub = nuc * (1.0 + 0.055 * AUDIO_KICK + 0.015 * sin(2.0 * gA));
    gHubA = ripA * gHub;
    gHubF = RIPF / gHub;

    // The crest of the peristaltic swell, travelling out along the chain twice
    // per loop. It starts well behind the trunk and finishes well past the last
    // joint, so at the seam where it wraps there is no joint close enough to it
    // for the jump to show.
    float wp = fract(2.0 * ph) * (float(LEVELS) + 3.0) - 1.5;

    float sc = 1.0;
    for (int i = 0; i < LEVELS; i++) {
        float fi = float(i);
        float u  = fi * (1.0 / float(LEVELS - 1));

        // Every joint keeps its own clock, so the colony crawls instead of
        // pulsing as one lump. Two beats per loop: an integer, so it closes.
        float lph = 2.0 * gA + fi * 0.86;

        // The trunk writhes and the tail lashes, and the two ranges barely
        // overlap. That separation is what makes one field read as a body with
        // a flagellum on it rather than as a uniformly wobbling mass.
        float body = curl * sin(lph) * smoothstep(0.80, 0.0, u);
        float lash = whip * sin(6.0 * gA + fi * 1.90) * smoothstep(0.30, 1.0, u);

        float a1 = tw1 * sc + body;
        float a2 = tw2 * sc + lash;
        gRot[i] = vec4(cos(a1), sin(a1), cos(a2), sin(a2));

        // The resting radius of this joint: the geometric taper, then the tip
        // profile that decides whether the limb keeps its girth to the end or
        // draws down to a hair. Spacing and blend are measured off this, before
        // any breathing, so the living motion can never pull the chain apart.
        float base = rad * sc * (1.0 - tip * u);

        // Peristaltic swell passing through this joint. The snare shoves it and
        // the 0.28 floor keeps the crawl running through silence.
        float dq = fi - wp;
        float bulge = peri * (0.28 + 0.72 * AUDIO_SNARE) * exp(-1.7 * dq * dq);

        float rr = base * (1.0 + 0.11 * sin(lph) + bulge);

        gGeo[i] = vec3(sepK * base, rr, bk * base);
        // The pitch is capped: past a few hundred cycles per unit the fract
        // below runs out of mantissa and the nap shimmers instead of holding
        // still.
        gRip[i] = vec2(ripA * rr, min(RIPF / max(rr, 1e-4), 420.0));
        sc *= taper;
    }

    gC0 = vec3(0.14, 0.018, 0.038);   // nucleus, near-black garnet
    gC1 = vec3(0.58, 0.075, 0.115);   // core crimson, kept dark so the red
                                      // reads as blood under the flesh rather
                                      // than as a painted ball
    gC2 = fleshCol.rgb;               // coral flesh
    gC3 = tipCol.rgb;                 // pearl tips
    gCV = vec3(0.05, 0.320, 0.400);   // crevice teal, the one cool note

    // Camera from the reserved uniforms, so orbiting the anamorphic camera
    // orbits the colony. CAM_UP keeps the basis valid from directly above.
    vec3 ro = CAM_DIR * ORBIT;
    vec3 ww = normalize(-ro);
    vec3 uu = normalize(cross(CAM_UP, ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

    // Analytic bound. A ray that misses costs one quadratic instead of 56
    // field evaluations, and a ray that hits starts at the shell.
    float bq = dot(ro, rd);
    float cq = dot(ro, ro) - BOUND * BOUND;
    float hq = bq * bq - cq;

    // Nothing is drawn outside the object: no halo, no haze, no backdrop.
    if (hq < 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float sq = sqrt(hq);
    float t = max(-bq - sq, 0.0);
    float tMax = -bq + sq;

    float dS = 1.0;
    vec4 mm;
    for (int i = 0; i < MAX_STEPS; i++) {
        dS = mapObj(ro + rd * t, mm, false);
        if (dS < 0.0016 || t > tMax) break;
        t += dS * STEP_SCALE;
    }

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    if (t <= tMax && dS < 0.009) {
        vec3 p = ro + rd * t;
        vec3 nor = calcNormal(p);

        vec4 mate;
        mapObj(p, mate, true);
        vec3 alb = mate.rgb;
        float ao = clamp(mate.w, 0.06, 1.0);

        // One probe further along the ray tells us how much flesh is behind
        // this pixel. Thin flesh is where light gets through, so this drives
        // both the subsurface bleed and the coverage.
        vec4 mp;
        float thick = clamp(-mapObj(p + rd * 0.07, mp, false) / 0.07, 0.0, 1.0);

        float rr = length(p);
        float dep = smoothstep(gHub * 0.90, gHub + 0.95, rr);

        // Crevices take the cool note. Without it every shadowed fold goes
        // muddy brown and the colony reads as one flat terracotta lump.
        alb = mix(gCV, alb, 0.48 + 0.52 * ao);
        // Then push the whole albedo off grey. Wrap diffuse plus a Reinhard
        // curve both pull toward white, and coral that has lost its hue reads
        // as wet cardboard however well it is lit.
        alb = max(vec3(0.0), mix(vec3(dot(alb, vec3(0.3333))), alb, 1.52));

        // Two lights, counter-rotating once per loop. Neither is pinned to the
        // camera, so nothing bakes in place once the plane tilts, and because
        // they are opposed the colony never turns a dead side to the viewer.
        vec3 lig  = normalize(vec3( 1.30 * sin(gA),  0.80,  1.30 * cos(gA)));
        vec3 lig2 = normalize(vec3(-1.20 * sin(gA), -0.50, -1.20 * cos(gA)));

        // Wrap diffuse rather than a clamped dot. Light bleeds past the
        // terminator, which is what flesh does and what a hard lambert refuses
        // to do; it is most of why this reads as soft tissue.
        float dif  = clamp(0.5 + 0.5 * dot(nor, lig ), 0.0, 1.0);
        float dif2 = clamp(0.5 + 0.5 * dot(nor, lig2), 0.0, 1.0);
        dif  = dif  * dif  * (1.30 - 0.30 * dif );
        dif2 = dif2 * dif2;
        col  = alb * dif  * vec3(1.08, 0.97, 0.93) * 1.80 * (0.30 + 0.70 * ao);
        // The fill is only faintly cool. A strongly blue fill lands on the tip
        // of every papilla and the nap reads as barnacles rather than as the
        // pale bristle it is; the crevice tint below is the cool note.
        col += alb * dif2 * vec3(0.54, 0.53, 0.64) * 0.74 * ao;

        // Radial dome term, which survives being wrapped or rotated.
        vec3 upp = p * inversesqrt(max(dot(p, p), 1e-6));
        float dome = clamp(0.32 + 0.68 * dot(nor, upp), 0.0, 1.0);
        col += alb * dome * vec3(0.14, 0.24, 0.44) * 1.05 * ao;

        float fre = clamp(1.0 + dot(rd, nor), 0.0, 1.0);
        fre *= fre;

        // Subsurface. The thinner the flesh the more of the core colour comes
        // through it, flashed by the beat, with a floor so the tips stay lit
        // in silence.
        // Blood under the skin. The fresnel-weighted half picks out the edges
        // the light passes through, the flat half bleeds out of every thin
        // limb, and the beat pushes both. This is where the object gets its
        // colour: without it the flesh grades to grey under the tone map.
        float bleed = 1.0 - thick * 0.80;
        col += gC1 * bleed * (0.60 + 1.30 * AUDIO_BEAT)
             * (2.60 * fre + 0.85) * ao;
        col += 0.32 * alb * alb * fre * ao;

        // Wet sheen. Treble hones it from a broad gloss to a hard glint, and
        // it is held off the dark nucleus so that never reads as plastic.
        vec3 hal = normalize(lig - rd);
        float spe = pow(clamp(dot(nor, hal), 0.0, 1.0), 18.0 + 80.0 * quill);
        col += vec3(1.00, 0.96, 0.93) * spe * (0.25 + 0.65 * quill)
             * ao * (0.25 + 0.75 * dep);

        // Pearl on the rim, where the bristles catch. Gated on depth so the
        // trunk does not get painted in the tip colour when the colony opens.
        col += gC3 * fre * fre * (0.28 + 0.70 * quill) * (0.50 + 1.60 * AUDIO_BEAT)
             * ao * (0.10 + 0.90 * dep);

        // The nucleus is a lantern the colony grew around: a pooled emission
        // flared by the kick, and zero past the innermost lobes.
        col += gC1 * (0.14 + 0.60 * AUDIO_KICK)
             * smoothstep(gHub * 1.60, gHub * 0.85, rr) * (0.15 + 1.20 * fre);

        // Tone map and gamma the object only, never the empty frame.
        col = col / (col + vec3(1.02));
        col = pow(col, vec3(0.4545));

        // Coverage. Thick flesh is opaque, thin flesh lets the footage
        // through, which is both what translucent tissue does and a free
        // antialias on the silhouette. Zero everywhere the colony is not.
        alpha = mix(0.74, 1.0, smoothstep(0.0, 0.70, thick));
    }

    // Premultiply. Colour is zero wherever alpha is zero.
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
