// sheet-static.test.mjs — real-import-mvp wt-A (A3 verification).
// Static single-frame export: one PNG per perspective (4 cols x 1 row,
// cell = asset.size, column order fr/bk/lf/rt) + full-mode map.json
// (x/y/w/h, fps 2, loop true). Knight dual-mode path (buildSheet) untouched.
// Reads landed potion SVGs/sheets read-only (run import + export first).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { loadPalette, getMappableColors } from './palette.mjs';
import {
  SHEET_DIRS,
  buildSheet,
  buildStaticSheet,
  encodePng,
  loadActionFrames,
} from './sheet.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const potionDir = resolve(root, 'assets/potion_001');
const potion = JSON.parse(readFileSync(resolve(potionDir, 'asset.json'), 'utf8'));
const knightDir = resolve(root, 'assets/knight_001');
const knight = JSON.parse(readFileSync(resolve(knightDir, 'asset.json'), 'utf8'));

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function cellOf(rgba, sheetW, col, cell = 64) {
  const out = new Uint8ClampedArray(cell * cell * 4);
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const si = (y * sheetW + (col * cell + x)) * 4;
      const di = (y * cell + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return out;
}

describe('A3 static single-frame export (potion 64px)', () => {
  // Ground truth basis: frozen potion asset (prep) is prop/64, idle-only,
  // idle fps 2 loop true, perspectives [td, sd], views fr/bk/lf/rt.
  it('each perspective PNG is 256x64, 4 cols x 1 row, fr/bk/lf/rt order', async () => {
    for (const p of ['td', 'sd']) {
      const frames = await loadActionFrames(potionDir, potion, p, 'idle', 'full');
      assert.equal(frames.length, 4);
      const { rgba, w, h, map } = buildStaticSheet(potion, { perspective: p, frames });
      assert.equal(w, 4 * 64);
      assert.equal(h, 64);
      assert.equal(map.cols, 4);
      assert.equal(map.rows, 1);
      assert.equal(map.sheet, `potion_${p}_idle.png`);
      assert.equal(map.mode, 'full');
      assert.deepEqual(map.frames.map((f) => f.dir), ['fr', 'bk', 'lf', 'rt']);
      assert.deepEqual(map.frames.map((f) => f.x), [0, 64, 128, 192]);
      assert.ok(map.frames.every((f) => f.y === 0 && f.row === 0 && f.w === 64 && f.h === 64));
      // Cell bytes equal the decoded slot SVGs (no resampling in packing).
      const fr = frames.find((f) => f.file === `potion_${p}_idle_fr0.svg`);
      assert.deepEqual(cellOf(rgba, w, 0), fr.data);
      const rt = frames.find((f) => f.file === `potion_${p}_idle_rt0.svg`);
      assert.deepEqual(cellOf(rgba, w, 3), rt.data);
    }
  });

  it('map carries x/y/w/h + fps 2 / loop true / next null', async () => {
    const frames = await loadActionFrames(potionDir, potion, 'td', 'idle', 'full');
    const { map } = buildStaticSheet(potion, { perspective: 'td', frames });
    assert.equal(map.action, 'idle');
    assert.equal(map.fps, 2);
    assert.equal(map.loop, true);
    assert.equal(map.next, null);
    assert.equal(map.size, 64);
    assert.equal(map.cell, 64);
    assert.deepEqual(map.mapping.dropped, []);
    assert.deepEqual(map.mapping.padded, []);
    assert.equal(map.mapping.kept.length, 4);
    for (const f of map.frames) {
      for (const k of ['x', 'y', 'w', 'h', 'col', 'row', 'frame']) {
        assert.ok(Number.isInteger(f[k]), `${f.file}: ${k} int`);
      }
      assert.equal(f.x, f.col * 64);
    }
  });

  it('exported sheets hold only palette-exact bytes or transparent', () => {
    const prop = loadPalette(resolve(root, 'palettes/palette_prop.v1.json'));
    const allowed = new Set(getMappableColors(prop).map((c) => `${c.r},${c.g},${c.b}`));
    for (const p of ['td', 'sd']) {
      const buf = readFileSync(resolve(root, 'sheets', `potion_${p}_idle.png`));
      assert.deepEqual(buf.subarray(0, 8), PNG_SIG, `potion_${p}_idle.png: bad signature`);
      const png = PNG.sync.read(buf);
      assert.equal(png.width, 256);
      assert.equal(png.height, 64);
      let opaque = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] === 0) continue;
        assert.equal(png.data[i + 3], 255);
        assert.ok(allowed.has(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`));
        opaque++;
      }
      assert.ok(opaque > 0, `${p}: sheet must carry opaque pixels`);
    }
  });

  it('no Maker sheets for static singles (full-only)', () => {
    const got = new Set(readdirSync(resolve(root, 'sheets')));
    assert.ok(![...got].some((f) => f.startsWith('$potion')), 'static singles must not ship Maker mode');
    assert.ok(got.has('potion_td_idle.png') && got.has('potion_sd_idle.png'));
  });

  it('static sheet build is deterministic', async () => {
    const frames = await loadActionFrames(potionDir, potion, 'td', 'idle', 'full');
    const a = buildStaticSheet(potion, { perspective: 'td', frames });
    const b = buildStaticSheet(potion, { perspective: 'td', frames });
    assert.deepEqual(a.rgba, b.rgba);
    assert.deepEqual(encodePng(a.rgba, a.w, a.h), encodePng(b.rgba, b.w, b.h));
  });

  it('knight dual-mode path unchanged (walk full still 192x256)', async () => {
    const frames = await loadActionFrames(knightDir, knight, 'td', 'walk', 'full');
    const { w, h, map } = buildSheet(knight, { perspective: 'td', action: 'walk', mode: 'full', frames });
    assert.equal(w, 192);
    assert.equal(h, 256);
    assert.equal(map.sheet, 'knight_td_walk.png');
  });

  it('td/sd never merged for static singles', async () => {
    const frames = await loadActionFrames(potionDir, potion, 'td', 'idle', 'full');
    for (const bad of [['td', 'sd'], 'td,sd', '', null, undefined]) {
      assert.throws(() => buildStaticSheet(potion, { perspective: bad, frames }), /永不合表/);
    }
  });
});
