// guardian-import.test.mjs — real-character-m3 wt-A (A1 verification).
// Fixtures: resources/last-guardian-sprites.zip `last-guardian-sprites/amg1_*`
// (8 single-frame GIFs, 32x32 8bpp indexed, 4 dirs x 2 frames) converted once
// via PowerShell System.Drawing to 32bpp RGBA PNGs under fixtures/guardian/
// (original GIF basenames kept, .png). The zip/GIFs themselves are not
// committed; the pipeline runtime stays PNG-only (pngjs).
// Reuse declaration (design): idle=[f1] / walk=[f1,f2] / attack=[f2,f1];
// td slots hold byte-copies of sd pixels (no top-down source; placeholder
// test below names the sharing, removable when a true td source lands).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { loadPalette, getMappableColors } from './palette.mjs';
import { decodePngFile, quantizeAndMap, svgForSlot } from './import-prototype.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['fr', 'bk', 'lf', 'rt'];
const SOURCES = DIRS.flatMap((d) => [`amg1_${d}1.png`, `amg1_${d}2.png`]);
const guardian = JSON.parse(readFileSync(resolve(root, 'assets/guardian_001/asset.json'), 'utf8'));
const character = loadPalette(resolve(root, 'palettes/palette_character.v1.json'));
const map = JSON.parse(readFileSync(resolve(root, 'fixtures/guardian/guardian-map.json'), 'utf8'));

describe('A1 guardian fixtures (amg1 8 PNG + map)', () => {
  it('8 sources committed (32x32 RGBA) + map + 8 compares', () => {
    for (const f of SOURCES) {
      assert.ok(existsSync(resolve(root, 'fixtures/guardian', f)), `fixtures/guardian/${f} missing`);
    }
    assert.ok(existsSync(resolve(root, 'fixtures/guardian/guardian-map.json')), 'guardian-map.json missing');
    for (const f of SOURCES.map((s) => s.replace(/\.png$/i, '.compare.png'))) {
      assert.ok(existsSync(resolve(root, 'fixtures/guardian', f)), `fixtures/guardian/${f} missing`);
    }
  });

  it('sources decode 32x32; same-dir f1 != f2 (distinctness bar)', async () => {
    for (const d of DIRS) {
      const a = await decodePngFile(resolve(root, 'fixtures/guardian', `amg1_${d}1.png`));
      const b = await decodePngFile(resolve(root, 'fixtures/guardian', `amg1_${d}2.png`));
      assert.equal(a.width, 32);
      assert.equal(a.height, 32);
      assert.equal(b.width, 32);
      assert.equal(b.height, 32);
      assert.ok(!Buffer.from(a.data).equals(Buffer.from(b.data)), `${d}: f1 renders identical to f2`);
    }
  });

  it('map covers exactly the 40 frozen slots; reuse declaration matches bytes', () => {
    const clips = [];
    for (const [action, a] of Object.entries(guardian.actions)) {
      for (const p of guardian.perspectives) {
        for (const d of guardian.views) {
          for (const clip of a.clips[p][d]) clips.push({ file: clip.file, action, persp: p, dir: d });
        }
      }
    }
    assert.equal(clips.length, 40);
    assert.deepEqual(new Set(Object.keys(map.slots)).size, 40);
    for (const c of clips) assert.ok(c.file in map.slots, `map misses slot ${c.file}`);
    assert.deepEqual(map.reuse, { idle: ['f1'], walk: ['f1', 'f2'], attack: ['f2', 'f1'] });
    for (const c of clips) {
      const m = c.file.match(/_(idle|walk|attack)_([a-z]+)(\d+)\.svg$/);
      const [, action, dir, frame] = m;
      const want =
        action === 'idle'
          ? `amg1_${dir}1.png`
          : action === 'walk'
            ? `amg1_${dir}${frame}.png`
            : `amg1_${dir}${frame === '1' ? '2' : '1'}.png`;
      assert.equal(map.slots[c.file], want, `${c.file} must follow the reuse declaration`);
    }
  });
});

describe('A1 guardian landed slots (40 views + 2 masters)', () => {
  it('skeleton validates with 24 clips (frozen gate unchanged)', async () => {
    const { validateAsset } = await import('./asset-manifest.mjs');
    const r = validateAsset(guardian, { checkFiles: true, baseDir: resolve(root, 'assets/guardian_001') });
    assert.deepEqual(r.errors, [], r.errors.join('; '));
    assert.equal(r.ok, true);
  });

  // Placeholder (character-asset ADDED, removable): real-imported character
  // MAY fill td slots with sd-identical pixels while no td source exists.
  it('td shares sd pixels (placeholder, byte-identical, named)', () => {
    let n = 0;
    for (const f of Object.keys(map.slots)) {
      if (!f.startsWith('guardian_td_')) continue;
      const sd = f.replace('guardian_td_', 'guardian_sd_');
      const a = readFileSync(resolve(root, 'assets/guardian_001', f));
      const b = readFileSync(resolve(root, 'assets/guardian_001', sd));
      assert.ok(a.equals(b), `${f} must byte-equal ${sd} (td=sd placeholder)`);
      n++;
    }
    assert.equal(n, 20, '20 td views share sd bytes');
    for (const [td, sd] of [['master_td.svg', 'master_side.svg']]) {
      assert.ok(
        readFileSync(resolve(root, 'assets/guardian_001', td)).equals(
          readFileSync(resolve(root, 'assets/guardian_001', sd)),
        ),
        'masters share bytes too',
      );
    }
  });

  it('masters marked data-master; prompt_hash stays pending', () => {
    for (const m of ['master_td.svg', 'master_side.svg']) {
      const svg = readFileSync(resolve(root, 'assets/guardian_001', m), 'utf8');
      assert.ok(svg.includes('data-master="true"'), `${m} must be marked data-master`);
      assert.ok(svg.includes('<prompt_hash>pending</prompt_hash>'), `${m} keeps pending hash`);
    }
  });

  it('landed rects are palette-exact (character palette closed)', () => {
    const allowed = new Set(
      getMappableColors(character).map(
        (c) => `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`,
      ),
    );
    let n = 0;
    for (const f of ['guardian_sd_idle_fr0.svg', 'guardian_sd_walk_fr1.svg', 'guardian_sd_attack_fr1.svg']) {
      const svg = readFileSync(resolve(root, 'assets/guardian_001', f), 'utf8');
      for (const tag of svg.match(/<rect\b[^>]*>/g) ?? []) {
        const fill = tag.match(/fill="([^"]+)"/)[1].toLowerCase();
        assert.ok(allowed.has(fill), `${f}: fill must be palette-exact, got ${fill}`);
        n++;
      }
    }
    assert.ok(n > 100, `guardian views must carry real pixels, got ${n} rects`);
  });
});
