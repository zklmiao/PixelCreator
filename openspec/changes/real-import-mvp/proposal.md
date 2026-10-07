# Proposal — real-import-mvp

## Why

两轮归档后管线仍是 synth 闭环：全部 SVG 由 `synth*Pixels` 程序化生成，从未经真实像素输入；web 也只能看 synth 矩阵，M2"真实素材导入、人工可看效果"无落点。`resources/Icons34x34byAilsEnglish2013.zip` 内 402 张 34x34 RGBA 图标（已实测：RGBA + 透明，例 `Ac_Medal01.png` 1156 像素中 766 非不透明）是现成的离线 fixtures。本 change 打通第一条真实链路：真实 PNG → pad/分档量化 → kind 色板 OKLCH 映射 → 矢量化 → 落入冻结骨架 clip 槽，并排对比图人工可辨识；静态单帧 PNG 导出补上 sheet 最后一块（人物双模式已在 6.x，静态只有 SVG）。

## What Changes

- 主控 prep（本轮先落，主控独占）：冻结第 6 资产 `potion_001`（prop，`palette_prop@v1`，64，seed 2005，idle-only 8 clips，`prompt_hash` 全 `"pending"`，零 SVG——完全复用轮 1 骨架模式，无 schema 变更）+ `prototypes/` 进 `.gitignore`（用户自备 AI 图工作区，不入库）+ 本提案 8 文件。
- wt-A 管线轴（`feat/real-import`）：`tools/import-prototype.mjs`（真实 PNG → `quantizeGeometry` → OKLCH `mapFrameToPalette` → `pixelsToSvg` → 落 8 clip 槽 + 输出量化前后并排对比 PNG，单源复制 8 槽，`--dir` 可单槽复写）；`sheet.mjs` 静态单帧导出（full-only，单视角 4 列 × 1 行，`cell=size`，行序 fr/bk/lf/rt，map 含 x/y/w/h + fps 2 / loop true）；fixtures（`I_Chest01`/`I_Key01`/`I_GoldCoin` 三件入库 `fixtures/import/`，compare 图同目录提交）+ 新测 + 确定性回归；potion 8 视图 SVG + 2 sheets 落盘。
- wt-B 呈现轴（`feat/compare-view`）：web 量化对比视图（读已提交的 fixture compare 图）+ `ASSET_IDS` 扩容至 6（含 `potion_001`，同步改 `verify-static` 的精确断言）+ `web/verify-real-import.mjs` + docs（本地 server 启动命令 → 打开步骤，`file://` 被拦是人工验收前提，必须写清）。
- 素材双轨：fixtures（Icons 图标）供 agent 自主验收；用户自备 AI 图走 `prototypes/<id>/input.png` + 一条导入命令，文档写清。
- 非目标：新资产 prompt_hash 回填（沿用 pending，待 prompt 流覆盖）；`generic/` 占位扩展与 recipe 改动；128 档；`.tres`；img2img 实调。

## Capabilities

### New Capabilities

- `prototype-import`：真实 PNG 原型导入：解码 → 分档量化 → 色板映射 → 矢量化落槽 → 并排对比图；fixtures 固化与用户自备图双轨。

### Modified Capabilities

- `spritesheet-export`：新增静态单帧导出（full-only，单视角 4×1，`cell=size`）。
- `static-asset`：无修改（`potion_001` 只是冻结形状的又一实例）。

## Impact

- 改动：`assets/potion_001/asset.json`（prep 骨架 → wt-A 补 SVG，主控独占 JSON 结构）、`tools/import-prototype.mjs` + `tools/sheet.mjs` + tests（wt-A）、`fixtures/import/`（wt-A 新目录）、`sheets/` +2 PNG +2 map（wt-A）、`web/**` + `docs/**` + `web/verify-real-import.mjs`（wt-B）。
- 零依赖新增（PNG 解码用既有 `pngjs`），离线可跑；确定性铁律延续。
