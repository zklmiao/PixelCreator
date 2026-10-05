// verify-5.2.mjs — 5.2 matrix acceptance: 12-cell carousel + td/sd toggle +
// missing placeholder (preview-only, never exports). Run: node web/verify-5.2.mjs
// Memory-only missing test (structuredClone); never touches the 66 view SVGs.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatrix, createPlayer, tickPlayer, canExport } from './lib/matrix.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const asset = JSON.parse(readFileSync(resolve(root, 'assets/knight_001/asset.json'), 'utf8'));

let failed = false;
const fail = (m) => { console.log(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`OK: ${m}`);

// 24 clips full: per-perspective 12 cells, zero missing, export ready.
for (const persp of ['td', 'sd']) {
  const m = buildMatrix(asset, persp);
  if (m.cells.length !== 12) fail(`${persp}: expected 12 cells, got ${m.cells.length}`);
  else ok(`${persp}: 12 cells`);
  const miss = m.cells.filter((c) => c.missing);
  if (miss.length !== 0) fail(`${persp}: expected 0 missing, got ${miss.map((c) => c.clipId).join(',')}`);
  else ok(`${persp}: missing=0 (full broadcast)`);
  // Every cell playable end-to-end via nextFrame chain.
  for (const cell of m.cells) {
    try {
      let p = createPlayer(asset, persp, cell.action, cell.dir, 0);
      for (let s = 0; s < cell.frames.length; s++) p = tickPlayer(p);
    } catch (e) {
      fail(`${persp}/${cell.action}/${cell.dir}: not playable (${e.message})`);
    }
  }
  ok(`${persp}: all 12 cells tick without throwing`);
}

const ex = canExport(asset);
if (!ex.ok || ex.missing.length !== 0) fail(`canExport full asset must be ok, got ${JSON.stringify(ex)}`);
else ok('canExport.ok with 24 clips full');

// td/sd toggle preserves timing (fps per action is perspective-independent).
for (const [action, want] of [['idle', 1000 / 2], ['walk', 1000 / 6], ['attack', 1000 / 8]]) {
  const a = buildMatrix(asset, 'td').cells.find((c) => c.action === action).durationMs;
  const b = buildMatrix(asset, 'sd').cells.find((c) => c.action === action).durationMs;
  if (a !== want || b !== want) fail(`${action}: timing drift td=${a} sd=${b} want=${want}`);
}
ok('td/sd toggle keeps timing (idle500/walk166.67/attack125)');

// Attack tail still falls back to same-direction idle through the matrix player.
{
  let p = createPlayer(asset, 'td', 'attack', 'bk', 3);
  p = tickPlayer(p);
  if (p.action !== 'idle' || p.persp !== 'td' || p.dir !== 'bk' || p.index !== 0) {
    fail(`attack tail did not land on td/idle/bk0, got ${p.persp}/${p.action}/${p.dir}${p.index}`);
  } else ok('attack tail falls back to same-direction idle (td/attack/bk -> td/idle/bk0)');
}

// Missing simulation: delete walk_bk_f2 in memory only.
{
  const broken = structuredClone(asset);
  broken.actions.walk.clips.td.bk.splice(1, 1); // drop f2 -> expected 3 found 2
  const mTd = buildMatrix(broken, 'td');
  const missTd = mTd.cells.filter((c) => c.missing);
  if (missTd.length !== 1 || missTd[0].clipId !== 'td/walk/bk') {
    fail(`td matrix must park exactly td/walk/bk, got ${missTd.map((c) => c.clipId).join(',')}`);
  } else ok('missing walk_bk_f2 parks as td/walk/bk placeholder');
  if (!missTd[0]?.error?.includes('missing clip: td/walk/bk')) fail('placeholder must name the clip (missing clip: td/walk/bk)');
  else ok('placeholder names the clip (missing clip: td/walk/bk)');
  if (missTd[0] && missTd[0].files.length !== 0) fail('placeholder fallback must carry no files (never exports)');
  else ok('placeholder carries no files (fallback never exports)');
  // Remaining 11 cells still playable.
  let playable = 0;
  for (const cell of mTd.cells.filter((c) => !c.missing)) {
    try {
      let p = createPlayer(broken, 'td', cell.action, cell.dir, 0);
      for (let s = 0; s < cell.frames.length; s++) p = tickPlayer(p);
      playable++;
    } catch (e) {
      fail(`survivor ${cell.clipId} should still play (${e.message})`);
    }
  }
  if (playable !== 11) fail(`expected 11 survivors playable, got ${playable}`);
  else ok('other 11 cells still play with one missing');
  const mSd = buildMatrix(broken, 'sd');
  if (mSd.cells.some((c) => c.missing)) fail('sd perspective must stay fully playable');
  else ok('sd perspective unaffected (toggle shows the other side full)');

  const exB = canExport(broken);
  if (exB.ok) fail('canExport must gray out when walk_bk_f2 is missing');
  else if (!exB.missing.some((m) => m.includes('td/walk/bk'))) fail(`canExport must point at td/walk/bk, got ${exB.missing.join(',')}`);
  else ok(`canExport grays out pointing at td/walk/bk (missing=${exB.missing.length})`);
}

if (failed) process.exit(1);
console.log('OK: 5.2 matrix verified (12 cells/toggle/placeholder/export-gray)');
