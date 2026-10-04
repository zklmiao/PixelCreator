// palette.mjs — palette JSON parse/validate + transparent exclusion (OpenSpec 1.2, pixel-quantize).
// Zero dependencies so the Web app can import it directly later.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PALETTE_ID_RE = /^palette_(character|weapon|building|prop|scenery)@v[0-9]+$/;
export const PALETTE_KINDS = ['character', 'weapon', 'building', 'prop', 'scenery'];
export const ALPHA_THRESHOLD = 128;

const HEX_SHORT_RE = /^#([0-9a-fA-F]{3})$/;
const HEX_RGB_RE = /^#([0-9a-fA-F]{6})$/;
const HEX_RGBA_RE = /^#([0-9a-fA-F]{8})$/;

// Parse #RGB / #RRGGBB / #RRGGBBAA -> { r, g, b, a }. Throws on invalid.
export function parseHex(hex) {
  if (typeof hex !== 'string') throw new Error(`hex must be a string, got ${JSON.stringify(hex)}`);
  const s = hex.trim();
  let m;
  if ((m = s.match(HEX_SHORT_RE))) {
    const [r, g, b] = [...m[1]].map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 255 };
  }
  if ((m = s.match(HEX_RGB_RE))) {
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16),
      a: 255,
    };
  }
  if ((m = s.match(HEX_RGBA_RE))) {
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16),
      a: parseInt(m[1].slice(6, 8), 16),
    };
  }
  throw new Error(`invalid hex color: ${JSON.stringify(hex)} (want #RGB, #RRGGBB or #RRGGBBAA)`);
}

export function loadPalette(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Mappable entries: parsed opaque colors only. The `transparent` placeholder
// is structural (never inside `colors`) and is excluded here by construction.
export function getMappableColors(palette) {
  return (palette.colors ?? []).map((c) => ({ name: c.name, ...parseHex(c.hex) }));
}

export function validatePalette(palette) {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  if (!palette || typeof palette !== 'object') return { ok: false, errors: ['palette is not an object'] };
  if (typeof palette.id !== 'string' || !PALETTE_ID_RE.test(palette.id)) {
    fail(`id must match palette_<kind>@vN, got ${JSON.stringify(palette.id)}`);
  }
  if (!PALETTE_KINDS.includes(palette.kind)) fail(`kind must be one of ${PALETTE_KINDS}, got ${JSON.stringify(palette.kind)}`);
  if (typeof palette.id === 'string' && typeof palette.kind === 'string') {
    if (!palette.id.startsWith(`palette_${palette.kind}@`)) {
      fail(`id ${palette.id} does not match kind ${palette.kind}`);
    }
  }
  if (!Number.isInteger(palette.version) || palette.version < 1) fail('version must be an integer >= 1');

  try {
    const t = parseHex(palette.transparent);
    if (t.a !== 0) fail(`transparent must have alpha 00, got ${JSON.stringify(palette.transparent)}`);
  } catch (e) {
    fail(`transparent: ${e.message}`);
  }

  if (!Array.isArray(palette.colors) || palette.colors.length === 0) {
    fail('colors must be a non-empty array');
  } else {
    const seen = new Set();
    for (const [i, c] of palette.colors.entries()) {
      const where = `colors[${i}]`;
      if (!c || typeof c.name !== 'string' || !c.name) fail(`${where}: name must be a non-empty string`);
      else if (seen.has(c.name)) fail(`${where}: duplicate name ${JSON.stringify(c.name)}`);
      else seen.add(c.name);
      try {
        const p = parseHex(c.hex);
        if (p.a !== 255) fail(`${where} ${c.name}: palette entry must be opaque #RRGGBB, got ${JSON.stringify(c.hex)} (transparent belongs only in \`transparent\`)`);
      } catch (e) {
        fail(`${where} ${c.name}: ${e.message}`);
      }
    }
  }

  // Dithering policy (spec pixel-quantize): characters default none; ordered-Bayer
  // gated behind scenery/building only; error-diffusion never ships in v1.
  const d = palette.dither;
  if (!d || typeof d !== 'object') {
    fail('dither must be { default, allowed }');
  } else {
    if (d.default !== 'none') fail(`dither.default must be "none" in v1, got ${JSON.stringify(d.default)}`);
    const allowed = Array.isArray(d.allowed) ? d.allowed : null;
    if (!allowed || allowed.length === 0 || allowed[0] !== 'none') fail('dither.allowed must start with "none"');
    else {
      if (allowed.includes('error-diffusion')) fail('dither error-diffusion SHALL NOT ship in v1');
      const wantBayer = palette.kind === 'scenery' || palette.kind === 'building';
      const hasBayer = allowed.includes('ordered-bayer');
      if (!wantBayer && hasBayer) fail(`dither ordered-bayer is gated to scenery/building only (kind=${palette.kind})`);
    }
  }

  // Character v1 draft guard: dense 4-step skin ramp (design Risks).
  if (palette.kind === 'character' && Array.isArray(palette.colors)) {
    const roles = palette.colors.map((c) => c.role ?? '').join(' ');
    const skins = palette.colors.filter((c) => (c.role ?? '').startsWith('skin'));
    if (skins.length < 4) fail(`character palette needs a dense 4-step skin ramp, found ${skins.length} skin entries`);
    void roles;
  }

  return { ok: errors.length === 0, errors };
}

// --- Color distance (2.2 hook) ---
// v1 default: Euclidean RGB. OKLCH upgrade is isolated to swapping `colorDistance`
// (pass `oklchDistance` explicitly, or via `mapFrameToPalette` opts). No pipeline change.
export function euclideanDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// sRGB (0-255) -> OKLCH. Zero-dep port of the standard linear -> LMS -> Lab -> LCH chain.
export function srgbToOklch(r, g, b) {
  const toLinear = (c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.sqrt(a * a + bb * bb);
  const H = Math.atan2(bb, a);
  return { L, C, H };
}

// Perceptual replacement hook (v2 path). Hue-aware: dH wrapped, weighted by mean chroma.
export function oklchDistance(a, b) {
  const ka = srgbToOklch(a.r, a.g, a.b);
  const kb = srgbToOklch(b.r, b.g, b.b);
  const dL = (ka.L - kb.L) * 100;
  const dC = (ka.C - kb.C) * 100;
  let dH = ka.H - kb.H;
  while (dH > Math.PI) dH -= Math.PI * 2;
  while (dH < -Math.PI) dH += Math.PI * 2;
  const cMean = (ka.C + kb.C) / 2;
  const hTerm = cMean * 100 * dH;
  return Math.sqrt(dL * dL + dC * dC + hTerm * hTerm);
}

export function nearestColor(r, g, b, mappable, colorDistance = euclideanDistance) {
  let best = null;
  let bestD = Infinity;
  for (const c of mappable) {
    const d = colorDistance({ r, g, b }, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// 4x4 ordered-Bayer offsets in [-0.5, 0.5). Deterministic per (x, y): no shimmer.
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const BAYER_SPREAD = 12; // +/-6 on 0-255 channels before nearest lookup

function assertDither(palette, dither) {
  const allowed = palette.dither?.allowed ?? ['none'];
  if (dither === 'error-diffusion') throw new Error('dither error-diffusion SHALL NOT ship in v1');
  if (dither !== 'none' && !allowed.includes(dither)) {
    throw new Error(`dither ${JSON.stringify(dither)} not allowed for kind=${palette.kind} (allowed: ${allowed})`);
  }
}

// 2.2 frame mapping: every opaque pixel -> nearest palette entry (Euclidean v1,
// swappable to OKLCH); alpha < threshold -> transparent BEFORE mapping.
// Reuses getMappableColors/nearestColor; returns { data, names } with data RGBA
// (opaque hits a=255, discarded a=0) and names per-pixel palette entry (null if transparent).
export function mapFrameToPalette(data, width, height, palette, opts = {}) {
  if (!(data instanceof Uint8ClampedArray)) throw new Error('data must be Uint8ClampedArray RGBA');
  if (data.length !== width * height * 4) throw new Error('data length mismatch width*height');
  const threshold = opts.threshold ?? ALPHA_THRESHOLD;
  const dither = opts.dither ?? palette.dither?.default ?? 'none';
  const colorDistance = opts.colorDistance ?? euclideanDistance;
  assertDither(palette, dither);
  const mappable = getMappableColors(palette);
  if (mappable.length === 0) throw new Error('palette has no mappable colors');
  const out = new Uint8ClampedArray(data.length);
  const names = new Array(width * height).fill(null);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < threshold) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
        names[y * width + x] = null;
        continue;
      }
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      if (dither === 'ordered-bayer') {
        const t = BAYER_4X4[y % 4][x % 4] / 16 - 0.5;
        r = Math.min(255, Math.max(0, Math.round(r + t * BAYER_SPREAD)));
        g = Math.min(255, Math.max(0, Math.round(g + t * BAYER_SPREAD)));
        b = Math.min(255, Math.max(0, Math.round(b + t * BAYER_SPREAD)));
      }
      const hit = nearestColor(r, g, b, mappable, colorDistance);
      out[i] = hit.r;
      out[i + 1] = hit.g;
      out[i + 2] = hit.b;
      out[i + 3] = 255;
      names[y * width + x] = hit.name;
    }
  }
  return { data: out, names };
}

function main() {
  const [cmd, ...targets] = process.argv.slice(2);
  if (cmd === 'map-selfcheck') {
    const root = targets[0] ?? 'palettes/palette_character.v1.json';
    const palette = loadPalette(resolve(root));
    const mappable = getMappableColors(palette);
    const front = nearestColor(0xc2, 0x32, 0x2a, mappable, euclideanDistance);
    const back = nearestColor(0xbe, 0x2e, 0x26, mappable, euclideanDistance);
    const frontP = nearestColor(0xc2, 0x32, 0x2a, mappable, oklchDistance);
    const backP = nearestColor(0xbe, 0x2e, 0x26, mappable, oklchDistance);
    // 2x1 frame: [front-red, back-red] must converge under both metrics.
    const frame = new Uint8ClampedArray([0xc2, 0x32, 0x2a, 255, 0xbe, 0x2e, 0x26, 255]);
    const mapped = mapFrameToPalette(frame, 2, 1, palette);
    const ok =
      front?.name === back?.name && frontP?.name === backP?.name && mapped.names[0] === mapped.names[1];
    if (ok) {
      console.log(`OK: cross-view converge on ${mapped.names[0]} (euclidean=${front.name}, oklch=${frontP.name})`);
    } else {
      console.log(
        `FAIL: front=${front?.name}/${frontP?.name} back=${back?.name}/${backP?.name} frame=${mapped.names}`,
      );
      process.exit(1);
    }
    // Character must lock dither to none.
    try {
      mapFrameToPalette(frame, 2, 1, palette, { dither: 'ordered-bayer' });
      console.log('FAIL: character accepted ordered-bayer');
      process.exit(1);
    } catch {
      console.log('OK: character dither locked to none');
    }
    return;
  }
  if (cmd !== 'validate' || targets.length === 0) {
    console.error('usage: node tools/palette.mjs validate <palette.json...>');
    process.exit(2);
  }
  let failed = false;
  for (const t of targets) {
    const palette = loadPalette(resolve(t));
    const result = validatePalette(palette);
    // Structural exclusion check: transparent placeholder must never be mappable.
    let mappable = [];
    try {
      mappable = getMappableColors(palette);
    } catch (e) {
      result.errors.push(`mappable parse: ${e.message}`);
    }
    let transparentLeak = null;
    try {
      const tp = parseHex(palette.transparent);
      transparentLeak = mappable.find((c) => c.r === tp.r && c.g === tp.g && c.b === tp.b && c.a === tp.a);
    } catch { /* already reported */ }
    if (transparentLeak) {
      result.errors.push(`transparent placeholder leaked into mappable set: ${transparentLeak.name}`);
    }
    if (result.ok && result.errors.length === 0) {
      console.log(`OK: ${palette.id} (${mappable.length} mappable, transparent excluded)`);
    } else {
      failed = true;
      for (const e of result.errors) console.log(`FAIL: ${t}: ${e}`);
    }
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) main();
