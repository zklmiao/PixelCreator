// verify-static.mjs — static-web acceptance: 7-asset kind-aware shell +
// idle-only 8-cell matrix + kind-aware prompt + character frozen regression +
// B1 idle-only negative assertions. Run: node web/verify-static.mjs
// Read-only: never writes assets/. checkShell is pure (fs read + direct call);
// loadShell (fetch) is browser-only and never called here.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkShell, ASSET_IDS, ASSET_URLS } from './lib/asset-shell.js';
import { buildMatrix, createPlayer, tickPlayer, canExport } from './lib/matrix.js';
import {
  BARE_HANDS, SINGLE_FIGURE, SWORD_SEP, FIXED_NEGATIVE,
  KIND_OBJECT_WORDS, STATIC_KIND_SENTENCES,
  buildPrompt, KNIGHT_EXAMPLE,
  SWORD_EXAMPLE, HOUSE_EXAMPLE, CRATE_EXAMPLE, TREE_EXAMPLE,
} from './lib/prompt.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loadAsset = (id) => JSON.parse(readFileSync(resolve(root, 'assets', id, 'asset.json'), 'utf8'));

let failed = false;
const fail = (m) => { console.log(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`OK: ${m}`);

// 0. Asset URL map covers all 7 switchable assets (default knight compat).
if (ASSET_IDS.join() !== 'knight_001,sword_001,house_001,crate_001,tree_001,potion_001,guardian_001') {
  fail(`ASSET_IDS must be knight/sword/house/crate/tree/potion/guardian, got ${ASSET_IDS.join(',')}`);
} else ok('asset switcher lists 7 assets (knight default)');
for (const id of ASSET_IDS) {
  if (ASSET_URLS[id] !== `../assets/${id}/asset.json`) fail(`ASSET_URLS[${id}] must be ../assets/${id}/asset.json`);
}
ok('asset URLs map 7 ids to ../assets/<id>/asset.json');
if (ASSET_URLS.knight_001 !== '../assets/knight_001/asset.json') fail('default knight URL drifted');
else ok('default shell URL stays knight_001 (compat)');

// 1. Seven shells all OK via fs + pure checkShell.
const STATIC_IDS = ['sword_001', 'house_001', 'crate_001', 'tree_001'];
for (const id of [...ASSET_IDS]) {
  const asset = loadAsset(id);
  const r = checkShell(asset);
  if (!r.ok) fail(`${id} shell must be ok, got ${r.errors.join('; ')}`);
  else if (r.errors.length !== 0) fail(`${id} ok shell must carry zero errors`);
  else ok(`${id} shell ok (kind=${asset.kind})`);
}

// 2. B1 idle-only negatives (value assertions on exact strings).
{
  const sword = loadAsset('sword_001');
  const withWalk = structuredClone(sword);
  withWalk.actions.walk = { frames: 2, fps: 6, loop: true, clips: { td: {}, sd: {} } };
  const rw = checkShell(withWalk);
  if (rw.ok) fail('static with walk must fail checkShell');
  else if (!rw.errors.some((e) => e.includes('must not define action "walk"'))) {
    fail(`static walk error must name walk, got ${rw.errors.join('; ')}`);
  } else ok('static with walk rejected (must not define action "walk")');

  const withAttack = structuredClone(sword);
  withAttack.actions.attack = { frames: 2, fps: 8, loop: false, next: 'idle', clips: { td: {}, sd: {} } };
  const ra = checkShell(withAttack);
  if (ra.ok) fail('static with attack must fail checkShell');
  else if (!ra.errors.some((e) => e.includes('must not define action "attack"'))) {
    fail(`static attack error must name attack, got ${ra.errors.join('; ')}`);
  } else ok('static with attack rejected (must not define action "attack")');

  const noIdle = structuredClone(sword);
  delete noIdle.actions.idle;
  const rn = checkShell(noIdle);
  if (rn.ok) fail('static without idle must fail checkShell');
  else if (!rn.errors.some((e) => e.includes('missing clip: td/idle/fr:action absent'))) {
    fail(`missing idle must park missing-clip, got ${rn.errors.join('; ')}`);
  } else if (rn.errors.filter((e) => e.startsWith('missing clip:')).length !== 8) {
    fail(`missing idle must yield 8 missing-clip errors, got ${rn.errors.length}: ${rn.errors.join('; ')}`);
  } else ok('static without idle parks 8 missing-clip errors (td/sd x idle x 4 dirs)');

  const badPreview = structuredClone(sword);
  badPreview.preview.action = 'walk';
  const rp = checkShell(badPreview);
  if (rp.ok) fail('static preview walk must fail checkShell');
  else if (!rp.errors.some((e) => e.includes('preview must reference'))) {
    fail(`static preview error must name preview, got ${rp.errors.join('; ')}`);
  } else ok('static preview walk rejected (preview must reference ...)');

  // kind default: no-kind asset falls back to character path.
  const knight = loadAsset('knight_001');
  const noKind = structuredClone(knight);
  delete noKind.kind;
  const rk = checkShell(noKind);
  if (!rk.ok) fail(`kind-less knight must stay ok via ?? 'character', got ${rk.errors.join('; ')}`);
  else ok("kind-less asset defaults to character (asset.kind ?? 'character')");
}

// 3. Static 8-cell matrix (4 per persp, idle only, timing + placeholder + export).
for (const id of STATIC_IDS) {
  const asset = loadAsset(id);
  let total = 0;
  for (const persp of ['td', 'sd']) {
    const m = buildMatrix(asset, persp);
    if (m.cells.length !== 4) fail(`${id}/${persp}: expected 4 idle cells, got ${m.cells.length}`);
    else ok(`${id}/${persp}: 4 idle cells`);
    if (!m.cells.every((c) => c.action === 'idle')) fail(`${id}/${persp}: all cells must be idle`);
    const miss = m.cells.filter((c) => c.missing);
    if (miss.length !== 0) fail(`${id}/${persp}: expected 0 missing, got ${miss.map((c) => c.clipId).join(',')}`);
    for (const cell of m.cells) {
      if (cell.files.length !== 1) fail(`${id}/${cell.clipId}: idle must carry 1 file, got ${cell.files.length}`);
      if (cell.durationMs !== 500) fail(`${id}/${cell.clipId}: idle 2fps must be 500ms, got ${cell.durationMs}`);
      try {
        let p = createPlayer(asset, persp, 'idle', cell.dir, 0);
        p = tickPlayer(p);
        if (p.index !== 0) fail(`${id}/${cell.clipId}: single-frame idle must loop to 0`);
      } catch (e) {
        fail(`${id}/${cell.clipId}: not playable (${e.message})`);
      }
    }
    total += m.cells.length;
  }
  if (total !== 8) fail(`${id}: toggle total must be 8, got ${total}`);
  else ok(`${id}: td/sd toggle totals 8 idle cells`);
  const ex = canExport(asset);
  if (!ex.ok || ex.missing.length !== 0) fail(`${id} canExport must be ok, got ${JSON.stringify(ex)}`);
  else ok(`${id}: canExport.ok with 8 clips full`);
  // Toggle preserves timing (perspective-independent fps).
  const a = buildMatrix(asset, 'td').cells[0].durationMs;
  const b = buildMatrix(asset, 'sd').cells[0].durationMs;
  if (a !== 500 || b !== 500) fail(`${id}: timing drift td=${a} sd=${b} want=500`);
  else ok(`${id}: td/sd toggle keeps idle timing 500ms`);
}
// Spec scenario: crate_001 flip shows 4 per side (8 total).
{
  const crate = loadAsset('crate_001');
  const td = buildMatrix(crate, 'td');
  const sd = buildMatrix(crate, 'sd');
  if (td.cells.length !== 4 || sd.cells.length !== 4) fail(`crate toggle must be 4+4, got ${td.cells.length}+${sd.cells.length}`);
  else ok('crate_001 toggle shows 4 idle cells per side (8 total)');
}
// Missing idle placeholder parks named non-exporting (memory-only clone).
{
  const broken = structuredClone(loadAsset('crate_001'));
  broken.actions.idle.clips.td.bk = [];
  const mTd = buildMatrix(broken, 'td');
  const missTd = mTd.cells.filter((c) => c.missing);
  if (missTd.length !== 1 || missTd[0].clipId !== 'td/idle/bk') {
    fail(`crate missing must park exactly td/idle/bk, got ${missTd.map((c) => c.clipId).join(',')}`);
  } else ok('missing crate idle_bk parks as td/idle/bk placeholder');
  if (!missTd[0]?.error?.includes('missing clip: td/idle/bk')) fail('placeholder must name the clip (missing clip: td/idle/bk)');
  else ok('placeholder names the clip (missing clip: td/idle/bk)');
  if (missTd[0] && missTd[0].files.length !== 0) fail('placeholder fallback must carry no files (never exports)');
  else ok('placeholder carries no files (fallback never exports)');
  const mSd = buildMatrix(broken, 'sd');
  if (mSd.cells.some((c) => c.missing)) fail('sd perspective must stay fully playable');
  else ok('sd perspective unaffected (toggle shows the other side full)');
  const exB = canExport(broken);
  if (exB.ok) fail('canExport must gray out when crate idle_bk is missing');
  else if (!exB.missing.some((m) => m.includes('td/idle/bk'))) fail(`canExport must point at td/idle/bk, got ${exB.missing.join(',')}`);
  else ok(`canExport grays out pointing at td/idle/bk (missing=${exB.missing.length})`);
}
// kind-less matrix defaults to character (12 cells).
{
  const knight = loadAsset('knight_001');
  const noKind = structuredClone(knight);
  delete noKind.kind;
  const m = buildMatrix(noKind, 'td');
  if (m.cells.length !== 12) fail(`kind-less knight matrix must be 12 cells, got ${m.cells.length}`);
  else ok("kind-less matrix defaults to character (12 cells via ?? 'character')");
}

// 4. Static prompts: object words present, figure constraints absent.
const STATIC_CASES = [
  ['weapon', SWORD_EXAMPLE, 2001],
  ['building', HOUSE_EXAMPLE, 2002],
  ['prop', CRATE_EXAMPLE, 2003],
  ['scenery', TREE_EXAMPLE, 2004],
];
for (const [kind, example, seed] of STATIC_CASES) {
  const r = buildPrompt(example, { perspective: 'td', dir: 'fr', action: 'idle', seed });
  const wantObject = KIND_OBJECT_WORDS[kind];
  if (!r.positive.includes(wantObject)) fail(`${kind}: positive must name object "${wantObject}", got ${r.positive}`);
  else ok(`${kind}: positive names object "${wantObject}"`);
  if (!r.positive.includes(kind)) fail(`${kind}: positive must name kind "${kind}", got ${r.positive}`);
  else ok(`${kind}: positive names kind "${kind}"`);
  if (!r.positive.includes(STATIC_KIND_SENTENCES[kind])) fail(`${kind}: positive must carry kind sentence`);
  else ok(`${kind}: positive carries kind sentence`);
  for (const [label, needle] of [['bare-hands', BARE_HANDS], ['single-figure', SINGLE_FIGURE], ['sword-sep', SWORD_SEP]]) {
    if (r.positive.includes(needle)) fail(`${kind}: static positive must NOT contain ${label}`);
  }
  ok(`${kind}: static positive has none of bare-hands/single-figure/sword-sep`);
  if (r.negative !== FIXED_NEGATIVE) fail(`${kind}: static negative must stay FIXED_NEGATIVE`);
  else ok(`${kind}: negative frozen (${r.negative.length} chars)`);
  if (r.denoise !== 0.55) fail(`${kind}: idle denoise must be 0.55, got ${r.denoise}`);
  else ok(`${kind}: idle denoise 0.55`);
  if (r.seed !== seed) fail(`${kind}: seed must lock to ${seed}, got ${r.seed}`);
  else ok(`${kind}: seed locked to ${seed}`);
  if (typeof r.prompt_hash !== 'string' || r.prompt_hash.length < 6) fail(`${kind}: bad prompt_hash`);
  else ok(`${kind}: prompt_hash ${r.prompt_hash}`);
  // Static walk must throw (idle-only).
  let threw = '';
  try {
    buildPrompt(example, { perspective: 'td', dir: 'fr', action: 'walk', seed });
  } catch (e) {
    threw = e.message;
  }
  if (!threw.includes('supports idle only')) fail(`${kind}: static walk must throw idle-only, got "${threw}"`);
  else ok(`${kind}: static walk throws idle-only`);
}
// Spec scenario: house_001 prompt carries house+building, no figure constraints.
{
  const r = buildPrompt(HOUSE_EXAMPLE, { perspective: 'td', dir: 'fr', action: 'idle', seed: 2002 });
  if (!r.positive.includes('house') || !r.positive.includes('building')) {
    fail(`house scenario must contain house+building, got ${r.positive}`);
  } else ok('house_001 prompt contains house + building');
  if (r.positive.includes(BARE_HANDS) || r.positive.includes(SINGLE_FIGURE) || r.positive.includes(SWORD_SEP)) {
    fail('house scenario must contain none of the character-only constraint strings');
  } else ok('house_001 prompt contains none of the character-only constraints');
}

// 5. Character frozen regression (byte-identical path).
{
  const knight = loadAsset('knight_001');
  const r = checkShell(knight);
  if (!r.ok) fail(`knight checkShell regression: ${r.errors.join('; ')}`);
  else ok('knight checkShell still ok (character path)');
  for (const persp of ['td', 'sd']) {
    const m = buildMatrix(knight, persp);
    if (m.cells.length !== 12) fail(`knight/${persp} regression: want 12, got ${m.cells.length}`);
    else ok(`knight/${persp} regression: 12 cells`);
  }
  const ex = canExport(knight);
  if (!ex.ok) fail(`knight canExport regression: ${ex.missing.join(',')}`);
  else ok('knight canExport regression ok (24 clips)');
  const k = buildPrompt(KNIGHT_EXAMPLE, { perspective: 'td', dir: 'fr', action: 'idle', seed: 1234 });
  for (const [label, needle] of [['bare-hands', BARE_HANDS], ['single-figure', SINGLE_FIGURE], ['sword-sep', SWORD_SEP]]) {
    if (!k.positive.includes(needle)) fail(`knight prompt regression: missing ${label}`);
  }
  ok('knight prompt regression carries all three figure constraints');
  // kind-less prompt stays on character path.
  const noKindFields = { ...KNIGHT_EXAMPLE };
  delete noKindFields.kind;
  const k2 = buildPrompt(noKindFields, { perspective: 'td', dir: 'fr', action: 'idle', seed: 1234 });
  if (k2.positive !== k.positive) fail('kind-less prompt must be byte-identical to knight character path');
  else ok("kind-less prompt defaults to character (byte-identical)");
}

if (failed) process.exit(1);
console.log('OK: static web verified (7 shells/8-cell matrix/kind-aware prompt/character frozen)');
