// verify-real-import.mjs — M2 real-import acceptance: fixture compare PNGs
// (exist + parse as PNG + side-by-side size formula) + 6 shells all OK via
// pure checkShell + potion 8-cell shape (form only, fullness tolerated) +
// character regression. Run: node web/verify-real-import.mjs
// Read-only: never writes assets//fixtures/. checkShell is pure (fs read +
// direct call); loadShell (fetch) is browser-only and never called here.
// Compare layout contract (shared with tools/import-prototype.mjs wt-A):
// source left at native width, quantized result right at the asset size档,
// shared height 64. Committed files measure 98x64 = 34 (source) + 64
// (quantized); sources are the curated 34x34 RGBA icons, potion size档 is 64.
// Formula is derived per file (source dims read from disk + size档 64),
// not recorded from output: width === sourceWidth + 64, height === 64.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { checkShell, ASSET_IDS, ASSET_URLS } from './lib/asset-shell.js';
import { buildMatrix, canExport } from './lib/matrix.js';
import { COMPARE_FIXTURES, COMPARE_SOURCES } from './lib/compare.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loadAsset = (id) => JSON.parse(readFileSync(resolve(root, 'assets', id, 'asset.json'), 'utf8'));

let failed = false;
const fail = (m) => { console.log(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`OK: ${m}`);

// 0. Switcher holds 6 assets in contract order (synced with verify-static:26).
if (ASSET_IDS.join() !== 'knight_001,sword_001,house_001,crate_001,tree_001,potion_001') {
  fail(`ASSET_IDS must be knight/sword/house/crate/tree/potion, got ${ASSET_IDS.join(',')}`);
} else ok('ASSET_IDS holds 6 assets (knight,sword,house,crate,tree,potion)');
for (const id of ASSET_IDS) {
  if (ASSET_URLS[id] !== `../assets/${id}/asset.json`) fail(`ASSET_URLS[${id}] must be ../assets/${id}/asset.json`);
}
ok('ASSET_URLS maps 6 ids to ../assets/<id>/asset.json');

// 1. Fixture files: 3 sources + 3 compares committed under fixtures/import/.
const importDir = resolve(root, 'fixtures/import');
const wantFiles = [
  'I_Chest01.png', 'I_Chest01.compare.png',
  'I_Key01.png', 'I_Key01.compare.png',
  'I_GoldCoin.png', 'I_GoldCoin.compare.png',
];
if (!existsSync(importDir)) {
  fail('fixtures/import/ missing (lands with the wt-A import merge)');
} else {
  const have = readdirSync(importDir);
  ok(`fixtures/import/ lists ${have.length} files: ${have.join(',')}`);
  for (const f of wantFiles) {
    if (!have.includes(f)) fail(`fixture file missing: fixtures/import/${f}`);
  }
  if (!failed) ok('3 sources + 3 compares present (I_Chest01/I_Key01/I_GoldCoin)');
}

// 2. Sources are the curated 34x34 RGBA icons.
for (const { name, url } of COMPARE_SOURCES) {
  const fp = resolve(root, 'web', url);
  if (!existsSync(fp)) {
    fail(`source not on disk: ${url}`);
    continue;
  }
  let img;
  try {
    img = PNG.sync.read(readFileSync(fp));
  } catch (e) {
    fail(`${name} source does not parse as PNG (${e.message})`);
    continue;
  }
  if (img.width !== 34 || img.height !== 34) fail(`${name} source must be 34x34, got ${img.width}x${img.height}`);
  else ok(`${name} source is 34x34 RGBA (width=${img.width} height=${img.height})`);
}

// 3. Compares parse as PNG and follow the side-by-side size formula
// (left native source strip + right 64-wide quantized result, height 64).
const QUANT_W = 64;
const COMPARE_H = 64;
for (const { name, url } of COMPARE_FIXTURES) {
  const fp = resolve(root, 'web', url);
  if (!existsSync(fp)) {
    fail(`compare not on disk: ${url}`);
    continue;
  }
  let img;
  try {
    img = PNG.sync.read(readFileSync(fp));
  } catch (e) {
    fail(`${name} compare does not parse as PNG (${e.message})`);
    continue;
  }
  ok(`${name} compare parses as PNG (${img.width}x${img.height})`);
  const srcEntry = COMPARE_SOURCES.find((s) => s.name === name);
  const srcFp = resolve(root, 'web', srcEntry.url);
  const srcImg = PNG.sync.read(readFileSync(srcFp));
  if (img.width !== srcImg.width + QUANT_W) {
    fail(`${name} compare width must be source width + 64 (left native + right quantized), got ${img.width} vs source ${srcImg.width}`);
  } else ok(`${name} compare width ${img.width} === source ${srcImg.width} + 64 (left native, right quantized)`);
  if (img.height !== COMPARE_H) {
    fail(`${name} compare height must be 64 (shared asset size档), got ${img.height}`);
  } else ok(`${name} compare height ${img.height} === 64 (shared size档)`);
}

// 4. Six shells all OK via fs + pure checkShell.
for (const id of ASSET_IDS) {
  const asset = loadAsset(id);
  const r = checkShell(asset);
  if (!r.ok) fail(`${id} shell must be ok, got ${r.errors.join('; ')}`);
  else ok(`${id} shell ok (kind=${asset.kind})`);
}

// 5. Potion matrix shape: 4 idle cells per side (form only, fullness tolerated
// while SVGs land — missing parks as named placeholders and never exports).
{
  const potion = loadAsset('potion_001');
  let total = 0;
  for (const persp of ['td', 'sd']) {
    const m = buildMatrix(potion, persp);
    if (m.cells.length !== 4) fail(`potion/${persp}: expected 4 idle cells, got ${m.cells.length}`);
    else ok(`potion/${persp}: 4 idle cells`);
    if (!m.cells.every((c) => c.action === 'idle')) fail(`potion/${persp}: all cells must be idle`);
    else ok(`potion/${persp}: all cells idle-only`);
    const miss = m.cells.filter((c) => c.missing);
    ok(`potion/${persp}: missing=${miss.length} (tolerated pre-generation: ${miss.map((c) => c.clipId).join(',') || 'full'})`);
    total += m.cells.length;
  }
  if (total !== 8) fail(`potion: toggle total must be 8, got ${total}`);
  else ok('potion toggle totals 8 idle cells (form verified, fullness tolerated)');
}

// 6. Character regression: knight shell + 12-cell matrix + export ready.
{
  const knight = loadAsset('knight_001');
  const r = checkShell(knight);
  if (!r.ok) fail(`knight checkShell regression: ${r.errors.join('; ')}`);
  else ok('knight checkShell still ok (character path)');
  for (const persp of ['td', 'sd']) {
    const m = buildMatrix(knight, persp);
    if (m.cells.length !== 12) fail(`knight/${persp} regression: want 12, got ${m.cells.length}`);
    else ok(`knight/${persp} regression: 12 cells`);
  }
  const ex = canExport(knight);
  if (!ex.ok) fail(`knight canExport regression: ${ex.missing.join(',')}`);
  else ok('knight canExport regression ok (24 clips)');
}

if (failed) process.exit(1);
console.log('OK: real import verified (3 compares/6 shells/potion 8-cell/character frozen)');
