# Design — real-character-m3

## Context

See proposal.md Why. Baselines: main `643e033`, tests 136/136, 6× manifest 全绿；`sheets/` 16+4；`ASSET_IDS` 6 资产钉死。备料实测：guardian ZIP 722 项 = 716 GIF（含 house1-4；89 前缀 × 8，单帧 8bpp 32x32）+ 4 jpg + 1 readme + 1 目录项；Gemini PNG 2752x1536（场景图，非 sprite）。复用：`import-prototype`（r3）、`exportSheets`（idle/walk/attack 通用）、recipe gap #13–#17 映射表（IMPORT-RECIPE.md §2–§3）。

## Goals / Non-Goals

**Goals:**

- 首个真实角色 40 视图合法落盘（24 clips 门全绿），复用关系全部文档化、可测。
- knight/guardian 一键出 `.tres`，动画名/时序/缺省与 recipe 一致。
- 128 档真实跑通（building + scenery 各一）。

**Non-Goals:**

- 不找 td 真源；不加新 kind；不动 synth knight；不回填任何 hash。

## Decisions

- **td 缺口定案：td = sd 像素复制，占位测试钉死。** guardian 全系侧视语义，无 td 源。否决项：sd-only 资产（破 24-clip 门，门是 load-bearing 的，矩阵/导出/tres 全依赖它）；现找 AI 补 td（用户依赖，阻塞 M3；列为后续，有源即换，届时删占位测试）。`guardian_001` 的 20 个 td 视图与 sd 逐字节相等，由单测断言（`td bytes == sd bytes`，值断言）；spec 加可移除条件。矩阵/拼表/tres 把 td 当正常视角消费。
- **帧预算定案：idle=[f1] / walk=[f1,f2] / attack=[f2,f1]。** 每方向仅 2 distinct 帧，满足门计数下限（1/2/2）；attack 取逆序使 clip 序列不同于 walk；复用图写进 `guardian-map.json`（clip → 源 GIF 名），测试注释引用。distinctness bar：同方向 f1≠f2（断言）；跨动作复用是宣言不是暗扣。fuller motion（补拍/8 distinct）留 M4+。
- **角色选 amg1。** 首个前缀，8 文件齐（fr/bk/lf/rt × f1/f2）；资产 id `guardian_001`，`asset:"guardian"`，seed 2006（2001–2005 已占）。
- **GIF→PNG 转换是一次性入库动作，不进管线。** `fixtures/guardian/*.png` 由 System.Drawing 提取（单帧 GIF，直接存 PNG；像素稳定性由"转出即断言 32x32 RGBA + f1≠f2"锁定）；管线运行时只认 PNG（pngjs），零依赖约束不破。zip/GIF 原件不入库。
- **128 用 synth 原 motif 重跑，不引新源。** house1-4.gif 虽 128x128 但 4 变体对不上 8 槽且会引入"变体复用"第二处诚实负担；synth motif 是 size 参数化的（`synthStaticPixels({size})`），128 即实测本体的参数化能力。house_001 + tree_001 双 kind 覆盖；`size` 字段改由 wt-A 在同 commit 内做（单字段授权，主控核 diff）。
- **`.tres` 只读 Full maps。** Maker 是 RPG Maker 兼容形态，Godot 侧用 Full（与 recipe §2"8 套"的关系：生成器输出 Full 集合，recipe 手工路径仍覆盖 Maker；docs 写清）。单资产单文件：`godot/knight_001.spriteframes.tres`（24 动画，含 A2 补的 idle 表；若 idle 表阻塞未出则 16 + docs 声明）、`godot/guardian_001.spriteframes.tres`（24 动画）；动画名 `{persp}/{action}/{dir}`；`speed=fps`；`loop→LOOP_FORWARD/LOOP_NONE`；filter 缺省 nearest 写 docs 不进资源（SpriteFrames 无该字段）；uid 省略（Godot 重建，docs 注明）。
- **新目录 `godot/` 归 wt-A**（本轮单写者；`placeholder.test` 不触；recipe §6 修文归 wt-B 尾巴）。
- **guardian sheets = 6 Full + 4 Maker。** walk/attack 走既有双模式路径（2 帧 + idle-pad 凑 3 列，mapping 公示）；idle 仅 Full（单帧无 Maker 形态，沿 r3 静态先例）；出不了 Maker 4 张则 docs 注明无 Maker 变体（评审定夺）。
- **合并顺序 A 先 B 后**（wt-B 读 wt-A 的 guardian SVG/compare；--no-ff）。

## Risks / Trade-offs

- [amg1 两帧几乎无差] → 入库前断言 f1≠f2（字节不同）；若某方向撞车，换同前缀...无第三帧 → 降级用邻前缀同方向？不，跨角色混搭更不诚实 → 真撞车则报告打回换前缀（~90 候选充足）。
- [32x32 Indexed 转 RGBA 色偏] → 转换后跑既有色板封闭断言（输出仍须全落 palette/透明）；转码器只做索引→RGB 展开，不做抖动（System.Drawing 存 PNG 默认无损）。
- [128 synth 在 128 下 motif 失真] → 即实测要回答的问题；失真则修 motif（wt-A 范围）而非降档。
- [`.tres` 文本格式与 Godot 版本漂移] → 目标 Godot 4.x SpriteFrames 文本格式；测试钉死关键节（`[sub_resource type="SpriteFrames"]`、动画名数组、regions），逐字节 golden 只钉最小单动画例；无 Godot 下的验证=文本契约 + recipe 映射一致性复核。

## Migration Plan

评审确认 → prep（骨架 + 本提案 8 文件）→ 下发 → wt-A 合（`feat(m3)` gate）→ wt-B rebase + 尾巴 → 合 → 主控勾 tasks + agent-log + milestones M3 刷新 + sync/archive。Rollback：倒序 revert；新资产/新目录 revert 即回 6 资产。

## Open Questions

- td 真源到达后的替换流程——届时单列 change（删占位测试 + 换 32 文件 + 回归）。
- 真实角色 prompt_hash 语义（导入源非 prompt 产物）——沿用 pending，M4 定。
