/*{
  "ADITS": 1,
  "DESCRIPTION": "A glowing neon armature of nesting rings. Archetypes shift from a delicate cyan halo, to a pulsing violet turbine, to an intense magenta starburst. Rings expand with bass, rotate with mids, and spark with treble.",
  "CREDIT": "gemini-2.5-pro (Jules)",
  "DATE": "2024-11-20",
  "CATEGORIES": ["generative", "morph", "neon", "audio"],
  "COST": "medium",
  "LOOP": 12.0,
  "INPUTS": [
    { "NAME": "scale", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0.15, "MAX": 0.45,
      "LABEL": "Ring Scale", "BIND": "bass", "BIND_DEPTH": 0.4 },
    { "NAME": "warp", "TYPE": "float", "DEFAULT": 0.20, "MIN": 0.05, "MAX": 0.80,
      "LABEL": "Core Warp", "BIND": "mid", "BIND_DEPTH": 0.6 },
    { "NAME": "sparkle", "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.00, "MAX": 1.00,
      "LABEL": "Edge Sparkle", "BIND": "treble", "BIND_DEPTH": 0.8 },
    { "NAME": "sens", "TYPE": "float", "DEFAULT": 0.85, "MIN": 0.10, "MAX": 1.00,
      "LABEL": "Morph Gain" }
  ]
}*/

#define TAU 6.28318530718
#define PERIOD 12.0

// Archetype profiles
// 0: Cyan Halo (Resting state, soft, sparse)
// 1: Violet Turbine (Mid-state, rotating blades, energetic)
// 2: Magenta Starburst (High-state, sharp, dense, spiky)

void main() {
    // Canonical preamble
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;

    float ph = fract(TIME / PERIOD);
    float t = ph * TAU;

    // Morph Selector
    float lo = AUDIO_BASS;
    float md = AUDIO_MID;
    float hi = AUDIO_TREBLE;
    float sum = lo + md + hi + 1e-3;
    float tilt = (md * 0.5 + hi) / sum;

    // Expand range, default sens is high (0.85)
    float sel = clamp((tilt - 0.5) * (1.6 + 3.4 * sens) + 0.5, 0.0, 1.0);
    // Onset shove
    sel = clamp(sel + 0.5 * (AUDIO_HAT - AUDIO_KICK), 0.0, 1.0);

    // Fade into live selector from resting state bias (0.0: Cyan Halo)
    float live = smoothstep(0.02, 0.12, lo + md + hi);
    float bias = 0.0;
    sel = mix(bias, sel, live);

    // Archetype weights (narrow kernel)
    float w0 = 1.0 - smoothstep(0.0, 0.5, sel);
    float w1 = smoothstep(0.1, 0.5, sel) * (1.0 - smoothstep(0.5, 0.9, sel));
    float w2 = smoothstep(0.5, 1.0, sel);

    // Shared geometry base
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Shared continuous parameters
    float current_scale = scale; // bound to bass

    // Archetype 0: Cyan Halo
    float h0_r = r / current_scale;
    float h0_ring = abs(h0_r - 0.8) - 0.02;
    float h0_glow = 0.001 / (h0_ring * h0_ring + 0.01);
    float h0_core = 0.001 / (r * r + 0.02);
    vec3 col0 = vec3(0.1, 0.8, 1.0) * (h0_glow * 0.8 + h0_core * 0.5);

    // Archetype 1: Violet Turbine
    float h1_r = r / (current_scale * 1.1);
    float blade_angle = a + t * 2.0; // Rotate
    float blades = cos(blade_angle * 8.0);
    float h1_ring = abs(h1_r - 0.7 - warp * 0.1 * blades) - 0.02;
    float h1_glow = 0.001 / (h1_ring * h1_ring + 0.01);
    float h1_core = 0.001 / (r * r + 0.02);
    vec3 col1 = vec3(0.6, 0.2, 1.0) * (h1_glow + h1_core * 0.5) * (1.0 + sparkle * 2.0 * AUDIO_SNARE);

    // Archetype 2: Magenta Starburst
    float h2_r = r / (current_scale * 0.9);
    float spike_angle = a - t * 3.0;
    float spikes = pow(abs(cos(spike_angle * 16.0)), 8.0);
    float h2_ring = abs(h2_r - 0.5 - spikes * warp * 0.3) - 0.01;
    float h2_glow = 0.001 / (h2_ring * h2_ring + 0.01);
    float h2_core = 0.001 / (r * r + 0.02);
    float spark = 0.0;
    if (sparkle > 0.0) {
        // use an integer multiple of the base angle (t) for seamless loop
        spark = pow(abs(sin(r * 50.0 - t * 2.0)), 20.0) * sparkle;
    }
    vec3 col2 = vec3(1.0, 0.1, 0.6) * (h2_glow + h2_core * 0.5 + spark * 2.0);

    // Blend
    vec3 col = col0 * w0 + col1 * w1 + col2 * w2;

    // Add kick flash to all
    col += vec3(0.8, 0.9, 1.0) * AUDIO_KICK * 0.03 / (r*r + 0.01);

    // Coverage and premultiply
    // Ensure total bounds (alpha must be 0 outside 0.46, soft cut by 0.48)
    float bounds_mask = smoothstep(0.42, 0.35, r);
    float core_mask = smoothstep(0.35, 0.0, r);
    float coverage = max(max(col.r, col.g), col.b) * (0.6 + 0.4 * core_mask);
    float alpha = clamp(coverage, 0.0, 1.0) * bounds_mask;

    col *= bounds_mask;

    // Further clamp col to ensure no opaque regions unnecessarily (neon style is additive/bright)
    col = min(col, vec3(2.0)); // Keep peak emissives reasonable

    // Premultiply
    col *= alpha;

    gl_FragColor = vec4(col, alpha);
}