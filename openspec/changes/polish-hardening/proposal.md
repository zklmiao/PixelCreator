# Proposal — polish-hardening

## Why

三路深读 + 用户人工使用（轮 5 后）确认了一批"用起来别扭"与"演进会撞"的问题：UI 层——校验失败看起来像成功（B1）、"生成此格"重生成整个资产（B2）、本地原型对比永远 dead（B3）、对比图右半看不见（A1）、导出中心空洞（A3）、术语化标题（A4）、确认条孤儿化（B5）；工程层——kind/tier 常量在 ~10 处重复声明（D1，加新资产种类 = 六文件修改，漏一处即校验/生成行为分裂）、verify-bridge 的单次确认断言被 `||202` 打穿、done/error 作业与事件日志永不清理、preview→confirm 间隙 TOCTOU 不进备份（D3）。用户拍板：全部纳入轮 8，质量优先。

## What Changes

- **wt-B 呈现轴**（`feat/ui-polish`，web 三文件内）：
  A1 compare 右半棋盘格衬底（透明像素可视化）；A2 资产网格"+ 新建资产"占位卡（跳 Prompt 工作台，M5 向导钩子）；A3 导出中心内容化（校验结果内嵌 + 导出预览 willWrite 清单 + 产物摘要行）；A4 矩阵标题去内部化（方向箭头 + 中文动作名，内部名进 hover）；A5 细节包（compare 分隔把手、卡片 hover、128 网格比例适配）；B1 校验结果可见化（与 A3 同一结果区）；B2 按钮发 clip 参数（配合 wt-A 的 clip-scoped 端点，合并后"生成此格"名副其实）；B4 Prompt 表单 kind 选择（character 10 字段 / 静态 object-colors-vibe 切换，prompt 引擎已支持）；B5 确认条按 jobId 并存（列表式确认/放弃，不再孤儿化）+ SSE error 与作业失败分流。
- **wt-A 管线轴**（`feat/hardening`，tools 内）：
  D1 `tools/kinds.mjs` 单一来源（STATIC_KINDS/ALL_KINDS/尺寸分档/ALPHA_THRESHOLD/frameNumFromFile），六处消费方重接线，**行为字节不变**（回归铁证：全量测试计数不变 + 资产/表重生成字节一致；web/lib 冻结镜像不动，加 mirror 注释）；D3 server.mjs 三修——sweepExpired 覆盖 done/error（TTL 到期清理）、TOCTOU 修复（exec 时点按存在性重查备份，不再只用 preview 快照）、verify-bridge `||202` 改严格 409+code；B2 generate 端点 clip 参数（`{assetId, clip}` → preview/willWrite 恰为该 clip 文件集）；B3 `STATIC_PREFIXES` += `/prototypes/`（用户自备图工作区，gitignored 内容经本机回环可达）。
- 规格修订：web-bridge MODIFIED（服务清单 += /prototypes/）+ ADDED（clip-scoped regeneration）+ MODIFIED（TOCTOU 备份时点收紧为 exec 时重查）。

## 核心原则

双轴并行零交集（wt-A: tools/**+verify-bridge；wt-B: web/index.html+app.js+styles.css+docs）；7 个 verify 不改一字全绿是两轴共同的回归护栏；零依赖零构建零联网不破。

## Non-Goals

- 不动 `web/lib/**`（D1 不收敛 web/lib 镜像副本，加 mirror 注释即可）；不新增依赖；不做页内资产向导（M5）；不动色板与既有资产；不改 bridge 两段写协议语义。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `web-bridge`：服务清单 += `/prototypes/`；generate 支持 clip 参数；TOCTOU 备份时点收紧。

## Impact

- wt-A：`tools/kinds.mjs`（新）+ 六消费方重接线 + `tools/server.mjs`（sweep/TOCTOU/clip 参数/prototypes 前缀）+ `web/verify-bridge.mjs`（断言强化）+ 各 tests。
- wt-B：`web/index.html`/`app.js`/`styles.css` + docs（若有新指引）。
- 规格修订随归档 CLI 同步主 spec。
