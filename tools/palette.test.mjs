// palette.test.mjs — 1.2 verification: hex parsing + transparent exclusion (node --test).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseHex,
  loadPalette,
  validatePalette,
  getMappableColors,
  euclideanDistance,
  nearestColor,
  mapFrameToPalette,
} from './palette.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'palettes/palette_character.v1.json',
  'palettes/palette_weapon.v1.json',
  'palettes/palette_building.v1.json',
  'palettes/palette_prop.v1.json',
  'palettes/palette_scenery.v1.json',
];

describe('1.2 palettes exist and validate', () => {
  for (const f of files) {
    it(f, () => {
      assert.ok(existsSync(resolve(root, f)), `${f} missing`);
      const p = loadPalette(resolve(root, f));
      const r = validatePalette(p);
      assert.deepEqual(r.errors, [], `${f}: ${r.errors.join('; ')}`);
      assert.ok(r.ok);
    });
  }
});

describe('hex parsing', () => {
  it('parses #RGB/#RRGGBB/#RRGGBBAA', () => {
    assert.deepEqual(parseHex('#fff'), { r: 255, g: 255, b: 255, a: 255 });
    assert.deepEqual(parseHex('#C03028'), { r: 192, g: 48, b: 40, a: 255 });
    assert.deepEqual(parseHex('#00000000'), { r: 0, g: 0, b: 0, a: 0 });
  });
  it('rejects bad values', () => {
    assert.throws(() => parseHex('red'));
    assert.throws(() => parseHex('#12345'));
    assert.throws(() => parseHex('#GGGGGG'));
    assert.throws(() => parseHex(123));
  });
});

describe('transparent placeholder exclusion', () => {
  it('transparent never in mappable set; sub-threshold alpha maps to transparent', () => {
    const p = loadPalette(resolve(root, 'palettes/palette_character.v1.json'));
    const mappable = getMappableColors(p);
    const tp = parseHex(p.transparent);
    assert.equal(tp.a, 0);
    assert.equal(
      mappable.find((c) => c.r === tp.r && c.g === tp.g && c.b === tp.b && c.a === tp.a),
      undefined,
    );
    // Feathered-edge rule via the real pipeline: alpha < 128 is discarded
    // BEFORE mapping (same code path as production, not a re-implementation).
    const frame = new Uint8ClampedArray([192, 48, 40, 100, 192, 48, 40, 255]);
    const { data, names } = mapFrameToPalette(frame, 2, 1, p);
    assert.equal(names[0], null);
    assert.deepEqual([...data.slice(0, 4)], [0, 0, 0, 0]);
    assert.equal(names[1], 'tunic-red');
    assert.deepEqual([...data.slice(4, 8)], [192, 48, 40, 255]);
    const opaque = { r: 200, g: 50, b: 42, a: 255 };
    const hit = nearestColor(opaque.r, opaque.g, opaque.b, mappable, euclideanDistance);
    assert.equal(hit.name, 'tunic-red');
  });

  it('similar cloak reds converge to one entry (2.2 cross-view premise)', () => {
    const p = loadPalette(resolve(root, 'palettes/palette_character.v1.json'));
    const mappable = getMappableColors(p);
    const front = nearestColor(0xc2, 0x32, 0x2a, mappable);
    const back = nearestColor(0xbe, 0x2e, 0x26, mappable);
    assert.equal(front.name, back.name);
  });

  it('character keeps dense 4-step skin ramp; dither policy holds', () => {
    const c = loadPalette(resolve(root, 'palettes/palette_character.v1.json'));
    assert.ok(c.colors.filter((x) => (x.role ?? '').startsWith('skin')).length >= 4);
    assert.deepEqual(c.dither, { default: 'none', allowed: ['none'] });
    const b = loadPalette(resolve(root, 'palettes/palette_building.v1.json'));
    assert.ok(b.dither.allowed.includes('ordered-bayer'));
    const s = loadPalette(resolve(root, 'palettes/palette_scenery.v1.json'));
    assert.ok(s.dither.allowed.includes('ordered-bayer'));
    for (const f of files) {
      const p = loadPalette(resolve(root, f));
      assert.ok(!p.dither.allowed.includes('error-diffusion'));
    }
  });
});
