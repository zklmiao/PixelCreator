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
// v1: Euclidean RGB. OKLCH upgrade is isolated to swapping `colorDistance`.
export function euclideanDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
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

function main() {
  const [cmd, ...targets] = process.argv.slice(2);
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
