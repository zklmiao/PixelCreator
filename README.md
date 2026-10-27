# PixeCreator

像素游戏资产管线 + 本地创作台：把原型图或程序合成稿变成可校验、可拼表、可直接进 Godot 的像素资产。全链路本地运行，同输入字节级可复现；测试与验收脚本不联网。

当前状态：M0–M4 里程碑全部归档（含真实角色 `guardian_001`、img2img provider 层），主干 182 个测试 + 7 个 web 验收 + Godot 配方自检全绿。里程碑见 [`docs/milestones.md`](docs/milestones.md)，轮次记录见 [`docs/agent-log.md`](docs/agent-log.md)。

## 能做什么

- **7 个资产**：2 个角色（`knight_001` 程序合成样例、`guardian_001` 真实导入）+ 5 个静态类（sword / house / crate / tree / potion）。
- **三条输入路径**：程序合成（synth）、手动导入（PNG/JPEG/WebP，页内框选或 `prototypes/<id>/input.png`）、可选 img2img provider（Gemini / OpenAI 兼容 / SD-WebUI；不配置也能全流程跑）。
- **产物**：视图 SVG + 双母版、一动作一拼表（PNG + `map.json`，Full/Maker 双模式）、Godot 4 `SpriteFrames`（`.tres`）、量化前后对比图。
- **Web 创作台**：四区（资产库 / 导入 / 导出 / Prompt 工作台），矩阵播放、td/sd 切换、对比滑块、两段写（预览 → 确认 → 备份）。
- **本地桥**：loopback-only HTTP 服务，静态资源 + 写操作 API + SSE 进度；页面永不接触 provider 密钥。

## 快速开始

要求 Node 20+（开发验证于 Node 24）。唯一运行依赖 `pngjs`；`tools/quantize|palette|asset-manifest|vectorize` 与 `web/lib/*` 保持零第三方依赖，可在浏览器直接 import。

```bash
npm ci
node tools/server.mjs --port 3000
# 打开 http://127.0.0.1:3000/web/
```

`node tools/server.mjs --port 3000` 同时提供 `/web/` 静态页与 `/api/*` 写操作，默认只监听 `127.0.0.1`。只读浏览也可以用任意静态服务器（如 `npx serve .`），但上传、生成、导出、AI 编排必须走 bridge。

## 目录

| 路径 | 说明 |
|---|---|
| `tools/*.mjs` | 管线与桥（量化/色板/矢量化/拼表/tres/导入/provider/bridge），`*.test.mjs` 为同目录测试 |
| `web/` | 零依赖前端（`app.js`、`lib/`、`styles.css`）与 7 个 `verify-*.mjs` 验收脚本 |
| `assets/<id>/asset.json` | 唯一事实源（骨架、clip 结构、hash、尺寸、种子）；视图 SVG 与母版由工具生成 |
| `palettes/*.v1.json` | 按 kind 固定的色板（character / weapon / building / prop / scenery） |
| `sheets/` | 生成物：30 张表（22 Full + 8 Maker）+ 30 份 `map.json` |
| `fixtures/` | 导入源与对比图（Icons 图标、guardian 帧、`guardian-map.json`、`*.compare.png`） |
| `godot/` | `knight_001` / `guardian_001` 的 `.tres`（各 24 动画，只用 Full 表） |
| `prototypes/` | 自备原型图工作区（gitignore） |
| `resources/`、`gemini_test/` | 原始素材与人工参考样张，不是运行时依赖 |
| `engine-placeholder/` | 引擎侧占位：`generic/` 直读 map.json + `godot-atlas/IMPORT-RECIPE.md` |
| `openspec/` | 冻结 specs、进行中 changes、归档 changes |
| `docs/` | 里程碑、轮次日志、导入/img2img/静态页/量化说明、优化 backlog、事故复盘 |

## 当前资产

| 资产 | kind | size | 结构 | 来源 / hash |
|---|---|---|---|---|
| `knight_001` | character | 64 | 24 动画 / 64 视图 + 2 母版 | synth 样例；`prompt_hash` 64 槽真值 |
| `guardian_001` | character | 64 | 24 动画 / 56 视图 + 2 母版（idle 1f / walk 3f / attack 3f） | 真实导入（amg1 fixtures）+ AI 中间帧槽；`prompt_hash` 全 null，`source_hash` 40 槽真值、16 个 AI mid 槽 null |
| `sword_001` | weapon | 64 | idle-only，8 视图 + 2 母版 | synth；`prompt_hash` 8 槽真值 |
| `house_001` | building | 128 | idle-only，8 视图 + 2 母版 | synth；128 档 |
| `crate_001` | prop | 64 | idle-only，8 视图 + 2 母版 | synth |
| `tree_001` | scenery | 128 | idle-only，8 视图 + 2 母版 | synth；128 档 |
| `potion_001` | prop | 64 | idle-only，8 视图 + 2 母版 | 用户导入 `I_Bottle03`；`source_hash` 8 槽真值 |

> `guardian_001` 的 td/mid 目前是**离线水平镜像占位**（正立、与 sd 可区分，`guardian-map.json` 中 `tdProvenance.mode = "offline-standin-mirror"`），不是真实顶视美术；配置 provider 后执行“派生俯视角（td 真源）”即自动换代。

## 管线

```text
asset.json（唯一事实源）
  → synth / import / img2img（源进入 fixtures 或 clip 槽）
  → quantizeGeometry（长边 fit 到 32/48/64/128，alpha<128 丢弃，居中 pad 正方形）
  → mapFrameToPalette（默认 OKLCH 最近色；ordered-bayer 仅 scenery/building；error-diffusion 永拒）
  → pixelsToSvg（逐像素 rect + 语义层 body/limb-l/limb-r/outfit/weapon-slot）
  → buildSheet（一动作一表，行序 fr/bk/lf/rt，td/sd 永不合表，Full/Maker）
  → exportTres（只读 Full map，Godot 4 SpriteFrames）
```

**Hash 语义**：synth 槽记录 `prompt_hash`；导入/AI 槽 `prompt_hash = null`，非 AI 源记录 `source_hash`（map 源的 sha256 前 12 hex），AI 中间帧 `source_hash = null`。SVG 元数据会内嵌 asset.json 的 hash，因此必须先把 hash 定稿，再执行导入/重生成。

## 核心契约

- **命名**：`{asset}_{td|sd}_{idle|walk|attack}_{fr|bk|lf|rt}{帧号}.svg`，`asset-manifest.mjs` 强制。
- **时序**：fps idle 2 / walk 6 / attack 8；attack 不循环并接 `next: idle`。
- **确定性**：同输入字节级一致；生成物一律由工具再生成，禁止手改；测试与 verify 不联网。
- **AI 是导入源**：AI 产出先落 fixtures/槽位并提交，管线运行时对其字节确定；不把外部服务当运行时依赖。
- **最近邻**：前端 `imageSmoothingEnabled=false`，Godot 侧 `texture_filter=nearest`。
- **密钥边界**：provider 密钥只从环境变量读取；源码、示例、测试、页面都不含可用凭据，页面只看到 provider 名。
- **校验器**：character 必须 24 格完整；静态类 idle-only；尺寸按 kind 分档；`--check-files` 同时核对落盘。

## 自检（只读）

```bash
node --test tools/*.test.mjs                    # 全量单测（当前 182 个）
node web/verify-1.1.mjs                         # 以下 7 个 web 验收
node web/verify-4.1.mjs
node web/verify-4.2.mjs
node web/verify-5.2.mjs
node web/verify-static.mjs
node web/verify-real-import.mjs
node web/verify-bridge.mjs
node engine-placeholder/godot-atlas/verify-recipe.mjs

node tools/asset-manifest.mjs validate assets/guardian_001/asset.json --check-files
node tools/palette.mjs validate palettes/*.v1.json
node tools/quantize.mjs selfcheck 64
node tools/palette.mjs map-selfcheck palettes/palette_character.v1.json
```

## 生成（写产物）

```bash
node tools/vectorize.mjs generate --asset knight_001
node tools/sheet.mjs export --asset knight_001 --out sheets
node tools/tres.mjs export --asset knight_001
node tools/import-prototype.mjs --asset potion_001 --src prototypes/potion_001/input.png
node tools/backfill-hashes.mjs                  # knight prompt_hash 回填（幂等维护脚本）
```

生成物落盘后工作区应保持 `git status` 可解释；提交前建议把同一命令在仓库外临时目录重跑并做字节比对。

## 本地桥与 Web 创作台

```bash
node tools/server.mjs --port 3000     # 默认 3000；可 --host 覆盖绑定位
```

- 静态资源白名单：`/web/` `/assets/` `/sheets/` `/palettes/` `/fixtures/` `/godot/` `/tools/` `/prototypes/`。
- 写操作统一两段式：`POST /api/...` 先返回 `jobId + preview`（零落盘），`POST /api/jobs/:id/confirm` 才备份到 `.backup/` 并写入；进度走 `GET /api/jobs/:id/events`（SSE）。
- 作业串行、TTL 10 分钟、上限 100 个；确认令牌过期返回 410。

| 端点 | 用途 |
|---|---|
| `GET /api/health` | 存活探测 |
| `POST /api/validate` | 校验资产（含落盘文件） |
| `POST /api/generate` | 重生成 SVG（可带 clip 参数做单 clip 级） |
| `POST /api/sheet/export` | 导出拼表 |
| `POST /api/tres/export` | 导出 `.tres` |
| `POST /api/import` | 导入 PNG（浏览器把 JPEG/WebP 框选结果转成 PNG 后提交） |
| `GET /api/img2img/status` | 已配置 provider 名（不回显密钥/URL） |
| `POST /api/img2img/inbetween` | guardian walk/attack 补帧（2→3） |
| `POST /api/img2img/derive-td` | 派生 td 真源 |
| `POST /api/jobs/:id/confirm` | 确认写入（先备份） |
| `GET /api/jobs/:id/events` | SSE 进度 |

## 可选：img2img provider

只从环境变量读取；未配置时页面编排按钮显式报错，手动导入路径始终可用。

| 变量 | 说明 |
|---|---|
| `PIXE_IMG_PROVIDER` | `gemini` \| `openai` \| `sd-webui`（只设 key 不算已配置） |
| `PIXE_IMG_KEY` | 云端 provider 密钥（gemini/openai） |
| `PIXE_OPENAI_BASE` / `PIXE_OPENAI_EXTRA` | OpenAI 兼容端点的可选覆盖（base / 额外 JSON） |
| `PIXE_SD_URL` | 本地 SD-WebUI 服务地址（无 key） |

细节与能力边界（denoise/seed 退化、离线回落、AI 帧采纳原则）见 [`docs/img2img.md`](docs/img2img.md)。

## 文档

- [里程碑与下一步](docs/milestones.md) · [轮次开发日志](docs/agent-log.md) · [优化 backlog](docs/optimization-backlog.md)
- [真实素材导入](docs/real-import.md) · [img2img 实调](docs/img2img.md) · [静态资产 web 支持](docs/static-web.md) · [量化对比](docs/quantize-compare.md)
- [引擎占位与 Godot 导入配方](engine-placeholder/godot-atlas/IMPORT-RECIPE.md) · [启动阻塞事故复盘](docs/launch-blocker-postmortem.md)

## 变更流程

1. 在 `openspec/changes/<name>/` 写 `proposal.md` / `design.md` / `tasks.md` / 受影响的 spec delta。
2. 实现 + 全量自检绿；生成物在仓库外临时目录重跑并字节比对。
3. `--no-ff` 合并；提交格式 `type(scope): summary (task-id)`；归档后 specs 由 CLI 同步。

## 下一步

- 人工验收：Godot 4 载入 `godot/*.spriteframes.tres`（连 `sheets/` 一起拷）；真实 provider 环境下的 AI 补帧 / td 派生。
- M5 已立项（文生像素素材，提案见 `openspec/changes/text-to-asset|text-to-character`）：txt2img 三适配 + 动态资产注册 + 页内向导（静态 8 视图 / 角色 56 视图四阶段门）。
- 其后候选（见 backlog）：Zhipu/CogView 原生适配器（C2）、GIF 导出、`vectorize` 拆分。
