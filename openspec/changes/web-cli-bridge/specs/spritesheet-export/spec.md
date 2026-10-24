# Spec Delta — spritesheet-export (server entry)

## ADDED Requirements

### Requirement: Server sheet export

The system SHALL accept `POST /api/sheet/export { assetId }` calling the same `exportSheets` path (one action one PNG, rows `fr/bk/lf/rt`, Full/Maker dual mode, static single-frame full-only), returning preview then writing `sheets/` only after confirm.

#### Scenario: Web export matches CLI

- **WHEN** exporting `knight_001` via the bridge versus the CLI
- **THEN** PNG bytes and `map.json` are identical and the matrix refresh shows the new sheets
