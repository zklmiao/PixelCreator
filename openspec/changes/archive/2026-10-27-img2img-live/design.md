# Design — img2img-live

## Context

See proposal. Baseline: main `ad258ff`, tests 143/143, 10 specs, 7 assets（guardian 24 clips / 40 视图，td=sd 占位；walk/attack 各 2 帧）。共识来源：用户 grilling 12 问（Q1/3/7/8/9/10/11/12 已拍板）。

## Goals / Non-Goals

**Goals**: 三层 provider 实调 + guardian 补帧（2→3）+ td 真源替换 + JPEG 框选导入 + hash 语义定案；离线基线与字节确定性铁律不破。

**Non-Goals**: ComfyUI 图协议；页内向导；新依赖；色板/静态资产变更；knight（synth 样例不动）。

## Decisions

- **AI = 导入源**（保命原则）：AI 输出采纳即提交（fixtures/槽位），管线对提交输入字节确定；测试永联网=红（适配器网络调用仅发生在显式 CLI/桥触发，verify 与单测用已提交 fixtures 断言）。
- **Provider 抽象**：`editImage({ image, prompt, negative, tier, seed, size }) → PNG buffer`。tier ∈ {direction 0.5–0.6, frame 0.25–0.35} 由适配器映射：SD-WebUI 直转 denoise 参数；Gemini/OpenAI 无原生 denoise——映射为图像编辑提示强度措辞 + 可用 strength 参数，**局限写入 docs**（denoise 档语义在无该参数的服务上退化为提示词层）。seed：SD 原生整数；Gemini/OpenAI 尽力传参、不支持则记录"provider 不支持 seed"于 job 元数据——**种子锁语义降级如实披露，不假装**。
- **端点与安全**：桥新增 `GET /api/img2img/status`（configured: provider 名列表，无密钥回显）与两个 POST 作业（inbetween / derive-td），走既有两段写（preview → confirm → `.backup/`）；串行队列照旧；图片入参限 4096px / 8MB。
- **guardian 补帧编排**：对每方向 [f1, f2] 调 inbetween（prompt 用 ACTION_SENTENCES + "in-between pose"；tier frame）→ 产出 64px 级源 PNG 落 `fixtures/guardian/mid/guardian_{persp}_{dir}_mid.png` → 导入管线写入新中间槽。命名：walk/attack 重排为 1,2,3（旧 f2 内容成帧 3，新 AI 帧为帧 2）——asset.json 帧数 2→3（prep 冻结结构，wt-A 授权落盘）；`guardian-map.json` 宣言更新 [f1, ai-mid, f2]；attack 保持逆序差异 [f2, ai-mid, f1]。distinctness 断言升级：3 帧两两不同（AI 帧与两端源像素必然不同，测试钉死）。
- **td 派生编排**：sd 各视图（20 次 derive 调用，每 sd 视图一次）经 derive（td 基模板 prompt + direction tier）→ `fixtures/guardian/td/*.png` → 量化落 28 td 槽（4 idle + 12 walk + 12 attack，镜像 sd 结构；td 与 sd 允许像素不同；**删除 td==sd 占位测试**是 character-asset 条款的既定移除动作）；矩阵/拼表/tres 零改动消费。td 源溯源由 `guardian-map.json` 的 `tdProvenance` 标记承载（offline-standin-vertical-flip / ai-derived + upgradedSlots）。若某方向派生失败（provider 不可用），该轮不落盘、占位测试保留至重试成功——**移除是一次性原子动作，不留半态**。
- **hash 语义**：schema 加可选 `source_hash`（源 PNG SHA256 前 12 hex）；`prompt_hash` 语义收窄为"prompt 派生帧的模板哈希"。存量：potion 8 槽、guardian 40 槽的 `"pending"` 替换为对应 source_hash（主控 prep 冻结规则，wt-A 执行回填 + validator 分支）。
- **JPEG/框选（wt-B）**：`<input accept="image/png,image/jpeg,image/webp">` → canvas 解码绘制 → 矩形 marquee（指针事件，零依赖）→ `canvas.toBlob('image/png')` 走既有 `/api/import`。tools 保持 pngjs-only（解码在浏览器，桥收到的恒为 PNG）。
- **轴分工**：wt-A = tools/img2img-providers.mjs、server.mjs 端点、guardian 再生成（补帧+td+hash 回填+sheets+tres）、schema/validator 分支实现、fixtures、单测；wt-B = 框选 UI、provider 状态面板（读 status 端点）、补帧/派生按钮接线、docs（含 denoise/seed 局限披露）、verify 扩展。schema 与 guardian asset.json 结构由主控 prep 冻结。

## Risks / Trade-offs

- [Gemini 图像编辑输出尺寸不定] → 请求固定输出档并中心 pad 到资产档（复用 quantizeGeometry），实测不行则记录并允许手动缩放后重试。
- [AI 中间帧风格漂移（与 f1/f2 不像）] → 采纳前人工过目（两段写确认条展示三帧对比）；质量不佳可整轮重试（seed 换挡），不阻塞管线。
- [seed 在部分 provider 不可锁] → job 元数据如实记录；docs 披露；不伪造确定性。
- [网络失败半途] → 两段写语义：未 confirm 前零落盘；confirm 后逐文件写、失败即停并保留备份。

## Migration Plan

prep（schema + guardian 帧结构冻结 + 提案）→ 双卡并行 → wt-A 合（gate `feat(m4)`）→ wt-B 尾巴（rebase + verify 重跑）→ 合 → 主控勾 tasks/agent-log/milestones M4/sync/archive。Rollback：revert 即回 ad258ff 状态（guardian 旧 40 视图与占位测试在 git 历史中）。

## Open Questions

- Gemini 图像编辑端点的确切参数面（生成实现时以官方文档为准，适配器内注释记录版本与日期）。
- OpenAI 兼容各家 images/edits 的字段差异——适配器允许每家一个 JSON 配置覆盖（env 注入），不逐家写代码。
