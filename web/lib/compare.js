// compare.js — M2 import compare view data (pure ESM, zero dependencies).
// Convention shared with tools/import-prototype.mjs (wt-A) and the web view:
// fixtures ship 3 committed compare PNGs (source left, quantized right,
// integer upscale semantics); user-supplied images follow the same layout
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
