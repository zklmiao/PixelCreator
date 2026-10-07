# 任务卡 — wt-A 管线轴（轮 4 / real-character-m3）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-A`（只在此目录内改）。
- 分支：`feat/m3-tracks`，自主控 prep commit 新建（基点：prep `0dddede`；开始前 `git log --oneline -1` 核对，`git status --short` 干净）。
- 独立会话：本卡是唯一依据；歧义按字面做并在报告注明。

## 2. 背景（一段）

M3 要首个真实角色 + 一键 `.tres` + 128 实测。主控 prep 已冻结 `guardian_001` 骨架（character，`palette_character@v1`，64，seed 2006，24 clips / 40 slots 全 pending，零 SVG）。备料实证（主控已做）：guardian ZIP = ~90 前缀 × 4 方向 × 2 帧的单帧 GIF（32x32 8bpp Indexed）+ house1-4.gif（128x128）；选 amg1（8 文件齐）。你的任务：guardian 导入 + `.tres` 生成器 + house/tree 上 128。gate 判式：`git log main --format=%s | grep -m1 "feat(m3)"`（严式，勿用宽式）。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1                                    # 预期：本卡 §1 基点 prep
node --test tools/*.test.mjs                            # 预期：tests 136, pass 136, fail 0
node tools/asset-manifest.mjs validate assets/guardian_001/asset.json
# 预期：骨架形状 OK（零 SVG，--check-files 红是预期；7× 全绿是 DoD）
```

## 4. 任务与验收（引用 spec 原文）

- [ ] **A1 — guardian 导入。** spec（prototype-import ADDED）：*"The system SHALL support `node tools/import-prototype.mjs --asset <id> --map <manifest.json>` assigning one source PNG per clip slot … with the manifest committed and reviewed."* 做法：amg1 8 GIF 经 PowerShell System.Drawing 转 PNG 入库 `fixtures/guardian/`（转后断言 32x32 RGBA + 同方向 f1≠f2 字节不同；若某方向撞车，打回换前缀，禁跨角色混搭）；写 `fixtures/guardian/guardian-map.json`（clip → 源文件名，复用宣言：idle=[f1]/walk=[f1,f2]/attack=[f2,f1]）；`--map` 扩展落 40 视图 + 2 母版（母版 fr 内容 + master 标记）。spec（character-asset ADDED）：td 槽填 sd 像素复制 + 占位测试钉 `td==sd` 字节相等（值断言，注明 placeholder）。场景验收：*"WHEN importing `guardian_001` via `fixtures/guardian/guardian-map.json` / THEN 40 view slots plus 2 masters land … and the reuse declaration matches landed bytes"*；guardian 6 Full + 4 Maker sheets（idle 仅 Full；walk/attack 双模式，Maker 按既有 f1,f2+idle-pad 路径；出不了则 docs 注明无 Maker 变体并在报告说明）。
- [ ] **A2 — `.tres` 生成器 + knight idle 表。** spec（godot-adapter MODIFIED）：*"The system SHALL ship `tools/tres.mjs` generating `godot/<id>.spriteframes.tres` from shipped Full maps only … animations named `{persp}/{action}/{dir}`, speed=fps, loop→LOOP_FORWARD/LOOP_NONE"*。做法：`tools/tres.mjs`（`exportTres(assetId)` + CLI）→ `godot/knight_001.spriteframes.tres`（24 动画，含 idle）+ `godot/guardian_001.spriteframes.tres`（24 动画）；顺手补 knight idle sheets（Full-only，+2 PNG +2 map，既有欠账；确有阻塞则 docs/recipe §6 声明无 idle 并在报告说明，由评审定夺）；AtlasTexture 子资源 region 照 map；uid 省略；只读 Full maps（Maker 不进，docs 注明——docs 修文归 wt-B，你只保证生成器行为）。测试值断言（动画名集/regions/帧数 + 最小单动画 golden）；与 IMPORT-RECIPE §2–§3 逐项复核一致。
- [ ] **A3 — 128 实测。** `assets/house_001/asset.json` + `assets/tree_001/asset.json` 仅 `"size": 64`→`128`（单字段授权，其他字节禁动，主控核 diff）；synth motif 原函数重跑（各 8+2 文件）；同步旧 64 尺寸断言为 128；几何/确定性回归（临时目录重跑字节一致）。house1-4.gif 不用（4 变体对不上 8 槽，不引入第二处复用）。
- [ ] **A4 — 提交。** 单 commit；消息含 `feat(m3)`（例：`feat(m3): guardian import plus tres generator plus 128 tiers (A1-A4)`）。

## 5. 拥有 / 禁改

- 可写：`tools/*.mjs` + `tools/*.test.mjs`（placeholder 除外）、`fixtures/guardian/`（新）、`godot/`（新）、guardian/house/tree SVG 落盘、`sheets/` guardian 6 表、house/tree JSON 仅 size 字段。
- 禁碰：schema、`assets/guardian_001` 结构（除落盘文件）、其他 assets JSON、`package.json`、`openspec/**`、`docs/**`、`web/**`、`engine-placeholder/**`、`tools/placeholder.test.mjs`、Gemini/SVG 手工件（不进链）。生成物由工具写，禁手改。

## 6. 守则

只读核查在外；实验仓库外临时目录；不提交临时文件；不联网；Git Bash；node 内正斜杠；确定性；值断言优先，禁录制实现输出（确需精确值写独立依据）；GIF 解码只允许在入库转换一步用 System.Drawing，管线运行时 PNG-only。

## 7. DoD（全绿，输出粘贴进报告）

```
node --test tools/*.test.mjs
node tools/asset-manifest.mjs validate assets/knight_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/sword_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/house_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/crate_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/tree_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/potion_001/asset.json --check-files
node tools/asset-manifest.mjs validate assets/guardian_001/asset.json --check-files
node tools/sheet.mjs export --asset guardian_001 --out sheets
node tools/tres.mjs export --asset knight_001
node tools/tres.mjs export --asset guardian_001
```

外加：仓库外临时目录重跑 guardian import + guardian export + tres + 128 regen，与提交字节比对一致。

## 8. 完成报告格式

```
基点：prep <sha>（与 §1 一致确认）
分支/sha：feat/m3-tracks @ <sha>（含 feat(m3) 字样确认）
A1：fixtures 清单 + 转换命令；map 复用宣言行号；td==sd 占位断言值；guardian --check-files OK 行
A2：tres 文件清单；动画数（16/24）；关键断言值；recipe 复核结论
A3：house/tree size diff（仅 size 行）；128 几何断言；临时目录比对结果
DoD：逐条输出粘贴（tests 计 x/y；7× manifest OK 行）
偏离/遗留：无则写"无"
```
