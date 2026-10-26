// kinds.mjs — single source of kind/tier constants (OpenSpec polish-hardening D1).
// Zero-dependency leaf: imported by asset-manifest / quantize / palette / sheet /
// import-prototype / vectorize / server. The frozen web/lib copies
// (asset-shell.js, prompt.js, matrix.js) deliberately stay unwired mirrors —
// keep them in sync by hand when this file changes.
export const CHARACTER_KIND = 'character';
export const STATIC_KINDS = ['weapon', 'building', 'prop', 'scenery'];
export const ALL_KINDS = [CHARACTER_KIND, ...STATIC_KINDS];

// Frozen size tiers per kind (design D1: character 32–64, weapon/prop 32–64,
// building/scenery 64–128; 128 is other-kinds only). `tiers` lists the exact
// allowed size档 values; min/max are the contract-level bounds.
export const KIND_SIZES = {
  [CHARACTER_KIND]: { min: 32, max: 64, tiers: [32, 48, 64] },
  weapon: { min: 32, max: 64, tiers: [32, 48, 64] },
  prop: { min: 32, max: 64, tiers: [32, 48, 64] },
  building: { min: 64, max: 128, tiers: [64, 128] },
  scenery: { min: 64, max: 128, tiers: [64, 128] },
};

// Alpha discard threshold shared by quantize/palette/vectorize (values below
// this alpha are transparent BEFORE palette mapping).
export const ALPHA_THRESHOLD = 128;

// Frame number from a clip file name ({prefix}_{persp}_{action}_{dir}{N}.svg);
// idle's 0-suffix files yield 0.
export function frameNumFromFile(file) {
  const m = String(file).match(/(\d+)\.svg$/);
  return m ? Number(m[1]) : 0;
}
