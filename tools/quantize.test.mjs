// quantize.test.mjs — 2.1 verification: tiers + square pad + alpha<128 (node --test).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_TIERS,
  computeFit,
  downscaleBox,
  applyAlphaThreshold,
  padToSquare,
  quantizeGeometry,
} from './quantize.mjs';

function solid(w, h, r, g, b, a) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
  return buf;
}

describe('2.1 tiers and square pad', () => {
  it('spec scenario: 512x384 prototype -> 64x64 centered with transparent pad', () => {
    const { data, width, height } = quantizeGeometry(solid(512, 384, 200, 48, 40, 255), 512, 384, 64, {
      kind: 'other',
    });
    assert.equal(width, 64);
    assert.equal(height, 64);
    assert.equal(data.length, 64 * 64 * 4);
    const { dstH } = computeFit(512, 384, 64);
    assert.ok(dstH < 64);
    // Top pad row fully transparent.
    for (let x = 0; x < 64; x++) assert.equal(data[(0 * 64 + x) * 4 + 3], 0);
    // Center is content.
    assert.equal(data[(32 * 64 + 32) * 4 + 3], 255);
  });

  it('portrait source also yields equal square', () => {
    const { data, width, height } = quantizeGeometry(solid(384, 512, 40, 90, 160, 255), 384, 512, 64, {
      kind: 'other',
    });
    assert.equal(width, 64);
    assert.equal(height, 64);
    assert.equal(data.length, 64 * 64 * 4);
    // Left pad column transparent, center opaque.
    assert.equal(data[(32 * 64 + 0) * 4 + 3], 0);
    assert.equal(data[(32 * 64 + 32) * 4 + 3], 255);
  });

  it('all tiers output equal squares; character rejects 128', () => {
    for (const s of SUPPORTED_TIERS) {
      const r = quantizeGeometry(solid(100, 60, 10, 20, 30, 255), 100, 60, s, { kind: 'other' });
      assert.equal(r.width, s);
      assert.equal(r.height, s);
    }
    assert.throws(() => quantizeGeometry(solid(8, 8, 1, 2, 3, 255), 8, 8, 128, { kind: 'character' }));
  });

  it('alpha<128 discarded before pad', () => {
    const buf = solid(4, 4, 200, 50, 50, 255);
    buf[3] = 100; // feathered corner
    buf[7] = 127;
    buf[11] = 128; // boundary keeps
    applyAlphaThreshold(buf, 128);
    assert.equal(buf[3], 0);
    assert.equal(buf[7], 0);
    assert.equal(buf[11], 128);
    const q = quantizeGeometry(solid(16, 16, 0, 0, 0, 0), 16, 16, 32, { kind: 'other' });
    assert.ok(q.data.every((v, i) => (i % 4 === 3 ? v === 0 : true)));
  });

  it('downscale + pad round-trip keeps dims deterministic', () => {
    const a = quantizeGeometry(solid(512, 384, 1, 2, 3, 255), 512, 384, 64, { kind: 'other' });
    const b = quantizeGeometry(solid(512, 384, 1, 2, 3, 255), 512, 384, 64, { kind: 'other' });
    assert.deepEqual(a.data, b.data);
    const small = downscaleBox(solid(4, 4, 10, 20, 30, 255), 4, 4, 2, 2);
    assert.equal(small.length, 16);
    const padded = padToSquare(small, 2, 2, 4, 1, 1);
    assert.equal(padded.length, 64);
  });
});
