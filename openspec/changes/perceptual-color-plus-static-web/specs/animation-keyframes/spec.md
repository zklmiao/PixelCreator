# Spec Delta — `animation-keyframes`（ADDED 1 条，余下冻结）

## Purpose

预览矩阵新增静态 idle-only 形态：character 的 12 格/视角（idle/walk/attack × 4 方向）与缺帧占位语义冻结不变；静态资产矩阵为 idle 单动作 8 格（2 视角 × 4 方向）。

## ADDED Requirements

### Requirement: Static idle-only matrix

The system SHALL render a static preview matrix of idle-only cells (4 dirs per perspective, 8 total across the td/sd toggle) with the same per-cell player and missing-placeholder semantics as the character matrix; static cells SHALL reference only idle clips.

#### Scenario: Static toggle shows 8 idle cells

- **WHEN** loading `crate_001` and flipping the td/sd toggle
- **THEN** 4 idle cells show per side (8 total), timing preserved, and any missing idle clip parks as a named non-exporting placeholder
