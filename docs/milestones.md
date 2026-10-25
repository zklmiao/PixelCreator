# 里程碑规划（M0–M4）

> **目的**：把产品里程碑对照 spec capabilities 与 openspec changes，回答"现在到哪、下一步是什么"。
> **维护**：主控独占更新（随每轮收官刷新状态与遗留），评审方核对，用户拍板增减。轮次级执行细节见 `docs/agent-log.md`。
> **三个单位的关系**：里程碑 = 产品交付单位（本文件）；change = openspec 规范单位（`openspec/changes/<name>/`，proposal/design/tasks/specs）；轮 = 执行单位（主控规划 + wt-A/wt-B 两轴并行一轮）。一个里程碑可跨多笔 change。

## 状态总表

| 里程碑 | 内容 | spec capabilities | change / 轮 | 状态 |
|---|---|---|---|---|
| **M0** | 人物管线首闭环：量化→派生→矢量化→清单→矩阵→双表→引擎占位 | character-mvp 全部 6 项（character-asset / animation-keyframes / pixel-quantize / svg-engineering / spritesheet-export / prototype-prompt） | `2026-10-06-pixel-generator-character-mvp`（轮 0） | ✅ 已归档 |
| **M1** | 多类资产 + Godot 配方 + 感知色距 + web 多资产可看可切 | static-asset / spritesheet-export(配方) / pixel-quantize(OKLCH+Bayer) / prototype-prompt(kind-aware) / animation-keyframes(静态矩阵) | `2026-10-06-static-kinds-godot-adapter`（轮 1）+ `2026-10-07-perceptual-color-plus-static-web`（轮 2） | ✅ 已归档 |
| **M2** | **真实素材导入 MVP：喂真图 → 出真资产 → 人工可看** | prototype-import(新) / spritesheet-export(静态单帧) / static-asset(导入实例) | `2026-10-07-real-import-mvp`（轮 3） | ✅ 已归档 |
| **M3** | 引擎一键接入 + 大尺寸档 + 真实角色 24 格 | spritesheet-export(.tres) / pixel-quantize(128 档) / character-asset(真实全矩阵) | `2026-10-07-real-character-m3`（轮 4） | ✅ 已归档 |
| **M4** | fuller motion + td 真源 + hash 语义 + img2img 实调 | animation-keyframes(补帧) / character-asset(占位移除) / prototype-prompt(hash 语义+实调) | 轮 5+（img2img 需用户拍板接入方式） | ⬜ |

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

## M2 — 真实素材导入 MVP（✅ 2026-10-07 归档，轮 3）

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

**验收实测（主干）**：`node --test` 136/136；6× manifest `--check-files` 全 OK（含 potion）；7 verify 全绿（含 verify-real-import：4 compares 98x64 + 6 shells + potion 8 格）；recipe 104 帧；potion sheets 256x64 色板零杂色；`potion_001` hash 保持 pending（非目标，不回填）。

**人工验收（✅ 2026-10-07 用户通过）**：用户走完 M2 清单并完成第 5 步自备图导入——从 Icons 包提取 `I_Bottle01–04`，选 `I_Bottle03` 经 `prototypes/potion_001/input.png` 重跑导入（SHA256 与源 zip 一致），potion_001 的 10 个 SVG 现为用户导入的瓶子艺术。为守住"入库源 → 工具 → 生成物"可复现链，`I_Bottle03.png` + compare 已晋级为第 4 个 fixture（`FIX` 3→4，新增 compare 公式测试），主干 136/136。

## M3 — 引擎一键接入 + 大尺寸档 + 真实角色（✅ 2026-10-07 归档，轮 4）

- Godot `.tres` 生成器：从 map.json 产出 AtlasTexture/SpriteFrames 资源（gap #13–#17 的 Godot 侧落地，导入从"照配方手工"变"一键"）。
- building/scenery 128 档生成实测（schema/validator 已允许、从未跑过）。
- 真实角色 24 格：源 `resources/last-guardian-sprites/`（722 项 = 716 GIF + 4 jpg + 1 readme + 1 目录项；实测为 ~90 前缀 × 4 方向 × 2 帧的单帧 32x32 Indexed GIF，非连续动作）——帧数核对结论：不足（每方向仅 2 distinct 帧；idle 1 / walk 2 / attack 2 为门计数下限）；选 amg1 系 8 件；td 无源 → sd 像素复制占位（测试钉死）；character 校验器满门控不变。

**验收实测（主干）**：`node --test` 156/156；7× manifest `--check-files` 全 OK（含 guardian 24/64、house/tree 128）；7 verify 全绿；recipe 104 帧；guardian sheets 6 Full + 4 Maker + knight idle 2；两 `.tres` 24/24 动画；td==sd 整字节 20 组。

**人工验收**：待用户——(1) Godot 4.x 载入 `godot/*.spriteframes.tres`（连 `sheets/` 一起拷，tres 内引用 `res://sheets/*.png`）试播 knight/guardian 各动画；(2) 本地 server 下 web 查看 guardian 24 格矩阵与 house/tree 128 形态。离线验证已覆盖文本契约与映射一致性，Godot 实载是唯一未自动化环节，结果请反馈主控记档。

## M4 — fuller motion + td 真源 + hash 语义 + img2img 实调（⬜ 轮 5+）

- **fuller motion**：guardian 每方向仅 2 帧（门计数下限），补拍/补生成至 3–5 帧让动作更饱满。
- **td 真源**：替换 td=sd 占位——届时单列 change（删占位测试 + 换 20 个 td 文件 + 回归）。
- **hash 语义**：guardian/potion 的 `"pending"` 定案（导入源非 prompt 产物，需要独立于 prompt_hash 的溯源字段或映射）。
- **img2img 实调**：外部生图模型实调替代手动导入（denoise 档位与 seed 锁语义已固化，32 静态真实 hash 前置数据已就绪）。需联网与 key，违离线基线，须用户先拍板接入方式（哪个服务、key 存放）；无 key 时全流程手动导入路径（M2 已交付）始终可用。

---

## 轮次索引

轮 0–4 的执行与评审细节见 `docs/agent-log.md`（主控独占）；轮 5 起随收官追加。

## 变更记录

- 2026-10-07 初版：M0/M1 达成（两/三笔 change 归档），M2 `real-import-mvp` 立项（提案已草成、待评审确认后 prep），M3/M4 排队。
- 2026-10-07 M2 收官：轮 3 合并归档（28b7b36），用户人工验收通过（含自备图导入）；I_Bottle03 晋级第 4 fixture，potion_001 内容为用户导入件，主干 136/136。
- 2026-10-07 M3 收官：轮 4 合并归档（0418a31，含归档事故自报与精确修复）；guardian_001 真实角色（40 视图，td=sd 占位测试钉死）+ tres 24/24 动画 + house/tree 128 档实测；主干 156/156；用户人工验收待做（Godot 载入 .tres）。
- 2026-10-07 轮 4.5 bridge：web-cli-bridge 落库（67f47e1，本地桥服务器：上传导入 + 两段写 + 备份 + SSE）。
- 2026-10-07 轮 5 UI 重设计：web-shell-v2 合并（3005e13）——四区 IA（资产库/导入/导出/Prompt）+ 像素复古主题（token 取自项目色板）+ 开发者面板折叠；web-bridge 成第 10 个 capability；用户"信息乱"反馈闭环，人工验收待做。
- 2026-10-24 轮 6 欠账清理：debts-cleanup 归档——静态单帧表全资产覆盖（sword/crate 64 档、house/tree 128 档）、svg-engineering 母版条款降格（移除条件式）、Bayer 效果测试、verify-bridge 模块可达性审计（postmortem 预防项）、UI 深冷调（用户拍板）；主干 143/143。