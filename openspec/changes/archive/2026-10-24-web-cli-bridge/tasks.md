# Tasks — web-cli-bridge

## 1. 管线小重构（同函数直调）

- [x] 1.1 导出 `vectorize.mjs` 生成函数并保持 CLI 字节一致，验证 `node --test tools/vectorize.test.mjs` 全绿且仓库外重跑 `generate --asset knight_001` 字节一致
- [x] 1.2 新增 `import-prototype.mjs runImportBuffer` 并让 `runImport(path)` 改调它，验证 `node --test tools/import-prototype.test.mjs` 全绿且 buffer/路径双入口输出字节一致

## 2. 桥服务器骨架（静态+安全）

- [x] 2.1 实现 `tools/server.mjs` 同源静态服（`/web/ /assets/* /sheets/* /palettes/* /fixtures/* /godot/*`，loopback 绑定，`--port`，占用报错退出），验证浏览器打开 `/web/` 矩阵与 `npx serve` 下一致
- [x] 2.2 实现 allowlist（7 资产 id + 固定 outDir，无 `../` 穿透）与 `{ ok:false, code, message }` 错误码，验证非法 asset/路径Traversal 返回 typed error 且零写盘

## 3. 无上传能力先行（validate/tres/sheet/generate）

- [x] 3.1 接 `POST /api/validate` 聚合校验，验证与 `asset-manifest validate --check-files` 同结果
- [x] 3.2 接 `POST /api/tres/export`（调 `exportTres`），验证与 CLI 输出 `.tres` 文本一致
- [x] 3.3 接 `POST /api/sheet/export`（调 `exportSheets`），验证人物/静态与 CLI PNG+map.json 字节一致
- [x] 3.4 接 `POST /api/generate`（调 1.1 导出的生成函数），验证与 CLI `generate` 视图 SVG 字节一致

## 4. 上传进口（import）

- [x] 4.1 实现最小 multipart 解析（单文件+字段，5MB 上限+PNG 魔数校验），验证畸形包/超限/非 PNG 被 400 拒绝且零写盘
- [x] 4.2 接 `POST /api/import` 干跑（内存真算出 `willWrite/willBackup/bytesDelta`），验证与 CLI `--src` 落盘字节一致且 `--check-files` 绿

## 5. 进度流与两段写

- [x] 5.1 实现串行队列（FIFO，一次一 job，`202 queued`/上限 5 的 `429`），验证并发两导出串行执行且结果正确
- [x] 5.2 实现 `GET /api/jobs/:id/events` SSE（`start/progress/log/done/error`），验证长导出收到逐文件 progress 并以 done 收尾
- [x] 5.3 实现 `POST /api/jobs/:id/confirm`（token 一次性/10min 过期，真写前 copy 到 `.backup/<asset>/<ts>/` 留 5 份），验证覆盖前备份齐全、同输入二次确认零变更

## 6. Web 接线与验收

- [x] 6.1 接线死按钮（Export→sheet、Generate→generate/import `--dir`、对比区文件选择、新增 Validate 区+log/错误条+写完刷新矩阵），验证本地桥下 5 功能全程点按可用
- [x] 6.2 新增 `web/verify-bridge.mjs`（路由/白名单/SSE/确认备份/字节一致回归）并更新 README 启动说明，验证 `node web/verify-bridge.mjs` 全绿且 7 旧 verify 无退化
