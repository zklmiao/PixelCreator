// clips.test.mjs — 5.1 verification: fps/loop/next + attack-to-idle (node --test).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clipFrames, nextFrame } from './clips.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const asset = JSON.parse(readFileSync(resolve(root, 'assets/knight_001/asset.json'), 'utf8'));

describe('5.1 fps conversion', () => {
  it('walk 6fps = 166.67ms per frame', () => {
    const frames = clipFrames(asset, 'td', 'walk', 'fr');
    assert.equal(frames.length, 3);
    for (const f of frames) {
      assert.ok(Math.abs(f.durationMs - 1000 / 6) < 0.01, `walk duration ${f.durationMs}`);
      assert.equal(f.durationMs.toFixed(2), '166.67');
    }
  });

  it('attack 8fps = 125ms per frame', () => {
    const frames = clipFrames(asset, 'td', 'attack', 'fr');
    assert.equal(frames.length, 4);
    for (const f of frames) {
      assert.equal(f.durationMs, 125);
    }
  });

  it('clipFrames returns file+durationMs per asset.json', () => {
    const idle = clipFrames(asset, 'sd', 'idle', 'bk');
    assert.equal(idle.length, 1);
    assert.equal(idle[0].file, 'knight_sd_idle_bk0.svg');
    assert.equal(idle[0].durationMs, 1000 / 2);
  });
});

describe('5.1 walk/idle loop wrap', () => {
  it('walk last frame wraps to index 0 of the same clip', () => {
    const frames = clipFrames(asset, 'td', 'walk', 'fr');
    const nxt = nextFrame({ asset, persp: 'td', action: 'walk', dir: 'fr', index: 2 });
    assert.equal(nxt.action, 'walk');
    assert.equal(nxt.persp, 'td');
    assert.equal(nxt.dir, 'fr');
    assert.equal(nxt.index, 0);
    assert.equal(nxt.file, frames[0].file);
    assert.equal(nxt.durationMs, frames[0].durationMs);
  });

  it('walk mid-clip advances by one', () => {
    const frames = clipFrames(asset, 'sd', 'walk', 'lf');
    const nxt = nextFrame({ asset, persp: 'sd', action: 'walk', dir: 'lf', index: 0 });
    assert.equal(nxt.index, 1);
    assert.equal(nxt.file, frames[1].file);
  });

  it('single-frame idle loops on itself', () => {
    const frames = clipFrames(asset, 'td', 'idle', 'rt');
    const nxt = nextFrame({ asset, persp: 'td', action: 'idle', dir: 'rt', index: 0 });
    assert.equal(nxt.action, 'idle');
    assert.equal(nxt.index, 0);
    assert.equal(nxt.file, frames[0].file);
  });
});

describe('5.1 attack plays once then falls back to same-direction idle', () => {
  it('attack mid-clip stays in attack', () => {
    const nxt = nextFrame({ asset, persp: 'td', action: 'attack', dir: 'lf', index: 1 });
    assert.equal(nxt.action, 'attack');
    assert.equal(nxt.persp, 'td');
    assert.equal(nxt.dir, 'lf');
    assert.equal(nxt.index, 2);
  });

  it('attack last frame returns to same persp+dir idle frame 0 (td/lf)', () => {
    const idle = clipFrames(asset, 'td', 'idle', 'lf');
    const nxt = nextFrame({ asset, persp: 'td', action: 'attack', dir: 'lf', index: 3 });
    assert.equal(nxt.action, 'idle');
    assert.equal(nxt.persp, 'td');
    assert.equal(nxt.dir, 'lf');
    assert.equal(nxt.index, 0);
    assert.equal(nxt.file, idle[0].file);
    assert.equal(nxt.durationMs, idle[0].durationMs);
  });

  it('attack last frame returns to same persp+dir idle frame 0 (sd/rt)', () => {
    const idle = clipFrames(asset, 'sd', 'idle', 'rt');
    const nxt = nextFrame({ asset, persp: 'sd', action: 'attack', dir: 'rt', index: 3 });
    assert.equal(nxt.action, 'idle');
    assert.equal(nxt.persp, 'sd');
    assert.equal(nxt.dir, 'rt');
    assert.equal(nxt.index, 0);
    assert.equal(nxt.file, idle[0].file);
  });
});

describe('5.1 missing cells throw strictly naming the clip', () => {
  it('absent clip throws missing clip with persp/action/dir', () => {
    const broken = structuredClone(asset);
    delete broken.actions.walk.clips.sd.rt;
    assert.throws(() => clipFrames(broken, 'sd', 'walk', 'rt'), /missing clip: sd\/walk\/rt/);
    assert.throws(
      () => nextFrame({ asset: broken, persp: 'sd', action: 'walk', dir: 'rt', index: 0 }),
      /missing clip: sd\/walk\/rt/,
    );
  });

  it('frame-count mismatch throws missing clip (no fallback)', () => {
    const broken = structuredClone(asset);
    broken.actions.attack.clips.td.fr.pop();
    assert.throws(() => clipFrames(broken, 'td', 'attack', 'fr'), /missing clip: td\/attack\/fr/);
  });

  it('absent action throws missing clip', () => {
    const broken = structuredClone(asset);
    delete broken.actions.attack;
    assert.throws(() => clipFrames(broken, 'td', 'attack', 'fr'), /missing clip: td\/attack\/fr/);
  });
});
