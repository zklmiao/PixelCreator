# Spec Delta — web-bridge

## Purpose

Local bridge server contract that serves the repo read-only views and exposes the five CLI capabilities as confirm-then-write HTTP jobs, keeping offline determinism and byte-identical outputs.

## ADDED Requirements

### Requirement: Single-origin static plus API

The system SHALL serve `GET /web/ /assets/* /sheets/* /palettes/* /fixtures/* /godot/*` and `POST /api/*` from one `node tools/server.mjs` process bound to loopback, so the Web needs no separate static server.

#### Scenario: One command serves all

- **WHEN** running the bridge and opening `/web/`
- **THEN** asset JSON, sheets, and API share one origin and the matrix refreshes after a write without manual copy

### Requirement: Serial job queue with SSE progress

The system SHALL run write jobs serially (one at a time, extras queue) and expose `GET /api/jobs/:id/events` with `start/progress/log/done/error` events; short jobs (validate, single export) MAY answer synchronously.

#### Scenario: Long export streams

- **WHEN** exporting sheets for a character asset
- **THEN** the client receives per-file progress events and a terminal done event with the result list

### Requirement: Preview then confirm with backup

The system SHALL split every write into preview (`POST /api/*` returns `jobId` plus `willWrite[]/willBackup/bytesDelta` computed by a real in-memory dry run) and commit (`POST /api/jobs/:id/confirm`), copying affected files to `.backup/<assetId>/<timestamp>/` before writing; confirm tokens are single-use and expire after 10 minutes.

#### Scenario: Overwrite guarded

- **WHEN** importing into an asset with landed SVGs
- **THEN** the UI shows the will-write list for confirmation, and commit backs up then writes; identical input committed twice yields zero changes on the second run

### Requirement: Allowlist safety and error contract

The system SHALL allowlist `assetId` to the frozen 7 ids and `outDir` to fixed repo dirs (no `../` traversal), bind loopback only, and return machine-readable `{ ok:false, code, message }` errors for unknown asset, missing file, queue-full, expired token, and pipeline failures.

#### Scenario: Traversal rejected

- **WHEN** posting an assetId outside the allowlist or a path with traversal
- **THEN** the server rejects with a typed error and writes nothing
