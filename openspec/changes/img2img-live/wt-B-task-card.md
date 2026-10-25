# 任务卡 — wt-B 呈现轴（轮 7 / img2img-live）

## 1. 工作区与分支

- 工作区：`E:\Agent\Proj\PixeCreator-wt-B`（只在此目录内改）。
- 分支：`feat/m4-crop`，自主控 prep commit 新建（基点以提交主题核对，同 A 卡；具体 sha 随下发消息给出）。
- 时序：主体与 wt-A 并行（provider 面板与按钮在 wt-A 端点未合前按 501/未配降级开发）；合并前等 gate（main 含 `feat(m4)`）→ rebase → 新端点联调 verify → 尾巴报告。

## 2. 背景（一段）

M4 给页面带来三件新交互：①JPEG/WebP 上传 + canvas 矩形框选裁切（解码在浏览器，桥收到的恒为 PNG，tools 保持 pngjs-only）；②provider 状态面板（读 `/api/img2img/status`，展示已配 provider 徽章与密钥边界说明）；③guardian 详情区的"补帧/派生 td"编排按钮（调桥两段写作业）。红线：`web/lib/*.js` 冻结、7 个 verify 不改一字（verify-bridge 由 wt-A 扩展）、旧功能零回归。

## 3. 现状自查（开工先跑，不符即停）

```
git log --oneline -1          # 预期：m4-prep
node --test tools/*.test.mjs  # 143/143（或 prep 实测计数）
7× node web/verify-*.mjs      # 全 OK
```

## 4. 任务与验收

- [ ] **B1 JPEG/框选**：`#b-import-file` accept 扩 `image/jpeg,image/webp`；非 PNG 先经 canvas 解码展示 + 矩形 marquee 框选（指针事件，零依赖，样式随像素主题）→ `toBlob('image/png')` → 既有 `/api/import`；不框选直接传 = 整图模式（现状保留）。验收：PNG 原路径行为零变化；JPEG 无框选可用；框选后上传的 blob 为 PNG（页面侧断言 type）。
- [ ] **B2 provider 面板 + 编排按钮**：面板读 status（已配徽章 + "密钥仅存于环境变量"说明 + 无配置时的配置指引折叠）；guardian（kind=character 且含 derive 能力标识时）详情区加两按钮调 `/api/img2img/inbetween|derive-td`，复用两段写确认条与 SSE 进度；未配 provider 时按钮点击显示显式错误不崩。docs（`docs/real-import.md` 扩展或新 `docs/img2img.md`）：三家 provider 的 env 配置表、denoise/seed 局限披露、离线回落声明。
- [ ] **B3 尾巴（gate 后）**：rebase → 真端点联调自证（status 徽章渲染、未配报错路径、按钮→preview→cancel 零落盘）→ 全套 DoD 重跑 → 报告。

## 5. 拥有 / 禁改

- 可写：`web/**`（lib 冻结除外）、`docs/**`；禁碰 `tools/**`、`assets/**`、`fixtures/**`、`openspec/**`、7 个 verify 脚本、`package.json`。

## 6. 守则

同项目铁律；`web/lib` 零依赖零改动；值断言优先；agent 自证不写"人工已看"。

## 7. DoD（全绿，输出粘贴；rebase 后重跑）

```
node --test tools/*.test.mjs
7× node web/verify-*.mjs       # 含扩展后的 verify-bridge（wt-A 侧）
本地 server agent 自证：JPEG 上传→框选→PNG blob；status 面板；未配 provider 报错路径
git diff --stat -- web/lib/    # 空
```

## 8. 完成报告格式

```
基点：prep <sha>（确认）；rebase 到 main <含 feat(m4) 的 sha> + gate 输出
B1：accept 类型/marquee 实现要点/降级路径；PNG 原路径零回归证明
B2：面板与按钮文件行；docs 文件与披露章节行号
DoD：逐条输出粘贴
偏离/遗留：无则写"无"
```
