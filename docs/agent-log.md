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
