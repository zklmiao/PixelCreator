# Design — static-kinds-godot-adapter

## Context

See proposal.md Why. Frozen baselines: `asset.schema.json` v1 is character-only; `knight_001` 24-clip matrix green (91 tests); `map.json` field set frozen by 7.1; `engine-placeholder/generic/` holds 17 files with exact-set test lock. Prep commit (this change, main-side) freezes the kind-aware schema plus 4 static skeletons before wt work starts.

## Goals / Non-Goals

**Goals:**
- 5-asset manifest green with one kind-aware validator (character matrix untouched).
- Static SVGs deterministic and orientation-distinct, reusing the vectorize synth pattern with per-kind motifs.
- Recipe-grade Godot adapter: a human can build AtlasTextures from shipped sheets with zero map.json change.

**Non-Goals:**
- No static sheets/`.tres` generation, no OKLCH, no Bayer, no img2img call, no action matrices or mount bindings for statics.

## Decisions

- **Schema: per-kind action sets, not one shape**: character keeps `idle/walk/attack` required; static kinds require `idle` only (frames exactly 1, fps 2, loop true). Alternative single-shape-with-optional-actions rejected: it would weaken the character completeness gate.
- **Sizes/palettes keyed by kind**: `palette_{kind}@vN` regex plus `size` enum split (character/weapon/prop 32/48/64; building/scenery +128). Keeps 128-cell vectors out of character tests while opening scenery scale later.
- **Static generator = synth pattern reuse**: extend `vectorize.mjs` with per-kind motif functions (blade/gable/crate/canopy) on the same rect-grid + outline + orientation-cue idiom as `synthKnightPixels`, exported for tests; no new PNG dependency.
- **Validator era split**: `validateAsset` branches on `kind` for actions/palette/size but shares file-naming, seed/hash, masters, and `--check-files` disk checks. Character behavior byte-for-byte preserved (existing tests must pass unmodified).
- **Adapter is recipe-only**: IMPORT-RECIPE maps existing fields (`sheet/x/y/w/h/fps/loop/next`) to AtlasTexture + AnimatedSprite2D steps and states every gap default in prose; a worked `knight_td_walk` example plus a recipe self-check script (parses maps, asserts regions inside geometry) proves executability without Godot present.
- **Test strategy carries over**: value-asserting tests only (exact fps/loop/size/file-set, geometry math, byte-copy), plus mutation red-checks in review; placeholder exact-set test grows in the same commit as any `generic/` addition.

## Risks / Trade-offs

- [Static motifs look samey across dirs] → per-kind orientation cue required by spec (8 cells pairwise distinct test).
- [Kind branch rots character gate] → character assertions stay first and existing suite runs unmodified in review.
- [Recipe drifts from maps] → recipe self-check re-derives regions from shipped maps; review re-runs it.
- [128px static weight] → skeletons stay 64 this round; 128 is schema-allowed, generator-tested later.

## Migration Plan

Prep commit on main (schema + 4 skeletons + this proposal/design/tasks/specs). wt branches merge it, implement, merge back --no-ff. Rollback: revert wt merges, then prep commit; archived MVP specs untouched.

## Open Questions

- Static sheet packing (one idle sheet per kind?) — deferred; statics ship SVG-only this round.
- Side-view fr/bk deprecation gate (MVP open question) — untouched; static skeletons keep 4 dirs.
