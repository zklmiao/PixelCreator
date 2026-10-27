# 任务卡 — wt-B 呈现轴（M5a / text-to-asset）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-B`（只在此目录内改）。
- 分支：`feat/m5a-wizard`，自主控基点 commit 新建（基点以提交主题核对：`chore(contract): m5 card review fixes (m5-prep-fix)`；其历史含 contract 冻结 `chore(contract): freeze text-to-asset plus text-to-character proposals (m5-prep)`；具体 sha 随下发消息给出）。
- 独立会话：本卡是唯一依据；歧义按字面做并在报告注明。

## 2. 背景（一段）

M5a 交付后页面要有"描述一句 → 得到一个静态资产"的向导：资产库"+ 新建资产"卡（轮 8 埋的占位）变成真入口——表单（id/kind/size 档/object/colors/vibe/seed/自由文本）→ buildPrompt 预览（含 prompt_hash）→ 8 格进度墙（逐格 txt2img 草稿：量化前后对比、单格重试、确认）→ "创建资产"总确认（一个原子作业）。同时卡片墙/切换器改吃 `/api/assets` 动态注册表（无桥回退冻结 7）。红线：web/lib 零第三方依赖；无桥/无 provider 显式禁用不崩；缺格不可导出语义不破。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1                 # 预期：m5-prep-fix 提交（主题同 wt-A 卡 §1）
node --test tools/*.test.mjs         # 预期：182/182
node web/verify-static.mjs           # OK（7 shells）
node web/verify-real-import.mjs      # OK
```

## 4. 任务与验收

- [ ] **B1 向导 UI**。资产库"+ 新建资产"卡 → 向导面板：表单（id 客户端预检 `^[a-z0-9_]+$` + kind 四静态类 + size 档按 kind 过滤 + 静态字段 object/colors/vibe + seed + 自由文本补充）；`buildPrompt`（web/lib/prompt.js 静态路径）实时预览 positive/negative/prompt_hash；8 格进度墙每格调 `POST /api/txt2img` 两段写（预览 → 确认落草稿），展示源草稿与量化结果对比（数据源 = txt2img 确认响应的 compare 链接，wt-A 契约）；单格重试覆盖同路径；8/8 后"创建资产"总确认调 `POST /api/asset/create`；成功后卡片墙刷新（注册表）。无桥 → 向导入口禁用 + 说明；provider 未配 → 生成按钮禁用 + PROVIDER_NOT_CONFIGURED 文案。character 选项本 change 隐藏（change 2 解锁）。
- [ ] **B2 注册表接线 + verify + docs**。`asset-shell` 增 `loadAssetRegistry()`（bridge `/api/assets`，失败回退冻结 7）；卡片墙/切换器消费注册表；`verify-static`/`verify-real-import` 断言从"恰好 7"改"必须包含冻结 7"（报告逐条列出改动行）；`docs/text-to-asset.md`：向导流程 + gen manifest 契约 + 一致性局限披露（人审不魔法）。verify-bridge 归 wt-A，不改。
- [ ] **B3 尾巴（gate 后）**。rebase 到新 main（含 `feat(m5a)`）→ 浏览器自证（向导全流程 + 动态卡片墙 + 两条降级路径；报告写 agent 自证，不写"人工已看"）→ 全套 DoD 重跑 → 按 §8 补发尾巴报告。

## 5. 拥有 / 禁改

- 可写：`web/**`（app.js/index.html/styles.css/lib/**）、`docs/**`、`web/verify-*.mjs`。
- 禁碰：`tools/**`（server.mjs 也只读）、`assets/**`、`fixtures/**`、`openspec/**`、`package.json`、`web/verify-bridge.mjs`（归 wt-A）。web/lib 保持零第三方依赖。

## 6. 守则

同项目铁律；浏览器侧不引第三方库；两段写确认条复用既有组件；值断言优先；node 内正斜杠。

## 7. DoD（全绿，输出粘贴进报告）

```
node --test tools/*.test.mjs
node web/verify-1.1.mjs
node web/verify-4.1.mjs
node web/verify-4.2.mjs
node web/verify-5.2.mjs
node web/verify-static.mjs           # 含注册表新断言
node web/verify-real-import.mjs      # 含注册表新断言
node web/verify-bridge.mjs
node engine-placeholder/godot-atlas/verify-recipe.mjs
```

外加：浏览器自证清单（向导 8 格流程 + 无桥降级 + 无 provider 降级 + 动态卡片墙）。

## 8. 完成报告格式

```
基点：prep <sha>（主题确认）
分支/sha：feat/m5a-wizard @ <sha>（rebase 后含 feat(m5a) 确认 + gate 输出粘贴）
B1：向导文件/行号；8 格流程断言；降级路径输出
B2：registry 断言行号；verify 语义改动行；docs 章节行号
DoD：逐条输出粘贴
偏离/遗留：无则写"无"
```
