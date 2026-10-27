# Spec Delta — `prototype-import`（ADDED 1 条：gen manifest 原子创建静态资产）

## Purpose

Generated sources become a first-class import origin: a committed generation manifest drives an atomic creation of a whole static asset, keeping the repo-reproducible source-to-artifact chain.

## ADDED Requirements

### Requirement: Atomic static asset creation from a generation manifest
The system SHALL support creating a complete static asset (asset.json skeleton + 8 view slots + 2 masters + source fixtures + generation manifest + single-frame sheets) in one atomic step from a committed generation manifest, assigning `prompt_hash` (prompt template hash) and `source_hash` (sha256-12 of each source image) as real values on every slot; creation SHALL refuse to overwrite an existing asset id, and re-running creation from the committed fixtures SHALL be byte-identical.

#### Scenario: Create from manifest
- **WHEN** running asset creation against a committed generation manifest with 8 source images
- **THEN** the full asset set lands atomically with both hashes populated and the sheets exported, and a re-run from the same committed inputs is byte-identical

#### Scenario: Existing id refused
- **WHEN** the target asset id already exists under assets/
- **THEN** creation fails with an explicit error and no file changes
