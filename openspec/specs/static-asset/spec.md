# static-asset Specification

## Purpose
Defines static four-view assets for weapon, building, prop, and scenery kinds: dual-perspective idle-only skeletons with kind-aware manifest gates and deterministic regeneration.

## Requirements

### Requirement: Static skeleton shape
The system SHALL represent each static asset as 2 perspectives × 4 dirs × idle 1 frame (8 view SVGs + 2 masters), files named `{asset}_{td|sd}_idle_{dir}0.svg` with palette reference only.

#### Scenario: Skeleton inventory
- **WHEN** opening `assets/sword_001/asset.json`
- **THEN** 8 idle clips exist (td/sd × fr/bk/lf/rt, 1 frame each) plus td/sd masters and no walk/attack actions

### Requirement: Kind-aware manifest gates
The system SHALL accept kinds `character|weapon|building|prop|scenery`, require `palette_{kind}@vN`, sizes character/weapon/prop 32/48/64 and building/scenery up to 128, and idle-only actions for static kinds.

#### Scenario: Wrong palette rejected
- **WHEN** a weapon asset references `palette_character@v1`
- **THEN** validation fails naming the palette/kind mismatch

#### Scenario: Character keeps full matrix
- **WHEN** validating `knight_001`
- **THEN** idle/walk/attack 24-clip completeness still enforced unchanged

### Requirement: Deterministic static regen
The system SHALL regenerate static SVGs byte-identically from the manifest, with all 8 cells of one asset pairwise distinct by orientation cue.

#### Scenario: Byte-identical regen
- **WHEN** regenerating `crate_001` twice from the same manifest
- **THEN** all 8 SVGs are byte-identical across runs

### Requirement: Palette values never embedded
The system SHALL keep raw palette hex values out of `asset.json` and view SVGs, carrying only the `palette_{kind}@vN` reference plus mapped color names.

#### Scenario: Reference only
- **WHEN** inspecting a static `asset.json`
- **THEN** no `#RRGGBB` color literals appear outside the palette file reference
