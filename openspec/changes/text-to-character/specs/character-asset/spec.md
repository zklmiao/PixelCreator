# Spec Delta — `character-asset`（ADDED 1 条：生成式角色创建与父图溯源）

## Purpose

New characters can be created from the staged generation pipeline; derived slots trace to their parent frame bytes, and the historical double-null AI slots stay quarantined to guardian.

## ADDED Requirements

### Requirement: Generated character creation with parent traceability
The system SHALL support creating a complete character asset (24 clips: idle 1 / walk 3 / attack 3 × 4 dirs × 2 perspectives, 56 view slots plus 2 masters, sheets and tres included) in one atomic step from a character generation manifest; master slots SHALL carry prompt_hash plus source_hash of their own source image, derived slots SHALL carry prompt_hash plus source_hash of their parent image, and the manifest SHALL record the parent chain; the guardian_001 historical slots (AI mid frames with null hashes) SHALL remain unchanged.

#### Scenario: New character lands complete
- **WHEN** creation runs against a complete character generation manifest
- **THEN** 56 views plus 2 masters, fixtures, manifest, sheets and tres land atomically with per-slot hashes populated

#### Scenario: Stale parent chain refused
- **WHEN** any slot's recorded parent hash no longer matches its parent draft image
- **THEN** creation fails with an explicit error and nothing is written

#### Scenario: Guardian untouched
- **WHEN** validating guardian_001 after this change
- **THEN** its asset.json and fixtures are byte-identical to the prior state
