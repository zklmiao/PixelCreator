// import-prototype.mjs — real-PNG prototype import (OpenSpec real-import-mvp).
//
// Single command: pngjs decode -> quantizeGeometry (asset size tier) ->
// OKLCH mapFrameToPalette (default) -> pixelsToSvg into the frozen static
// skeleton slots (8 idle views + 2 perspective masters) + a side-by-side
// `<basename>.compare.png` (source left, quantized result right).
// Single source replicates to all 8 idle slots by default; `--dir` overwrites
// selected slots (`fr` = both perspectives, `td/fr` = one slot); `--out`
// redirects compare output (default: next to --src). asset.json is never
// touched, so clip `prompt_hash` stays "pending" (schema frozen).
import { PNG } from 'pngjs';
import { quantizeGeometry } from './quantize.mjs';
import { mapFrameToPalette, getMappableColors } from './palette.mjs';
import { pixelsToSvg, staticRelabel, knightRelabel } from './vectorize.mjs';
import { encodePng } from './sheet.mjs';

export const STATIC_IMPORT_KINDS = ['weapon', 'building', 'prop', 'scenery'];
export const IMPORT_PERSPS = ['td', 'sd'];
export const IMPORT_DIRS = ['fr', 'bk', 'lf', 'rt'];

function frameNumFromFile(file) {
  const m = String(file).match(/(\d+)\.svg$/);
  return m ? Number(m[1]) : 0;
}

function baseNameNoExt(p) {
  const b = String(p).split(/[\\/]/).pop();
  return b.replace(/\.png$/i, '');
}

// CLI args: --asset <id> (--src <png> [--dir <fr|td/fr>] | --map <manifest.json>) [--out <dir>]
// (+ `--k=v` forms). Returns { assetId, srcPath, mapPath, dir, outDir }.
export function parseImportArgs(argv) {
  let assetId = null;
  let srcPath = null;
  let mapPath = null;
  let dir = null;
  let outDir = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--asset' && argv[i + 1]) assetId = argv[++i];
    else if (a.startsWith('--asset=')) assetId = a.slice('--asset='.length);
    else if (a === '--src' && argv[i + 1]) srcPath = argv[++i];
    else if (a.startsWith('--src=')) srcPath = a.slice('--src='.length);
    else if (a === '--map' && argv[i + 1]) mapPath = argv[++i];
    else if (a.startsWith('--map=')) mapPath = a.slice('--map='.length);
    else if (a === '--dir' && argv[i + 1]) dir = argv[++i];
    else if (a.startsWith('--dir=')) dir = a.slice('--dir='.length);
    else if (a === '--out' && argv[i + 1]) outDir = argv[++i];
    else if (a.startsWith('--out=')) outDir = a.slice('--out='.length);
  }
  return { assetId, srcPath, mapPath, dir, outDir };
}

// Load frozen skeleton + its kind palette. --src path stays static-only;
// --map path (multi-slot manifest) also admits character skeletons.
export async function loadImportAsset(assetId, { allowCharacter = false } = {}) {
  const { readFileSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const assetDir = resolve(moduleDir, '..', 'assets', assetId);
  let asset;
  try {
    asset = JSON.parse(readFileSync(resolve(assetDir, 'asset.json'), 'utf8'));
  } catch (e) {
    throw new Error(`import-prototype: cannot load assets/${assetId}/asset.json: ${e.message}`);
  }
  const kinds = allowCharacter ? [...STATIC_IMPORT_KINDS, 'character'] : STATIC_IMPORT_KINDS;
  if (!kinds.includes(asset.kind)) {
    throw new Error(
      `import-prototype: ${assetId} kind must be one of ${kinds.join(',')}${allowCharacter ? '' : ' (frozen static skeleton only)'}, got ${JSON.stringify(asset.kind)}`,
    );
  }
  const pm = String(asset.palette ?? '').match(/^palette_(\w+)@v(\d+)$/);
  if (!pm || pm[1] !== asset.kind) {
    throw new Error(
      `import-prototype: ${assetId} palette ${JSON.stringify(asset.palette)} must match palette_${asset.kind}@vN`,
    );
  }
  const palette = JSON.parse(
    readFileSync(resolve(moduleDir, '..', 'palettes', `palette_${pm[1]}.v${pm[2]}.json`), 'utf8'),
  );
  return { asset, assetDir, palette };
}

// Decode a real PNG file -> { data, width, height } (RGBA bytes).
export async function decodePngFile(srcPath) {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const abs = resolve(srcPath);
  let buf;
  try {
    buf = readFileSync(abs);
  } catch (e) {
    throw new Error(`import-prototype: cannot read src ${JSON.stringify(srcPath)}: ${e.message}`);
  }
  let png;
  try {
    png = PNG.sync.read(buf);
  } catch (e) {
    throw new Error(`import-prototype: src ${JSON.stringify(srcPath)} is not a decodable PNG: ${e.message}`);
  }
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
}

// Geometry (tier fit + square pad) then OKLCH palette mapping (default path).
// Returns { geo, mapped }; throws on empty/tier violations via quantizeGeometry.
export function quantizeAndMap(src, asset, palette) {
  const geo = quantizeGeometry(src.data, src.width, src.height, asset.size, { kind: asset.kind });
  const mapped = mapFrameToPalette(geo.data, geo.width, geo.height, palette);
  return { geo, mapped };
}

// One view/master SVG from mapped pixels + frozen clip meta (seed/prompt_hash
// carried over untouched, so prompt_hash stays "pending"). Character kinds
// reuse the knight semantic split (same hook as generateKnightSvgs); static
// kinds route everything to body via staticRelabel.
export function svgForSlot(quant, asset, palette, persp, dir, clip, srcBase, master = false, action = 'idle') {
  const mappable = getMappableColors(palette);
  void mappable;
  const relabel =
    asset.kind === 'character'
      ? (x, y, n) => knightRelabel(x, y, n, { size: asset.size, action, perspective: persp })
      : staticRelabel;
  return pixelsToSvg(quant.mapped.data, quant.geo.width, quant.geo.height, {
    asset: asset.id,
    perspective: persp,
    action,
    dir,
    frame: frameNumFromFile(clip.file),
    size: asset.size,
    palette,
    seed: clip.seed,
    prompt_hash: clip.prompt_hash,
    denoise: clip.denoise ?? '',
    source: master ? `real:${srcBase}:master:${persp}` : `real:${srcBase}:${persp}/${action}/${dir}/0`,
    names: quant.mapped.names,
    master,
    relabel,
  });
}

// Side-by-side compare canvas: source left, quantized result right,
// top-aligned on transparent; W = srcW + size, H = max(srcH, size).
// Pure nearest blits (integer-upscale semantics: no blending, deterministic).
export function buildCompare(srcData, srcW, srcH, mappedData, size) {
  if (!(srcData instanceof Uint8ClampedArray)) throw new Error('srcData must be Uint8ClampedArray RGBA');
  if (!(mappedData instanceof Uint8ClampedArray)) throw new Error('mappedData must be Uint8ClampedArray RGBA');
  if (srcData.length !== srcW * srcH * 4) throw new Error('src buffer length mismatch');
  if (mappedData.length !== size * size * 4) throw new Error('mapped buffer length mismatch size*size');
  const w = srcW + size;
  const h = Math.max(srcH, size);
  const out = new Uint8ClampedArray(w * h * 4); // transparent fill
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const si = (y * srcW + x) * 4;
      const di = (y * w + x) * 4;
      out[di] = srcData[si];
      out[di + 1] = srcData[si + 1];
      out[di + 2] = srcData[si + 2];
      out[di + 3] = srcData[si + 3];
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const si = (y * size + x) * 4;
      const di = (y * w + (srcW + x)) * 4;
      out[di] = mappedData[si];
      out[di + 1] = mappedData[si + 1];
      out[di + 2] = mappedData[si + 2];
      out[di + 3] = mappedData[si + 3];
    }
  }
  return { data: out, width: w, height: h };
}

// Resolve --dir into [{ persp, dir }]: `fr` = both perspectives,
// `td/fr` = one slot. Null/undefined = all 8 slots.
export function resolveSlots(asset, dir) {
  const all = [];
  for (const p of asset.perspectives) for (const d of asset.views) all.push({ persp: p, dir: d });
  if (dir === null || dir === undefined) return all;
  if (String(dir).includes('/')) {
    const [p, d] = String(dir).split('/');
    if (!asset.perspectives.includes(p) || !asset.views.includes(d)) {
      throw new Error(
        `import-prototype: --dir must be <dir> (${asset.views.join('|')}) or <persp>/<dir>, got ${JSON.stringify(dir)}`,
      );
    }
    return [{ persp: p, dir: d }];
  }
  if (!asset.views.includes(dir)) {
    throw new Error(`import-prototype: --dir must be one of ${asset.views.join(',')} or <persp>/<dir>, got ${JSON.stringify(dir)}`);
  }
  return asset.perspectives.map((p) => ({ persp: p, dir }));
}

export async function runImport({ assetId, srcPath, dir = null, outDir = null } = {}) {
  if (!assetId) throw new Error('import-prototype: --asset <id> is required');
  if (!srcPath) throw new Error('import-prototype: --src <png> is required');
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const { asset, assetDir, palette } = await loadImportAsset(assetId);
  const src = await decodePngFile(srcPath);
  const quant = quantizeAndMap(src, asset, palette);
  const slots = resolveSlots(asset, dir);
  const srcBase = baseNameNoExt(srcPath);
  let views = 0;
  const frWritten = new Set();
  for (const { persp, dir: d } of slots) {
    const clip = asset.actions?.idle?.clips?.[persp]?.[d]?.[0];
    if (!clip) throw new Error(`import-prototype: missing clip slot ${persp}/idle/${d} in ${assetId}`);
    const svg = svgForSlot(quant, asset, palette, persp, d, clip, srcBase, false);
    mkdirSync(assetDir, { recursive: true });
    writeFileSync(resolve(assetDir, clip.file), svg, 'utf8');
    views++;
    if (d === 'fr') frWritten.add(persp);
  }
  let masters = 0;
  for (const persp of asset.perspectives) {
    if (!frWritten.has(persp)) continue;
    const frClip = asset.actions?.idle?.clips?.[persp]?.fr?.[0];
    if (!frClip) throw new Error(`import-prototype: missing fr slot for master ${persp} in ${assetId}`);
    const svg = svgForSlot(quant, asset, palette, persp, 'fr', frClip, srcBase, true);
    writeFileSync(resolve(assetDir, asset.masters[persp]), svg, 'utf8');
    masters++;
  }
  const cmp = buildCompare(src.data, src.width, src.height, quant.mapped.data, asset.size);
  const pngBytes = encodePng(cmp.data, cmp.width, cmp.height);
  const comparePath = resolve(outDir ?? dirname(resolve(srcPath)), `${srcBase}.compare.png`);
  mkdirSync(dirname(comparePath), { recursive: true });
  writeFileSync(comparePath, pngBytes);
  console.log(`OK: imported ${srcBase}.png -> ${assetId} (${views} views + ${masters} masters, ${src.width}x${src.height} -> ${asset.size}x${asset.size})`);
  console.log(`OK: compare ${comparePath} ${cmp.width}x${cmp.height} (src left, quantized right)`);
  return { views, masters, comparePath, width: cmp.width, height: cmp.height };
}

// Multi-slot manifest import for characters (real-character-m3):
// `--map fixtures/guardian/guardian-map.json` assigns one source PNG per
// clip slot ({ clipFile: srcPng } + reuse declaration). td slots are filled
// with byte-copies of their sd counterparts (documented placeholder: no
// top-down source exists; a test pins td==sd byte equality). Masters carry
// fr-slot content + master flag; td masters copy sd masters byte-for-byte.
// One `<basename>.compare.png` per distinct source lands next to the map
// (or --out). asset.json is never touched (prompt_hash stays "pending").
export async function runMapImport({ assetId, mapPath, outDir = null } = {}) {
  if (!assetId) throw new Error('import-prototype: --asset <id> is required');
  if (!mapPath) throw new Error('import-prototype: --map <manifest.json> is required');
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname, resolve, basename } = await import('node:path');
  const { asset, assetDir, palette } = await loadImportAsset(assetId, { allowCharacter: true });
  const mapAbs = resolve(mapPath);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(mapAbs, 'utf8'));
  } catch (e) {
    throw new Error(`import-prototype: cannot load map ${JSON.stringify(mapPath)}: ${e.message}`);
  }
  const slots = manifest.slots ?? null;
  if (!slots || typeof slots !== 'object') {
    throw new Error(`import-prototype: map ${JSON.stringify(mapPath)} must carry { slots: { clipFile: srcPng } }`);
  }
  // Index every clip slot of the frozen skeleton: file -> { persp, action, dir, clip }.
  const slotIndex = new Map();
  for (const [action, a] of Object.entries(asset.actions ?? {})) {
    for (const persp of asset.perspectives) {
      for (const d of asset.views) {
        for (const clip of a.clips?.[persp]?.[d] ?? []) slotIndex.set(clip.file, { persp, action, dir: d, clip });
      }
    }
  }
  for (const f of slotIndex.keys()) {
    if (!(f in slots)) throw new Error(`import-prototype: map ${basename(mapAbs)} misses slot ${f}`);
  }
  for (const f of Object.keys(slots)) {
    if (!slotIndex.has(f)) throw new Error(`import-prototype: map ${basename(mapAbs)} names unknown slot ${f}`);
  }
  const mapDir = dirname(mapAbs);
  // Decode + quantize each distinct source once (cache by file).
  const quants = new Map();
  const srcMeta = new Map();
  for (const srcFile of new Set(Object.values(slots))) {
    const srcPath = resolve(mapDir, srcFile);
    const src = await decodePngFile(srcPath);
    quants.set(srcFile, quantizeAndMap(src, asset, palette));
    srcMeta.set(srcFile, src);
  }
  // sd slots generate; td slots byte-copy their sd counterparts.
  const sdSvg = new Map(); // key action/dir/idx -> svg bytes
  let views = 0;
  const slotKey = (action, d, idx) => `${action}/${d}/${idx}`;
  for (const [action, a] of Object.entries(asset.actions ?? {})) {
    for (const d of asset.views) {
      const sdList = a.clips?.sd?.[d] ?? [];
      const tdList = a.clips?.td?.[d] ?? [];
      if (sdList.length !== tdList.length) {
        throw new Error(`import-prototype: td/sd clip count mismatch for ${action}/${d} in ${assetId}`);
      }
      sdList.forEach((clip, idx) => {
        const srcFile = slots[clip.file];
        const srcBase = baseNameNoExt(srcFile);
        const quant = quants.get(srcFile);
        const svg = svgForSlot(quant, asset, palette, 'sd', d, clip, srcBase, false, action);
        sdSvg.set(slotKey(action, d, idx), svg);
        writeFileSync(resolve(assetDir, clip.file), svg, 'utf8');
        views++;
        const tdClip = tdList[idx];
        if (slots[tdClip.file] !== srcFile) {
          throw new Error(
            `import-prototype: td placeholder requires ${tdClip.file} to share ${clip.file} source, got ${JSON.stringify(slots[tdClip.file])}`,
          );
        }
        writeFileSync(resolve(assetDir, tdClip.file), svg, 'utf8');
        views++;
      });
    }
  }
  let masters = 0;
  const sdFrQuant = quants.get(slots[asset.actions.idle.clips.sd.fr[0].file]);
  const sdFrBase = baseNameNoExt(slots[asset.actions.idle.clips.sd.fr[0].file]);
  const sdFrClip = asset.actions.idle.clips.sd.fr[0];
  const masterSvg = svgForSlot(sdFrQuant, asset, palette, 'sd', 'fr', sdFrClip, sdFrBase, true, 'idle');
  for (const persp of asset.perspectives) {
    writeFileSync(resolve(assetDir, asset.masters[persp]), masterSvg, 'utf8');
    masters++;
  }
  const compares = [];
  for (const [srcFile, quant] of quants) {
    const src = srcMeta.get(srcFile);
    const srcBase = baseNameNoExt(srcFile);
    const cmp = buildCompare(src.data, src.width, src.height, quant.mapped.data, asset.size);
    const pngBytes = encodePng(cmp.data, cmp.width, cmp.height);
    const comparePath = resolve(outDir ?? mapDir, `${srcBase}.compare.png`);
    mkdirSync(dirname(comparePath), { recursive: true });
    writeFileSync(comparePath, pngBytes);
    compares.push(comparePath);
  }
  console.log(`OK: map-imported ${basename(mapAbs)} -> ${assetId} (${views} views + ${masters} masters, td=sd byte-copies)`);
  for (const c of compares) console.log(`OK: compare ${c}`);
  return { views, masters, compares };
}

async function main() {
  const { assetId, srcPath, mapPath, dir, outDir } = parseImportArgs(process.argv.slice(2));
  if (!assetId || (!srcPath && !mapPath)) {
    console.error(
      'usage: node tools/import-prototype.mjs --asset <id> (--src <png> [--dir <dir|persp/dir>] | --map <manifest.json>) [--out <dir>]',
    );
    process.exit(2);
  }
  if (srcPath && mapPath) {
    console.error('import-prototype: use one of --src / --map, not both');
    process.exit(2);
  }
  if (mapPath) await runMapImport({ assetId, mapPath, outDir });
  else await runImport({ assetId, srcPath, dir, outDir });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e));
    process.exit(1);
  });
}
