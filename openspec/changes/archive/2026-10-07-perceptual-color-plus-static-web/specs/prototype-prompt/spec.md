# Spec Delta — `prototype-prompt`（ADDED 1 条，余下冻结）

## Purpose

prompt 组装 kind-aware：character 路径（10 字段表单、v0.2 四约束、denoise 档、seed 锁）冻结不变；静态 kind（weapon/building/prop/scenery）走 kind-keyed 句式，禁用人形专属约束。

## ADDED Requirements

### Requirement: Kind-aware static prompt sentences

The system SHALL compose static-asset prompts from kind-keyed object sentences (no human-figure wording) while the character path stays byte-identical; static prompts SHALL NOT contain bare-hands, sword-leg-separation, or single-character person constraints.

#### Scenario: Static prompt has no figure constraints

- **WHEN** composing a prompt for `house_001` (building) or `sword_001` (weapon)
- **THEN** output names the kind object with its palette-constrained colors and contains none of the character-only constraint strings

#### Scenario: Character prompt frozen

- **WHEN** composing the knight example through the character path
- **THEN** positive/negative/denoise/seed/hash output is byte-identical to the v0.2 baseline
