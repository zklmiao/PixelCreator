# Proposal — real-character-m3

## Why

M2 交付了真实链路（导入器 + fixtures + 静态单帧 + 对比视图），但管线仍缺三块 M3 才完整：①Godot 侧仍是手工配方（`.tres` 生成器自轮 1 起一直"留后续"，spec 甚至明写 "No tres generator this round"）；②128 档只有 schema/validator 允许、从未真实跑过；③角色仍是 synth（knight 64 视图零真实像素）。备料核查结论：`last-guardian-sprites` 722 项 = 716 GIF（含 house1-4）+ 4 jpg + 1 readme + 1 目录项；716 GIF = 89 前缀 × 8（含 amg1 系 8 件：4 方向 × 2 帧单帧 GIF，32x32 8bpp）+ house 4 件（128x128）——M3 里程碑"核对帧数"一项的答案是**不足**：每方向仅 2 帧可用；且全系侧视语义，td 视角无源。本 change 在承认这两缺口的前提下交付最小合法真实角色 + 一键 `.tres` + 128 实测。

## What Changes

- 主控 prep（先落，主控独占）：冻结 `guardian_001` 骨架（character，`palette_character@v1`，64，seed 2006，24 clips / 40 slots，全 `"pending"`，零 SVG——amg1 系）+ 本提案 8 文件。house/tree 的 64→128 由 wt-A 在,其 commit 内改（仅 `size` 字段，单文件单字段授权，diff 逐行核）。
- wt-A 管线轴（`feat/m3-tracks`）：①guardian 导入（fixtures：amg1 8 GIF 经 System.Drawing 转 PNG 入库 `fixtures/guardian/` + `guardian-map.json` 逐 clip 记源；`--map` 多槽导入扩展；idle=[f1]/walk=[f1,f2]/attack=[f2,f1] 复用宣言；td 槽 = sd 像素复制，占位测试钉死 td==sd）；②`tools/tres.mjs`（Full maps → `godot/*.tres`，动画名/fps/loop/gap 缺省照 recipe，knight + guardian）；③house_001/tree_001 提到 128（synth 原 motif 重跑，`size` 字段授权改，旧 64 断言同步更新）；④单 commit（消息含 `feat(m3)`，为 gate）。
- wt-B 呈现轴（`feat/m3-view`）：`ASSET_IDS` 扩 guardian（7 资产）+ `verify-static` 同步 + `verify-real-import` 增 guardian provenance 段 + compare 视图列 guardian compares + `docs/real-import.md` 扩展（含 td 占位声明与 GIF→PNG 转换说明）+ recipe §6 "不产.tres" 改指向 `godot/`。
- 素材定案：fixtures 仅新增 `fixtures/guardian/`（8 PNG + map + 8 compares）；zip/GIF 原件不入库；Gemini 2752x1536 场景图（非 sprite 几何）与手工 SVG 留 `resources/` untracked、不进管线（铁律）；`prop 34x34/` 全量解包不入库（fixtures 已固化）。
- 非目标：td 真源替换（留后续，有源即换）； fuller motion（补拍/补生成留 M4+）；potion hash 回填（仍 pending）；img2img。

## Capabilities

### New Capabilities

- 无（不新增 spec 文件）。

### Modified Capabilities

- `character-asset`：新增 td 共享占位许可（real-imported character，test-pinned，可移除条件）。
- `godot-adapter`："No tres" 条款退役，新增 `.tres` 生成器需求。
- `prototype-import`：新增 `--map` 多槽清单导入。

## Impact

- 改动：`assets/guardian_001/asset.json`（prep 骨架 → wt-A 填 40 SVG + 2 母版）、`assets/house_001`/`tree_001`（size 128 + 20 SVG 重跑，wt-A，单字段授权）、`tools/import-prototype.mjs` + `tools/tres.mjs`（新）+ `godot/`（新目录，wt-A）+ tests（wt-A）、`fixtures/guardian/`（wt-A）、`sheets/` guardian 6 表（wt-A）、`web/**` + `docs/**`（wt-B）。
- 零依赖新增（GIF 解码只发生在入库前的一次性 System.Drawing 转换，不进管线运行时），离线可跑；确定性铁律延续。
