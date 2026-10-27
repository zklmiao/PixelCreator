# Spec Delta — `prototype-prompt`（ADDED 1 条：txt2img 适配层）

## Purpose

Adds the text-to-image entry (no input image) to the provider layer under the same env-only configuration, key boundary, and offline fallback as img2img editing.

## ADDED Requirements

### Requirement: Live txt2img adapter layer
The system SHALL expose text-to-image generation (`generateImage`) behind the same provider registry and environment-only configuration as img2img editing, with zero keys in the repository; when no provider is configured, text-to-image SHALL be explicitly unavailable while the frozen manual import path stays intact, and tests and verify scripts SHALL never perform network calls.

#### Scenario: No-key fallback intact
- **WHEN** no provider environment variables are set
- **THEN** text-to-image calls fail with an explicit not-configured error and the manual import flow verifies green unchanged

#### Scenario: Generation honesty
- **WHEN** the active provider lacks a native seed or exact-size parameter
- **THEN** the adapter records the limitation in job metadata and docs instead of pretending determinism
