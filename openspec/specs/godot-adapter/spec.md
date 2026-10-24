# godot-adapter Specification

## Purpose
Defines the Godot AtlasTexture recipe adapter over frozen map.json sheets: an executable human recipe plus generic direct-read extension, with all engine gap fields given explicit defaults.

## Requirements

### Requirement: Executable import recipe
The system SHALL ship `engine-placeholder/godot-atlas/IMPORT-RECIPE.md` mapping each map.json to AtlasTexture regions (`region=x/y/w/h`), `fps/loop/next`, with gap #13–#17 defaults stated and no map.json change.

#### Scenario: Recipe executes by hand
- **WHEN** following the recipe for `knight_td_walk.png`
- **THEN** 4 direction animations build with correct regions, timing, and attack-to-idle transition

### Requirement: Gap defaults stated
The system SHALL declare `texture_filter=nearest`, anchor/offset defaults, animation naming `{persp}/{action}/{dir}`, direction enum mapping, `loop→loop_mode`, `speed_scale=1.0`, and no-hitbox/no-mount defaults in the recipe.

#### Scenario: Defaults auditable
- **WHEN** reading the recipe gap section
- **THEN** every §2 gap item #13–#20 has either a mapping or an explicit default statement

### Requirement: Generic extension for statics
The system SHALL document how static assets reuse the generic direct-read contract, and any new `generic/` file MUST be covered by the exact file-set assertion in `tools/placeholder.test.mjs`.

#### Scenario: File-set lockstep
- **WHEN** a `generic/` file is added without updating the test
- **THEN** `node --test tools/placeholder.test.mjs` fails naming the drift

### Requirement: Tres generator over Full maps
The system SHALL ship `tools/tres.mjs` generating `godot/<id>.spriteframes.tres` from shipped Full maps only (one file per asset; animations named `{persp}/{action}/{dir}`, speed=fps, loop→LOOP_FORWARD/LOOP_NONE, texture_filter nearest as documented default). The previous "No tres generator this round" requirement is retired by the real-character-m3 change.

#### Scenario: Knight tres
- **WHEN** generating from knight Full maps (walk+attack plus idle sheets)
- **THEN** one tres holds 24 animations (td/sd × idle/walk/attack × 4 dirs) with map-exact regions and timing

### Requirement: Server tres export

The system SHALL accept `POST /api/tres/export { assetId }` calling the same `exportTres` path (Full maps only, animations `{persp}/{action}/{dir}`, `speed=fps`, loop mapping unchanged), returning preview then writing `godot/` only after confirm.

#### Scenario: Web tres matches CLI

- **WHEN** exporting `knight_001` tres via the bridge versus the CLI
- **THEN** the `.tres` text is identical with 24 animations and map-exact regions
