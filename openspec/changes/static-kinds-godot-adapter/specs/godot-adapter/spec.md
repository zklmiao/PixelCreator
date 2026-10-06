# Spec Delta

## Purpose

Defines the Godot AtlasTexture recipe adapter over frozen map.json sheets: an executable human recipe plus generic direct-read extension, with all engine gap fields given explicit defaults.

## ADDED Requirements

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

### Requirement: No tres generator this round
The system SHALL NOT ship a `.tres`/`.godot` generator in this change; the adapter stops at recipe plus worked example, with generation deferred.

#### Scenario: No engine artifacts
- **WHEN** listing `engine-placeholder/` after this change
- **THEN** no `.tres`, `.godot`, or `.res` files exist
