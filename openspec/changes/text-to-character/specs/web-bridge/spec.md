# Spec Delta — `web-bridge`（ADDED 1 条：通用 edit 草稿端点与角色创建校验）

## Purpose

Adds a generic img2img draft endpoint (beyond the guardian-specific orchestrations) and extends the atomic create endpoint to characters with server-side parent-chain validation.

## ADDED Requirements

### Requirement: Generic edit drafts and character creation validation
The bridge SHALL expose `POST /api/img2img/edit` (generic image-edit draft job under the existing preview-then-confirm semantics, drafts landing only under the gitignored prototypes area) and accept character assets in `POST /api/asset/create`, validating the full parent chain server-side (rejecting stale parent references) before any write.

#### Scenario: Edit draft guarded
- **WHEN** an edit job is previewed but not confirmed
- **THEN** no repository file changes on disk

#### Scenario: Server-side chain validation
- **WHEN** a character creation job references a parent hash that no longer matches the draft image
- **THEN** the job is rejected with an explicit error and nothing is written
