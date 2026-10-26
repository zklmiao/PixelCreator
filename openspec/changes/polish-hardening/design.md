# Design — polish-hardening

## Context

Baseline: main `9e517ae`，143/143（M4 归档后），10 specs，7 资产。三路深读 + 轮 5 用户反馈的发现清单见 `docs/optimization-backlog.md`（A1–A5/B1–B5/D1/D3 已带 file:line 证据）。双轴零交集：wt-A = tools/** + verify-bridge；wt-B = web/index.html + app.js + styles.css。

## Goals / Non-Goals

**Goals**: 全部 backlog A/B/D1/D3 项落地；测试计数只增不减；行为字节不变（D1 重接线）；7 verify 不改一字全绿。

**Non-Goals**: web/lib 冻结不碰（D1 不收敛其镜像副本）；无新依赖；不做 M5 向导本体；不改两段写协议语义（只收紧备份时点）。

## Decisions

- **D1 kinds 单一来源**：新建 `tools/kinds.mjs`（零依赖叶）导出 `CHARACTER_KIND='character'`、`STATIC_KINDS=['weapon','building','prop','scenery']`、`ALL_KINDS`、`KIND_SIZES`（character 64；weapon/prop 32–64；building/scenery 64–128，含各档具体 min/max）、`ALPHA_THRESHOLD=128`、`frameNumFromFile(name)`。重接线：asset-manifest（删死变量 CHARACTER_SIZES，SMALL/LARGE_KIND_SIZES 改引 kinds）、quantize（tier 规则 + ALPHA_THRESHOLD）、palette（ALPHA_THRESHOLD）、sheet（STATIC_KINDS + frameNumFromFile）、import-prototype（同）、vectorize（两处 STATIC_KINDS + frameNumFromFile）。**行为字节不变是硬验收**：全量测试计数不变 + knight/guardian 资产重生成 + 全部 sheets 重导出字节一致。web/lib 三个镜像副本（asset-shell ACTIONS/DIRS/PERSPECTIVES、prompt ACTIONS/STATIC_KINDS）不改，各加一行 `// mirror of tools/kinds.mjs — frozen contract, keep in sync` 注释。
- **D3-a 作业生命周期**：`sweepExpired` 增扫 done/error（`finishedAt` 记录于 done/error 时）；TTL 到期清理（同 JOB_TTL_MS）；另加硬上限 `jobs.size > 100` 时从最旧 done/error 开始驱逐。SSE 客户端随 job 删除一并清理。
- **D3-b TOCTOU**：exec 写前备份从"preview.willWrite 快照"改为"逐路径 exec 时点重查存在性，存在即备份"——preview 与 exec 之间新建的文件也进备份。语义收紧写进 web-bridge delta（Preview then confirm with backup 增补 scenario）。
- **D3-c 断言强化**：verify-bridge 单次确认断言删 `|| c2.status === 202`（严格 409 + ALREADY_CONFIRMED）；补正向断言（首次 confirm → 202）。原 `||202` 是防御性含糊——两段写语义下二次 confirm 必须 409，202 说明实现错了。
- **B2 clip-scoped generate 契约**（双轴并行靠它）：`POST /api/generate` body `{assetId, clip?: "<persp>/<action>/<dir>"}`——preview.willWrite 恰为该 clip 的帧文件集（knight walk = 3 文件）；省略 clip = 整资产（现状）。实现：`generateKnightSvgs`/`generateStaticSvgs` 加 clipFilter 参数。**合并顺序 wt-A 先**：wt-B 的按钮在端点就绪前降级为整资产重生成（现状语义），rebase 后自动真单格。
- **B3 /prototypes/ 前缀**：STATIC_PREFIXES += `'/prototypes/': 'prototypes'`；目录不存在时静态处理器照常 404（typed error）；verify-bridge 在 gitignored 的 prototypes/ 下建临时文件断言 200 + 内容，随后清理（该目录不入库，测试自清理即可）。
- **A/B 各项 UI 决策**见 tasks 卡（四区 IA 不变，只在区内改）。

## Risks / Trade-offs

- [D1 重接线触六核心文件] → 行为字节不变铁证（全量测试计数不变 + 生成物字节一致双回归）；任一失败即回退该文件接线。
- [TOCTOU 收紧改变备份时点] → 仅影响 preview→confirm 间隙新建的文件（此前不被备份、会被覆盖）；收紧后这些文件进备份，只增不减。
- [clip-scoped generate 的 willWrite 缩小] → 前端确认条展示"将写入 N 个文件（单格）"如实；整资产路径保留。
- [/prototypes/ 服务 gitignored 用户文件] → loopback-only + 用户自己的图；spec 注明该目录为用户工作区。

## Migration Plan

评审确认 → prep（提案/design/tasks/双卡/delta）→ 双卡并行（wt-A 先合为 gate）→ wt-B 尾巴 → 合 → 勾 tasks + agent-log 轮 8 + backlog 刷新 + milestones + sync/archive（web-bridge CLI 同步）→ Mimosa deep 扫描（质量优先）。

## Open Questions

- 无（用户已拍板范围与两设计决策：像素风框架不动、开发者面板折叠不动）。
