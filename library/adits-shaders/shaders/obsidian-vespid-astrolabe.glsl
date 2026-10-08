/*{
  "ADITS": 1,
  "DESCRIPTION": "An obsidian biomech astrolabe with vespid armatures morphing across four spectral archetypes: Carapace Vault, Mantis Spire, Astrolabe Ring, and Needle Nova Star.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2026-08-27",
  "CATEGORIES": ["generative", "morph", "audio"],
  "ALPHA": "premultiplied",
  "BACKGROUND": "none",
  "COST": "medium",
  "ASPECT": "square",
  "LOOP": 24.0,
  "INPUTS": [
    {
      "NAME": "sens",
      "TYPE": "float",
      "DEFAULT": 0.85,
      "MIN": 0.10,
      "MAX": 1.00,
      "LABEL": "Morph Sensitivity"
    },
    {
      "NAME": "bias",
      "TYPE": "float",
      "DEFAULT": 0.00,
      "MIN": 0.00,
      "MAX": 1.00,
      "LABEL": "Silence Bias"
    },
    {
      "NAME": "snap",
      "TYPE": "float",
      "DEFAULT": 0.35,
      "MIN": 0.00,
      "MAX": 0.80,
      "LABEL": "Transient Snap"
    },
    {
      "NAME": "scale",
      "TYPE": "float",
      "DEFAULT": 0.38,
      "MIN": 0.20,
      "MAX": 0.44,
      "LABEL": "Astrolabe Scale",
      "BIND": "bass",
      "BIND_DEPTH": 0.30
    },
    {
      "NAME": "warp",
      "TYPE": "float",
      "DEFAULT": 0.50,
      "MIN": 0.00,
      "MAX": 1.00,
      "LABEL": "Armature Warp",
      "BIND": "mid",
      "BIND_DEPTH": 0.50
    },
    {
      "NAME": "detail",
      "TYPE": "float",
      "DEFAULT": 0.40,
      "MIN": 0.10,
      "MAX": 1.00,
      "LABEL": "Chitin Filigree",
      "BIND": "treble",
      "BIND_DEPTH": 0.60
    },
    {
      "NAME": "tint",
      "TYPE": "color",
      "DEFAULT": [0.12, 0.78, 1.00, 1.00],
      "LABEL": "Cyan Rim Glow"
    }
  ]
}*/

#define PERIOD 24.0
#define TAU 6.28318530718

void main() {
    // Canonical preamble: aspect-correct and resolution-independent
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE.xy) / RENDERSIZE.y;

    // Harmonic phase wrapping for seamless loop
    float ph = fract(TIME / PERIOD);
    float phase = ph * TAU;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Bounded silhouette mask to avoid frame clipping
    float mask = smoothstep(0.48, 0.42, r);

    // Spectral selector logic (guide §12.2, §12.3, §12.4)
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sumBands = lo + md + hi + 0.001;
    float tilt = (md * 0.5 + hi) / sumBands;
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    sel = clamp(sel + snap * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    float live = smoothstep(0.02, 0.12, lo + md + hi);
    sel = mix(bias, sel, live);

    // Morph kernel weights (guide §12.6)
    float w0 = max(0.0, 1.0 - 1.5 * abs(sel - 0.000));
    float w1 = max(0.0, 1.0 - 1.5 * abs(sel - 0.333));
    float w2 = max(0.0, 1.0 - 1.5 * abs(sel - 0.667));
    float w3 = max(0.0, 1.0 - 1.5 * abs(sel - 1.000));
    float wSum = w0 + w1 + w2 + w3 + 0.0001;
    w0 /= wSum;
    w1 /= wSum;
    w2 /= wSum;
    w3 /= wSum;

    // Shared core nucleus (guide §12.6)
    float coreR = scale * 0.30;
    float nucleus = smoothstep(0.02, 0.0, abs(r - coreR));

    // Archetype 0: Carapace Vault (ribbed obsidian dome with glowing lattice)
    float lobe0 = cos(a * 6.0 + phase * 1.0);
    float r0 = scale * (0.80 + 0.20 * lobe0);
    float body0 = smoothstep(0.035, 0.0, abs(r - r0));
    float rib0 = smoothstep(0.015, 0.0, abs(sin(a * 12.0 - phase * 1.0) * r - 0.04));
    float arch0 = body0 + rib0 * 0.5;

    // Archetype 1: Mantis Spire (sweeping vespid pincers and angular mandibles)
    float lobe1 = abs(sin(a * 2.0 + phase * 1.0)) * cos(a * 4.0 - phase * 2.0);
    float r1 = scale * (0.60 + 0.45 * lobe1 + 0.10 * warp);
    float body1 = smoothstep(0.025, 0.0, abs(r - r1));
    float pincer1 = smoothstep(0.012, 0.0, abs(cos(a * 8.0 + phase * 2.0) * r - 0.06));
    float arch1 = body1 + pincer1 * 0.6;

    // Archetype 2: Astrolabe Ring (gimbal rings with 12-fold filigree teeth)
    float ringA = smoothstep(0.018, 0.0, abs(r - scale * 0.50));
    float ringB = smoothstep(0.018, 0.0, abs(r - scale * 0.82));
    float ringC = smoothstep(0.018, 0.0, abs(r - scale * 1.10));
    float teeth = smoothstep(0.35, 0.65, cos(a * 12.0 + phase * 2.0 + 2.0 * warp * sin(r * 25.0)));
    float arch2 = (ringA + ringB * 0.85 + ringC * 0.70) * (0.40 + 0.60 * teeth);

    // Archetype 3: Needle Nova Star (16 sharp chitinous radiating spikes)
    float detailExp = 1.0 / max(0.05, detail * 0.50);
    float spike = pow(max(0.0, cos(a * 16.0 + phase * 3.0)), detailExp);
    float r3 = scale * (0.40 + 0.75 * spike);
    float body3 = smoothstep(0.020, 0.0, abs(r - r3));
    float flare3 = 0.006 / (abs(r - r3) + 0.004) * smoothstep(0.45, 0.0, r);
    float arch3 = body3 + flare3 * 0.65;

    // Blended morph field
    float field = w0 * arch0 + w1 * arch1 + w2 * arch2 + w3 * arch3 + nucleus * 0.40;

    // Specular obsidian rim lighting
    float eps = 0.003;
    float ddx = cos((a + eps) * 6.0) - cos((a - eps) * 6.0);
    float spec = pow(max(0.0, 1.0 - abs(ddx) * 4.0), 8.0) * smoothstep(0.40, 0.05, r);

    // Color assembly
    vec3 obsidianBase = vec3(0.03, 0.035, 0.045) * field * 2.5;
    vec3 specRim = vec3(0.85, 0.95, 1.00) * spec * field * 1.8;
    vec3 emissiveGlow = tint.rgb * (nucleus * 1.5 + arch3 * 0.8 + AUDIO_BEAT * 0.4) * field;

    vec3 col = (obsidianBase + specRim + emissiveGlow) * mask;

    // Premultiplied alpha computation (guide §8)
    float alpha = clamp(field * 1.2, 0.0, 1.0) * mask;
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}
