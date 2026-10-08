export class BaseEffect {
    constructor(name) {
        this.name = name;
        this.enabled = true;
        this.params = {}; 
        this.isGPU = false;
        this.pipelineReady = false;
    }

    // Called once when the app starts
    init(canvas, ctx, audioEngine) { }

    // High-performance logic (60fps)
    update(time, audioFeatures) { }

    // Visual output to the canvas
    render(ctx, videoEngine, activeMedia, crop, audioFeatures) { }

    // GPU pipeline setup
    async initGPU(videoEngine) { }

    // GPU Visual output
    renderGPU(videoEngine, activeMedia, crop, audioFeatures) { }

    // ── Shared Color Mode Helper Utilities ───────────────────
    rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0; // achromatic
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h, s, v];
    }

    hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        return [r * 255, g * 255, b * 255];
    }

    smoothstep(edge0, edge1, x) {
        const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    getThermal(t) {
        t = Math.min(1.0, Math.max(0.0, t));
        const c1 = [0.0, 0.0, 0.2];
        const c2 = [0.0, 0.3, 1.0];
        const c3 = [0.8, 0.0, 0.8];
        const c4 = [1.0, 0.1, 0.0];
        const c5 = [1.0, 0.9, 0.2];

        const val = t * 4.0;
        const phase = Math.floor(val);
        const f = val - phase;

        const mix = (colorA, colorB, ratio) => [
            colorA[0] * (1 - ratio) + colorB[0] * ratio,
            colorA[1] * (1 - ratio) + colorB[1] * ratio,
            colorA[2] * (1 - ratio) + colorB[2] * ratio
        ];

        let result;
        if (phase < 1) { result = mix(c1, c2, f); }
        else if (phase < 2) { result = mix(c2, c3, f); }
        else if (phase < 3) { result = mix(c3, c4, f); }
        else { result = mix(c4, c5, f); }
        
        return [result[0] * 255, result[1] * 255, result[2] * 255];
    }

    getCosmicColor(t, shift, mode) {
        const shiftedT = (t + shift) % 1.0;
        const val = shiftedT * 5.0;
        const phase = Math.floor(val);
        const f = this.smoothstep(0.0, 1.0, val - phase);

        let c0, c1, c2, c3, c4, c5;

        if (mode === 'cosmic_vibrant') {
            c0 = [0.0, 0.0, 0.3];
            c1 = [0.2, 0.0, 0.8];
            c2 = [0.9, 0.0, 0.5];
            c3 = [1.0, 0.2, 0.0];
            c4 = [1.0, 0.9, 0.0];
            c5 = [0.0, 1.0, 1.0];
        } else if (mode === 'cosmic_nebula') {
            c0 = [0.0, 0.1, 0.2];
            c1 = [0.0, 0.5, 0.8];
            c2 = [0.8, 0.0, 1.0];
            c3 = [1.0, 0.4, 0.8];
            c4 = [1.0, 0.8, 0.9];
            c5 = [1.0, 1.0, 1.0];
        } else { // cosmic_supernova
            c0 = [0.1, 0.0, 0.0];
            c1 = [0.6, 0.0, 0.2];
            c2 = [1.0, 0.3, 0.0];
            c3 = [1.0, 0.8, 0.0];
            c4 = [1.0, 1.0, 0.5];
            c5 = [1.0, 1.0, 1.0];
        }

        const mix = (colorA, colorB, ratio) => [
            colorA[0] * (1 - ratio) + colorB[0] * ratio,
            colorA[1] * (1 - ratio) + colorB[1] * ratio,
            colorA[2] * (1 - ratio) + colorB[2] * ratio
        ];

        let result;
        if (phase < 1) { result = mix(c0, c1, f); }
        else if (phase < 2) { result = mix(c1, c2, f); }
        else if (phase < 3) { result = mix(c2, c3, f); }
        else if (phase < 4) { result = mix(c3, c4, f); }
        else { result = mix(c4, c5, f); }

        return [result[0] * 255, result[1] * 255, result[2] * 255];
    }

    applyColorMode(r, g, b, colorMode, customColor = '#ff00ff', time = 0, audioPulse = 0) {
        const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        let nr = r, ng = g, nb = b;
        
        if (colorMode === 'rgb') {
            const type = Math.floor(Math.random() * 6);
            if (type === 0) { nr = 255; ng = Math.random() * 255; nb = 0; }
            else if (type === 1) { nr = 255; ng = 0; nb = Math.random() * 255; }
            else if (type === 2) { nr = 0; ng = 255; nb = Math.random() * 255; }
            else if (type === 3) { nr = Math.random() * 255; ng = 255; nb = 0; }
            else if (type === 4) { nr = 0; ng = Math.random() * 255; nb = 255; }
            else { nr = Math.random() * 255; ng = 0; nb = 255; }
        } else if (colorMode === 'bw') {
            const lumaVal = luma * 255;
            nr = lumaVal;
            ng = lumaVal;
            nb = lumaVal;
        } else if (colorMode === 'rainbow') {
            const hsv = this.rgbToHsv(r, g, b);
            const shift = (time * 0.0005) % 1.0;
            const rgbShifted = this.hsvToRgb((hsv[0] + shift) % 1.0, 1.0, 1.0);
            nr = rgbShifted[0];
            ng = rgbShifted[1];
            nb = rgbShifted[2];
        } else if (colorMode === 'threshold') {
            nr = r > 127 ? 255 : 0;
            ng = g > 127 ? 255 : 0;
            nb = b > 127 ? 255 : 0;
        } else if (colorMode === 'chrome') {
            const chromeVal = this.smoothstep(0.2, 0.8, Math.sin(luma * 15.0 + time * 0.001) * 0.5 + 0.5);
            const finalVal = chromeVal * 255;
            nr = finalVal;
            ng = finalVal;
            nb = finalVal;
        } else if (colorMode === 'neon') {
            const mixRatio = Math.min(1.0, Math.max(0.0, luma + Math.sin(audioPulse * 5.0) * 0.5));
            nr = mixRatio * 255;
            ng = (1.0 - mixRatio) * 255;
            nb = 255;
        } else if (colorMode === 'thermal') {
            const thermal = this.getThermal(luma);
            nr = thermal[0];
            ng = thermal[1];
            nb = thermal[2];
        } else if (colorMode === 'cosmic_vibrant' || colorMode === 'cosmic_nebula' || colorMode === 'cosmic_supernova') {
            const shift = (time * 0.0001) % 1.0;
            const cosmic = this.getCosmicColor(luma, shift, colorMode);
            nr = cosmic[0];
            ng = cosmic[1];
            nb = cosmic[2];
        } else if (colorMode === 'custom') {
            const hex = customColor || '#ff00ff';
            nr = parseInt(hex.slice(1, 3), 16);
            ng = parseInt(hex.slice(3, 5), 16);
            nb = parseInt(hex.slice(5, 7), 16);
        } else {
            const boost = 1.3;
            nr = Math.min(255, r * boost);
            ng = Math.min(255, g * boost);
            nb = Math.min(255, b * boost);
        }
        
        return [nr, ng, nb];
    }
}
