# Spec Delta — `godot-adapter`（MODIFIED 1 条：退役 No-tres 条款，新增生成器）

## Purpose

Retires the recipe-only limitation: the adapter now ships a `.tres` generator over Full maps. Recipe hand path and gap defaults stay frozen.

## MODIFIED Requirements

### Requirement: Tres generator over Full maps (supersedes No-tres)

The system SHALL ship `tools/tres.mjs` generating `godot/<id>.spriteframes.tres` from shipped Full maps only (one file per asset; animations named `{persp}/{action}/{dir}`, speed=fps, loop→LOOP_FORWARD/LOOP_NONE, texture_filter nearest as documented default); the previous "No tres generator this round" requirement is retired by this change.

#### Scenario: Knight tres

- **WHEN** generating from knight Full maps (walk+attack plus idle sheets per A2)
- **THEN** one tres holds 24 animations (td/sd × idle/walk/attack × 4 dirs) with map-exact regions and timing
