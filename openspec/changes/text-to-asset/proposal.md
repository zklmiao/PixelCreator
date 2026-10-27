# Proposal — text-to-asset

## Why

资产库是封闭集合：7 个 id 冻结在 `web/lib/asset-shell.js` 与 server `assertAssetId` 双处硬编码，新增资产只能走"prep 冻结骨架 → 主控手工备料 → CLI 导入"的主控专属流程；页面上唯一的新建入口是轮 8 埋的"+ 新建资产"占位卡，点击只提示向导在 M5 规划中。同时 provider 层只有 `editImage`（图生图），"描述一句 → 得到一个像素资产"缺第一环。M5a（grilling Q1–Q10 拍板）一次闭合：文生静态资产 + 动态注册 + 页内向导。

## What Changes

- **txt2img 适配**（wt-A）：`tools/img2img-providers.mjs` 新增 `generateImage({prompt, negative, size, seed}) → {buffer, meta}`，与 `editImage` 共用 provider 注册表、env 配置（`PIXE_IMG_PROVIDER`/`PIXE_IMG_KEY`/`PIXE_OPENAI_BASE`/`PIXE_OPENAI_EXTRA`/`PIXE_SD_URL`）与错误契约。SD-WebUI `/sdapi/v1/txt2img`（原生 seed/size，首个真实验收路径）、Gemini（text-only contents + IMAGE modality）、OpenAI 兼容 `/images/generations`（b64）。无 denoise/tier 语义（无输入图）；seed 不支持则 meta 如实记录。单测 mock fetch，永不联网。
- **动态资产注册**（wt-A）：server 资产 allowlist 从冻结 7 改为扫描 `assets/*/asset.json` 且 `validateAsset` 通过（写作业 confirm 后失效重扫）；`GET /api/assets` 返回 id/kind/size 列表（只读、无密钥）；`UNKNOWN_ASSET` 错误契约不变。web 资产壳启动时拉注册表，无桥回退冻结 7；`verify-static`/`verify-real-import` 断言从"恰好 7"改为"必须包含冻结 7"。
- **资产创建管线**（wt-A）：`tools/asset-create.mjs`——输入 gen manifest（8 张源图 + prompt/seed 元数据），原子产出静态资产全套：`asset.json` 骨架 + 8 视图 SVG + 2 母版（fr 内容 + master 标记）+ 8 源图入 `fixtures/<id>/` + `<id>-gen.json` + 2 张单帧表 + 2 份 map.json。只新增目录；目标 id 已存在即拒（`ID_EXISTS`）。fixtures+manifest 重跑字节一致（确定性回归）。
- **桥端点**（wt-A）：`POST /api/txt2img`（草稿生成作业：预览零落盘 → 确认落 `prototypes/<id>/gen/{persp}_{dir}.png`，gitignored）+ `POST /api/asset/create`（原子创建作业：预览 willWrite 清单 → 确认 → 写入）。
- **页内向导**（wt-B）：资产库"+ 新建资产"卡 → 向导：表单（id、kind、size 档按 kind 过滤、object、colors、vibe、seed、自由文本补充）→ `buildPrompt` 预览（prompt_hash 同步展示）→ 8 格进度墙（逐格生成/量化前后对比/单格重试/确认）→ "创建资产"总确认（一个作业、原子）。无桥或无 provider 时显式禁用并说明。
- **溯源语义**（wt-A）：新建 slot `prompt_hash`（djb2，与 synth 同源）与 `source_hash`（sha12 源图，与导入同源）**都记真值**；`<id>-gen.json` 记 prompt/negative/seed/provider/model/请求尺寸/重试次数/时间戳（契约 prep 冻结，见 design）。

## 核心设计原则

**AI 是导入源，不是运行时依赖**：生成结果确认即提交（草稿区 → fixtures），创建管线对已提交输入字节确定；测试与 verify 永不联网；无桥/无 provider 全降级显式化（手动导入路径不变）。**库里没有半成品资产**：资产列表只收 validate 通过的完整资产，创建是单作业原子写。

## Non-Goals

- 角色资产（→ 后续 change `text-to-character`，本 change 的 generateImage/动态注册是其前置）。
- 不改 `asset.schema.json`（现有字段已容纳静态新资产）；不改色板/量化/矢量化语义；knight 等存量资产零触碰。
- 不做 Zhipu 原生适配（backlog C2 单列）；仓库不落任何真实 AI 生成的资产（真实验收 = 用户 SD-WebUI 现场跑）。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `prototype-prompt`：适配层补 txt2img（文生）入口，与 img2img 同一 env/回落语义。
- `prototype-import`：新增"从 gen manifest 原子创建静态资产"的创建段。
- `web-bridge`：动态注册表 + txt2img 草稿端点 + 原子创建端点。

## Impact

- 改动：`tools/img2img-providers.mjs`（generateImage）+ `tools/asset-create.mjs`（新）+ `tools/server.mjs`（注册表扫描 + 3 端点）+ `web/lib/asset-shell.js`（注册表拉取 + 回退）+ `web/app.js`/`index.html`/`styles.css`（向导）+ `web/verify-static|real-import|bridge.mjs`（语义更新/扩展）+ `tools/asset-create.test.mjs`（新）+ docs。
