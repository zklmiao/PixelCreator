// quantize-upscale.test.mjs — 2.3 verification (node --test).
// Display integer upscale + dither switch + walk no-shimmer proof.
// Reuses quantize.mjs (geometry/display) and palette.mjs (mapping/gating).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { upscaleNearest, quantizeGeometry } from './quantize.mjs';
import { loadPalette, getMappableColors, mapFrameToPalette } from './palette.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kinds = ['character', 'weapon', 'building', 'prop', 'scenery'];
const palettes = Object.fromEntries(
  kinds.map((k) => [k, loadPalette(resolve(root, `palettes/palette_${k}.v1.json`))]),
);

function px(r, g, b, a = 255) {
  return [r, g, b, a];
}

describe('2.3 integer upscale display (smoothing off)', () => {
  it('replicates each pixel into a crisp factor×factor block', () => {
    const src = new Uint8ClampedArray([...px(10, 20, 30), ...px(40, 50, 60), ...px(70, 80, 90), ...px(0, 0, 0, 0)]);
    const { data, width, height } = upscaleNearest(src, 2, 2, 2);
    assert.equal(width, 4);
    assert.equal(height, 4);
    assert.equal(data.length, 64);
    // Top-left block is src(0,0); top-right block is src(1,0).
    assert.deepEqual([...data.slice(0, 4)], [10, 20, 30, 255]);
    assert.deepEqual([...data.slice(8, 12)], [40, 50, 60, 255]);
    // Second row of blocks repeats the first (nearest, no blend).
    assert.deepEqual([...data.slice(16, 20)], [10, 20, 30, 255]);
    // Transparent source pixel stays a transparent block.
    assert.deepEqual([...data.slice(56, 60)], [0, 0, 0, 0]);
  });

  it('factor 1 is identity; factor 3 scales dims', () => {
    const src = new Uint8ClampedArray([...px(1, 2, 3), ...px(4, 5, 6)]);
    const one = upscaleNearest(src, 2, 1, 1);
    assert.deepEqual(one.data, src);
    assert.equal(one.width, 2);
    const three = upscaleNearest(src, 2, 1, 3);
    assert.equal(three.width, 6);
    assert.equal(three.height, 3);
  });

  it('rejects non positive-integer factors', () => {
    const src = new Uint8ClampedArray(px(1, 2, 3, 255));
    for (const bad of [0, -1, 1.5, NaN, '2', null, undefined]) {
      assert.throws(() => upscaleNearest(src, 1, 1, bad));
    }
  });

  it('upscale is deterministic and preserves palette-exact bytes', () => {
    const frame = new Uint8ClampedArray([0xc2, 0x32, 0x2a, 255, 0xbe, 0x2e, 0x26, 255]);
    const mapped = mapFrameToPalette(frame, 2, 1, palettes.character);
    const a = upscaleNearest(mapped.data, 2, 1, 4);
    const b = upscaleNearest(mapped.data, 2, 1, 4);
    assert.deepEqual(a.data, b.data);
    assert.equal(a.width, 8);
    // Every block holds exact palette bytes (tunic-red #C03028).
    assert.deepEqual([...a.data.slice(0, 4)], [0xc0, 0x30, 0x28, 255]);
  });
});

describe('2.3 dither switch lock', () => {
  it('character rejects any non-none dither', () => {
    const frame = new Uint8ClampedArray(px(122, 199, 79));
    assert.throws(() => mapFrameToPalette(frame, 1, 1, palettes.character, { dither: 'ordered-bayer' }));
    assert.throws(() => mapFrameToPalette(frame, 1, 1, palettes.character, { dither: 'error-diffusion' }));
    assert.throws(() => mapFrameToPalette(frame, 1, 1, palettes.character, { dither: 'floyd-steinberg' }));
  });

  it('default dither is none everywhere (characters flicker-free by default)', () => {
    for (const k of kinds) {
      assert.equal(palettes[k].dither.default, 'none');
    }
  });
});

describe('2.3 walk mapping palette discipline', () => {
  // Synthetic 3-frame walk: 8x8, mid-stride bar shifts 1px per frame.
  function walkFrame(shift) {
    const buf = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const i = (y * 8 + x) * 4;
        const leg = x === 2 + shift || x === 5 - shift;
        const r = leg ? 0xc0 : 0xff;
        const g = leg ? 0x30 : 0xd9;
        const b = leg ? 0x28 : 0xb3;
        buf[i] = r;
        buf[i + 1] = g;
        buf[i + 2] = b;
        buf[i + 3] = y === 0 || y === 7 ? 0 : 255; // transparent letterbox rows
      }
    }
    return buf;
  }

  it('mapped walk frames hold only palette bytes or transparent', () => {
    const allowed = new Set(getMappableColors(palettes.character).map((c) => `${c.r},${c.g},${c.b}`));
    for (let f = 0; f < 3; f++) {
      const { data } = mapFrameToPalette(walkFrame(f), 8, 8, palettes.character);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) {
          assert.deepEqual([data[i], data[i + 1], data[i + 2]], [0, 0, 0]);
        } else {
          assert.equal(data[i + 3], 255);
          assert.ok(allowed.has(`${data[i]},${data[i + 1]},${data[i + 2]}`));
        }
      }
    }
  });
});
