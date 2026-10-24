# Tasks — web-shell-v2

## wt-B 呈现轴（feat/web-shell-v2；拥有 web/index.html + web/app.js + web/styles.css；禁碰 web/lib/**、tools/**、assets/**、palettes/**、openspec/**、7 个 verify 脚本）

- [ ] B1 四区信息架构：资产库（默认，7 卡片网格 + idle 预览 + 详情矩阵含播放/暂停/步进与 td/sd 切换）／导入工作流（目标资产 → 上传/路径 → compare 预览 → 两段写）／导出中心（sheets/tres/validate 聚合 + 产物链接）／Prompt 工作台（表单收编改皮）；重复入口清零（导出与资产选择各一处）；用户可见文案无内部编号/契约术语。
- [ ] B2 像素复古主题：token 表（取自 palettes 实际色值）落地 styles.css；image-rendering: pixelated 全像素图；硬边框 + CSS 渐变像素网格背景；系统 monospace 栈；零依赖零资源文件零构建。
- [ ] B3 开发者面板：`<details>` 默认折叠，收纳 masters 槽位、shell 状态、bridge 原始 job 日志、术语表、verify 命令清单。
- [ ] B4 交互增强：compare 分隔拖动、128/64 同屏缩放对齐、矩阵播放控制。
- [ ] B5 全量回归 + 提交：`node --test tools/*.test.mjs` 142/142；7× verify 不改一字全绿；server 下 agent 自证（四区在场、面板默认收起、无术语泄漏、导出入口唯一）；单 commit，消息含 `shell-v2`（gate 判式 `git log main --format=%s | grep -m1 "shell-v2"`）。

## 主控集成（不派工）

- [ ] M1 评审（log/diff + 全套自检 + DOM 自证复核 + 术语泄漏抽查）→ --no-ff 合并；勾本 tasks；agent-log 追加轮 5；milestones 记 UI 重设计；web-cli-bridge 与本轮一起 sync/archive。
