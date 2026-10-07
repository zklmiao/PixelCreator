// tier-128.test.mjs — real-character-m3 wt-A (A3 verification).
// building/scenery run the 128 tier (house_001/tree_001 size fields, frozen);
// weapon/prop/character stay capped at 64 (static-kinds.test.mjs pins both).
// synth motifs are size-parameterized: 128 output is the same motif code at
// 128 grid, verified here for geometry + determinism + palette closure.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, getMappableColors, mapFrameToPalette } from './palette.mjs';
import { quantizeGeometry } from './quantize.mjs';
import { pixelsToSvg, synthHousePixels, synthTreePixels } from './vectorize.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CASES = [
  { id: 'house_001', kind: 'building', palFile: 'palettes/palette_building.v1.json', prefix: 'house' },
  { id: 'tree_001', kind: 'scenery', palFile: 'palettes/palette_scenery.v1.json', prefix: 'tree' },
];
const MOTIFS = { building: synthHousePixels, scenery: synthTreePixels };

function loadAsset(id) {
  return JSON.parse(readFileSync(resolve(root, 'assets', id, 'asset.json'), 'utf8'));
}

describe('A3 128 tier (house/tree)', () => {
  it('size fields read 128 (frozen asset.json)', () => {
    for (const c of CASES) {
      assert.equal(loadAsset(c.id).size, 128, `${c.id} size tier`);
    }
  });

  it('landed views + masters carry 128 geometry', () => {
    for (const c of CASES) {
      const asset = loadAsset(c.id);
      for (const p of ['td', 'sd']) {
        for (const d of ['fr', 'bk', 'lf', 'rt']) {
          const fp = resolve(root, 'assets', c.id, `${c.prefix}_${p}_idle_${d}0.svg`);
          assert.ok(existsSync(fp), `${fp} must exist (regen at 128)`);
          const svg = readFileSync(fp, 'utf8');
          assert.ok(svg.includes('viewBox="0 0 128 128"'), `${fp} viewBox`);
          assert.ok(svg.includes('data-size="128"'), `${fp} data-size`);
        }
        const mfp = resolve(root, 'assets', c.id, asset.masters[p]);
        assert.ok(readFileSync(mfp, 'utf8').includes('viewBox="0 0 128 128"'), `${c.id} master_${p} viewBox`);
      }
    }
  });

  it('128 motif pipeline reruns byte-identical with palette-exact fills', () => {
    for (const c of CASES) {
      const palette = loadPalette(resolve(root, c.palFile));
      const mappable = getMappableColors(palette);
      const run = () => {
        const synth = MOTIFS[c.kind]({ perspective: 'td', dir: 'fr', frameNum: 0, mappable, size: 128 });
        const geo = quantizeGeometry(synth.data, synth.width, synth.height, 128, { kind: c.kind });
        const mapped = mapFrameToPalette(geo.data, geo.width, geo.height, palette);
        return pixelsToSvg(mapped.data, geo.width, geo.height, {
          asset: `test_${c.kind}`,
          perspective: 'td',
          action: 'idle',
          dir: 'fr',
          frame: 0,
          size: 128,
          palette,
          seed: 2002,
          prompt_hash: 'pending-test',
          source: `synthetic:test:td/idle/fr/0`,
          names: mapped.names,
        });
      };
      const a = run();
      assert.equal(a, run());
      assert.ok(a.includes('viewBox="0 0 128 128"'));
      const allowed = new Set(
        mappable.map((m) => `#${m.r.toString(16).padStart(2, '0')}${m.g.toString(16).padStart(2, '0')}${m.b.toString(16).padStart(2, '0')}`),
      );
      let n = 0;
      for (const tag of a.match(/<rect\b[^>]*>/g) ?? []) {
        const fill = tag.match(/fill="([^"]+)"/)[1].toLowerCase();
        assert.ok(allowed.has(fill), `${c.id}: fill must be palette-exact, got ${fill}`);
        n++;
      }
      // Basis: 128 grid holds 4x the 64-grid cells; the motifs occupy
      // thousands of rects at 128 (house ~1.8k, tree ~3.1k landed), so a
      // motif collapse would fall far below this bar.
      assert.ok(n > 1000, `${c.id}: 128 motif must occupy real pixels, got ${n} rects`);
    }
  });
});
