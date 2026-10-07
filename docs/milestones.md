# 里程碑规划（M0–M4）

> **目的**：把产品里程碑对照 spec capabilities 与 openspec changes，回答"现在到哪、下一步是什么"。
> **维护**：主控独占更新（随每轮收官刷新状态与遗留），评审方核对，用户拍板增减。轮次级执行细节见 `docs/agent-log.md`。
> **三个单位的关系**：里程碑 = 产品交付单位（本文件）；change = openspec 规范单位（`openspec/changes/<name>/`，proposal/design/tasks/specs）；轮 = 执行单位（主控规划 + wt-A/wt-B 两轴并行一轮）。一个里程碑可跨多笔 change。

## 状态总表

| 里程碑 | 内容 | spec capabilities | change / 轮 | 状态 |
|---|---|---|---|---|
| **M0** | 人物管线首闭环：量化→派生→矢量化→清单→矩阵→双表→引擎占位 | character-mvp 全部 6 项（character-asset / animation-keyframes / pixel-quantize / svg-engineering / spritesheet-export / prototype-prompt） | `2026-10-06-pixel-generator-character-mvp`（轮 0） | ✅ 已归档 |
| **M1** | 多类资产 + Godot 配方 + 感知色距 + web 多资产可看可切 | static-asset / spritesheet-export(配方) / pixel-quantize(OKLCH+Bayer) / prototype-prompt(kind-aware) / animation-keyframes(静态矩阵) | `2026-10-06-static-kinds-godot-adapter`（轮 1）+ `2026-10-07-perceptual-color-plus-static-web`（轮 2） | ✅ 已归档 |
| **M2** | **真实素材导入 MVP：喂真图 → 出真资产 → 人工可看** | prototype-import(新) / spritesheet-export(静态单帧) / static-asset(导入实例) | `real-import-mvp`（轮 3，提案已草成待 prep） | 🔶 进行中 |
| **M3** | 引擎一键接入 + 大尺寸档 + 真实角色 24 格 | spritesheet-export(.tres) / pixel-quantize(128 档) / character-asset(真实全矩阵) | 轮 4 | ⬜ |
| **M4** | img2img 实调 | prototype-prompt | 轮 5（可选，最后） | ⬜ |

---

## M0 — 人物管线首闭环（✅ 2026-10-06 归档）

knight_001 全 24 clips（idle 1f / walk 3f / attack 4f × 4 方向 × td/sd）全链路：外部原型位 → 几何量化 → OKLCH/欧氏色板映射 → 逐像素矢量化（语义分层）→ asset.json 清单 → 12 格矩阵预览（缺格占位永不导出）→ Full/Maker 双模式拼表 → 引擎占位。

**验收锚点**：view SVG 64 + 母版 2；矩阵 verify-5.2 OK；walk 表 192x256 / attack Full 256x256 / Maker 192x256，行序 fr/bk/lf/rt，Maker 截断公示 + `$` 命名；generic 17 文件无 `.godot/.tres`。

**轮内修复**：步态循环 `%3` → `%4`（旧实现致 rt 方向恒等于 fr、attack 第 4 帧恒等于第 1 帧）+ 眼睛朝向偏移 + 姿态两两不同回归测试。

## M1 — 多类资产 + 感知色距 + web 多资产（✅ 2026-10-07 归档，跨轮 1 + 轮 2）

- **轮 1**（static-kinds-godot-adapter）：weapon/building/prop/scenery 四类静态资产（各 idle-only 8 clips）+ kind-aware 校验器（palette/尺寸分档/static 禁 walk-attack，character 24 格门不变）+ Godot IMPORT-RECIPE（gap #13–#24 逐项映射或缺省声明）+ `verify-recipe.mjs`（8 maps / 104 帧自检）。
- **轮 2**（perceptual-color-plus-static-web）：OKLCH 升为默认色距（欧氏保留作对照）；ordered-Bayer 在板无害证明（快速通道：源像素精确命中色板则跳 ±6 偏移，scenery/building 在板帧 bayer≡none 字节成立；character/weapon/prop 拒收）；web 三处 character-only 解耦（asset-shell / matrix / prompt 按 kind 分支，`?? 'character'` 缺省）+ 资产切换器 + `verify-static.mjs`；32 个静态 prompt_hash 逐 clip 回填（td/fr 锚点全中）。

**验收锚点**：主干 117/117；6× web verify 全绿；5× manifest `--check-files` 全 OK；recipe 自检 8 maps / 104 帧。

**遗留去向**：`.tres` 生成器原记录"留轮 3"，里程碑拍板后**顺延至 M3（轮 4）**；building/scenery 128 档生成未实测 → M3；img2img 前置数据（32 静态真实 hash）已就绪 → M4。

## M2 — 真实素材导入 MVP（🔶 轮 3，当前目标）

**目标**：喂真图 → 出真资产 → 人工可看。现状是 synth 闭环：全部 SVG 由程序合成，真实像素输入从未进过管线。

**关键 spec 约束**：character 类校验器强制 24 格完整矩阵（缺格不可导出是硬线）——真实角色需 64 张真实帧，放 M3。M2 的真实导入演示用**静态类 idle-only 8 视图**（校验器已支持，spec 内）。

**四件交付**（change `real-import-mvp`，提案/design/tasks/双卡已草成）：
1. `tools/import-prototype.mjs`（wt-A）：真实 PNG → `quantizeGeometry` 分档量化 → kind 色板 OKLCH 映射 → 矢量化落入冻结骨架 clip 槽 + 输出量化前后并排对比 PNG（`--dir` 可单槽复写）。
2. 第 6 资产 `potion_001`（主控 prep 冻结骨架：prop / `palette_prop@v1` / size 64 / seed 2005 / idle-only 8 clips / hash `pending`）——真实源 `resources/Icons34x34byAilsEnglish2013.zip`（402 张 34×34 PNG 图标，fixtures 取 `I_Chest01`/`I_Key01`/`I_GoldCoin`，已实证存在）。
3. 静态单帧 PNG 导出（wt-A，spec delta：spritesheet-export ADDED static single-frame，full-only 4 列 × 1 行）——真实资产直进任意引擎。
4. web 量化对比视图 + `ASSET_IDS` 扩容至 6 + `web/verify-real-import.mjs` + docs（wt-B）。

**素材双轨**：fixtures（Icons 图标）供 agent 自主完成验收，零外部依赖；用户自备 AI 图走 `prototypes/<id>/` 约定目录（gitignore，不入库）+ 一条导入命令。

**人工验收清单（轮 3 合并后执行）**：
1. 仓库根起本地 server（如 `npx serve`）——`fetch(../assets/…)` 在 `file://` 下被浏览器拦截，必须走 server；
2. 打开 `/web/` → 资产切换器切到 `potion_001` → 看 8 格 idle 矩阵播放；
3. 看量化对比图：左原始 34×34 图标，右 64px 色板化像素结果；
4. 打开 `sheets/` 静态单帧 PNG（可直接拖进引擎）；
5. （可选）把自己的 AI 原型图放入 `prototypes/potion_001/input.png` 重跑导入，重复 2–4。

## M3 — 引擎一键接入 + 大尺寸档 + 真实角色（⬜ 轮 4）

- Godot `.tres` 生成器：从 map.json 产出 AtlasTexture/SpriteFrames 资源（gap #13–#17 的 Godot 侧落地，导入从"照配方手工"变"一键"）。
- building/scenery 128 档生成实测（schema/validator 已允许、从未跑过）。
- 真实角色 24 格：源 `resources/last-guardian-sprites.zip`（716 张按 `amg1_{fr,bk,lf,rt}{帧号}` 命名的四方向帧）——先核对帧数是否覆盖 idle+walk+attack 64 帧，不足则补拍/补生成；character 校验器满门控不变。

## M4 — img2img 实调（⬜ 轮 5，可选）

外部生图模型实调替代手动导入（denoise 档位与 seed 锁语义已固化，32 静态真实 hash 前置数据已就绪）。需联网与 key，违离线基线，故排在最后；无 key 时全流程手动导入路径（M2 已交付）始终可用。

---

## 轮次索引

轮 0–2 的执行与评审细节见 `docs/agent-log.md`（主控独占）；轮 3 起随收官追加。

## 变更记录

- 2026-10-07 初版：M0/M1 达成（两/三笔 change 归档），M2 `real-import-mvp` 立项（提案已草成、待评审确认后 prep），M3/M4 排队。
