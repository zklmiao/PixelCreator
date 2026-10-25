# img2img 实调指南（M4 / img2img-live）

本页说明如何在服务端配置外部生图 provider、以及 AI 编排（guardian 补帧 / td 派生）的能力边界。

## 1. 密钥边界（必须先读）

- 密钥**只存在于服务端环境变量**；浏览器页面通过 `GET /api/img2img/status` 只能看到**已配置 provider 的名字**，永不接触密钥内容（frozen：web-bridge delta "Status never leaks secrets"）。
- 所有 img2img 写操作走既有两段写：**预览（零落盘）→ 确认 → 自动备份 → 写入**；未确认时磁盘零变化。

## 2. Provider 配置表

| provider | 形态 | 环境变量（服务端注入） | denoise 档（direction 0.5–0.6 / frame 0.25–0.35） | seed |
|---|---|---|---|---|
| SD-WebUI | 本地服务（自建） | 服务地址 + 端口（如 `SDWEBUI_URL`） | 直转 denoise 参数 | 原生整数，可锁 |
| Gemini | 云端 API | `GEMINI_API_KEY`（+可选 JSON 覆盖 `GEMINI_CONFIG`） | 无原生参数 → 映射为编辑提示强度措辞 | 尽力传参，不支持则如实记录 |
| OpenAI | 云端 API | `OPENAI_API_KEY`（+可选 JSON 覆盖 `OPENAI_CONFIG`） | 同上（提示强度层） | 尽力传参，不支持则如实记录 |

> 精确变量名以 `tools/img2img-providers.mjs`（wt-A 交付）为准——适配器允许每家一个 JSON 配置覆盖（env 注入），不逐家写代码。未配置任何 provider 时，`/api/img2img/status` 返回空列表，页面编排按钮显式禁用。

## 3. 能力边界与局限（如实披露，不假装）

- **denoise 语义退化**：SD-WebUI 上 denoise 档是真参数；Gemini/OpenAI 上退化为"编辑提示强度措辞"，方向档（0.5–0.6）与帧档（0.25–0.35）的差异只能靠提示词表达——产出可能与档位预期有偏差，采纳前请过目三帧对比。
- **seed 不可锁**：Gemini/OpenAI 不支持则 job 元数据记录"provider 不支持 seed"；同输入重跑结果可能不同（AI 输出采纳即提交，采纳前可整轮重试换 seed）。
- **输出尺寸**：请求固定输出档并中心 pad 到资产档；provider 输出尺寸不定时按此兜底。

## 4. 离线回落

未配置任何 provider 或网络不可用时：页面编排按钮显式报错，**手动导入路径（M2 已交付）始终可用**——外部生图工具产出图 → 浏览器上传（JPEG/WebP 页内框选）或 `prototypes/<id>/input.png` → 一条命令导入。离线基线不破。

## 5. AI 帧采纳原则

AI 输出采纳即提交（进 fixtures/槽位后管线对其字节确定）；采纳前人工过目（两段写确认条展示对比），质量不佳可整轮重试（换 seed / 换 provider）。
