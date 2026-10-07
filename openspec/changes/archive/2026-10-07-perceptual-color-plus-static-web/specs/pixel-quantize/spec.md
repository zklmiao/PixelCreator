# Spec Delta — `pixel-quantize`（MODIFIED 2 条，余下冻结）

## Purpose

默认色距由欧氏 RGB 升级为 OKLCH 感知色距，并为 scenery/building 的 ordered-Bayer 启用路径补上"无害"证明要求。分辨率档、正方形 pad、透明规则、色板文件本身均不动。

## MODIFIED Requirements

### Requirement: Per-kind fixed palettes (OKLCH default)

The system SHALL map every pixel to the nearest color of the asset-kind palette by OKLCH perceptual distance (character/weapon/building/prop/scenery v1 drafts), shared across perspectives for consistency; Euclidean distance SHALL remain exported as a regression comparator but SHALL NOT be the default path.

#### Scenario: Cross-view consistency (perceptual)

- **WHEN** front and back views quantize similar cloak reds
- **THEN** both land on the same palette entry under the OKLCH default

#### Scenario: Euclidean comparator retained

- **WHEN** a test passes `colorDistance: euclideanDistance` explicitly
- **THEN** mapping follows the legacy metric without error

### Requirement: Dithering policy (Bayer harmless proof)

The system SHALL default characters to no dithering and SHALL gate ordered-Bayer behind scenery/building kinds only; error-diffusion dithering SHALL NOT ship in v1. For in-palette synthetic frames, ordered-Bayer output SHALL be byte-identical to `none` and deterministic across runs (no shimmer); character/weapon/prop SHALL reject `ordered-bayer` with an error.

#### Scenario: Animation stability

- **WHEN** playing walk frames
- **THEN** no per-frame dither shimmer appears across the loop

#### Scenario: Bayer harmless on in-palette colors

- **WHEN** mapping a synthetic frame whose colors already land on palette entries with `dither: 'ordered-bayer'`
- **THEN** `data` and `names` equal the `dither: 'none'` run byte-for-byte
