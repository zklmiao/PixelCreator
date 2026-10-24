# prototype-import Specification

## Purpose

Defines real-PNG prototype import: decode, tiered quantize, palette map, vectorize into frozen skeleton slots, plus side-by-side compare output. Dual track: committed fixtures for agent acceptance, `prototypes/<id>/` for user-supplied images.

## Requirements

### Requirement: Single-command real import

The system SHALL import a real PNG into a frozen static skeleton via `node tools/import-prototype.mjs --asset <id> --src <png>` (optional `--dir` overwrites one slot, optional `--out` redirects compare output), replicating one source to all 8 idle slots by default; import SHALL also write the two perspective masters (fr-slot content, data-master=true).

#### Scenario: Icon to skeleton
- **WHEN** importing a 34x34 RGBA icon into `potion_001`
- **THEN** 8 view SVGs land in the frozen clip slots and validate `--check-files` green

#### Scenario: Masters written with import
- **WHEN** importing into an asset whose masters are absent
- **THEN** both perspective masters land on disk with fr-slot content marked data-master=true

### Requirement: Multi-slot manifest import
The system SHALL support `node tools/import-prototype.mjs --asset <id> --map <manifest.json>` assigning one source PNG per clip slot for characters (idle/walk/attack × dirs × perspectives), with the manifest committed and reviewed.

#### Scenario: Guardian map
- **WHEN** importing `guardian_001` via `fixtures/guardian/guardian-map.json`
- **THEN** 40 view slots plus 2 masters land per the manifest and the reuse declaration matches landed bytes

### Requirement: Compare output contract

The system SHALL write `<basename>.compare.png` next to the import output (source left, quantized result right, integer upscale semantics) so humans and the web compare view share one path convention.

#### Scenario: Compare readable
- **WHEN** opening `fixtures/import/I_Chest01.compare.png`
- **THEN** source and quantized result are discernible side by side

### Requirement: Fixtures committed, user images local

The system SHALL commit curated fixtures under `fixtures/import/` (source zip + filename recorded in test comments) while user-supplied images live under gitignored `prototypes/<id>/` following the same compare convention.

#### Scenario: Offline deterministic test
- **WHEN** running import tests without network
- **THEN** all inputs resolve to committed fixtures and outputs are byte-identical across runs

### Requirement: Server single-slot import

The system SHALL accept `POST /api/import` with multipart `(assetId, dir?, file)` for frozen static skeletons, decoding the upload in memory and reusing the CLI quantize-map-vectorize path (tiered quantize, kind palette, frozen clip slots, `td=sd` placeholder semantics unchanged), returning a preview first and writing only after confirm.

#### Scenario: Web import guarded

- **WHEN** uploading a PNG for `potion_001` via the bridge
- **THEN** preview lists the 8 view SVGs plus masters and compares, and commit lands byte-identical bytes to the CLI `--src` path with `--check-files` green
