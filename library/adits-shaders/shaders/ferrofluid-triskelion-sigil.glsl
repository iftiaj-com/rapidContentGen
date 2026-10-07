/*{
  "ADITS": 1,
  "DESCRIPTION": "Three molten iron arms drawn from a glowing crucible core at 120 degrees apart. The arms morph between fat teardrop pods, segmented ferrofluid blades, and sharp needle lances as the spectrum tilts from bass to treble. Rests as the segmented blade.",
  "CREDIT": "claude-opus-4-7",
  "DATE": "2026-10-02",
  "CATEGORIES": ["generative", "morph", "audio", "ferrofluid", "sigil"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "low",
  "ASPECT": "square",
  "LOOP": 16.0,
  "INPUTS": [
    { "NAME": "sens",       "TYPE": "float", "DEFAULT": 0.80, "MIN": 0.20, "MAX": 1.00,
      "LABEL": "Spectral Gain" },
    { "NAME": "snap",       "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Onset Drive" },
    { "NAME": "rest",       "TYPE": "float", "DEFAULT": 0.50, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Resting Form" },
    { "NAME": "core_swell", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0.30, "MAX": 0.90,
      "LABEL": "Core Swell",     "BIND": "bass",   "BIND_DEPTH": 0.50 },
    { "NAME": "arm_warp",   "TYPE": "float", "DEFAULT": 0.40, "MIN": 0.10, "MAX": 0.85,
      "LABEL": "Arm Warp",       "BIND": "mid",    "BIND_DEPTH": 0.60 },
    { "NAME": "edge_sharp", "TYPE": "float", "DEFAULT": 0.45, "MIN": 0.15, "MAX": 0.90,
      "LABEL": "Edge Sharpness", "BIND": "treble", "BIND_DEPTH": 0.60 },
    { "NAME": "tint",       "TYPE": "color", "DEFAULT": [1.00, 0.55, 0.18, 1.00],
      "LABEL": "Molten Tint" }
  ]
}*/

#define TAU    6.28318530718
#define PERIOD 16.0

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
}

void main() {
    // Canonical preamble, resolution-independent, aspect-correct.
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    float r   = length(uv);
    float ang = atan(uv.y, uv.x);

    // Everything outside 0.48 is zero. Early return keeps the border cheap and
    // guarantees edge coverage is 0 no matter what archetype or bind is active.
    float bound = smoothstep(0.480, 0.420, r);
    if (bound <= 0.0) { gl_FragColor = vec4(0.0); return; }

    // Phase wraps exactly at LOOP = 16 s. Every time factor below is an integer
    // multiple of t so t = 0 and t = TAU render identical frames.
    float ph = fract(TIME / PERIOD);
    float t  = ph * TAU;

    // --- Soft knees ------------------------------------------------------------
    // Band values hover a few hundredths above zero at idle. A low floor kills the
    // shimmer; a ceiling under 1 stops the slam at full. Applied multiplicatively.
    float lo = AUDIO_BASS, md = AUDIO_MID, hi = AUDIO_TREBLE;
    float basS = smoothstep(0.04, 0.95, lo);
    float midS = smoothstep(0.04, 0.95, md);
    float hiS  = smoothstep(0.04, 0.95, hi);

    // --- Spectral selector (guide 12.2 - 12.4, 12.7) ---------------------------
    float sum  = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;                 // 0 all bass, 1 all treble
    float xSel = (tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5;
    // Onset shove, bounded to about half an archetype's spacing (gap = 1.0 / 2).
    xSel += snap * (AUDIO_HAT - AUDIO_KICK) * 0.5;
    // Smooth saturation so a pinned band does not jitter at the boundary.
    float sel = smoothstep(0.0, 1.0, xSel);
    // In silence tilt is 0/0 and would default to an extreme. Fade to the chosen
    // resting archetype instead; the mid blade is the house rest.
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(rest, sel, live);

    // Three archetypes at x = 0, 1, 2. Smooth kernel (guide 12.6) with slope 1.5.
    //   A0 (sel=0) : fat teardrop pod       - bass-heavy, soft
    //   A1 (sel=1) : segmented ferro-blade  - mid, the house rest
    //   A2 (sel=1) : sharp needle lance     - treble, bright tip
    float x0 = sel * 2.0;

    // --- Shared quantities (guide 12.1 - "shared parameters") ------------------
    // Bass sets how far the arms reach and how the hot core breathes. Multiplied,
    // never added into phase, so silence lands exactly on the default (rule 11.10).
    float sizeK = 0.90 + 0.35 * core_swell + 0.14 * basS;   // ~1.08 at silence
    float coreR = 0.065 * sizeK;

    // Beat pulses the hub. AUDIO_BEAT already decays, used as a multiplier.
    float heart = 0.55 + 0.45 * AUDIO_BEAT;

    vec3 col   = vec3(0.0);
    float cov  = 0.0;

    // --- Hot crucible core (shared across every archetype) ---------------------
    vec3 hubHot  = mix(vec3(1.00, 0.72, 0.28), vec3(1.00, 0.96, 0.78), heart);
    float coreM  = smoothstep(coreR * 1.35, coreR * 0.45, r);
    float coreGl = 0.0038 / (r * r + 0.0010) * smoothstep(0.38, 0.0, r);
    col += hubHot * (coreM * 1.6 + coreGl * 0.55);
    cov += coreM * 0.95 + coreGl * 0.22;

    // --- Three ferrofluid arms (triskelion) ------------------------------------
    // Full integer rotation across one loop keeps the seam continuous.
    float sector = TAU / 3.0;
    float spin   = t * 1.0;
    float af     = mod(ang + sector * 0.5 + spin, sector) - sector * 0.5;

    // The three arms are drawn by a 3-iteration loop so each gets its own static
    // phase offset for the morph stagger (guide 12.6). Bound is compile-time.
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float jit = hash11(fi * 3.17 + 1.9);

        // Per-arm selector offset. Static, so a fixed spectrum holds still.
        // Bounded to about one archetype's spacing (0.95 of a unit).
        float xj = clamp(x0 + 0.95 * (0.60 * (fi - 1.0) + 0.40 * (jit - 0.5)),
                         0.0, 2.0);

        // Smooth-kernel weights, support 1 / 1.5 either side. Normalised.
        float w0 = smoothstep(0.0, 1.0, 1.0 - abs(xj      ) * 1.5);
        float w1 = smoothstep(0.0, 1.0, 1.0 - abs(xj - 1.0) * 1.5);
        float w2 = smoothstep(0.0, 1.0, 1.0 - abs(xj - 2.0) * 1.5);
        float ws = w0 + w1 + w2 + 1e-4;
        w0 /= ws; w1 /= ws; w2 /= ws;

        // Parameter-space morph (guide 12.6). One primitive, numbers interpolated,
        // so a mid-blend is a real intermediate arm and not two bodies at half alpha.
        //                 pod       blade       needle
        float reachM  = 0.30 * w0 + 0.345 * w1 + 0.395 * w2;
        float widthM  = 0.090 * w0 + 0.052 * w1 + 0.022 * w2;
        float taperM  = 1.8   * w0 + 3.2   * w1 + 7.0   * w2;
        float ribFrq  = 0.0   * w0 + 11.0  * w1 + 22.0  * w2;
        float ribAmp  = 0.00  * w0 + 0.28  * w1 + 0.08  * w2;

        reachM *= sizeK;

        // Angle of each arm's own axis - every arm is drawn in its local frame.
        float armAx = fi * sector - spin + jit * 0.03;
        float ca = cos(armAx), sa = sin(armAx);
        vec2  pL = vec2(ca * uv.x + sa * uv.y, -sa * uv.x + ca * uv.y);

        // Only the half-plane in front of the hub counts as this arm.
        float along  = pL.x;
        float across = abs(pL.y);
        float lenU   = along / max(reachM, 1e-3);
        float onArm  = step(0.0, along);

        // Taper profile - fat near the hub, narrow at the tip.
        float prof = widthM * pow(max(1.0 - lenU, 0.0), 1.0 / taperM);

        // Mid-driven segmentation. Audio scales the amplitude of a sin, never its
        // phase (rule 11.10). ribFrq varies with the selector, not with audio.
        float warpAmt = ribAmp * (0.5 + 0.9 * arm_warp) * (0.3 + 0.9 * midS);
        float ridge   = sin(along * ribFrq + spin * 2.0);
        prof *= 1.0 - warpAmt * ridge * ridge;

        // Normalised distance across the arm (0 at axis, 1 at the current edge).
        float u = across / max(prof, 1e-3);

        // Base arm envelope - soft at edges, sharp at reach, dies out at the hub.
        float body = smoothstep(1.0, 0.0, u)
                   * smoothstep(coreR * 0.25, coreR * 1.00, along)
                   * smoothstep(reachM, reachM - 0.012, along);
        body *= onArm;

        // Hot centre spine - a thin bright core down the axis of each arm.
        float glowSpine = exp(-u * u * 11.0) * body;

        // Dark shadow band halfway out - gives the molten-metal "folded" seam.
        float shade = 1.0 - 0.55 * exp(-pow(u - 0.55, 2.0) * 42.0);

        // Treble-driven bright edge rim just inside the silhouette.
        float sharp = 7.0 + 22.0 * edge_sharp * (0.3 + 0.9 * hiS);
        float rimMask = exp(-pow(u - 0.88, 2.0) * sharp * sharp) * body;

        // Hot molten interior tinted toward white at the tip; dark outer skin.
        vec3 hotInside = mix(tint.rgb, vec3(1.00, 0.96, 0.78), lenU * 0.60);
        vec3 darkSkin  = vec3(0.030, 0.022, 0.028);
        vec3 bodyC     = mix(darkSkin, hotInside, pow(1.0 - u, 0.7)) * shade;

        float emis = (1.1 + 0.5 * basS) * (0.75 + 0.4 * heart);

        // Composited body: dark glossy skin wrapping a hot molten interior.
        col += bodyC * body * emis;
        cov += body * 0.90;

        // Centre spine - the bright hot core line down the middle of each arm.
        col += vec3(1.00, 0.90, 0.68) * glowSpine * (0.55 + 0.9 * basS);
        cov += glowSpine * 0.25;

        // Treble rim - a bright edge catching the light.
        vec3 rimC = mix(vec3(1.00, 0.82, 0.50), vec3(1.0, 1.0, 0.92), hiS);
        col += rimC * rimMask * (0.55 + 0.9 * hiS);
        cov += rimMask * 0.30;

        // Tip spark - a tight hot point at the end of the needle, strongest for A2.
        float sparkTip = smoothstep(0.012, 0.0, abs(along - reachM) + across * 1.8)
                       * w2 * (0.6 + 1.4 * hiS);
        col += vec3(1.0, 0.95, 0.75) * sparkTip;
        cov += sparkTip * 0.5;
    }

    // --- Kick recoil on the hub (single onset in the body) ---------------------
    // The kick already decays, used straight. Falloff is spatial so the pop stays
    // around the core and the alpha contribution rides the same mask.
    float coreFlash = AUDIO_KICK * exp(-r * r * 40.0);
    col += vec3(1.00, 0.80, 0.45) * coreFlash * 0.70;
    cov += coreFlash * 0.28;

    // --- Final composite -------------------------------------------------------
    // Everything is multiplied by the bound mask so the frame edge is clean.
    cov *= bound;
    col *= bound;

    // Tone-map only the object (never the background - alpha is still 0 outside).
    col = col / (1.0 + col * 0.35);
    col = pow(max(col, 0.0), vec3(0.92));

    float alpha = clamp(cov, 0.0, 1.0);
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
