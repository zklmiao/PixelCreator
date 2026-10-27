# Spec Delta — `prototype-prompt`（ADDED 1 条：角色生成编排）

## Purpose

Generalizes the guardian-only derivation orchestration into a reusable character pipeline: dual text-to-image masters plus tiered img2img derivation under staged human gates.

## ADDED Requirements

### Requirement: Character generation orchestration with staged gates
The system SHALL provide a reusable character orchestration (dual txt2img masters for the td/sd front views, direction derivation at the direction tier, endpoint pose derivation, and frame-tier in-betweens) parameterized by asset id, gated in stages (masters → idle → walk → attack) where a stage SHALL NOT start before its parent stage is fully approved; regenerating an upstream source SHALL invalidate downstream drafts that reference it.

#### Scenario: Master approval precedes derivation
- **WHEN** a master image has not been approved
- **THEN** no derivation calls for its dependent views are offered

#### Scenario: Upstream retry invalidates downstream
- **WHEN** an approved master is regenerated
- **THEN** every downstream draft recording the old parent hash is marked stale and cannot enter creation

#### Scenario: Guardian behavior unchanged
- **WHEN** re-running the guardian import segment from committed fixtures
- **THEN** the landed bytes are identical to the pre-change state
