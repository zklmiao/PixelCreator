# Tasks — text-to-asset

## 主控 prep（先落，主控独占）

- [x] P1 gen manifest 契约冻结（design §gen manifest 契约：字段/路径/sha12 校验规则）。
- [x] P2 提案/design/tasks/双卡 + 3 spec delta 入库（.openspec.yaml）。
- [x] P3 docs：milestones M5 行 + backlog C3 状态刷新。

## wt-A 管线轴（`feat/m5a-pipeline`；拥有 tools/** + tests（placeholder 除外）+ server.mjs；禁碰 web/**、docs/**、openspec/**、assets/**、fixtures/**、placeholder.test）

- [ ] A1 txt2img 适配层：`generateImage` 三适配器（SD `/sdapi/v1/txt2img` / Gemini text-only+IMAGE / OpenAI images/generations）；共用 env/status/错误契约；单测注入 fetch mock 断言请求形状/响应解析/未配置报错/无密钥泄漏；grep 单测无真实网络调用。
- [ ] A2 动态注册：server 注册表（扫描 ∩ validateAsset，confirm 后失效重扫）+ `GET /api/assets` + `assertAssetId` 改查表（UNKNOWN_ASSET 契约不变）；verify-bridge 扩展（列表形状、半成品目录不现身、unknown id 400）。
- [ ] A3 创建管线 + 端点：`tools/asset-create.mjs`（gen manifest → 骨架/8 视图/2 母版/fixtures 源图/gen manifest/2 表 2 map；ID_EXISTS 拒覆盖）+ `POST /api/txt2img`、`POST /api/asset/create`（两段写）；import-prototype 公共段抽取（`--src`/`--map` 行为字节不变，既有 import 测试回归证明）；确定性：临时目录以提交 fixtures+manifest 重跑字节一致；asset-create.test.mjs（合成 8 张确定性草稿 PNG，不联网）。
- [ ] A4 提交：单 commit 含 `feat(m5a)`（gate：`git log main --format=%s | grep -m1 "feat(m5a)"`）。

## wt-B 呈现轴（`feat/m5a-wizard`；拥有 web/** + docs/** + verify 扩展；禁碰 tools/**（server.mjs 只读）、assets/**、fixtures/**、openspec/**）

- [ ] B1 向导 UI：资产库"+ 新建资产"卡 → 向导面板（表单 kind 动态/size 档过滤/自由文本补充 + buildPrompt 预览含 prompt_hash）+ 8 格进度墙（草稿缩略 + 量化对比 + 单格重试/确认）+ "创建资产"总确认（复用两段写确认条）；无桥/无 provider 显式禁用；character 选项本 change 隐藏。
- [ ] B2 注册表接线：asset-shell `loadAssetRegistry()`（bridge 拉取 / 无桥回退冻结 7）+ 卡片墙/切换器消费；`verify-static`/`verify-real-import` 断言改"必须包含冻结 7"；`docs/text-to-asset.md`（流程 + gen manifest + 一致性局限披露）。
- [ ] B3 尾巴（gate 后）：rebase → 向导/注册表浏览器自证 → 全套 DoD 重跑 → 补发尾巴报告。

## 主控集成（不派工）

- [ ] M1 评审双支（协议抽查：generateImage 请求形状 vs provider 官方文档；动态注册回归：冻结 7 + 半成品过滤）→ 依次 --no-ff 合并 → 勾 tasks → agent-log → milestones → sync/archive → change 2 prep。
