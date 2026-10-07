# pixel-quantize Specification

## Purpose
Defines pixelization and palette quantization: fixed resolution tiers, forced square padding, transparency handling, per-kind palettes, and dithering policy that keeps animation flicker-free.

## Requirements

### Requirement: Resolution tiers and square pad
The system SHALL quantize characters at 32/48/64px width and other kinds up to 128px, padding every frame centered to a square with transparent fill so all clips in one asset share dimensions.

#### Scenario: Non-square prototype
- **WHEN** importing a 512x384 prototype for a 64px asset
- **THEN** output is 64x64 centered with transparent padding

### Requirement: Transparency rule
The system SHALL discard pixels with alpha below 128 as transparent before palette mapping and SHALL always force transparency handling even though outline style is unconstrained.

#### Scenario: Soft edge import
- **WHEN** a prototype has feathered edges
- **THEN** sub-threshold pixels become transparent instead of palette colors

### Requirement: Per-kind fixed palettes
The system SHALL map every pixel to the nearest color of the asset-kind palette by OKLCH perceptual distance (character/weapon/building/prop/scenery v1 drafts), shared across perspectives for consistency; Euclidean distance SHALL remain exported as a regression comparator but SHALL NOT be the default path.

#### Scenario: Cross-view consistency
- **WHEN** front and back views quantize similar cloak reds
- **THEN** both land on the same palette entry under the OKLCH default

#### Scenario: Euclidean comparator retained
- **WHEN** a test passes `colorDistance: euclideanDistance` explicitly
- **THEN** mapping follows the legacy metric without error

### Requirement: Dithering policy
The system SHALL default characters to no dithering and SHALL gate ordered-Bayer behind scenery/building kinds only; error-diffusion dithering SHALL NOT ship in v1. For in-palette synthetic frames, ordered-Bayer output SHALL be byte-identical to `none` and deterministic across runs (no shimmer); character/weapon/prop SHALL reject `ordered-bayer` with an error.

#### Scenario: Animation stability
- **WHEN** playing walk frames
- **THEN** no per-frame dither shimmer appears across the loop

#### Scenario: Bayer harmless on in-palette colors
- **WHEN** mapping a synthetic frame whose colors already land on palette entries with `dither: 'ordered-bayer'`
- **THEN** `data` and `names` equal the `dither: 'none'` run byte-for-byte
