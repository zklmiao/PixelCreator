# 任务卡 — wt-A 管线轴（轮 2 / perceptual-color-plus-static-web）【r2 评审勘误版】

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-A`（只在此目录内改）。
- 分支：`feat/oklch-bayer`，自 main 上主控 prep commit 新建（基点：prep `9112455`；开始前执行 `git log --oneline -1` 核对一致，工作区 `git status --short` 必须干净）。
- 独立会话：你看不见主控与其他 agent 的上下文，本卡是唯一依据；有歧义按卡面字义做并在报告中注明，不要猜卡外约定。
- 流程顺序：主控已先落 prep commit（本轮 change 目录此前为 untracked），你的基点即该 prep；完工报告经主控评审后合入 main。

## 2. 背景（一段）

PixeCreator 是像素游戏资产生成管线（纯前端 web + Node ESM 工具链，唯一依赖 pngjs，离线可跑、无需任何 key），规范驱动（openspec），已归档 character-mvp 与 static-kinds 两轮。`tools/palette.mjs` 约 122–168 行备好 OKLCH 钩子（`oklchDistance` 已导出，`nearestColor`/`mapFrameToPalette` 接受 `colorDistance` 注入）但默认仍是欧氏距离；ordered-Bayer 只有门控（scenery/building 放行，character/weapon/prop 拒绝）从未启用验证。你的任务是把 OKLCH 升为默认、给出 Bayer 无害证明，并全量再生成；提交消息须含 `oklch`（wt-B 的合并 gate）。

## 3. 现状自查命令与预期（开工先跑，不符即停并报告）

```
git log --oneline -1                                    # 预期：本卡 §1 基点 prep commit
node --test tools/*.test.mjs                            # 预期：tests 109, pass 109, fail 0
node tools/asset-manifest.mjs validate assets/knight_001/asset.json --check-files   # 预期 OK: knight_001 complete (24 clips, ...)
node tools/asset-manifest.mjs validate assets/sword_001/asset.json --check-files    # 预期 OK: sword_001 complete (8 clips, ...)
node tools/asset-manifest.mjs validate assets/house_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/crate_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/tree_001/asset.json --check-files
node tools/palette.mjs map-selfcheck palettes/palette_character.v1.json             # 预期 cross-view converge + character dither locked
```

## 4. 任务与验收（引用 spec 原文；※ 为评审勘误增补）

spec delta：`openspec/changes/perceptual-color-plus-static-web/specs/pixel-quantize/spec.md`（其余 specs 冻结）。

- [ ] **A1 — OKLCH 默认色距。** spec 原文：*"The system SHALL map every pixel to the nearest color of the asset-kind palette by OKLCH perceptual distance … shared across perspectives for consistency; Euclidean distance SHALL remain exported as a regression comparator but SHALL NOT be the default path."* 做法：`mapFrameToPalette` 的 `opts.colorDistance ??` 缺省由 `euclideanDistance` 改为 `oklchDistance`（只换距离函数，不改任何 `palettes/*.v1.json` 与 schema）；`euclideanDistance` 保留导出。
  - ※ **防虚假 pass（评审勘误 2）：改旧测试期望禁止录制实现输出。** 优先性质断言：跨视角收敛（front/back 同落点，只断相等不断具体名）、同输入跑两遍一致、显式 `colorDistance: euclideanDistance` 对照。`palette.test.mjs:71` 显式传 `euclideanDistance`，原样保留作为对照锚点；`palette.test.mjs:78-79` 探针未传第四参、随默认切 OKLCH——保留为性质断言（`front.name === back.name`），若变红修实现、不改期望；同文件 `:68-69`（默认路径断 `tunic-red`）切 OKLCH 后须验证仍成立。确需精确 hex/落点期望的，必须在报告 §8 说明该值的独立依据（为什么是对的，而非"实现输出如此"）。
  - 验收场景：*"WHEN front and back views quantize similar cloak reds / THEN both land on the same palette entry under the OKLCH default"* 不破裂；`map-selfcheck` 在 OKLCH 下仍报告收敛。
- [ ] **A2 — Bayer 启用与无害证明。** spec 原文：*"For in-palette synthetic frames, ordered-Bayer output SHALL be byte-identical to `none` and deterministic across runs (no shimmer); character/weapon/prop SHALL reject `ordered-bayer` with an error."*
  - ※ **补授权（评审勘误 1）：允许修改 `palette.mjs` 的 ordered-bayer 分支，加"在板快速通道"——源像素精确命中色板 RGB 集合则跳过 ±6 偏移（O(1) Set 判断，Set 内容为色板 mappable RGB）。** 原因：评审实测当前实现 64 像素差 5（`BAYER_SPREAD=12` 偏移所致），否则 spec"在板色帧 bayer≡none"性质无法达成。此改动对现有产物零风险：v1 全部 `dither.default=none`，ordered-bayer 无生产调用方（仅测试与自检显式传入）。
  - 在快速通道之上补证明性测试：取颜色全部落在目标色板的合成帧（覆盖高 chroma ramp + 透明边缘），`{dither:'none'}` vs `{dither:'ordered-bayer'}` 的 `data` + `names` `deepEqual`，且 bayer 同输入跑两遍一致；character/weapon/prop 传 `ordered-bayer` 必抛错单测；`error-diffusion` 全局拒收保持。测试只准值断言（精确落点/字节一致），禁止纯存在性断言。
- [ ] **A3 — 全量再生成。** 命令：`node tools/vectorize.mjs generate --asset knight_001`（及 sword/house/crate/tree_001；knight 落 64 视图 + 2 母版，静态各 8 视图 + 2 母版），`node tools/sheet.mjs export --asset knight_001 --out sheets`（16 文件：td/sd × walk/attack × Full/Maker）。spec 原文（static-asset 延续语义）：*"The system SHALL regenerate static SVGs byte-identically from the manifest"*。
  - ※ **口径修正（评审勘误 3）：synth 链路全在板色，OKLCH 映射恒等——66+40 SVG 与 16 sheets 零字节变化也合法。** 不要为制造变化而改实现；报告如实记录变化数（changed N / unchanged M，逐类列出）。确定性比对必须做：仓库外临时目录重跑 5 资产 generate + knight sheet export，与提交内容字节比对一致（贴比对命令与结果）。
- [ ] **A4 — 提交。** 单分支单 commit（多 commit 自行 squash）；提交消息格式 `type(scope): summary (task-id)` 且**必须含 `oklch`**（例：`feat(palette): oklch default distance plus bayer harmless proof (A1-A4)`）——这是 wt-B 的合并 gate，缺词合并阻塞。

## 5. 拥有 / 禁改文件清单

- 可写：`tools/*.mjs`（含本次授权的 `palette.mjs` ordered-bayer 分支）、`tools/*.test.mjs`（`tools/placeholder.test.mjs` 除外）、资产 SVG 再生成落盘、`sheets/` 16 文件。
- `palettes/` 只读校验、数值不改（本轮预计零改动）。
- 禁碰：`assets/*/asset.json`、`assets/asset.schema.json`、`package.json`、`openspec/**`、`docs/**`、`web/**`、`engine-placeholder/**`、`tools/placeholder.test.mjs`。生成物一律由工具再生成，禁止手改 SVG/PNG/map.json。

## 6. 守则

- 核查只读；实验一律仓库外临时目录；绝不提交临时文件；绝不联网。
- Windows + Git Bash；node 代码内路径用正斜杠。
- 输出必须确定性：同输入字节级一致；禁止在生成物中引入时间戳/随机。
- 测试用 `node --test`，断言用值断言（精确值/字节一致/几何数）或性质断言（收敛/两遍一致/显式对照），不要只断存在性，更不要把实现输出录制成期望。

## 7. DoD 命令清单（合并前必须全绿，输出逐行粘进报告）

```
node --test tools/*.test.mjs
node tools/asset-manifest.mjs validate assets/knight_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/sword_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/house_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/crate_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/tree_001/asset.json --check-files
node tools/palette.mjs map-selfcheck palettes/palette_character.v1.json
node tools/palette.mjs validate palettes/palette_character.v1.json palettes/palette_weapon.v1.json palettes/palette_building.v1.json palettes/palette_prop.v1.json palettes/palette_scenery.v1.json
node tools/quantize.mjs selfcheck 64
```

外加：仓库外临时目录重跑 5 资产 generate + knight sheet export，与提交字节比对一致（贴比对命令与结果）；变化数如实记录（changed/unchanged 逐类）。

## 8. 完成报告格式（按此模板回主控）

```
基点：prep <sha>（与本卡 §1 一致确认）
分支/sha：feat/oklch-bayer @ <sha>（含 oklch 字样确认）
A1：改动文件行（palette.mjs:行-行，测试文件:行-行）；78-79 性质断言处置；68-69 验证结果；欧氏对照用例名；map-selfcheck 输出粘贴；如有精确 hex 期望→逐条写独立依据
A2：在板快速通道实现行号 + Set 构造说明；证明测试名 + 覆盖项（ramp/透明边缘/两遍一致/人物拒收）；关键断言值粘贴
A3：再生成文件数 + 变化数实录（knight 66：changed N；静态 40：changed N；sheets 16：changed N）；临时目录字节比对命令 + 结果粘贴
DoD：逐条命令输出粘贴（tests 计 x/y；5× manifest OK 行）
偏离/遗留：无则写"无"
```
