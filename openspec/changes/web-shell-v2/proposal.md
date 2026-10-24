# Proposal — web-shell-v2

## Why

用户人工验收后反馈"页面信息乱"。评审方对 `web/index.html` 的诊断（已实锤）：① 5 个 section 按轮次任务编号组织（1.1/4.1/M2/5.2/bridge）而非按用户任务；② 内部术语泄漏到标题文案（dual-master slots / frozen contract / kind-aware）；③ 重复入口（Export sheets ×2、资产选择器 ×2）；④ 无导航无层级，开发者调试信息（masters 路径、shell 状态、bridge 日志）占据黄金位置。用户已拍板：视觉 = 像素复古风；开发者细节 = 折叠进默认收起的开发者面板。

## What Changes

- 信息架构按用户任务重组四区（替代现有 5 section 平铺）：
  **① 资产库**（默认区：7 资产卡片网格，卡片自带 idle 播放预览；点选进入详情 = 矩阵播放器 + td/sd 切换 + 播放/暂停/步进 + 资产元数据）；
  **② 导入工作流**（目标资产选择 → 上传 PNG/引用 prototypes 路径 → compare 左右预览 → bridge 两段写确认落槽）；
  **③ 导出中心**（sheets / tres / validate 聚合，进度反馈友好化，产物链接直指 `sheets/`、`godot/`）；
  **④ Prompt 工作台**（现 4.1 表单收编改皮，服务"生成新原型指令"，输出可复制）。
- 像素复古主题：零依赖纯 CSS——`image-rendering: pixelated`、硬边框、像素网格背景、系统 monospace 字体栈（不引字体文件不联网）；配色 token 全部取自 `palettes/*.v1.json` 实际色值（见任务卡 token 表）。CSS grid 布局，不引框架不建构建链。
- 开发者面板：`<details>` 默认折叠，收纳 masters 槽位、shell 状态、bridge 原始 job 日志、术语表（td/sd、clips、Full/Maker、fixtures 等）、verify 命令清单。
- 交互增强：矩阵播放/暂停/单步；compare 图分隔拖动；128/64 资产同屏缩放对齐（视觉等高卡片）。
- 用户可见文案去术语化：标题与提示语面向任务（如"导出拼表"），内部编号与契约词汇只出现在开发者面板。

## Non-Goals

- 不改任何管线行为：`web/lib/*.js` 冻结、`tools/server.mjs` 零改动（bridge API 协议不动，只重接前端）、`assets/**`/`tools/**`（除 server 接线外）不碰。
- 不新增依赖、不建构建链、不引字体/图片资源文件（像素网格背景用 CSS 渐变实现）。
- 无 spec delta：UI 不在 9 个 frozen specs 语义内；验收 = 7 个 verify 脚本不改一字全绿 + 用户人工清单。

## Capabilities

### New Capabilities

- 无（纯呈现层重设计，不新增 spec 文件）。

### Modified Capabilities

- 无。

## Impact

- 改动：`web/index.html`（结构重写为四区 + 导航 + 开发者面板）、`web/app.js`（区渲染与交互重排，bridge 接线迁移）、`web/styles.css`（像素主题 token 化重写）。三者均为呈现层独占文件。
- 验收护栏：`web/verify-{1.1,4.1,4.2,5.2,static,real-import,bridge}.mjs` 七脚本不改一字全绿（钉的是 web/lib 行为与文件契约，与本轮零交集）；`node --test tools/*.test.mjs` 142/142。
- 簿记并入：web-cli-bridge change（`67f47e1` 已落主干）随本轮收官一起 sync/archive。
