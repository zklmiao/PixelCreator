// roundtrip.test.mjs — 3.3 verification: export→re-import zero loss (node --test).
// Export = assets/knight_001/*.svg on disk; re-import = svgToPixels +
// pixelsToSvg reusing decoded meta; loss = byte mismatch vs the file.
// Read-only: never writes SVGs or asset.json. Zero new dependencies.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette } from './palette.mjs';
import {
  SEMANTIC_GROUPS,
  pixelsToSvg,
  parseSvgGroups,
  svgToPixels,
  roundTripAsset,
  knightRelabel,
} from './vectorize.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = resolve(root, 'assets/knight_001');
const asset = JSON.parse(readFileSync(resolve(assetDir, 'asset.json'), 'utf8'));
const character = loadPalette(resolve(root, 'palettes/palette_character.v1.json'));

function clipFiles() {
  const out = [];
  for (const act of Object.keys(asset.actions)) {
    for (const p of asset.perspectives) {
      for (const d of asset.views) {
        for (const clip of asset.actions[act].clips[p][d]) out.push(clip.file);
      }
    }
  }
  return out;
}

function readSvg(file) {
  return readFileSync(resolve(assetDir, file), 'utf8');
}

// Re-emit exactly the way roundTripAsset does (decoded meta + same knightRelabel).
function remit(original, file) {
  const parsed = svgToPixels(original, file);
  const { data, w, h, names, meta } = parsed;
  return pixelsToSvg(data, w, h, {
    asset: meta.asset,
    perspective: meta.perspective,
    action: meta.action,
    dir: meta.dir,
    frame: meta.frame,
    size: Number(meta.size) || w,
    palette: character,
    seed: meta.seed,
    prompt_hash: meta.prompt_hash,
    denoise: meta.denoise,
    source: meta.source,
    names,
    master: meta.master,
    relabel: (x, y, n) => knightRelabel(x, y, n, { size: w, action: meta.action, perspective: meta.perspective }),
  });
}

function rectSet(svg) {
  const out = [];
  for (const tag of svg.match(/<rect\b[^>]*>/g) ?? []) {
    const x = tag.match(/\bx="(\d+)"/)?.[1];
    const y = tag.match(/\by="(\d+)"/)?.[1];
    const fill = tag.match(/\bfill="([^"]+)"/)?.[1].toLowerCase();
    out.push(`${x},${y},${fill}`);
  }
  return out.sort();
}

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('3.3 export→re-import roundtrip', () => {
  it('64 views roundtrip byte-identical', () => {
    const files = clipFiles();
    assert.equal(files.length, 64, 'idle8+walk24+attack32 = 64 views');
    for (const f of files) {
      const original = readSvg(f);
      assert.equal(remit(original, f), original, `${f} must survive svgToPixels→pixelsToSvg`);
    }
  });

  it('2 masters roundtrip byte-identical (data-master kept)', () => {
    const masters = Object.values(asset.masters);
    assert.equal(masters.length, 2);
    for (const f of masters) {
      const original = readSvg(f);
      assert.ok(original.includes('data-master="true"'), `${f} must be marked data-master`);
      assert.equal(remit(original, f), original, `${f} must survive roundtrip`);
    }
  });

  it('layers and metadata preserved through decode', () => {
    const file = 'knight_td_walk_fr2.svg';
    const clip = asset.actions.walk.clips.td.fr[1];
    assert.equal(clip.file, file);
    const original = readSvg(file);
    const { names, meta, w, h } = svgToPixels(original, file);
    assert.deepEqual(parseSvgGroups(original).map((g) => g.part), SEMANTIC_GROUPS);
    assert.equal(w, 64);
    assert.equal(h, 64);
    assert.equal(meta.asset, 'knight_001');
    assert.equal(meta.palette, asset.palette);
    assert.equal(meta.seed, String(clip.seed));
    assert.equal(meta.prompt_hash, clip.prompt_hash);
    assert.equal(meta.source, `synthetic:knight_001:td/walk/fr/2`);
    const opaque = names.filter((n) => n !== null).length;
    assert.equal(opaque, (original.match(/<rect\b/g) ?? []).length);
    const groups = parseSvgGroups(original);
    assert.ok(groups.find((g) => g.part === 'body').colors.length > 0);
    assert.deepEqual(groups.find((g) => g.part === 'weapon-slot').colors, []);
  });

  it('illegal SVGs throw naming the file', () => {
    const flat = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><g id="color-c03028"><rect x="0" y="0" width="1" height="1" fill="#c03028"/></g></svg>';
    assert.throws(() => svgToPixels(flat, 'bad-flat.svg'), /bad-flat\.svg.*data-part|data-part.*bad-flat\.svg/);
    const good = readSvg('knight_td_idle_fr0.svg');
    const badBox = good.replace('viewBox="0 0 64 64"', 'viewBox="0 0 wide tall"');
    assert.throws(() => svgToPixels(badBox, 'bad-viewbox.svg'), /bad-viewbox\.svg/);
    // Idle keeps weapon-slot empty, so the ghost lands in a part that parses
    // but must be rejected as an empty color group (empty PART layers stay legal).
    const ghost = good.replace(
      '<g data-part="weapon-slot"></g>',
      '<g data-part="weapon-slot"><g data-color="ghost" fill="#ffffff"></g></g>',
    );
    assert.ok(ghost !== good, 'ghost fixture must differ from the original');
    assert.throws(() => svgToPixels(ghost, 'empty-color.svg'), /empty-color\.svg/);
    const empty = pixelsToSvg(new Uint8ClampedArray(2 * 2 * 4), 2, 2, {
      asset: 'knight_001',
      perspective: 'td',
      action: 'idle',
      dir: 'fr',
      frame: 0,
      size: 2,
      palette: character,
      seed: 1234,
      prompt_hash: 'td-idle-fr',
      denoise: 0.55,
      source: 'test:empty',
    });
    assert.throws(() => svgToPixels(empty, 'empty.svg'), /empty\.svg.*no rects|no rects.*empty\.svg/);
  });

  it('tampered rect breaks roundtrip against the original (comparator is live)', () => {
    const file = 'knight_td_idle_fr0.svg';
    const original = readSvg(file);
    const tampered = original.replace('x="25" y="53"', 'x="0" y="0"');
    assert.notEqual(tampered, original, 'tamper must change the string');
    const remade = remit(tampered, file); // parses fine: still well-formed
    assert.notDeepEqual(rectSet(remade), rectSet(original), 'tampered pixels must differ from original');
    assert.notEqual(remade, original, 'roundtrip(tampered) must NOT equal the original');
    assert.deepEqual(rectSet(remade), rectSet(tampered), 're-emit must faithfully carry the tampered pixels');
  });

  it('roundTripAsset reports 64 views + 2 masters all ok', async () => {
    const r = await roundTripAsset(assetDir);
    assert.equal(r.views, 64);
    assert.equal(r.masters, 2);
    assert.deepEqual(r.failures, []);
    assert.equal(r.ok, true);
  });

  it('roundTripAsset leaves all 66 files untouched (read-only)', async () => {
    const files = [...clipFiles(), ...Object.values(asset.masters)];
    const before = new Map(files.map((f) => [f, sha256(readSvg(f))]));
    const r = await roundTripAsset(assetDir);
    assert.equal(r.ok, true);
    for (const f of files) {
      assert.equal(sha256(readSvg(f)), before.get(f), `${f} must be unmodified`);
    }
  });
});
