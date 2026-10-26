# Spec Delta — `web-bridge`（MODIFIED 2 条 + ADDED 1 条）

## Purpose

Hardens the bridge: the static service list gains the gitignored user-prototype workspace, the backup pass re-checks file existence at execution time (closing the preview→confirm gap), and generate gains clip-scoped scope.

## MODIFIED Requirements

### Requirement: Single-origin static plus API

The system SHALL serve `GET /web/ /assets/* /sheets/* /palettes/* /fixtures/* /godot/* /tools/* /prototypes/*` and `POST /api/*` from one `node tools/server.mjs` process bound to loopback, so the Web needs no separate static server (`/tools/` serves `web/lib/matrix.js`'s timing import; `/prototypes/` serves the gitignored user prototype workspace so the compare flow can display local files; loopback-only).

#### Scenario: One command serves all

- **WHEN** running the bridge and opening `/web/`
- **THEN** asset JSON, sheets, and API share one origin and the matrix refreshes after a write without manual copy

#### Scenario: Local prototype workspace reachable

- **WHEN** a user places files under `prototypes/<id>/`
- **THEN** they are reachable from the compare flow on the same origin (missing files still degrade gracefully)

### Requirement: Preview then confirm with backup

The system SHALL split every write into preview (`POST /api/*` returns `jobId` plus `willWrite[]/willBackup/bytesDelta` computed by a real in-memory dry run) and commit (`POST /api/jobs/:id/confirm`), backing up each will-write path that exists **at execution time** (re-checked per path, not from the preview snapshot) to `.backup/<assetId>/<timestamp>/` before writing; confirm tokens are single-use and expire after 10 minutes.

#### Scenario: Overwrite guarded

- **WHEN** importing into an asset with landed SVGs
- **THEN** the UI shows the will-write list for confirmation, and commit backs up then writes; identical input committed twice yields zero changes on the second run

#### Scenario: Late-created files are backed up too

- **WHEN** a will-write path comes into existence between preview and confirm
- **THEN** the execution pass backs it up before overwriting

## ADDED Requirements

### Requirement: Clip-scoped regeneration

The system SHALL support `POST /api/generate` with an optional `clip` field (`"<persp>/<action>/<dir>"`): the preview `willWrite[]` SHALL list exactly the frame files of that clip, and confirm SHALL write only those files; omitting `clip` SHALL regenerate the whole asset (existing behavior).

#### Scenario: Single-clip willWrite

- **WHEN** generating `knight_001` with clip `td/walk/fr`
- **THEN** willWrite lists exactly the 3 frame SVGs of `td/walk` and no other asset file
