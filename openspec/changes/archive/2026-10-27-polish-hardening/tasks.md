# Tasks — polish-hardening

## wt-A 管线轴（feat/hardening；拥有 tools/** + web/verify-bridge.mjs；禁碰 web 三文件/web/lib 行为）

- [x] A1 tools/kinds.mjs 单一来源（六消费方重接线，行为字节不变硬验收：knight synth 重生成 + guardian map 重导入 + 60 sheets 重导出全字节一致）。
- [x] A2 server.mjs 作业生命周期（done/error finishedAt + TTL 清理 + MAX_JOBS 驱逐 + SSE 清理）。
- [x] A3 TOCTOU 备份时点收紧（exec 时点逐路径重查存在性；HTTP 全链路单测）。
- [x] A4 clip-scoped generate（{assetId, clip} → willWrite 恰该 clip 帧集；UNKNOWN_CLIP 400；判别式毒化证明）。
- [x] A5 STATIC_PREFIXES += /prototypes/（gitignored 用户工作区回环可达）。
- [x] A6 verify-bridge 严格单次确认断言（删 ||202 逃逸）+ 首次 confirm 202 正向断言。
- [x] A7 全量回归 + 提交（182/182；gate feat(hardening)）。

## wt-B 呈现轴（feat/ui-polish；拥有 web 三文件；禁碰 web/lib 行为/tools）

- [x] B1 校验结果可见化 + 导出内容化（同一结果区：validate 三态 + willWrite 前 8 项 + 事实摘要行）。
- [x] B2 "生成此格"接 clip 参数（{assetId, clip}；合并前降级整资产——契约冻结在 web-bridge delta）。
- [x] B3 /prototypes/ 静态服务接线（缺失 graceful 提示；死路径文案移除）。
- [x] B4 Prompt 表单 kind 选择（character 10 字段 / 静态 object-colors-vibe 切换；character 路径字节不变护栏 verify-4.1）。
- [x] B5 UI 打磨包（compare 棋盘格衬底/分隔把手/卡片 hover/128 等高/确认条列表式 + SSE 分流）。
- [x] B6 提交（175/175 基线；gate 后 rebase 联调）。

## 主控集成（不派工）

- [x] M1 评审双支（字节一致突变抽查/浏览器降级实测/红线 diff）→ 依次 --no-ff 合并 → 勾 tasks → agent-log 轮 8 → milestones 轮 8 行 → backlog 刷新 → sync/archive。
