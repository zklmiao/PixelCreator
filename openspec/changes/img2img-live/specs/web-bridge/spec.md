# Spec Delta — `web-bridge`（ADDED 1 条：img2img 端点与密钥边界）

## Purpose

Extends the bridge with img2img orchestration endpoints; the page never sees keys.

## ADDED Requirements

### Requirement: img2img endpoints with key boundary
The bridge SHALL expose `GET /api/img2img/status` returning configured provider names only (never key material), plus `POST /api/img2img/inbetween` and `POST /api/img2img/derive-td` write jobs under the existing preview-then-confirm-with-backup semantics and serial queue.

#### Scenario: Status never leaks secrets
- **WHEN** calling status with a key configured via environment
- **THEN** the response names the provider and contains no key substring

#### Scenario: Orchestration writes are guarded
- **WHEN** an inbetween or derive job is previewed but not confirmed
- **THEN** no asset file changes on disk
