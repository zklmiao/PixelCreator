# Spec Delta — `spritesheet-export`（ADDED 1 条，余下冻结）

## Purpose

Adds static single-frame export (full-only). Character dual-mode paths frozen.

## ADDED Requirements

### Requirement: Static single-frame export

The system SHALL export static idle-only assets as one PNG per perspective (`<prefix>_<persp>_idle.png`, 4 columns × 1 row, `cell = asset.size`, column order fr/bk/lf/rt) plus a full-mode `map.json` (x/y/w/h, fps 2, loop true); Maker mode SHALL NOT apply to static single frames.

#### Scenario: Potion sheets

- **WHEN** exporting `potion_001` at 64px
- **THEN** each perspective PNG is 256x64 with 4 cells in fr/bk/lf/rt order and every opaque pixel is an exact palette byte
