# 任务卡 — wt-A 管线轴（轮 8 / polish-hardening）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-A`（只在此目录内改）。
- 分支：`feat/hardening`，自主控 prep commit 新建（基点以提交主题核对：`chore(contract): freeze polish-hardening proposal, clip generate contract (r8-prep)`；具体 sha 随下发消息给出）。
- 时序：与 wt-B 并行；你先合（gate：main 含 `feat(hardening)`），wt-B 尾巴 rebase 后用你的 clip 参数端点。

## 2. 背景（一段）

三路深读确认两笔工程债：kind/tier 常量在 ~10 处重复声明（加新资产种类要改六文件，漏一处即校验/生成行为分裂）；server.mjs 的 done/error 作业与事件日志永不清理、preview→confirm 间隙新建文件不进备份（TOCTOU）、verify-bridge 单次确认断言被 `||202` 打穿。另有两项功能性端点工作：generate 支持 clip 参数（"生成此格"名副其实）与 `/prototypes/` 静态服务（用户自备图工作区）。你的任务把这四件在 tools 侧做扎实——**行为字节不变是 D1 的硬验收**。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1     # 预期：m4 后的主干 prep（主题见 §1）
node --test tools/*.test.mjs   # 预期：175/175（M4 已并主干）
node tools/asset-manifest.mjs validate assets/guardian_001/asset.json --check-files   # OK
```

## 4. 任务与验收

- [ ] **A1 — tools/kinds.mjs 单一来源（D1）**：新建零依赖叶模块导出 `CHARACTER_KIND`/`STATIC_KINDS`/`ALL_KINDS`/`KIND_SIZES`（含各 kind 尺寸档 min/max：character 64、weapon/prop 32–64、building/scenery 64–128）/`ALPHA_THRESHOLD`/`frameNumFromFile`；重接线：asset-manifest（删死变量 CHARACTER_SIZES，SMALL/LARGE_KIND_SIZES 改引 kinds）、quantize（tier 规则 + ALPHA_THRESHOLD）、palette（ALPHA_THRESHOLD）、sheet（STATIC_KINDS + frameNumFromFile）、import-prototype（同）、vectorize（两处 STATIC_KINDS + frameNumFromFile）。**验收：全量测试计数不变、knight/guardian 资产重生成 + 全部 sheets 重导出与重接线前字节一致**；web/lib 三处镜像副本不改，各加 `// mirror of tools/kinds.mjs — frozen contract, keep in sync` 注释。
- [ ] **A2 — server.mjs 生命周期（D3-a）**：sweepExpired 增扫 done/error（done/error 时记 `finishedAt`，TTL 同 JOB_TTL_MS）；`jobs.size > 100` 时从最旧 done/error 驱逐；SSE 客户端随 job 删除清理。验收：单测——构造 done/error 超 TTL 的 job → sweep 后消失；未到期保留。
- [ ] **A3 — TOCTOU 备份收紧（D3-b）**：exec 写前备份逐路径按 exec 时点存在性重查（不再只用 preview 快照）；spec 增补 scenario "Late-created files are backed up too"（web-bridge MODIFIED 已写）。验收：单测——preview 后新建的同名文件在 confirm 后进 `.backup/`。
- [ ] **A4 — clip-scoped generate（B2 服务端）**：`POST /api/generate` body 增可选 `clip: "<persp>/<action>/<dir>"`——preview.willWrite 恰为该 clip 帧文件集、exec 只写这些文件；省略 clip = 整资产（现状）；spec（web-bridge ADDED "Clip-scoped regeneration"）已冻结契约。验收：单测值断言（knight clip `td/walk/fr` → willWrite 恰 3 文件、其余资产文件不在列）。
- [ ] **A5 — /prototypes/ 静态服务（B3）**：STATIC_PREFIXES += `'/prototypes/': 'prototypes'`（目录缺省时该前缀 404 属正常）；verify-bridge 补断言（gitignored 目录建临时文件 → 200 + 内容一致 → 清理）。
- [ ] **A6 — verify-bridge 断言强化（D3-c）**：删 `|| c2.status === 202` 逃逸 → 严格 `409 + ALREADY_CONFIRMED`；补首次 confirm → 202 正向断言。
- [ ] **A7 — 提交**：全量测试 + 7 verify + 7× manifest + guardian/knight 重生成字节一致回归后单 commit，消息含 `feat(hardening)`（gate：`git log main --format=%s | grep -m1 "feat(hardening)"`）。

## 5. 拥有 / 禁改

- 可写：`tools/kinds.mjs`（新）、`tools/*.mjs` + `tools/*.test.mjs`（placeholder 除外）、`web/verify-bridge.mjs`、`sheets/` 重导出。
- 禁碰：`web/index.html`、`web/app.js`、`web/styles.css`（wt-B 轴）、`web/lib/**`（冻结；仅允许加 mirror 注释——若选择加注释则属可写例外，行为零变化）、`assets/**`、`palettes/**`、`fixtures/**`、`openspec/**`、`docs/**`、`package.json`、`prototypes/**`。

## 6. 守则

同项目铁律：确定性（D1 重接线后生成物字节一致是硬验收）；零依赖（kinds.mjs 零 import）；仓库外实验；不联网；Git Bash；node 内正斜杠；值断言优先。

## 7. DoD（全绿，输出逐行粘进报告）

```
node --test tools/*.test.mjs            # 计数与基线一致（143 或 +新增单测数）
7× node tools/asset-manifest.mjs validate assets/<id>/asset.json --check-files
7× node web/verify-*.mjs
node tools/vectorize.mjs generate --asset knight_001 && git status --short assets/   # 空（字节一致）
node tools/sheet.mjs export --asset knight_001 --out sheets && git status --short sheets/   # 空
POST /api/generate {assetId, clip:"td/walk/fr"}   # willWrite 恰 3 文件
```

## 8. 完成报告格式

```
基点：prep <sha>（确认）
分支/sha：feat/hardening @ <sha>（含 feat(hardening) 确认）
A1：kinds.mjs 导出清单；六消费方重接线行号；字节一致双回归证明（资产 + sheets）
A2：sweep 测试断言值；驱逐上限测试
A3：TOCTOU 单测（preview 后新建 → confirm 备份含它）
A4：clip 参数 preview willWrite 断言（恰 3 文件）
A5：prototypes 200/404 断言
A6：verify-bridge 严格单次确认断言
DoD：逐条输出粘贴
偏离/遗留：无则写"无"
```
