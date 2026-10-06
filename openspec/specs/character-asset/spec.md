# character-asset Specification

## Purpose
Defines the character asset model for 2D RPG: dual-perspective masters, four views, and the full-matrix completeness rule reused by other asset kinds.

## Requirements

### Requirement: Dual-perspective masters
The system SHALL store two independent masters per character asset: `master_td.svg` (top-down) and `master_side.svg` (side-view), each a front-view enlarged editable master.

#### Scenario: Masters exist
- **WHEN** a character asset is created
- **THEN** both `master_td.svg` and `master_side.svg` slots exist with perspective metadata

### Requirement: Four-direction views per perspective
The system SHALL provide fr/bk/lf/rt view SVGs per perspective, each an independent file named `{asset}_{td|sd}_{action}_{dir}{N}.svg`.

#### Scenario: Views listed
- **WHEN** viewing a character asset in perspective `td`
- **THEN** fr, bk, lf, rt entries are addressable and previewable

### Requirement: Full-matrix completeness gate
The system SHALL mark a character asset complete only when 24 clips exist (2 perspectives x 4 dirs x idle/walk/attack); any missing clip blocks engine export.

#### Scenario: Missing clip blocks export
- **WHEN** `attack_bk` frames are missing
- **THEN** export controls are disabled with the missing clip named

### Requirement: Asset directory layout
The system SHALL organize one asset as one folder containing masters, view/action SVGs, `asset.json`, and a palette reference (never embedded palette values).

#### Scenario: Folder inventory
- **WHEN** opening `knight_001/`
- **THEN** masters, per-view SVGs, `asset.json`, and palette reference are all present
