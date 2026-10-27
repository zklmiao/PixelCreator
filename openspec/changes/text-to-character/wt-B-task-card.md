# 任务卡 — wt-B 呈现轴（M5b / text-to-character）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-B`（只在此目录内改）。
- 分支：`feat/m5b-wizard`，自主控 prep commit 新建（prep 在 change `text-to-asset` 归档后执行；基点以提交主题核对，同 wt-A 卡 §1；sha 随下发消息给出）。
- 独立会话：本卡是唯一依据；歧义按字面做并在报告注明。

## 2. 背景（一段）

M5b 给向导开角色模式：kind=character 时表单切角色 10 字段（class/body/outfit/colors/weapon/hair/cape/vibe/seed + 自由文本），进度墙切四阶段流水（master 2 → idle 6 → walk 24 → attack 24），阶段门硬约束（当批全确认才解锁下一批；上游重试 → 下游 stale 标红一键重派生 + 级联二次确认明示作废张数），总确认一个原子创建作业；首页明示调用预算 56 次/角色。红线：web/lib 零第三方依赖；无桥/无 provider 降级显式；服务端阶段校验为准（客户端门只是引导）。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1                              # 预期：m5b-prep 提交
git log main --format=%s | grep -m1 "feat(m5a)"   # gate：change 1 已合（严式）
node --test tools/*.test.mjs                      # 以 prep 时主控实测为准
node web/verify-static.mjs                        # OK（含 m5a 注册表断言）
```

## 4. 任务与验收

- [ ] **B1 四阶段向导**。master 阶段 = 2 张 `POST /api/txt2img` 草稿（td/fr + sd/fr）；idle/walk/attack 阶段每格 = `POST /api/img2img/edit` 草稿（父图引用 + parentSha12 记录）；阶段门（当批全确认解锁下一批）；stale 检测（重跑父图后子草稿标红，一键重派生）；上游重试级联二次确认（明示作废张数）；总确认 `POST /api/asset/create`（character，两段写复用确认条）。
- [ ] **B2 verify + docs**。verify 扩展（向导角色段 DOM：表单切换/四阶段门/stale 流程/降级路径断言）；`docs/text-to-character.md`：流程 + 调用预算（56 次/角色）+ 一致性局限披露（人审密度）+ 与 guardian 存量编排的关系（专用端点保留不动）。
- [ ] **B3 尾巴（gate 后）**。rebase 到新 main（含 `feat(m5b)`）→ 浏览器自证（角色模式四阶段全流程 + stale 流程 + 两条降级路径；报告写 agent 自证）→ 全套 DoD 重跑 → 按 §8 补发尾巴报告。

## 5. 拥有 / 禁改

- 可写：`web/**`（app.js/index.html/styles.css/lib/**）、`docs/**`、`web/verify-*.mjs`。
- 禁碰：`tools/**`（server.mjs 也只读）、`assets/**`、`fixtures/**`、`openspec/**`、`package.json`。web/lib 保持零第三方依赖。

## 6. 守则

同项目铁律；浏览器侧不引第三方库；两段写确认条复用既有组件；值断言优先；node 内正斜杠。

## 7. DoD（全绿，输出粘贴进报告）

```
node --test tools/*.test.mjs
node web/verify-1.1.mjs
node web/verify-4.1.mjs
node web/verify-4.2.mjs
node web/verify-5.2.mjs
node web/verify-static.mjs
node web/verify-real-import.mjs
node web/verify-bridge.mjs
node engine-placeholder/godot-atlas/verify-recipe.mjs
```

外加：浏览器自证清单（角色模式四阶段全流程 + stale 流程 + 无桥/无 provider 降级）。

## 8. 完成报告格式

```
基点：prep <sha>（主题确认）
分支/sha：feat/m5b-wizard @ <sha>（rebase 后含 feat(m5b) 确认 + gate 输出粘贴）
B1：四阶段文件/行号；阶段门/stale 断言；级联二次确认输出
B2：verify 扩展行号；docs 章节行号
DoD：逐条输出粘贴
偏离/遗留：无则写"无"
```
