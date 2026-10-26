# 任务卡 — wt-B 呈现轴（轮 8 / polish-hardening）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-B`（只在此目录内改）。
- 分支：`feat/ui-polish`，自主控 prep commit 新建（基点以提交主题核对，同 A 卡；具体 sha 随下发消息给出）。
- 时序：主体与 wt-A 并行；B2 的 clip 参数在 wt-A 合并前降级为整资产重生成（现状语义），rebase 后自动真单格。合并前等 gate（main 含 `feat(hardening)`）→ rebase → 联调自证 → DoD 重跑 → 尾巴报告。

## 2. 背景（一段）

用户人工使用新四区页面后给出优化清单（backlog A1–A5/B1–B4/B5，见 docs/optimization-backlog.md）：对比图右半透明像素在深底上不可见、导出中心空洞且校验失败看起来像成功、"生成此格"重生成整个资产、本地原型对比永远 dead、Prompt 表单不支持静态资产、确认条孤儿化。你的任务在 web 三文件内全部修掉——视觉像素主题与四区 IA 不动，只做区内重组与细节。红线：7 个 verify 不改一字；`web/lib/**` 冻结；wt-A 在 tools 侧同步交付 clip-scoped generate 端点与 `/prototypes/` 静态服务（契约见 web-bridge delta，已冻结）。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1          # 预期：r8 prep
node --test tools/*.test.mjs  # 175/175（M4 已并主干）
7× node web/verify-*.mjs      # 全 OK
```

## 4. 任务与验收

- [ ] **B1 — 校验结果可见化 + A3 导出内容化（同一结果区）**：导出中心内嵌结果区——点"校验资产"后内联渲染（绿：就绪摘要；红：errors[] + missing[] 逐条 + "去资产库"跳转链接），不再只进开发者面板；四按钮（校验/拼表/.tres/SVG）执行后同一区渲染 willWrite 清单与产物摘要行（`.tres` 动画数 / sheets 尺寸——preview 数据已有）。验收：构造校验失败（临时改坏资产在 temp 目录不可行则用浏览器 mock fetch 断言渲染路径）→ 红色清单在场；agent 自证 fetch 断言结果区 DOM。
- [ ] **B2 — "生成此格"接 clip 参数**：矩阵格按钮 body 发 `{assetId, clip: "<persp>/<action>/<dir>"}`；wt-A 合并前服务端忽略 clip（整资产重生成，现状语义）——按钮加 hint "整资产重生成（单格模式 wt-A 合并后生效）"；rebase 后自动真单格（willWrite 恰该 clip 文件集，UI 断言）。验收：rebase 后单格 preview willWrite 断言。
- [ ] **B3 — /prototypes/ 服务接线**：server 白名单由 wt-A 扩展；你的部分——导入区"刷新本地原型对比"按钮改为真 fetch（`../prototypes/<id>/input.compare.png`），存在显示、缺失显式提示（现状已有 graceful 分支，去掉"永远 dead"的死路径提示文案）。
- [ ] **B4 — Prompt 表单 kind 选择**：表单加 kind 选择（character 默认 + 5 静态）；character 路径字节不变（verify-4.1 护栏）；静态 kind 时字段切换为 object/colors/vibe（prompt 引擎 STATIC 路径已支持），输出区同格式。验收：kind=prop 输出含 prop 对象词且无人形约束词（prompt 引擎已有断言镜像）。
- [ ] **B5 — UI 打磨包（A1/A2/A4/A5 + B5）**：compare 右半棋盘格衬底 + 分隔把手加粗；资产网格尾部"+ 新建资产"占位卡（跳 Prompt 工作台）；矩阵标题改箭头+中文（`idle · fr` → `待机 · 前方`式，内部名进 title）；确认条按 jobId 列表式并存（不再孤儿化）+ SSE error/作业失败分流显示；卡片 hover 反馈；128/64 视觉等高。验收：逐项 DOM/样式断言（agent 自证）。
- [ ] **B6 — 提交**：DoD 全绿后单 commit，消息含 `feat(ui-polish)`（gate：main 含 `feat(hardening)` 后 rebase 联调）。

## 5. 拥有 / 禁改

- 可写：`web/index.html`、`web/app.js`、`web/styles.css`、`docs/`（若有新指引）。
- 禁碰：`web/lib/**`、`web/verify-*.mjs` 全部（7 个一字不改）、`tools/**`、`assets/**`、`palettes/**`、`fixtures/**`、`sheets/**`、`godot/**`、`openspec/**`、`package.json`、`prototypes/**`。

## 6. 守则

同项目铁律：`web/lib` 零依赖零改动；值断言优先；仓库外实验；不联网；agent 自证不写"人工已看"。

## 7. DoD（全绿，输出逐行粘进报告；rebase 后重跑全部）

```
node --test tools/*.test.mjs        # 143/143（rebase 后 175/175 或 wt-A 实际计数）
7× node web/verify-*.mjs
node --check web/app.js
git diff --stat -- web/lib/         # 空
```

外加 agent 自证（server 下 fetch/DOM 断言，关键行粘贴）：四区导航在场；compare 右半衬底样式类在场；"+ 新建资产"卡在场；导出结果区 DOM；确认条列表式容器；无内部编号泄漏（grep 用户可见区）。

## 8. 完成报告格式

```
基点：prep <sha>（确认）；rebase 到 main <含 feat(hardening) 的 sha> + gate 输出
B1/A3：结果区实现要点；失败路径渲染断言
B2：clip 参数发送证明；降级/单格两态说明
B3：/prototypes/ 接线证明
B4：kind 切换实现；静态输出断言
B5：逐项断言值
DoD：逐条输出粘贴
偏离/遗留：无则写"无"
```
