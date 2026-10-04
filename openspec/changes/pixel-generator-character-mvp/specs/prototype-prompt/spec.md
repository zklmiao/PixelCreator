# Spec Delta

## Purpose

Defines prototype intake and prompt templates: external image-model prototypes and reference collections flow in manually, while structured English prompts with locked seeds keep derived views consistent.

## ADDED Requirements

### Requirement: Manual prototype import
The system SHALL accept externally generated png/svg prototypes and png/svg reference collections (style plus structure) via manual import with no mandatory one-click model call in v1.

#### Scenario: Import without API key
- **WHEN** a user has no model key configured
- **THEN** full character authoring still works via file import

### Requirement: Prompt form fields
The system SHALL compose prompts from 6 required fields (class, body, outfit, colors, weapon, hair) plus optional cape, vibe, perspective, and seed, emitting English positive prompts.

#### Scenario: Form to prompt
- **WHEN** filling class knight plus red tunic fields
- **THEN** output contains those elements in English with palette-constrained colors

### Requirement: Perspective and derivation templates
The system SHALL provide td/sd master templates plus direction-derivation (denoise 0.5-0.6) and frame-inheritance (denoise 0.25-0.35) sub-prompts, sharing one locked seed per character across all 24 clips.

#### Scenario: Seed lock
- **WHEN** generating walk and attack from the same front master
- **THEN** both derivations record the identical seed with different prompt hashes

### Requirement: Fixed negative prompt
The system SHALL append a fixed negative string (limb errors, cropped feet, shadows, gradients, photo/3d, face-on-back, gloves, diptych) to every generation prompt.

#### Scenario: Negative applied
- **WHEN** previewing the composed prompt
- **THEN** the negative block is always present and uneditable in v1 except via advanced toggle

### Requirement: Bare-hands constraint v0.2
The system SHALL include `skin-colored bare hands, no gloves, five fingers` in every master and derivation positive prompt so hand color stays on the skin ramp across views.

#### Scenario: Side views keep skin hands
- **WHEN** generating lf/rt from a bare-hand front master
- **THEN** derived views render skin hands instead of brown gloves

### Requirement: Single figure per image v0.2
The system SHALL constrain every generation prompt to `single character only, one pose per image, no diptych, no side-by-side` so each clip maps to exactly one file without cropping.

#### Scenario: No diptych output
- **WHEN** requesting lf view
- **THEN** the model returns one figure in one image, never lf plus rt side-by-side

### Requirement: Idle versus action stance v0.2
The system SHALL use neutral-stance wording for idle/masters (`neutral standing pose, feet shoulder-width on baseline, sword pointing down, cape resting`) and mid-stride wording for walk (`mid-stride, one foot forward one back, cape slight lift`).

#### Scenario: Master is neutral
- **WHEN** generating an idle master
- **THEN** feet rest on the baseline instead of a walking stride

### Requirement: Sword-leg separation v0.2
The system SHALL include `sword held forward, clearly separated from legs, no overlap` in every prompt where a weapon is visible.

#### Scenario: Weapon separation
- **WHEN** generating front or side views with a sword
- **THEN** the blade never overlaps the legs in the returned prototype
