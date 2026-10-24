// palette-map.test.mjs — 2.2 verification: Euclidean mapping + OKLCH hook (node --test).
// Reuses getMappableColors/nearestColor from palette.mjs; no parallel pipeline.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadPalette,
  getMappableColors,
  euclideanDistance,
  oklchDistance,
  srgbToOklch,
  nearestColor,
  mapFrameToPalette,
} from './palette.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const character = loadPalette(resolve(root, 'palettes/palette_character.v1.json'));
const scenery = loadPalette(resolve(root, 'palettes/palette_scenery.v1.json'));

describe('2.2 euclidean mapping to kind palette', () => {
  it('front/back similar cloak reds converge to one entry', () => {
    const mappable = getMappableColors(character);
    const frame = new Uint8ClampedArray([0xc2, 0x32, 0x2a, 255, 0xbe, 0x2e, 0x26, 255]);
    const { data, names } = mapFrameToPalette(frame, 2, 1, character);
    assert.equal(names[0], names[1]);
    assert.equal(names[0], 'tunic-red');
    // Mapped pixels are exact palette bytes, opaque.
    const hit = mappable.find((c) => c.name === names[0]);
    assert.deepEqual([...data.slice(0, 4)], [hit.r, hit.g, hit.b, 255]);
    assert.deepEqual([...data.slice(4, 8)], [hit.r, hit.g, hit.b, 255]);
  });

  it('alpha<128 discarded before mapping; output never transparent-mapped', () => {
    const frame = new Uint8ClampedArray([0xc2, 0x32, 0x2a, 100, 0xc2, 0x32, 0x2a, 255]);
    const { data, names } = mapFrameToPalette(frame, 2, 1, character);
    assert.equal(names[0], null);
    assert.deepEqual([...data.slice(0, 4)], [0, 0, 0, 0]);
    assert.equal(names[1], 'tunic-red');
  });
});

describe('2.2 OKLCH replacement hook', () => {
  it('oklch hook is a swappable colorDistance with same nearestColor signature', () => {
    const mappable = getMappableColors(character);
    const e = nearestColor(0xc2, 0x32, 0x2a, mappable, euclideanDistance);
    const p = nearestColor(0xc2, 0x32, 0x2a, mappable, oklchDistance);
    assert.ok(e?.name);
    assert.ok(p?.name);
    // Near-identical reds agree under both metrics.
    const e2 = nearestColor(0xbe, 0x2e, 0x26, mappable, euclideanDistance);
    const p2 = nearestColor(0xbe, 0x2e, 0x26, mappable, oklchDistance);
    assert.equal(e.name, e2.name);
    assert.equal(p.name, p2.name);
  });

  it('srgbToOklch is sane (white L~1/C~0, red C>0)', () => {
    const w = srgbToOklch(255, 255, 255);
    const r = srgbToOklch(192, 48, 40);
    assert.ok(w.L > 0.9 && w.C < 0.02);
    assert.ok(r.C > 0.05);
  });

  it('mapFrameToPalette accepts injected oklchDistance without pipeline change', () => {
    const frame = new Uint8ClampedArray([0xc2, 0x32, 0x2a, 255, 0xbe, 0x2e, 0x26, 255]);
    const { names } = mapFrameToPalette(frame, 2, 1, character, { colorDistance: oklchDistance });
    assert.equal(names[0], names[1]);
  });
});

describe('2.2 dither gating', () => {
  it('character locks to none; scenery/building allow ordered-bayer; error-diffusion never', () => {
    const frame = new Uint8ClampedArray([122, 199, 79, 255, 122, 199, 79, 255]);
    assert.throws(() => mapFrameToPalette(frame, 2, 1, character, { dither: 'ordered-bayer' }));
    const ok = mapFrameToPalette(frame, 2, 1, scenery, { dither: 'ordered-bayer' });
    assert.equal(ok.names.length, 2);
    assert.throws(() => mapFrameToPalette(frame, 2, 1, scenery, { dither: 'error-diffusion' }));
  });
});
