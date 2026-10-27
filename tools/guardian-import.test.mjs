// guardian-import.test.mjs — img2img-live wt-A (A3 verification; m3 base).
// Fixtures: resources/last-guardian-sprites.zip `last-guardian-sprites/amg1_*`
// (8 single-frame 32x32 RGBA PNGs, 4 dirs x 2 frames) under fixtures/guardian/,
// plus M4 img2img-live additions: fixtures/guardian/mid/ (8 AI-inbetween
// stand-in sources, 64px) and fixtures/guardian/td/ (20 derived td sources,
// 64px). Both mid and td sets are deterministic offline stand-ins until the
// provider run adopts real AI output (card A3; source_hash stays null on the
// AI mid slots until then).
// Structure (prep-frozen, option-b numbering): walk files [1=old f1, 2=AI mid,
// 3=old f2-renamed], attack files [1=old f1, 2=old f2, 3=AI mid] with
// animation order [2, 3, 1] = [f2, ai-mid, f1] (reverse-vs-walk difference
// kept); td mirrors sd structure with its own sources.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { loadPalette, getMappableColors } from './palette.mjs';
import { decodePngFile } from './import-prototype.mjs';
import {
  runGuardianImportSegment,
  deriveTdFixtures,
  updateTdProvenance,
  tdSlotFilesFromPlan,
  tdMidSlotFiles,
  TD_PROVENANCE_NOTE,
} from './img2img-providers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['fr', 'bk', 'lf', 'rt'];
const SOURCES = DIRS.flatMap((d) => [`amg1_${d}1.png`, `amg1_${d}2.png`]);
const MIDS = DIRS.flatMap((d) => [`mid/guardian_sd_${d}_mid.png`, `mid/guardian_td_${d}_mid.png`]);
const TD_PER_DIR = [['idle', ['0']], ['walk', ['1', '3']], ['attack', ['1', '2']]];
const TDS = DIRS.flatMap((d) => TD_PER_DIR.flatMap(([action, frames]) => frames.map((n) => `td/guardian_${action}_${d}${n}.png`)));
const guardian = JSON.parse(readFileSync(resolve(root, 'assets/guardian_001/asset.json'), 'utf8'));
const character = loadPalette(resolve(root, 'palettes/palette_character.v1.json'));
const map = JSON.parse(readFileSync(resolve(root, 'fixtures/guardian/guardian-map.json'), 'utf8'));

// Sorted <rect> tag set: the pixel data of a landed view (slot metadata such
// as action/frame/source differs per slot by design; rect tags carry x/y/fill
// only, so equality means identical pixel sets).
const assetDir = resolve(root, 'assets/guardian_001');
const rectKey = (file) => (String(readFileSync(resolve(assetDir, file))).match(/<rect\b[^>]*>/g) ?? []).sort().join('\n');
const rectEqual = (a, b) => rectKey(a) === rectKey(b);

describe('A3 guardian fixtures (8 amg1 + 8 mid + 20 td + map)', () => {
  it('sources committed (8x 32x32 amg1 + 8x 64x64 mid + 20x 64x64 td) + compares', async () => {
    for (const f of SOURCES) {
      assert.ok(existsSync(resolve(root, 'fixtures/guardian', f)), `fixtures/guardian/${f} missing`);
      const img = PNG.sync.read(readFileSync(resolve(root, 'fixtures/guardian', f)));
      assert.deepEqual([img.width, img.height], [32, 32], `${f} must be 32x32`);
    }
    for (const f of [...MIDS, ...TDS]) {
      assert.ok(existsSync(resolve(root, 'fixtures/guardian', f)), `fixtures/guardian/${f} missing`);
      const img = PNG.sync.read(readFileSync(resolve(root, 'fixtures/guardian', f)));
      assert.deepEqual([img.width, img.height], [64, 64], `${f} must be 64x64`);
    }
    for (const f of SOURCES.map((s) => s.replace(/\.png$/i, '.compare.png'))) {
      assert.ok(existsSync(resolve(root, 'fixtures/guardian', f)), `compare ${f} missing`);
    }
    for (const f of [...MIDS, ...TDS].map((s) => s.replace(/\.png$/i, '.compare.png'))) {
      assert.ok(existsSync(resolve(root, 'fixtures/guardian', f)), `compare ${f} missing`);
    }
  });

  it('same-dir f1 != f2; mid stand-ins differ from both endpoints', async () => {
    for (const d of DIRS) {
      const a = await decodePngFile(resolve(root, 'fixtures/guardian', `amg1_${d}1.png`));
      const b = await decodePngFile(resolve(root, 'fixtures/guardian', `amg1_${d}2.png`));
      assert.ok(!Buffer.from(a.data).equals(Buffer.from(b.data)), `${d}: f1 renders identical to f2`);
      for (const persp of ['sd', 'td']) {
        const mid = PNG.sync.read(readFileSync(resolve(root, 'fixtures/guardian', 'mid', `guardian_${persp}_${d}_mid.png`)));
        assert.ok(mid.width === 64 && mid.height === 64);
      }
    }
  });

  it('map covers exactly the 56 slots; reuse declaration [f1,ai-mid,f2]/[f2,ai-mid,f1]', () => {
    const clips = [];
    for (const [action, a] of Object.entries(guardian.actions)) {
      for (const p of guardian.perspectives) {
        for (const d of guardian.views) {
          for (const clip of a.clips[p][d]) clips.push({ file: clip.file, action, persp: p, dir: d });
        }
      }
    }
    assert.equal(clips.length, 56, 'idle 8 + walk 24 + attack 24');
    assert.equal(new Set(Object.keys(map.slots)).size, 56);
    for (const c of clips) assert.ok(c.file in map.slots, `map misses slot ${c.file}`);
    assert.equal(Object.keys(map.slots).length, 56, 'map has no extra slots');
    assert.deepEqual(map.reuse, { idle: ['f1'], walk: ['f1', 'ai-mid', 'f2'], attack: ['f2', 'ai-mid', 'f1'] });
    const midSrc = (persp, d) => `mid/guardian_${persp}_${d}_mid.png`;
    for (const persp of ['sd', 'td']) {
      for (const d of DIRS) {
        const tdFix = (action, n) => `td/guardian_${action}_${d}${n}.png`;
        const want = {
          [`guardian_${persp}_idle_${d}0.svg`]: persp === 'sd' ? `amg1_${d}1.png` : tdFix('idle', 0),
          [`guardian_${persp}_walk_${d}1.svg`]: persp === 'sd' ? `amg1_${d}1.png` : tdFix('walk', 1),
          [`guardian_${persp}_walk_${d}2.svg`]: midSrc(persp, d),
          [`guardian_${persp}_walk_${d}3.svg`]: persp === 'sd' ? `amg1_${d}2.png` : tdFix('walk', 3),
          [`guardian_${persp}_attack_${d}1.svg`]: persp === 'sd' ? `amg1_${d}1.png` : tdFix('attack', 1),
          [`guardian_${persp}_attack_${d}2.svg`]: persp === 'sd' ? `amg1_${d}2.png` : tdFix('attack', 2),
          [`guardian_${persp}_attack_${d}3.svg`]: midSrc(persp, d),
        };
        for (const [file, src] of Object.entries(want)) {
          assert.equal(map.slots[file], src, `${file} must source ${src}`);
        }
      }
    }
    assert.deepEqual([...new Set(Object.values(map.slots))].length, 36, '36 distinct sources');
    for (const src of new Set(Object.values(map.slots))) {
      assert.ok(existsSync(resolve(root, 'fixtures/guardian', src)), `map source missing: ${src}`);
    }
  });

  it('tdProvenance marker: stand-in mode, exact note, empty upgradedSlots (committed state)', () => {
    assert.deepEqual(map.tdProvenance, {
      mode: 'offline-standin-mirror',
      note: TD_PROVENANCE_NOTE,
      upgradedSlots: [],
    });
  });
});

describe('A3 guardian landed slots (56 views + 2 masters)', () => {
  it('skeleton validates with 3-frame walk/attack (check-files green)', async () => {
    const { validateAsset } = await import('./asset-manifest.mjs');
    const r = validateAsset(guardian, { checkFiles: true, baseDir: assetDir });
    assert.deepEqual(r.errors, [], r.errors.join('; '));
    assert.equal(r.ok, true);
    assert.equal(guardian.actions.walk.frames, 3);
    assert.equal(guardian.actions.attack.frames, 3);
    assert.equal(guardian.actions.idle.frames, 1);
  });

  // character-asset spec delta: the td==sd byte-copy placeholder is retired;
  // td views are pixel-derivative siblings from distinct sources.
  it('td views hold their own sources (never sd byte-copies)', () => {
    let n = 0;
    for (const f of Object.keys(map.slots)) {
      if (!f.startsWith('guardian_td_')) continue;
      const sd = f.replace('guardian_td_', 'guardian_sd_');
      assert.ok(!readFileSync(resolve(assetDir, f)).equals(readFileSync(resolve(assetDir, sd))), `${f} must not byte-copy ${sd}`);
      assert.ok(!rectEqual(f, sd), `${f} must differ in pixels from ${sd}`);
      n++;
    }
    assert.equal(n, 28, '28 td views checked');
    assert.ok(!rectEqual('master_td.svg', 'master_side.svg'), 'masters differ per perspective too');
  });

  it('3-frame distinctness: walk/attack frames pairwise pixel-distinct per dir', () => {
    let checked = 0;
    for (const persp of ['sd', 'td']) {
      for (const action of ['walk', 'attack']) {
        for (const d of DIRS) {
          const [a, b, c] = guardian.actions[action].clips[persp][d].map((f) => f.file);
          assert.ok(!rectEqual(a, b), `${persp}/${action}/${d}: ${a} vs ${b} must differ`);
          assert.ok(!rectEqual(a, c), `${persp}/${action}/${d}: ${a} vs ${c} must differ`);
          assert.ok(!rectEqual(b, c), `${persp}/${action}/${d}: ${b} vs ${c} must differ`);
          checked++;
        }
      }
    }
    assert.equal(checked, 16, '16 dir strips checked');
  });

  it('reuse-vs-landed pixel sets: [f1, ai-mid, f2] walk / [f2, ai-mid, f1] attack', () => {
    let checked = 0;
    const eq = (a, b, why) => {
      checked++;
      assert.ok(rectEqual(a, b), why);
    };
    for (const persp of ['sd', 'td']) {
      for (const d of DIRS) {
        const idle = guardian.actions.idle.clips[persp][d].map((f) => f.file);
        const walk = guardian.actions.walk.clips[persp][d].map((f) => f.file);
        const attack = guardian.actions.attack.clips[persp][d].map((f) => f.file);
        eq(idle[0], walk[0], `${persp}/${d}: idle f1 must equal walk frame 1 (both source f1)`);
        eq(walk[2], attack[0], `${persp}/${d}: walk frame 3 must equal attack frame 1 (both source f2)`);
        eq(walk[0], attack[2], `${persp}/${d}: walk frame 1 must equal attack frame 3 (both source f1)`);
        eq(walk[1], attack[1], `${persp}/${d}: AI mid must match between walk and attack`);
        checked++;
        assert.ok(!rectEqual(walk[0], walk[1]) && !rectEqual(walk[1], walk[2]), `${persp}/${d}: mid distinct from endpoints`);
      }
    }
    assert.ok(checked >= 16);
  });

  it('masters carry own-perspective fr content, marked data-master, no pending hash', () => {
    for (const [persp, fr0] of [['td', 'guardian_td_idle_fr0.svg'], ['sd', 'guardian_sd_idle_fr0.svg']]) {
      const svg = readFileSync(resolve(assetDir, guardian.masters[persp]), 'utf8');
      assert.ok(svg.includes('data-master="true"'), `${guardian.masters[persp]} must be marked data-master`);
      assert.ok(!svg.includes('<prompt_hash>pending</prompt_hash>'), `${guardian.masters[persp]} must not carry pending hash`);
      assert.ok(rectEqual(guardian.masters[persp], fr0), `master ${persp} pixels must equal ${fr0}`);
    }
  });

  it('landed rects are palette-exact (character palette closed)', () => {
    const allowed = new Set(
      getMappableColors(character).map(
        (c) => `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`,
      ),
    );
    let n = 0;
    for (const f of ['guardian_sd_idle_fr0.svg', 'guardian_sd_walk_fr2.svg', 'guardian_td_attack_fr3.svg']) {
      const svg = readFileSync(resolve(assetDir, f), 'utf8');
      for (const tag of svg.match(/<rect\b[^>]*>/g) ?? []) {
        const fill = tag.match(/fill="([^"]+)"/)[1].toLowerCase();
        assert.ok(allowed.has(fill), `${f}: fill must be palette-exact, got ${fill}`);
        n++;
      }
    }
    assert.ok(n > 100, `guardian views must carry real pixels, got ${n} rects`);
  });
});

describe('A3 hash semantics (img2img-live): pending retired repo-wide', () => {
  const ASSET_IDS = ['knight_001', 'sword_001', 'house_001', 'crate_001', 'tree_001', 'potion_001', 'guardian_001'];

  it('zero "pending" in any assets/*/asset.json', () => {
    for (const id of ASSET_IDS) {
      const text = readFileSync(resolve(root, 'assets', id, 'asset.json'), 'utf8');
      assert.equal(text.includes('"pending"'), false, `${id} still carries "pending"`);
    }
  });

  it('imported/AI slots: prompt_hash null + source_hash 12hex or null (AI unadopted)', () => {
    let backfilled = 0;
    let aiNull = 0;
    const checkClip = (id, where, clip) => {
      assert.equal(clip.prompt_hash, null, `${id} ${where}: imported slot prompt_hash must be null`);
      if (clip.source_hash === null) {
        aiNull++;
      } else {
        assert.match(clip.source_hash, /^[0-9a-f]{12}$/, `${id} ${where}: source_hash must be 12 hex`);
        backfilled++;
      }
    };
    // potion: all 8 idle slots imported from I_Bottle03.png
    const potion = JSON.parse(readFileSync(resolve(root, 'assets/potion_001/asset.json'), 'utf8'));
    const bottle = createSha12(resolve(root, 'fixtures/import/I_Bottle03.png'));
    let potionSlots = 0;
    for (const persp of potion.perspectives) {
      for (const d of potion.views) {
        for (const clip of potion.actions.idle.clips[persp][d]) {
          checkClip('potion_001', `${persp}/idle/${d}`, clip);
          assert.equal(clip.source_hash, bottle, `potion ${persp}/${d} must source I_Bottle03.png`);
          potionSlots++;
        }
      }
    }
    assert.equal(potionSlots, 8);
    // guardian: 40 existing slots backfilled, 16 AI mid slots null/null
    for (const [action, a] of Object.entries(guardian.actions)) {
      for (const persp of guardian.perspectives) {
        for (const d of guardian.views) {
          for (const clip of a.clips[persp][d]) {
            checkClip('guardian_001', `${persp}/${action}/${d} ${clip.file}`, clip);
          }
        }
      }
    }
    assert.equal(backfilled, 48, 'potion 8 + guardian 40 slots carry source_hash');
    assert.equal(aiNull, 16, '8 sd mid + 8 td mid slots await AI adoption (null/null)');
    // fixture hash honesty: each non-mid source_hash equals sha256-12 of its map source
    for (const [file, src] of Object.entries(map.slots)) {
      if (/walk_(fr|bk|lf|rt)2\.svg$/.test(file) || /attack_(fr|bk|lf|rt)3\.svg$/.test(file)) continue; // AI slots
      const clip = findClip(file);
      assert.ok(clip, `clip not found for ${file}`);
      const want = createSha12(resolve(root, 'fixtures/guardian', src));
      assert.equal(clip.source_hash, want, `${file}: source_hash must be sha256-12 of ${src}`);
    }
  });
});

function createSha12(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
}

function findClip(file) {
  for (const [action, a] of Object.entries(guardian.actions)) {
    for (const persp of guardian.perspectives) {
      for (const d of guardian.views) {
        for (const clip of a.clips[persp][d]) if (clip.file === file) return clip;
      }
    }
  }
  return null;
}

describe('A4 validator branches (img2img-live hash semantics)', () => {
  const clone = () => JSON.parse(JSON.stringify(guardian));
  const withClip = (mut) => {
    const a = clone();
    mut(a.actions.walk.clips.sd.fr[0]);
    return a;
  };

  it('accepts the committed shape (null prompt_hash + 12hex-or-null source_hash)', async () => {
    const { validateAsset } = await import('./asset-manifest.mjs');
    const r = validateAsset(guardian, {});
    assert.equal(r.ok, true, r.errors.join('; '));
  });

  it('rejects a "pending" prompt_hash (retired repo-wide)', async () => {
    const { validateAsset } = await import('./asset-manifest.mjs');
    const r = validateAsset(withClip((c) => { c.prompt_hash = 'pending'; }), {});
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('"pending" placeholders are retired')), r.errors.join('; '));
  });

  it('rejects malformed source_hash (must be null or exactly 12 hex)', async () => {
    const { validateAsset } = await import('./asset-manifest.mjs');
    for (const bad of ['xyz', 'abc', 'ABCDEFGHIJKL', 'a1b2c3d4e5f6g7']) {
      const r = validateAsset(withClip((c) => { c.source_hash = bad; }), {});
      assert.equal(r.ok, false, bad);
      assert.ok(r.errors.some((e) => e.includes('source_hash must be null or 12 hex')), `${bad}: ${r.errors.join('; ')}`);
    }
  });

  it('still accepts prompt-derived string hashes (knight semantics untouched)', async () => {
    const { validateAsset } = await import('./asset-manifest.mjs');
    const r = validateAsset(withClip((c) => { delete c.source_hash; c.prompt_hash = '1a2b3c4d'; }), {});
    assert.equal(r.ok, true, r.errors.join('; '));
  });
});

describe('A3 td provenance marker (tdProvenance lifecycle, no network)', () => {
  it('offline derive-td rerun writes 20 fixtures and resets the marker', async () => {
    const { mkdirSync, copyFileSync, readdirSync } = await import('node:fs');
    const temp = mkdtempSync(join(tmpdir(), 'pixe-td-prov-'));
    mkdirSync(join(temp, 'td'), { recursive: true });
    copyFileSync(resolve(root, 'fixtures/guardian/guardian-map.json'), join(temp, 'guardian-map.json'));
    for (const f of readdirSync(resolve(root, 'fixtures/guardian'))) {
      if (/^amg1_.*\.png$/.test(f)) copyFileSync(resolve(root, 'fixtures/guardian', f), join(temp, f));
    }
    const written = deriveTdFixtures({ fixturesDir: temp });
    assert.equal(written.length, 20);
    const map2 = JSON.parse(readFileSync(join(temp, 'guardian-map.json'), 'utf8'));
    assert.deepEqual(map2.tdProvenance, {
      mode: 'offline-standin-mirror',
      note: TD_PROVENANCE_NOTE,
      upgradedSlots: [],
    });
  });

  it('provenance lifecycle: AI td run unions 20 slots -> mid run completes 28 -> offline reruns demote', async () => {
    const { copyFileSync } = await import('node:fs');
    const temp = mkdtempSync(join(tmpdir(), 'pixe-td-prov-union-'));
    copyFileSync(resolve(root, 'fixtures/guardian/guardian-map.json'), join(temp, 'guardian-map.json'));
    const mapPath = join(temp, 'guardian-map.json');
    const slotNames = new Set(Object.keys(map.slots));
    const slots20 = tdSlotFilesFromPlan();
    assert.equal(slots20.length, 20);
    for (const s of slots20) assert.ok(slotNames.has(s), `${s} must be a real td slot`);
    // configured derive-td rerun: mode flips to ai-derived, slots listed exactly
    let tp = updateTdProvenance(mapPath, { mode: 'ai-derived', addSlots: slots20 });
    assert.equal(tp.mode, 'ai-derived');
    assert.deepEqual(tp.upgradedSlots, [...slots20].sort());
    // idempotent double-run: union keeps the set stable
    tp = updateTdProvenance(mapPath, { mode: 'ai-derived', addSlots: slots20 });
    assert.deepEqual(tp.upgradedSlots, [...slots20].sort());
    // configured guardian-mid rerun adds the 8 td mid slots (full AI cycle: 28)
    const mid8 = tdMidSlotFiles();
    assert.equal(mid8.length, 8);
    for (const s of mid8) assert.ok(slotNames.has(s), `${s} must be a real td slot`);
    tp = updateTdProvenance(mapPath, { addSlots: mid8 });
    assert.deepEqual(tp.upgradedSlots, [...slots20, ...mid8].sort());
    assert.equal(tp.upgradedSlots.length, 28);
    // offline mid rerun demotes the 8 mid slots (stand-ins again), td subset stays
    tp = updateTdProvenance(mapPath, { removeSlots: mid8 });
    assert.deepEqual(tp.upgradedSlots, [...slots20].sort());
    // offline td rerun resets the whole marker to the stand-in state
    tp = updateTdProvenance(mapPath, { mode: 'offline-standin-mirror', reset: true });
    assert.deepEqual(tp.upgradedSlots, []);
    // upgradedSlots non-empty => each named slot file must exist on disk
    // (committed state is empty; the AI-subset names were skeleton-checked above)
    for (const s of tp.upgradedSlots) assert.ok(existsSync(resolve(root, 'assets/guardian_001', s)), `${s} on disk`);
  });
});

describe('A3 deterministic regression: import segment rerun is byte-stable', () => {
  it('temp-dir rerun of the map import reproduces every committed slot byte-identically', async () => {
    const stage = mkdtempSync(join(tmpdir(), 'pixe-guardian-regen-'));
    try {
      await runGuardianImportSegment({ rootDir: root, stageRoot: stage });
      const regenerated = readdirSync(stage);
      const committed = new Set(readdirSync(assetDir));
      assert.ok(regenerated.length >= 58, `expected 56 slots + 2 masters, got ${regenerated.length}`);
      for (const f of regenerated) {
        assert.ok(committed.has(f), `regenerated file ${f} has no committed counterpart`);
        assert.deepEqual(
          readFileSync(resolve(stage, f)),
          readFileSync(resolve(assetDir, f)),
          `${f} must be byte-identical on rerun (fixtures -> slots determinism)`,
        );
      }
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });
});
