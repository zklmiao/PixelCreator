# Spec Delta — `web-bridge`（ADDED 2 条：动态注册表 + txt2img/创建端点）

## Purpose

The bridge stops being a closed 7-id allowlist: validated assets register dynamically, and text-to-image drafts plus atomic asset creation run as two-phase jobs.

## ADDED Requirements

### Requirement: Dynamic asset registry
The bridge SHALL derive the served asset set by scanning `assets/*/asset.json` and admitting only manifests that pass validation, exposing `GET /api/assets` (read-only, id/kind/size, no secrets); unknown or invalid ids SHALL keep the existing `UNKNOWN_ASSET` error contract.

#### Scenario: Registry reflects validated assets only
- **WHEN** an assets subdirectory holds an incomplete or invalid manifest
- **THEN** it does not appear in `/api/assets` and cannot be targeted by any bridge operation

#### Scenario: Frozen baseline intact
- **WHEN** reading the registry with no user-created assets present
- **THEN** it contains the frozen seven ids

### Requirement: Text-to-image draft and atomic create endpoints
The bridge SHALL expose `POST /api/txt2img` (draft generation job) and `POST /api/asset/create` (atomic creation job) under the existing preview-then-confirm semantics and serial queue; unconfirmed drafts SHALL write nothing, confirmed drafts SHALL land only under the gitignored prototypes draft area, and a confirmed creation SHALL either land the complete asset set in one job or leave the pre-existing state intact.

#### Scenario: Draft preview is zero-disk
- **WHEN** a txt2img job is previewed but not confirmed
- **THEN** no repository file changes on disk

#### Scenario: Create is atomic
- **WHEN** a creation job is confirmed
- **THEN** all asset files land in one job, or the job fails leaving the pre-existing state intact
