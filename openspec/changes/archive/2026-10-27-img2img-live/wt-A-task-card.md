# 任务卡 — wt-A 管线轴（轮 7 / img2img-live）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-A`（只在此目录内改）。
- 分支：`feat/m4-live`，自主控 prep commit 新建（基点以提交主题核对：`chore(contract): freeze img2img-live schema, guardian frames, proposal (m4-prep)`；具体 sha 随下发消息给出）。
- 独立会话：本卡是唯一依据；歧义按字面做并在报告注明。

## 2. 背景（一段）

PixeCreator 管线已全绿（143/143、7 资产），但"AI 生图 → 像素资产"断在手动导入。M4 落三层 img2img 适配（Gemini / OpenAI 兼容 / 本地 SD-WebUI，env-only 配置）+ guardian 补帧（walk/attack 2→3 帧，AI 中间帧）+ td 真源派生（删除 td==sd 占位）+ hash 语义（`source_hash` 12 hex 替换全部 `"pending"`）。核心红线：**AI 是导入源不是运行时依赖**——产物采纳即提交，测试永联网即红。主控 prep 已冻结 schema（source_hash 可选字段）与 guardian 帧结构（walk/attack 各方向 3 帧槽，帧 2 为 AI 中间帧）。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1     # 预期：m4-prep 提交（主题见 §1）
node --test tools/*.test.mjs   # 预期：tests 143, pass 143, fail 0（prep 后基线，若 prep 动了 guardian 结构则以 prep 实测为准并报告）
node tools/asset-manifest.mjs validate assets/guardian_001/asset.json   # 预期：结构 OK（新帧槽 source_hash:null 允许；--check-files 红是预期，A3 落盘后转绿）
```

## 4. 任务与验收（引用 spec delta）

- [ ] **A1 适配层**：`tools/img2img-providers.mjs`——`editImage({image, prompt, negative, tier, seed, size}) → PNG buffer`；三适配器；`status()` 读 env（`PIXE_IMG_PROVIDER`/`PIXE_IMG_KEY`/`PIXE_OPENAI_BASE`/`PIXE_SD_URL`）；denoise 映射局限（Gemini/OpenAI 无原生参数 → 提示层强度 + 元数据披露；SD 直转）注释在码。验收：单测用注入 fetch mock，断言请求形状（URL/字段/auth 头）、响应解析、未配置报错、密钥不出现在任何错误文本；grep 单测无真实网络调用。
- [ ] **A2 桥端点**：spec（web-bridge ADDED）*"status returning configured provider names only (never key material)"* + 两写作业端点走既有两段写。验收：verify-bridge 扩展——status 形状断言、配 key 后响应不含 key 子串、inbetween preview 未 confirm 零落盘（git status 对照）。
- [ ] **A3 编排与再生成**（结构落盘在此原子完成——asset.json 帧结构 + 文件重命名/落盘 + 测试更新同一 commit）：
  目标结构（prep 冻结）：walk=[`{a}_{p}_walk_{d}1`(旧f1), `{a}_{p}_walk_{d}2`(AI 中间帧·新), `{a}_{p}_walk_{d}3`(旧f2改名)]；attack=[`{d}2`(旧f2), `{d}3`(AI 中间帧·新), `{d}1`(旧f1)]；idle 不变；td 槽镜像 sd 结构。hash：既有槽 `prompt_hash:"pending"` → `prompt_hash:null` + `source_hash:<源fixture SHA256 前12>`；AI 新槽两者皆 null 采纳后回填 source_hash。CLI `guardian-mid` / `guardian-td`（读 env provider；产物 PNG 落 `fixtures/guardian/{mid,td}/` 入库 → 量化落槽）；占位测试删除（原子）；3 帧 distinctness；asset.json 存量 `"pending"` → source_hash 回填（prep 规则）；sheets/tres 再生成；确定性：fixtures→槽位字节稳定回归。
- [ ] **A4 提交**：单 commit 含 `feat(m4)`（gate：`git log main --format=%s | grep -m1 "feat(m4)"`）。

## 5. 拥有 / 禁改

- 可写：`tools/*.mjs` + tests（placeholder 除外）、`fixtures/guardian/`（扩展）、guardian 资产落盘（SVG/sheets/godot）、`assets/guardian_001/asset.json` 仅按 prep 冻结结构填值（source_hash/文件引用），不改结构。
- 禁碰：schema、其他 assets JSON、`web/**`、`docs/**`、`openspec/**`、`package.json`、placeholder.test。

## 6. 守则

同项目铁律（确定性/零手改生成物/仓库外实验/不联网——单测与 verify 永不真实联网）；值断言优先；env 密钥不打印。

## 7. DoD（全绿，输出粘贴进报告）

```
node --test tools/*.test.mjs        # 计数以实际为准（≥143）
7× node tools/asset-manifest.mjs validate assets/<id>/asset.json --check-files   # 全 OK
node web/verify-bridge.mjs          # 含新端点断言
grep -rn "pending" assets/*/asset.json | wc -l   # 0（存量清零证明）
node tools/sheet.mjs export --asset guardian_001 --out sheets   # 重跑字节一致
```

外加：临时目录重跑 mid/td 编排的"导入段"（跳过网络，直接用已提交 fixtures）字节一致；td==sd 占位测试已删的 git diff 证明。

## 8. 完成报告格式

```
基点：prep <sha>（确认）
分支/sha：feat/m4-live @ <sha>（含 feat(m4) 确认）
A1：适配器/请求形状断言清单；mock 边界证明（grep 无真实 URL）
A2：端点清单；status 无密钥断言；preview 零落盘证明
A3：fixtures 清单；占位测试删除 diff 摘要；3 帧 distinctness；hash 回填计数（potion 8 + guardian 40+新槽）
DoD：逐条输出粘贴
偏离/遗留：无则写"无"
```
