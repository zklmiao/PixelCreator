# PixeCreator

像素游戏资产生成管线：SVG 视图 → 像素量化 → 视图 SVG → 拼表（PNG + map.json）→ 引擎占位，全链路本地确定性可复现。

- **运行时**：Node ESM（`type: module`），**唯一依赖 `pngjs`**；`tools/quantize|palette|asset-manifest|vectorize` 与 `web/lib/*` 保持零依赖（浏览器可直接 import）。
- **离线可跑**：无需任何 key；原型图外部手动导入（见 `openspec/specs/prototype-prompt/spec.md`）。
- **规范驱动**：`openspec/specs/` 为冻结契约，变更走 `openspec/changes/` 提案 → 实现 → 归档流程。
- **铁律**：`assets/*/asset.json` 是唯一事实源；SVG / PNG / map.json 一律由工具再生成，禁止手改；同输入必须字节级一致。

## 目录

| 路径 | 说明 |
|---|---|
| `tools/*.mjs` | 管线实现（量化/色板/矢量化/拼表/清单校验），`*.test.mjs` 为 colocated 测试 |
| `web/` | 纯前端创作台（`app.js` + `lib/` 零依赖库 + `verify-*.mjs` 验收脚本） |
| `assets/<id>/` | 资产事实源：`asset.json` + 视图 SVG + 双母版 |
| `palettes/*.v1.json` | 按 kind 分的固定色板（character/weapon/building/prop/scenery） |
| `sheets/` | 生成物：一动作一 PNG + `*.map.json`（Full/Maker 双模式） |
| `fixtures/` | 导入 fixtures（Icons 图标 + guardian 帧 PNG + 各自 compare 图） |
| `godot/` | `.tres` 一键产物（SpriteFrames，由 Full map.json 生成，24 动画/资产） |
| `prototypes/` | gitignore：用户自备原型图工作区（`prototypes/<id>/input.png`） |
| `engine-placeholder/` | 引擎占位：`generic/`（map.json 直读）+ `godot-atlas/`（导入配方） |
| `openspec/` | specs（冻结）/ changes（进行中）/ changes/archive（已归档） |
| `docs/` | `agent-log.md`（开发轮次记录）、`milestones.md`（产品里程碑 M0–M4）、管线说明 |

## 自检命令（只读）

```bash
node --test tools/*.test.mjs                  # 全量单测
node --test tools/<name>.test.mjs              # 单文件，如 palette.test.mjs
node tools/asset-manifest.mjs validate assets/knight_001/asset.json --check-files   # 7 资产同式
node web/verify-1.1.mjs                        # 以下六个 web 验收（1.1/4.1/4.2/5.2/static/real-import）
node web/verify-4.1.mjs
node web/verify-4.2.mjs
node web/verify-5.2.mjs
node web/verify-static.mjs
node web/verify-real-import.mjs
node web/verify-bridge.mjs                     # web-cli-bridge 验收（路由/白名单/SSE/确认备份/字节一致）
node engine-placeholder/godot-atlas/verify-recipe.mjs
```

```bash
node tools/quantize.mjs selfcheck 64
node tools/palette.mjs map-selfcheck palettes/palette_character.v1.json
node tools/palette.mjs validate palettes/*.v1.json
```

## 生成命令（写产物）

```bash
node tools/vectorize.mjs generate --asset knight_001   # 再生成某资产全部 SVG
node tools/sheet.mjs export --asset knight_001 --out sheets   # 导出拼表（knight 16 文件；静态资产为单帧表）
node tools/import-prototype.mjs --asset potion_001 --src prototypes/potion_001/input.png   # 真实 PNG 导入（落 clip 槽 + 量化对比图）
node tools/tres.mjs export --asset knight_001          # 生成 godot/<id>.spriteframes.tres（Godot 一键接入）
```

Web UI: `node tools/server.mjs --port 3000`（loopback 静态+API 一体）后打开 `/web/`：5 个 CLI 能力可直接点按——Validate 校验、Regenerate SVGs、Export sheets、Export tres、导入 PNG（均 preview→confirm→备份到 `.backup/`，进度走 SSE）。旧用法 `npx serve` 仍只读可用；资产切换器 7 个资产（含真实导入的 guardian/potion）、量化对比区（`fixtures/import/*.compare.png`）、各资产矩阵播放。分步说明见 `docs/real-import.md`。

## 管线四步

1. **几何量化**（`quantize.mjs`）：按最长边 fit 到 32/48/64（人物）或 128（他类），`alpha<128` 丢弃，居中 pad 正方形。
2. **色板映射**（`palette.mjs`）：不透明像素取最近色板色；色距默认 OKLCH（`euclideanDistance` 保留作对照）；dither 默认 `none`，`ordered-bayer` 仅 scenery/building，`error-diffusion` 永拒。
3. **矢量化**（`vectorize.mjs`）：逐像素 rect + 语义分组（body/limb-l/limb-r/outfit/weapon-slot）。
4. **拼表导出**（`sheet.mjs`）：一动作一 PNG，行序固定 `fr/bk/lf/rt`，`cell = asset.size`；td/sd 永不合表；Maker 模式文件带 `$` 前缀并公示截断映射。

## 核心契约

- 视图命名：`{asset}_{td|sd}_{idle|walk|attack}_{fr|bk|lf|rt}{帧号}.svg`（`asset-manifest.mjs` 强制）。
- 人物 `knight_001`（synth 样例）：24 clips（idle 1f / walk 3f / attack 4f × 4 方向 × td/sd）。
- 人物 `guardian_001`（真实导入，M3）：24 clips（idle 1f / walk 2f / attack 2f，帧预算下限），40 视图；td 槽 = sd 像素复制占位（测试钉死，有真源即换）。
- 静态五类（sword/weapon、house/building、crate/prop、tree/scenery、potion/prop）：各 idle-only 8 clips；house/tree `size` 128，其余 64。
- 时序统一：fps idle 2 / walk 6 / attack 8（attack 不循环，接 `next: idle`）。
- 像素风展示一律最近邻（前端 `imageSmoothingEnabled=false`，Godot 侧 `texture_filter=nearest`）。

## 变更流程

1. 在 `openspec/changes/<name>/` 写 `proposal.md` / `design.md` / `tasks.md` / `specs/<spec>/spec.md`（只写受影响的 spec delta）。
2. 实现 + 全套自检绿；生成物在仓库外临时目录重跑，字节比对一致。
3. 合并一律 `--no-ff`；提交格式 `type(scope): summary (task-id)`。
