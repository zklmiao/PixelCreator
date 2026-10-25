# svg-engineering Specification

## Purpose
Defines the SVG engineering contract: layered part structure, per-view files, import/export behavior, and the asset.json manifest that binds views, actions, and palettes together.

## Requirements

### Requirement: Layered part structure
The system SHALL structure every view SVG with groups `body`, `limb-l`, `limb-r`, `outfit`, and reserved `weapon-slot`, each part an independent path/rect set.

#### Scenario: Parts addressable
- **WHEN** opening any view SVG
- **THEN** body, limbs, outfit, and weapon-slot groups are separately selectable

### Requirement: One master plus N view files
The system SHALL store one master SVG per perspective plus one SVG per direction/action/frame clip; the front view equals the master at the asset's size tier, and both are grid-locked raster-derived SVGs. Masters SHALL regain vector precision only when a vector source import capability lands.

#### Scenario: Master versus front view
- **WHEN** exporting a view at the asset's size tier
- **THEN** it matches `master.svg` rasterized grid-aligned at that size

#### Scenario: Precision upgrade removal condition
- **WHEN** a vector source import capability lands in a future change
- **THEN** this grid-locked wording and its pinning test are replaced by a true-vector master requirement in that change

### Requirement: SVG metadata pointer
The system SHALL embed lightweight metadata (view, action, dir, perspective, size, palette ref, source prototype) in each SVG and keep timing/palette values in `asset.json`.

#### Scenario: Traceability
- **WHEN** inspecting a generated frame SVG
- **THEN** its source prototype, seed, and palette reference are recoverable

### Requirement: SVG import and export
The system SHALL import png/svg prototype collections and export per-view standalone SVGs plus the full asset folder round-trippable through re-import.

#### Scenario: Round trip
- **WHEN** exporting then re-importing an asset folder
- **THEN** all views, layers, and manifest entries restore without loss
