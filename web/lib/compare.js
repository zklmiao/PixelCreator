// compare.js — M2 import compare view data (pure ESM, zero dependencies).
// Convention shared with tools/import-prototype.mjs (wt-A) and the web view:
// fixtures ship 3 committed compare PNGs (source left at native width,
// quantized result right at the asset size档: 98x64 = 34 + 64, shared
// height 64); user-supplied images follow the same layout
// under gitignored prototypes/<assetId>/input.compare.png.
// Browser-safe (no node: imports); missing files are handled by the caller
// via img onerror so the page never crashes.

export const COMPARE_FIXTURES = [
  { name: 'I_Chest01', url: '../fixtures/import/I_Chest01.compare.png' },
  { name: 'I_Key01', url: '../fixtures/import/I_Key01.compare.png' },
  { name: 'I_GoldCoin', url: '../fixtures/import/I_GoldCoin.compare.png' },
];

export const COMPARE_SOURCES = [
  { name: 'I_Chest01', url: '../fixtures/import/I_Chest01.png' },
  { name: 'I_Key01', url: '../fixtures/import/I_Key01.png' },
  { name: 'I_GoldCoin', url: '../fixtures/import/I_GoldCoin.png' },
];

export function prototypeCompareUrlFor(assetId, base = 'input') {
  return `../prototypes/${assetId}/${base}.compare.png`;
}

export function prototypeInputFor(assetId) {
  return `prototypes/${assetId}/input.png`;
}

// M3 guardian provenance (fixtures/guardian/, wt-A): the guardian compare
// grid is data-driven from the committed map (clip -> source file) so the
// view never hardcodes source names. Missing map/files park placeholders.
export const GUARDIAN_MAP_URL = '../fixtures/guardian/guardian-map.json';
export const GUARDIAN_DIR_URL = '../fixtures/guardian/';

function leafName(ref) {
  const s = String(ref ?? '');
  const cut = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return cut >= 0 ? s.slice(cut + 1) : s;
}

export function collectPngRefs(node, out = []) {
  if (typeof node === 'string') {
    if (/\.png$/i.test(node)) out.push(node);
  } else if (Array.isArray(node)) {
    for (const v of node) collectPngRefs(v, out);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectPngRefs(v, out);
  }
  return out;
}

// Unique guardian source basenames (drops *.compare.png, keeps first-seen
// order); compare file for a source follows the <basename>.compare.png
// convention shared with the import compare contract.
export function guardianSourcesFromMap(map) {
  const seen = [];
  for (const ref of collectPngRefs(map)) {
    const base = leafName(ref);
    if (/\.compare\.png$/i.test(base)) continue;
    if (!seen.includes(base)) seen.push(base);
  }
  return seen;
}

export function compareNameForSource(base) {
  return base.replace(/\.png$/i, '.compare.png');
}

export function guardianCompareUrlFor(base) {
  return `${GUARDIAN_DIR_URL}${compareNameForSource(base)}`;
}

export function guardianSourceUrlFor(base) {
  return `${GUARDIAN_DIR_URL}${base}`;
}
