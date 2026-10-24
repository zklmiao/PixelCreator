# 任务卡 — wt-B 呈现轴（轮 5 / web-shell-v2）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-B`（只在此目录内改）。
- 分支：`feat/web-shell-v2`，自主控 prep commit 新建（基点：prep commit（以提交主题核对：`chore(openspec): add web-shell-v2 proposal plus task card (r5-prep)`；具体 sha 随下发消息给出）；开工前 `git log --oneline -1` 核对，`git status --short` 必须干净）。
- 独立会话：本卡是唯一依据；歧义按字面做并在报告注明，不要猜卡外约定。

## 2. 背景（一段）

PixeCreator 的 web 页（`web/index.html` + `app.js` + `styles.css`）随四轮验收堆叠成了"任务编号平铺页"，用户人工验收反馈"信息乱"。本轮纯呈现层重设计：按用户任务重组四区信息架构 + 像素复古主题 + 开发者细节折叠。管线/契约零改动：`web/lib/*.js` 冻结、`tools/server.mjs` 与 bridge API 零改动（只把现有接线迁进新结构）、7 个 verify 脚本不改一字（它们钉的是 web/lib 行为与文件契约，是本轮的回归护栏）。本地跑法：`node tools/server.mjs`（或任意静态服务器于仓库根）→ 开 `/web/`。

## 3. 现状自查（开工先跑，不符即停并报告）

```
git log --oneline -1                  # 预期：本卡 §1 基点 prep
node --test tools/*.test.mjs          # 预期：tests 142, pass 142, fail 0
node web/verify-1.1.mjs               # 全 OK
node web/verify-4.1.mjs               # 全 OK
node web/verify-4.2.mjs               # 全 OK
node web/verify-5.2.mjs               # 全 OK
node web/verify-static.mjs            # 全 OK
node web/verify-real-import.mjs       # 全 OK
node web/verify-bridge.mjs            # 全 OK（14 项）
```

## 4. 信息架构（四区，单页内导航锚点或 tab，默认落在①）

```
┌ 顶栏: PixeCreator 像素工坊 · 导航[资产库|导入|导出|Prompt] · (桥状态灯) ┐
│ ① 资产库（默认）                                                      │
│   [7 资产卡片网格]  每卡: idle 动画预览 + 名称 + kind 徽章             │
│   点选 → 详情: 矩阵播放器(td/sd 切换 + ▶/⏸/⏭) + 元数据(size/palette/clips) │
│ ② 导入工作流                                                          │
│   选目标资产 → 上传 PNG(<input file>) 或填 prototypes 路径            │
│   → compare 左右预览(分隔可拖) → 预览将写文件 → 确认落槽(bridge 两段写) │
│ ③ 导出中心                                                            │
│   [导出拼表][导出 .tres][校验] + 友好进度 + 产物链接(sheets/ godot/)   │
│ ④ Prompt 工作台                                                      │
│   10 字段表单(改皮) → 英文 prompt 输出(可复制) + 固定 negative         │
└ 开发者面板(<details> 默认折叠): masters 槽位│shell 状态│bridge 原始日志 │
  │术语表(td/sd,clips,Full/Maker,fixtures,seed)│verify 命令清单          ┘
```

去重硬指标：`Export sheets` 类入口全页仅 1 处（③内）；资产选择器主入口仅 1 处（①内；②的目标资产选择是流程内步骤，不算重复）。

## 5. 像素主题 token 表（styles.css `:root`，色值全部取自 palettes/*.v1.json 实际色值，可微调明度 ±10% 但不得引入色板外新色相）

| token | 值 | 来源 |
|---|---|---|
| `--px-bg` | `#3A2A1A` | character/hair（页面底） |
| `--px-surface` | `#5A3A22` | scenery/earth-dark（卡片面） |
| `--px-surface-2` | `#442A14` | prop/wood-dark（嵌套面/代码块） |
| `--px-border` | `#FFD9B3` | character/skin-1（硬边框 2px） |
| `--px-text` | `#FFD9B3` | character/skin-1 |
| `--px-text-dim` | `#C07A4E` | character/skin-3（次要文案） |
| `--px-accent` | `#C03028` | character/tunic-red（主按钮/选中态） |
| `--px-accent-2` | `#6AC8E8` | scenery/water-light（链接/次强调） |
| `--px-ok` | `#7AC74F` | scenery/grass-light（成功/绿灯） |

规则：全部像素图 `image-rendering: pixelated`；硬边框（无圆角或仅 0/2px 直角）、无阴影或纯色偏移阴影（`box-shadow: 4px 4px 0 var(--px-surface-2)` 式）；像素网格背景用 repeating linear-gradient 实现（不引图片）；字体 `ui-monospace, "Cascadia Mono", Consolas, monospace`（不引字体文件）；按钮 hover = 边框换色（无渐变无过渡动画 >100ms）。

## 6. 任务与验收

- [ ] **B1 — 四区 IA 重写。** `index.html` 重写为 §4 结构（导航 + 四区 + 开发者面板），`app.js` 对应重排（现有能力全部保留：矩阵/compare/表单/bridge 接线迁移，不砍功能）。验收：四区在场且默认落①；导出入口与主资产选择器各仅 1 处；用户可见标题/提示语 grep 不到 `1.1|4.1|M2|5.2|shell|kind-aware|frozen|master槽` 等内部词（术语只允许出现在开发者面板内）。
- [ ] **B2 — 像素主题。** §5 token 表落地；验收：styles.css 的颜色字面量 100% 可映射到 token 或色板值（报告附对照）；像素图全部 pixelated；零外部资源引用（grep 无 `url(` 指向文件、无 `@import`、无 `<link>` 新增）。
- [ ] **B3 — 开发者面板。** `<details>`（默认 collapsed）收纳：masters 槽位、shell 校验状态、bridge 原始 job 日志、术语表 ≥6 条、verify 命令清单。验收：`<details open>` 缺省不存在；面板内容在折叠态不占布局高度。
- [ ] **B4 — 交互增强。** compare 分隔拖动（纯 CSS/原生 JS，无依赖）；128/64 资产卡片视觉等高对齐（缩放归一）；矩阵 ▶/⏸/⏭ 控制（用既有 `tickPlayer`，不改 `web/lib`）。验收：三个能力在无桥模式（纯静态服务）下可用/优雅降级。
- [ ] **B5 — 回归 + 提交。** §7 DoD 全绿后单 commit，消息含 `shell-v2`（例：`feat(present): web shell v2 four-zone ia plus pixel theme (B1-B5)`——这是合并 gate 判词）。

## 7. DoD（全绿，输出逐行粘进报告）

```
node --test tools/*.test.mjs            # 142/142
node web/verify-1.1.mjs                 # 全 OK
node web/verify-4.1.mjs
node web/verify-4.2.mjs
node web/verify-5.2.mjs
node web/verify-static.mjs
node web/verify-real-import.mjs
node web/verify-bridge.mjs
git diff --stat -- web/verify-1.1.mjs web/verify-4.1.mjs web/verify-4.2.mjs web/verify-5.2.mjs web/verify-static.mjs web/verify-real-import.mjs web/verify-bridge.mjs   # 空（一字未改）
git diff --stat -- web/lib/ tools/server.mjs assets/     # 空（红线零触碰）
```

外加 agent 自证（起 `node tools/server.mjs` 后 fetch 断言，贴关键行）：页面含四区容器与导航、开发者面板默认收起、`grep` 用户可见标题无内部编号、导出按钮全页唯一、7 资产卡片齐、样式表颜色字面量与 token 对照计数。报告写"agent 自证"，不写"人工已看"。

## 8. 拥有 / 禁改

- 可写：`web/index.html`、`web/app.js`、`web/styles.css`（仅此三文件）。
- 禁碰：`web/lib/**`（冻结；如新交互确需 lib 新能力，停下经用户报主控，不得擅改）、`web/verify-*.mjs` 全部、`tools/**`（含 server.mjs）、`assets/**`、`palettes/**`、`fixtures/**`、`sheets/**`、`godot/**`、`openspec/**`、`package.json`。

## 9. 守则

只读核查在外；实验仓库外临时目录；不提交临时文件；不联网；Git Bash；node 内正斜杠；浏览器代码零依赖（`web/` 下不得出现 `node:` 导入与 npm 包引用）；值断言优先；无构建步骤（交付即三个源文件，浏览器直跑）。

## 10. 完成报告格式

```
基点：prep <sha>（与 §1 一致确认）
分支/sha：feat/web-shell-v2 @ <sha>（含 shell-v2 字样确认）
B1：四区结构行号；去重证据（导出/选择器计数）；术语清理 grep 结果
B2：token 对照表（css 字面量 ↔ token ↔ 色板来源）；资源引用零证明
B3：面板内容清单与默认折叠证明
B4：三交互的无桥降级行为说明
DoD：逐条输出粘贴（142/142；7× verify OK；三个 git diff --stat 空）
agent 自证：server 下 DOM 断言关键行
偏离/遗留：无则写"无"
```
