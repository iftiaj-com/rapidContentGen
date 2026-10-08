import { BaseEffect } from '../../shared/BaseEffect.js';

/**
 * Heat Haze
 * Realistic heat-shimmer distortion: the sample position is offset by a
 * time-animated sine wave (a "heat wave"), optionally masked so the shimmer
 * is confined to a region (rising from the bottom, or to bright/hot areas).
 * A procedural film-grain dither and a subtle chromatic refraction split sell
 * the effect. Re-implements the Codrops heat-haze idea in the Adits WebGPU
 * pipeline (with a Canvas2D strip fallback).
 *
 * Presets recreate the "moods" of the original tutorial demos:
 *   desert_mirage · stove_top · jet_exhaust · underwater · custom
 */

// Per-preset character: base amplitude/speed multipliers, wave frequencies,
// vertical wobble, chromatic refraction, and the default shimmer mask.
// mask: 0 = full frame, 1 = vertical gradient (heat rising), 2 = bright/hot areas
const PRESETS = {
    desert_mirage: { amp: 1.0, speed: 0.5, freqX: 55,  freqY: 0,  ampYRatio: 0.0,  chroma: 0.25, mask: 1 },
    stove_top:     { amp: 0.8, speed: 1.2, freqX: 120, freqY: 0,  ampYRatio: 0.15, chroma: 0.15, mask: 1 },
    jet_exhaust:   { amp: 1.7, speed: 2.1, freqX: 95,  freqY: 70, ampYRatio: 0.5,  chroma: 0.5,  mask: 0 },
    underwater:    { amp: 1.2, speed: 0.55, freqX: 75, freqY: 55, ampYRatio: 0.8,  chroma: 0.2,  mask: 0 },
    custom:        { amp: 1.0, speed: 1.0, freqX: 90,  freqY: 60, ampYRatio: 0.5,  chroma: 0.3,  mask: 0 },
};

// Normalized-UV scale for one unit of amplitude (a few pixels of shimmer).
const AMP_SCALE = 0.014;

export class HeatHaze extends BaseEffect {
    constructor() {
        super('Heat Haze (WebGPU)');
        this.isGPU = true;
        this.pipelineReady = false;
    }

    // Resolve final parameters from DOM + active preset (shared by GPU + CPU paths).
    _resolveParams(audioFeatures) {
        const presetKey = document.getElementById('advHeatHazePreset')?.value || 'desert_mirage';
        const base = PRESETS[presetKey] || PRESETS.desert_mirage;

        const amount = parseFloat(document.getElementById('advHeatHazeAmount')?.value ?? '1.0');
        const speedMul = parseFloat(document.getElementById('advHeatHazeSpeed')?.value ?? '1.0');
        const freqMul = parseFloat(document.getElementById('advHeatHazeFreq')?.value ?? '1.0');
        const grain = parseFloat(document.getElementById('advHeatHazeGrain')?.value ?? '0.08');

        // Mask select overrides the preset's default mask unless left on "auto".
        const maskSel = document.getElementById('advHeatHazeMask')?.value ?? 'auto';
        const mask = maskSel === 'auto' ? base.mask : parseInt(maskSel, 10);

        const audioReact = document.getElementById('advHeatHazeAudio')?.checked;
        const audio = audioReact ? Math.min(1.0, (audioFeatures?.bass || 0)) : 0;

        // Audio swells the shimmer amplitude and speed.
        const ampUnits = base.amp * amount * (1.0 + audio * 1.5);
        const ampX = AMP_SCALE * ampUnits;
        const ampY = AMP_SCALE * ampUnits * base.ampYRatio;

        const speed = base.speed * speedMul * (1.0 + audio * 0.5);
        const freqX = base.freqX * freqMul;
        const freqY = base.freqY * freqMul;

        return { ampX, ampY, freqX, freqY, speed, mask, grain, chroma: base.chroma };
    }

    async initGPU(videoEngine) {
        if (!videoEngine.gpuDevice) return false;
        const device = videoEngine.gpuDevice;
        const format = videoEngine.gpuFormat || navigator.gpu.getPreferredCanvasFormat();

        const shaderBase = `
            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) uv: vec2<f32>
            };

            @vertex
            fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
                var pos = array<vec2<f32>, 6>(
                    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
                    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
                );
                var uv = array<vec2<f32>, 6>(
                    vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
                    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
                );
                var out: VertexOutput;
                out.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
                out.uv = uv[vertexIndex];
                return out;
            }

            struct Uniforms {
                params1: vec4<f32>, // x: ampX, y: ampY, z: freqX, w: freqY
                params2: vec4<f32>, // x: phase, y: maskMode, z: grain, w: chroma
                params3: vec4<f32>, // x: time, yzw: padding
                uvRect:  vec4<f32>  // x: sx, y: sy, z: sw, w: sh (normalized)
            };

            @group(0) @binding(0) var mySampler: sampler;
            @group(0) @binding(2) var<uniform> u: Uniforms;

            fn hash(p: vec2<f32>) -> f32 {
                return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
            }

            fn luma(c: vec3<f32>) -> f32 {
                return dot(c, vec3<f32>(0.299, 0.587, 0.114));
            }

            // Heat-wave UV offset for the current pixel.
            fn hazeOffset(uv: vec2<f32>) -> vec2<f32> {
                let phase  = u.params2.x;
                let dx = sin(uv.y * u.params1.z + phase) * u.params1.x;
                let dy = sin(uv.x * u.params1.w + phase * 0.8) * u.params1.y;
                return vec2<f32>(dx, dy);
            }
        `;

        // Mask + grain need a base color sample, so the per-target shaders supply
        // a sampleSrc() that wraps texture_external vs texture_2d.
        const fsCommon = `
            @fragment
            fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
                let maskMode = u.params2.y;
                let grain    = u.params2.z;
                let chroma   = u.params2.w;

                // Region mask for the shimmer.
                var mask = 1.0;
                if (maskMode == 1.0) {
                    // Heat rising from the ground: strong at bottom (uv.y -> 1), faint at top.
                    mask = mix(0.12, 1.0, pow(in.uv.y, 1.5));
                } else if (maskMode == 2.0) {
                    let baseCol = sampleSrc(in.uv).rgb;
                    mask = smoothstep(0.35, 0.9, luma(baseCol));
                }

                let offset = hazeOffset(in.uv) * mask;

                // Sample with a subtle chromatic refraction split along the offset.
                let cs = chroma * 0.6;
                let rUV = clamp(in.uv + offset * (1.0 + cs), vec2<f32>(0.0), vec2<f32>(1.0));
                let gUV = clamp(in.uv + offset,             vec2<f32>(0.0), vec2<f32>(1.0));
                let bUV = clamp(in.uv + offset * (1.0 - cs), vec2<f32>(0.0), vec2<f32>(1.0));

                var col = vec3<f32>(
                    sampleSrc(rUV).r,
                    sampleSrc(gUV).g,
                    sampleSrc(bUV).b
                );

                // Procedural animated film grain, weighted toward darker pixels.
                if (grain > 0.001) {
                    let n = hash(floor(in.uv * 640.0) + vec2<f32>(u.params3.x * 37.0, u.params3.x * 53.0));
                    let weight = grain * (0.4 + 0.6 * (1.0 - luma(col)));
                    col += (n - 0.5) * weight;
                }

                return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
            }
        `;

        const videoWgsl = shaderBase + `
            @group(0) @binding(1) var myTexture: texture_external;
            fn sampleSrc(uv: vec2<f32>) -> vec4<f32> {
                let c = u.uvRect.xy + uv * u.uvRect.zw;
                return textureSampleBaseClampToEdge(myTexture, mySampler, c);
            }
        ` + fsCommon;

        const imageWgsl = shaderBase + `
            @group(0) @binding(1) var myTexture: texture_2d<f32>;
            fn sampleSrc(uv: vec2<f32>) -> vec4<f32> {
                let c = u.uvRect.xy + uv * u.uvRect.zw;
                return textureSample(myTexture, mySampler, c);
            }
        ` + fsCommon;

        const videoModule = device.createShaderModule({ code: videoWgsl });
        const imageModule = device.createShaderModule({ code: imageWgsl });

        const baseDesc = { layout: 'auto', primitive: { topology: 'triangle-list' } };

        this.videoPipeline = await device.createRenderPipelineAsync({
            ...baseDesc,
            vertex: { module: videoModule, entryPoint: 'vs_main' },
            fragment: { module: videoModule, entryPoint: 'fs_main', targets: [{ format }] }
        });

        this.imagePipeline = await device.createRenderPipelineAsync({
            ...baseDesc,
            vertex: { module: imageModule, entryPoint: 'vs_main' },
            fragment: { module: imageModule, entryPoint: 'fs_main', targets: [{ format }] }
        });

        this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
        this.uniformBuffer = device.createBuffer({
            size: 64, // 4 * vec4<f32>
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.pipelineReady = true;
        return true;
    }

    renderGPU(videoEngine, activeMedia, crop, audioFeatures) {
        if (!this.pipelineReady || !videoEngine.gpuDevice) return;

        const device = videoEngine.gpuDevice;
        const context = videoEngine.gpuContext;

        const p = this._resolveParams(audioFeatures);
        const time = performance.now() * 0.001;
        const phase = time * p.speed * Math.PI;

        const mw = activeMedia.naturalWidth || activeMedia.videoWidth || activeMedia.width || 1;
        const mh = activeMedia.naturalHeight || activeMedia.videoHeight || activeMedia.height || 1;
        const normSx = crop.sx / mw;
        const normSy = crop.sy / mh;
        const normSw = crop.sw / mw;
        const normSh = crop.sh / mh;

        device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([
            p.ampX, p.ampY, p.freqX, p.freqY,
            phase, p.mask, p.grain, p.chroma,
            time, 0.0, 0.0, 0.0,
            normSx, normSy, normSw, normSh
        ]));

        const isImage = activeMedia.tagName === 'IMG' || activeMedia.tagName === 'CANVAS';
        let textureResource;

        if (isImage) {
            const w = activeMedia.naturalWidth || activeMedia.width || videoEngine.targetW;
            const h = activeMedia.naturalHeight || activeMedia.height || videoEngine.targetH;
            if (!w || !h) return false;

            if (!this.imgTexture || this.imgTexture.width !== w || this.imgTexture.height !== h) {
                if (this.imgTexture) this.imgTexture.destroy();
                this.imgTexture = device.createTexture({
                    size: [w, h],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
                });
                this._imgUploadKey = null;
            }

            // Static <img> needs one upload; CANVAS can change per frame (key null).
            const uploadKey = activeMedia.tagName === 'IMG'
                ? (activeMedia.currentSrc || activeMedia.src) + '|' + w + 'x' + h : null;
            if (!uploadKey || this._imgUploadKey !== uploadKey) {
                // Direct GPU upload (getimagedata-audit.md, Cluster A): no drawImage +
                // getImageData round trip through offCtx. The old readback stays as the
                // fallback for sources copyExternalImageToTexture rejects (an <img> not
                // yet decoded, a tainted canvas).
                try {
                    device.queue.copyExternalImageToTexture({ source: activeMedia }, { texture: this.imgTexture }, [w, h]);
                } catch (_e) {
                    videoEngine.offCanvas.width = w;
                    videoEngine.offCanvas.height = h;
                    videoEngine.offCtx.drawImage(activeMedia, 0, 0, w, h);
                    const imgData = videoEngine.offCtx.getImageData(0, 0, w, h);

                    device.queue.writeTexture(
                        { texture: this.imgTexture },
                        imgData.data,
                        { bytesPerRow: w * 4, rowsPerImage: h },
                        { width: w, height: h }
                    );
                }
                this._imgUploadKey = uploadKey;
            }

            textureResource = this.imgTexture.createView();
        } else {
            textureResource = device.importExternalTexture({ source: activeMedia });
        }

        const pipeline = isImage ? this.imagePipeline : this.videoPipeline;
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: textureResource },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });

        const commandEncoder = device.createCommandEncoder();
        const textureView = context.getCurrentTexture().createView();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear', storeOp: 'store'
            }]
        });
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(6);
        passEncoder.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    // Canvas2D fallback (no WebGPU): horizontal-strip shimmer. Each strip is the
    // source row band redrawn with an x/y offset from the same sine heat-wave.
    render(ctx, videoEngine, activeMedia, crop, audioFeatures) {
        const W = videoEngine.targetW;
        const H = videoEngine.targetH;
        const p = this._resolveParams(audioFeatures);
        const time = performance.now() * 0.001;
        const phase = time * p.speed * Math.PI;

        const ampPxX = p.ampX * W;
        const ampPxY = p.ampY * H;

        const strips = 90;
        const sStripH = crop.sh / strips;
        const dStripH = H / strips;

        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < strips; i++) {
            const v = i / (strips - 1); // 0 (top) .. 1 (bottom)
            // Mask: gradient = rising heat; luma not available cheaply here → full.
            const mask = p.mask === 1 ? (0.12 + 0.88 * Math.pow(v, 1.5)) : 1.0;
            const dx = Math.sin(v * p.freqX + phase) * ampPxX * mask;
            const dy = Math.sin(v * p.freqY + phase * 0.8) * ampPxY * mask;
            ctx.drawImage(
                activeMedia,
                crop.sx, crop.sy + i * sStripH, crop.sw, sStripH,
                dx, i * dStripH + dy, W, dStripH + 1
            );
        }
    }
}
