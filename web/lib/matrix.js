// matrix.js — 5.2 preview matrix (pure ESM, zero dependencies).
// Reuses tools/clips.mjs clipFrames/nextFrame for timing; browser-safe
// (no node: imports) so app.js can import it and node verify can too.
// Preview-only fallback: missing export-blocking clips become placeholders
// here ({missing:true}); fallback stills never export (see canExport).

import { clipFrames, nextFrame } from '../../tools/clips.mjs';

export const MATRIX_ACTIONS = ['idle', 'walk', 'attack'];
export const MATRIX_DIRS = ['fr', 'bk', 'lf', 'rt'];
export const MATRIX_PERSPS = ['td', 'sd'];

export const STATIC_KINDS = ['weapon', 'building', 'prop', 'scenery'];

const kindOf = (asset) => asset?.kind ?? 'character';
const actionsFor = (asset) => (STATIC_KINDS.includes(kindOf(asset)) ? ['idle'] : MATRIX_ACTIONS);

function assertPersp(persp) {
  if (!MATRIX_PERSPS.includes(persp)) {
    throw new Error(`missing clip: ${persp}/-/-(unknown perspective, want td|sd)`);
  }
}

export function buildMatrix(asset, persp) {
  assertPersp(persp);
  const cells = [];
  for (const action of actionsFor(asset)) {
    for (const dir of MATRIX_DIRS) {
      const clipId = `${persp}/${action}/${dir}`;
      try {
        const frames = clipFrames(asset, persp, action, dir);
        cells.push({
          persp,
          action,
          dir,
          clipId,
          missing: false,
          files: frames.map((f) => f.file),
          frames,
          durationMs: frames[0].durationMs,
        });
      } catch (e) {
        cells.push({
          persp,
          action,
          dir,
          clipId,
          missing: true,
          files: [],
          frames: [],
          durationMs: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  return { persp, cells };
}

export function createPlayer(asset, persp, action, dir, index = 0) {
  const frames = clipFrames(asset, persp, action, dir);
  if (!Number.isInteger(index) || index < 0 || index >= frames.length) {
    throw new Error(`missing clip: ${persp}/${action}/${dir}:bad index ${JSON.stringify(index)}`);
  }
  return { asset, persp, action, dir, index, file: frames[index].file, durationMs: frames[index].durationMs };
}

export function tickPlayer(player) {
  // Asset is threaded through nextFrame (fixed in 0e98c10), so the returned
  // state feeds straight back into tickPlayer; attack tail falls back to the
  // same persp+dir idle frame 0 (locked by tools/clips.test.mjs).
  return nextFrame(player);
}

export function canExport(asset) {
  // Mirrors validateAsset missing-clip semantics (persp/action/dir naming)
  // without pulling node:fs, so the browser can gray out export.
  // Static kinds check idle only (8 clips); character checks 24 clips.
  const missing = [];
  for (const persp of MATRIX_PERSPS) {
    for (const action of actionsFor(asset)) {
      for (const dir of MATRIX_DIRS) {
        try {
          clipFrames(asset, persp, action, dir);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const id = msg.startsWith('missing clip: ') ? msg.slice('missing clip: '.length) : `${persp}/${action}/${dir}`;
          missing.push(id);
        }
      }
    }
  }
  return { ok: missing.length === 0, missing };
}
