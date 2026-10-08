// rcg vision harness: MediaPipe tasks-vision (copied from Adits, models/mediapipe) run
// offline over extracted frames, one frame at a time, in VIDEO mode with frame-time
// timestamps (Adits uses performance.now and a 15 fps throttle; here every frame is
// inferred and the result does not depend on wall-clock time). Driven by
// tools/track/track.mjs and tools/track/matte.mjs through the fx server.
//
// job.task = 'track': FaceLandmarker + HandLandmarker -> /work/out/track.json
//            (a landmark subset per face, all 21 points per hand), optional debug frames.
// job.task = 'matte': ImageSegmenter (selfie_segmenter) -> /work/out/%06d.png RGBA
//            cut-out frames (the footage with alpha = refined person confidence).

const job = await (await fetch('/work/job.json', { cache: 'no-store' })).json();
window.__vision = { state: 'starting', frame: 0, error: null, log: [], info: {} };
const log = (m) => { window.__vision.log.push(String(m)); if (window.__vision.log.length > 50) window.__vision.log.shift(); };
window.addEventListener('error', (e) => log(`error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => log(`rejection: ${e.reason?.message || e.reason}`));

const pad = (n) => String(n).padStart(6, '0');
const ts = (i) => Math.round((i * 1000) / job.fps) + 1; // strictly increasing, frame time
async function loadImage(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}
async function put(path, body) {
  const r = await fetch(path, { method: 'PUT', body });
  if (!r.ok) throw new Error(`PUT ${path}: ${r.status}`);
}

// Face landmark subset kept per frame (indices into the 478-point mesh). tools/track/track.mjs
// reads them by the same names.
const FACE_POINTS = {
  noseTip: 1, nose: 4, forehead: 10, chin: 152, cheekR: 234, cheekL: 454,
  eyeROuter: 33, eyeRInner: 133, eyeLOuter: 263, eyeLInner: 362,
  irisR: 468, irisL: 473, lipTop: 13, lipBottom: 14, mouthR: 61, mouthL: 291,
  lidRTop: 159, lidRBottom: 145, lidLTop: 386, lidLBottom: 374,
};
const r4 = (v) => Math.round(v * 10000) / 10000;

try {
  const vision = await import('/models/mediapipe/wasm/vision_bundle.mjs');
  const fileset = await vision.FilesetResolver.forVisionTasks('/models/mediapipe/wasm');
  const delegate = job.delegate === 'GPU' ? 'GPU' : 'CPU';
  window.__vision.info.delegate = delegate;
  const W = job.width;
  const H = job.height;

  if (job.task === 'track') {
    const face = job.face === false ? null : await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/models/mediapipe/models/face_landmarker.task', delegate },
      runningMode: 'VIDEO', numFaces: job.numFaces || 1,
      minFaceDetectionConfidence: job.minConfidence ?? 0.5, minFacePresenceConfidence: job.minConfidence ?? 0.5, minTrackingConfidence: job.minConfidence ?? 0.5,
      outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
    });
    // Crop fallback (as Adits' ROI pass, VisionEngine._extractRoi): the landmarker shrinks its
    // input to about 256 px, so a small face in a full-body 9:16 frame is often missed. When the
    // full-frame pass finds none, an IMAGE-mode landmarker looks at square crops: first around
    // the last face found, then tiles over the upper frame. Results are mapped back to the frame.
    const faceCrop = job.face === false || job.roi === false ? null : await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/models/mediapipe/models/face_landmarker.task', delegate },
      runningMode: 'IMAGE', numFaces: 1,
      minFaceDetectionConfidence: job.roiConfidence ?? 0.4, minFacePresenceConfidence: job.roiConfidence ?? 0.4,
      outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
    });
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropCanvas.height = 512;
    const cropCtx = cropCanvas.getContext('2d');
    let lastFace = null; // { cx, cy, h (px), frame }
    function cropCandidates(i) {
      const list = [];
      if (lastFace && i - lastFace.frame <= Math.round(job.fps)) {
        const side = Math.min(Math.min(W, H), Math.max(lastFace.h * 3, Math.min(W, H) * 0.25));
        list.push([lastFace.cx - side / 2, lastFace.cy - side / 2, side]);
      }
      const side = Math.min(W, H) * 0.55;
      for (let y = 0; y + side <= H * 0.75 + 1; y += side * 0.5) {
        for (let x = 0; x + side <= W + 1; x += Math.max(1, (W - side) / 2)) list.push([x, y, side]);
      }
      return list;
    }
    function faceFromCrop(img, [x, y, side]) {
      x = Math.max(0, Math.min(W - side, x)); y = Math.max(0, Math.min(H - side, y));
      cropCtx.drawImage(img, x, y, side, side, 0, 0, 512, 512);
      const r = faceCrop.detect(cropCanvas);
      const lm = r.faceLandmarks?.[0];
      if (!lm) return null;
      return lm.map((p) => ({ x: (x + p.x * side) / W, y: (y + p.y * side) / H, z: p.z }));
    }
    function packFace(lm, via) {
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const p of lm) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const pts = {};
      for (const [k, idx] of Object.entries(FACE_POINTS)) { const p = lm[idx]; if (p) pts[k] = [r4(p.x), r4(p.y), r4(p.z)]; }
      return { box: [r4(x0), r4(y0), r4(x1), r4(y1)], pts, n: lm.length, via };
    }
    const hands = job.hands === false ? null : await vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/models/mediapipe/models/hand_landmarker.task', delegate },
      runningMode: 'VIDEO', numHands: job.numHands || 2,
      minHandDetectionConfidence: job.minConfidence ?? 0.5, minHandPresenceConfidence: job.minConfidence ?? 0.5, minTrackingConfidence: job.minConfidence ?? 0.5,
    });
    const dbg = job.debug ? document.createElement('canvas') : null;
    const dctx = dbg ? dbg.getContext('2d') : null;
    if (dbg) { dbg.width = W; dbg.height = H; }
    const out = [];
    window.__vision.state = 'running';
    for (let i = 0; i < job.frames; i++) {
      const img = await loadImage(`/work/in/${pad(i + 1)}.png`);
      const rec = { faces: [], hands: [] };
      if (face) {
        const r = face.detectForVideo(img, ts(i));
        for (const lm of r.faceLandmarks || []) rec.faces.push(packFace(lm, 'full'));
        if (!rec.faces.length && faceCrop) {
          for (const c of cropCandidates(i)) {
            const lm = faceFromCrop(img, c);
            if (lm) { rec.faces.push(packFace(lm, 'crop')); break; }
          }
        }
        const f0 = rec.faces[0];
        if (f0) lastFace = { cx: ((f0.box[0] + f0.box[2]) / 2) * W, cy: ((f0.box[1] + f0.box[3]) / 2) * H, h: (f0.box[3] - f0.box[1]) * H, frame: i };
      }
      if (hands) {
        const r = hands.detectForVideo(img, ts(i));
        const sides = r.handedness || r.handednesses || [];
        (r.landmarks || []).forEach((lm, h) => {
          const c = sides[h]?.[0];
          rec.hands.push({ lm: lm.map((p) => [r4(p.x), r4(p.y), r4(p.z)]), side: c?.categoryName || null, score: c ? r4(c.score) : null });
        });
      }
      out.push(rec);
      if (dbg) {
        dctx.drawImage(img, 0, 0, W, H);
        dctx.lineWidth = Math.max(2, W / 360);
        for (const f of rec.faces) {
          dctx.strokeStyle = f.via === 'crop' ? '#ff9f1c' : '#00e5ff';
          dctx.strokeRect(f.box[0] * W, f.box[1] * H, (f.box[2] - f.box[0]) * W, (f.box[3] - f.box[1]) * H);
          dctx.fillStyle = '#ffe600';
          for (const p of Object.values(f.pts)) { dctx.beginPath(); dctx.arc(p[0] * W, p[1] * H, dctx.lineWidth * 1.5, 0, Math.PI * 2); dctx.fill(); }
        }
        for (const h of rec.hands) {
          dctx.strokeStyle = h.side === 'Left' ? '#ff3d7f' : '#7cff4f';
          for (const c of vision.HandLandmarker.HAND_CONNECTIONS) {
            const a = h.lm[c.start], b = h.lm[c.end];
            dctx.beginPath(); dctx.moveTo(a[0] * W, a[1] * H); dctx.lineTo(b[0] * W, b[1] * H); dctx.stroke();
          }
        }
        const blob = await new Promise((res) => dbg.toBlob(res, 'image/png'));
        await put(`/work/dbg/${pad(i + 1)}.png`, blob);
      }
      window.__vision.frame = i + 1;
    }
    await put('/work/out/track.json', JSON.stringify({ facePoints: FACE_POINTS, frames: out }));
    face?.close();
    faceCrop?.close();
    hands?.close();
  } else if (job.task === 'matte') {
    const seg = await vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/models/mediapipe/models/selfie_segmenter.tflite', delegate },
      runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
    });
    const m = job.matte || {};
    const lo = m.lo ?? 0.38;
    const hi = m.hi ?? 0.62;
    const temporal = Math.max(0, Math.min(0.9, m.temporal ?? 0)); // weight of the previous frame's mask
    const feather = Math.max(0, m.feather ?? 0); // px of blur on the alpha at output size
    const inferW = m.inferWidth || W;
    const inferH = Math.round((inferW * H) / W);
    const inCanvas = document.createElement('canvas');
    inCanvas.width = inferW; inCanvas.height = inferH;
    const inCtx = inCanvas.getContext('2d', { willReadFrequently: false });
    const maskCanvas = document.createElement('canvas');
    let maskCtx = null;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = W; outCanvas.height = H;
    const outCtx = outCanvas.getContext('2d');
    // Choke: erode the matte by about `choke` px at output size (blur the mask, keep only what
    // lies that far inside the edge). The selfie segmenter's edge band often holds a rim of the
    // original background (a white wall shows as a white halo over a new background).
    const choke = Math.max(0, m.choke ?? 0);
    const chokeCanvas = document.createElement('canvas');
    chokeCanvas.width = W; chokeCanvas.height = H;
    const chokeCtx = chokeCanvas.getContext('2d', { willReadFrequently: true });
    let prev = null;
    const smooth = (x) => { const t = Math.max(0, Math.min(1, (x - lo) / Math.max(1e-6, hi - lo))); return t * t * (3 - 2 * t); };
    window.__vision.state = 'running';
    for (let i = 0; i < job.frames; i++) {
      const img = await loadImage(`/work/in/${pad(i + 1)}.png`);
      inCtx.drawImage(img, 0, 0, inferW, inferH);
      const r = seg.segmentForVideo(inCanvas, ts(i));
      const mask = r.confidenceMasks?.[0];
      if (!mask) throw new Error(`frame ${i}: no confidence mask`);
      const mw = mask.width, mh = mask.height;
      const conf = mask.getAsFloat32Array();
      if (i === 0) { window.__vision.info.mask = `${mw}x${mh}`; window.__vision.info.masks = r.confidenceMasks.length; }
      if (!maskCtx || maskCanvas.width !== mw || maskCanvas.height !== mh) {
        maskCanvas.width = mw; maskCanvas.height = mh; maskCtx = maskCanvas.getContext('2d'); prev = null;
      }
      const cur = new Float32Array(conf);
      if (prev && temporal > 0) for (let k = 0; k < cur.length; k++) cur[k] = prev[k] * temporal + cur[k] * (1 - temporal);
      prev = cur;
      const id = maskCtx.createImageData(mw, mh);
      for (let k = 0; k < cur.length; k++) { const a = smooth(cur[k]) * 255; const o = k * 4; id.data[o] = 255; id.data[o + 1] = 255; id.data[o + 2] = 255; id.data[o + 3] = a; }
      maskCtx.putImageData(id, 0, 0);
      r.close?.();
      let maskSrc = maskCanvas;
      if (choke > 0) {
        chokeCtx.clearRect(0, 0, W, H);
        chokeCtx.filter = `blur(${choke}px)`;
        chokeCtx.drawImage(maskCanvas, 0, 0, W, H);
        chokeCtx.filter = 'none';
        const cd = chokeCtx.getImageData(0, 0, W, H);
        const px = cd.data;
        for (let k = 3; k < px.length; k += 4) {
          const t = Math.max(0, Math.min(1, (px[k] / 255 - 0.7) / 0.27));
          px[k] = t * t * (3 - 2 * t) * 255;
        }
        chokeCtx.putImageData(cd, 0, 0);
        maskSrc = chokeCanvas;
      }
      // Footage, then keep it only where the (upscaled, optionally feathered) mask is.
      outCtx.globalCompositeOperation = 'source-over';
      outCtx.filter = 'none';
      outCtx.clearRect(0, 0, W, H);
      outCtx.drawImage(img, 0, 0, W, H);
      outCtx.globalCompositeOperation = 'destination-in';
      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';
      if (feather > 0) outCtx.filter = `blur(${feather}px)`;
      outCtx.drawImage(maskSrc, 0, 0, W, H);
      outCtx.filter = 'none';
      outCtx.globalCompositeOperation = 'source-over';
      const blob = await new Promise((res) => outCanvas.toBlob(res, 'image/png'));
      await put(`/work/out/${pad(i + 1)}.png`, blob);
      window.__vision.frame = i + 1;
    }
    seg.close();
  } else {
    throw new Error(`unknown task ${job.task}`);
  }
  window.__vision.state = 'done';
} catch (e) {
  window.__vision.state = 'error';
  window.__vision.error = `${e.message}\n${e.stack || ''}`;
}
