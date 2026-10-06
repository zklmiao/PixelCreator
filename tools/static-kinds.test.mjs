// static-kinds.test.mjs — static-kinds-godot-adapter wt-A (A1/A2 verification).
// A1: kind-aware validateAsset gates per frozen assets/asset.schema.json.
// A2: per-kind static synth distinctness + determinism + 32-SVG disk inventory.
// Old suites untouched; this file only ADDS contract-value assertions.
// Pure ESM, zero new dependencies; reads asset.json/palettes/SVGs read-only.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAsset } from './asset-manifest.mjs';
import { loadPalette, getMappableColors, mapFrameToPalette } from './palette.mjs';
import { quantizeGeometry } from './quantize.mjs';
import {
  SEMANTIC_GROUPS,
  pixelsToSvg,
  parseSvgGroups,
  synthStaticPixels,
  synthSwordPixels,
  synthHousePixels,
  synthCratePixels,
  synthTreePixels,
} from './vectorize.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loadAsset = (id) => JSON.parse(readFileSync(resolve(root, 'assets', id, 'asset.json'), 'utf8'));

const STATIC_IDS = ['sword_001', 'house_001', 'crate_001', 'tree_001'];
const STATIC_KINDS = { sword_001: 'weapon', house_001: 'building', crate_001: 'prop', tree_001: 'scenery' };
const STATIC_PALETTES = {
  sword_001: 'palette_weapon@v1',
  house_001: 'palette_building@v1',
  crate_001: 'palette_prop@v1',
  tree_001: 'palette_scenery@v1',
};
const SYNTHS = { weapon: synthSwordPixels, building: synthHousePixels, prop: synthCratePixels, scenery: synthTreePixels };
const PALETTE_FILES = {
  weapon: 'palettes/palette_weapon.v1.json',
  building: 'palettes/palette_building.v1.json',
  prop: 'palettes/palette_prop.v1.json',
  scenery: 'palettes/palette_scenery.v1.json',
};

function rectSet(svg) {
  const out = [];
  for (const tag of svg.match(/<rect\b[^>]*>/g) ?? []) {
    const x = tag.match(/x="(\d+)"/)?.[1];
    const y = tag.match(/y="(\d+)"/)?.[1];
    const fill = tag.match(/fill="([^"]+)"/)?.[1];
    out.push(`${x},${y},${(fill ?? '').toLowerCase()}`);
  }
  return out.sort();
}

function staticPipelineSvg(kind, perspective, dir) {
  const palette = loadPalette(resolve(root, PALETTE_FILES[kind]));
  const mappable = getMappableColors(palette);
  const size = 64;
  const synth = synthStaticPixels({ kind, perspective, dir, frameNum: 0, mappable, size });
  const geo = quantizeGeometry(synth.data, synth.width, synth.height, size, { kind });
  const mapped = mapFrameToPalette(geo.data, geo.width, geo.height, palette);
  return pixelsToSvg(mapped.data, geo.width, geo.height, {
    asset: `test_${kind}`,
    perspective,
    action: 'idle',
    dir,
    frame: 0,
    size,
    palette,
    seed: 2001,
    prompt_hash: 'pending-test',
    source: `synthetic:test:${perspective}/idle/${dir}/0`,
    names: mapped.names,
  });
}

describe('A1 kind-aware manifest gates', () => {
  it('character gate unchanged: knight_001 validates with 24-clip matrix', () => {
    const knight = loadAsset('knight_001');
    const r = validateAsset(knight);
    assert.equal(r.ok, true, `knight must stay green: ${r.errors.join('; ')}`);
    assert.deepEqual(r.errors, []);
    assert.equal(knight.actions.idle.frames, 1);
    assert.equal(knight.actions.walk.frames, 3);
    assert.equal(knight.actions.attack.frames, 4);
    assert.equal(knight.palette, 'palette_character@v1');
    assert.equal(knight.size, 64);
  });

  it('four static skeletons validate idle-only (8 clips each, no disk needed)', () => {
    for (const id of STATIC_IDS) {
      const asset = loadAsset(id);
      const r = validateAsset(asset);
      assert.equal(r.ok, true, `${id} must validate: ${r.errors.join('; ')}`);
      assert.equal(asset.kind, STATIC_KINDS[id]);
      assert.equal(asset.palette, STATIC_PALETTES[id]);
      assert.equal(asset.size, 64);
      assert.equal(asset.actions.idle.frames, 1);
      assert.equal(asset.actions.idle.fps, 2);
      assert.equal(asset.actions.idle.loop, true);
      assert.ok(!('walk' in asset.actions), `${id} must carry no walk`);
      assert.ok(!('attack' in asset.actions), `${id} must carry no attack`);
    }
  });

  it('wrong palette rejected naming the kind mismatch', () => {
    const sword = loadAsset('sword_001');
    const crossKind = structuredClone(sword);
    crossKind.palette = 'palette_character@v1';
    const r1 = validateAsset(crossKind);
    assert.equal(r1.ok, false);
    assert.match(r1.errors.join('; '), /palette_weapon@vN.*weapon|weapon.*palette/i);
    const otherStatic = structuredClone(sword);
    otherStatic.palette = 'palette_prop@v1';
    const r2 = validateAsset(otherStatic);
    assert.equal(r2.ok, false, 'weapon must reject prop palette (exact-kind match)');
    assert.match(r2.errors.join('; '), /palette_weapon@vN/);
  });

  it('sizes gated per kind: weapon/prop/character cap at 64, building/scenery allow 128', () => {
    const sword = loadAsset('sword_001');
    const big = structuredClone(sword);
    big.size = 128;
    const rb = validateAsset(big);
    assert.equal(rb.ok, false, 'weapon must reject 128');
    assert.match(rb.errors.join('; '), /size must be one of 32,48,64 for kind "weapon"/);
    const crate = loadAsset('crate_001');
    const bigProp = structuredClone(crate);
    bigProp.size = 128;
    assert.equal(validateAsset(bigProp).ok, false, 'prop must reject 128');
    const knight = loadAsset('knight_001');
    const bigKnight = structuredClone(knight);
    bigKnight.size = 128;
    assert.equal(validateAsset(bigKnight).ok, false, 'character must reject 128');
    const house = loadAsset('house_001');
    const bigHouse = structuredClone(house);
    bigHouse.size = 128;
    assert.equal(validateAsset(bigHouse).ok, true, 'building must allow 128');
    const tree = loadAsset('tree_001');
    const bigTree = structuredClone(tree);
    bigTree.size = 128;
    assert.equal(validateAsset(bigTree).ok, true, 'scenery must allow 128');
  });

  it('static kinds reject walk and attack actions by name', () => {
    const sword = loadAsset('sword_001');
    const prefix = sword.asset;
    const makeClips = (action) => {
      const clips = { td: {}, sd: {} };
      for (const p of ['td', 'sd']) {
        for (const d of ['fr', 'bk', 'lf', 'rt']) {
          clips[p][d] = [1, 2].map((n) => ({ file: `${prefix}_${p}_${action}_${d}${n}.svg`, seed: 2001, prompt_hash: 'pending-x' }));
        }
      }
      return clips;
    };
    const withWalk = structuredClone(sword);
    withWalk.actions.walk = { frames: 2, fps: 6, loop: true, clips: makeClips('walk') };
    const rw = validateAsset(withWalk);
    assert.equal(rw.ok, false, 'static with walk must fail');
    assert.match(rw.errors.join('; '), /must not define action "walk"/);
    const withAttack = structuredClone(sword);
    withAttack.actions.attack = { frames: 2, fps: 8, loop: false, next: 'idle', clips: makeClips('attack') };
    const ra = validateAsset(withAttack);
    assert.equal(ra.ok, false, 'static with attack must fail');
    assert.match(ra.errors.join('; '), /must not define action "attack"/);
  });

  it('out-of-bounds file naming rejected (wrong prefix / wrong action tag)', () => {
    const sword = loadAsset('sword_001');
    const badPrefix = structuredClone(sword);
    badPrefix.actions.idle.clips.td.fr[0].file = 'knight_td_idle_fr0.svg';
    const r1 = validateAsset(badPrefix);
    assert.equal(r1.ok, false);
    assert.match(r1.errors.join('; '), /does not belong to sword td\/idle\/fr/);
    const badTag = structuredClone(sword);
    badTag.actions.idle.clips.sd.lf[0].file = 'sword_sd_walk_lf0.svg';
    const r2 = validateAsset(badTag);
    assert.equal(r2.ok, false, 'idle clip pointing at a walk file must fail');
    assert.match(r2.errors.join('; '), /does not belong to sword sd\/idle\/lf/);
  });

  it('static preview must stay idle; asset.json carries zero #hex literals', () => {
    const sword = loadAsset('sword_001');
    const badPreview = structuredClone(sword);
    badPreview.preview.action = 'walk';
    assert.equal(validateAsset(badPreview).ok, false, 'static preview walk must fail');
    for (const id of [...STATIC_IDS, 'knight_001']) {
      const text = readFileSync(resolve(root, 'assets', id, 'asset.json'), 'utf8');
      assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(text), `${id} asset.json must carry no #hex (palette ref only)`);
    }
  });
});

describe('A2 static synth distinctness (8 cells pairwise distinct per asset)', () => {
  for (const [kind, palFile] of Object.entries(PALETTE_FILES)) {
    it(`${kind}: td/sd x fr/bk/lf/rt all 8 cells pairwise distinct`, () => {
      const palette = loadPalette(resolve(root, palFile));
      const mappable = getMappableColors(palette);
      const fn = SYNTHS[kind];
      const seen = new Map();
      for (const persp of ['td', 'sd']) {
        for (const dir of ['fr', 'bk', 'lf', 'rt']) {
          const { data } = fn({ perspective: persp, dir, frameNum: 0, mappable, size: 64 });
          const key = Buffer.from(data).toString('base64');
          for (const [other, otherKey] of seen) {
            assert.notEqual(key, otherKey, `${kind} ${persp}/${dir} renders identical to ${other}`);
          }
          seen.set(`${persp}/${dir}`, key);
        }
      }
      assert.equal(seen.size, 8, `${kind}: expected 8 distinct cells`);
    });
  }

  it('dispatcher routes kinds and rejects unknown kind', () => {
    const palette = loadPalette(resolve(root, PALETTE_FILES.weapon));
    const mappable = getMappableColors(palette);
    const a = synthStaticPixels({ kind: 'weapon', perspective: 'td', dir: 'fr', frameNum: 0, mappable, size: 64 });
    const b = synthSwordPixels({ perspective: 'td', dir: 'fr', frameNum: 0, mappable, size: 64 });
    assert.deepEqual(Buffer.from(a.data), Buffer.from(b.data), 'dispatcher must match per-kind synth');
    assert.throws(() => synthStaticPixels({ kind: 'character', perspective: 'td', dir: 'fr', frameNum: 0, mappable, size: 64 }), /unknown static kind/);
  });
});

describe('A2 static regen determinism (byte-identical pipeline reruns)', () => {
  for (const kind of Object.keys(PALETTE_FILES)) {
    it(`${kind}: full synth->svg pipeline reruns byte-identical with palette-exact fills`, () => {
      const a = staticPipelineSvg(kind, 'td', 'fr');
      const b = staticPipelineSvg(kind, 'td', 'fr');
      assert.equal(a, b);
      assert.ok(a.includes('data-palette="palette_'), 'svg must carry palette ref');
      assert.ok(a.includes(`data-asset="test_${kind}"`));
      const palette = loadPalette(resolve(root, PALETTE_FILES[kind]));
      const allowed = new Set(
        getMappableColors(palette).map((c) => `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`),
      );
      let n = 0;
      for (const tag of a.match(/<rect\b[^>]*>/g) ?? []) {
        const fill = tag.match(/fill="([^"]+)"/)[1].toLowerCase();
        assert.ok(allowed.has(fill), `${kind}: fill must be palette-exact, got ${fill}`);
        n++;
      }
      assert.ok(n > 20, `${kind}: motif must occupy real pixels, got ${n} rects`);
    });
  }
});

describe('A2 static disk inventory (32 views + masters, naming + layers)', () => {
  it('32 view SVGs exist with {asset}_{td|sd}_idle_{dir}0.svg naming and five layers', () => {
    let n = 0;
    for (const id of STATIC_IDS) {
      const dir = resolve(root, 'assets', id);
      const asset = loadAsset(id);
      const prefix = asset.asset;
      for (const p of ['td', 'sd']) {
        for (const d of ['fr', 'bk', 'lf', 'rt']) {
          const file = `${prefix}_${p}_idle_${d}0.svg`;
          const fp = resolve(dir, file);
          assert.ok(existsSync(fp), `${file} must exist (run generate)`);
          assert.match(file, /^[a-z0-9]+_(td|sd)_idle_(fr|bk|lf|rt)0\.svg$/);
          const svg = readFileSync(fp, 'utf8');
          assert.deepEqual(
            parseSvgGroups(svg).map((g) => g.part),
            SEMANTIC_GROUPS,
            `${file} must carry five layers`,
          );
          assert.ok(svg.includes(`data-palette="${STATIC_PALETTES[id]}"`), `${file} must ref ${STATIC_PALETTES[id]}`);
          n++;
        }
      }
    }
    assert.equal(n, 32, '4 assets x 8 cells = 32 views');
  });

  it('masters exist per perspective, marked data-master, pixel-equal to idle fr0', () => {
    for (const id of STATIC_IDS) {
      const dir = resolve(root, 'assets', id);
      const asset = loadAsset(id);
      for (const p of ['td', 'sd']) {
        const masterFile = asset.masters[p];
        const fp = resolve(dir, masterFile);
        assert.ok(existsSync(fp), `${id} ${masterFile} must exist (run generate)`);
        const master = readFileSync(fp, 'utf8');
        assert.ok(master.includes('data-master="true"'), `${id} ${masterFile} must be marked data-master`);
        const front = readFileSync(resolve(dir, `${asset.asset}_${p}_idle_fr0.svg`), 'utf8');
        assert.deepEqual(rectSet(master), rectSet(front), `${id} master_${p} must equal ${p} idle fr0 pixels`);
      }
    }
  });
});
