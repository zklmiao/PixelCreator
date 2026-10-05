// quantize.mjs — geometry stage of the pixel pipeline (OpenSpec 2.1).
// Downscale to 32/48/64/128 tiers + forced square pad + alpha<128 discard.
// Color mapping (nearest palette) is 2.2 and lives in palette.mjs; this module
// intentionally stops at geometry so 2.1 is verifiable in isolation.
// Zero dependencies so the Web app (canvas ImageData) can import it directly.
export const SUPPORTED_TIERS = [32, 48, 64, 128];
export const CHARACTER_TIERS = [32, 48, 64];
export const ALPHA_THRESHOLD = 128;

export function assertTier(size, kind = 'character') {
  if (!SUPPORTED_TIERS.includes(size)) {
    throw new Error(`size must be one of ${SUPPORTED_TIERS}, got ${JSON.stringify(size)}`);
  }
  if (kind === 'character' && !CHARACTER_TIERS.includes(size)) {
    throw new Error(`character size must be one of ${CHARACTER_TIERS}, got ${size} (128 is other-kinds only)`);
  }
}

// Fit srcWxH inside size×size preserving aspect, centered.
// Returns scaled dims + top-left offset in the square canvas.
export function computeFit(srcW, srcH, size) {
  if (!Number.isInteger(srcW) || srcW <= 0 || !Number.isInteger(srcH) || srcH <= 0) {
    throw new Error(`source dims must be positive ints, got ${srcW}x${srcH}`);
  }
  assertTier(size, 'other');
  const scale = size / Math.max(srcW, srcH);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));
  const offsetX = Math.floor((size - dstW) / 2);
  const offsetY = Math.floor((size - dstH) / 2);
  return { dstW, dstH, offsetX, offsetY };
}

// Area-average box downscale (also works as upscale for tiny sources).
// src: Uint8ClampedArray RGBA row-major, length srcW*srcH*4.
export function downscaleBox(src, srcW, srcH, dstW, dstH) {
  if (src.length !== srcW * srcH * 4) throw new Error('src buffer length mismatch');
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let dy = 0; dy < dstH; dy++) {
    const y0 = Math.floor(dy * yRatio);
    const y1 = Math.max(y0 + 1, Math.floor((dy + 1) * yRatio));
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = Math.floor(dx * xRatio);
      const x1 = Math.max(x0 + 1, Math.floor((dx + 1) * xRatio));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * srcW + sx) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
          n++;
        }
      }
      const o = (dy * dstW + dx) * 4;
      dst[o] = Math.round(r / n);
      dst[o + 1] = Math.round(g / n);
      dst[o + 2] = Math.round(b / n);
      dst[o + 3] = Math.round(a / n);
    }
  }
  return dst;
}

// alpha < threshold -> fully transparent (0,0,0,0). In-place, returns data.
export function applyAlphaThreshold(data, threshold = ALPHA_THRESHOLD) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < threshold) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }
  return data;
}

// Center `data` (w×h) on a size×size transparent canvas at (offsetX, offsetY).
export function padToSquare(data, w, h, size, offsetX, offsetY) {
  const out = new Uint8ClampedArray(size * size * 4); // transparent fill
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = ((y + offsetY) * size + (x + offsetX)) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return out;
}

// Full 2.1 geometry pipeline: fit -> downscale -> alpha-discard -> square pad.
// Returns { data, width, height } with width === height === size.
export function quantizeGeometry(src, srcW, srcH, size, opts = {}) {
  const kind = opts.kind ?? 'character';
  const threshold = opts.threshold ?? ALPHA_THRESHOLD;
  assertTier(size, kind);
  const { dstW, dstH, offsetX, offsetY } = computeFit(srcW, srcH, size);
  const small = downscaleBox(src, srcW, srcH, dstW, dstH);
  applyAlphaThreshold(small, threshold);
  const data = padToSquare(small, dstW, dstH, size, offsetX, offsetY);
  return { data, width: size, height: size };
}

// 2.3 display stage: integer-factor nearest-neighbor upscale.
// Mirrors the frontend `imageSmoothingEnabled = false` presentation path:
// every source pixel becomes a crisp factor×factor block, no blending.
// factor must be a positive integer; anything else throws.
export function upscaleNearest(src, w, h, factor) {
  if (!Number.isInteger(w) || w <= 0 || !Number.isInteger(h) || h <= 0) {
    throw new Error(`source dims must be positive ints, got ${w}x${h}`);
  }
  if (!Number.isInteger(factor) || factor <= 0) {
    throw new Error(`factor must be a positive integer, got ${JSON.stringify(factor)}`);
  }
  if (!(src instanceof Uint8ClampedArray)) throw new Error('src must be Uint8ClampedArray RGBA');
  if (src.length !== w * h * 4) throw new Error('src buffer length mismatch');
  const outW = w * factor;
  const outH = h * factor;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const r = src[si];
      const g = src[si + 1];
      const b = src[si + 2];
      const a = src[si + 3];
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const di = ((y * factor + dy) * outW + (x * factor + dx)) * 4;
          out[di] = r;
          out[di + 1] = g;
          out[di + 2] = b;
          out[di + 3] = a;
        }
      }
    }
  }
  return { data: out, width: outW, height: outH };
}

function solidRgba(w, h, r, g, b, a) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
  return buf;
}

function main() {
  const [cmd, sizeArg] = process.argv.slice(2);
  if (cmd !== 'selfcheck') {
    console.error('usage: node tools/quantize.mjs selfcheck [size]');
    process.exit(2);
  }
  const size = sizeArg ? Number(sizeArg) : 64;
  // Spec scenario: 512x384 prototype -> size×size centered with transparent pad.
  const src = solidRgba(512, 384, 200, 48, 40, 255);
  const { data, width, height } = quantizeGeometry(src, 512, 384, size, { kind: 'other' });
  const okDims = width === size && height === size && data.length === size * size * 4;
  // Top row must be transparent pad (384/512*size < size -> vertical letterbox).
  const { dstH } = computeFit(512, 384, size);
  const padRows = Math.floor((size - dstH) / 2);
  let padOk = padRows > 0;
  for (let x = 0; x < size && padOk; x++) {
    if (data[(0 * size + x) * 4 + 3] !== 0) padOk = false;
  }
  // Center pixel must be opaque content.
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  const centerA = data[(cy * size + cx) * 4 + 3];
  if (okDims && padOk && centerA === 255) {
    console.log(`OK: 512x384 -> ${width}x${height} centered (padRows=${padRows})`);
  } else {
    console.log(`FAIL: 512x384 -> ${width}x${height} okDims=${okDims} padOk=${padOk} centerA=${centerA}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) main();
