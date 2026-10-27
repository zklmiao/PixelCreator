# 任务卡 — wt-A 管线轴（M5b / text-to-character）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-A`（只在此目录内改）。
- 分支：`feat/m5b-pipeline`，自主控 prep commit 新建（prep 在 change `text-to-asset` 归档后执行；基点以提交主题核对：`chore(contract): freeze text-to-character parent-chain contract and proposal (m5b-prep)`；sha 随下发消息给出）。
- 独立会话：本卡是唯一依据；歧义按字面做并在报告注明。

## 2. 背景（一段）

M5b 把 guardian 专用编排泛化成任意新 id 可跑的角色生成链（双 master txt2img → 方向派生 0.55 → 端点帧派生 → inbetween 0.3，guardian 档 idle 1 / walk 3 / attack 3 = 56 视图），asset-create 出角色变体（骨架 24 clips + 56 视图 + 2 母版 + 56 源图 + gen manifest + 6 Full + 4 Maker 表 + tres），桥加通用 `POST /api/img2img/edit` 草稿端点并让 `/api/asset/create` 接受 character（服务端 parentSha12 全量校验，PARENT_STALE 拒创建）。红线：guardian/knight 存量零改动（字节稳定回归）；测试永不联网；派生槽 hash = prompt_hash + 父图 sha12；仓库零密钥。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1                              # 预期：m5b-prep 提交（主题见 §1）
git log main --format=%s | grep -m1 "feat(m5a)"   # gate：change 1 已合（严式）
node --test tools/*.test.mjs                      # 预期：以 prep 时主控实测为准（≥ m5a 归档数）
node tools/asset-manifest.mjs validate assets/guardian_001/asset.json --check-files   # OK
```

## 4. 任务与验收（引用 spec delta）

- [ ] **A1 编排泛化**。spec（prototype-prompt ADDED）：*"a reusable character orchestration (dual txt2img masters …, direction derivation …, endpoint pose derivation, and frame-tier in-betweens) parameterized by asset id …"*。做法：通用编排模块（id/结构/阶段参数化，每格 prompt/tier 按 design 决策表）；`orchestrateGuardianMid/Td` 保留签名委托通用实现——guardian 导入段（fixtures → 槽位）字节稳定回归为硬验收（fixtures/map 零改动 git diff 证明）。
- [ ] **A2 角色创建 + 端点**。spec（character-asset ADDED + web-bridge ADDED）：*"creating a complete character asset … in one atomic step … validating the full parent chain server-side …"*。做法：asset-create character 变体（ID_EXISTS 拒）+ `POST /api/img2img/edit`（通用草稿，两段写）+ create 扩 character + PARENT_STALE。
- [ ] **A3 hash/parent + 测试**。派生槽双真值（prompt_hash + 父图 sha12）；master 槽双真值（自身源图）；asset-create.test.mjs 角色全链（合成确定性草稿，不联网；含 stale parent 用例与 ID_EXISTS）；确定性重跑字节一致。
- [ ] **A4 提交**：单 commit 含 `feat(m5b)`。

## 5. 拥有 / 禁改

- 可写：`tools/*.mjs` + `tools/*.test.mjs`（placeholder 除外）、`tools/server.mjs`。
- 禁碰：`web/**`、`docs/**`、`openspec/**`、`assets/**`（guardian/knight 存量字节不动）、`fixtures/**`、`palettes/**`、`package.json`、`tools/placeholder.test.mjs`。schema 零变更。

## 6. 守则

同项目铁律；guardian 字节稳定是 A1 的硬验收（回归不过即打回）；仓库外临时目录实验；值断言优先；env 密钥不打印。

## 7. DoD（全绿，输出粘贴进报告）

```
node --test tools/*.test.mjs          # ≥ prep 基线
node web/verify-bridge.mjs            # 含 edit/create 新断言
node tools/asset-manifest.mjs validate assets/guardian_001/asset.json --check-files   # OK（字节稳定旁证）
node tools/asset-manifest.mjs validate assets/knight_001/asset.json --check-files     # OK
```

外加：guardian 导入段字节稳定输出（fixtures+map 零改动 diff）；临时目录角色创建重跑字节一致输出；PARENT_STALE 用例输出。

## 8. 完成报告格式

```
基点：prep <sha>（主题确认）
分支/sha：feat/m5b-pipeline @ <sha>（含 feat(m5b) 确认）
A1：通用编排参数面；guardian 委托回归输出；fixtures/map 零改动 diff 摘要
A2：角色创建产物清单（骨架/56 视图/2 母版/源图/manifest/10 表/tres）；PARENT_STALE 用例输出
A3：hash 语义断言清单；确定性重跑输出
DoD：逐条输出粘贴
偏离/遗留：无则写"无"
```
