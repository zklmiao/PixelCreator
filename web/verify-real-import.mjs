// verify-real-import.mjs — M2/M3 real-import acceptance: fixture compare PNGs
// (exist + parse as PNG + side-by-side size formula) + 7 shells all OK via
// pure checkShell + potion 8-cell shape (form only, fullness tolerated) +
// guardian provenance (map + 8 sources + reuse-vs-landed + td==sd + 24-cell
// shape) + character regression. Run: node web/verify-real-import.mjs
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
import { guardianSourcesFromMap, compareNameForSource } from './lib/compare.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loadAsset = (id) => JSON.parse(readFileSync(resolve(root, 'assets', id, 'asset.json'), 'utf8'));

let failed = false;
const fail = (m) => { console.log(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`OK: ${m}`);

// 0. Switcher holds 7 assets in contract order (synced with verify-static:26).
if (ASSET_IDS.join() !== 'knight_001,sword_001,house_001,crate_001,tree_001,potion_001,guardian_001') {
  fail(`ASSET_IDS must be knight/sword/house/crate/tree/potion/guardian, got ${ASSET_IDS.join(',')}`);
} else ok('ASSET_IDS holds 7 assets (knight,sword,house,crate,tree,potion,guardian)');
for (const id of ASSET_IDS) {
  if (ASSET_URLS[id] !== `../assets/${id}/asset.json`) fail(`ASSET_URLS[${id}] must be ../assets/${id}/asset.json`);
}
ok('ASSET_URLS maps 7 ids to ../assets/<id>/asset.json');

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

// 4. Seven shells all OK via fs + pure checkShell.
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

// 7. Guardian provenance: map + 8 sources (32x32) + reuse declaration vs
// landed bytes (idle f1 / walk f1,f2 / attack f2,f1) + td==sd placeholder +
// 8 compares (96x64 derived: 32 source + 64 size档) + 24-cell matrix shape.
// Landed-file checks tolerate missing pre-generation (report counts); map +
// source presence is hard (lands with the wt-A m3 merge).
{
  const gdir = resolve(root, 'fixtures/guardian');
  const gAssetDir = resolve(root, 'assets/guardian_001');
  const readBin = (fp) => (existsSync(fp) ? readFileSync(fp) : null);
  if (!existsSync(gdir)) {
    fail('fixtures/guardian/ missing (lands with the wt-A m3 merge)');
  } else {
    const have = readdirSync(gdir);
    ok(`fixtures/guardian/ lists ${have.length} files: ${have.join(',')}`);
    const mapFp = resolve(gdir, 'guardian-map.json');
    if (!existsSync(mapFp)) {
      fail('fixtures/guardian/guardian-map.json missing');
    } else {
      let map;
      try {
        map = JSON.parse(readFileSync(mapFp, 'utf8'));
        ok('guardian-map.json parses as JSON (clip -> source manifest committed)');
      } catch (e) {
        fail(`guardian-map.json does not parse (${e.message})`);
      }
      if (map !== undefined) {
        const mapText = JSON.stringify(map);
        if (!mapText.includes('f1') || !mapText.includes('f2')) {
          fail('guardian-map.json must declare the f1/f2 frame reuse (idle f1 / walk f1,f2 / attack f2,f1)');
        } else ok('guardian-map.json declares f1/f2 reuse (idle f1 / walk f1,f2 / attack f2,f1)');
        const refs = guardianSourcesFromMap(map);
        if (refs.length !== 8) {
          fail(`guardian-map.json must reference 8 source PNGs, got ${refs.length}: ${refs.join(',')}`);
        } else ok(`guardian-map.json references 8 sources: ${refs.join(',')}`);
        for (const base of refs) {
          if (!existsSync(resolve(gdir, base))) fail(`map-referenced source missing: fixtures/guardian/${base}`);
        }
        if (!failed) ok('all map-referenced sources land on disk');
      }
    }
    const srcFiles = have.filter((f) => /\.png$/i.test(f) && !/\.compare\.png$/i.test(f));
    if (srcFiles.length !== 8) {
      fail(`fixtures/guardian/ must hold 8 source PNGs, got ${srcFiles.length}: ${srcFiles.join(',')}`);
    } else ok(`8 guardian source PNGs in place: ${srcFiles.join(',')}`);
    for (const f of srcFiles) {
      let img;
      try {
        img = PNG.sync.read(readFileSync(resolve(gdir, f)));
      } catch (e) {
        fail(`${f} does not parse as PNG (${e.message})`);
        continue;
      }
      if (img.width !== 32 || img.height !== 32) fail(`${f} must be 32x32, got ${img.width}x${img.height}`);
      else ok(`${f} is 32x32 RGBA`);
    }
    const cmpFiles = have.filter((f) => /\.compare\.png$/i.test(f));
    if (cmpFiles.length !== 8) {
      fail(`fixtures/guardian/ must hold 8 compare PNGs, got ${cmpFiles.length}: ${cmpFiles.join(',')}`);
    } else ok(`8 guardian compare PNGs in place: ${cmpFiles.join(',')}`);
    for (const f of cmpFiles) {
      const base = f.replace(/\.compare\.png$/i, '.png');
      if (!srcFiles.includes(base)) fail(`${f} has no paired source ${base}`);
      let img;
      try {
        img = PNG.sync.read(readFileSync(resolve(gdir, f)));
      } catch (e) {
        fail(`${f} does not parse as PNG (${e.message})`);
        continue;
      }
      if (img.width !== 96 || img.height !== 64) {
        fail(`${f} must be 96x64 (32 source + 64 size档, shared height 64), got ${img.width}x${img.height}`);
      } else ok(`${f} is 96x64 (32 source + 64 quantized, left/right panels)`);
    }
  }
  // Landed-bytes reuse + td==sd placeholder (tolerant while SVGs land).
  // Pixel semantics: slot metadata (action/frame/source, data-master) differs
  // per slot by design, so reuse/master checks compare <rect> pixel sets
  // (same rectSet precedent as tools/static-kinds.test.mjs); td==sd twins
  // are pure copies and stay whole-byte identical per spec.
  const guardian = loadAsset('guardian_001');
  const clips = guardian.actions;
  const rectKey = (file) => {
    const bin = readBin(resolve(gAssetDir, file));
    if (bin === null) return null;
    const tags = String(bin).match(/<rect\b[^>]*>/g) ?? [];
    return tags.sort().join('\n');
  };
  let checked = 0;
  let tolerated = 0;
  const eqFiles = (a, b) => {
    const ba = readBin(resolve(gAssetDir, a));
    const bb = readBin(resolve(gAssetDir, b));
    if (ba === null || bb === null) {
      tolerated++;
      return null;
    }
    checked++;
    return ba.equals(bb);
  };
  for (const persp of ['td', 'sd']) {
    for (const dir of ['fr', 'bk', 'lf', 'rt']) {
      const idle = clips.idle.clips[persp][dir].map((f) => f.file);
      const walk = clips.walk.clips[persp][dir].map((f) => f.file);
      const attack = clips.attack.clips[persp][dir].map((f) => f.file);
      // Reuse declaration: idle=[f1], walk=[f1,f2], attack=[f2,f1] (pixel sets).
      const px = (a, b) => {
        const ka = rectKey(a);
        const kb = rectKey(b);
        if (ka === null || kb === null) {
          tolerated++;
          return null;
        }
        checked++;
        return ka === kb;
      };
      const r1 = px(idle[0], walk[0]);
      if (r1 === false) fail(`reuse mismatch: ${idle[0]} pixels must equal ${walk[0]} (both f1)`);
      const r2 = px(walk[1], attack[0]);
      if (r2 === false) fail(`reuse mismatch: ${walk[1]} pixels must equal ${attack[0]} (both f2)`);
      const r3 = px(walk[0], attack[1]);
      if (r3 === false) fail(`reuse mismatch: ${walk[0]} pixels must equal ${attack[1]} (both f1)`);
      const d = px(walk[0], walk[1]);
      if (d === true) fail(`distinctness: ${walk[0]} pixels must differ from ${walk[1]} (f1 vs f2)`);
      if (persp === 'td') {
        for (const f of [...idle, ...walk, ...attack]) {
          const sdTwin = f.replace('_td_', '_sd_');
          const t = eqFiles(f, sdTwin);
          if (t === false) fail(`td placeholder mismatch: ${f} must be byte-identical to ${sdTwin}`);
        }
      }
    }
  }
  // Masters carry fr-slot content (data-master marking differs by design).
  for (const [persp, fr0] of [['td', 'guardian_td_idle_fr0.svg'], ['sd', 'guardian_sd_idle_fr0.svg']]) {
    const master = guardian.masters[persp];
    const ka = rectKey(master);
    const kb = rectKey(fr0);
    if (ka === null || kb === null) {
      tolerated++;
    } else {
      checked++;
      if (ka !== kb) fail(`master mismatch: ${master} pixels must equal ${fr0} (fr-slot content)`);
    }
  }
  ok(`guardian landed-bytes reuse + td==sd placeholder checked=${checked} tolerated-missing=${tolerated}`);
  // Guardian 24-cell matrix shape via existing buildMatrix (td placeholder
  // consumed as a normal perspective; fullness tolerated pre-generation).
  {
    let total = 0;
    const wantActions = ['idle', 'walk', 'attack'];
    for (const persp of ['td', 'sd']) {
      const m = buildMatrix(guardian, persp);
      if (m.cells.length !== 12) fail(`guardian/${persp}: expected 12 cells, got ${m.cells.length}`);
      else ok(`guardian/${persp}: 12 cells`);
      const acts = [...new Set(m.cells.map((c) => c.action))].sort().join(',');
      if (acts !== wantActions.sort().join(',')) fail(`guardian/${persp}: actions must be idle/walk/attack, got ${acts}`);
      else ok(`guardian/${persp}: idle/walk/attack actions present`);
      const miss = m.cells.filter((c) => c.missing);
      ok(`guardian/${persp}: missing=${miss.length} (tolerated pre-generation)`);
      total += m.cells.length;
    }
    if (total !== 24) fail(`guardian: toggle total must be 24, got ${total}`);
    else ok('guardian toggle totals 24 cells (form verified, fullness tolerated)');
  }
}

if (failed) process.exit(1);
console.log('OK: real import verified (3 compares/7 shells/potion 8-cell/guardian provenance/character frozen)');
