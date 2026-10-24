# Spec Delta — prototype-import (server entry)

## ADDED Requirements

### Requirement: Server single-slot import

The system SHALL accept `POST /api/import` with multipart `(assetId, dir?, file)` for frozen static skeletons, decoding the upload in memory and reusing the CLI quantize-map-vectorize path (tiered quantize, kind palette, frozen clip slots, `td=sd` placeholder semantics unchanged), returning a preview first and writing only after confirm.

#### Scenario: Web import guarded

- **WHEN** uploading a PNG for `potion_001` via the bridge
- **THEN** preview lists the 8 view SVGs plus masters and compares, and commit lands byte-identical bytes to the CLI `--src` path with `--check-files` green
