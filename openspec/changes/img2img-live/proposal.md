# Proposal — img2img-live

## Why

核心价值链"AI 生图 → 像素资产"至今有三处人工断点（用户 grilling 拍板，2026-10-25）：①生图在 Gemini 网页手工做，管线只有预留位；②JPEG/大图必须出仓裁切转 PNG；③guardian walk/attack 每方向仅 2 帧（源素材极限），观感是两帧闪烁；td 视角是 sd 的字节复制占位。M4 用三层 img2img 实调一次性闭合这四件事。

## What Changes

- **三层提供商适配**（wt-A）：`tools/img2img-providers.mjs` 统一接口 `editImage({image, prompt, negative, tier, seed, size}) → PNG buffer`——Gemini（主）/ OpenAI 兼容（`base_url` 可配，通吃智谱/通义/OpenAI 等）/ 本地 SD-WebUI（`/sdapi/v1/img2img`，离线兜底）。key 全走环境变量（`PIXE_IMG_PROVIDER`、`PIXE_IMG_KEY`、`PIXE_OPENAI_BASE`），仓库零密钥；无配置时全部回落到 spec 冻结的手动导入流。调用只发生在桥服务端（页面永不接触 key）。
- **桥端点扩展**（wt-A）：`GET /api/img2img/status`（报各 provider 已配/未配，不回显密钥）、`POST /api/img2img/inbetween`（guardian 补帧）、`POST /api/img2img/derive-td`（td 派生）——两段写语义照旧（预览 → 确认 → 备份落盘）。
- **guardian 补帧**（wt-A）：walk/attack 每方向 2→3 帧——AI 中间帧（帧继承 tier 0.25–0.35 首次实战）落 `fixtures/guardian/mid/*.png` 入库后走既有导入管线；asset.json 帧结构更新（主控 prep 授权）；`guardian-map.json` 复用宣言更新为 [f1, ai-mid, f2]。
- **td 真源替换**（wt-A）：sd 视图经方向派生 tier（0.5–0.6）生成 td 源图 → 量化落 32 个 td 槽 → **删除 td==sd 占位测试**（character-asset 占位条款预留的移除路径）。
- **JPEG + 页内框选**（wt-B）：浏览器 canvas 解码 JPEG/WebP（tools 保持 pngjs-only）→ 矩形框选单体 → 裁切结果转 PNG 送桥导入（管线自动方形 pad + 量化）——用户 4 张 Gemini 场景图从此直接进管线。
- **hash 语义定案**（wt-A，主控 prep 冻结 schema）：`prompt_hash` 仅用于 prompt 派生帧；导入/AI 帧新增可选 `source_hash`（源图 SHA256 前 12 位），`"pending"` 全部清除（potion/guardian 存量回填）。

## 核心设计原则

**AI 是导入源，不是运行时依赖**：所有 AI 输出一经采纳即提交为 fixtures/资产文件，管线对已提交输入保持字节级确定；测试与 verify 永不联网（适配器未配置即跳过并显式报告，无静默网络调用）。离线基线：无 key 时全部功能可用性不降级（手动导入路径 spec 冻结）。

## Non-Goals

- 不做页内资产向导（M5 候选）；不引新依赖（fetch 走 Node 18+ 内置）；ComfyUI 图协议缓（本地适配器取 SD-WebUI 单请求 API）；不动色板/静态资产。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `prototype-prompt`：预留位升级为真实适配层（三层 provider + 回落语义）。
- `web-bridge`：新增 img2img 端点组与密钥边界。
- `character-asset`：td 占位条款的 guardian 场景退役（真源已落；占位许可本身保留给未来无 td 源的导入角色）。

## Impact

- 改动：`tools/img2img-providers.mjs`（新）+ `tools/server.mjs`（端点）+ `tools/import-prototype.mjs`（mid/td 源导入路径）+ guardian asset.json/SVG/sheets/tres 全量再生成 + schema（`source_hash` 可选字段）+ `web/app.js/index.html`（框选 UI、provider 面板、补帧/派生按钮）+ fixtures + docs + verify。
