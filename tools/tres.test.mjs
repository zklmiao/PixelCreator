// tres.test.mjs — real-character-m3 wt-A (A2 verification).
// Godot 4 SpriteFrames text contract over shipped Full maps only.
// Recipe复核 (IMPORT-RECIPE.md §2–§3): names {persp}/{action}/{dir} (#15),
// row/dir fr/bk/lf/rt (#16, via maps), loop bool true→LOOP_FORWARD /
// false→LOOP_NONE (#17), speed=fps (§2.1, no speed_scale #18), regions
// map-exact (§1), texture_filter absent = project Nearest default (#13),
// Maker never enters (#21), no uid (rebuilt on import).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTresText, exportTres } from './tres.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['fr', 'bk', 'lf', 'rt'];

function animNames(text) {
  return [...text.matchAll(/"name": &"([^"]+)"/g)].map((m) => m[1]);
}

function animBlock(text, name) {
  const i = text.indexOf(`"name": &"${name}"`);
  assert.ok(i >= 0, `animation ${name} present`);
  const f = text.lastIndexOf('"frames": [', i);
  const start = text.lastIndexOf('{', f);
  const speedIdx = text.indexOf('"speed"', i);
  const end = text.indexOf('\n}', speedIdx) + 2;
  return text.slice(start, end);
}

describe('A2 tres golden (single animation, hand-written contract)', () => {
  // Independent basis: this whole string is written from the Godot 4
  // SpriteFrames text format (header/ext/atlas/animations shape), not from
  // implementation output — any builder drift (order, key, float shape) fails.
  const mini = {
    assetId: 'mini_001',
    sheets: [
      {
        png: 'mini_td_idle.png',
        map: {
          mode: 'full',
          perspective: 'td',
          action: 'idle',
          fps: 2,
          loop: true,
          frames: [
            { file: 'mini_td_idle_fr0.svg', dir: 'fr', frame: 0, col: 0, row: 0, x: 0, y: 0, w: 64, h: 64, kind: 'kept' },
          ],
        },
      },
    ],
  };
  const want =
    '[gd_resource type="SpriteFrames" load_steps=4 format=3]\n' +
    '\n' +
    '[ext_resource type="Texture2D" path="res://sheets/mini_td_idle.png" id="1"]\n' +
    '\n' +
    '[sub_resource type="AtlasTexture" id="AtlasTexture_1"]\n' +
    'atlas = ExtResource("1")\n' +
    'region = Rect2(0, 0, 64, 64)\n' +
    '\n' +
    '[sub_resource type="SpriteFrames" id="SpriteFrames_1"]\n' +
    'animations = [{\n' +
    '"frames": [{\n' +
    '"duration": 1.0,\n' +
    '"texture": SubResource("AtlasTexture_1")\n' +
    '}],\n' +
    '"loop": true,\n' +
    '"name": &"td/idle/fr",\n' +
    '"speed": 2.0\n' +
    '}]\n';
  it('minimal build matches the hand-written text byte-for-byte', () => {
    assert.equal(buildTresText(mini), want);
  });
});

describe('A2 knight tres (24 animations, Full only)', () => {
  const text = readFileSync(resolve(root, 'godot/knight_001.spriteframes.tres'), 'utf8');
  const maps = {};
  for (const p of ['td', 'sd']) {
    for (const a of ['idle', 'walk', 'attack']) {
      maps[`${p}/${a}`] = JSON.parse(readFileSync(resolve(root, 'sheets', `knight_${p}_${a}.png.map.json`), 'utf8'));
    }
  }

  it('24 animations named {persp}/{action}/{dir}', () => {
    const want = [];
    for (const p of ['td', 'sd']) for (const a of ['idle', 'walk', 'attack']) for (const d of DIRS) want.push(`${p}/${a}/${d}`);
    assert.deepEqual(animNames(text), want);
  });

  it('frame counts follow maps (idle 1 / walk 3 / attack 4 per dir)', () => {
    const counts = { idle: 1, walk: 3, attack: 4 };
    for (const p of ['td', 'sd']) {
      for (const a of ['idle', 'walk', 'attack']) {
        for (const d of DIRS) {
          const block = animBlock(text, `${p}/${a}/${d}`);
          assert.equal(block.split('"texture":').length - 1, counts[a], `${p}/${a}/${d} frame count`);
        }
      }
    }
  });

  it('speed=fps, loop bool matches map (recipe #17/#18)', () => {
    const speeds = { idle: '2.0', walk: '6.0', attack: '8.0' };
    const loops = { idle: 'true', walk: 'true', attack: 'false' };
    for (const p of ['td', 'sd']) {
      for (const a of ['idle', 'walk', 'attack']) {
        for (const d of DIRS) {
          const block = animBlock(text, `${p}/${a}/${d}`);
          assert.ok(block.includes(`"speed": ${speeds[a]}`), `${p}/${a}/${d} speed`);
          assert.ok(block.includes(`"loop": ${loops[a]}`), `${p}/${a}/${d} loop`);
          assert.equal(maps[`${p}/${a}`].fps, Number(speeds[a]), `map fps agrees for ${p}/${a}`);
        }
      }
    }
  });

  it('regions are map-exact (recipe §1)', () => {
    for (const region of text.match(/region = Rect2\((\d+), (\d+), (\d+), (\d+)\)/g) ?? []) {
      assert.match(region, /region = Rect2\(\d+, \d+, 64, 64\)/);
    }
    // Spot: first idle frame of each sheet lands at its map x/y.
    assert.ok(text.includes('region = Rect2(0, 0, 64, 64)'), 'td/idle/fr origin cell');
    assert.ok(text.includes('region = Rect2(192, 0, 64, 64)'), 'walk col-2 cell (192,0)');
    assert.ok(text.includes('region = Rect2(0, 192, 64, 64)'), 'row-3 rt cell (0,192)');
    const n = (text.match(/\[sub_resource type="AtlasTexture"/g) ?? []).length;
    assert.equal(n, 64, 'knight atlas frames = idle 8 + walk 24 + attack 32');
  });

  it('Full only: no Maker, no uid, no engine defaults in resource', () => {
    assert.ok(!text.includes('$'), 'Maker sheets must not enter');
    assert.ok(!text.includes('uid='), 'uid omitted (Godot rebuilds)');
    assert.ok(!text.includes('speed_scale'), 'speed_scale stays 1.0 default (recipe #18)');
    assert.ok(!text.includes('texture_filter'), 'filter is project default (recipe #13)');
    assert.ok(text.startsWith('[gd_resource type="SpriteFrames" load_steps=72 format=3]'), 'load_steps = 6 ext + 64 atlas + 2');
  });

  it('export is deterministic (rebuild byte-identical)', async () => {
    const before = readFileSync(resolve(root, 'godot/knight_001.spriteframes.tres'), 'utf8');
    await exportTres('knight_001', 'godot');
    const after = readFileSync(resolve(root, 'godot/knight_001.spriteframes.tres'), 'utf8');
    assert.equal(after, before);
  });
});

describe('A2 guardian tres (24 animations, 2-frame actions)', () => {
  const text = readFileSync(resolve(root, 'godot/guardian_001.spriteframes.tres'), 'utf8');

  it('24 animations; walk/attack carry 2 frames per dir', () => {
    assert.equal(animNames(text).length, 24);
    for (const p of ['td', 'sd']) {
      for (const d of DIRS) {
        assert.equal(animBlock(text, `${p}/walk/${d}`).split('"texture":').length - 1, 2);
        assert.equal(animBlock(text, `${p}/attack/${d}`).split('"texture":').length - 1, 2);
        assert.equal(animBlock(text, `${p}/idle/${d}`).split('"texture":').length - 1, 1);
      }
    }
  });

  it('speeds 2/6/8; attack loop false, idle/walk true', () => {
    assert.ok(animBlock(text, 'td/idle/fr').includes('"speed": 2.0'));
    assert.ok(animBlock(text, 'sd/walk/lf').includes('"speed": 6.0'));
    assert.ok(animBlock(text, 'td/attack/rt').includes('"speed": 8.0'));
    assert.ok(animBlock(text, 'td/attack/fr').includes('"loop": false'));
    assert.ok(animBlock(text, 'td/walk/fr').includes('"loop": true'));
    const n = (text.match(/\[sub_resource type="AtlasTexture"/g) ?? []).length;
    assert.equal(n, 40, 'guardian atlas frames = idle 8 + walk 16 + attack 16');
    assert.ok(text.startsWith('[gd_resource type="SpriteFrames" load_steps=48 format=3]'), 'load_steps = 6 ext + 40 atlas + 2');
  });
});
