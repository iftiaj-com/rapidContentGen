/*{
  "ADITS": 1,
  "DESCRIPTION": "A thistle star on a scalloped hub of chroma rings that never changes, wearing fourteen spines that each change species on their own schedule. Each is one primitive under seven interpolated numbers, so it morphs by deforming, not cross-fading, through four forms: broad scale plate, plated needle, barbed thorn, hair quill. Every scale edge still splits into a real RGB fringe. Bass plates the star, treble strips it to quills. Rests as the plated needle.",
  "CREDIT": "claude-opus-5",
  "DATE": "2026-08-20",
  "CATEGORIES": ["generative", "morph", "iridescent", "chroma-split", "star", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",   "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",   "TYPE": "float", "DEFAULT": 0.34, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "reach",  "TYPE": "float", "DEFAULT": 0.31, "MIN": 0.20, "MAX": 0.34,
      "LABEL": "Spine Reach", "BIND": "bass", "BIND_DEPTH": 0.45 },
    { "NAME": "iris",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.15, "MAX": 1.00,
      "LABEL": "Iridescence", "BIND": "treble", "BIND_DEPTH": 0.55 },
    { "NAME": "glow",   "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Core Heat", "BIND": "level", "BIND_DEPTH": 0.45 }
  ]
}*/

#define PI  3.14159265359
#define TAU 6.28318530718

// Half-width of a spine at its base, in uv units.
#define THICK 0.046

// Base scale pitch along a spine, before the morph scales it. It used to be a
// slider; plate pitch is now one of the numbers the form interpolates, because
// six coarse plates and twenty-eight fine ones are two different animals.
#define SCALES 12.0

// How far the per-spine selector is spread around the star. The change then
// crosses it spine by spine instead of flipping all fourteen at once.
#define STAGGER 1.05

float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

// One smooth thin-film band. Deliberately narrow: a wide lobe leaves all three
// channels lit at once and the rainbow washes out to pastel, so this one goes
// fully dark for roughly a quarter of its cycle and the three channels
// separate. Stands in for a cosine, which keeps the per-pixel iridescence free
// of transcendentals.
float lobe(float x) {
    float f = clamp(1.0 - abs(fract(x) - 0.5) * 2.60, 0.0, 1.0);
    return f * f * (3.0 - 2.0 * f);
}

vec3 filmHue(float t) {
    return vec3(lobe(t), lobe(t + 0.3333), lobe(t + 0.6667));
}

void main() {
    // Canonical preamble: aspect-correct and resolution-independent.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // One loop phase. Every animated rate below is an integer multiple of it,
    // so the object wraps seamlessly at 16 s. Nothing on the morph path reads
    // it: which spine is which belongs to the music, not to the clock.
    float ph = fract(TIME / 16.0);

    float r  = length(uv);
    float r2 = dot(uv, uv);

    float rot    = ph * TAU;                       // one turn per loop
    float breath = 1.0 + 0.05 * sin(ph * TAU * 2.0);  // two swells per loop
    float drift  = ph * 2.0;                       // scales creep two steps per loop
    // One hue precession per loop, plus a view term: a thin film shifts colour
    // with viewing angle, so orbiting the camera sweeps the iridescence instead
    // of just tilting a fixed picture. CAM_DIR is (0,0,1) at rest, so this adds
    // nothing head-on.
    float huePh  = ph + 0.60 * (1.0 - CAM_DIR.z);

    // Iridescence drives both the colour saturation and how far the three
    // channels are offset from each other, which is what makes the fringe.
    float sat  = 0.72 + 0.28 * iris;
    float disp = 0.04 + 0.20 * iris;
    const vec3 CH = vec3(-1.0, 0.0, 1.0);   // r lags, b leads

    // --- Selector -------------------------------------------------------------
    // Balance decides which spine; loudness only decides how hard it is lit.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;            // 0 all bass, 1 all treble
    // tilt is a ratio of three smoothed averages, so it swings far less than any
    // one band. Expanded around the rest point, or the outer forms never arrive.
    float sel  = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // AUDIO_HAT and AUDIO_KICK already decay, so they are used straight: a hat
    // strips a spine to a quill, a kick plates it.
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);
    // At silence tilt is 0/0, so fade to a chosen resting form instead.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);
    float x0 = sel * 3.0;

    // One transient control drives the light as well as the geometry: the kick
    // that plates a spine also punches the anamorphic ray out through it.
    float flareF = 0.26 + 1.00 * snap * AUDIO_KICK;

    vec3  col  = vec3(0.0);
    float covP = 0.0;   // scale-plate coverage
    float covF = 0.0;   // specular fringe coverage
    float covH = 0.0;   // whisker coverage
    float covR = 0.0;   // flare-ray coverage

    // Seven struts, each a line through the centre, so fourteen spines evenly
    // spaced at 360/14 degrees. Constant bound, cheap body: this is why COST
    // is "low".
    for (int i = 0; i < 7; i++) {
        float fi  = float(i);
        float ang = rot + fi * (PI / 7.0);

        vec2  dir   = vec2(cos(ang), sin(ang));
        float along = dot(uv, dir);
        float perp  = dot(uv, vec2(-dir.y, dir.x));
        float q  = abs(along);
        float ap = abs(perp);

        // The two rays of one strut take different lengths, so all fourteen
        // spines differ while the whole shell still rotates rigidly.
        float side = step(0.0, along);
        float hv   = hash21(vec2(fi * 4.13 + 7.0, side * 11.0 + 3.0));

        // Per-spine selector. The cosine of the spine's own bearing sweeps the
        // change around the star and, unlike a linear index ramp, is continuous
        // where the ring of fourteen wraps. The hash keeps that sweep from
        // looking mechanical. Both are static, so at a fixed spectrum the star
        // holds still: the wave is positioned by the music, never by the clock.
        float sang = fi * (PI / 7.0) + (1.0 - side) * PI;
        float u    = 0.5 - 0.5 * cos(sang);
        float xj   = clamp(x0 + STAGGER * (0.66 * (u - 0.5) + 0.34 * (hv - 0.5)),
                           0.0, 3.0);

        // Triangular weights of slope 1.85. Support is 1/1.85 either side of a
        // centre and the centres are spaced 1.0, so neighbours overlap over
        // 2/1.85 - 1 = 0.081 of the axis and the sum is never zero. The slope
        // must stay below 2.0 or the normalisation divides by nothing.
        float b0 = max(1.0 - abs(xj      ) * 1.85, 0.0);
        float b1 = max(1.0 - abs(xj - 1.0) * 1.85, 0.0);
        float b2 = max(1.0 - abs(xj - 2.0) * 1.85, 0.0);
        float b3 = max(1.0 - abs(xj - 3.0) * 1.85, 0.0);
        float bs = b0 + b1 + b2 + b3;
        b0 /= bs; b1 /= bs; b2 /= bs; b3 /= bs;

        // Parameter-space morph. One spine primitive, seven interpolated numbers,
        // so the silhouette deforms and no fragment shows two forms at half alpha.
        //              plate      needle     thorn      quill
        float lenM = 0.70 * b0 + 1.00 * b1 + 1.08 * b2 + 1.14 * b3;  // reach
        float wM   = 1.95 * b0 + 1.00 * b1 + 0.58 * b2 + 0.24 * b3;  // chord
        float tpr  = 0.55 * b0 + 1.00 * b1 + 1.25 * b2 + 1.75 * b3;  // taper
        float scM  = 0.50 * b0 + 1.00 * b1 + 1.45 * b2 + 2.30 * b3;  // plate pitch
        float swg  = 0.25 * b0 + 0.55 * b1 + 0.85 * b2 + 0.18 * b3;  // serration
        float rkM  = 8.00 * b0 + 16.0 * b1 + 24.0 * b2 + 34.0 * b3;  // chevron rake
        float whM  = 0.20 * b0 + 1.00 * b1 + 1.25 * b2 + 1.60 * b3;  // whisker

        float len  = reach * breath * (0.68 + 0.32 * hv) * lenM;

        float qn  = q / max(len, 1e-4);             // 0 at the core, 1 at the tip
        float tap = clamp(1.0 - qn, 0.0, 1.0);
        float w   = THICK * wM * pow(tap, tpr) * (0.55 + 0.45 * tap);

        // Kill anything past the tip, and hand the nucleus to the core glow so
        // fourteen overlapping bases do not blow out on their own.
        float gate    = 1.0 - smoothstep(0.90, 1.05, qn);
        float nearCut = smoothstep(0.030, 0.088, q);
        float mask    = gate * nearCut;

        // Scale plating. The serrated half-width is evaluated three times at
        // slightly different phases, one per channel, so every scale edge
        // splits into a real RGB fringe instead of a tinted outline.
        // The -ap term rakes each seam into a chevron pointing outward, which
        // is what makes the plating read as overlapping scales and not as
        // stacked blocks.
        vec3 bp    = fract(vec3(qn * SCALES * scM - drift - ap * rkM) + CH * disp);
        vec3 w3    = w * ((1.15 - swg) + swg * bp);
        vec3 d3    = vec3(ap) - w3;
        vec3 plate = (1.0 - smoothstep(vec3(-0.0040), vec3(0.0055), d3)) * mask;

        // Each scale is a chip, not a smooth ramp: the seam behind it goes
        // nearly black and the crest carries the shine. Shading only, so the
        // silhouette stays solid while the body gains relief.
        float chip  = 0.08 + 0.92 * smoothstep(0.06, 0.62, bp.g);
        float crest = smoothstep(0.72, 0.99, bp.g);

        // Thin-film hue: banded along the spine and across it, precessing once
        // per loop, weighted toward green-cyan.
        // The CAM_DIR term makes the spines facing the viewer's side of the
        // object read a different colour from the ones facing away.
        float hueT = qn * 0.62 + ap * 2.10 + fi * 0.07 + hv * 0.13 + huePh
                   + 0.45 * dot(dir, CAM_DIR.xy);
        vec3  hue  = filmHue(hueT) * vec3(0.86, 1.20, 1.02);
        // Desaturate toward deep teal, never toward white: a white floor lifts
        // every channel at once and the foil goes pastel.
        hue = mix(vec3(0.07, 0.26, 0.22), hue, sat);

        // Wet specular line on each scale edge, from the same signed distance.
        float fringe = (1.0 - smoothstep(0.0, 0.0038, abs(d3.g))) * mask;

        // Hair-thin whisker running out past the needle.
        float hair = (1.0 - smoothstep(0.0016, 0.0050, ap))
                   * smoothstep(0.60, 0.88, qn)
                   * (1.0 - smoothstep(0.98, 1.13, qn)) * whM;

        // Anamorphic streak along the strut axis: thin, self-normalised to a
        // peak of 1.0, and with a slow axial falloff so on a kick it shoots
        // well past the needle tips instead of pooling in the middle. The
        // second factor is what closes it inside the frame.
        float ray = (0.00008 / (ap * ap + 0.00008))
                  * (1.0 / (1.0 + q * 4.5))
                  * (1.0 - smoothstep(0.33, 0.44, q)) * flareF;

        // Gains stay near 1.0 on purpose: push them higher and every channel
        // clips together, which is exactly how a saturated hologram turns pastel.
        col += hue * plate * (chip * 1.05)
             + vec3(0.86, 1.00, 0.94) * fringe * 0.26
             + hue * crest * plate.g * 0.34
             + vec3(0.94, 1.00, 0.97) * hair * 0.62
             + mix(vec3(1.00, 0.97, 0.88), hue, 0.30) * ray * 1.90;

        covP += max(plate.r, max(plate.g, plate.b));
        covF += fringe;
        covH += hair;
        covR += ray;
    }

    // The hub the spines grow out of: a fourteen-lobed disc of concentric
    // chroma rings, scalloped in step with the spines so it turns with them.
    // One atan for the whole frame, and none inside the loop.
    float aa = atan(uv.y, uv.x);
    float rk = r + 0.0075 * cos(14.0 * (aa - rot));
    float hubMask = 1.0 - smoothstep(0.070, 0.108, rk);
    float ring    = fract(rk * 34.0 - drift * 2.0);
    vec3  hubHue  = filmHue(rk * 2.20 + huePh + 0.30) * vec3(0.86, 1.20, 1.02);
    hubHue = mix(vec3(0.07, 0.26, 0.22), hubHue, sat);
    float hub = hubMask * (0.08 + 0.92 * smoothstep(0.10, 0.70, ring));
    col += hubHue * hub * 0.90;

    // White-hot core, bounded so it pools at the centre only.
    float core = (0.0016 / (r2 + 0.0026)) * (1.0 - smoothstep(0.012, 0.105, r)) * glow;
    col += vec3(1.00, 0.99, 0.94) * core * 0.85;

    // Soft knee. Fourteen additive spines converge on one point; without this
    // the whole nucleus clips to flat white and the plating disappears.
    col = col / (1.0 + col * 0.30);

    // Radial safety bound. The quill form is the longest, at 0.34 * 1.05 breath
    // * 1.00 hash * 1.14 length, which puts its tip at 0.407 and the whisker
    // past it at 0.460, so this fade only ever feathers a whisker.
    float rim = 1.0 - smoothstep(0.44, 0.482, r);
    col *= rim;

    // Coverage, then premultiply. Zero everywhere the object is not.
    float alpha = (covP * 1.00 + covF * 0.60 + covH * 0.65 + covR * 0.40
                 + hubMask * 0.95 + core * 0.55) * rim;
    alpha = smoothstep(0.020, 1.00, alpha);
    alpha = clamp(alpha, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
