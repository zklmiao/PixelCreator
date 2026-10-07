// asset-shell.js — 1.1 browser-safe shell loader (no node:fs).
// Mirrors tools/asset-manifest.mjs rules for the shell check only.
// Frozen-contract note: only reads assets/knight_001/asset.json, never writes it.

export const PERSPECTIVES = ['td', 'sd'];
export const DIRS = ['fr', 'bk', 'lf', 'rt'];
export const ACTIONS = ['idle', 'walk', 'attack'];

export const KINDS = ['character', 'weapon', 'building', 'prop', 'scenery'];
export const STATIC_KINDS = ['weapon', 'building', 'prop', 'scenery'];

export const ASSET_IDS = ['knight_001', 'sword_001', 'house_001', 'crate_001', 'tree_001', 'potion_001'];
export const ASSET_URLS = {
  knight_001: '../assets/knight_001/asset.json',
  sword_001: '../assets/sword_001/asset.json',
  house_001: '../assets/house_001/asset.json',
  crate_001: '../assets/crate_001/asset.json',
  tree_001: '../assets/tree_001/asset.json',
  potion_001: '../assets/potion_001/asset.json',
};

export function assetUrlFor(id) {
  if (ASSET_URLS[id] !== undefined) return ASSET_URLS[id];
  throw new Error(`unknown asset id: ${id} (want ${ASSET_IDS.join(', ')})`);
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

const kindOf = (asset) => asset?.kind ?? 'character';

export function checkShell(asset) {
  const errors = [];
  if (!asset || typeof asset !== 'object') return { ok: false, errors: ['manifest is not an object'] };
  const kind = kindOf(asset);
  const isStatic = STATIC_KINDS.includes(kind);
  if (!sameSet(asset.perspectives ?? [], PERSPECTIVES)) errors.push('perspectives must be exactly [td, sd]');
  if (!sameSet(asset.views ?? [], DIRS)) errors.push('views must be exactly [fr, bk, lf, rt]');
  for (const p of PERSPECTIVES) {
    if (!asset.masters?.[p] || typeof asset.masters[p] !== 'string') errors.push(`masters.${p} must be a path string`);
  }
  if (!isStatic) {
    if (!asset.actions?.idle || !asset.actions?.walk || !asset.actions?.attack) {
      errors.push('actions must include idle/walk/attack shells');
    }
    const pv = asset.preview;
    if (!pv || !PERSPECTIVES.includes(pv.perspective) || !ACTIONS.includes(pv.action) || !DIRS.includes(pv.dir)) {
      errors.push('preview must reference an existing perspective/action/dir');
    }
    return { ok: errors.length === 0, errors };
  }
  // Static idle-only branch: character wording above untouched.
  if (asset.actions?.walk !== undefined) {
    errors.push(`static kind "${kind}" must not define action "walk" (idle only)`);
  }
  if (asset.actions?.attack !== undefined) {
    errors.push(`static kind "${kind}" must not define action "attack" (idle only)`);
  }
  if (!asset.actions?.idle) {
    for (const p of PERSPECTIVES) {
      for (const d of DIRS) errors.push(`missing clip: ${p}/idle/${d}:action absent`);
    }
  }
  const pv = asset.preview;
  if (!pv || !PERSPECTIVES.includes(pv.perspective) || pv.action !== 'idle' || !DIRS.includes(pv.dir)) {
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
