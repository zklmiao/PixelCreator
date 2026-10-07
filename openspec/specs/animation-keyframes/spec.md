# animation-keyframes Specification

## Purpose
Defines animation keyframes for 2D RPG characters: per-action frame counts, timing, looping, and the matrix preview that guarantees what-you-see-is-what-exports.

## Requirements

### Requirement: Action definitions
The system SHALL support `idle` (1 frame, loop, 2fps), `walk` (2-5 frames, loop, 6fps), and `attack` (2-5 frames, once then `next:idle`, 8fps) per direction per perspective.

#### Scenario: Attack returns to idle
- **WHEN** an attack clip finishes playing
- **THEN** preview returns to the same direction idle frame

### Requirement: Per-action frame range
The system SHALL require 2-5 frames for each walk/attack clip and exactly 1 frame for idle.

#### Scenario: Frame count validation
- **WHEN** a walk clip has 1 frame or 6 frames
- **THEN** the asset is marked incomplete with a frame-count error

### Requirement: Matrix preview with perspective switch
The system SHALL render a preview matrix (actions x directions) of independent GIF-style loop players plus a td/sd perspective toggle switching the whole matrix.

#### Scenario: Perspective toggle
- **WHEN** user flips the td/sd toggle
- **THEN** all 12 clips reload from the other perspective with timing preserved

### Requirement: Missing-frame fallback in preview only
The system SHALL render missing export-blocking clips as placeholders in preview but SHALL allow playing existing clips; fallback stills never export.

#### Scenario: Placeholder preview
- **WHEN** `walk_bk_f2` is missing
- **THEN** its cell shows a placeholder with a generate affordance while other cells play

### Requirement: Static idle-only matrix
The system SHALL render a static preview matrix of idle-only cells (4 dirs per perspective, 8 total across the td/sd toggle) with the same per-cell player and missing-placeholder semantics as the character matrix; static cells SHALL reference only idle clips.

#### Scenario: Static toggle shows 8 idle cells
- **WHEN** loading `crate_001` and flipping the td/sd toggle
- **THEN** 4 idle cells show per side (8 total), timing preserved, and any missing idle clip parks as a named non-exporting placeholder
