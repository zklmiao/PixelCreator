# Design — web-cli-bridge

## Context

见 `proposal.md` Why。现状：`web/app.js` 只有 `fetch asset.json + buildPrompt + buildMatrix + canExport` 置灰（`Export/Generate` 按钮无监听），`tools/*.mjs` 写盘靠 `node:fs + pngjs`。核心量化/映射/矢量化已是零依赖纯 ESM（web 可 import），缺的只是 fs+编解码+HTTP 桥。

## Goals / Non-Goals

**Goals:**

- 单进程 `node tools/server.mjs --port 3000` 同源服静态 + 5 个 API，同函数直调、字节一致。
- SSE 长任务进度 + 两段写（preview→confirm）+ `.backup/` 自动备份。
- 前端加法接线，不动 `index.html` 结构。

**Non-Goals:**

- 新资产创建、`--map` 批量导入首版、M4 联网模型、鉴权/多用户、自动跳端口。

## Decisions

1. **只用 `node:http`，不引 express/新依赖**：路由 5 POST + 1 SSE GET + 1 confirm POST + 静态服，手写约 300 行。备选 express 被否：违"唯一依赖 pngjs"铁律，得不偿失。
2. **multipart 手写最小解析器（单文件+字段）**：只支持 `file + assetId + dir`，超限（>5MB/非 PNG 魔数）直接 400。备选引 `busboy` 被否，同上。
3. **同函数直调，两个小重构**：`vectorize.mjs` export `generateKnightSvgs/generateStaticSvgs`（CLI 原样调它）；`import-prototype.mjs` 新增 `runImportBuffer(buffer, …)` 复用 `quantizeAndMap+svgForSlot+buildCompare`，`runImport(path)` 改调它。`exportSheets/exportTres/validateAsset` 已导出不动。
4. **干跑是真算**：preview 在内存跑完管线、算出 `willWrite[] + 哈希比对 + bytesDelta`，只是不落盘。备选"只列文件名"被否：确认信息会是假的。
5. **串行队列 + 前端 disabled**：内存 FIFO，一次一 job；`POST` 繁忙时 `202 queued` 带位置，或 `429 queue-full`（上限 5）。不用文件锁。
6. **备份 `.backup/<assetId>/<ts>/`，gitignore，留 5 份**：confirm 前先 copy 受影响文件；preview/confirm token 内存 Map，一次性、10min 过期。
7. **SSE 事件 `start/progress/log/done/error`**：复用 CLI 的 `console.log OK:` 行做 log 事件；短任务（validate/tres/单表）直接 200，不走 SSE。

路由表：

```
GET  /web/ /assets/* /sheets/* /palettes/* /fixtures/* /godot/*
POST /api/validate { assetId }                    -> 200 { ok, errors, missing }
POST /api/generate { assetId }                    -> 202 { jobId, preview }
POST /api/import   multipart                      -> 202 { jobId, preview }
POST /api/sheet/export { assetId }                -> 202 { jobId, preview }
POST /api/tres/export  { assetId }                -> 200/202 { ok|jobId, preview }
GET  /api/jobs/:id/events                          SSE
POST /api/jobs/:id/confirm { confirm:true }      -> 200 { backedUp, wrote }
```

## Risks / Trade-offs

- [手写 multipart bug] → 只支持单文件+小字段，魔数+大小双检，`verify-bridge.mjs` 含畸形包回归。
- [干跑与真写分叉] → preview 与 commit 调同一纯函数，commit 只加"落盘"一步；`roundtrip + sheet.test + 7 verify + 仓库外重跑比对` 全绿才合。
- [并发覆盖] → 串行队列 + token 一次性 + 前端进行中禁用。
- [备份膨胀] → 只留 5 份，超删最老；`.backup/` 永不进 `--check-files`。
- [端口占用] → 占用即报错退出，不自动跳（免书签乱）。
