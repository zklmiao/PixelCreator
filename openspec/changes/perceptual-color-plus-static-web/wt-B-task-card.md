# 任务卡 — wt-B 呈现/文档轴（轮 2 / perceptual-color-plus-static-web）【r2 评审勘误版】

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-B`（只在此目录内改）。
- 分支：`feat/static-web`，自 main 上主控 prep commit 新建（基点：prep `9112455`；开始前执行 `git log --oneline -1` 核对一致，工作区 `git status --short` 必须干净）。
- 独立会话：你看不见主控与其他 agent 的上下文，本卡是唯一依据；有歧义按卡面字义做并在报告中注明，不要猜卡外约定。
- 时序（关键）：主体（B1/B2/verify+docs）与 wt-A 并行开发，不依赖 wt-A 产物；**合并前必须等主控的 gate 通知**（main 含 `oklch` 提交：`git log main --format=%s | grep -m1 -i oklch` 有输出），gate 通过后尾巴三步：`rebase` 到新 main → 重拷 `generic/` → 全套 DoD 重跑，完成后报告。

## 2. 背景（一段）

PixeCreator 是像素游戏资产生成管线（纯前端 web + Node ESM 工具链，唯一依赖 pngjs，离线可跑、无需任何 key），规范驱动（openspec），已归档 character-mvp 与 static-kinds 两轮。四静态资产（sword/house/crate/tree_001，各 idle-only 8 clips，per-frame `prompt_hash:"pending"`）已有 SVG 但 web 层三处 character-only 硬编码使它们无法使用：`web/lib/asset-shell.js:33` 写死 `../assets/knight_001/asset.json`（且 `checkShell` 强制 idle/walk/attack 三动作）、`web/lib/matrix.js:9` `MATRIX_ACTIONS` 硬编码三动作、`web/lib/prompt.js:11` `ACTIONS` 与人物专属句式（bare-hands/sword-leg 等对静态不适用）。你的任务是把这三处改成 kind-aware，人物行为零变化，并交付 verify 脚本与 docs。

## 3. 现状自查命令与预期（开工先跑，不符即停并报告）

```
git log --oneline -1                                    # 预期：本卡 §1 基点 prep 9112455
node --test tools/*.test.mjs                            # 预期：tests 109, pass 109, fail 0
node web/verify-1.1.mjs                                 # 预期全 OK（结尾 shell loadable + files on disk）
node web/verify-4.1.mjs                                 # 预期全 OK（结尾 4.1 prompt template verified）
node web/verify-4.2.mjs                                 # 预期全 OK（结尾 reserved slot verified）
node web/verify-5.2.mjs                                 # 预期全 OK（结尾 5.2 matrix verified）
```

## 4. 任务与验收（引用 spec 原文；※ 为评审勘误）

spec deltas：`openspec/changes/perceptual-color-plus-static-web/specs/prototype-prompt/spec.md`、`specs/animation-keyframes/spec.md`（其余 specs 冻结；pixel-quantize 归 wt-A）。

- [ ] **B1 — asset-shell kind-aware。** 现状：`loadShell(url = '../assets/knight_001/asset.json')`（`:33`）+ `checkShell` 强制三动作。做法：`loadShell` 按 kind/路径加载 5 资产（默认参数保持 knight 兼容），`checkShell` 按 `asset.kind` 分支——character 路径语义不变，静态走 idle-only 语义；`app.js` 加资产切换器（5 资产可切，默认 knight）。
  - ※ **idle-only 语义钉死（勘误 6）：静态含 walk/attack 报错；缺 idle 格沿用 missing-clip 报缺（既有语义）；`preview.action !== 'idle'` 报错。** "静态缺 walk 报缺"即此三条，不断言其他形状。
  - ※ **`kind` 缺省（勘误 5）：`KNIGHT_EXAMPLE` 无 kind 字段，实现必须用 `asset.kind ?? 'character'` 缺省，保证人物路径字节不变。** `asset-shell.js` 的 `ACTIONS` 常量仅用于 `preview.action` 成员判断，无需改。
  - ※ **回归证据澄清（勘误 4）：`verify-1.1` 走 `validateAsset`、不经 `checkShell`，其全绿不构成 `checkShell` 改动的回归证据。** `checkShell` 回归由本任务的新测试/`verify-static` 承担；`verify-1.1` 仍须全绿（不改一字），但只证明 `validateAsset` 侧未破。
  - ※ **新测试落点二选一（勘误 1，推荐前者）：推荐并入 `web/verify-static.mjs`**——负断言（静态含 walk 报错 / preview 非 idle 报错 / 5 资产 shell 全 OK）直接写进 verify；或新建 `web/static-web.test.mjs`，此时 DoD 扩为 `node --test tools/*.test.mjs web/*.test.mjs`。无论哪种：`checkShell` 是纯函数，直接调它测；`loadShell` 用 fetch 相对 URL、在 node 下跑不了——测试走 fs 读 `assets/*/asset.json` + 直调 `checkShell`，不要试图在 node 里调 `loadShell`。
- [ ] **B2 — matrix + prompt kind-aware。** spec 原文（animation-keyframes）：*"The system SHALL render a static preview matrix of idle-only cells (4 dirs per perspective, 8 total across the td/sd toggle) with the same per-cell player and missing-placeholder semantics as the character matrix; static cells SHALL reference only idle clips."* 做法：`buildMatrix` 对静态返回 idle×4dir（单视角 4 格，双视角共 8 格；`kind` 取 `asset.kind ?? 'character'`），缺 idle 缺帧沿用命名占位且永不导出；character 12 格路径不动（`verify-5.2` 不改一字全 OK）。spec 原文（prototype-prompt）：*"static prompts SHALL NOT contain bare-hands, sword-leg-separation, or single-character person constraints"* 且 *"WHEN composing the knight example through the character path / THEN positive/negative/denoise/seed/hash output is byte-identical to the v0.2 baseline"*。做法：`prompt.js` 新增 kind-keyed 静态句式（武器/建筑/道具/景物各有对象陈述，必含 kind 对象词），人物常量/函数对 character 输入字节不变（`verify-4.1`/`verify-4.2` 不改一字全 OK）。场景验收：*"WHEN loading `crate_001` and flipping the td/sd toggle / THEN 4 idle cells show per side (8 total), timing preserved…"*；*"WHEN composing a prompt for `house_001` … / THEN … contains none of the character-only constraint strings"*。
  - ※ **零依赖红线范围（勘误 3）：仅限 `web/lib/*.js`（浏览器可 import，不引 `node:`）。`web/verify-*.mjs` 是 node 脚本，可用 `node:fs`/`node:path`（既有 4 个 verify 同例）。**
- [ ] **B3 — verify + docs（主体并行）+ gate 后尾巴（勘误 2 拆分）。** 主体阶段（不等 wt-A）：新增 `web/verify-static.mjs`（自包含命名，后续轮次沿用）：5 资产 shell 全 OK + 静态 8 格矩阵（4 格/视角、缺帧占位非导出）+ 静态 prompt 值断言（禁人物约束词、含 kind 对象词）+ character 回归项 + B1 负断言（§4 前款）；用法 `node web/verify-static.mjs`。docs 落档（新增或扩展 `docs/` 下静态 web 支持说明：5 资产加载、8 格矩阵、kind-aware prompt 规则、`kind ?? 'character'` 缺省约定）。gate 通过后的尾巴（仅三步）：rebase 到新 main → `cp sheets/*.png sheets/*.map.json engine-placeholder/generic/`（字节复制；若 `placeholder.test.mjs` 精确文件集/字节断言因文件集变化需同步，同提交更新）→ 全套 DoD 重跑。注意：rebase 会带入 wt-A 的新 sheets，重拷必须在 rebase **之后**做。

## 5. 拥有 / 禁改文件清单

- 可写：`web/**`、`docs/**`、`engine-placeholder/**`、`tools/placeholder.test.mjs`（仅当 `generic/` 文件集变化时同提交同步）、新增 `web/verify-static.mjs`（或二选一的 `web/static-web.test.mjs`）。
- 禁碰：`tools/` 其余一切（pipeline 实现与单测）、`assets/**`（含 `prompt_hash` 回填，主控集成期做）、`palettes/`、`openspec/**`、`package.json`。`map.json` 零改动；不建 `.godot/.tres`；`generic/` 只做字节复制不改名。

## 6. 守则

- 核查只读；实验一律仓库外临时目录；绝不提交临时文件；绝不联网。
- Windows + Git Bash（`cp` 可用）；node 代码内路径用正斜杠；`web/lib/*.js` 保持零依赖（`node:` 禁入），verify 脚本不受此限。
- 人物路径字节不变是红线：`verify-1.1/4.1/4.2/5.2` 四个文件不改一字且全绿（其中 1.1 只覆盖 `validateAsset` 侧，见 §4 勘误 4）。
- 测试只准值断言（精确文件集、精确落点/句式包含与排除）或性质断言，禁止纯存在性断言。

## 7. DoD 命令清单（全绿，输出逐行粘进报告；gate 尾巴后重跑全部）

```
node --test tools/*.test.mjs                             # 若选 static-web.test.mjs 方案则加 web/*.test.mjs
node web/verify-1.1.mjs
node web/verify-4.1.mjs
node web/verify-4.2.mjs
node web/verify-5.2.mjs
node web/verify-static.mjs
node engine-placeholder/godot-atlas/verify-recipe.mjs
git log main --format=%s | grep -m1 -i oklch          # gate 确认（有输出才可进重拷）
cmp sheets/<任一png> engine-placeholder/generic/<同名>  # 抽查字节一致（或等价比对命令全量 16 文件）
```

（`cmp` 在 Git Bash 可用；16 文件比对可用循环逐个贴结果。）

## 8. 完成报告格式（按此模板回主控）

```
基点：prep 9112455（与本卡 §1 一致确认）
分支/sha：feat/static-web @ <sha>；rebase 到 main <含oklch的sha> 确认 + gate 输出粘贴
B1：改动文件行（asset-shell.js/app.js/测试）；测试落点方案（verify-static 内 / static-web.test.mjs）；负断言三项的值粘贴；verify-1.1 输出粘贴（注明仅 validateAsset 侧）
B2：改动文件行（matrix.js/prompt.js/测试）；verify-5.2/4.1/4.2 输出粘贴；静态 8 格 + prompt 禁词/对象词断言值粘贴；kind 缺省写法行号
B3：verify-static.mjs 全输出粘贴；docs 文件名；重拷命令 + 16 文件字节比对结果粘贴；placeholder.test.mjs 是否同步（是/否及原因）
DoD：逐条命令输出粘贴（tests 计 x/y；各 verify 结尾 OK 行）
偏离/遗留：无则写"无"
```
