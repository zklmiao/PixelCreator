# Design — perceptual-color-plus-static-web

## Context

See proposal.md Why. Baselines: main `3f92b60`, `node --test tools/*.test.mjs` 109/109, web verify 1.1/4.1/4.2/5.2 全绿, 5× manifest `--check-files` 全绿；knight_001（character，24 clips，64 视图 + 2 母版）+ sword/house/crate/tree_001（各 idle-only 8 clips，8 视图 + 2 母版，per-frame `prompt_hash:"pending"`）；`sheets/` 16 文件；`generic/` 17 文件被 `placeholder.test.mjs` 钉死。钩子现状：`srgbToOklch`/`oklchDistance` 已导出（`palette.mjs:132/155`），`nearestColor(r,g,b,mappable,colorDistance=euclideanDistance)`（`:168`）、`mapFrameToPalette(...,opts.colorDistance ?? euclideanDistance)`（`:207`）；Bayer 门控在 `validatePalette`（`:104–106`）+ `assertDither`（`:190–196`）。

## Goals / Non-Goals

**Goals:**

- 感知色距成为默认映射路径，欧氏仅留作对照，跨视角收敛（front/back 红同落点）保持。
- Bayer 在 scenery/building 可用且有"无害"实证；人物侧锁死行为不变。
- web 可加载/预览/组装 5 资产，人物行为零变化；静态 hash 回填后 5× manifest 全绿。

**Non-Goals:**

- 不改 palette JSON 数值、schema、骨架 clips 结构；不做 `.tres`、128 实测、img2img。

## Decisions

- **OKLCH 默认 = 换默认参数，不换管线**：`mapFrameToPalette` 的 `opts.colorDistance ??` 缺省由 `euclideanDistance` 改为 `oklchDistance`；`euclideanDistance` 保留导出，旧单测中凡钉死欧氏具体落点的改断言为 OKLCH 期望值并保留一处欧氏对照用例。替代方案（新增 `mapFrameToPaletteV2`）否决：双入口必漂移，单默认 + 对照用例足够。
- **Bayer 证明 = 在板合成帧 none-vs-bayer 字节一致**：取颜色全部落在目标色板的合成帧（多取几个 ramp/边缘色），`mapFrameToPalette(...,{dither:'none'})` vs `{dither:'ordered-bayer'}` 输出 `data`+`names` `deepEqual`，另加 bayer 跑两遍确定性；character/weapon/prop 传 `ordered-bayer` 仍抛错（既有 `map-selfcheck` 的人物锁行为保留并进单测）。
- **再生成范围全量**：`vectorize.mjs generate --asset` × 5（knight 64+2，静态各 8+2）+ `sheet.mjs export --asset knight_001 --out sheets`（16 文件）。OKLCH 导致的映射/sheet 字节变化是预期变更，评审以"临时目录重跑字节一致"验收，不以"与旧字节相同"验收。
- **web kind-aware = 分支不分家**：`checkShell` 按 `asset.kind` 分支（character 要求 idle/walk/attack，静态要求 idle-only 且 `preview.action==='idle'`）；`loadShell(url)` 签名兼容（默认仍 knight），`app.js` 加资产切换；`buildMatrix` 对静态返回 idle×4dir（单视角 4 格，双视角共 8 格），character 12 格路径不动；`prompt.js` 人物常量/函数对 character 输入字节不变，静态走 kind-keyed 句式（武器/建筑/道具/景物各有对象陈述，禁出现 bare-hands/sword-leg/single-character 人物约束）。
- **合并顺序即正确性**：wt-A 先合（commit message 含 `oklch` 为 gate：`git log main --format=%s | grep -m1 -i oklch`）；wt-B gate 后 rebase 再 `cp sheets/*.png sheets/*.map.json engine-placeholder/generic/`（字节复制，`placeholder.test.mjs` 会强制），本体验证通过后合并。
- **hash 回填主控做**：wt-B 的 kind-aware prompt 落地并合入 main 后，主控用新 `buildPrompt` 为 32 静态帧计算真值写入 `asset.json`（`prompt_hash` 字段语义不变：djb2 8 位 hex），5× manifest 复验。

## Risks / Trade-offs

- [OKLCH 大面积改字节淹没回归信号] → character 旧单测先按欧氏对照锁定一处，其余切 OKLCH 期望；评审做突变红查（错 palette/错距离必红）。
- [Bayer 证明用例太弱（只测在板色）] → 要求覆盖高 chroma ramp + 透明边缘 + 两遍确定性三项，缺一项打回。
- [wt-B 在旧 sheets 上开发 generic 复制白做] → 重拷步骤写进 B3 验收，合并前由主控核对 `generic/` 与 `sheets/` 字节一致。
- [静态 prompt 句式主观] → spec 只钉"禁出现人物约束 + 必含 kind 对象词"，verify 脚本做值断言，评审只认红绿。

## Migration Plan

评审确认提案 → prep commit（本提案 8 文件入库，main 直推）→ 两卡下发（分支自 prep 后 main 新建，旧 `feat/*` 存档不动）→ wt-A 合（--no-ff）→ gate 通知 → wt-B rebase + 重拷 + 合（--no-ff）→ 主控回填 hash + 勾 tasks + agent-log + sync/archive。Rollback：按合入倒序 revert。

## Open Questions

- 静态 prompt 是否需要 denoise/seed 体系（4.x 预留）——本轮只组装 positive/negative 文本，不碰 denoise 档。
- 静态是否需要 sheet 导出——本轮不做（沿用轮 1 结论：静态 SVG-only）。
