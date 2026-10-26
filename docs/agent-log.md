# Agent Log（主控独占）

## 轮 0 — 7.1 首人物贯通（D1 修复 + 双表 + 占位）

- D1（main）：`d6a450e` fix(pipeline): pose cycle mod4 plus gaze offset, regen SVGs with distinctness regression (7.1a)；50 文件；自检 84/84 + web 1.1/4.1/4.2/5.2 + manifest 全绿。
- wt-A 管线轴 `feat/sheet-export @ aa6c3e8`：sheets/ 16 文件（8 PNG + 8 map.json），零越界，工作区干净。评审：diff 16 文件；wt 内 84/84 + web 全绿；临时目录重导 16 文件字节一致；突变（fps/几何）变红；Maker 截断公示 + `$`命名合规。结论：通过。
- wt-B 呈现轴 `feat/present-preview-sheet @ d8c429e`：35 文件（docs 1、generic 17、sheets 16、placeholder.test.mjs 1），零越界（sheets 与 A 字节相同，允许重合），工作区干净。评审：wt 内 91/91 + web 全绿；generic==sheets 16 文件字节一致；sheets A==B 一致；突变（删 next、坏 PNG 签名）变红；测试断值非存在性断言。结论：通过。
- 合并：`2499c2b` merge(sheet): knight_001 dual-mode sheets (7.1)（合后 84/84 全绿）；`d0df5f3` merge(present): 7.1 generic placeholder plus hardened tests and docs（合后 91/91 + web 全绿）。第二合 sheets 自动去重，仅 19 文件落地。
- 终验实证：view SVG 64 + masters 2 = 66（40~88 内）；矩阵 verify-5.2 OK；双表 walk 192x256 / attack Full 256x256 / Maker 192x256，行序 fr/bk/lf/rt，fps/loop/next 合 asset.json，Maker dropped 4；generic 17 文件无 .godot/.tres。已勾 tasks.md 7.1 与 engine-placeholder §4 四框。
- 遗留风险：engine-placeholder §2 gap #13–#17（filter/anchor/animation 名/朝向映射/loop_mode）仍缺，属 6.x/轮 1 范围；idle 表未纳入 7.1（按需另加）。

## 轮 1 — static-kinds-godot-adapter（①静态四类 + ④Godot 配方）

- Prep（main）：`4c985f7` chore(contract): freeze kind-aware schema, 4 static skeletons, r1 proposal (r1-prep)；11 文件（proposal/design/tasks/2 specs delta + schema kind-aware 三分支 + 4 骨架 idle×8）；自检 91/91 不受影响；分支 `feat/static-kinds`、`feat/godot-adapter` 预建指向 prep，两 wt merge main 均为 no-op。
- wt-A 管线轴 `feat/static-kinds @ 8b883f4`：单 commit，43 文件（40 SVG + manifest/vectorize/static-kinds.test 新 291 行）；旧 9 测试文件未动；禁改零触碰。评审：wt 内 109/109 + web 全绿 + 5×manifest 全 OK；roundTrip kind 分支人物侧字节不动（3.3 全绿）；突变 5/5 红（错 palette/超尺寸/static-walk/越界命名/未知 kind）；临时目录复刻布局重生成 40/40 与提交字节一致。结论：通过。
- wt-B 呈现轴 `feat/godot-adapter @ 29cacbc`：单 commit，4 文件（IMPORT-RECIPE 原地重写 + verify-recipe.mjs 新 82 行纯只读 + generic §5 + docs 指针）；map.json 零改动；generic 17→17 故 placeholder 断言免同步。评审：wt 内 91/91 + web 全绿；recipe 自检 8 maps/104 frames 全绿；实际脚本临时目录复跑通过、篡改 fps/x 后 2 处 FAIL 变红；gap #13–#24 逐项有映射或缺省。结论：通过。
- 合并：`40b345e` merge(static)（合后主干 109/109 + web/manifests 全绿）；`19fc654` merge(recipe)（零冲突，4 文件；合后 109/109 + recipe 自检 104 帧全绿）。已勾本 change tasks A1–A3/B1–B2/M1。
- 遗留风险：四静态 `prompt_hash:"pending"`（手工导入或轮 2 回填真值）；building/scenery 128 仅 schema+validator 允许、生成器未实测；`.tres` 生成器留轮 2 管线轴；下一轮 ②OKLCH → ③Bayer → ⑤img2img。

## 轮 2 — perceptual-color-plus-static-web（②OKLCH 默认 + Bayer 无害证明 + web 静态支持）

- Prep（main）：`9112455` chore(openspec): add perceptual-color-plus-static-web proposal (r2-prep)；`68ecf16` 两卡入库；`569b402` docs(readme): add project README（轮中用户直派，与测试零交集）。分支 `feat/oklch-bayer`、`feat/static-web` 自 prep 新建，旧 `feat/*` 存档不动。
- wt-A 管线轴 `feat/oklch-bayer @ e1aca66`：单 commit，2 文件（`tools/palette.mjs` +212/-8：`nearestColor`/`mapFrameToPalette` 默认换 `oklchDistance` + 在板 fast path O(1) Set 跳 ±6；`tools/oklch-bayer.test.mjs` 新 197 行：判别蓝独立依据断言 + 在板 none-vs-bayer 字节一致 + 负路径）。评审：wt 内 117/117；diff 零越界；突变（删 fast path 条件）8 项中 byte-identity 项变红；确定性由评审方独立复现（generate×2 + export → status 0）采信。结论：通过。
- wt-B 呈现轴 `feat/static-web @ f4a0e94`：单 commit，7 文件（`web/lib/asset-shell|matrix|prompt.js` kind-aware + `app.js`/`index.html` 切换器 + `docs/static-web.md` + `web/verify-static.mjs` 新 243 行）。评审：rebase 后 wt 内 117/117 + 6 verify（含 verify-static：5 shells/8 格/禁人物约束词/kind 缺省 byte-identical）+ recipe 104 帧；`generic/` vs `sheets/` 16/16 字节一致（重拷 no-op，无 tail commit）；`verify-1.1` 仅 validateAsset 侧已标注。结论：通过。
- 合并：`037c463` merge(palette)（合后 117/117 + 5× manifest + 4 verify 全绿，即 oklch gate）；`18c8167` merge(present)（7 文件；合后 117/117 + 6 verify + recipe 全绿）。
- 集成回填（主控）：`4040567` chore(asset): backfill 32 static prompt_hash via kind-aware prompt——文本级替换（格式不动，每文件 8 行）；锚点 td/fr 全中（weapon 0f435899 / building 5e48f491 / prop 9a611e61 / scenery 10d99667）；回填后 5× manifest + 117/117 全绿。已勾本 change tasks A1–A4/B1–B3/M1。
- 遗留风险：building/scenery 128 档仅 schema/validator 允许、生成器未实测；Godot `.tres` 生成器轮 3（管线轴优先）；静态 32 帧真实 prompt_hash 已落，外部 img2img 实调（积压⑤）前置数据就绪。

## 轮 3 — real-import-mvp（M2 真实素材导入：喂真图 → 出真资产 → 人工可看）

- Prep（main）：`8f2d15a` chore(contract): freeze potion_001 skeleton plus real-import-mvp proposal (r3-prep)（prop/`palette_prop@v1`/64/seed 2005/idle-only 8 clips 全 pending 零 SVG + `prototypes/` 入 .gitignore）；`8682ce0` 两卡基点入库。分支 `feat/real-import`、`feat/compare-view` 自 prep 新建。
- wt-A 管线轴 `feat/real-import @ 27499ec`：单 commit，24 文件（`tools/import-prototype.mjs` 新 242 行 + `import-prototype.test` 160 行 + `sheet.mjs` 静态导出扩展 +109 + `sheet-static.test` 137 行 + potion 8 视图 + 2 母版 + fixtures 3+3 + potion sheets 2+2）。评审：wt 内 135/135；diff 零越界；母版抽查（data-master 标记 + rect 集与 fr0 相等 2022 项）+ sheets 256x64 + map 键齐；色板纪律/确定性由评审方独立实证采信。结论：通过。
- wt-B 呈现轴 `feat/compare-view @ 21baebe`：本体 `5fdad2f` 8 文件（`web/lib/compare.js` 新 28 行零 node: + 对比区 + `ASSET_IDS` 扩 6 + `verify-static:26` 同步 + `verify-real-import.mjs` 新 146 行 + `docs/real-import.md`）+ tail `21baebe` 3 文件（compare 公式对齐实图布局 98x64=34+64，推导式非录制）。评审：rebase 后 wt 内 135/135 + 7 verify 全绿 + recipe 104 帧；公式推导/零 node: 抽查通过。结论：通过。
- 合并：`1b27aa7` merge(import)（合后 135/135 + 6× manifest 全绿，即严格式 `feat(import)` gate）；`274e7cc` merge(present)（8 文件；合后 135/135 + 7 verify + recipe 全绿）。
- 集成：无回填（`potion_001` prompt_hash 按提案非目标保持 pending）。已勾本 change tasks A1–A4/B1–B3/M1；里程碑 M2 翻 ✅（验收实测行已补）。
- 遗留风险：`potion_001` hash 回填留后续轮次；building/scenery 128 档 + `.tres` 生成器 → M3（轮 4）；img2img → M4。

## 轮 4 — real-character-m3（M3：首个真实角色 + 一键 .tres + 128 实测）

- Prep（main）：`0dddede` chore(contract): freeze guardian_001 skeleton plus real-character-mvp proposal (r4-prep)（character/64/seed 2006/24 clips/40 slots 全 pending 零 SVG）。分支 `feat/m3-tracks`、`feat/m3-view` 自 prep 新建。
- wt-A 管线轴 `feat/m3-tracks @ 54f3a28`：单 commit，114 文件（guardian 40 视图 + 2 母版 + fixtures 8+8+map + guardian 6 Full + 4 Maker sheets + knight idle 2+2 + `tools/tres.mjs` + godot 2 文件 + house/tree 128 + 3 新测试）。评审：wt 内 156/156；diff 零越界；house/tree JSON 各仅 size 单行；tres 24/24 动画名/时序/帧数（64/40）+ sheets 几何抽查通过。结论：通过。
- wt-B 呈现轴 `feat/m3-view @ cbe5fef`：本体 `16510c4` 8 文件（compare guardian 驱动 + ASSET_IDS 扩 7 + verify-static 同步 + verify-real-import guardian 段 + docs + recipe §6 修指）+ tail `cbe5fef` 1 文件（复用/母版改 rect 集比对，td 保持整字节）。评审：rebase 后 wt 内 156/156 + 7 verify 全绿 + recipe 104 帧；td==sd 整字节 20 组独立复核。结论：通过。
- 合并：`c1ef56b` merge(m3)（合后 156/156 + 7× manifest 全绿，即严格式 `feat(m3)` gate）；`64d4a85` merge(present)（8 文件；合后 156/156 + 7 verify + recipe 全绿）。
- 集成：无回填（guardian/potion hash 均 pending，沿提案）。已勾本 change tasks；里程碑 M3 翻 ✅。
- 遗留风险：td 真源替换（有源即换，删占位测试）；fuller motion（补拍/补生成 M4+）；guardian/potion hash 语义 M4 定；img2img → M4。

## 轮 5 — web-shell-v2（UI 重设计：四区 IA + 像素主题）+ web-cli-bridge 归档

- Prep（main）：`2e87eba` chore(openspec): add web-shell-v2 proposal plus task card (r5-prep)（proposal/tasks/自包含单卡；卡面基点按提交主题核对，根治 amend 后 sha 失效问题）。
- wt-B 呈现轴 `feat/web-shell-v2 @ 5742f38`：单 commit，恰 3 文件（index.html/app.js/styles.css +841/−421）。评审：红线 diff 空（web/lib、tools/server.mjs、assets、7 verify 全零触碰）；142/142 + 7 verify + recipe 全绿；server 下 DOM 自证复核（四区/导航/面板默认折叠/导出唯一/术语零泄漏）；styles.css 10 色字面量除 #00000022（透明网格叠层，非新色相）外全部映射 token/色板；矩阵播放控制 ctl-play/ctl-step 在场。偏离三条均裁决可接受（含卡面 gate 词自相矛盾由 wt-B 正确修正）。结论：通过。
- 合并：`3005e13` merge(present): web shell v2 four-zone ia plus pixel theme (B1-B5)（合后主干 142/142 + 7 verify + recipe 全绿）。
- 簿记：sync web-cli-bridge 4 spec delta 进主 specs（godot-adapter/prototype-import/spritesheet-export 各 +1 Requirement；web-bridge 新建第 10 个 capability）；web-shell-v2 skip_specs（纯 UI 无 delta）；双 change 归档。
- 遗留：用户人工验收（四区导航/导入两段写/像素主题观感）；M4 backlog 不变（fuller motion/td 真源/hash 语义/img2img + 评审遗留 SP1 母版精度/SP2 sword、crate 静态表）。

## 轮 5 补记 — 启动阻塞缺陷（人工启动发现，postmortem 见 docs/launch-blocker-postmortem.md）

- 用户要求评审方亲自启动页面 → 发现 bridge 方式启动即死页（资产卡片墙不渲染、模块图死亡）。根因：`web/lib/matrix.js` import `../../tools/clips.mjs`，桥静态白名单漏 `/tools/` → 浏览器侧模块解析 404（Node 侧走文件系统不可见）。伴生两处：对比区容器迁移遗漏、CSS 覆盖 `[hidden]`。
- 修复 `585ee0b`（server 白名单 + 容器补回 + 空值防御 + `[hidden]` 守卫 + web-bridge spec 修订）；浏览器回归（7 卡片/11 compares/确认条隐藏/bridge 正常）+ 142/142 + 7 verify 全绿。
- 预防项（M4 可选）：verify-bridge 增加"模块引用图 ⊆ 静态白名单"静态审计。

## 轮 6 — debts-cleanup（评审遗留 + postmortem 预防 + UI 冷调）

- change `debts-cleanup`（单轴主控执行）：①静态单帧表补齐——sword/crate 256x64、house/tree 512x128（128 档首批真实出表）；②svg-engineering 母版"无限精度"条款降格（MODIFIED delta：网格锁定 + 矢量源到达时升级的移除条件，guardian td 占位同款写法；vectorize.test 注释同步）；③Bayer 效果测试——water 中点带 none 单色 / bayer 打散双色（探针依据在案），突变证明：杀死 ±6 偏移 → 测试红；④verify-bridge +模块可达性审计（web/app.js import 闭包 ⊆ STATIC_PREFIXES，16 项）；⑤UI 深冷调（用户 Q5 反馈"屎黄"）——9 token 换 eye/steel-dark/steel-light/steel-mid/outline 系，像素框架不动。
- 回归：143/143（+1 Bayer 效果测试）；7 verify（verify-bridge 14→16 项）；7× manifest。
- 教训沉淀：本轮 python 批量编辑两次被转义折叠（、
），改用 Edit 工具单点修——批量脚本里含正则/换行的字符串应写入文件而非 heredoc 内联。

## 轮 7 — img2img-live（M4：三层 provider + JPEG 框选 + guardian 补帧/td 真源 + hash 语义）

- Prep（main）：`3724e2f` chore(contract): freeze img2img-live schema, guardian frames, proposal (m4-prep)——schema 加可选 `source_hash`（12 hex）；guardian 3 帧结构**规格冻结**（落盘推迟到 A3 原子完成，prep 不造红基线）；9 文件工件 validate 绿。
- wt-A 管线轴：`93a62f4` feat(m4)（154 文件 +2312/−563：provider 三适配层 + 桥端点 + guardian 3 帧 + td 真源 + hash 回填）+ `d3932dd` fix(m4)（gate 前三项整改：prototype-import MODIFIED delta 40→56、td 溯源标记 tdProvenance 四点接线、verify-real-import 所有权对账摘要）。评审：范围恰 8+8 文件零越界；175/175；delta 场景保全符合 CLI 规则；对账 4+1 处追认（web/verify-real-import 改动全部由契约事实变化驱动）。结论：通过。
- wt-B 呈现轴：`d79d43e` + `4d7ddc9`（rebase 后两笔：JPEG/WebP 上传 + canvas 矩形框选 → PNG blob → 既有 /api/import；provider 状态面板 + 密钥边界说明；编排按钮降级显式报错；docs/img2img.md env 表按 wt-A 实现对齐）。评审：红线 diff 空；175/175 + 7 verify；降级路径浏览器实测（面板"编排端点未上线"显式报错不崩）。结论：通过。
- 合并：`20f9cb5` merge(m4)（gate feat(m4) 触发）→ `06d835d` merge(present)（合后 175/175 + 7 verify 全绿）。
- 主控修复（wt-B 移交）：img2img 路由 catch 的 `{ ...e }` 展开丢失 Error 原型上的 message → 三处统一改 `sendErr(res, e, 400)`（报文恢复正常描述；UNKNOWN_ASSET/普通错误语义不变）。根因确认时曾因旧进程占端口误判"修复无效"——kill 后重启即正常。
- 簿记：勾 img2img-live tasks 全部；归档（CLI 同步 3 delta）；Mimosa 扫描 0 发现（两次封存）。
- 遗留：真实 provider 生成待用户 env（PIXE_IMG_PROVIDER/KEY，升级路径已就绪：重跑 guardian-td/mid 编排即自动换代）；M3 的 Godot 载入人工验收仍待用户；M5 候选：页内资产向导、zhipu 原生适配器（CogView 原生 seed/size 优势）、verify-bridge 作业泄漏清理。

## 轮 8 — polish-hardening（UI 打磨 10 项 + 工程加固 4 项，双轴并行）

- Prep（main）：`529865d` chore(contract): freeze polish-hardening proposal, clip generate contract (r8-prep)（proposal/design/tasks/双卡/web-bridge delta；基线计数修正 143→175 并 amend，双分支重指；tasks.md 因 amend 链路意外未入库——已在归档位补回勾选态）。
- wt-A 管线轴 `feat/hardening @ b0f976c`：单 commit，13 文件（kinds.mjs 新叶模块单一来源六消费方重接线【字节一致硬验收：knight synth 重生成 + guardian map 重导入 + 60 sheets 重导出全字节一致】+ server.mjs 作业生命周期/TOCTOU 备份时点收紧/clip-scoped generate//prototypes/ 服务 + verify-bridge 严格单次确认断言）。评审：范围 13 文件零越界（web 三文件零触碰、web/lib 仅 mirror 注释）；182/182；clip 端点契约实测（willWrite 恰 3 文件/UNKNOWN_CLIP 400）。结论：通过。
- wt-B 呈现轴 `feat/ui-polish @ ecbd893`：单 commit，3 文件（校验结果可见化 + 导出内容化同一结果区、clip 参数按钮、/prototypes/ 接线、Prompt kind 选择、打磨包）。评审：红线 diff 空；175/175 + 7 verify；发现 f-vibe 字段在表单重写中丢失（模块顶层崩溃死页）——评审方定位（捕获阶段 error 监听）并修复（6e728a9）；kind 选择器"不可见"系探针时序误报（区切换后测量）。结论：通过（含评审方修复一笔）。
- 合并：`4ff4205` merge(hardening) → `c7632ad` merge(ui-polish)（合后 182/182 + 7 verify + 7× manifest 全绿）。
- 簿记：tasks 全勾（归档位补回——发现 openspec 归档 CLI 的 tasks.md 搬运缺漏征兆，已记观察项）；web-bridge 主 spec 同步（MODIFIED 单源服务清单 + TOCTOU 备份时点；ADDED clip-scoped regeneration）。
- 事故两起如实申报（wt-A）：stash pop 因 && 短路未执行（已恢复无损失）；worktree remove --force 穿透 junction 误删主树 node_modules（npm ci 恢复，无 commit 影响）。
- 遗留：backlog A/B/D1/D3 全清（docs/optimization-backlog.md 刷新）；M5 候选不变（向导/vectorize 拆分/GIF 导出）。
