# Proposal — web-cli-bridge

## Why

`web/` 纯静态只读（死的 Export/Generate 按钮），`tools/*.mjs` 全在终端跑。用户要在界面点按钮完成导入→生成→拼表→进引擎闭环，不再终端/界面两头跳。本 change 用一条本地桥命令同时服静态与写盘 API，把 5 个 CLI 能力搬进 Web。

## What Changes

- 新增 `tools/server.mjs`（`node:http` 内置，不引新依赖）：同源服 `GET /web/ /assets/* /sheets/* /palettes/* /fixtures/* /godot/*`，`POST /api/*` 直调既有工具函数（同函数不分叉，保证字节一致）。
- 5 个写/读能力进 Web：`validate` 聚合校验、`vectorize generate`、`import-prototype`（单槽 `--src`，二期再考虑 `--map` 批量）、`sheet export`、`tres export`。
- 进度流：长任务 `202 + jobId`，`GET /api/jobs/:id/events` SSE 推 `start/progress/log/done/error`；短任务直接等响应。服务端单队列串行，job 进行中前端按钮 disabled。
- 两段写：`POST /api/*` 先干跑返回 `preview { willWrite[], willBackup, bytesDelta }` + `jobId`；前端二次确认框后 `POST /api/jobs/:id/confirm` 才真写。真写前 copy 受影响文件到 `.backup/<assetId>/<timestamp>/`（gitignore，只留最近 5 份）。确认 token 一次性、10 分钟过期；同输入二次确认零变更。
- 前端接线（加法）：`Export sheets` 接 sheet 导出、`Generate` 缺格按钮接 generate/import `--dir`、对比区加 `<input type=file>`、新增 Validate 区 + log/错误条 + 写完 `reloadMatrixFor()`。`index.html` 结构不动。

## Capabilities

### New Capabilities

- `web-bridge`: 本地桥服务器契约（同源静态、路由表、串行队列、SSE 事件、两段写+备份、错误码、安全白名单）。

### Modified Capabilities

- `prototype-import`: 新增 server 进口（multipart 单文件 → 内存 buffer 复用既有量化/映射/矢量化逻辑，`td=sd` 占位语义不变）。
- `spritesheet-export`: 新增 server 导出（调同一 `exportSheets`，Full/Maker/静态单帧语义不变）。
- `godot-adapter`: 新增 server tres 导出（调同一 `exportTres`，Full-only 语义不变）。

## Impact

- 新增：`tools/server.mjs`、`web` 接线（`app.js` + 小量 `index.html`）、`.backup/`（gitignore）、`web/verify-bridge.mjs`。
- 复用：`tools/{asset-manifest,vectorize,sheet,tres,import-prototype}.mjs` 导出函数；`web/lib/*` 零依赖核心不动。
- 小重构：`vectorize.mjs` 导出 `generateKnightSvgs/generateStaticSvgs`（CLI 原样调它）；`import-prototype.mjs` 新增 `runImportBuffer`（复用 `quantizeAndMap+svgForSlot+buildCompare`）。
- 约束：离线可跑、无 key 不变；`assets/*/asset.json` 唯一事实源不变；字节级确定由 `roundtrip + sheet.test + 7 verify + 仓库外重跑比对` 守住。新资产创建明确不做（冻结 7 骨架）。

## Non-goals

- 新资产创建流（第 8 资产）、`--map` 批量导入首版不做（二期）、M4 img2img 实调用网模型不做。
