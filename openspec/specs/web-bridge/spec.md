# web-bridge Specification

## Purpose
Local bridge server contract that serves the repo read-only views and exposes the five CLI capabilities as confirm-then-write HTTP jobs, keeping offline determinism and byte-identical outputs.

## Requirements

### Requirement: Single-origin static plus API

The system SHALL serve `GET /web/ /assets/* /sheets/* /palettes/* /fixtures/* /godot/* /tools/* /prototypes/*` and `POST /api/*` from one `node tools/server.mjs` process bound to loopback, so the Web needs no separate static server (`/tools/` serves `web/lib/matrix.js`'s timing import; `/prototypes/` serves the gitignored user prototype workspace so the compare flow can display local files; loopback-only).

#### Scenario: One command serves all

- **WHEN** running the bridge and opening `/web/`
- **THEN** asset JSON, sheets, and API share one origin and the matrix refreshes after a write without manual copy

#### Scenario: Local prototype workspace reachable

- **WHEN** a user places files under `prototypes/<id>/`
- **THEN** they are reachable from the compare flow on the same origin (missing files still degrade gracefully)

### Requirement: Serial job queue with SSE progress

The system SHALL run write jobs serially (one at a time, extras queue) and expose `GET /api/jobs/:id/events` with `start/progress/log/done/error` events; short jobs (validate, single export) MAY answer synchronously.

#### Scenario: Long export streams

- **WHEN** exporting sheets for a character asset
- **THEN** the client receives per-file progress events and a terminal done event with the result list

### Requirement: Preview then confirm with backup

The system SHALL split every write into preview (`POST /api/*` returns `jobId` plus `willWrite[]/willBackup/bytesDelta` computed by a real in-memory dry run) and commit (`POST /api/jobs/:id/confirm`), backing up each will-write path that exists **at execution time** (re-checked per path, not from the preview snapshot) to `.backup/<assetId>/<timestamp>/` before writing; confirm tokens are single-use and expire after 10 minutes.

#### Scenario: Overwrite guarded

- **WHEN** importing into an asset with landed SVGs
- **THEN** the UI shows the will-write list for confirmation, and commit backs up then writes; identical input committed twice yields zero changes on the second run

#### Scenario: Late-created files are backed up too

- **WHEN** a will-write path comes into existence between preview and confirm
- **THEN** the execution pass backs it up before overwriting

### Requirement: Allowlist safety and error contract

The system SHALL allowlist `assetId` to the frozen 7 ids and `outDir` to fixed repo dirs (no `../` traversal), bind loopback only, and return machine-readable `{ ok:false, code, message }` errors for unknown asset, missing file, queue-full, expired token, and pipeline failures.

#### Scenario: Traversal rejected

- **WHEN** posting an assetId outside the allowlist or a path with traversal
- **THEN** the server rejects with a typed error and writes nothing

### Requirement: img2img endpoints with key boundary
The bridge SHALL expose `GET /api/img2img/status` returning configured provider names only (never key material), plus `POST /api/img2img/inbetween` and `POST /api/img2img/derive-td` write jobs under the existing preview-then-confirm-with-backup semantics and serial queue.

#### Scenario: Status never leaks secrets
- **WHEN** calling status with a key configured via environment
- **THEN** the response names the provider and contains no key substring

#### Scenario: Orchestration writes are guarded
- **WHEN** an inbetween or derive job is previewed but not confirmed
- **THEN** no asset file changes on disk

### Requirement: Clip-scoped regeneration

The system SHALL support `POST /api/generate` with an optional `clip` field (`"<persp>/<action>/<dir>"`): the preview `willWrite[]` SHALL list exactly the frame files of that clip, and confirm SHALL write only those files; omitting `clip` SHALL regenerate the whole asset (existing behavior).

#### Scenario: Single-clip willWrite

- **WHEN** generating `knight_001` with clip `td/walk/fr`
- **THEN** willWrite lists exactly the 3 frame SVGs of `td/walk` and no other asset file
