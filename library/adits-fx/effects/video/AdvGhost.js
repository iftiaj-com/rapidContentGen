import { BaseEffect } from '../../shared/BaseEffect.js';

export class AdvGhost extends BaseEffect {
    constructor() {
        super('Advanced Ghost Trails');
        this.ghostBuffer = [];
        this.MAX_GHOST_BUFFER = 90;
    }

    render(ctx, videoEngine, activeMedia, crop, audioFeatures) {
        const { targetW: dw, targetH: dh } = videoEngine;
        
        // Read custom UI parameters
        const lagStr = document.getElementById('advGhostLag')?.value || '10';
        const alphaStr = document.getElementById('advGhostAlpha')?.value || '0.5';

        const baseLag = parseInt(lagStr);
        // Audio reactivity: increase lag dynamically on bass hits, ensuring minimum lag
        const dynamicLag = Math.min(this.MAX_GHOST_BUFFER - 1, Math.floor(baseLag + audioFeatures.bass * 20));
        
        const baseAlpha = parseFloat(alphaStr);
        const dynamicAlpha = Math.min(1.0, baseAlpha + audioFeatures.treble * 0.3);

        // Reuse an existing canvas from the end of the buffer if we're at capacity,
        // otherwise create a new one. This prevents massive GC pressure and memory leaks.
        let frameCanvas;
        if (this.ghostBuffer.length >= this.MAX_GHOST_BUFFER) {
            frameCanvas = this.ghostBuffer.shift();
            if (frameCanvas.width !== dw || frameCanvas.height !== dh) {
                frameCanvas.width = dw;
                frameCanvas.height = dh;
            }
        } else {
            frameCanvas = document.createElement('canvas');
            frameCanvas.width = dw; 
            frameCanvas.height = dh;
        }

        const fCtx = frameCanvas.getContext('2d');
        fCtx.drawImage(activeMedia, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);

        this.ghostBuffer.push(frameCanvas);

        ctx.clearRect(0, 0, dw, dh);
        ctx.drawImage(frameCanvas, 0, 0);

        if (this.ghostBuffer.length > dynamicLag) {
            const ghostFrame = this.ghostBuffer[this.ghostBuffer.length - 1 - dynamicLag];
            ctx.save();
            ctx.globalAlpha = dynamicAlpha;
            ctx.globalCompositeOperation = 'screen';
            // Bounce RGB split width based on mid frequencies
            const offset = 8 + audioFeatures.mid * 15;
            ctx.filter = 'sepia(1) hue-rotate(300deg) saturate(5)';
            ctx.drawImage(ghostFrame, -offset, -offset*0.5, dw, dh);
            ctx.filter = 'sepia(1) hue-rotate(150deg) saturate(5)';
            ctx.drawImage(ghostFrame, offset, offset*0.5, dw, dh);
            ctx.restore();
        }
    }
}
