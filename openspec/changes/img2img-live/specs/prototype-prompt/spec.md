# Spec Delta — `prototype-prompt`（ADDED 1 条：实调适配层）

## Purpose

Upgrades the reserved call site to a real three-provider adapter layer while the offline manual path stays frozen as fallback.

## ADDED Requirements

### Requirement: Live img2img adapter layer
The system SHALL ship a server-side adapter layer (`tools/img2img-providers.mjs`) exposing gemini, openai-compatible, and sd-webui adapters behind one interface, configured exclusively via environment variables, with zero keys in the repository; when no provider is configured, every capability SHALL fall back to the frozen manual import path without error, and tests and verify scripts SHALL never perform network calls.

#### Scenario: No-key fallback intact
- **WHEN** no provider environment variables are set
- **THEN** status reports zero configured providers and the manual import flow verifies green unchanged

#### Scenario: Adapter mapping honesty
- **WHEN** a provider lacks a native denoise or seed parameter
- **THEN** the adapter records the limitation in job metadata and docs instead of pretending determinism
