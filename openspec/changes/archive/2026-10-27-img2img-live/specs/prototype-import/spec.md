# Spec Delta — `prototype-import`（MODIFIED 1 条：guardian 56 视图与 td 溯源标记）

## Purpose

img2img-live adds AI in-between frames (guardian walk/attack 2→3 per direction) and dedicated td sources, so the multi-slot manifest shape grows from 40 view slots to 56 (idle 8 + walk 24 + attack 24) plus 2 masters, and the manifest carries a machine-readable td provenance declaration distinguishing offline stand-in sources from AI-derived ones until a configured provider run replaces them.

## MODIFIED Requirements

### Requirement: Multi-slot manifest import
The system SHALL support `node tools/import-prototype.mjs --asset <id> --map <manifest.json>` assigning one source PNG per clip slot for characters (idle/walk/attack × dirs × perspectives), with the manifest committed and reviewed. For imported characters whose td sources are not yet AI-derived, the manifest SHALL carry a `tdProvenance` declaration (`mode` + `upgradedSlots`) so offline stand-in sources and AI-derived replacements stay machine-readable apart.

#### Scenario: Guardian map
- **WHEN** importing `guardian_001` via `fixtures/guardian/guardian-map.json`
- **THEN** 56 view slots (idle 8 + walk 24 + attack 24) plus 2 masters land per the manifest, the reuse declaration idle=[f1] / walk=[f1, ai-mid, f2] / attack=[f2, ai-mid, f1] matches landed pixel sets (attack keeping its reverse-order difference), and the td views differ from their sd counterparts per the `tdProvenance` marker (mode `offline-standin-vertical-flip` with empty `upgradedSlots` until a configured provider re-run adopts AI sources)
