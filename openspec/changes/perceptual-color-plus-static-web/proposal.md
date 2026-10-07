# Proposal — perceptual-color-plus-static-web

## Why

两轮归档后管线仍有两个已知缺口：①色距仍是欧氏 RGB（`tools/palette.mjs` 约 122–168 行钩子已备好 `oklchDistance` 导出 + `nearestColor`/`mapFrameToPalette` 的 `colorDistance` 注入参数，但默认仍是 `euclideanDistance`，感知偏差未消除）；ordered-Bayer 只写了门控（`validatePalette` 限定 scenery/building）却从未启用验证。②web 层三处 character-only 硬编码（`asset-shell.js:33` 写死 `knight_001`、`matrix.js:9` 三动作矩阵、`prompt.js:11` 人物专属句式）使四静态资产无法在 web 预览/组装 prompt；四静态 32 帧 `prompt_hash` 至今 `"pending"`。本 change 一轮并走这两项：管线换感知色距并给出 Bayer 无害证明，呈现层解耦静态支持，最后由主控回填真 hash。

## What Changes

- wt-A 管线轴（`feat/oklch-bayer`）：OKLCH 升为 `mapFrameToPalette` 默认色距（只换距离函数，不改任何 `palettes/*.v1.json` 与 schema；`euclideanDistance` 保留导出供回归对照）；ordered-Bayer 启用路径仅 scenery/building（character/weapon/prop 锁 `none` 不变，传入即抛保持），并附"合成资产颜色本就在色板内、启用 Bayer 不改变输出/无抖动"的证明性测试；全量再生成（knight 64 视图 + 2 母版、静态 32 视图 + 8 母版、16 sheets——OKLCH 改变映射结果属预期）+ 确定性回归 + 全套自检。提交消息须含 `oklch`（wt-B 的合并 gate）。
- wt-B 呈现轴（`feat/static-web`）：web 三处解耦——`asset-shell.js` 按 kind 加载 5 资产（character 24-clip 校验不变，静态 idle-only 8-clip 校验新增）、`matrix.js` 静态 idle-only 矩阵（2 视角 × 4 方向 × idle = 8 格）、`prompt.js` kind-aware 句式（人物路径字节不变；静态去掉 bare-hands/sword-leg 等人物约束）+ 新 verify 脚本 + docs；gate 通过后 rebase 到含 wt-A 的 main，从新 `sheets/` 重拷 `engine-placeholder/generic/`（字节复制测试强制）再合。
- 主控集成（不派工）：wt-B kind-aware prompt 落地后回填 4 静态资产 32 帧 `prompt_hash`（`assets/*/asset.json` 主控独占），5× manifest 复验，勾 tasks，追加 agent-log，sync/archive。
- 非目标：schema/骨架变更（无 prep 契约冻结）、Godot `.tres` 生成器（轮 3 优先）、静态 128 档生成实测、img2img 实调（仍最后）。

## Capabilities

### New Capabilities

- 无（不新增 spec 文件）。

### Modified Capabilities

- `pixel-quantize`：默认色距 Euclidean → OKLCH；Bayer 增加"在板合成色启用无害"证明要求（门控本身不变）。
- `prototype-prompt`：prompt 组装 kind-aware（character 路径冻结，静态 kind 新增句式规则）。
- `animation-keyframes`：预览矩阵新增静态 idle-only 8 格形态（character 12 格/视角不变）。

## Impact

- 改动：`tools/palette.mjs` + `tools/*.test.mjs`（placeholder 除外）+ 全量 SVG/sheets 再生成（wt-A）；`web/**` + `docs/**` + `engine-placeholder/**` + `tools/placeholder.test.mjs`（wt-B）；`assets/*/asset.json` prompt_hash 回填 + `openspec/**` + `docs/agent-log.md`（主控）。
- 零依赖新增，离线可跑；确定性铁律延续（同输入字节级一致，OKLCH 切换后以新输出为基准重建字节一致性）。
