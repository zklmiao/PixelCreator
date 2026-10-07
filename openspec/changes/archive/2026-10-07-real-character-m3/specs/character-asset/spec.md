# Spec Delta — `character-asset`（ADDED 1 条，余下冻结）

## Purpose

Permits a documented td-sharing placeholder for real-imported characters until a true top-down source arrives. The 24-clip gate itself is unchanged.

## ADDED Requirements

### Requirement: Shared-perspective placeholder allowance

A real-imported character asset MAY fill td slots with sd-identical pixels, provided a test pins td==sd byte equality as a placeholder and docs declare it; the allowance SHALL be removed with the placeholder test once a true top-down source lands.

#### Scenario: Guardian td placeholder

- **WHEN** listing `guardian_001` td views
- **THEN** each td file is byte-identical to its sd counterpart and a placeholder test names the sharing
