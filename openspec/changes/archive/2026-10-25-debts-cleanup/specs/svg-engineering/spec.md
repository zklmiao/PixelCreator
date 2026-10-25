# Spec Delta — `svg-engineering`（MODIFIED 1 条：母版精度条款降格）

## Purpose

The raster import pipeline derives masters from the same 64/128px grid as views; "infinite precision" is unreachable until a vector source import exists. Downgrades the clause to grid-locked masters with an explicit upgrade path (removal condition), mirroring the guardian td-placeholder pattern.

## MODIFIED Requirements

### Requirement: One master plus N view files
The system SHALL store one master SVG per perspective plus one SVG per direction/action/frame clip; the front view equals the master at the asset's size tier, and both are grid-locked raster-derived SVGs. Masters SHALL regain vector precision only when a vector source import capability lands.

#### Scenario: Master versus front view
- **WHEN** exporting a view at the asset's size tier
- **THEN** it matches `master.svg` rasterized grid-aligned at that size

#### Scenario: Precision upgrade removal condition
- **WHEN** a vector source import capability lands in a future change
- **THEN** this grid-locked wording and its pinning test are replaced by a true-vector master requirement in that change
