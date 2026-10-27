# Proposal — text-to-character

## Why

角色的"生产端"目前到不了"从零新建"：synth 只有 knight 样例；guardian 是 prep 冻结骨架 + 主控手工备料 + 一次性 map 导入；编排 `orchestrateGuardianMid/Td` 写死 guardian 路径与 ID。M5a（`text-to-asset`）落地 txt2img 与动态注册后，角色链只差两件事：编排泛化（任意新 id 可跑"master → 方向 → 帧"全链）与分阶段人工门（派生链意味着一张坏 master 会污染下游几十张图）。M5b（grilling Q11–Q15 拍板）闭合角色 24 clips 的文生创建。

## What Changes

- **编排泛化**（wt-A）：新增通用角色编排（img2img-providers 扩展或独立模块）——双 master 文生 → idle 方向派生（direction tier 0.55）→ walk/attack 端点帧派生（0.55）→ 中间帧 inbetween（frame tier 0.3），任意新 id 可跑；`orchestrateGuardianMid/Td` 保留签名改为委托通用实现，guardian 存量 fixtures/map/槽位零改动（导入段字节稳定回归为硬验收）。
- **帧结构冻结**（prep）：guardian 档 idle 1 / walk 3 / attack 3 = 56 视图（idle 8 + walk 24 + attack 24）+ 2 母版；walk/attack 帧序 [端点 f1, inbetween, 端点 f2]。调用预算 56 次/角色。
- **角色创建管线**（wt-A）：asset-create 角色变体——从角色 gen manifest（56 槽 + parent 链）原子产出：character 骨架（24 clips，fps 2/6/8，attack loop false + next idle）+ 56 视图 + 2 母版 + 56 源图入 `fixtures/<id>/` + `<id>-gen.json` + 6 Full + 4 Maker 表 + `.tres`。ID_EXISTS 拒覆盖；服务端 parentSha12 全量校验（父图重生成后子草稿失效，`PARENT_STALE` 拒创建）。
- **桥端点**（wt-A）：新增 `POST /api/img2img/edit`（通用图生图草稿作业，两段写，草稿落 prototypes 区）——M4 的 inbetween/derive-td 是 guardian 专用编排，保留不动；`/api/asset/create` 扩 character 类型。
- **四阶段硬门**（wt-B + A）：向导 kind=character 切角色 10 字段 + 四阶段进度墙（master 2 张 → idle 6 张 → walk 24 张 → attack 24 张），批内逐张过目/重试，**上游重试作废其全部下游草稿并提示重派生**，不得跳步；总确认一个原子作业。
- **hash 语义**（wt-A）：master 槽双真值（prompt_hash + source_hash = 自身源图）；派生槽 `prompt_hash`（每格自己的派生 prompt）+ `source_hash` = **父图** sha12；gen manifest 记 parent 引用，全链可回溯。"AI 槽双 null"收窄为 guardian 存量历史语义（spec 注记；存量数据不动）。

## 核心设计原则

同 M5a（AI 是导入源 / 两段写 / 永不联网 / 库里无半成品），外加：**派生链的依赖方向决定验收顺序**——阶段门是数据完整性规则，不是流程偏好；服务端不信任客户端阶段状态（parent 链服务端校验）。

## Non-Goals

- 不动 guardian/knight 存量数据与文件；不改 `asset.schema.json`；denoise/seed 局限披露照 M4 文档；不做表情/装备/换色系统；不做批量多角色；knight 结构不升级（attack 4f 不引入）。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `prototype-prompt`：角色生成编排（双 master + 派生档 + 阶段门 + guardian 行为不变）。
- `character-asset`：生成式角色创建 + 派生槽父图溯源。
- `prototype-import`：角色创建段（56 槽 + 母版 + 表 + tres）。
- `web-bridge`：通用 edit 草稿端点 + 创建作业 character 类型 + parent 链校验。

## Impact

- 改动：`tools/img2img-providers.mjs`（编排泛化）+ `tools/asset-create.mjs`（character 变体）+ `tools/server.mjs`（edit 端点 + create 扩展 + parent 校验）+ web 向导角色模式 + verify 扩展 + docs。
