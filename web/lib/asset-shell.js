// asset-shell.js — 1.1 browser-safe shell loader (no node:fs).
// Mirrors tools/asset-manifest.mjs rules for the shell check only.
// Frozen-contract note: only reads assets/knight_001/asset.json, never writes it.

export const PERSPECTIVES = ['td', 'sd'];
export const DIRS = ['fr', 'bk', 'lf', 'rt'];
export const ACTIONS = ['idle', 'walk', 'attack'];

const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function checkShell(asset) {
  const errors = [];
  if (!asset || typeof asset !== 'object') return { ok: false, errors: ['manifest is not an object'] };
  if (!sameSet(asset.perspectives ?? [], PERSPECTIVES)) errors.push('perspectives must be exactly [td, sd]');
  if (!sameSet(asset.views ?? [], DIRS)) errors.push('views must be exactly [fr, bk, lf, rt]');
  for (const p of PERSPECTIVES) {
    if (!asset.masters?.[p] || typeof asset.masters[p] !== 'string') errors.push(`masters.${p} must be a path string`);
  }
  if (!asset.actions?.idle || !asset.actions?.walk || !asset.actions?.attack) {
    errors.push('actions must include idle/walk/attack shells');
  }
  const pv = asset.preview;
  if (!pv || !PERSPECTIVES.includes(pv.perspective) || !ACTIONS.includes(pv.action) || !DIRS.includes(pv.dir)) {
    errors.push('preview must reference an existing perspective/action/dir');
  }
  return { ok: errors.length === 0, errors };
}

export function masterSlots(asset) {
  return PERSPECTIVES.map((p) => ({ perspective: p, file: asset?.masters?.[p] ?? '(missing)' }));
}

export async function loadShell(url = '../assets/knight_001/asset.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const asset = await res.json();
  return { asset, shell: checkShell(asset), slots: masterSlots(asset) };
}
