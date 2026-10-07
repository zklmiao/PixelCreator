# Spec Delta — `prototype-import`（ADDED 1 条，余下冻结）

## Purpose

Adds multi-slot manifest import for characters. Single-source default and compare contract frozen.

## ADDED Requirements

### Requirement: Multi-slot manifest import

The system SHALL support `node tools/import-prototype.mjs --asset <id> --map <manifest.json>` assigning one source PNG per clip slot for characters (idle/walk/attack × dirs × perspectives), with the manifest committed and reviewed.

#### Scenario: Guardian map

- **WHEN** importing `guardian_001` via `fixtures/guardian/guardian-map.json`
- **THEN** 40 view slots plus 2 masters land per the manifest and the reuse declaration matches landed bytes
