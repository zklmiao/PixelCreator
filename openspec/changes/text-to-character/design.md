# Design — text-to-character

## Context

Baseline: `text-to-asset` 归档后的 main（generateImage / 动态注册 / 静态向导已可用）。共识来源：M5 grilling Q11–Q15。guardian 专用编排（`orchestrateGuardianMid` / `orchestrateGuardianTd`）与 `TD_DERIVE_PLAN` 在库，但写死 guardian 路径与 ID。

## Goals / Non-Goals

**Goals**: 通用角色编排（任意新 id）；guardian 档 56 视图角色创建；四阶段硬门 + 上游作废下游；派生槽父图溯源；guardian 存量字节不动。

**Non-Goals**: guardian/knight 存量数据变更；schema 变更；knight 结构升级（attack 4f）；批量角色；表情/装备系统。

## Decisions

- **帧结构**（Q11，prep 冻结）：idle 1 / walk 3 / attack 3 × 4 dir × 2 persp = 56 视图 + 2 母版；walk/attack 帧序 [f1, mid, f2]（mid = inbetween(f1, f2)）。调用预算：2（master txt2img）+ 6（idle 方向派生）+ 16（walk 端点）+ 8（walk mid）+ 16（attack 端点）+ 8（attack mid）= **56 次/角色**，全部人工过目。选 guardian 档而非 knight 档（attack 4f 派生策略要新设计）或下限档（动作单薄）——与 M4 后质量底线一致，inbetween 工具现成。
- **双 master 文生**（Q12）：td/fr 与 sd/fr 各一次 `generateImage`。td 与 sd 是视角级差异，跨视角派生是链上最弱环节——多花 1 次调用换 td 质量。角色 prompt = `buildPrompt` 角色路径（10 字段）+ `BASE_TEMPLATES[persp]` + `DIR_SENTENCES.fr`；单 seed 锁全链。
- **派生档位**：方向派生（idle bk/lf/rt、walk/attack 端点帧）= direction tier 0.55 + 对应 `DIR_SENTENCES` / `ACTION_SENTENCES`；中间帧 = frame tier 0.3 + inbetween（两端点图，guardian 模式泛化）。每格 prompt 全部落 gen manifest。
- **派生槽 hash**（Q13）：master 槽 prompt_hash + source_hash(自身)；派生槽 prompt_hash + source_hash = sha12(父图源 PNG)；gen manifest slot 记 `{source, parent?, parentSha12?, prompt, negative, seed, promptHash, tier, retries}`。spec 注记：guardian 存量 AI 槽双 null 是历史语义，不再外推。
- **阶段门与作废**（Q14）：四阶段 master → idle → walk → attack；阶段 N 的草稿记录其输入父图的 parentSha12；上游任一格重试 → 该格所有下游草稿判 stale（parentSha12 不匹配）→ 向导标红并重派生。服务端 `/api/asset/create` 创建前全量校验 parent 链（任何 stale → `PARENT_STALE 400`），**不信任客户端阶段状态**。
- **角色创建**：character 变体 asset-create——骨架（24 clips：idle 1 / walk 3 / attack 3，fps 2/6/8，attack loop false + next idle）+ 56 视图 + 2 母版（fr 内容 + master 标记）+ 56 源图 + gen manifest + 6 Full + 4 Maker 表 + tres。确定性回归同 M5a（临时目录重跑字节一致）。
- **通用 edit 草稿端点**：`POST /api/img2img/edit`（{image, prompt, tier, seed} 草稿作业，两段写，草稿落 prototypes 区）；M4 的 guardian 专用端点（inbetween/derive-td）与 provider 面板保留不动。
- **向导角色模式**（Q15）：同一"+ 新建资产"向导；kind=character 时表单切角色 10 字段（class/body/outfit/colors/weapon/hair/cape/vibe/seed + 自由文本）、进度墙切四阶段流水；阶段门 UI（下一阶段禁用直到当批全部确认；stale 草稿标红一键重派生；上游重试级联二次确认，明示作废张数）。
- **轴分工**：wt-A = 编排泛化 + 角色创建 + 端点 + 测试；wt-B = 四阶段向导 + verify + docs（`docs/text-to-character.md`）。

## Risks / Trade-offs

- [身份漂移（56 张不完全像同一角色）] → master 锁 + img2img 派生（保身份）+ 四阶段人工门；docs 披露"一致性 = 人审密度"。
- [成本 56 次/角色] → 向导首页明示调用预算与重试代价；用户知情后开跑。
- [重试 master 的级联代价] → 向导二次确认（"将作废 N 张下游草稿"）；服务端 PARENT_STALE 兜底。
- [inbetween 质量] → 端点帧先过目再派生中间帧（阶段门天然保证）；不满意单张重试。
- [编排泛化动到 guardian 路径] → guardian 专用编排改委托通用实现，guardian 导入段字节稳定回归为 A1 硬验收；回归不过即打回。

## Migration Plan

change 1 归档 → 本 change prep（gate 基点 = 新 main；gate 判式 `feat(m5b)`）→ 双卡并行 → wt-A 合 → wt-B 尾巴（rebase + verify 重跑）→ 合 → 勾 tasks/agent-log/milestones M5 收官 → sync/archive。真实验收：用户 SD-WebUI 现场跑 1 静态（M5a）+ 1 角色（M5b）。

## Open Questions

- edit 端点是否复用 M4 inbetween 的 blend 预处理——实现时定，行为对齐 orchestrateGuardianMid 即可。
- 角色骨架层 `seed` 字段 = 全链单锁 seed；每格 denoise 记 gen manifest（骨架层不记 denoise，与 schema 一致）。
