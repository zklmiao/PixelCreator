# Design — pixel-generator-character-mvp

## Context

Empty repo: only `openspec/config.yaml` and `resources/` references (the-pixel-art threshold pipeline, Image-to-Pixel palette+dither pipeline, piskel FramesheetRenderer, last-guardian 4-dir x 2-frame naming, customizable_characters layered PSD). See proposal.md Why. Web app, no backend LLM key required for v1, offline-capable core.

## Goals / Non-Goals

**Goals:**
- Pure-frontend v1 pipeline (canvas pixelate + SVG rect-vectorize + GIF-matrix preview + sheet stitch) running without keys.
- `asset.json` as single source of truth for perspective x direction x action x frame plus timing; SVGs carry only pointer metadata.
- Deterministic outputs: same prototype + palette + size yields identical clips.

**Non-Goals:**
- No in-app model calling (only prompt composer + reserved call site), no onion-skin editor, no skeletal rig, no online palette fetch, no error-diffusion dithering.

## Decisions

- **Quantize pipeline = Image-to-Pixel subset**: downscale to width tier → Euclidean nearest palette → optional ordered-Bayer (scenery only) → `imageSmoothingEnabled=false` upscale. Alternative fullscreen-shader rejected: canvas 2D is enough at <=128px and keeps zero deps.
- **Distance = Euclidean RGB v1, OKLCH hook v2**: Euclidean matches reference code and is flicker-free; perceptual upgrade isolated to one `colorDistance` swap, no pipeline change.
- **Per-kind palettes as local JSON, referenced not embedded**: guarantees C1 cross-view consistency regardless of model drift; Lospec live-fetch rejected for offline requirement.
- **SVG = per-pixel rect grouped by color, then semantic relabel**: simplest lossless vectorize at 64px; connected-component merging deferred (needed only for 128 scenery). Relabel to body/limb/outfit stays semi-manual in v1.
- **C1 derivation ordering (front → dirs → frame-inherit)**: low denoise chains minimize inter-frame jitter versus fan-out from front; seed locked per character, prompt hash per clip for reproducibility.
- **Sheet = one action one PNG + map.json; Maker vs Full dual mode**: separates loop/once timing domains; Maker 3-col truncation/pad is a documented export adapter, never stored.
- **Prompt v0.2 (gemini_test validated)**: bare-hands lock, single-figure-single-frame, idle-neutral vs walk-stride split, sword-leg separation forced; negatives add gloves + diptych. Unchanged: seed lock, denoise tiers, td/sd base proportions.
- **State shape**: `asset.json { perspectives, views, actions{frames,fps,loop,next,clips}, preview, palette, size }`; preview matrix reads clips directly, no duplicate timing store.

## Risks / Trade-offs

- [Back-view hallucination: mirrored face on bk] → dir-derivation prompts forbid face + manual fix affordance; palette clamp hides color drift.
- [Side-view weapon-hand mirror error] → rt/lf generated independently (never auto-mirror files); mirror allowed only as preview fallback.
- [Euclidean skin dirtiness] → dense 4-step skin ramp in palette v1; OKLCH upgrade path reserved.
- [44-88 SVG asset weight] → per-pixel rect is verbose; accept for character sizes, mitigate with full-mode sheet for engines.
- [Maker truncation surprises] → export dialog shows f-mapping (kept/dropped/padded) before confirm.

## Migration Plan

Greenfield: no migration. Rollback = delete change folder. Forward path: OKLCH distance, ordered-Bayer for scenery, live model call site, sheet packer for Godot AtlasTexture.

## Open Questions

- Godot 4.x preferred atlas flavor (SpriteFrames vs AtlasTexture + map.json) — defaults to generic map.json, adapter later.
- Side-view fr/bk future deprecation to lf/rt-only — model allows, gate not yet added.
