/*{
  "ADITS": 1,
  "DESCRIPTION": "A near-black obsidian double helix wound around a bright axial filament, turning once per loop with every edge rim-lit. Each vertebra is one bead-and-process primitive under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: stacked plate, processed vertebra, swept barb, radiating quill. Bass widens the helix, mid twists it, treble ignites the rims, and the change climbs the spine. Rests as the processed vertebra.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-22",
  "CATEGORIES": ["generative", "morph", "obsidian", "biomech", "helix", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80,  "MIN": 0.15,  "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55,  "MIN": 0.00,  "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34,  "MIN": 0.00,  "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach",  "TYPE": "float", "DEFAULT": 0.105, "MIN": 0.070, "MAX": 0.150,
      "LABEL": "Helix Radius", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "twist",  "TYPE": "float", "DEFAULT": 1.50,  "MIN": 0.60,  "MAX": 3.00,
      "LABEL": "Helix Twist", "BIND": "mid", "BIND_DEPTH": 0.40 },
    { "NAME": "rimlit", "TYPE": "float", "DEFAULT": 0.55,  "MIN": 0.15,  "MAX": 1.30,
      "LABEL": "Rim Light", "BIND": "treble", "BIND_DEPTH": 0.60 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// Spine half-height and vertebra pitch, both compile-time so the cell index
// below is exact and the loop bound stays constant. 0.36 leaves air above and
// below: a floating object that touches the frame edge stops reading as an
// object (guide 10).
#define HALF  0.36
#define PITCH 0.080

// How far the per-vertebra selector is spread up the spine. The change then
// climbs the spine as a wave instead of reforming every bone at once.
#define STAGGER 1.05

// Spindle profile: 1 at the waist, falling toward the ends. A cylinder of
// constant radius reads as a machined tube and leaves two blunt stumps where it
// is cut; tapering gives the object a waist and a point, which is what makes a
// silhouette read as skeletal at a glance (guide 10).
float taper(float y) {
    float t = clamp(abs(y) / HALF, 0.0, 1.0);
    return 1.0 - 0.62 * t * t * t;
}

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// Tapered capsule, returning distance in .x and its outward normal in .yz.
// The normal is what turns a flat outline into a lit solid, and a capsule hands
// it over for free: the vector from the nearest point on the spine of the
// segment to the sample IS the outward direction.
vec3 capsuleN(vec2 p, vec2 a, vec2 b, float w0, float w1) {
    vec2 pa = p - a, ba = b - a;
    // The plate archetype has zero process length, so ba is the zero vector
    // there; the guard keeps that case a disc rather than a division by zero.
    float h  = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    vec2  rl = pa - ba * h;
    float L  = length(rl);
    return vec3(L - mix(w0, w1, h), rl / max(L, 1e-4));
}

// Ellipse, returning distance in .x and its outward normal in .yz. An ellipse
// rather than a rounded box on purpose: a box keeps four straight sides however
// small it gets, and a constant-width outline around one reads as a drawn
// rectangle instead of a bone. The gradient of x^2/a^2 + y^2/b^2 is (x/a^2,
// y/b^2), which is the exact outward direction at no extra cost.
vec3 ellipseN(vec2 p, vec2 r) {
    vec2  q = p / r;
    float m = length(q);
    vec2  g = vec2(p.x / (r.x * r.x), p.y / (r.y * r.y));
    return vec3((m - 1.0) * min(r.x, r.y), g / max(length(g), 1e-4));
}

// One helix strand: its cord plus the chain of vertebrae threaded on it.
//
// Drawn analytically in screen space rather than raymarched. The strand is the
// graph x = R*cos(y*k + a), so the perpendicular distance to it is the
// horizontal offset divided by sqrt(1 + slope^2) — exact to first order, which
// is all a tube of this gauge can show, and it costs one cosine instead of 64
// distance evaluations.
//
//   aOff  strand phase; the partner strand is half a turn away
//   vOff  vertebra offset in cells; the partner sits half a pitch up, so the
//         two chains interleave instead of pairing off into ladder rungs
// Returns the strand's colour already weighted by its own coverage, in .rgb,
// and that coverage in .w.
vec4 strand(vec2 p, float aOff, float vOff, float k, float R, float x0,
            float kick, float spin, vec2 L) {
    float tp  = taper(p.y);
    float Rw  = R * tp;                          // waisted helix radius
    float a   = p.y * k + spin + aOff;
    float xs  = Rw * cos(a);
    float zs  = Rw * sin(a);
    float sl  = -Rw * k * sin(a);                // dx/dy along the strand
    float inv = inversesqrt(1.0 + sl * sl);
    float sdx = (p.x - xs) * inv;                // signed perpendicular offset
    float dep = 0.5 + 0.5 * zs / max(Rw, 1e-4);  // 0 far from viewer, 1 near

    vec3 body = vec3(0.020, 0.026, 0.036);       // obsidian: near-black, cool

    // --- Cord ---------------------------------------------------------------
    // The strand's own filament. It never morphs, so the helix stays legible as
    // a helix whatever species its vertebrae currently are.
    // The gauge tapers with the profile, so the strand narrows to a point rather
    // than fading out at full width, which would leave a soft dark smear at each
    // end instead of a tip.
    float ends = smoothstep(HALF, HALF - 0.06, abs(p.y));
    float cw   = 0.0062 * (0.80 + 0.34 * dep) * (0.25 + 0.75 * tp);
    float covC = (1.0 - smoothstep(cw - 0.0024, cw + 0.0024, abs(sdx))) * ends;
    // Cylinder normal across the cord, so the rim sits where the surface turns
    // away from the viewer instead of being painted on at a fixed offset.
    float nxC  = clamp(sdx / max(cw, 1e-4), -1.0, 1.0);
    float rimC = smoothstep(0.42, 1.0, abs(nxC));
    vec3  colC = body * (0.45 + 0.55 * dep)
               + vec3(0.30, 0.58, 1.00) * rimC * (1.9 * rimlit) * kick;

    // --- Vertebrae ----------------------------------------------------------
    // The three cells nearest this pixel's height. Bead extents stay under the
    // pitch, so three cells always contain the closest one.
    float vid0 = floor(p.y / PITCH - vOff + 0.5);
    vec3  colV = vec3(0.0);
    float covV = 0.0;

    for (int i = 0; i < 3; i++) {
        float vid = vid0 + float(i) - 1.0;
        float yb  = (vid + vOff) * PITCH;
        // Taper the ends rather than branching on them, so the spine fades out
        // instead of leaving a half-drawn bone at the tip.
        float vEnd = smoothstep(HALF, HALF - 0.075, abs(yb));

        float tb = taper(yb);
        float Rb = R * tb;                       // this bone's ring radius
        float ab = yb * k + spin + aOff;
        float xb = Rb * cos(ab);
        float db = 0.5 + 0.5 * sin(ab);          // this bone's own depth, 0..1

        // Per-vertebra selector. Height climbs the spine, so it doubles as the
        // sweep coordinate; the cell hash keeps that sweep from looking
        // mechanical. Both are static, so at a fixed spectrum the spine holds
        // still: the wave is positioned by the music, never by the clock.
        float uV = clamp((yb + HALF) / (2.0 * HALF), 0.0, 1.0);
        float hs = hash11(vid * 1.73 + vOff * 11.3 + 4.1);
        float xj = clamp(x0 + STAGGER * (0.66 * (uV - 0.5) + 0.34 * (hs - 0.5)),
                         0.0, 3.0);

        // Triangular weights of slope 1.85. Support is 1/1.85 either side of a
        // centre and the centres are spaced 1.0, so neighbours overlap over
        // 2/1.85 - 1 = 0.081 of the axis and the sum is never zero. The slope
        // must stay below 2.0 or the normalisation below divides by nothing.
        float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
        float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
        float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
        float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
        float ws = w0 + w1 + w2 + w3;
        w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

        // Parameter-space morph. One bead-and-process primitive, seven
        // interpolated numbers, so the vertebra deforms and no fragment ever
        // shows two forms at half alpha.
        //             plate      vertebra   barb       quill
        float bw  = 0.0520 * w0 + 0.0300 * w1 + 0.0210 * w2 + 0.0125 * w3; // body width
        float bh  = 0.0100 * w0 + 0.0200 * w1 + 0.0180 * w2 + 0.0140 * w3; // body height
        float spl = 0.0000 * w0 + 0.0440 * w1 + 0.0780 * w2 + 0.0960 * w3; // process reach
        float spd = 0.0000 * w0 + 0.5500 * w1 - 0.8500 * w2 + 0.1000 * w3; // process sweep
        float spw = 0.0100 * w0 + 0.0070 * w1 + 0.0055 * w2 + 0.0028 * w3; // process gauge
        float bri = 0.80   * w0 + 1.00   * w1 + 1.25   * w2 + 1.60   * w3; // emission
        float ice = 0.00   * w0 + 0.18   * w1 + 0.45   * w2 + 0.85   * w3; // rim to ice

        vec2 q = vec2(p.x - xb, p.y - yb);
        vec3 eB = ellipseN(q, vec2(bw, bh) * (0.88 + 0.18 * db) * (0.45 + 0.55 * tb));

        // Lateral processes, a mirrored pair. Their screen reach is scaled by
        // the strand's own radial share xb/R, so a bone on the far or near face
        // foreshortens to nothing instead of sticking out sideways — which is
        // what sells the helix as a solid rather than a flat ribbon.
        // The y half is not foreshortened, so a process on the near or far face
        // still shows as a short spur along the spine instead of vanishing.
        vec2 sv = vec2(spl * cos(ab), spl * spd * 0.85) * (0.5 + 0.5 * tb);
        vec3 e1 = capsuleN(q, vec2(0.0),  sv, spw, spw * 0.22);
        vec3 e2 = capsuleN(q, vec2(0.0), -sv, spw, spw * 0.22);
        vec3 eS = mix(e1, e2, step(e2.x, e1.x));

        // Union of body and processes, carrying whichever surface's normal is
        // the near one. Branch-free: a divergent branch here would cost the sum
        // of both sides anyway (guide 9).
        float pick = step(eS.x, eB.x);
        float dV   = min(eB.x, eS.x);
        vec2  nV   = mix(eB.yz, eS.yz, pick);
        float cV   = (1.0 - smoothstep(-0.0024, 0.0024, dV)) * vEnd;

        // Edge band: 1 just inside the silhouette, 0 deep in the body. One
        // expression bands the bead and both processes, and it follows whatever
        // shape the morph currently holds.
        float band = smoothstep(-0.0062, -0.0006, dV);

        // Two lights, and neither is camera-matched (guide 10). The travelling
        // one walks around the helix once per loop: the bone's outward radial is
        // (cos ab, sin ab) in the x-z plane, so one dot per bone places it. The
        // standing one is a soft key from the object's own up, which is what
        // stops every edge glowing at equal strength and flattening the bone
        // back into an outline.
        float lam  = max(0.0, cos(ab) * L.x + sin(ab) * L.y);
        float spec = lam * lam * lam * lam;
        float key  = 0.30 + 0.70 * smoothstep(-0.9, 0.9, nV.y);

        vec3 rimHue = mix(vec3(0.30, 0.58, 1.00), vec3(0.80, 0.95, 1.00), ice);
        vec3 cvx = body * (0.42 + 0.58 * db)
                 + rimHue * band * key * (2.6 * rimlit) * bri * kick
                 + vec3(1.00, 0.96, 0.90) * spec * band * key * 1.3 * rimlit;

        // Painter's composite within the strand. Neighbouring bones barely
        // overlap, so ordering by index costs nothing and avoids the additive
        // double-brightening a plain sum would give at a seam.
        colV = colV * (1.0 - cV) + cvx * cV;
        covV = covV + cV * (1.0 - covV);
    }

    // Bones over their own cord.
    vec3  col = colC * covC * (1.0 - covV) + colV * covV;
    float cov = covC * (1.0 - covV) + covV;
    return vec4(col, cov);
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the
    // helix wraps seamlessly on a 24 s cycle. Nothing on the morph path reads
    // it: which vertebra is which belongs to the music, not to the clock. Base
    // rates are deliberately slow, because the host's Audio Drive can run this
    // clock at up to 10x on loud material (guide 5).
    float ph   = fract(TIME / 24.0);
    float spin = ph * TAU;                       // one full turn per loop
    float bob  = 0.012 * sin(ph * TAU * 2.0);    // two bobs per loop

    vec2 p = uv - vec2(0.0, bob);

    // Orbiting the real camera walks the helix phase, so turning the anamorphic
    // camera turns the object with it instead of tilting a flat picture of it.
    float camA = atan(CAM_DIR.x, CAM_DIR.z);

    // --- Selector -------------------------------------------------------------
    // Balance decides which vertebra; loudness only decides how hard it burns.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // draws the spine down to quills, a kick plates it into discs.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float alive = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, alive);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the kick
    // that plates a vertebra also floods it.
    float kick = 1.0 + 1.6 * snap * AUDIO_KICK;

    float R = reach;
    float k = twist * TAU / (2.0 * HALF);        // declared turns over the spine
    vec2  L = vec2(sin(spin), cos(spin));        // key light, one orbit per loop

    // --- Shared core ----------------------------------------------------------
    // The axial filament every archetype hangs from. It never changes species,
    // so the centre of the frame keeps something solid through a transition
    // (guide 12.6). Drawn first: the strands occlude it.
    // Its gauge follows the same spindle profile as the strands, and it carries
    // a tight glow so it reads as a lit filament rather than a scratch. The glow
    // is bounded in x by its own falloff and in y by the end fade, so it can
    // never become a full-frame veil (guide 8).
    float axEnd = smoothstep(HALF + 0.02, HALF - 0.06, abs(p.y));
    float axW   = 0.0052 * (0.28 + 0.72 * taper(p.y));
    float covAx = (1.0 - smoothstep(axW - 0.0020, axW + 0.0020, abs(p.x))) * axEnd;
    // The 1/x^2 tail is multiplied by a smoothstep that genuinely reaches zero
    // at 0.075, because a bare inverse-square glow never does: its tail is small
    // per pixel but it is spread over the whole height, and it accumulated into
    // a vertical haze band around the object rather than a filament.
    float glowAx = (0.00022 / (p.x * p.x + 0.00022))
                 * smoothstep(0.075, 0.0, abs(p.x)) * axEnd * axEnd;
    vec3  colAx = vec3(0.55, 0.82, 1.00) * (0.38 + 0.74 * rimlit) * kick;

    // --- Strands --------------------------------------------------------------
    vec4 sA = strand(p, camA,      0.0, k, R, x0, kick, spin, L);
    vec4 sB = strand(p, camA + PI, 0.5, k, R, x0, kick, spin, L);

    // Depth order. The two strands are half a turn apart, so at any height one
    // is genuinely in front; compositing near over far is what stops the far
    // strand's rim shining through the near one's body.
    float aNear = step(0.0, sin(p.y * k + spin + camA));
    vec4  nf    = mix(sB, sA, aNear);            // near strand
    vec4  ff    = mix(sA, sB, aNear);            // far strand

    vec3  col = nf.rgb + ff.rgb * (1.0 - nf.w);
    float cov = nf.w   + ff.w   * (1.0 - nf.w);

    // Core behind both.
    float axA = clamp(covAx + glowAx * 0.20, 0.0, 1.0);
    col += colAx * axA * (1.0 - cov);
    cov += axA * 0.85 * (1.0 - cov);

    // Soft knee on the object only. Rim and glint stack at a grazing edge, and
    // without this they clip to flat white, which erases the very edge the
    // obsidian palette depends on.
    col = col / (1.0 + col * 0.55);

    // Radial bound. The longest reachable form is the quill at the waist, where
    // the taper is 1.0: a 0.150 helix radius plus a 0.096 process, so 0.246
    // across, and 0.372 tall including the bob. This fade feathers well outside
    // that rather than the frame border cutting it.
    float rim = smoothstep(0.470, 0.400, length(uv));
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = clamp(cov, 0.0, 1.0) * rim;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
