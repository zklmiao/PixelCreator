# Tasks — img2img-live

## 主控 prep（先落，主控独占）

- [x] P1 schema 冻结：`assets/asset.schema.json` 加可选 `source_hash`（12 hex）；`prompt_hash` 语义注释收窄。
- [x] P2 guardian 帧结构规格冻结（design.md + A 卡 A3：walk=[fr1, fr2=AI中帧, fr3=旧f2改名]、attack=[fr2, fr3=AI中帧, fr1]、idle 不变、td 镜像 sd；hash 规则=源 fixture SHA256 前 12 hex 替换 pending、prompt_hash 置 null）。结构落盘由 A3 与文件/测试同一 commit 原子完成，prep 不造红基线。
- [x] P3 提案/design/tasks/双卡 + 3 spec delta 入库。

## wt-A 管线轴（`feat/m4-live`；拥有 tools/*.mjs + tests（placeholder 除外）+ fixtures/guardian/ 扩展 + guardian 再生成 + sheets/godot 再生成；禁碰 web/**、docs/**、openspec/**、placeholder.test）

- [x] A1 provider 适配层：`tools/img2img-providers.mjs`（gemini / openai-compat / sd-webui 三适配器 + status()）；env-only 配置；未配置 → status 列出且调用抛显式错误；单测用注入 fetch mock（无网络）值断言（请求形状/响应解析/错误路径）。
- [x] A2 桥端点：`/api/img2img/status`（无密钥回显）+ `/api/img2img/inbetween` + `/api/img2img/derive-td`（两段写语义：preview 列 willWrite；confirm 落盘 + 备份）；verify-bridge 扩展（status 形状、未配置 provider 的 inbetween 报错、preview 零落盘断言）。
- [x] A3 guardian 补帧 + td 真源：CLI 编排命令（`node tools/img2img-providers.mjs guardian-mid` / `guardian-td`，读 env provider）；产物 fixtures 入库 + 量化落槽；td==sd 占位测试删除（一次性原子）；3 帧 distinctness 断言；asset.json 存量 hash 回填（按 prep 规则）；sheets/tres 全量再生成；确定性回归（fixtures → 槽位字节稳定）。
- [x] A4 validator 分支 + 回归：source_hash 校验（12 hex 或 null）；`"pending"` 全库清零断言；全量测试 + 7 verify + 7× manifest；提交含 `feat(m4)`（gate）。

## wt-B 呈现轴（`feat/m4-crop`；拥有 web/** + docs/** + verify 扩展；禁碰 tools/**（server.mjs 除外只读）、assets/**、fixtures/**、openspec/**）

- [x] B1 JPEG/框选：accept 扩 jpeg/webp；canvas 解码 + 矩形 marquee（指针事件零依赖）+ toBlob PNG → 既有 /api/import；降级路径（无框选直接传整图照旧）。
- [x] B2 provider 面板 + 编排按钮：状态面板读 /api/img2img/status（已配 provider 徽章 + 密钥边界说明）；guardian 详情区加"补帧/派生 td"按钮（调桥作业，两段写确认条复用）；docs 落 denoise/seed 局限披露。
- [x] B3 尾巴（gate 后）：rebase → 新端点/按钮可用性 verify（未配 provider 时显式报错不崩）→ 全套 DoD 重跑 → 补发尾巴报告。

## 主控集成（不派工）

- [x] M1 评审双支（协议抽查：适配器请求形状 vs provider 官方文档；网络隔离抽查：单测 grep 无真实 URL 调用）→ 依次 --no-ff 合并 → 勾 tasks → agent-log 轮 7 → milestones M4 → sync/archive。web/verify-real-import.mjs 改动经对账追认归 wt-B 轴合并时审（wt-A 代行更新：td==sd 钉死断言与 character-asset REMOVED delta 冲突，对账见 wt-A 轮 7 整改报告）。
