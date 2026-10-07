# spritesheet-export Specification

## Purpose
Defines spritesheet stitching for RPG engines: one sheet per action, fixed row order, dual export modes for RPG Maker compatibility and full-fidelity atlases.

## Requirements

### Requirement: One sheet per action
The system SHALL export one PNG per perspective per action (e.g. `knight_td_walk.png`, `knight_td_attack.png`) with rows fr/bk/lf/rt, zero padding, 1x cells, plus a `map.json` frame index.

#### Scenario: Sheet geometry
- **WHEN** exporting a 3-frame walk at 64px
- **THEN** output is 192x256 PNG with rows in fr/bk/lf/rt order

### Requirement: RPG Maker compatibility mode
The system SHALL offer a Maker mode forcing 3 columns (take f1/f2/f3, pad short clips with idle, truncate long ones) with `$`-prefixed single-character naming.

#### Scenario: Five-frame attack to Maker
- **WHEN** exporting a 4-frame attack in Maker mode
- **THEN** output is 3 columns with documented truncation mapping

### Requirement: Full-fidelity mode
The system SHALL offer a full mode preserving native frame counts with per-frame x/y/w/h, fps, loop, and next-action fields in `map.json` for Godot and generic engines.

#### Scenario: Godot import
- **WHEN** importing full-mode sheet plus map.json
- **THEN** all frames, timing, and attack-to-idle transition reconstruct

### Requirement: Perspectives never merged
The system SHALL never merge td and sd perspectives into one sheet; perspective switch always swaps sheet files.

#### Scenario: Toggle export
- **WHEN** previewing in sd
- **THEN** export offers sd sheets, never a combined td+sd sheet

### Requirement: Static single-frame export
The system SHALL export static idle-only assets as one PNG per perspective (`<prefix>_<persp>_idle.png`, 4 columns × 1 row, `cell = asset.size`, column order fr/bk/lf/rt) plus a full-mode `map.json` (x/y/w/h, fps 2, loop true); Maker mode SHALL NOT apply to static single frames.

#### Scenario: Potion sheets
- **WHEN** exporting `potion_001` at 64px
- **THEN** each perspective PNG is 256x64 with 4 cells in fr/bk/lf/rt order and every opaque pixel is an exact palette byte
