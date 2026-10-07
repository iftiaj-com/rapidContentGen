/*{
  "ADITS": 1,
  "DESCRIPTION": "A frosted-glass dandelion around a milky lens hub that never changes, wearing nineteen filaments that each change species on their own schedule. Each is one primitive under eight interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: glass blade, feathered filament, barbed bristle, hair whisker. Bass thickens the head into blades, treble strips it to whiskers, and the change sweeps across the head one filament at a time. Rests as the feathered filament.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-21",
  "CATEGORIES": ["generative", "morph", "chrome", "filament", "glass", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 20.0,
  "INPUTS": [
    { "NAME": "sens",  "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",  "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",  "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach", "TYPE": "float", "DEFAULT": 0.29, "MIN": 0.22, "MAX": 0.32,
      "LABEL": "Head Reach", "BIND": "bass", "BIND_DEPTH": 0.40 },
    { "NAME": "frost", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Frost Density", "BIND": "level", "BIND_DEPTH": 0.40 },
    { "NAME": "prism", "TYPE": "float", "DEFAULT": 0.32, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Prism Fringe", "BIND": "treble", "BIND_DEPTH": 0.55 }
  ]
}*/

#define TAU 6.28318530718

// Shaft half-width at the hub, in uv units. Deliberately near sub-pixel at the
// default render size: glass filaments must read as light, not as tubes.
#define SHAFT 0.0026

// Filament count. It used to be a stepped slider; it has to stay a compile-time
// integer for the angular seam to close, so the six-slot budget went to the
// morph controls and this sits at the old default.
#define HAIRS 19.0

// How far the per-filament selector is spread around the head. The change then
// crosses the head as a wave instead of flipping all nineteen at once.
#define STAGGER 1.05

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

// Narrow smoothed lobe. Kept narrow on purpose: a wide one leaves all three
// channels lit at once and the fringe washes out to white, which is exactly the
// failure mode for a colourless object that earns its hue only from edges.
float lobe(float x) {
    float f = clamp(1.0 - abs(fract(x) - 0.5) * 2.55, 0.0, 1.0);
    return f * f * (3.0 - 2.0 * f);
}

vec3 prismHue(float t) {
    return vec3(lobe(t), lobe(t + 0.3333), lobe(t + 0.6667));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every rate below is an integer multiple of it, so the
    // head wraps seamlessly at 20 s. Nothing on the morph path reads it: which
    // filament is which belongs to the music, not to the clock.
    float ph = fract(TIME / 20.0);

    float r  = length(uv);
    float r2 = dot(uv, uv);
    float a  = atan(uv.y, uv.x);          // one atan for the frame, none in a loop

    float rot    = ph * TAU;                          // one slow turn per loop
    float sway   = 0.10 * sin(ph * TAU * 2.0);        // two sways per loop
    float breath = 1.0 + 0.045 * sin(ph * TAU * 3.0); // three breaths per loop

    // --- Selector -------------------------------------------------------------
    // Balance decides which filament; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips a filament to a whisker, a kick thickens it into a blade.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // One transient control drives the light as well as the geometry: the hat
    // that sharpens a filament also fires its glints.
    float hatF = 1.0 + 1.4 * snap * AUDIO_HAT;

    float N    = HAIRS;
    float span = max(reach * breath, 0.08);
    float rn   = r / span;                            // 1.0 at the nominal tip

    // Gentle spiral shear, so the filaments bow back as they leave the hub
    // instead of radiating like spokes. Kept low: a strong shear turns the whole
    // head into a pinwheel and the seedhead reading is lost.
    float curl = (0.30 + sway * 0.6) * rn * rn;

    // Low-frequency angular warp. This is what breaks the mandala: it bunches
    // the filaments into three uneven clumps and leaves gaps between them, the
    // way a half-blown seedhead actually sits.
    // Amplitudes are held low on purpose: the derivative of this term must stay
    // well under 1, or the angular mapping folds and a cell smears into a blob.
    float warp = 0.115 * sin(3.0 * (a - rot * 2.0)) + 0.045 * sin(5.0 * a + rot);

    // Angular cell. The field is a function of the warped, sheared angle, so one
    // filament is one cell of it and nineteen of them cost no loop at all.
    float k  = (a - rot - curl + warp) * (N / TAU);
    float id = mod(floor(k), N);      // wraps cleanly at the atan seam
    float cf = fract(k) - 0.5;

    // Per-filament identity: lengths vary widely, so the silhouette is a torn
    // seedhead rather than a perfect disc.
    float hv    = hash11(id * 1.37 + 3.1);
    float hv2   = hash11(id * 4.91 + 9.7);
    float abase = rot + (id + 0.5) * (TAU / N);
    vec2  bdir  = vec2(cos(abase), sin(abase));

    // Per-filament selector. The cosine term sweeps the change across the head
    // and, unlike a linear index ramp, is continuous where the ring wraps. The
    // hash keeps that sweep from looking mechanical. Both are static, so at a
    // fixed spectrum the head holds still: the wave is positioned by the music.
    float u  = 0.5 - 0.5 * cos(id * (TAU / N));
    float xj = clamp(sel * 3.0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (hv2 - 0.5)),
                     0.0, 3.0);

    // Triangular weights of slope 1.85. Support is 1/1.85 either side of a centre
    // and the centres are spaced 1.0, so neighbours overlap over 2/1.85 - 1 = 0.081
    // of the axis and the sum is never zero. The slope must stay below 2.0 or the
    // normalisation below divides by nothing.
    float w0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
    float w1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
    float w2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
    float w3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
    float ws = w0 + w1 + w2 + w3;
    w0 /= ws; w1 /= ws; w2 /= ws; w3 /= ws;

    // Parameter-space morph. One filament primitive, eight interpolated numbers,
    // so the silhouette deforms and no fragment shows two forms at half alpha.
    //             blade      filament   bristle    whisker
    float wM   = 3.20 * w0 + 1.00 * w1 + 1.45 * w2 + 0.55 * w3;   // shaft gauge
    float lenM = 0.70 * w0 + 1.00 * w1 + 1.05 * w2 + 1.10 * w3;   // reach
    float tprM = 0.72 * w0 + 0.50 * w1 + 0.62 * w2 + 0.30 * w3;   // taper
    float bfr  = 9.00 * w0 + 23.0 * w1 + 36.0 * w2 + 60.0 * w3;   // barb pitch
    float bwM  = 1.70 * w0 + 1.00 * w1 + 1.35 * w2 + 0.35 * w3;   // barb width
    float plM  = 1.45 * w0 + 1.00 * w1 + 0.35 * w2 + 0.10 * w3;   // seed plume
    float whM  = 0.20 * w0 + 1.00 * w1 + 1.25 * w2 + 1.60 * w3;   // whisker
    float fzM  = 1.60 * w0 + 1.00 * w1 + 0.85 * w2 + 0.45 * w3;   // frost halo

    // The hash spread is narrower than the archetype spread, so the longest form
    // on the longest filament is what bounds the head rather than the hash.
    float len   = (0.66 + 0.44 * hv) * lenM * (1.0 - 0.13 * bdir.y);  // droops
    float t     = clamp(rn / len, 0.0, 1.6);                    // 0 hub, 1 tip

    // Screen-space distance to the centreline, evaluated once per channel at a
    // slightly different shear. Offsetting the shear rotates the whole field, so
    // each channel sees the filament in a marginally different place: a real
    // dispersion fringe, not a tinted outline.
    const vec3 CH   = vec3(-1.0, 0.0, 1.0);
    float      disp = (0.0035 + 0.0150 * prism) * (N / TAU);
    vec3  cf3 = fract(vec3(k) - CH * disp) - 0.5;
    float pitch = (TAU / N) * r;               // arc distance across one cell
    vec3  sd3 = abs(cf3) * pitch;
    float sd  = abs(cf) * pitch;

    // Feathering: a continuous thin shaft, plus short wide barbs hung off it at
    // a fixed spacing along the filament. max() of the two half-widths is what
    // makes one hair read as a feather instead of a wire.
    float taper = 1.0 - tprM * t;
    float bt    = fract(t * bfr - ph * 4.0 + hv2);
    float barb  = smoothstep(0.46, 0.98, bt) * smoothstep(1.10, 0.86, bt);
    float w     = max(SHAFT * wM * taper * 1.05,
                      SHAFT * wM * taper * 3.4 * bwM * barb);

    // Live between the hub rim and the tip.
    float gate  = (1.0 - smoothstep(0.96, 1.04, t)) * smoothstep(0.028, 0.068, r);
    vec3  hair3 = (1.0 - smoothstep(vec3(w - 0.0013), vec3(w + 0.0013), sd3)) * gate;

    // Frosted halo hugging each filament. This is the milky part of the glass:
    // wide, dim, and still bound to the hair, never a frame-wide wash.
    float fuzz = (1.0 - smoothstep(0.0, 0.015 * fzM * (1.0 - 0.5 * t), sd))
               * (0.35 + 0.65 * barb) * gate * frost;

    // Seed plume sitting on the tip of every filament, and the hair-fine whisker
    // that trails on past it.
    float dTip = abs(t - 1.0) * len * span;
    float tipB = (1.0 - smoothstep(0.004 * plM, 0.034 * plM, dTip))
               * (1.0 - smoothstep(0.006 * plM, 0.036 * plM, sd)) * 0.60 * plM;
    float whisk = (1.0 - smoothstep(0.0009, 0.0032, sd))
                * smoothstep(0.98, 1.06, t)
                * (1.0 - smoothstep(1.12 + 0.16 * hv2, 1.30 + 0.16 * hv2, t))
                * whM;

    // Glints travelling out along the hairs. step() picks roughly one barb in
    // seven, so they read as scattered sparks rather than a dotted line.
    float gc    = floor(t * 11.0 - ph * 11.0);
    float glint = step(0.86, hash11(id * 7.13 + gc * 2.71))
                * (1.0 - smoothstep(0.0, 0.0085, sd))
                * (1.0 - smoothstep(0.12, 1.02, t)) * 0.60 * hatF;

    // --- Shared core ----------------------------------------------------------
    // Milky lens hub: a bright translucent bead with internal caustic rings and
    // a hard wet rim where the filaments are socketed. It never changes species;
    // it is what holds the middle of the frame together while the head turns over.
    float hubR = 0.050 + 0.009 * sin(ph * TAU * 3.0);
    float lens = 1.0 - smoothstep(hubR * 0.72, hubR * 1.40, r);
    float caus = 0.50 + 0.50 * cos(r * 190.0 - ph * TAU * 4.0);
    float lip  = (1.0 - smoothstep(0.0, 0.0075, abs(r - hubR * 1.12)));
    float core = (0.0013 / (r2 + 0.0016)) * (1.0 - smoothstep(0.008, 0.078, r));

    // Cold pale glass, plus the prismatic fringe the barb edges earn.
    vec3  glass = vec3(0.88, 0.95, 1.02);
    float hueT  = t * 1.15 + hv * 0.31 + ph + 0.42 * dot(bdir, CAM_DIR.xy);
    vec3  fr    = prismHue(hueT) * vec3(1.00, 0.92, 1.06);
    // Only the difference between channels is fringe; the shared part is glass.
    vec3  split = hair3 - vec3(hair3.g);

    vec3 col = glass * (hair3.g * 1.00 + fuzz * 0.30)
             + mix(glass, fr, 0.90) * split * (1.60 * prism + 0.30)
             + vec3(0.96, 1.00, 1.00) * tipB * 0.80
             + glass * whisk * 0.70
             + vec3(1.00, 1.00, 0.97) * glint * 1.20
             + glass * lens * (0.34 + 0.46 * caus) * (0.55 + 0.45 * frost)
             + vec3(0.94, 0.99, 1.00) * lip * 0.42
             + vec3(1.00, 0.99, 0.97) * core * 0.85;

    // Soft knee. Nineteen filaments converge on one point; without this the hub
    // clips to flat white and the caustics disappear.
    col = col / (1.0 + col * 0.30);

    // Radial safety bound. The worst case is the whisker form on the longest
    // downward filament at the largest head reach: 0.320 * 1.045 breath * 1.10
    // spread * 1.10 length * 1.13 droop reaches 0.476 at the tip gate, so this
    // fade only feathers the last of a whisker rather than slicing a filament.
    float rim = 1.0 - smoothstep(0.425, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (max(hair3.r, max(hair3.g, hair3.b)) * 0.95
                 + fuzz * 0.26 + tipB * 0.50 + whisk * 0.60 + glint * 0.55
                 + lens * 0.62 + lip * 0.40 + core * 0.45) * rim;
    alpha = smoothstep(0.018, 0.95, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
