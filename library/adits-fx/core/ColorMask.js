/**
 * Global Color Mask (Chroma Key)
 * ─────────────────────────────────────────────────────────────
 * Post-processing pass, sibling to the Global Affected/Isolated Area
 * blocks in main.js, except the region selector is a picked COLOR
 * (distance test) instead of luminance / edges / motion.
 *
 * Modes:
 *   'media'  — classic chroma-key layer swap: the keyed media (Main or
 *              PnP) is cut transparent at the matched color, revealing
 *              the OTHER media layer underneath (or a solid color if
 *              no second layer is loaded).
 *   'effect' — confines the current effect output to the matched-color
 *              region, showing the keyed layer's raw media elsewhere.
 *   'color'  — confines the current effect output to the matched-color
 *              region, over a solid background fill elsewhere.
 *
 * All three modes reduce to one operation: `mix(A, B, t)`, where `t` is
 * how strongly a pixel of the "keyed" media matches the picked color:
 *   'media'  → A = keyed media,        B = other media (or bg color)
 *   'effect' → A = keyed media,        B = current effect output
 *   'color'  → A = bg color,           B = current effect output
 *
 * GPU path (WebGPU, preferred): a single fragment-shader pass samples
 * the keyed-media texture to compute the match factor and the "B"
 * texture (other media / effect output) to blend, writing straight to
 * the shared WebGPU canvas that VideoEngine's other GPU passes already
 * use (see applyFisheye / applyGlobalVisuals in video-engine.js) — the
 * result is blitted back with a single drawImage(), never a pixel
 * readback. This is the fast path and should be used whenever
 * `videoEngine.gpuDevice` is available.
 *
 * CPU fallback (Canvas2D, no WebGPU): the color-distance test runs on a
 * small resolution-capped analysis canvas (mirrors MaskManager's Active
 * Tracking analysis canvas) rather than a full-resolution pixel loop,
 * and is only rebuilt every other frame (the 1-frame-stale mask is
 * imperceptible given the feathered edge) to cut the getImageData/
 * putImageData cost in half. The resulting alpha mask is upscaled
 * (bilinear) onto a full-res mask canvas and composited with the same
 * destination-out/destination-in technique MaskManager already uses.
 */
export class ColorMask {
    constructor() {
        // ── GPU (WebGPU) state ──────────────────────────────────────
        this._gpuW = 0;
        this._gpuH = 0;
        this._pipeline = null;
        this._pipelinePending = false;
        this._pipelineDevice = null;   // device the pipeline was built for (device-loss guard)
        this._sampler = null;
        this._uniformBuffer = null;
        this._texKey = null;
        this._texB = null;
        this._bindGroup = null;
        // Small 2D scratch canvases used only to pre-crop/scale a media element
        // before uploading it to a GPU texture — copyExternalImageToTexture has
        // no crop/scale parameters, so this cheap GPU-composited draw (NOT a
        // readback) does the crop that drawImage's 9-arg form would otherwise do.
        this._srcKeyCanvas = document.createElement('canvas');
        this._srcKeyCtx = this._srcKeyCanvas.getContext('2d');
        this._srcBCanvas = document.createElement('canvas');
        this._srcBCtx = this._srcBCanvas.getContext('2d');

        // ── CPU fallback state (browsers without WebGPU) ─────────────
        this.ANA_MAX = 240; // analysis width cap — kept small since it's a per-frame readback
        this._cpuFrameCount = 0;
        this._anaCanvas = document.createElement('canvas');
        this._anaCtx = this._anaCanvas.getContext('2d', { willReadFrequently: true });
        this._maskCanvas = document.createElement('canvas');
        this._maskCtx = this._maskCanvas.getContext('2d');
        this._keyCanvas = document.createElement('canvas');
        this._keyCtx = this._keyCanvas.getContext('2d');
    }

    _hexToRgb(hex) {
        const v = parseInt((hex || '#00ff00').replace('#', ''), 16);
        return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }

    /**
     * @param {object} dom - App's cached DOM dictionary (reads colorMask* controls)
     * @param {object} videoEngine
     * @param {CanvasRenderingContext2D} targetCtx
     * @param {HTMLVideoElement|HTMLImageElement} drawMedia - Main media (raw, pre-effect)
     * @param {{sx:number,sy:number,sw:number,sh:number}} crop
     * @param {HTMLVideoElement|HTMLImageElement|null} pnpMedia
     * @param {{sx:number,sy:number,sw:number,sh:number}|null} pnpCrop
     * @param {boolean} hasPnpMedia
     */
    apply(dom, videoEngine, targetCtx, drawMedia, crop, pnpMedia, pnpCrop, hasPnpMedia) {
        const mode = dom.colorMaskMode?.value || 'off';
        if (mode === 'off' || !drawMedia || !crop) return;

        const keyTarget = dom.colorMaskKeyTarget?.value || 'main';
        const tolerance = parseInt(dom.colorMaskTolerance?.value ?? 35) / 100;
        const feather = parseInt(dom.colorMaskFeather?.value ?? 20) / 100;
        const invert = !!dom.colorMaskInvert?.checked;
        const keyRgb = this._hexToRgb(dom.colorMaskColor?.value);
        const bgRgb = this._hexToRgb(dom.colorMaskBgColor?.value || '#000000');

        const w = videoEngine.targetW;
        const h = videoEngine.targetH;

        // Resolve which raw media layer is being color-tested ("keyed").
        // Falls back to Main whenever PnP isn't actually loaded.
        const useMainAsKey = keyTarget !== 'pnp' || !hasPnpMedia;
        const keyedMedia = useMainAsKey ? drawMedia : pnpMedia;
        const keyedCrop = useMainAsKey ? crop : pnpCrop;
        const otherMedia = useMainAsKey ? (hasPnpMedia ? pnpMedia : null) : drawMedia;
        const otherCrop = useMainAsKey ? pnpCrop : crop;

        if (videoEngine.gpuDevice) {
            // The pipeline compiles asynchronously; until it resolves the frame is
            // left unkeyed for a frame or two rather than stalling the render loop.
            if (!this._ensurePipeline(videoEngine)) return;
            this._applyGPU(videoEngine, targetCtx, mode, keyedMedia, keyedCrop, otherMedia, otherCrop, keyRgb, bgRgb, tolerance, feather, invert, w, h);
        } else {
            this._applyCPU(videoEngine, targetCtx, mode, keyedMedia, keyedCrop, otherMedia, otherCrop, keyRgb, bgRgb, tolerance, feather, invert, w, h);
        }
    }

    // ════════════════════════════════════════════════════════════
    //  GPU PATH — single fragment-shader pass, zero pixel readback
    // ════════════════════════════════════════════════════════════

    /** Kick the async pipeline build once per device; true when the pipeline is usable. */
    _ensurePipeline(videoEngine) {
        const device = videoEngine.gpuDevice;
        if (this._pipeline && this._pipelineDevice === device) return true;
        if (this._pipelineDevice !== device) {
            // New (or first) device: previous resources belong to a dead device.
            this._pipeline = null; this._bindGroup = null; this._sampler = null; this._uniformBuffer = null;
            this._texKey = null; this._texB = null; this._gpuW = 0; this._gpuH = 0;
            this._pipelinePending = false;
            this._pipelineDevice = device;
        }
        if (!this._pipelinePending) {
            this._pipelinePending = true;
            {
            const shader = `
                struct Params {
                    keyColorTol: vec4<f32>,        // xyz = key color (0-1), w = tolerance (0-1)
                    featherInvertFlags: vec4<f32>, // x = feather (0-1), y = invert, z = aIsSolid, w = bIsSolid
                    bgColor: vec4<f32>,             // xyz = background color (0-1)
                };
                @group(0) @binding(0) var mySampler: sampler;
                @group(0) @binding(1) var texKey: texture_2d<f32>;
                @group(0) @binding(2) var texB: texture_2d<f32>;
                @group(0) @binding(3) var<uniform> params: Params;

                struct VertexOutput {
                    @builtin(position) position: vec4<f32>,
                    @location(0) uv: vec2<f32>
                };

                @vertex
                fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
                    let x = f32(i32(vi) == 1) * 4.0 - 1.0;
                    let y = f32(i32(vi) == 2) * 4.0 - 1.0;
                    var out: VertexOutput;
                    out.position = vec4<f32>(x, y, 0.0, 1.0);
                    out.uv = vec2<f32>(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
                    return out;
                }

                @fragment
                fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
                    let keyColor = params.keyColorTol.rgb;
                    let tolerance = params.keyColorTol.a;
                    let feather  = params.featherInvertFlags.x;
                    let invert   = params.featherInvertFlags.y;
                    let aIsSolid = params.featherInvertFlags.z;
                    let bIsSolid = params.featherInvertFlags.w;
                    let bg = params.bgColor.rgb;

                    let keySample = textureSample(texKey, mySampler, in.uv);
                    // Euclidean RGB distance, normalized to 0-1 (max possible = sqrt(3))
                    let dist = distance(keySample.rgb, keyColor) * 0.5773503;

                    let edge = max(0.002, feather * 0.5 + 0.002);
                    var t = 1.0 - smoothstep(tolerance, tolerance + edge, dist);
                    if (invert > 0.5) { t = 1.0 - t; }

                    var aColor = keySample.rgb;
                    if (aIsSolid > 0.5) { aColor = bg; }

                    var bColor = textureSample(texB, mySampler, in.uv).rgb;
                    if (bIsSolid > 0.5) { bColor = bg; }

                    return vec4<f32>(mix(aColor, bColor, t), 1.0);
                }
            `;
            const module = device.createShaderModule({ code: shader });
            this._uniformBuffer = device.createBuffer({
                size: 48, // 3 × vec4<f32>
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            this._sampler = device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge'
            });
            device.createRenderPipelineAsync({
                layout: 'auto',
                vertex: { module, entryPoint: 'vs_main' },
                fragment: {
                    module, entryPoint: 'fs_main',
                    targets: [{ format: videoEngine.gpuFormat }]
                },
                primitive: { topology: 'triangle-list' }
            }).then((pipeline) => {
                if (this._pipelineDevice !== device) return; // device changed meanwhile
                this._pipeline = pipeline;
                this._bindGroup = null;
            }).catch((e) => {
                console.error('ColorMask pipeline failed to build:', e);
            }).finally(() => { this._pipelinePending = false; });
            }
        }
        return !!this._pipeline;
    }

    _ensureGPUResources(videoEngine, w, h) {
        const device = videoEngine.gpuDevice;

        if (this._gpuW !== w || this._gpuH !== h) {
            if (this._texKey) this._texKey.destroy();
            if (this._texB) this._texB.destroy();
            this._texKey = device.createTexture({
                size: [w, h], format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
            });
            this._texB = device.createTexture({
                size: [w, h], format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
            });
            this._texKeyView = this._texKey.createView();
            this._texBView = this._texB.createView();
            this._bindGroup = null;
            this._gpuW = w; this._gpuH = h;
        }

        if (!this._bindGroup) {
            this._bindGroup = device.createBindGroup({
                layout: this._pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this._sampler },
                    { binding: 1, resource: this._texKeyView },
                    { binding: 2, resource: this._texBView },
                    { binding: 3, resource: { buffer: this._uniformBuffer } }
                ]
            });
        }
    }

    _applyGPU(videoEngine, targetCtx, mode, keyedMedia, keyedCrop, otherMedia, otherCrop, keyRgb, bgRgb, tolerance, feather, invert, w, h) {
        const device = videoEngine.gpuDevice;
        this._ensureGPUResources(videoEngine, w, h);

        // Keyed media always needs the crop/letterbox applied before upload.
        if (this._srcKeyCanvas.width !== w || this._srcKeyCanvas.height !== h) {
            this._srcKeyCanvas.width = w; this._srcKeyCanvas.height = h;
        }
        this._srcKeyCtx.drawImage(keyedMedia, keyedCrop.sx, keyedCrop.sy, keyedCrop.sw, keyedCrop.sh, 0, 0, w, h);
        device.queue.copyExternalImageToTexture({ source: this._srcKeyCanvas }, { texture: this._texKey }, [w, h]);

        let aIsSolid = 0;
        let bIsSolid = 0;
        if (mode === 'media') {
            if (otherMedia && otherCrop) {
                if (this._srcBCanvas.width !== w || this._srcBCanvas.height !== h) {
                    this._srcBCanvas.width = w; this._srcBCanvas.height = h;
                }
                this._srcBCtx.drawImage(otherMedia, otherCrop.sx, otherCrop.sy, otherCrop.sw, otherCrop.sh, 0, 0, w, h);
                device.queue.copyExternalImageToTexture({ source: this._srcBCanvas }, { texture: this._texB }, [w, h]);
            } else {
                bIsSolid = 1; // no second layer loaded — fall back to solid background
            }
        } else {
            // 'effect' / 'color' — B is the current composited frame, already full-res
            device.queue.copyExternalImageToTexture({ source: videoEngine.canvas }, { texture: this._texB }, [w, h]);
            if (mode === 'color') aIsSolid = 1;
        }

        device.queue.writeBuffer(this._uniformBuffer, 0, new Float32Array([
            keyRgb[0] / 255, keyRgb[1] / 255, keyRgb[2] / 255, tolerance,
            feather, invert ? 1 : 0, aIsSolid, bIsSolid,
            bgRgb[0] / 255, bgRgb[1] / 255, bgRgb[2] / 255, 0
        ]));

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: videoEngine.gpuContext.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear', storeOp: 'store'
            }]
        });
        passEncoder.setPipeline(this._pipeline);
        passEncoder.setBindGroup(0, this._bindGroup);
        passEncoder.draw(3);
        passEncoder.end();
        device.queue.submit([commandEncoder.finish()]);

        // Blit GPU result back to the main 2D canvas (canvas-to-canvas draw, not a readback)
        targetCtx.clearRect(0, 0, w, h);
        targetCtx.drawImage(videoEngine.gpuCanvas, 0, 0);
    }

    // ════════════════════════════════════════════════════════════
    //  CPU FALLBACK — Canvas2D, no WebGPU available
    // ════════════════════════════════════════════════════════════

    /** Full-res alpha mask canvas: opaque(white) where the pixel matches the key color. */
    _buildMask(mediaEl, crop, w, h, keyRgb, tolerance, feather, invert) {
        const aspect = w / h;
        const aw = Math.max(1, Math.min(this.ANA_MAX, w));
        const ah = Math.max(1, Math.round(aw / aspect));

        if (this._anaCanvas.width !== aw || this._anaCanvas.height !== ah) {
            this._anaCanvas.width = aw;
            this._anaCanvas.height = ah;
        }
        this._anaCtx.clearRect(0, 0, aw, ah);
        this._anaCtx.drawImage(mediaEl, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, aw, ah);

        const imgData = this._anaCtx.getImageData(0, 0, aw, ah);
        const data = imgData.data;
        const [kr, kg, kb] = keyRgb;

        const MAX_DIST = 441.673; // sqrt(255^2 * 3) — max possible RGB distance
        const thresh = tolerance * MAX_DIST;
        const edge = 2 + feather * 120; // soft-edge width in distance units

        for (let i = 0; i < data.length; i += 4) {
            const dr = data[i] - kr;
            const dg = data[i + 1] - kg;
            const db = data[i + 2] - kb;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);

            let t; // 1 = matches key color, 0 = does not
            if (dist <= thresh) t = 1;
            else if (dist >= thresh + edge) t = 0;
            else t = 1 - (dist - thresh) / edge;

            if (invert) t = 1 - t;

            data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
            data[i + 3] = Math.round(t * 255);
        }
        this._anaCtx.putImageData(imgData, 0, 0);

        if (this._maskCanvas.width !== w || this._maskCanvas.height !== h) {
            this._maskCanvas.width = w;
            this._maskCanvas.height = h;
        }
        this._maskCtx.clearRect(0, 0, w, h);
        // Bilinear upscale further softens the analysis-grid edges
        this._maskCtx.drawImage(this._anaCanvas, 0, 0, w, h);
        return this._maskCanvas;
    }

    _applyCPU(videoEngine, targetCtx, mode, keyedMedia, keyedCrop, otherMedia, otherCrop, keyRgb, bgRgb, tolerance, feather, invert, w, h) {
        // Rebuild the color-distance mask only every other frame — a 1-frame-stale
        // mask is imperceptible (feathered edge) and halves the getImageData cost,
        // which is the dominant per-frame expense on this path.
        this._cpuFrameCount++;
        const rebuild = !this._maskReady || this._cpuFrameCount % 2 === 0;
        const mask = rebuild
            ? this._buildMask(keyedMedia, keyedCrop, w, h, keyRgb, tolerance, feather, invert)
            : this._maskCanvas;
        this._maskReady = true;

        if (this._keyCanvas.width !== w || this._keyCanvas.height !== h) {
            this._keyCanvas.width = w;
            this._keyCanvas.height = h;
        }

        const bgColor = `rgb(${bgRgb[0]}, ${bgRgb[1]}, ${bgRgb[2]})`;

        targetCtx.save();
        targetCtx.globalAlpha = 1.0;
        targetCtx.globalCompositeOperation = 'source-over';
        targetCtx.filter = 'none';

        if (mode === 'media') {
            // Cut the keyed media transparent at the matched color.
            this._keyCtx.clearRect(0, 0, w, h);
            this._keyCtx.drawImage(keyedMedia, keyedCrop.sx, keyedCrop.sy, keyedCrop.sw, keyedCrop.sh, 0, 0, w, h);
            this._keyCtx.globalCompositeOperation = 'destination-out';
            this._keyCtx.drawImage(mask, 0, 0);
            this._keyCtx.globalCompositeOperation = 'source-over';

            targetCtx.clearRect(0, 0, w, h);
            if (otherMedia && otherCrop) {
                targetCtx.drawImage(otherMedia, otherCrop.sx, otherCrop.sy, otherCrop.sw, otherCrop.sh, 0, 0, w, h);
            } else {
                targetCtx.fillStyle = bgColor;
                targetCtx.fillRect(0, 0, w, h);
            }
            targetCtx.drawImage(this._keyCanvas, 0, 0);
        } else {
            // 'effect' / 'color' — confine the CURRENT effect output to the
            // matched-color region (mirrors Affected/Isolated Area, keyed by color).
            this._keyCtx.clearRect(0, 0, w, h);
            this._keyCtx.drawImage(videoEngine.canvas, 0, 0);
            this._keyCtx.globalCompositeOperation = 'destination-in';
            this._keyCtx.drawImage(mask, 0, 0);
            this._keyCtx.globalCompositeOperation = 'source-over';

            targetCtx.clearRect(0, 0, w, h);
            if (mode === 'effect') {
                targetCtx.drawImage(keyedMedia, keyedCrop.sx, keyedCrop.sy, keyedCrop.sw, keyedCrop.sh, 0, 0, w, h);
            } else {
                targetCtx.fillStyle = bgColor;
                targetCtx.fillRect(0, 0, w, h);
            }
            targetCtx.drawImage(this._keyCanvas, 0, 0);
        }

        targetCtx.restore();
    }
}
