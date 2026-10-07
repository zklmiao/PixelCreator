# Design — real-import-mvp

## Context

See proposal.md Why. Baselines: main `92da10d`, `node --test tools/*.test.mjs` 117/117, 5× manifest 全绿，6 web/recive verifies 全绿；`sheets/` 16 文件；`ASSET_IDS` 被 `verify-static.mjs:26` 精确钉死 5 资产。复用点：`quantizeGeometry(src,srcW,srcH,size)`（`quantize.mjs:103`）、OKLCH 默认 `mapFrameToPalette`（`palette.mjs:202`）、`pixelsToSvg`（`vectorize.mjs:218`）、`exportSheets(assetId,outDir)`（`sheet.mjs:211`）。Icons 实测：402 PNG @ 34x34 RGBA 带透明。

## Goals / Non-Goals

**Goals:**

- 一条命令把真实 PNG 变成骨架资产的 8 个可用视图 + 人工可辨识的并排对比图。
- 静态资产有可打开的单帧 PNG 导出，色板纪律零违例（非透明即色板精确字节）。
- web 在本地 server 下可看对比图 + 6 资产矩阵；文档让人工从零走到看见。

**Non-Goals:**

- 不做多源方向差异（单源复制 8 槽是文档化局限）；不回填新资产 hash；不动 `generic/`/recipe；不碰 128/`.tres`/img2img。

## Decisions

- **单源复制 8 槽是 M2 的合法形态**：`import-prototype.mjs --asset potion_001 --src <png>` 默认把同一量化结果写入 td/sd × 4dir（`--dir fr` 可单槽复写做方向差异，后续轮次用）。替代方案（强制 8 源）否决：M2 要的是"看得见"，不是"各向异性"。
- **fixtures 只入库 3 件**：`I_Chest01`（大面积色块）、`I_Key01`（细线条）、`I_GoldCoin`（高透明边缘）→ `fixtures/import/` 原名入库 + 同目录 `.compare.png` 提交；来源 zip+文件名写进测试注释。402 全量不入库（体积 + 确定性负担）。
- **compare 图即契约**：wt-A 的 compare 输出路径约定为 `<src基名>.compare.png`（左原图等比放大展示，右量化结果，同 `upscaleNearest` 整数倍语义）；wt-B 对比视图只读该约定路径，不随实现漂移。用户自备图同约定落 `prototypes/<id>/`（gitignored，本地看）。
- **静态导出 full-only**：Maker 是 3 列动画帧装配，单帧 idle 无需 Maker 形态；`export --asset potion_001` 输出 `<prefix>_<persp>_idle.png`（4 列 × 1 行）+ map（x/y/w/h，fps 2，loop true）。knight 双模式路径不动。
- **ASSET_IDS 扩容是 wt-B 的**：`asset-shell.js` 加 `potion_001` + `verify-static` 第 26 行精确断言同步到 6 资产（同提交）。`verify-1.1/4.1/4.2/5.2` 不改一字。
- **合并顺序 A 先 B 后**：wt-B 对比视图读 wt-A 提交的 compare 图；wt-A 合后 wt-B rebase + 尾巴（重跑 DoD + 确认 compare 图可读）再合。--no-ff。
- **hash 缺口显式化**：导入 clip 的 `prompt_hash` 保持 `"pending"`（schema 不动）；来源可追溯性由 compare 图 + 测试注释承担，回填留后续轮次。

## Risks / Trade-offs

- [34px 非分档] → `computeFit` 按最长边缩放到 64 档（34→64 是 upscale 路径，`downscaleBox` 同函数可处理），几何单测钉死 34→64 的 fit/pad 数值。
- [图标色超出 prop 色板] → 预期内：OKLCH 最近映射 + compare 图人工确认"像"；色板纪律测试只断"输出封闭"（色板字节或透明），不断"像不像"。
- [wt-B 等 compare 图] → 路径约定先行，wt-B 可用任意 PNG 占位开发，rebase 后换实图重验。
- [用户 AI 图尺寸各异] → import 走同一 `quantizeGeometry`，超大图按档缩放，文档写清"最长边压到档位"。

## Migration Plan

评审确认提案 → prep commit（骨架 + `.gitignore` + 本提案）→ 两卡下发（分支自 prep 新建）→ wt-A 合（--no-ff）→ wt-B rebase + 尾巴 → 合（--no-ff）→ 主控勾 tasks + agent-log + sync/archive。Rollback：按合入倒序 revert；新资产骨架 revert 即回 5 资产。

## Open Questions

- 静态 sheet 是否进 `generic/` 占位——本轮不做（recipe/map 消费者只认 knight 双表）。
- 多源方向导入（8 图 → 8 槽）——后续轮次，CLI 已预留 `--dir`。
