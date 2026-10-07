# Agent Log（主控独占）

## 轮 0 — 7.1 首人物贯通（D1 修复 + 双表 + 占位）

- D1（main）：`d6a450e` fix(pipeline): pose cycle mod4 plus gaze offset, regen SVGs with distinctness regression (7.1a)；50 文件；自检 84/84 + web 1.1/4.1/4.2/5.2 + manifest 全绿。
- wt-A 管线轴 `feat/sheet-export @ aa6c3e8`：sheets/ 16 文件（8 PNG + 8 map.json），零越界，工作区干净。评审：diff 16 文件；wt 内 84/84 + web 全绿；临时目录重导 16 文件字节一致；突变（fps/几何）变红；Maker 截断公示 + `$`命名合规。结论：通过。
- wt-B 呈现轴 `feat/present-preview-sheet @ d8c429e`：35 文件（docs 1、generic 17、sheets 16、placeholder.test.mjs 1），零越界（sheets 与 A 字节相同，允许重合），工作区干净。评审：wt 内 91/91 + web 全绿；generic==sheets 16 文件字节一致；sheets A==B 一致；突变（删 next、坏 PNG 签名）变红；测试断值非存在性断言。结论：通过。
- 合并：`2499c2b` merge(sheet): knight_001 dual-mode sheets (7.1)（合后 84/84 全绿）；`d0df5f3` merge(present): 7.1 generic placeholder plus hardened tests and docs（合后 91/91 + web 全绿）。第二合 sheets 自动去重，仅 19 文件落地。
- 终验实证：view SVG 64 + masters 2 = 66（40~88 内）；矩阵 verify-5.2 OK；双表 walk 192x256 / attack Full 256x256 / Maker 192x256，行序 fr/bk/lf/rt，fps/loop/next 合 asset.json，Maker dropped 4；generic 17 文件无 .godot/.tres。已勾 tasks.md 7.1 与 engine-placeholder §4 四框。
- 遗留风险：engine-placeholder §2 gap #13–#17（filter/anchor/animation 名/朝向映射/loop_mode）仍缺，属 6.x/轮 1 范围；idle 表未纳入 7.1（按需另加）。

## 轮 1 — static-kinds-godot-adapter（①静态四类 + ④Godot 配方）

- Prep（main）：`4c985f7` chore(contract): freeze kind-aware schema, 4 static skeletons, r1 proposal (r1-prep)；11 文件（proposal/design/tasks/2 specs delta + schema kind-aware 三分支 + 4 骨架 idle×8）；自检 91/91 不受影响；分支 `feat/static-kinds`、`feat/godot-adapter` 预建指向 prep，两 wt merge main 均为 no-op。
- wt-A 管线轴 `feat/static-kinds @ 8b883f4`：单 commit，43 文件（40 SVG + manifest/vectorize/static-kinds.test 新 291 行）；旧 9 测试文件未动；禁改零触碰。评审：wt 内 109/109 + web 全绿 + 5×manifest 全 OK；roundTrip kind 分支人物侧字节不动（3.3 全绿）；突变 5/5 红（错 palette/超尺寸/static-walk/越界命名/未知 kind）；临时目录复刻布局重生成 40/40 与提交字节一致。结论：通过。
- wt-B 呈现轴 `feat/godot-adapter @ 29cacbc`：单 commit，4 文件（IMPORT-RECIPE 原地重写 + verify-recipe.mjs 新 82 行纯只读 + generic §5 + docs 指针）；map.json 零改动；generic 17→17 故 placeholder 断言免同步。评审：wt 内 91/91 + web 全绿；recipe 自检 8 maps/104 frames 全绿；实际脚本临时目录复跑通过、篡改 fps/x 后 2 处 FAIL 变红；gap #13–#24 逐项有映射或缺省。结论：通过。
- 合并：`40b345e` merge(static)（合后主干 109/109 + web/manifests 全绿）；`19fc654` merge(recipe)（零冲突，4 文件；合后 109/109 + recipe 自检 104 帧全绿）。已勾本 change tasks A1–A3/B1–B2/M1。
- 遗留风险：四静态 `prompt_hash:"pending"`（手工导入或轮 2 回填真值）；building/scenery 128 仅 schema+validator 允许、生成器未实测；`.tres` 生成器留轮 2 管线轴；下一轮 ②OKLCH → ③Bayer → ⑤img2img。

## 轮 2 — perceptual-color-plus-static-web（②OKLCH 默认 + Bayer 无害证明 + web 静态支持）

- Prep（main）：`9112455` chore(openspec): add perceptual-color-plus-static-web proposal (r2-prep)；`68ecf16` 两卡入库；`569b402` docs(readme): add project README（轮中用户直派，与测试零交集）。分支 `feat/oklch-bayer`、`feat/static-web` 自 prep 新建，旧 `feat/*` 存档不动。
- wt-A 管线轴 `feat/oklch-bayer @ e1aca66`：单 commit，2 文件（`tools/palette.mjs` +212/-8：`nearestColor`/`mapFrameToPalette` 默认换 `oklchDistance` + 在板 fast path O(1) Set 跳 ±6；`tools/oklch-bayer.test.mjs` 新 197 行：判别蓝独立依据断言 + 在板 none-vs-bayer 字节一致 + 负路径）。评审：wt 内 117/117；diff 零越界；突变（删 fast path 条件）8 项中 byte-identity 项变红；确定性由评审方独立复现（generate×2 + export → status 0）采信。结论：通过。
- wt-B 呈现轴 `feat/static-web @ f4a0e94`：单 commit，7 文件（`web/lib/asset-shell|matrix|prompt.js` kind-aware + `app.js`/`index.html` 切换器 + `docs/static-web.md` + `web/verify-static.mjs` 新 243 行）。评审：rebase 后 wt 内 117/117 + 6 verify（含 verify-static：5 shells/8 格/禁人物约束词/kind 缺省 byte-identical）+ recipe 104 帧；`generic/` vs `sheets/` 16/16 字节一致（重拷 no-op，无 tail commit）；`verify-1.1` 仅 validateAsset 侧已标注。结论：通过。
- 合并：`037c463` merge(palette)（合后 117/117 + 5× manifest + 4 verify 全绿，即 oklch gate）；`18c8167` merge(present)（7 文件；合后 117/117 + 6 verify + recipe 全绿）。
- 集成回填（主控）：`4040567` chore(asset): backfill 32 static prompt_hash via kind-aware prompt——文本级替换（格式不动，每文件 8 行）；锚点 td/fr 全中（weapon 0f435899 / building 5e48f491 / prop 9a611e61 / scenery 10d99667）；回填后 5× manifest + 117/117 全绿。已勾本 change tasks A1–A4/B1–B3/M1。
- 遗留风险：building/scenery 128 档仅 schema/validator 允许、生成器未实测；Godot `.tres` 生成器轮 3（管线轴优先）；静态 32 帧真实 prompt_hash 已落，外部 img2img 实调（积压⑤）前置数据就绪。

## 轮 3 — real-import-mvp（M2 真实素材导入：喂真图 → 出真资产 → 人工可看）

- Prep（main）：`8f2d15a` chore(contract): freeze potion_001 skeleton plus real-import-mvp proposal (r3-prep)（prop/`palette_prop@v1`/64/seed 2005/idle-only 8 clips 全 pending 零 SVG + `prototypes/` 入 .gitignore）；`8682ce0` 两卡基点入库。分支 `feat/real-import`、`feat/compare-view` 自 prep 新建。
- wt-A 管线轴 `feat/real-import @ 27499ec`：单 commit，24 文件（`tools/import-prototype.mjs` 新 242 行 + `import-prototype.test` 160 行 + `sheet.mjs` 静态导出扩展 +109 + `sheet-static.test` 137 行 + potion 8 视图 + 2 母版 + fixtures 3+3 + potion sheets 2+2）。评审：wt 内 135/135；diff 零越界；母版抽查（data-master 标记 + rect 集与 fr0 相等 2022 项）+ sheets 256x64 + map 键齐；色板纪律/确定性由评审方独立实证采信。结论：通过。
- wt-B 呈现轴 `feat/compare-view @ 21baebe`：本体 `5fdad2f` 8 文件（`web/lib/compare.js` 新 28 行零 node: + 对比区 + `ASSET_IDS` 扩 6 + `verify-static:26` 同步 + `verify-real-import.mjs` 新 146 行 + `docs/real-import.md`）+ tail `21baebe` 3 文件（compare 公式对齐实图布局 98x64=34+64，推导式非录制）。评审：rebase 后 wt 内 135/135 + 7 verify 全绿 + recipe 104 帧；公式推导/零 node: 抽查通过。结论：通过。
- 合并：`1b27aa7` merge(import)（合后 135/135 + 6× manifest 全绿，即严格式 `feat(import)` gate）；`274e7cc` merge(present)（8 文件；合后 135/135 + 7 verify + recipe 全绿）。
- 集成：无回填（`potion_001` prompt_hash 按提案非目标保持 pending）。已勾本 change tasks A1–A4/B1–B3/M1；里程碑 M2 翻 ✅（验收实测行已补）。
- 遗留风险：`potion_001` hash 回填留后续轮次；building/scenery 128 档 + `.tres` 生成器 → M3（轮 4）；img2img → M4。
