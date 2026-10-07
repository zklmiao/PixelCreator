# 任务卡 — wt-B 呈现/文档轴（轮 3 / real-import-mvp）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-B`（只在此目录内改）。
- 分支：`feat/compare-view`，自主控 prep commit 新建（基点：prep `8f2d15a`；开始前 `git log --oneline -1` 核对，`git status --short` 干净）。
- 独立会话：本卡是唯一依据；歧义按字面做并在报告注明。
- 时序：主体与 wt-A 并行（compare 图路径按约定先行，可用任意 PNG 占位开发）；合并前等主控 gate 通知（main 含 `import` 提交），gate 后 rebase → 确认 fixture compare 图可读 → DoD 重跑 → 尾巴报告。

## 2. 背景（一段）

M2 要"人工可看效果"：wt-A 交付真实导入 compare 图（约定路径 `fixtures/import/*.compare.png`）与第 6 资产 `potion_001`。你的任务：web 对比视图 + 资产切换扩到 6 + 新 verify + docs 把人工从零带到看见。红线：`verify-1.1/4.1/4.2/5.2` 不改一字；`web/lib/*.js` 零依赖（`node:` 禁入，verify 脚本不受限）。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1                 # 预期：本卡 §1 基点 prep
node --test tools/*.test.mjs         # 预期：tests 117, pass 117, fail 0
node web/verify-1.1.mjs              # 全 OK（仅 validateAsset 侧，见轮 2 结论）
node web/verify-4.1.mjs              # 全 OK
node web/verify-4.2.mjs              # 全 OK
node web/verify-5.2.mjs              # 全 OK
node web/verify-static.mjs           # 全 OK
```

## 4. 任务与验收

- [ ] **B1 — 对比视图 + 6 资产。** web 新增量化对比区：并排展示 `fixtures/import/*.compare.png`（3 件；`prototypes/<id>/*.compare.png` 本地同约定兼容，无文件时缺位提示、页面不崩）。`ASSET_IDS`/`ASSET_URLS`（`asset-shell.js`）扩 `potion_001`，同提交同步 `verify-static.mjs:26` 精确断言到 6 资产（`knight,sword,house,crate,tree,potion` 顺序）。验收：旧 4 verify 全绿；potion 切过去矩阵 8 格（SVG 未生成前允许 missing 占位——verify 只断形态不断满格）。
- [ ] **B2 — verify + docs。** 新增 `web/verify-real-import.mjs`：3 张 compare 图存在 + 可解析为 PNG + 尺寸公式（左原右量化并排）+ 6 shells 全 OK（potion 用 fs + `checkShell`，`loadShell` 禁在 node 下调）+ character 回归项。docs 落档（扩展 `docs/static-web.md` 或新 `docs/real-import.md`），必须写清人工查看路径：(1) 仓库根起 server（例 `npx serve`）；(2) 打开 `/web/`；(3) 看对比区 + 切 6 资产矩阵；并写清 `file://` 直接打开会被浏览器拦 fetch、必须走 server 的前提。用户自备图流程：`prototypes/<id>/input.png` + `node tools/import-prototype.mjs --asset <id> --src prototypes/<id>/input.png`。
- [ ] **B3 — 尾巴（gate 后）。** rebase 到新 main → 确认 3 张 fixture compare 图在位可读 → 全套 DoD 重跑（tools 测试数以实际为准，预期 ≥117）→ 按 §8 补发尾巴报告。

## 5. 拥有 / 禁改

- 可写：`web/**`、`docs/**`、`web/verify-real-import.mjs`（含 `verify-static` 精确断言同步）。
- 禁碰：`tools/`（全部）、`assets/**`、`palettes/`、`fixtures/`、`openspec/**`、`package.json`、`engine-placeholder/**`。`map.json` 零改动；不建 `.godot/.tres`。

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
git log main --format=%s | grep -m1 -iE "real-import|feat\(import\)"    # gate 确认（尾巴阶段，收紧防历史误配）
```

外加：本地 server 下页面可达性由 agent 自证（读文件/起 server fetch，断言页面含 compare 图引用与 6 资产选项；报告写"agent 自证"，不要写成"人工已看"——人工验收由用户按 `docs/milestones.md` M2 清单最终执行）。

## 8. 完成报告格式

```
基点：prep <sha>（与 §1 一致确认）
分支/sha：feat/compare-view @ <sha>（rebase 到 main <含import的sha> 确认 + gate 输出粘贴）
B1：改动文件行；ASSET_IDS 6 项值粘贴；verify-static 同步行号；旧 4 verify 输出粘贴
B2：verify-real-import.mjs 全输出粘贴；docs 文件名 + 人工路径章节行号
DoD：逐条输出粘贴（tests 计 x/y；各 verify 结尾 OK 行）
偏离/遗留：无则写"无"
```
