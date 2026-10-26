# Spec Delta — `character-asset`（REMOVED 1 条 + ADDED 1 条：guardian td 占位退役）

## Purpose

Exercises the placeholder's own removal condition: guardian now holds derived top-down sources, so the td==sd allowance retires and a derivation path requirement takes its place.

## REMOVED Requirements

### Requirement: Shared-perspective placeholder allowance
A real-imported character asset MAY fill td slots with sd-identical pixels, provided a test pins td==sd byte equality as a placeholder and docs declare it; the allowance SHALL be removed with the placeholder test once a true top-down source lands.
- Retired by this change: guardian_001's derived td sources landed, the placeholder test is deleted, and the allowance has no remaining users.

## ADDED Requirements

### Requirement: Top-down derivation for imported characters
The system SHALL provide a derivation path (direction-tier img2img over side views, or any future true source) producing dedicated td sources for imported characters; td slots SHALL hold their own sources, never sd byte-copies.

#### Scenario: Guardian holds dedicated td sources
- **WHEN** comparing any guardian td view file with its sd counterpart
- **THEN** they are pixel-derivative siblings from distinct sources, not byte-identical copies
