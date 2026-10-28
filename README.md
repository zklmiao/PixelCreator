<p align="center">
  <img src="docs/assets/readme/hero.gif" alt="PixeCreator — animated pixel-art banner" width="880" />
</p>

<h1 align="center">PixeCreator</h1>

<p align="center">
  <b>文本或原型图进，像素资产出。</b><br/>
  一条本地、确定性、可复现的像素游戏资产管线：量化 → 色板 → 矢量视图 → 拼表 → Godot 4。
</p>

<p align="center">
  <img alt="tests" src="https://img.shields.io/badge/tests-182_passing-2ea44f?style=flat-square" />
  <img alt="node" src="https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" />
  <img alt="dependencies" src="https://img.shields.io/badge/deps-pngjs_only-555555?style=flat-square" />
  <img alt="assets" src="https://img.shields.io/badge/assets-7_types-c03028?style=flat-square" />
  <img alt="godot" src="https://img.shields.io/badge/Godot-4-478cbf?style=flat-square&logo=godotengine&logoColor=white" />
  <img alt="spec-driven" src="https://img.shields.io/badge/spec-OpenSpec-6ac8e8?style=flat-square" />
</p>

PixeCreator 把"一张原型图"或"一句描述"变成可直接进引擎的像素资产：按色板量化、按语义分层矢量化、按动作拼表、一键导出 Godot `SpriteFrames`。整条链路本地运行，**同输入字节级一致**，不需要任何密钥；AI 生图是可选输入源，不是运行时依赖。

## Features

| | |
|---|---|
| 🎨 **三路输入**<br/>程序合成 · PNG/JPEG/WebP 页内框选导入 · img2img provider（Gemini / OpenAI 兼容 / SD-WebUI） | 🧱 **确定性管线**<br/>同输入字节级一致；生成物一律由工具再生成，禁止手改 |
| 🧩 **一动作一表**<br/>Full / Maker 双模式，td/sd 永不混表，行序固定 `fr/bk/lf/rt` | 🎮 **Godot 一键**<br/>`.tres` SpriteFrames，每角色 24 动画，region 与 `map.json` 逐格一致 |
| 🔒 **密钥不落地**<br/>provider key 只从环境变量读取；页面只见 provider 名，错误文本永不回显密钥 | 🧪 **默认不联网**<br/>182 个单测 + 7 套 web 验收 + Godot 配方自检，全部值断言 |
| 📐 **规范驱动**<br/>OpenSpec 冻结 specs、变更提案与归档；里程碑 M0–M5 全程可追溯 | 🖥️ **页内创作台**<br/>资产库 / 导入 / 导出 / Prompt 四区；预览 → 确认 → 备份的两段写 |

## Showcase

<p align="center">
  <img src="docs/assets/readme/showcase-characters.png" alt="knight_001 与 guardian_001 的行走循环" width="880" />
  <br/>
  <sub>knight_001（程序合成）与 guardian_001（真实导入 + AI 补帧）· 每格 64px · 以上为 <code>sheets/</code> 真实拼表裁切</sub>
</p>

<p align="center">
  <img src="docs/assets/readme/showcase-statics.png" alt="五类静态资产" width="880" />
  <br/>
  <sub>五类静态资产 · idle-only · 64 / 128 双档 · 同一套色板与拼表管线</sub>
</p>

## Pipeline

```mermaid
flowchart LR
    A["asset.json<br/>唯一事实源"] --> B{"输入"}
    B -->|"synth"| C["程序合成"]
    B -->|"import"| D["PNG / JPEG / WebP"]
    B -->|"img2img"| E["Gemini · OpenAI 兼容 · SD-WebUI"]
    C --> F["quantizeGeometry<br/>fit + alpha&lt;128 丢弃"]
    D --> F
    E --> F
    F --> G["mapFrameToPalette<br/>OKLCH 最近色"]
    G --> H["pixelsToSvg<br/>语义分层"]
    H --> I["buildSheet<br/>Full / Maker"]
    H --> J["exportTres<br/>Godot 4"]
    I --> K["sheets/<br/>PNG + map.json"]
    J --> L["godot/<br/>.tres"]
```

> [!NOTE]
> **Hash 语义**：synth 槽记录 `prompt_hash`；导入 / AI 槽 `prompt_hash = null` 并记录 `source_hash`（源图 sha256 前 12 位），AI 中间帧两者皆 null。SVG 元数据会内嵌 asset.json 的 hash，因此 **hash 必须先定稿，再导入 / 重生成**。

## Quick Start

要求 Node 20+（开发验证于 Node 24），唯一运行依赖 `pngjs`；核心工具与 `web/lib/*` 零第三方依赖。

```bash
# 1. 安装
npm ci

# 2. 启动本地创作台（只监听 127.0.0.1）
node tools/server.mjs --port 3000

# 3. 浏览器打开
# http://127.0.0.1:3000/web/
```

- **不需要任何 key**：无 provider 时 AI 编排按钮显式禁用，手动导入路径始终可用。
- 只读浏览可用任意静态服务器（如 `npx serve .`）；上传、生成、导出必须走 bridge。
- 跑测试：`node --test tools/*.test.mjs`（当前 182 个）。

## Web Workshop

| 区域 | 用途 |
|---|---|
| **资产库** | 卡片墙 + 矩阵播放（td/sd 切换）、行走/攻击预览、AI 补帧与 td 派生入口 |
| **导入** | PNG/JPEG/WebP 页内框选 → 量化前后对比 → 两段写导入 |
| **导出** | 校验、重生成（可单 clip）、拼表、`.tres`，结果内嵌可见 |
| **Prompt** | kind-aware 表单 → 英文 positive / negative / seed / `prompt_hash` |

- 所有写操作统一 **预览（零落盘）→ 确认 → 自动备份到 `.backup/`**；进度走 SSE。
- 桥作业串行、TTL 10 分钟、上限 100 个；确认令牌过期返回 410。
- 静态白名单：`/web/` `/assets/` `/sheets/` `/palettes/` `/fixtures/` `/godot/` `/tools/` `/prototypes/`。

<details>
<summary><b>Bridge API</b></summary>

| 端点 | 用途 |
|---|---|
| `GET /api/health` | 存活探测 |
| `POST /api/validate` | 校验资产（含落盘文件） |
| `POST /api/generate` | 重生成 SVG（可带 clip 参数） |
| `POST /api/sheet/export` | 导出拼表 |
| `POST /api/tres/export` | 导出 `.tres` |
| `POST /api/import` | 导入 PNG（JPEG/WebP 在浏览器转 PNG 后提交） |
| `GET /api/img2img/status` | 已配置 provider 名（不回显密钥 / URL） |
| `POST /api/img2img/inbetween` | guardian walk/attack 补帧（2→3） |
| `POST /api/img2img/derive-td` | 派生 td 真源 |
| `POST /api/jobs/:id/confirm` | 确认写入（先备份） |
| `GET /api/jobs/:id/events` | SSE 进度 |

</details>

## Asset Catalog

| 资产 | Kind | Size | 结构 | 来源 / hash |
|---|---|---|---|---|
| `knight_001` | character | 64 | 24 动画 / 64 视图 + 2 母版 | synth 样例；`prompt_hash` 64 槽真值 |
| `guardian_001` | character | 64 | 24 动画 / 56 视图 + 2 母版（idle 1f / walk 3f / attack 3f） | 真实导入 + AI 中间帧；`source_hash` 40 槽真值、16 mid 槽 null |
| `sword_001` | weapon | 64 | idle-only，8 视图 + 2 母版 | synth |
| `house_001` | building | 128 | idle-only，8 视图 + 2 母版 | synth · 128 档 |
| `crate_001` | prop | 64 | idle-only，8 视图 + 2 母版 | synth |
| `tree_001` | scenery | 128 | idle-only，8 视图 + 2 母版 | synth · 128 档 |
| `potion_001` | prop | 64 | idle-only，8 视图 + 2 母版 | 用户导入 `I_Bottle03`；`source_hash` 8 槽真值 |

> `guardian_001` 的 td/mid 目前是**正立的水平镜像离线占位**（`tdProvenance.mode = offline-standin-mirror`）；配置 provider 后执行“派生俯视角”即自动换代。

## Commands

<details>
<summary><b>自检（只读）</b></summary>

```bash
node --test tools/*.test.mjs                    # 全量单测（182）
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
```

</details>

<details>
<summary><b>生成（写产物）</b></summary>

```bash
node tools/vectorize.mjs generate --asset knight_001
node tools/sheet.mjs export --asset knight_001 --out sheets
node tools/tres.mjs export --asset knight_001
node tools/import-prototype.mjs --asset potion_001 --src prototypes/potion_001/input.png
node tools/backfill-hashes.mjs                  # knight prompt_hash 回填（幂等维护脚本）
```

</details>

## Image Providers

可选。未配置时页面编排按钮显式报错，手动导入不受影响；密钥只存在于服务端环境变量，仓库与页面零密钥。

| 变量 | 说明 |
|---|---|
| `PIXE_IMG_PROVIDER` | `gemini` \| `openai` \| `sd-webui`（只设 key 不算已配置） |
| `PIXE_IMG_KEY` | 云端 provider 密钥（gemini / openai） |
| `PIXE_OPENAI_BASE` / `PIXE_OPENAI_EXTRA` | OpenAI 兼容端点的可选覆盖（base / 额外 JSON） |
| `PIXE_SD_URL` | 本地 SD-WebUI 服务地址（无 key） |

能力边界（denoise / seed 退化、离线回落、AI 帧采纳原则）见 [`docs/img2img.md`](docs/img2img.md)。

## Design Rules

1. **`assets/*/asset.json` 是唯一事实源** —— SVG / PNG / map.json 一律由工具再生成，禁止手改。
2. **同输入字节级一致** —— 重构与优化以"生成物字节不变"为硬验收。
3. **AI 是导入源，不是运行时依赖** —— 采纳即提交，管线对提交输入保持确定；测试与 verify 永不联网。
4. **库里没有半成品** —— character 必须 24 格完整；创建是原子作业；缺格不可导出。
5. **密钥只在环境变量** —— 源码、示例、测试、页面都不含可用凭据。
6. **像素风一律最近邻** —— 前端 `imageSmoothingEnabled = false`，Godot 侧 `texture_filter = nearest`。

## Roadmap

| 里程碑 | 内容 | 状态 |
|---|---|---|
| **M0** | 人物管线首闭环（量化 → 矢量化 → 拼表 → 引擎占位） | ✅ 已归档 |
| **M1** | 多类资产 + Godot 配方 + OKLCH / Bayer + web 多资产 | ✅ 已归档 |
| **M2** | 真实素材导入 MVP（喂真图 → 出真资产） | ✅ 已归档 |
| **M3** | 一键 `.tres` + 128 档 + 真实角色 24 格 | ✅ 已归档 |
| **M4** | img2img 三层 provider + JPEG 框选 + 补帧 / td 真源 | ✅ 已归档 |
| **M5** | 文生像素素材：txt2img 三适配 + 动态注册 + 页内向导（静态 8 视图 / 角色 56 视图四阶段门） | 🔜 已立项 |

详细里程碑与遗留见 [`docs/milestones.md`](docs/milestones.md)。

## 💥 翻车复盘：一次 vibecoding 的惨痛教训

> 9 轮迭代、182 个测试、M0–M4 全部归档、7 个资产、30 张表、2 个 `.tres`——然后真实 provider 一次没跑过；用户人工验收时，先后看到的是错位的对比滑块和倒立的 guardian。
> 这不是某一处 bug，而是两件事没做对：**先造完，再找用户；需求没想清楚，也没有在每个节点上手用。**

**发展历程**

| 时间 | 阶段 | 发生了什么 |
|---|---|---|
| 2026-10-04 – 10-07 | 起步 → M3 | 一周内完成 asset.json 契约、量化、色板、矢量化、拼表、矩阵、web shell、真实导入（potion，用户验收通过）、guardian 24 clips、`.tres` 与 128 档；M0–M3 连续归档 |
| 2026-10-24 – 10-25 | bridge / UI / M4 | bridge、UI 重设计（用户："页面信息乱"）、冷色主题（用户："屎黄"）、债务清理；M4 三层 provider + JPEG 框选 + guardian 补帧 + td 派生 |
| 2026-10-27 | 轮 8 + 热修 | UI / 工程加固；用户人工验收发现 guardian 预览倒立；首笔"修复"提交实际仍落翻转态，复核 HEAD 后才真正落地 |
| 2026-10-28 | 开源首页 | 生成 hero / 展示图，整理 README，推送到公开仓库 |

**根因一：先造完，再找用户**

三周时间造完了一整台机器：契约、量化、色板、矢量化、拼表、矩阵、bridge、三层 provider、OpenSpec、双 worktree、182 个测试。但"这台机器生产的东西是否有人要、是否好看、是否真的能生成"这个问题，直到最后都没有被正面回答：

- 真实 provider 从未跑过，M4 归档时 AI 生成仍是"接口就绪"；
- guardian 的 td 是镜像占位，不是真实顶视美术；
- 用户人工验收时，先后看到的是错位的对比滑块和倒立的 guardian；
- 每一轮都在给机器加零件（测试、verify、备份、评审协议），没有一轮在验证"这台机器值不值得造"。

**根因二：需求没想清楚，也没有在每个节点上手用**

"做一个像素资产管线"从第一天起就不是一个可验收的目标：它没有回答"给谁用、先做哪类资产、什么算好用"。于是每一轮都在补能力，而不是收敛需求：

- 每个里程碑都在跑测试、verify、归档，却没有"像用户一样上手用一遍"的固定动作；测试证明的是内部一致，不是需求对齐。
- 用户反馈总是滞后整轮甚至几轮："信息乱"、"屎黄"、死页、倒立——每一次都在复杂度已经叠高之后才到达。
- 需求不对齐的代价是复利：UI 重设计、bridge、三层 provider、OpenSpec、双 worktree 逐层叠加；等到发现方向不对，返工成本已经高到**船大难掉头**。

**其余翻车点，都是这两个根因的后果**

1. **用"测试全绿"替代"用户可用"。** 182 个测试、7 套 verify 证明的是内部一致，不是产品成立；过程指标满分，产品指标缺席。
2. **内部自洽掩盖外部错误。** guardian 倒立活了一整轮：fixtures 和槽位一起翻转，测试自然全绿。方向、白屏、错位这些"人眼才能判"的问题，没有门在管。
3. **占位被制度化成"完成"。** td=sd、镜像、AI 中间帧双 null、hash pending——每项都有测试和 spec 条款，于是 M3/M4 可以"归档"。"完成"被偷换成了"自洽"。
4. **平台化跑在内容前面。** 三层 provider、SSE、两段写、备份、作业队列、OpenSpec、双 worktree——基础设施远超 7 个资产所需；美术、动作、角色一致性、AI 真实产出一直排在后面。
5. **UI 被当成展示层，验收太晚。** "信息乱"、两次死页、滑块错位、`f-vibe` 丢失都是集成层问题；Node 测试看不见，静态 verify 也看不见；M2 之后人工验收一直"待做"。
6. **协作复杂度与文档漂移是次要成本。** tasks.md 归档丢失、`node_modules` 误删、stash 短路、游离端口误诊、README 停在 M2——它们放大了根因的代价，但不是根因本身。

**没翻的部分**

- 确定性是真资产：同输入字节级一致，重构以"生成物字节不变"为硬验收。
- 安全默认：provider 密钥只走环境变量，仓库零密钥，测试 / verify 永不联网。
- 数据写入：两段写 + 备份 + 原子创建，方向是对的。
- 出问题后的定位与修复速度快；agent-log 与 postmortem 如实记录，没有粉饰。
- 管线确实能产出：7 个资产、30 张表、两个 `.tres`、182 个测试。

**如果重来：把顺序倒过来，把需求钉死**

1. **先用一句话定义"要什么"**：给谁用、先做哪类资产、什么算好用；写不出这一句就不写代码。
2. **第一周只做一件事**：一句话 → 一个能用的像素资产 → 在 Godot 里走起来。真实 provider 必须在这条路径上；没有云端 key 就先用本地 SD-WebUI。
3. **每个节点自己上手用**：不是跑测试，而是像用户一样打开页面、导入、导出、看动画；发现问题立即改需求，并拉一个真实用户确认，不把偏差留到下一轮。
4. **先找 3 个真实用户**，看他们会不会用、会不会留下；没有用户之前，不写第二个 provider、不做 bridge、不扩资产类型。
5. **第一轮就上 E2E**：打开页面、卡片渲染、一次导入、一次导出；死页活不过一天。
6. **测试少而准**：保留确定性与安全断言，砍掉为自洽而自洽的过度测试，预算投到 E2E 和人眼验收。
7. **没跑通真实 AI，就不叫"完成"**：只能叫"接口就绪"。

一句话：**它没有翻在代码质量，翻在"先造完，再找用户"；需求不清让复杂度失控，最终船大难掉头。**

> In short: the code didn't fail; the order and the unclear requirements did — build first, ask users last, and the ship grew too big to turn.

## Documentation

| 文档 | 内容 |
|---|---|
| [`docs/milestones.md`](docs/milestones.md) | 里程碑 M0–M5 与下一步 |
| [`docs/agent-log.md`](docs/agent-log.md) | 逐轮开发 / 评审 / 合并记录 |
| [`docs/real-import.md`](docs/real-import.md) | 真实素材导入流程 |
| [`docs/img2img.md`](docs/img2img.md) | provider 配置、能力边界、离线回落 |
| [`docs/static-web.md`](docs/static-web.md) | 静态资产的 web 支持 |
| [`docs/quantize-compare.md`](docs/quantize-compare.md) | 量化对比说明 |
| [`docs/optimization-backlog.md`](docs/optimization-backlog.md) | 优化待办与已清项 |
| [`engine-placeholder/godot-atlas/IMPORT-RECIPE.md`](engine-placeholder/godot-atlas/IMPORT-RECIPE.md) | Godot 导入配方（gap #13–#24） |
| [`docs/launch-blocker-postmortem.md`](docs/launch-blocker-postmortem.md) | 启动阻塞事故复盘 |

## Workflow

项目采用规范驱动开发：

1. 在 `openspec/changes/<name>/` 写 `proposal.md` / `design.md` / `tasks.md` 与受影响的 spec delta。
2. 实现 + 全套自检绿；生成物在仓库外临时目录重跑并字节比对。
3. `--no-ff` 合并；提交格式 `type(scope): summary (task-id)`；归档后 specs 由 CLI 同步。

<p align="center">
  <sub>Built with Node.js &amp; pngjs · deterministic by default · no runtime network · no secrets in the repo</sub>
</p>
