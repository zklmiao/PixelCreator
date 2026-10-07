# 任务卡 — wt-A 管线轴（轮 3 / real-import-mvp）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-A`（只在此目录内改）。
- 分支：`feat/real-import`，自主控 prep commit 新建（基点 sha 主控下发时填入本卡；开始前 `git log --oneline -1` 核对，`git status --short` 干净）。
- 独立会话：本卡是唯一依据；歧义按字面做并在报告注明。

## 2. 背景（一段）

PixeCreator 管线至今是 synth 闭环（SVG 全由 `synth*Pixels` 程序化生成），M2 要打通第一条真实链路。主控 prep 已冻结第 6 资产 `potion_001`（prop，64，seed 2005，idle-only 8 clips，全 `"pending"`，零 SVG）+ `prototypes/` 入 `.gitignore`。你的任务：真实 PNG 导入器 + fixtures 入库 + 静态单帧导出 + potion 落盘。复用：`quantizeGeometry`（`quantize.mjs:103`）、OKLCH `mapFrameToPalette`（`palette.mjs:202`）、`pixelsToSvg`（`vectorize.mjs:218`）、`exportSheets`（`sheet.mjs:211`）。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1                                    # 预期：本卡 §1 基点 prep
node --test tools/*.test.mjs                            # 预期：tests 117, pass 117, fail 0
node tools/asset-manifest.mjs validate assets/potion_001/asset.json
# 预期：骨架形状 OK（注意：无 --check-files，因此时零 SVG；6× --check-files 全绿是 DoD 不是自查）
# 来源 zip 实测结论（评审已确认）：resources/Icons34x34byAilsEnglish2013.zip 内 402 PNG @ 34x34 RGBA 带透明
```

## 4. 任务与验收（引用 spec 原文）

spec：`specs/prototype-import/spec.md`（新 capability）+ `specs/spritesheet-export/spec.md`（ADDED 静态单帧）。

- [ ] **A1 — 导入器。** spec 原文：*"The system SHALL import a real PNG into a frozen static skeleton via `node tools/import-prototype.mjs --asset <id> --src <png>` … replicating one source to all 8 idle slots by default"* + *"import SHALL also write the two perspective masters (fr-slot content, data-master=true)"*。实现 `tools/import-prototype.mjs`：pngjs 解码 → `quantizeGeometry`（资产 size 档）→ OKLCH 映射 → `pixelsToSvg` 落 8 视图 + 2 母版（母版取 fr 槽内容 + `master:true` 标记，复用 `pixelsToSvg` master 语义；`--dir` 单槽复写；`--out` 重定向 compare 输出）；`prompt_hash` 保持 `"pending"`（schema 不动）。spec 原文：*"The system SHALL write `<basename>.compare.png` … (source left, quantized result right, integer upscale semantics)"*。
- [ ] **A2 — fixtures 与单测。** spec 原文：*"The system SHALL commit curated fixtures under `fixtures/import/` (source zip + filename recorded in test comments)"*。入库 3 件（原名）：`I_Chest01.png`（大色块）、`I_Key01.png`（细线条）、`I_GoldCoin.png`（高透明边缘）+ 各自 `.compare.png` 提交。单测值断言：34→64 fit/pad 精确数值、输出封闭（色板精确字节或透明）、compare 尺寸公式、导入跑两遍字节一致；旧套件全绿。场景验收：*"WHEN running import tests without network / THEN all inputs resolve to committed fixtures and outputs are byte-identical across runs"*。
- [ ] **A3 — 静态单帧导出。** spec 原文：*"The system SHALL export static idle-only assets as one PNG per perspective (`<prefix>_<persp>_idle.png`, 4 columns × 1 row, `cell = asset.size`, column order fr/bk/lf/rt) plus a full-mode `map.json` (x/y/w/h, fps 2, loop true); Maker mode SHALL NOT apply"*。`export --asset potion_001 --out sheets` 落 +2 PNG +2 map；色板纪律测试（每像素非透明即色板精确字节）；knight 双模式不动；确定性回归（临时目录重跑字节一致）。场景验收：*"WHEN exporting `potion_001` at 64px / THEN each perspective PNG is 256x64 … every opaque pixel is an exact palette byte"*。
- [ ] **A4 — 提交。** 单 commit；消息含 `import`（例：`feat(import): real png prototype import plus static single-frame export (A1-A4)`）。

## 5. 拥有 / 禁改

- 可写：`tools/*.mjs` + `tools/*.test.mjs`（placeholder 除外）、`fixtures/`（新目录）、potion SVG 落盘（8 视图 + 2 母版走 `generate` 语义或 import 落槽——以 spec 为准：import 落槽）、`sheets/` 新增 4 文件。
- 禁碰：`assets/*/asset.json` 结构、`assets/asset.schema.json`、`package.json`、`openspec/**`、`docs/**`、`web/**`、`engine-placeholder/**`、`tools/placeholder.test.mjs`。生成物由工具写，禁手改。

## 6. 守则

只读核查在外；实验仓库外临时目录；不提交临时文件；不联网；Git Bash；node 内正斜杠；确定性（同输入字节一致）；值断言优先，禁录制实现输出为期望（确需精确值须在报告写独立依据）。

## 7. DoD（全绿，输出粘贴进报告）

```
node --test tools/*.test.mjs
node tools/asset-manifest.mjs validate assets/knight_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/sword_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/house_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/crate_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/tree_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/potion_001/asset.json --check-files
node tools/import-prototype.mjs --asset potion_001 --src fixtures/import/I_Chest01.png
node tools/sheet.mjs export --asset potion_001 --out sheets
```

外加：仓库外临时目录重跑 import + 两 export，与提交字节比对一致。

## 8. 完成报告格式

```
基点：prep <sha>（与 §1 一致确认）
分支/sha：feat/real-import @ <sha>（含 import 字样确认）
A1：实现文件行；8 槽落盘验证（potion --check-files OK 行）；compare 约定路径
A2：fixtures 清单 + 来源注释行号；关键断言值粘贴
A3：sheets 新增 4 文件 + 几何/map 值粘贴；色板纪律断言；临时目录比对结果
DoD：逐条输出粘贴（tests 计 x/y；6× manifest OK 行）
偏离/遗留：无则写"无"
```
