# 静态 Web 支持（kind-aware：shell / 矩阵 / prompt）

> 状态：本文写于 M2 时点（当时 5 资产）。资产数随轮次增长——M3 起为 7 个（新增 `potion_001`、`guardian_001`），机制描述仍有效；最新导入/人工查看流程见 `docs/real-import.md`，里程碑全景见 `docs/milestones.md`。

本轮（wt-B）把 web 层三处 character-only 硬编码改为 kind-aware，人物路径字节不变。
范围：`web/**` 只读 `assets/**`，`web/lib/*.js` 零依赖（`node:` 禁入）；`web/verify-*.mjs` 为 node 脚本，可用 `node:fs`/`node:path`。

## 1. 五资产加载（`web/lib/asset-shell.js` + `web/app.js`）

- `loadShell(url = '../assets/knight_001/asset.json')` 默认参数保持 knight 兼容；任意静态路径透传 fetch 即可。
- 新增 `ASSET_IDS`（`knight_001,sword_001,house_001,crate_001,tree_001`）与 `ASSET_URLS`（`../assets/<id>/asset.json`）及 `assetUrlFor(id)`（未知 id 抛错）。
- `checkShell(asset)` 按 `asset.kind ?? 'character'` 分支：
  - character：`perspectives/views/masters` + `actions must include idle/walk/attack shells` + `preview must reference an existing perspective/action/dir`（语义与旧实现逐字一致；`ACTIONS` 常量仅用于该成员判断，未改动）。
  - static（weapon/building/prop/scenery）：`perspectives/views/masters` 同上；含 `walk`/`attack` 则报 `static kind "<kind>" must not define action "walk"/"attack" (idle only)`；缺 `idle` 则按 missing-clip 报缺（`missing clip: <td|sd>/idle/<dir>:action absent` 共 8 条）；`preview.action !== 'idle'` 报 `preview must reference an existing perspective/action/dir`。
- `web/app.js` 加 `#asset-select` 切换器（5 资产可切，默认 `knight_001`）；shell 与矩阵联动重载，prompt 表单仍预填 knight 示例（character 路径冻结）。矩阵元信息与导出提示由硬编码 12/24 改为动态（`cells.length` / `cells.length*2`），character 文案仍为 `12 cells` / `all 24 clips present` / `ready: 24 clips full`，静态为 `4 cells` / `all 8 clips present` / `ready: 8 clips full`。

## 2. 八格矩阵（`web/lib/matrix.js`）

- 新增 `STATIC_KINDS` + `kindOf = asset?.kind ?? 'character'` + `actionsFor = static ? ['idle'] : MATRIX_ACTIONS`；`MATRIX_ACTIONS/MATRIX_DIRS/MATRIX_PERSPS` 导出值未变。
- `buildMatrix(asset, persp)`：character 仍 `idle/walk/attack × 4dir = 12 格/视角`；static 为 `idle × 4dir = 4 格/视角`，双视角共 8 格；缺 idle 缺帧沿用命名占位（`missing:true, files:[], error:'missing clip: <persp>/idle/<dir>...'`）且永不导出。
- `canExport(asset)`：character 查 24 clips，static 查 8 clips（`idle` only）；`createPlayer/tickPlayer` 未动（static walk 经 `clipFrames` 自然抛 `missing clip`）。
- 时序：静态 idle `fps:2 → durationMs:500`，td/sd 一致；`crate_001` 翻转即 4+4=8 格即此断言。

## 3. kind-aware prompt（`web/lib/prompt.js`）

- 人物常量/函数对 character 输入字节不变：`REQUIRED_FIELDS/OPTIONAL_FIELDS/BASE_TEMPLATES/DIR_SENTENCES/ACTION_SENTENCES/BARE_HANDS/SINGLE_FIGURE/SWORD_SEP/FIXED_NEGATIVE/DENOISE/getDenoise/validateFields/hashPrompt/KNIGHT_EXAMPLE` 值与逻辑未动；`ACTIONS` 导出未变（`img2img.js` 64 jobs 不受影响）。
- 新增：`STATIC_KINDS`，`KIND_OBJECT_WORDS={weapon:'sword',building:'house',prop:'crate',scenery:'tree'}`，`STATIC_BASE_TEMPLATES`（object sprite，无人体词），`STATIC_DIR_SENTENCES`（front/back/left/right view，无 face/stance/cape 人体词），`STATIC_ACTION_SENTENCES={idle:'resting idle state, stable placement on baseline'}`，`STATIC_KIND_SENTENCES`（每 kind 必含 kind 词 + 对象词，如 `a small stone house building with tiled roof`），`STATIC_REQUIRED_FIELDS=['object','colors']`，`STATIC_EXAMPLES`（sword/house/crate/tree，seed 2001–2004 对齐 `assets/*/asset.json`）。
- `resolveKind = fields?.kind ?? opts?.kind ?? 'character'`（缺省约定见 §4）；`validateStaticFields` 只检 `object/colors`（+ perspective/seed 复用规则）；`buildPositive` 先分支：static 要求 `action==='idle'`（否则抛 `static kind "<kind>" supports idle only`），组装 `[STATIC_BASE, KIND_SENTENCE, object, colors, vibe?, DIR, ACTION_IDLE]`，永不注入 `BARE_HANDS/SINGLE_FIGURE/SWORD_SEP`；character 分支逐行旧逻辑。`buildPrompt` 透传 `kind`，`negative=FIXED_NEGATIVE`，`denoise=getDenoise('idle')=0.55`，`seed` 锁，`prompt_hash=hashPrompt(positive)`。
- 场景验收：`house_001`（building）positive 含 `house` + `building` 且不含三约束全串；`crate_001` 同理；character knight 全组合仍含三约束（`verify-4.1` 不改一字全绿即证）。

## 4. 缺省约定

全 web 层统一 `?? 'character'`：`asset-shell.js: kindOf = asset?.kind ?? 'character'`，`matrix.js: kindOf = asset?.kind ?? 'character'`，`prompt.js: resolveKind = fields?.kind ?? opts?.kind ?? 'character'`。`KNIGHT_EXAMPLE` 无 `kind` 字段，天然走 character 路径，保证字节不变；kind-less 资产在 shell（ok）、矩阵（12 格）、prompt（与 knight 逐字一致）三处均有回归断言。

## 5. 验证

- `node web/verify-static.mjs`（自包含命名，后续轮次沿用）：5 shell 全 OK + B1 三负断言（walk/attack  present、缺 idle 8 条 missing-clip、preview 非 idle）+ 静态 4×2=8 格（逐资产时序 500ms、crate 翻转、缺帧占位非导出、export 灰度）+ 静态 prompt（四 kind 对象词/kind 词/禁词/denoise/seed/hash + house 场景 + walk 抛 idle-only）+ character 回归（shell ok、12 格、24 clips、prompt 三约束、kind-less 字节一致）。
- 人物红线：`verify-1.1/4.1/4.2/5.2` 四文件不改一字且全绿（其中 1.1 只覆盖 `validateAsset` 侧，不构成 `checkShell` 回归证据，`checkShell` 回归由本 verify 承担）。
- `web/lib/*.js` 无 `node:` 导入；verify 脚本可用 `node:fs`/`node:path`（既有 4 个 verify 同例）。
