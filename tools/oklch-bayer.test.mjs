// oklch-bayer.test.mjs — r2 A1/A2 proof: OKLCH default + Bayer harmless (node --test).
// Value assertions only (exact names / byte equality / throw contracts).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadPalette,
  getMappableColors,
  euclideanDistance,
  oklchDistance,
  nearestColor,
  mapFrameToPalette,
} from './palette.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mappableOf = (palette, name) => getMappableColors(palette).find((c) => c.name === name);

const character = loadPalette(resolve(root, 'palettes/palette_character.v1.json'));
const weapon = loadPalette(resolve(root, 'palettes/palette_weapon.v1.json'));
const building = loadPalette(resolve(root, 'palettes/palette_building.v1.json'));
const prop = loadPalette(resolve(root, 'palettes/palette_prop.v1.json'));
const scenery = loadPalette(resolve(root, 'palettes/palette_scenery.v1.json'));

describe('r2 A1 OKLCH default distance', () => {
  // Independent basis for the pinned names below (not recorded from output):
  // target (0,23,174) is a saturated dark blue (OKLCH L=0.355 C=0.225).
  // Euclidean RGB: d->steel-dark(86,94,108)=129.59 < d->eye(35,35,43)=136.12,
  //   so legacy metric picks steel-dark (closest in raw RGB).
  // OKLCH: d->eye=23.46 < d->steel-dark=23.60 (lightness 0.260 vs 0.480;
  //   hue-aware term favors the dark neutral), so perceptual metric picks eye.
  // Default MUST follow the perceptual answer (eye).
  it('default follows OKLCH on discriminating blue (0,23,174 -> eye, not steel-dark)', () => {
    const mappable = getMappableColors(character);
    const eu = nearestColor(0, 23, 174, mappable, euclideanDistance);
    const ok = nearestColor(0, 23, 174, mappable, oklchDistance);
    const def = nearestColor(0, 23, 174, mappable);
    assert.equal(eu.name, 'steel-dark');
    assert.equal(ok.name, 'eye');
    assert.equal(def.name, 'eye');
    assert.notEqual(def.name, eu.name);
    const frame = new Uint8ClampedArray([0, 23, 174, 255]);
    const a = mapFrameToPalette(frame, 1, 1, character);
    const b = mapFrameToPalette(frame, 1, 1, character, { colorDistance: euclideanDistance });
    const c = mapFrameToPalette(frame, 1, 1, character, { colorDistance: oklchDistance });
    assert.deepEqual(a.names, ['eye']);
    assert.deepEqual(b.names, ['steel-dark']);
    assert.deepEqual(c.names, ['eye']);
    assert.deepEqual(a.names, c.names);
    assert.deepEqual(a.data, c.data);
  });

  // Spec scenario: front/back similar cloak reds converge under OKLCH default.
  // Property assertion (equality + match with explicit oklch injection);
  // the pinned 'tunic-red' below is justified independently: both probes are
  // within ±4 of tunic-red #C03028 (192,48,40) and map-selfcheck reports
  // euclidean=tunic-red, oklch=tunic-red convergence on the same probes.
  it('front/back cloak reds converge under OKLCH default', () => {
    const frame = new Uint8ClampedArray([0xc2, 0x32, 0x2a, 255, 0xbe, 0x2e, 0x26, 255]);
    const def = mapFrameToPalette(frame, 2, 1, character);
    const inj = mapFrameToPalette(frame, 2, 1, character, { colorDistance: oklchDistance });
    assert.equal(def.names[0], def.names[1]);
    assert.deepEqual(def.names, inj.names);
    assert.deepEqual(def.data, inj.data);
    assert.deepEqual(def.names, ['tunic-red', 'tunic-red']);
  });

  it('euclidean comparator retained via explicit injection', () => {
    const frame = new Uint8ClampedArray([0xc2, 0x32, 0x2a, 255]);
    const r = mapFrameToPalette(frame, 1, 1, character, { colorDistance: euclideanDistance });
    assert.deepEqual(r.names, ['tunic-red']);
  });

  // Exact palette hits have distance zero under ANY metric, so the default
  // must return the hit itself. This is why palette.test.mjs:68-69
  // (192,48,40 -> tunic-red) still holds after the OKLCH switch.
  it('exact palette hits map to themselves under default (metric-independent)', () => {
    const mappable = getMappableColors(character);
    const byName = new Map(mappable.map((c) => [c.name, c]));
    for (const name of ['tunic-red', 'skin-1', 'steel-light', 'gold']) {
      const c = byName.get(name);
      const frame = new Uint8ClampedArray([c.r, c.g, c.b, 255]);
      const r = mapFrameToPalette(frame, 1, 1, character);
      assert.deepEqual(r.names, [name]);
      assert.deepEqual([...r.data], [c.r, c.g, c.b, 255]);
    }
  });
});

describe('r2 A2 Bayer harmless proof', () => {
  // All inputs below are exact palette RGB hits (distance zero), so 'none'
  // MUST return each input's own name; the proof is that 'ordered-bayer'
  // returns byte-identical data+names thanks to the in-palette fast path.
  // Covers: high-chroma ramp (grass-light/water-light), close RGB pair that
  // flipped pre-fix (earth-dark 90,58,34 vs trunk 94,58,34), transparent edge.
  it('scenery in-palette frame: bayer === none byte-for-byte, deterministic', () => {
    const order = [
      'grass-light',
      'grass-mid',
      'grass-dark',
      'earth',
      'earth-dark',
      'trunk',
      'water-light',
      'water-dark',
    ];
    const byName = new Map(getMappableColors(scenery).map((c) => [c.name, c]));
    const w = 4;
    const h = 3;
    const frame = new Uint8ClampedArray(w * h * 4);
    const wantNames = [];
    order.forEach((name, k) => {
      const c = byName.get(name);
      const x = k % w;
      const y = Math.floor(k / w);
      const i = (y * w + x) * 4;
      frame[i] = c.r;
      frame[i + 1] = c.g;
      frame[i + 2] = c.b;
      frame[i + 3] = 255;
      wantNames[y * w + x] = name;
    });
    // Transparent edge: last row fully transparent + one feathered pixel.
    for (let x = 0; x < w; x++) {
      const i = (2 * w + x) * 4;
      frame[i] = 0;
      frame[i + 1] = 0;
      frame[i + 2] = 0;
      frame[i + 3] = x === 0 ? 100 : 0;
      wantNames[2 * w + x] = null;
    }
    const none = mapFrameToPalette(frame, w, h, scenery, { dither: 'none' });
    const bayer = mapFrameToPalette(frame, w, h, scenery, { dither: 'ordered-bayer' });
    const bayer2 = mapFrameToPalette(frame, w, h, scenery, { dither: 'ordered-bayer' });
    assert.deepEqual(none.names, wantNames);
    assert.deepEqual(bayer.names, wantNames);
    assert.deepEqual(bayer.data, none.data);
    assert.deepEqual(bayer.names, none.names);
    assert.deepEqual(bayer2.data, bayer.data);
    assert.deepEqual(bayer2.names, bayer.names);
    // Transparent pixels stay transparent bytes.
    for (let x = 0; x < w; x++) {
      const i = (2 * w + x) * 4;
      assert.deepEqual([...bayer.data.slice(i, i + 4)], [0, 0, 0, 0]);
    }
  });

  // Building close pair pre-fix: door (58,42,28) flipped to beam-dark under
  // offset (door diff=3 pre-fix). High-chroma: roof-red, window-lit, moss.
  it('building in-palette frame: bayer === none byte-for-byte, deterministic', () => {
    const order = ['stone-light', 'plaster', 'beam', 'beam-dark', 'roof-red', 'door', 'window-lit', 'moss'];
    const byName = new Map(getMappableColors(building).map((c) => [c.name, c]));
    const w = 4;
    const h = 3;
    const frame = new Uint8ClampedArray(w * h * 4);
    const wantNames = [];
    order.forEach((name, k) => {
      const c = byName.get(name);
      const x = k % w;
      const y = Math.floor(k / w);
      const i = (y * w + x) * 4;
      frame[i] = c.r;
      frame[i + 1] = c.g;
      frame[i + 2] = c.b;
      frame[i + 3] = 255;
      wantNames[y * w + x] = name;
    });
    for (let x = 0; x < w; x++) {
      const i = (2 * w + x) * 4;
      frame[i] = 0;
      frame[i + 1] = 0;
      frame[i + 2] = 0;
      frame[i + 3] = 0;
      wantNames[2 * w + x] = null;
    }
    const none = mapFrameToPalette(frame, w, h, building, { dither: 'none' });
    const bayer = mapFrameToPalette(frame, w, h, building, { dither: 'ordered-bayer' });
    const bayer2 = mapFrameToPalette(frame, w, h, building, { dither: 'ordered-bayer' });
    assert.deepEqual(none.names, wantNames);
    assert.deepEqual(bayer.names, wantNames);
    assert.deepEqual(bayer.data, none.data);
    assert.deepEqual(bayer2.data, bayer.data);
    assert.deepEqual(bayer2.names, bayer.names);
  });

  it('character/weapon/prop reject ordered-bayer with an error', () => {
    const frame = new Uint8ClampedArray([122, 199, 79, 255]);
    assert.throws(() => mapFrameToPalette(frame, 1, 1, character, { dither: 'ordered-bayer' }));
    assert.throws(() => mapFrameToPalette(frame, 1, 1, weapon, { dither: 'ordered-bayer' }));
    assert.throws(() => mapFrameToPalette(frame, 1, 1, prop, { dither: 'ordered-bayer' }));
  });

  it('error-diffusion never ships for any kind', () => {
    const frame = new Uint8ClampedArray([122, 199, 79, 255]);
    for (const [k, p] of Object.entries({ character, weapon, building, prop, scenery })) {
      assert.throws(() => mapFrameToPalette(frame, 1, 1, p, { dither: 'error-diffusion' }), k);
    }
  });
});


// r6 debt: ordered-Bayer must actually dither OFF-palette inputs. The
// harmless-proof suite above pins in-palette identity; this pins the opposite
// direction — an off-palette ramp midpoint flips nearest entry under the
// ±6 channel swing, so a 8x1 constant band breaks into BOTH entries.
// Probe basis (arithmetic, recorded in comment): water-light (106,200,232)
// vs water-dark (42,106,168); midpoint (74,153,200): offset -6 -> water-dark,
// 0/+6 -> water-light under OKLCH.
describe('r6 Bayer actually dithers off-palette input', () => {
  const light = mappableOf(scenery, 'water-light');
  const dark = mappableOf(scenery, 'water-dark');
  const mid = new Uint8ClampedArray(8 * 4);
  for (let i = 0; i < 8; i++) {
    mid[i * 4] = Math.round((light.r + dark.r) / 2);
    mid[i * 4 + 1] = Math.round((light.g + dark.g) / 2);
    mid[i * 4 + 2] = Math.round((light.b + dark.b) / 2);
    mid[i * 4 + 3] = 255;
  }
  it('none collapses the off-palette band to a single entry; bayer breaks it into both', () => {
    const none = mapFrameToPalette(mid, 8, 1, scenery, { dither: 'none' });
    const uniqNone = [...new Set(none.names)];
    assert.equal(uniqNone.length, 1, `none must be blocky, got ${uniqNone.join(',')}`);
    const bayer = mapFrameToPalette(mid, 8, 1, scenery, { dither: 'ordered-bayer' });
    const uniqBayer = [...new Set(bayer.names)];
    assert.equal(uniqBayer.length, 2, `bayer must mix both entries, got ${uniqBayer.join(',')}`);
    assert.ok(uniqBayer.includes('water-light') && uniqBayer.includes('water-dark'));
    assert.ok(!Buffer.from(none.data).equals(Buffer.from(bayer.data)), 'bayer bytes must differ from none');
  });
});
