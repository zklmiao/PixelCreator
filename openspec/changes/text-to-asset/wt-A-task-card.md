# 任务卡 — wt-A 管线轴（M5a / text-to-asset）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-A`（只在此目录内改）。
- 分支：`feat/m5a-pipeline`，自主控基点 commit 新建（基点以提交主题核对：`chore(contract): m5 card review fixes (m5-prep-fix)`；其历史含 contract 冻结 `chore(contract): freeze text-to-asset plus text-to-character proposals (m5-prep)`；具体 sha 随下发消息给出）。
- 独立会话：本卡是唯一依据；歧义按字面做并在报告注明。

## 2. 背景（一段）

M5a 打通"文生静态资产"：provider 层补 `generateImage`（txt2img，三适配，env-only），资产 allowlist 从冻结 7 动态化（扫描 ∩ validate），`tools/asset-create.mjs` 从 gen manifest 原子创建静态资产全套，桥加 `/api/assets` + `/api/txt2img` + `/api/asset/create` 三端点。红线：AI 是导入源（确认即提交，管线对提交输入字节确定）；测试/verify 永不联网；仓库零密钥；只新增资产目录、绝不覆盖已有 id。角色（`text-to-character`）是下一笔 change，不在本卡。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1                 # 预期：m5-prep-fix 提交（主题见 §1）
node --test tools/*.test.mjs         # 预期：tests 182, pass 182, fail 0
node web/verify-bridge.mjs           # 预期：OK（30 项）
node tools/asset-manifest.mjs validate assets/knight_001/asset.json --check-files   # OK
```

## 4. 任务与验收（引用 spec delta）

- [ ] **A1 txt2img 适配层**。spec（prototype-prompt ADDED）：*"text-to-image generation (`generateImage`) behind the same provider registry and environment-only configuration as img2img editing … tests and verify scripts SHALL never perform network calls."* 做法：`generateImage({prompt, negative, size, seed}, {env, fetch}) → {buffer, meta}`；SD-WebUI `/sdapi/v1/txt2img`（prompt/negative_prompt/width/height/seed）；Gemini `contents:[{parts:[{text}]}]` + `responseModalities:['IMAGE']`；OpenAI `POST {base}/images/generations`（prompt/size/n=1/b64_json）。无 denoise/tier；seed 不支持 → meta.notes 披露。单测注入 fetch mock 断言请求形状/响应解析/未配置报错（PROVIDER_NOT_CONFIGURED）/错误文本无密钥。
- [ ] **A2 动态注册**。spec（web-bridge ADDED）：*"derive the served asset set by scanning `assets/*/asset.json` and admitting only manifests that pass validation … `GET /api/assets` (read-only …)"*。做法：注册表（启动建表 + 写作业 confirm 后失效重扫）+ `/api/assets` + `assertAssetId` 查表（UNKNOWN_ASSET 契约与文案不变）。验收：verify-bridge 扩展——列表形状、无效清单目录不现身、unknown id 400。
- [ ] **A3 创建管线 + 端点**。spec（prototype-import ADDED）：*"creating a complete static asset … in one atomic step from a committed generation manifest, assigning `prompt_hash` … and `source_hash` … as real values … SHALL refuse to overwrite an existing asset id … byte-identical."* 做法：`tools/asset-create.mjs`（gen manifest → 骨架 + 8 视图 + 2 母版[fr 内容 + master 标记] + `fixtures/<id>/` 源图 + `<id>-gen.json` + 2 单帧表 + 2 map；ID_EXISTS 拒）；`POST /api/txt2img`（草稿：确认落 `prototypes/<id>/gen/{persp}_{dir}.png`，确认响应附 compare 链接——复用既有 `/api/jobs/:id/compare` 模式）+ `POST /api/asset/create`（原子）；import-prototype 量化/色板/矢量化公共段抽取（`--src`/`--map` 行为字节不变——既有 import 测试回归证明）。验收：asset-create.test.mjs 用测试内确定性合成的 8 张 PNG 走全链（临时目录，fixtures 零提交守禁碰）+ 同输入两次创建字节一致 + ID_EXISTS；桥端点两段写 preview 零落盘。
- [ ] **A4 提交**：单 commit 含 `feat(m5a)`（gate：`git log main --format=%s | grep -m1 "feat(m5a)"`）。

## 5. 拥有 / 禁改

- 可写：`tools/*.mjs` + `tools/*.test.mjs`（placeholder 除外）、`tools/server.mjs`、`web/verify-bridge.mjs`（仅桥相关断言）。
- 禁碰：`web/**`（verify-bridge.mjs 除外）、`docs/**`、`openspec/**`、`assets/**`、`fixtures/**`、`palettes/**`、`package.json`、`tools/placeholder.test.mjs`。schema 零变更。

## 6. 守则

同项目铁律：确定性（生成物工具写、禁手改）；仓库外临时目录做实验；不联网（单测/verify 永不真实联网）；值断言优先；env 密钥不打印；node 内正斜杠。

## 7. DoD（全绿，输出粘贴进报告）

```
node --test tools/*.test.mjs          # ≥182（新增 asset-create/适配层测试）
node web/verify-bridge.mjs            # 含新端点断言
7× node tools/asset-manifest.mjs validate assets/<id>/asset.json --check-files   # 全 OK（冻结 7 存量零回归）
```

外加：临时目录 asset-create 重跑字节一致输出；`--src`/`--map` 回归（既有 import 测试全绿）证明。

## 8. 完成报告格式

```
基点：prep <sha>（主题确认）
分支/sha：feat/m5a-pipeline @ <sha>（含 feat(m5a) 确认）
A1：三适配器请求形状断言清单；mock 边界证明（grep 无真实 URL）；seed 局限披露位置
A2：注册表语义（扫描∩validate/失效时机）；verify-bridge 新断言输出
A3：asset-create 产物清单；ID_EXISTS 证明；确定性重跑输出；import 回归结论
DoD：逐条输出粘贴
偏离/遗留：无则写"无"
```
