// placeholder.test.mjs — 7.1 generic placeholder self-check (node --test).
// Reads engine-placeholder/generic/ landed files; missing dir/files throw
// naming the path (no skips). Read-only: never writes assets/sheets/web.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'engine-placeholder/generic');

const PNGS = [
  'knight_td_walk.png',
  'knight_sd_walk.png',
  'knight_td_attack.png',
  'knight_sd_attack.png',
  '$knight_td_walk.png',
  '$knight_sd_walk.png',
  '$knight_td_attack.png',
  '$knight_sd_attack.png',
];
const MAPS = PNGS.map((p) => `${p}.map.json`);
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngDims(buf) {
  assert.deepEqual(buf.subarray(0, 8), PNG_SIG, 'bad PNG signature');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function loadMap(name) {
  return JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
}

describe('7.1 generic placeholder ships 8 PNG + 8 maps', () => {
  it('placeholder dir with exact file set (no renames, no extras, $ kept)', () => {
    assert.ok(existsSync(dir), `missing placeholder dir: ${dir}`);
    const got = new Set(readdirSync(dir));
    const want = [...PNGS, ...MAPS, 'PLACEHOLDER.md'];
    for (const f of want) {
      assert.ok(got.has(f), `missing placeholder file: engine-placeholder/generic/${f}`);
    }
    const extra = [...got].filter((f) => !want.includes(f));
    assert.equal(got.size, want.length, `unexpected extra files: ${extra.join(', ')}`);
  });

  it('8 PNG signatures valid', () => {
    for (const p of PNGS) {
      const buf = readFileSync(resolve(dir, p));
      assert.deepEqual(buf.subarray(0, 8), PNG_SIG, `${p}: bad PNG signature`);
      assert.ok(buf.length > 1000, `${p}: suspiciously small (${buf.length}B)`);
    }
  });

  // Timing/geometry values frozen to assets/knight_001/asset.json ground truth
  // (walk 3f 6fps loop; attack 4f 8fps once -> idle). Asserting exact values —
  // not just types — so a dropped or corrupted `next` fails the suite.
  const WANT = {
    walk: { fps: 6, loop: true, next: null, frames: 3 },
    attack: { fps: 8, loop: false, next: 'idle', frames: 4 },
  };

  it('8 maps parse with exact sheet/fps/loop/next/size contract', () => {
    for (const m of MAPS) {
      const map = loadMap(m);
      const want = WANT[map.action];
      assert.ok(want, `${m}: unexpected action ${map.action}`);
      assert.equal(map.sheet + '.map.json', m, `${m}: sheet field must match file name`);
      assert.ok(['full', 'maker'].includes(map.mode), `${m}: bad mode`);
      assert.ok(['td', 'sd'].includes(map.perspective), `${m}: bad perspective`);
      assert.equal(map.fps, want.fps, `${m}: fps must match asset.json (${want.fps})`);
      assert.equal(map.loop, want.loop, `${m}: loop must match asset.json (${want.loop})`);
      assert.equal(map.next, want.next, `${m}: next must match asset.json (${JSON.stringify(want.next)})`);
      assert.equal(map.size, 64, `${m}: size must be 64 (anti-mixup)`);
      assert.equal(map.cell, 64, `${m}: cell must be 64 (anti-mixup)`);
      assert.ok(Array.isArray(map.frames) && map.frames.length > 0, `${m}: empty frames`);
      const fullCols = map.mode === 'full' ? want.frames : 3;
      assert.equal(map.frames.length, map.mode === 'full' ? want.frames * 4 : 12, `${m}: frame count`);
      assert.equal(map.cols, fullCols, `${m}: cols (maker forces 3)`);
      assert.ok(map.mapping && Array.isArray(map.mapping.kept), `${m}: missing mapping.kept disclosure`);
    }
  });

  it('generic/ is a byte-copy of sheets/ (all 16 PNG + map.json)', () => {
    const sheetsDir = resolve(root, 'sheets');
    assert.ok(existsSync(sheetsDir), 'missing sheets/ dir (export first: node tools/sheet.mjs export)');
    for (const f of [...PNGS, ...MAPS]) {
      const inGeneric = readFileSync(resolve(dir, f));
      const inSheets = readFileSync(resolve(sheetsDir, f));
      assert.ok(inGeneric.equals(inSheets), `engine-placeholder/generic/${f} drifted from sheets/${f}`);
    }
  });
});

describe('7.1 every map frame lands inside sheet geometry', () => {
  it('x/y/w/h within dims; col/row math consistent; rows fr/bk/lf/rt', () => {
    for (const m of MAPS) {
      const map = loadMap(m);
      const png = resolve(dir, map.sheet);
      const { w: sw, h: sh } = pngDims(readFileSync(png));
      assert.equal(sw, map.cols * map.cell, `${m}: width must be cols*cell`);
      assert.equal(sh, map.rows * map.cell, `${m}: height must be rows*cell`);
      assert.equal(map.rows, 4, `${m}: rows must be 4 (fr/bk/lf/rt)`);
      const firsts = map.frames.filter((f) => f.col === 0);
      assert.deepEqual(firsts.map((f) => f.dir), ['fr', 'bk', 'lf', 'rt'], `${m}: row order`);
      assert.deepEqual(firsts.map((f) => f.y), [0, 64, 128, 192], `${m}: row y`);
      for (const f of map.frames) {
        for (const k of ['x', 'y', 'w', 'h', 'col', 'row', 'frame']) {
          assert.ok(Number.isInteger(f[k]), `${m} ${f.file}: ${k} must be int`);
        }
        assert.equal(f.w, map.cell, `${m} ${f.file}: w`);
        assert.equal(f.h, map.cell, `${m} ${f.file}: h`);
        assert.equal(f.x, f.col * map.cell, `${m} ${f.file}: x=col*cell`);
        assert.equal(f.y, f.row * map.cell, `${m} ${f.file}: y=row*cell`);
        assert.ok(f.x + f.w <= sw && f.y + f.h <= sh, `${m} ${f.file}: rect outside sheet`);
      }
    }
  });

  it('geometry spot checks: walk 192x256, attack-full 256x256, maker 192x256', () => {
    const geo = (p) => {
      const { w, h } = pngDims(readFileSync(resolve(dir, p)));
      return `${w}x${h}`;
    };
    assert.equal(geo('knight_td_walk.png'), '192x256');
    assert.equal(geo('knight_sd_walk.png'), '192x256');
    assert.equal(geo('knight_td_attack.png'), '256x256');
    assert.equal(geo('knight_sd_attack.png'), '256x256');
    for (const p of PNGS.filter((x) => x.startsWith('$'))) assert.equal(geo(p), '192x256', `${p}: maker forced 3 cols`);
  });

  it('td/sd never merged: one perspective per map and sheet', () => {
    for (const m of MAPS) {
      const map = loadMap(m);
      const want = map.perspective === 'td' ? '_td_' : '_sd_';
      const other = map.perspective === 'td' ? '_sd_' : '_td_';
      assert.ok(map.sheet.includes(want), `${m}: sheet must carry ${want}`);
      assert.ok(!map.sheet.includes(other), `${m}: sheet must not carry ${other}`);
      for (const f of map.frames) {
        assert.ok(f.file.includes(want), `${m} ${f.file}: frame must belong to ${map.perspective}`);
      }
    }
  });
});
