# 任务卡 — wt-B 呈现/文档轴（轮 4 / real-character-m3）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-B`（只在此目录内改）。
- 分支：`feat/m3-view`，自主控 prep commit 新建（基点：prep `0dddede`；开始前 `git log --oneline -1` 核对，`git status --short` 干净）。
- 独立会话：本卡是唯一依据；歧义按字面做并在报告注明。
- 时序：主体与 wt-A 并行（guardian SVG 未到前矩阵允许 missing 占位开发）；合并前等主控 gate 通知（main 含 `feat(m3)`：`git log main --format=%s | grep -m1 "feat(m3)"` 有输出），gate 后 rebase → 在位确认 → DoD 重跑 → 尾巴报告。

## 2. 背景（一段）

M3 首个真实角色 `guardian_001`（td=sd 像素复制占位）+ `godot/*.tres` + house/tree 上 128。你的任务：7 资产切换 + guardian 验收段 + compare 视图扩展 + docs + recipe §6 修文。红线：旧 6 verify 不改一字；`web/lib/*.js` 零依赖。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1                 # 预期：本卡 §1 基点 prep
node --test tools/*.test.mjs         # 预期：tests 136, pass 136, fail 0
node web/verify-1.1.mjs              # 全 OK
node web/verify-4.1.mjs              # 全 OK
node web/verify-4.2.mjs              # 全 OK
node web/verify-5.2.mjs              # 全 OK
node web/verify-static.mjs           # 全 OK（6 资产版）
node web/verify-real-import.mjs      # 全 OK
```

## 4. 任务与验收

- [ ] **B1 — 7 资产切换。** `ASSET_IDS`/`ASSET_URLS` 扩 `guardian_001`，同提交同步 `verify-static` 精确断言到 7（`knight,sword,house,crate,tree,potion,guardian`）；guardian 40 视图经既有 `buildMatrix`（td 占位按正常视角消费，不特殊处理）；验收：旧 6 verify 全绿；guardian 未生成前允许 missing 占位（只断 24 格形态：td/sd 各 12 cells）。
- [ ] **B2 — guardian 验收 + docs + recipe 修文。** `verify-real-import.mjs` 增 guardian provenance 段：map 在位 + 8 源 PNG 在位 + 复用宣言（idle f1/walk f1,f2/attack f2,f1）与落盘一致 + td==sd 占位存在；compare 视图列 `fixtures/guardian/*.compare.png`；`docs/real-import.md` 扩展四节：td 占位声明、GIF→PNG 转换说明（System.Drawing 一次性动作）、128 档说明、`.tres` 位置说明；`IMPORT-RECIPE.md` §6 "不产.tres" 改指 `godot/`（只改指向句，不动映射表）。
- [ ] **B3 — 尾巴（gate 后）。** rebase 到新 main → guardian SVG/sheets/tres/compare 在位确认 → 全套 DoD 重跑（测试数以实际为准，预期 ≥136）→ 按 §8 补发尾巴报告。

## 5. 拥有 / 禁改

- 可写：`web/**`、`docs/**`、`engine-placeholder/godot-atlas/IMPORT-RECIPE.md`（仅 §6 指向句）。
- 禁碰：`tools/`（全部）、`assets/**`、`palettes/`、`fixtures/`、`godot/`、`openspec/**`、`package.json`。`map.json` 零改动。

## 6. 守则

只读核查在外；实验仓库外临时目录；不提交临时文件；不联网；Git Bash；node 内正斜杠；`web/lib` 零依赖；值断言优先。

## 7. DoD（全绿，输出粘贴进报告；rebase 后重跑全部）

```
node --test tools/*.test.mjs
node web/verify-1.1.mjs
node web/verify-4.1.mjs
node web/verify-4.2.mjs
node web/verify-5.2.mjs
node web/verify-static.mjs
node web/verify-real-import.mjs
node engine-placeholder/godot-atlas/verify-recipe.mjs
git log main --format=%s | grep -m1 "feat(m3)"    # gate 确认（尾巴阶段）
```

外加 agent 自证（server 下页面含 guardian 选项 + compare 引用；报告写 agent 自证，不写"人工已看"）。

## 8. 完成报告格式

```
基点：prep <sha>（与 §1 一致确认）
分支/sha：feat/m3-view @ <sha>（rebase 到 main <含feat(m3)的sha> 确认 + gate 输出粘贴）
B1：改动文件行；ASSET_IDS 7 项值粘贴；verify-static 同步行号；旧 6 verify 输出粘贴
B2：verify-real-import 新增段全输出粘贴；docs 章节行号；recipe §6 改句
DoD：逐条输出粘贴（tests 计 x/y；各 verify 结尾 OK 行）
偏离/遗留：无则写"无"
```
