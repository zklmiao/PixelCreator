// sheet.test.mjs — 6.1/6.2 verification: one action one sheet + Maker/Full (node --test).
// Pixel source for every frame comes from svgToPixels (3.3); no second parser.
// Read-only: never writes SVGs, asset.json or web/.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHEET_DIRS,
  MAKER_COLS,
  buildSheet,
  encodePng,
  loadActionFrames,
  sheetFileName,
} from './sheet.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = resolve(root, 'assets/knight_001');
const asset = JSON.parse(readFileSync(resolve(assetDir, 'asset.json'), 'utf8'));

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function cellOf(rgba, sheetW, col, row, cell = 64) {
  const out = new Uint8ClampedArray(cell * cell * 4);
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const si = ((row * cell + y) * sheetW + (col * cell + x)) * 4;
      const di = (y * cell + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return out;
}

describe('6.1 one action one sheet + map.json', () => {
  it('64px walk Full sheet is 192x256 with rows fr/bk/lf/rt', async () => {
    const frames = await loadActionFrames(assetDir, asset, 'td', 'walk', 'full');
    const { rgba, w, h, map } = buildSheet(asset, { perspective: 'td', action: 'walk', mode: 'full', frames });
    assert.equal(w, 3 * 64);
    assert.equal(h, 4 * 64);
    assert.equal(map.cols, 3);
    assert.equal(map.rows, 4);
    assert.equal(map.sheet, 'knight_td_walk.png');
    const firsts = map.frames.filter((f) => f.col === 0);
    assert.deepEqual(firsts.map((f) => f.dir), ['fr', 'bk', 'lf', 'rt']);
    assert.deepEqual(firsts.map((f) => f.y), [0, 64, 128, 192]);
    // Pixel content: cell(col1,row2) must equal decoded lf fr2 bytes.
    const lf2 = frames.find((f) => f.file === 'knight_td_walk_lf2.svg');
    assert.deepEqual(cellOf(rgba, w, 1, 2), lf2.data);
    const fr1 = frames.find((f) => f.file === 'knight_td_walk_fr1.svg');
    assert.deepEqual(cellOf(rgba, w, 0, 0), fr1.data);
  });

  it('map.json carries fps/loop/next and attack→idle rebuilds', async () => {
    const atk = await loadActionFrames(assetDir, asset, 'td', 'attack', 'full');
    const am = buildSheet(asset, { perspective: 'td', action: 'attack', mode: 'full', frames: atk }).map;
    assert.equal(am.cols, 4);
    assert.equal(am.fps, 8);
    assert.equal(am.loop, false);
    assert.equal(am.next, 'idle', 'attack→idle transition must rebuild from map.json');
    assert.ok(asset.actions.idle, 'idle target of next must exist in asset.json');
    for (const f of am.frames) {
      for (const k of ['x', 'y', 'w', 'h', 'col', 'row', 'frame']) assert.ok(Number.isInteger(f[k]), `${f.file}: ${k} int`);
      assert.equal(f.w, 64);
      assert.equal(f.h, 64);
    }
    const wlk = await loadActionFrames(assetDir, asset, 'sd', 'walk', 'full');
    const wm = buildSheet(asset, { perspective: 'sd', action: 'walk', mode: 'full', frames: wlk }).map;
    assert.equal(wm.loop, true);
    assert.equal(wm.next, null);
    assert.equal(wm.fps, 6);
  });
});

describe('6.2 Maker mode + disclosure', () => {
  it('Maker attack truncates 4 frames to 3 cols with named disclosure', async () => {
    const frames = await loadActionFrames(assetDir, asset, 'td', 'attack', 'maker');
    const { w, h, map } = buildSheet(asset, { perspective: 'td', action: 'attack', mode: 'maker', frames });
    assert.equal(w, 192);
    assert.equal(h, 256);
    assert.equal(map.sheet, '$knight_td_attack.png');
    assert.ok(map.sheet.startsWith('$'), 'Maker sheet uses $-prefixed naming');
    assert.equal(map.mapping.kept.length, 12, '4 dirs x 3 cols placed');
    assert.deepEqual(
      map.mapping.dropped.map((d) => d.file).sort(),
      [
        'knight_td_attack_fr4.svg',
        'knight_td_attack_bk4.svg',
        'knight_td_attack_lf4.svg',
        'knight_td_attack_rt4.svg',
      ].sort(),
      'truncated fr4 of every dir must be named in the disclosure',
    );
    assert.deepEqual(map.mapping.padded, [], 'attack needs no idle pads');
    // Last kept col per dir is f3, never f4.
    for (const d of SHEET_DIRS) {
      const col2 = map.frames.find((f) => f.dir === d && f.col === 2);
      assert.ok(col2.file.endsWith(`${d}3.svg`), `${d}: col2 must be f3, got ${col2.file}`);
    }
  });

  it('Maker idle pads short clips with same-dir idle frames (named)', async () => {
    const frames = await loadActionFrames(assetDir, asset, 'sd', 'idle', 'maker');
    const { w, h, map } = buildSheet(asset, { perspective: 'sd', action: 'idle', mode: 'maker', frames });
    assert.equal(w, 192);
    assert.equal(h, 256);
    assert.equal(map.mapping.kept.length, 4, 'one native idle frame per dir');
    assert.equal(map.mapping.padded.length, 8, 'two idle pads per dir');
    for (const p of map.mapping.padded) {
      assert.ok([1, 2].includes(p.col));
      assert.ok(SHEET_DIRS.includes(p.dir));
      assert.ok(p.file.includes(`idle_${p.dir}0.svg`), `pad must name its idle source, got ${p.file}`);
    }
    assert.deepEqual(map.mapping.dropped, []);
  });

  it('td/sd are never merged into one sheet', async () => {
    const frames = await loadActionFrames(assetDir, asset, 'td', 'walk', 'full');
    for (const bad of [['td', 'sd'], 'td,sd', 'td+sd', '', null, undefined]) {
      assert.throws(
        () => buildSheet(asset, { perspective: bad, action: 'walk', mode: 'full', frames }),
        /永不合表/,
        `perspective=${JSON.stringify(bad)} must throw`,
      );
    }
  });

  it('PNG bytes carry a valid signature and matching IHDR geometry', async () => {
    const frames = await loadActionFrames(assetDir, asset, 'td', 'walk', 'full');
    const { rgba, w, h } = buildSheet(asset, { perspective: 'td', action: 'walk', mode: 'full', frames });
    const a = encodePng(rgba, w, h);
    const b = encodePng(rgba, w, h);
    assert.deepEqual(a, b, 'same pixels must encode byte-identical');
    assert.ok(a.subarray(0, 8).equals(PNG_SIG), 'must start with the PNG signature');
    assert.equal(a.readUInt32BE(16), w, 'IHDR width must match sheet geometry');
    assert.equal(a.readUInt32BE(20), h, 'IHDR height must match sheet geometry');
    assert.equal(w, 192);
    assert.equal(h, 256);
  });
});
