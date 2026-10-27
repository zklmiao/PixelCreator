# Tasks — text-to-character

## 主控 prep（change 1 归档后执行，主控独占）

- [x] P1 角色 gen manifest 契约冻结（parent 链字段 + PARENT_STALE 规则，见 design）。
- [x] P2 提案/design/tasks/双卡 + 4 spec delta 入库（.openspec.yaml）。
- [x] P3 docs：milestones M5 状态刷新。

## wt-A 管线轴（`feat/m5b-pipeline`；拥有 tools/** + tests（placeholder 除外）+ server.mjs + web/verify-bridge.mjs（仅桥断言）；禁碰 web/**（verify-bridge.mjs 除外）、docs/**、openspec/**、assets/**、fixtures/**、placeholder.test）

- [ ] A1 编排泛化：通用角色编排（双 master txt2img → 方向派生 0.55 → 端点帧派生 → inbetween 0.3；id/结构参数化）；`orchestrateGuardianMid/Td` 委托通用实现——guardian 导入段（fixtures → 槽位）字节稳定回归为硬验收（fixtures/map 零改动证明）。
- [ ] A2 角色创建 + 端点：asset-create character 变体（骨架 24 clips + 56 视图 + 2 母版 + 56 源图 + gen manifest + 6 Full + 4 Maker 表 + tres；ID_EXISTS 拒）+ `POST /api/img2img/edit`（通用草稿，两段写，确认响应附 compare 链接同 M5a 模式）+ `/api/asset/create` character 类型 + 服务端 parentSha12 全量校验（PARENT_STALE 400）。
- [ ] A3 hash/parent 语义 + 测试：派生槽双真值（prompt_hash + 父图 sha12）；asset-create.test.mjs 角色全链（合成确定性草稿，含 stale parent 用例）；确定性重跑字节一致。
- [ ] A4 提交：单 commit 含 `feat(m5b)`（gate：`git log main --format=%s | grep -m1 "feat(m5b)"`）。

## wt-B 呈现轴（`feat/m5b-wizard`；拥有 web/** + docs/** + verify 扩展；禁碰 tools/**（server.mjs 只读）、assets/**、fixtures/**、openspec/**）

- [ ] B1 四阶段向导：kind=character 切角色 10 字段（class/body/outfit/colors/weapon/hair/cape/vibe/seed + 自由文本）；四阶段进度墙（master 2 → idle 6 → walk 24 → attack 24）；阶段门（当批全确认解锁下一批）+ stale 标红一键重派生 + 上游重试级联二次确认（明示作废张数）；总确认原子创建；调用预算 56 次明示。
- [ ] B2 verify + docs：verify 扩展（向导角色段 DOM/阶段门/降级断言）；`docs/text-to-character.md`（流程/预算/一致性披露/与 guardian 存量的关系）。
- [ ] B3 尾巴（gate 后）：rebase → 浏览器自证 → 全套 DoD 重跑 → 补发尾巴报告。

## 主控集成（不派工）

- [ ] M1 评审双支（guardian 字节稳定抽查 + PARENT_STALE 用例）→ 依次 --no-ff 合并 → 勾 tasks → agent-log → milestones M5 收官 → sync/archive。
