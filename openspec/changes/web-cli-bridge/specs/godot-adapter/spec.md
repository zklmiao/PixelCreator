# Spec Delta — godot-adapter (server entry)

## ADDED Requirements

### Requirement: Server tres export

The system SHALL accept `POST /api/tres/export { assetId }` calling the same `exportTres` path (Full maps only, animations `{persp}/{action}/{dir}`, `speed=fps`, loop mapping unchanged), returning preview then writing `godot/` only after confirm.

#### Scenario: Web tres matches CLI

- **WHEN** exporting `knight_001` tres via the bridge versus the CLI
- **THEN** the `.tres` text is identical with 24 animations and map-exact regions
