/**
 * vj-presets.js — DATA ONLY for the Video Jockey deck. // VJ
 * ─────────────────────────────────────────────────────────────────────────────
 * Mirrors the effects/auto/auto-presets.js convention: no logic, no imports,
 * just declarative preset records the deck applies to its own controls.
 *
 * A preset is the primary interface for this feature. The brief was "highly
 * preset based with minimal control complexity", so a performer should be able
 * to pick a name + a control source and be done; every slider below is
 * reachable, but none of them need touching.
 *
 * Record shape:
 *   key       stable id (used by the <select> and by _stepPreset)
 *   label     display name
 *   fx        which VJ FX this drives — must match that FX's static KEY
 *   params    static, non-modulated shader params. Merged OVER the FX's own
 *             `static PARAMS` defaults, so a preset only names what it changes.
 *   channels  per-channel VJModulator overrides (merged over CHANNEL_DEFAULTS
 *             and over the FX's own channel defaults)
 *   depth     { source: 'luminance' | 'upload', subject: bool }
 *             `luminance` + subject:false is the zero-cost default path.
 *
 * Randomize pools are NOT here — each FX owns its own `static RANDOM`, next to
 * the params it describes, so the two can't drift apart.
 */

export const VJ_PRESETS = [
    {
        key: 'pulse_scan',
        label: 'Pulse Scan',
        fx: 'scan',
        params: { pattern: 0, tint: '#ff2d2d', glow: 0.10, parallax: 0.020, depthSoften: 2.5, depthContrast: 1.15, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.33 },
            intensity: { source: 'manual', manual: 0.70 },
            band:      { source: 'manual', manual: 0.16 },
            tiling:    { source: 'manual', manual: 0.55 },
            dim:       { source: 'manual', manual: 1.00 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'neon_sweep',
        label: 'Neon Sweep',
        fx: 'scan',
        params: { pattern: 3, tint: '#00e5ff', glow: 0.22, parallax: 0.026, depthSoften: 3.5, depthContrast: 1.30, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'audio', band: 'bass', gain: 1.6, smooth: 0.35 },
            intensity: { source: 'audio', band: 'beat', gain: 1.0, floor: 0.35 },
            band:      { source: 'manual', manual: 0.26 },
            tiling:    { source: 'manual', manual: 0.35 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'ghost_edges',
        label: 'Ghost Edges',
        fx: 'scan',
        params: { pattern: 1, tint: '#ff3df0', glow: 0.16, parallax: 0.018, depthSoften: 4.0, depthContrast: 1.10, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'auto', shape: 'pingpong', rate: 0.22 },
            intensity: { source: 'manual', manual: 0.85 },
            band:      { source: 'manual', manual: 0.30 },
            tiling:    { source: 'manual', manual: 0.50 },
            dim:       { source: 'manual', manual: 0.55 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'wireframe_pass',
        label: 'Wireframe Pass',
        fx: 'scan',
        params: { pattern: 2, tint: '#ffffff', glow: 0.06, parallax: 0.014, depthSoften: 2.0, depthContrast: 1.45, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'auto', shape: 'ramp', rate: 0.28 },
            intensity: { source: 'manual', manual: 0.60 },
            band:      { source: 'manual', manual: 0.12 },
            tiling:    { source: 'manual', manual: 0.22 },
            dim:       { source: 'manual', manual: 0.60 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'deep_sonar',
        label: 'Deep Sonar',
        fx: 'scan',
        params: { pattern: 0, tint: '#39ff8a', glow: 0.28, parallax: 0.030, depthSoften: 5.0, depthContrast: 1.60, depthInvert: true, subject: 0.70 },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.18 },
            intensity: { source: 'audio', band: 'vol', gain: 1.4, floor: 0.30 },
            band:      { source: 'manual', manual: 0.40 },
            tiling:    { source: 'manual', manual: 0.75 },
            dim:       { source: 'manual', manual: 0.45 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'subject_reveal',
        label: 'Subject Reveal (AI)',
        fx: 'scan',
        params: { pattern: 0, tint: '#ffb020', glow: 0.18, parallax: 0.022, depthSoften: 3.0, depthContrast: 1.20, depthInvert: false, subject: 0.85 },
        channels: {
            progress:  { source: 'gesture', axis: 'y', manual: 0.5, smooth: 0.30 },
            intensity: { source: 'manual', manual: 0.80 },
            band:      { source: 'manual', manual: 0.22 },
            tiling:    { source: 'manual', manual: 0.60 },
            dim:       { source: 'manual', manual: 0.70 },
        },
        // The ONLY preset that turns the MediaPipe layer on — everything above
        // stays on the zero-cost luminance path.
        depth: { source: 'luminance', subject: true },
    },
    {
        key: 'motes',
        label: 'Motes',
        fx: 'scan',
        // Airborne dust caught in a moving light: hairline sparks streaming
        // radially past the lens, a handful of them blown out to white halos,
        // over a pulled-down plate. Neutral white on purpose — the reference is
        // monochrome, and any tint here reads as glitter rather than as air.
        //
        // Wide Band Width is doing real work: the motes should be lit through a
        // deep slab of the scene at once (the reference has sparks at every
        // depth simultaneously), where the other Scan presets want a thin iso
        // band. Glow stays low because the bloom is baked into each mote — the
        // pattern-free band halo on top of it would just fog the frame.
        params: { pattern: 4, tint: '#ffffff', glow: 0.08, parallax: 0.028, depthSoften: 3.0, depthContrast: 1.30, depthInvert: false, subject: 0.70 },
        channels: {
            // Slow sweep: the drift is already carrying the eye, so the band
            // only has to decide WHICH depth is sparkling right now.
            progress:  { source: 'auto', shape: 'ease', rate: 0.14 },
            // Audio flares the sparks; the floor keeps the field alive between
            // hits so a quiet passage never goes fully dark.
            intensity: { source: 'audio', band: 'vol', gain: 1.3, floor: 0.44 },
            band:      { source: 'manual', manual: 0.72 },
            tiling:    { source: 'manual', manual: 0.40 },
            dim:       { source: 'manual', manual: 0.62 },
        },
        depth: { source: 'luminance', subject: false },
    },

    // ── Lum Network (fx: 'lumnet') ───────────────────────────────────────────
    // Each entry changes TOPOLOGY, palette and control source together, so they
    // read as different instruments rather than as slider variations of one.
    // Deduped against the reference set: looks that differ only in colour or
    // density were merged rather than shipped twice. All stay on the zero-cost
    // luminance depth path — Subject Depth remains a manual opt-in.
    //
    // A) Light-installation family — organic, growth-driven
    {
        key: 'lum_forest',
        label: 'Luminous Forest',
        fx: 'lumnet',
        // Pale stems growing out of bright ground, ring tips, heavy air. Slow
        // wave — the growth should be felt, not watched.
        params: {
            style: 1, tint: '#eaf7ff', accent: '#eaf7ff',
            threshold: 0.40, linkRange: 0.50, nodeSize: 0.34,
            glow: 0.17, parallax: 0.018,
            depthSoften: 3.5, depthContrast: 1.25, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.13 },
            intensity: { source: 'manual', manual: 0.58 },
            band:      { source: 'manual', manual: 0.46 },
            tiling:    { source: 'manual', manual: 0.40 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lum_constellation',
        label: 'Constellation',
        fx: 'lumnet',
        // Cold star-map over the highlights. Bass drives the wave so the net
        // re-draws itself on the low end without ever fully going dark.
        params: {
            style: 0, tint: '#7fe9ff', accent: '#7fe9ff',
            threshold: 0.46, linkRange: 0.58, nodeSize: 0.30,
            glow: 0.14, parallax: 0.024,
            depthSoften: 2.5, depthContrast: 1.35, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'audio', band: 'bass', gain: 1.6, floor: 0.14, smooth: 0.34 },
            intensity: { source: 'manual', manual: 0.66 },
            band:      { source: 'manual', manual: 0.40 },
            tiling:    { source: 'manual', manual: 0.50 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lum_pollen',
        label: 'Pollen Drift',
        fx: 'lumnet',
        // Warm, airy, barely-there: sparse radial bursts on a bright plate, the
        // widest halo of the set. Ping-pong so it breathes instead of resetting.
        params: {
            style: 2, tint: '#ffd27a', accent: '#ffd27a',
            threshold: 0.44, linkRange: 0.50, nodeSize: 0.44,
            glow: 0.26, parallax: 0.030,
            depthSoften: 4.5, depthContrast: 1.15, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'pingpong', rate: 0.11 },
            intensity: { source: 'manual', manual: 0.50 },
            band:      { source: 'manual', manual: 0.52 },
            tiling:    { source: 'manual', manual: 0.32 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lum_synapse',
        label: 'Synapse',
        fx: 'lumnet',
        // The club preset: long violet links, transient-driven brightness. The
        // wave rides continuous bass while `intensity` takes the beat envelope,
        // so hits flash the whole network instead of moving it.
        params: {
            style: 0, tint: '#b98bff', accent: '#ff5ecd',
            threshold: 0.38, linkRange: 0.86, nodeSize: 0.36,
            glow: 0.22, parallax: 0.026,
            depthSoften: 3.0, depthContrast: 1.30, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'audio', band: 'bass', gain: 1.7, floor: 0.10, smooth: 0.40 },
            intensity: { source: 'audio', band: 'beat', gain: 1.1, floor: 0.34 },
            band:      { source: 'manual', manual: 0.30 },
            tiling:    { source: 'manual', manual: 0.54 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },

    // B) Machine-vision family — analytical, graphic, sits ON the subject.
    //    Four of these share style 4 (Detection HUD) but are NOT variations of
    //    one look: box scale, label format and link reach change what the frame
    //    is *saying* (surveying / locking / measuring / sampling), which is the
    //    difference between an overlay and a language.
    {
        key: 'lum_circuit',
        label: 'Circuit',
        fx: 'lumnet',
        // PCB bus routing traced onto the subject's silhouette: bundles of ten
        // orthogonal lanes, most riding WHITE at hash-varied brightness (the
        // white/grey mix), two of them running GREEN. Strictly a two-colour
        // preset — Network and Accent are the only inks, and nothing else in the
        // style introduces a third.
        //
        // Ships at the deck-wide Base Dim of 0.80, so the routing reads OVER the
        // footage. The reference sits on pure black — pull Base Dim to 0 for
        // that, which is now reachable; the routing itself does not change,
        // only what it sits on.
        //
        // Threshold picks WHICH contour of the subject the bundle wraps, so it
        // is the one control worth moving per clip; Link Range sets lane
        // spacing in blocks, and Grid Density sets the staircase step size.
        params: {
            style: 3, tint: '#ffffff', accent: '#8ae81f',
            threshold: 0.42, linkRange: 0.30, nodeSize: 0.45,
            glow: 0.04, parallax: 0.010,
            depthSoften: 3.0, depthContrast: 1.45, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ramp', rate: 0.14 },
            intensity: { source: 'manual', manual: 0.85 },
            band:      { source: 'manual', manual: 0.30 },
            // ~11px staircase steps and ~150px bundles at 1080p, which is the
            // proportion the reference holds between step size and bundle width.
            tiling:    { source: 'manual', manual: 0.52 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lum_recon',
        label: 'Recon HUD',
        fx: 'lumnet',
        // Many small markers with short two-digit tags and a polygon net over
        // the bright region. Low threshold on purpose — this look wants to be
        // surveying the WHOLE frame, not just the hero highlight.
        params: {
            style: 4, tint: '#ffffff', accent: '#ffb37a', label: 1,
            threshold: 0.30, linkRange: 0.55, nodeSize: 0.20,
            glow: 0.10, parallax: 0.020,
            depthSoften: 3.0, depthContrast: 1.20, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.15 },
            intensity: { source: 'manual', manual: 0.70 },
            band:      { source: 'manual', manual: 0.44 },
            tiling:    { source: 'manual', manual: 0.62 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lum_tracker',
        label: 'Tracker Lock',
        fx: 'lumnet',
        // Few LARGE boxes with five-digit track IDs — the detector read. Low
        // grid density is what makes boxes rare and big; raising it turns this
        // into Recon HUD, which is why they are one style and two presets.
        params: {
            style: 4, tint: '#ffffff', accent: '#8dff6a', label: 2,
            threshold: 0.46, linkRange: 0.70, nodeSize: 0.78,
            glow: 0.08, parallax: 0.016,
            depthSoften: 3.0, depthContrast: 1.30, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.10 },
            intensity: { source: 'manual', manual: 0.76 },
            band:      { source: 'manual', manual: 0.50 },
            tiling:    { source: 'manual', manual: 0.22 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lum_telemetry',
        label: 'Telemetry',
        fx: 'lumnet',
        // Sparse points, decimal readouts, and links stretched to full reach so
        // the vectors cross the frame. Very low density is the whole trick: big
        // cells mean few nodes AND long links, both at once.
        params: {
            style: 4, tint: '#ffffff', accent: '#ffffff', label: 3,
            threshold: 0.55, linkRange: 1.00, nodeSize: 0.10,
            glow: 0.14, parallax: 0.022,
            depthSoften: 2.0, depthContrast: 1.45, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'audio', band: 'bass', gain: 1.6, floor: 0.16, smooth: 0.34 },
            intensity: { source: 'manual', manual: 0.80 },
            band:      { source: 'manual', manual: 0.42 },
            tiling:    { source: 'manual', manual: 0.08 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lum_markers',
        label: 'Marker Field',
        fx: 'lumnet',
        // Boxes only — no labels, no links (linkRange 0 switches them off, it is
        // not just a short reach). Reads as raw sample points clustering on the
        // highlights; the quietest preset in the set and the easiest to layer.
        params: {
            style: 4, tint: '#ffffff', accent: '#ffffff', label: 0,
            threshold: 0.34, linkRange: 0.00, nodeSize: 0.30,
            glow: 0.12, parallax: 0.024,
            depthSoften: 3.5, depthContrast: 1.25, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.18 },
            intensity: { source: 'manual', manual: 0.72 },
            band:      { source: 'manual', manual: 0.40 },
            tiling:    { source: 'manual', manual: 0.70 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lum_weave',
        label: 'Mesh Weave',
        fx: 'lumnet',
        // Dense triangulated lattice inside the bright region, closed off with a
        // solid blue silhouette outline — the rigged/scanned-body read.
        params: {
            style: 5, tint: '#ffffff', accent: '#6aa9ff',
            threshold: 0.40, linkRange: 0.62, nodeSize: 0.24,
            glow: 0.08, parallax: 0.018,
            depthSoften: 3.0, depthContrast: 1.25, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.12 },
            intensity: { source: 'manual', manual: 0.68 },
            band:      { source: 'manual', manual: 0.48 },
            tiling:    { source: 'manual', manual: 0.52 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lum_thermal',
        label: 'Thermal Blocks',
        fx: 'lumnet',
        // Quantized cells on a blue→red ramp with magenta silhouette blocks and
        // X-marks punched out of the fill. The one preset whose colour comes
        // from the ramp rather than the tint — Network only drives its bloom.
        params: {
            style: 6, tint: '#ffffff', accent: '#ff2fd0',
            threshold: 0.38, linkRange: 0.50, nodeSize: 0.35,
            glow: 0.05, parallax: 0.012,
            depthSoften: 2.5, depthContrast: 1.35, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ramp', rate: 0.14 },
            intensity: { source: 'manual', manual: 0.85 },
            band:      { source: 'manual', manual: 0.38 },
            tiling:    { source: 'manual', manual: 0.45 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lum_dashline',
        label: 'Dash Contour',
        fx: 'lumnet',
        // Broken cyan silhouette outline plus sparse grey direction glyphs. The
        // sparsest of the vision looks — almost all negative space.
        params: {
            style: 7, tint: '#9aa3ab', accent: '#35d6ff',
            threshold: 0.42, linkRange: 0.45, nodeSize: 0.28,
            glow: 0.05, parallax: 0.016,
            depthSoften: 3.5, depthContrast: 1.30, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.12 },
            intensity: { source: 'manual', manual: 0.80 },
            band:      { source: 'manual', manual: 0.46 },
            tiling:    { source: 'manual', manual: 0.40 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },

    // ══ LIGHTS ═══════════════════════════════════════════════════════════════
    // `dim` is Void Level here, not a base dim: 0 = pure void, 1 = the frame
    // fully back. Most of these sit at 0 and let the performer ride it up.
    // `band` is Feather — the softness of the light edge.
    {
        key: 'lit_void',
        label: 'Void',
        fx: 'lights',
        // The baseline: true colour, black fill, medium feather. Whatever is lit
        // survives untouched and everything else is gone. Start here on new
        // footage, find the threshold, then switch mode.
        params: {
            mode: 0, palette: 0, fill: '#000000', tint: '#ffdca8', accent: '#0a1024',
            threshold: 0.42, spread: 0.40, transparent: false,
            hueFocus: false, hueColor: '#3399ff', hueTol: 0.35,
            glow: 0.14, parallax: 0.018,
            depthSoften: 3.0, depthContrast: 1.25, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.16 },
            intensity: { source: 'manual', manual: 0.60 },
            band:      { source: 'manual', manual: 0.24 },
            tiling:    { source: 'manual', manual: 0.45 },
            dim:       { source: 'manual', manual: 0.00 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lit_wreck',
        label: 'Wreck',
        fx: 'lights',
        // The reference look: navy through lavender to gold, banded. What makes
        // a dark plate read as LIT rather than as merely underexposed.
        params: {
            mode: 1, palette: 2, fill: '#000000', tint: '#ffc74d', accent: '#0a1738',
            threshold: 0.30, spread: 0.45, transparent: false,
            hueFocus: false, hueColor: '#3399ff', hueTol: 0.35,
            glow: 0.20, parallax: 0.026,
            depthSoften: 2.5, depthContrast: 1.45, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.12 },
            intensity: { source: 'manual', manual: 0.68 },
            band:      { source: 'manual', manual: 0.30 },
            tiling:    { source: 'manual', manual: 0.55 },
            dim:       { source: 'manual', manual: 0.06 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lit_haze',
        label: 'Haze',
        fx: 'lights',
        // Warm sodium fog bleeding out of every practical light. Feather runs
        // wide so the haze has soft matter to scatter from.
        params: {
            mode: 2, palette: 6, fill: '#04060c', tint: '#ffbe6a', accent: '#1a0d02',
            threshold: 0.38, spread: 0.62, transparent: false,
            hueFocus: false, hueColor: '#3399ff', hueTol: 0.35,
            glow: 0.24, parallax: 0.022,
            depthSoften: 4.0, depthContrast: 1.15, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'audio', band: 'bass', gain: 1.6, floor: 0.14, smooth: 0.36 },
            intensity: { source: 'manual', manual: 0.72 },
            band:      { source: 'manual', manual: 0.46 },
            tiling:    { source: 'manual', manual: 0.40 },
            dim:       { source: 'manual', manual: 0.10 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lit_rain',
        label: 'Light Rain',
        fx: 'lights',
        // Lit matter drips downward in dashed teal columns. Progress drives the
        // fall speed, so on audio the rain surges with the track.
        params: {
            mode: 3, palette: 4, fill: '#000000', tint: '#8ff0ff', accent: '#02101f',
            threshold: 0.44, spread: 0.55, transparent: false,
            hueFocus: false, hueColor: '#3399ff', hueTol: 0.35,
            glow: 0.16, parallax: 0.020,
            depthSoften: 3.0, depthContrast: 1.30, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'audio', band: 'bass', gain: 1.6, floor: 0.18, smooth: 0.28 },
            intensity: { source: 'manual', manual: 0.75 },
            band:      { source: 'manual', manual: 0.20 },
            tiling:    { source: 'manual', manual: 0.52 },
            dim:       { source: 'manual', manual: 0.04 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lit_cathedral',
        label: 'Cathedral',
        fx: 'lights',
        // God rays from a pointer-placed origin — move the mouse (or a hand, via
        // tracking) and the shafts sweep across the room.
        params: {
            mode: 4, palette: 1, fill: '#000000', tint: '#fff3d0', accent: '#241a06',
            threshold: 0.50, spread: 0.70, transparent: false,
            hueFocus: false, hueColor: '#3399ff', hueTol: 0.35,
            glow: 0.22, parallax: 0.030,
            depthSoften: 3.0, depthContrast: 1.35, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'sine', rate: 0.10 },
            intensity: { source: 'manual', manual: 0.66 },
            band:      { source: 'manual', manual: 0.18 },
            tiling:    { source: 'manual', manual: 0.45 },
            dim:       { source: 'manual', manual: 0.08 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lit_dust',
        label: 'Dust',
        fx: 'lights',
        // Cold quantized motes drifting through an almost-empty void. The
        // sparsest look — a lot of black with a slow shimmer in it.
        params: {
            mode: 5, palette: 0, fill: '#01030a', tint: '#dff2ff', accent: '#050a16',
            threshold: 0.46, spread: 0.38, transparent: false,
            hueFocus: false, hueColor: '#3399ff', hueTol: 0.35,
            glow: 0.10, parallax: 0.014,
            depthSoften: 3.0, depthContrast: 1.20, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ramp', rate: 0.08 },
            intensity: { source: 'manual', manual: 0.70 },
            band:      { source: 'manual', manual: 0.26 },
            tiling:    { source: 'manual', manual: 0.38 },
            dim:       { source: 'manual', manual: 0.05 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lit_rim',
        label: 'Rim',
        fx: 'lights',
        // Only the light BOUNDARY survives — an exact N-pixel magenta iso-line
        // over the void. Strobes hard on a hard-cut track.
        params: {
            mode: 6, palette: 1, fill: '#000000', tint: '#ff4bd8', accent: '#12001a',
            threshold: 0.44, spread: 0.28, transparent: false,
            hueFocus: false, hueColor: '#3399ff', hueTol: 0.35,
            glow: 0.06, parallax: 0.016,
            depthSoften: 4.0, depthContrast: 1.40, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.18 },
            intensity: { source: 'manual', manual: 0.85 },
            band:      { source: 'manual', manual: 0.14 },
            tiling:    { source: 'manual', manual: 0.45 },
            dim:       { source: 'manual', manual: 0.00 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lit_ignite',
        label: 'Ignite',
        fx: 'lights',
        // The threshold itself sweeps, so the frame lights up in strict
        // brightness order. Quantize `progress` to a bar on the beat clock and
        // the whole room ignites on the drop.
        params: {
            mode: 7, palette: 3, fill: '#000000', tint: '#fff0d8', accent: '#2a0503',
            threshold: 0.40, spread: 0.45, transparent: false,
            hueFocus: false, hueColor: '#3399ff', hueTol: 0.35,
            glow: 0.26, parallax: 0.024, shake: 0.14,
            depthSoften: 2.5, depthContrast: 1.35, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'audio', band: 'bass', gain: 1.7, floor: 0.10, smooth: 0.22 },
            intensity: { source: 'manual', manual: 0.80 },
            band:      { source: 'audio', band: 'treble', gain: 1.2, floor: 0.12, smooth: 0.40 },
            tiling:    { source: 'manual', manual: 0.45 },
            dim:       { source: 'manual', manual: 0.00 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lit_laser',
        label: 'Laser',
        fx: 'lights',
        // Hue Focus narrowed onto red: only the lasers survive, everything else
        // — including bright white light — is cut. Eyedrop the focus colour off
        // the actual rig for a tighter key.
        params: {
            mode: 2, palette: 1, fill: '#000000', tint: '#ff2a2a', accent: '#1a0000',
            threshold: 0.22, spread: 0.50, transparent: false,
            hueFocus: true, hueColor: '#ff1a1a', hueTol: 0.30,
            glow: 0.30, parallax: 0.018,
            depthSoften: 2.0, depthContrast: 1.10, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'audio', band: 'mid', gain: 1.6, floor: 0.12, smooth: 0.30 },
            intensity: { source: 'manual', manual: 0.90 },
            band:      { source: 'manual', manual: 0.30 },
            tiling:    { source: 'manual', manual: 0.45 },
            dim:       { source: 'manual', manual: 0.00 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'lit_blueprint',
        label: 'Blueprint',
        fx: 'lights',
        // The mirror of Laser: only the blue wash survives, banded into an ice
        // ramp. Threshold sits low because a cool wash is rarely hot.
        params: {
            mode: 1, palette: 4, fill: '#01040e', tint: '#c8f2ff', accent: '#020a1c',
            threshold: 0.20, spread: 0.42, transparent: false,
            hueFocus: true, hueColor: '#2f7bff', hueTol: 0.34,
            glow: 0.18, parallax: 0.020,
            depthSoften: 3.0, depthContrast: 1.25, depthInvert: false, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.11 },
            intensity: { source: 'manual', manual: 0.72 },
            band:      { source: 'manual', manual: 0.28 },
            tiling:    { source: 'manual', manual: 0.50 },
            dim:       { source: 'manual', manual: 0.04 },
        },
        depth: { source: 'luminance', subject: false },
    },

    // ══ LIGHTSHOW ════════════════════════════════════════════════════════════
    // Three readings of ONE idea: the media's luminance relief IS the thing being
    // lit. Nothing is placed in screen space. The channels mean:
    //   progress  Depth Sweep  - slides the reading through the relief
    //   intensity Exposure
    //   band      Edge Width   - contour stroke / key feather
    //   tiling    Band Count   - quantization steps
    //   dim       Bloom
    //
    // The DMX pattern runs with DEPTH as its axis, so Chase is a light travelling
    // through the relief and Ring Pulse is concentric depth shells - the motion
    // comes from the field itself, never from a fixture moving across the frame.
    {
        key: 'ls_ignition',
        label: 'Depth Ignition',
        fx: 'lightshow',
        // Luminance quantized to hard lava steps. The BAND BOUNDARIES are the
        // image: on a detailed plate they shred into hair-like radiating
        // filaments, and the RGB fringe gives each one the magenta/green rim the
        // reference carries. Blowout is high so the hot core clips to white and
        // reads as burning rather than merely bright.
        params: {
            mode: 0, showMode: 4, palette: 1, tint: '#ffd23a', accent: '#050210',
            threshold: 0.42, blowout: 0.80, fringe: 0.55, keepMedia: 0.04,
            showAmount: 1.0, showSpread: 2.2, showSpeed: 0.90, strobeHz: 8, beatSync: false,
            hueSpeed: 0.06, sensitivity: 0.60, release: 0.14,
            glow: 0.30, parallax: 0.022, depthSoften: 2.5, depthContrast: 1.45, subject: 0.70,
        },
        channels: {
            // Audio on the sweep so the ramp SURGES up through the relief on the
            // kick - the single thing that makes this read as ignition rather
            // than as a false-colour filter.
            progress:  { source: 'audio', band: 'bass', gain: 1.6, floor: 0.12, smooth: 0.30 },
            intensity: { source: 'audio', band: 'vol', gain: 1.4, floor: 0.46 },
            band:      { source: 'manual', manual: 0.22 },
            // High band count is what produces the filaments; drop it toward 0.2
            // and the same preset becomes flat poster bands.
            tiling:    { source: 'manual', manual: 0.62 },
            dim:       { source: 'manual', manual: 0.20 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'ls_contour',
        label: 'Depth Contour',
        fx: 'lightshow',
        // A topographic map of the footage drawn in light: thin constant-width
        // iso-lines over pure black, bunching where the relief is steep, with the
        // hot plateau above the threshold filled in magenta. Fringe runs high
        // because the channel separation is what gives every line its red edge
        // and green edge - without it this is just a wireframe.
        params: {
            mode: 1, showMode: 12, palette: 5, tint: '#ff4bd8', accent: '#06000c',
            threshold: 0.52, blowout: 0.35, fringe: 0.62, keepMedia: 0.02,
            showAmount: 1.0, showSpread: 2.6, showSpeed: 0.55, strobeHz: 6, beatSync: false,
            hueSpeed: 0.04, sensitivity: 0.55, release: 0.26,
            glow: 0.16, parallax: 0.026, depthSoften: 3.5, depthContrast: 1.30, subject: 0.70,
        },
        channels: {
            // Slow and free-running: the Ring Pulse is already racing shells out
            // through the depth, so the sweep only has to decide which part of
            // the relief is currently plateau.
            progress:  { source: 'auto', shape: 'ease', rate: 0.10 },
            intensity: { source: 'manual', manual: 0.66 },
            // Thin lines. Above ~0.35 they fatten into bands and stop reading as
            // a contour map.
            band:      { source: 'manual', manual: 0.16 },
            tiling:    { source: 'manual', manual: 0.55 },
            dim:       { source: 'manual', manual: 0.05 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'ls_bloom',
        label: 'Depth Bloom',
        fx: 'lightshow',
        // The soft end of the set: shadows tinted cold teal, highlights blown to
        // pink-white with a wide scatter bloom pouring off them. Custom palette
        // on purpose - it is the only one that lets the two ends be picked
        // independently, and this look lives entirely in that contrast.
        //
        // The one preset that keeps the plate clearly visible underneath, so the
        // footage still reads as footage with light in it.
        params: {
            mode: 2, showMode: 1, palette: 0, tint: '#ffdfe8', accent: '#0d3a45',
            threshold: 0.46, blowout: 0.60, fringe: 0.30, keepMedia: 0.55,
            showAmount: 1.0, showSpread: 3.0, showSpeed: 0.50, strobeHz: 6, beatSync: false,
            hueSpeed: 0.05, sensitivity: 0.50, release: 0.34,
            glow: 0.22, parallax: 0.020, depthSoften: 4.0, depthContrast: 1.20, subject: 0.70,
        },
        channels: {
            progress:  { source: 'auto', shape: 'ease', rate: 0.12 },
            // Long release plus a high floor: this one BREATHES with the track
            // instead of snapping, which is what separates it from Ignition.
            intensity: { source: 'audio', band: 'vol', gain: 1.4, floor: 0.45, smooth: 0.35 },
            band:      { source: 'manual', manual: 0.34 },
            tiling:    { source: 'manual', manual: 0.30 },
            // The bloom IS the look here - this is the one channel worth riding
            // live on this preset.
            dim:       { source: 'manual', manual: 0.62 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'ls_red_room',
        label: 'Red Room',
        fx: 'lightshow',
        // The simple one: real venue video under a literal red light, not a
        // graded/structured read of the depth field like the three above it.
        // Mode 6 (Color Wash) keeps the WHOLE frame exactly as shot and pulls
        // it toward red by multiplication — the way an actual coloured gel
        // works on a camera, not a false-colour effect — so people, motion and
        // detail all stay legible, just soaked in red. Ported from
        // red-room.mp4: a phone-shot crowd video that is almost entirely red
        // cast, swinging between a dim resting level and much brighter flashes
        // as the room's own lights pulse.
        params: {
            mode: 6, showMode: 2, palette: 0, tint: '#ff3324', accent: '#1a0202',
            threshold: 0.45, blowout: 0.88, fringe: 0.10, keepMedia: 0.06,
            showAmount: 1.0, showSpread: 3.0, showSpeed: 0.70, strobeHz: 8, beatSync: false,
            hueSpeed: 0.0, sensitivity: 0.58, release: 0.26,
            glow: 0.20, parallax: 0.018, depthSoften: 3.0, depthContrast: 1.00, subject: 0.70,
            // A little handheld throw - the reference is a phone in a crowd,
            // not a locked-off shot.
            shake: 0.12,
        },
        channels: {
            // Inert for Color Wash (no relief to sweep through) - left on a
            // slow auto so it's harmless if the performer switches Mode later
            // without also picking a new Control source.
            progress:  { source: 'auto', shape: 'ease', rate: 0.14 },
            // TWO audio paths layered on purpose, the way a real rig runs a
            // master dimmer AND a kick trigger at once: Exposure rides the
            // overall mix for a slow dim<->bright breathing "the room got
            // brighter", while Kick Bump's own beat envelope (below, via
            // showMode 2) punches sharp individual flashes on top of that -
            // together they read as "dimmed, flash AND blink" rather than one
            // flat pulse.
            intensity: { source: 'audio', band: 'vol', gain: 1.2, floor: 0.30, smooth: 0.25 },
            // Edge Width doubles as presence weight in this mode - how much
            // darker the background sits than whatever is nearest camera.
            // Moderate on purpose; push it and the natural read turns into a
            // vignette effect.
            band:      { source: 'manual', manual: 0.35 },
            tiling:    { source: 'manual', manual: 0.50 },
            dim:       { source: 'manual', manual: 0.15 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'ls_flash',
        label: 'Flash',
        fx: 'lightshow',
        // Same base as Red Room (mode 6, Color Wash — the natural, unstructured
        // reading) but a different reference and a different animal: ported from
        // flash.mp4, measured frame-by-frame (ffmpeg signalstats) rather than
        // eyeballed. That measurement is what this preset actually is —
        // baseline luma sits ~60-70 for a long stretch (dim, natural, warm
        // street-lit colour, NOT tinted), then bursts to 110-155 for 4-10
        // frames (a real camera-flash blowout toward white) before dropping
        // straight back. Two frame ranges (118-134 and 260-330) had smaller
        // jumps from cuts/colour-grade changes, not flashes — the 350-372
        // region is the real thing and is what these numbers are tuned to.
        //
        // Where Red Room is ALWAYS the washed term (keepMedia ~0, one signal,
        // breathing smoothly), Flash is two signals stacked: a constant dim
        // ambient layer (keepMedia, raised well above Red Room's) that never
        // goes away, plus a near-white Strobe-gated burst on top that only
        // shows up while the gate is open. That second layer is what a real
        // flash IS — a transient that overwhelms the ambient exposure rather
        // than replacing it — and it is why the tint is near-white rather than
        // coloured: a coloured tint would never blow all the way out to the
        // genuine white the reference shows.
        params: {
            mode: 6, showMode: 3, palette: 0, tint: '#fff2dd', accent: '#050505',
            threshold: 0.45, blowout: 0.70, fringe: 0.08, keepMedia: 0.42,
            showAmount: 1.0, showSpread: 3.0, showSpeed: 0.70,
            // The gate rate itself — how often a burst CAN start. Moderate on
            // purpose: the reference's bursts run several consecutive frames
            // long, which a fast strobe would chop into a buzz instead of a pop.
            strobeHz: 5.5, beatSync: false,
            hueSpeed: 0.0,
            // Snappier than Red Room's release — a flash reads as a crisp pop,
            // not a lingering glow, so the envelope has to fall fast between
            // bursts or the "dim" baseline never actually reads as dim.
            sensitivity: 0.55, release: 0.13,
            glow: 0.26, parallax: 0.016, depthSoften: 3.0, depthContrast: 1.00, subject: 0.70,
            shake: 0.16,
        },
        channels: {
            // Inert for Color Wash, same reasoning as Red Room.
            progress:  { source: 'auto', shape: 'ease', rate: 0.14 },
            // `beat` (a decaying per-onset envelope), not `vol` — Red Room rides
            // the overall mix for a slow breathing brighter/dimmer; this instead
            // wants a sharp, near-zero-at-rest pop exactly on each hit, which is
            // what stacks with the Strobe gate's own envelope term to produce a
            // hard flash on the beat instead of a continuous flicker.
            intensity: { source: 'audio', band: 'beat', gain: 1.3, floor: 0.30, smooth: 0.10 },
            band:      { source: 'manual', manual: 0.30 },
            tiling:    { source: 'manual', manual: 0.50 },
            dim:       { source: 'manual', manual: 0.15 },
        },
        depth: { source: 'luminance', subject: false },
    },

    // ── Beam Bloom ───────────────────────────────────────────────────────────
    {
        key: 'soft_halo',
        label: 'Soft Halo',
        fx: 'beam',
        params: { origin: 0, colorMode: 0, tint: '#ffd9a0', spread: 0.85, warmth: 0.45, occlude: 0.60, glow: 0.12, parallax: 0.018, depthSoften: 3.0, depthContrast: 1.20, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'auto', shape: 'sine', rate: 0.06 },
            intensity: { source: 'manual', manual: 0.55 },
            band:      { source: 'manual', manual: 0.50 },
            tiling:    { source: 'manual', manual: 0.72 },
            dim:       { source: 'manual', manual: 0.90 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'hard_rays',
        label: 'Hard Rays',
        fx: 'beam',
        params: { origin: 1, colorMode: 0, tint: '#ffffff', spread: 1.35, warmth: 0.20, occlude: 0.85, glow: 0.05, parallax: 0.022, depthSoften: 2.5, depthContrast: 1.35, depthInvert: false, subject: 0.70 },
        channels: {
            // Beams SWELL on the kick rather than tracking loudness — the
            // Neon Spores note about filters on the way in, done with a
            // channel envelope instead of a filter chain.
            progress:  { source: 'manual', manual: 0.50 },
            intensity: { source: 'audio', band: 'kick', gain: 1.3, floor: 0.30, smooth: 0.20 },
            band:      { source: 'manual', manual: 0.68 },
            tiling:    { source: 'manual', manual: 0.86 },
            dim:       { source: 'manual', manual: 0.70 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'cold_spear',
        label: 'Cold Spear',
        fx: 'beam',
        params: { origin: 2, colorMode: 2, tint: '#9fd8ff', spread: 1.10, warmth: 0.00, occlude: 0.45, glow: 0.20, parallax: 0.026, depthSoften: 3.5, depthContrast: 1.15, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'auto', shape: 'ramp', rate: 0.10 },
            intensity: { source: 'manual', manual: 0.70 },
            band:      { source: 'audio', band: 'vol', gain: 1.1, floor: 0.35, smooth: 0.30 },
            tiling:    { source: 'manual', manual: 0.78 },
            dim:       { source: 'manual', manual: 0.80 },
        },
        depth: { source: 'luminance', subject: false },
    },

    // ── Pulse Grid ───────────────────────────────────────────────────────────
    {
        key: 'kick_pop',
        label: 'Kick Pop',
        fx: 'pulsegrid',
        params: { mode: 0, origin: 0, tint: '#7dd3ff', flash: 0.45, gap: 0.10, glow: 0.06, parallax: 0.014, depthSoften: 3.0, depthContrast: 1.20, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'audio', band: 'kick', gain: 1.0, smooth: 0.10 },
            intensity: { source: 'manual', manual: 0.55 },
            band:      { source: 'manual', manual: 0.30 },
            tiling:    { source: 'manual', manual: 0.40 },
            dim:       { source: 'manual', manual: 1.00 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'chrome_snap',
        label: 'Chrome Snap',
        fx: 'pulsegrid',
        params: { mode: 3, origin: 1, tint: '#ffffff', flash: 0.85, gap: 0.24, glow: 0.10, parallax: 0.020, depthSoften: 2.0, depthContrast: 1.40, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'audio', band: 'snare', gain: 1.1, smooth: 0.08 },
            intensity: { source: 'manual', manual: 0.80 },
            band:      { source: 'manual', manual: 0.18 },
            tiling:    { source: 'manual', manual: 0.28 },
            dim:       { source: 'manual', manual: 0.85 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'slow_swell',
        label: 'Slow Swell',
        fx: 'pulsegrid',
        params: { mode: 1, origin: 0, tint: '#39ff8a', flash: 0.25, gap: 0.04, glow: 0.14, parallax: 0.010, depthSoften: 4.0, depthContrast: 1.10, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'auto', shape: 'pingpong', rate: 0.12 },
            intensity: { source: 'manual', manual: 0.40 },
            band:      { source: 'manual', manual: 0.52 },
            tiling:    { source: 'manual', manual: 0.55 },
            dim:       { source: 'manual', manual: 1.00 },
        },
        depth: { source: 'luminance', subject: false },
    },

    // ── Tile Storm ───────────────────────────────────────────────────────────
    {
        key: 'ring_out',
        label: 'Ring Out',
        fx: 'tilestorm',
        params: { layout: 0, tint: '#c98bff', twist: 1.5, edge: 0.25, glow: 0.06, parallax: 0.012, depthSoften: 3.0, depthContrast: 1.20, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'audio', band: 'kick', gain: 1.0, smooth: 0.12 },
            intensity: { source: 'auto', shape: 'ramp', rate: 0.04 },
            band:      { source: 'manual', manual: 0.20 },
            tiling:    { source: 'manual', manual: 0.45 },
            dim:       { source: 'manual', manual: 1.00 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'spin_up',
        label: 'Spin Up',
        fx: 'tilestorm',
        params: { layout: 1, tint: '#ffb020', twist: 2.6, edge: 0.40, glow: 0.10, parallax: 0.016, depthSoften: 2.5, depthContrast: 1.25, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'audio', band: 'beat', gain: 1.2, floor: 0.10, smooth: 0.15 },
            intensity: { source: 'auto', shape: 'ramp', rate: 0.08 },
            band:      { source: 'manual', manual: 0.12 },
            tiling:    { source: 'manual', manual: 0.60 },
            dim:       { source: 'manual', manual: 0.90 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'scatter_hit',
        label: 'Scatter',
        fx: 'tilestorm',
        params: { layout: 2, tint: '#ffffff', twist: 1.5, edge: 0.15, glow: 0.04, parallax: 0.008, depthSoften: 3.0, depthContrast: 1.20, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'audio', band: 'snare', gain: 1.0, smooth: 0.06 },
            intensity: { source: 'manual', manual: 0.50 },
            band:      { source: 'manual', manual: 0.30 },
            tiling:    { source: 'manual', manual: 0.35 },
            dim:       { source: 'manual', manual: 1.00 },
        },
        depth: { source: 'luminance', subject: false },
    },

    // ── Beat Wash ────────────────────────────────────────────────────────────
    // Two of these reproduce measured reference reels (see Adits/ plan notes):
    // Red Alert is a hot red source behind a neon ring with a teal floor, hits
    // that snap and flicker; Ice Strobe is an azure crystal with a violet floor
    // and a strobe burst about a bar long. Both ship at the deck's default
    // Flicker Rate; the reels ran at 12 Hz, reachable on the slider.
    {
        key: 'red_alert',
        label: 'Red Alert',
        fx: 'beatwash',
        params: { origin: 0, tint: '#ff2200', shadow: '#0a2a26', blowout: 0.70, relief: 0.55, keep: 0.85, emitThr: 0.72, glow: 0.14, parallax: 0.016, depthSoften: 3.0, depthContrast: 1.25, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'audio', band: 'kick', gain: 1.0, smooth: 0.0, feel: 'flicker' },
            intensity: { source: 'manual', manual: 0.70 },
            band:      { source: 'manual', manual: 0.70 },
            tiling:    { source: 'manual', manual: 0.60 },
            dim:       { source: 'manual', manual: 0.05 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'ice_strobe',
        label: 'Ice Strobe',
        fx: 'beatwash',
        params: { origin: 2, tint: '#6a9cff', shadow: '#1a1040', blowout: 0.85, relief: 0.45, keep: 0.90, emitThr: 0.70, glow: 0.20, parallax: 0.014, depthSoften: 3.0, depthContrast: 1.15, depthInvert: false, subject: 0.70 },
        channels: {
            progress:  { source: 'audio', band: 'kick', gain: 1.0, smooth: 0.0, feel: 'burst' },
            intensity: { source: 'manual', manual: 0.75 },
            band:      { source: 'manual', manual: 0.90 },
            tiling:    { source: 'manual', manual: 0.30 },
            dim:       { source: 'manual', manual: 0.25 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'ember_swell',
        label: 'Ember Swell',
        fx: 'beatwash',
        params: { origin: 0, tint: '#ffb020', shadow: '#1c0a12', blowout: 0.45, relief: 0.60, keep: 0.70, emitThr: 0.75, glow: 0.10, parallax: 0.012, depthSoften: 3.5, depthContrast: 1.20, depthInvert: false, subject: 0.70 },
        channels: {
            // The between-hit breath of the reels: level follows loudness but is
            // swelled so it cannot chatter.
            progress:  { source: 'audio', band: 'vol', gain: 1.4, smooth: 0.0, feel: 'swell' },
            intensity: { source: 'manual', manual: 0.55 },
            band:      { source: 'manual', manual: 0.80 },
            tiling:    { source: 'manual', manual: 0.00 },
            dim:       { source: 'manual', manual: 0.15 },
        },
        depth: { source: 'luminance', subject: false },
    },
    {
        key: 'cold_pool',
        label: 'Cold Pool',
        fx: 'beatwash',
        params: { origin: 3, tint: '#cfe4ff', shadow: '#0b0b2a', blowout: 0.50, relief: 0.35, keep: 0.60, emitThr: 0.80, glow: 0.06, parallax: 0.008, depthSoften: 3.0, depthContrast: 1.10, depthInvert: false, subject: 0.70 },
        channels: {
            // A followspot: constant light, the pool follows the mouse.
            progress:  { source: 'manual', manual: 0.80 },
            intensity: { source: 'manual', manual: 0.65 },
            band:      { source: 'manual', manual: 0.25 },
            tiling:    { source: 'manual', manual: 0.00 },
            dim:       { source: 'manual', manual: 0.30 },
        },
        depth: { source: 'luminance', subject: false },
    }
];

export const getPreset = (key) => VJ_PRESETS.find((p) => p.key === key) || VJ_PRESETS[0];
