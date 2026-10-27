# Spec Delta — `prototype-import`（ADDED 1 条：角色创建段）

## Purpose

Extends atomic creation from static assets to characters: 56 view slots plus 2 masters land from a character generation manifest with sheets and tres.

## ADDED Requirements

### Requirement: Character creation from a generation manifest
The system SHALL support creating a character asset from a committed character generation manifest (56 view slots + 2 masters + source fixtures + manifest + 6 Full and 4 Maker sheets + tres) atomically, refusing an existing id, and re-running from the committed inputs byte-identically.

#### Scenario: Character re-run determinism
- **WHEN** creation re-runs from the committed character fixtures and manifest
- **THEN** all artifacts are byte-identical to the first run

#### Scenario: Existing id refused
- **WHEN** the target character id already exists under assets/
- **THEN** creation fails with an explicit error and no file changes
