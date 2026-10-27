# Design — text-to-asset

## Context

Baseline: main `f471615`，tests 182/182，7 verify + recipe 全绿，10 specs，冻结 7 id（`web/lib/asset-shell.js` + server `assertAssetId` 双处），provider 层仅 `editImage`（img2img）。共识来源：M5 grilling 15 问（本 change 承 Q1–Q10，Q11–Q15 归 `text-to-character`）。

## Goals / Non-Goals

**Goals**: txt2img 三适配（SD-WebUI 首验收）；动态资产注册；gen-manifest 驱动的原子静态资产创建；页内向导（逐格过目 + 总确认）；双 hash 溯源。

**Non-Goals**: 角色（change 2）；schema 变更；色板/量化变更；Zhipu 原生（backlog C2）；仓库落真实 AI 资产。

## Decisions

- **generateImage 接口**（Q2）：`generateImage({prompt, negative, size, seed}, {env, fetch}) → {buffer, meta:{provider, model?, seedSupported, seed, notes}}`。SD-WebUI `/sdapi/v1/txt2img`（prompt/negative_prompt/width/height/seed 原生；sampler 等走服务端默认并在 notes 记录）；Gemini `contents:[{parts:[{text}]}] + responseModalities:['IMAGE']`；OpenAI `POST {base}/images/generations`（prompt/size/n=1，b64_json）。无 denoise/tier（无输入图）——不假装有；seed 不支持 → notes 披露。错误契约复用 editImage（PROVIDER_NOT_CONFIGURED / PROVIDER_ERROR / BAD_REQUEST），错误文本永不含密钥。
- **动态注册**（Q6）：server 维护注册表 = 扫描 `assets/*/asset.json` ∩ `validateAsset` 通过，启动建表、写作业 confirm 后失效重扫；`GET /api/assets → {ok, assets:[{id, kind, size}]}`；`assertAssetId` 改查注册表（`UNKNOWN_ASSET` 错误契约与文案不变）。web `asset-shell` 增 `loadAssetRegistry()`：bridge 在场拉 `/api/assets`，失败/无桥回退冻结 7；卡片墙与切换器消费注册表。`verify-static`/`verify-real-import` 断言改为"必须包含冻结 7"（动态新增的资产不得破坏冻结基线）。
- **8 次独立文生**（Q7）：每方向一次调用（td/sd × fr/bk/lf/rt），prompt = `buildPrompt`（kind-aware 静态路径）+ 自由文本补充句；单 seed 锁全 8 张；请求 provider 最大方形 ≤1024，管线 `quantizeGeometry` fit 到 size 档。不做镜像/派生捷径（非对称物体会穿帮，Q7 明确拒绝）。
- **两段写草稿 + 原子创建**（Q4/Q5/Q9）：每格 `POST /api/txt2img` 作业（预览零落盘 → 确认写 `prototypes/<id>/gen/{persp}_{dir}.png`，gitignored，同路径覆盖即重试）；8/8 满意后 `POST /api/asset/create` 单作业原子写 asset.json + 8 视图 + 2 母版 + `fixtures/<id>/{td,sd}/*.png` + `<id>-gen.json` + 2 表 + 2 map。目标 id 已存在 → `ID_EXISTS 400`，绝无覆盖。
- **创建管线与确定性**：`tools/asset-create.mjs` 读 gen manifest → 写骨架 → 复用 import-prototype 的量化/色板/矢量化段落槽（抽公共函数，`--src`/`--map` 行为字节不变，既有 import 测试回归证明）→ 导出单帧表。回归测试：临时目录以提交的 fixtures+manifest 重跑与首次产物字节一致。`masters` = fr 内容 + `data-master` 标记（guardian 约定）；骨架字段：idle-only、fps 2、loop true、preview td/idle/fr、palette `palette_{kind}@v1`、size 按 kind 档。
- **gen manifest 契约**（prep 冻结）：`{ assetId, kind, size, palette, seed, generator: {interface:"txt2img", provider, model|null, createdAt, notes?}, slots: { "<svg 文件名>": { source, prompt, negative, seed, promptHash, retries } } }`——`source` 相对 `fixtures/<id>/`；`promptHash` = djb2(positive) 8 hex；创建时校验 source 文件存在且 sha12 与 slot `source_hash` 一致。
- **双 hash**（Q8）：新 slot `prompt_hash`（djb2，synth 同源）+ `source_hash`（sha12 源图，导入同源）都为真值；validator 零改动（现有字段已容纳）。
- **向导**（Q3/Q10）：资产库区"+ 新建资产"卡 → 向导面板；表单字段按 kind 动态（静态 4 类；character 选项本 change 隐藏、change 2 解锁）；进度墙每格 = 草稿缩略 + 量化前后对比 + 重试/确认；总确认条复用既有确认组件；无桥 → 向导入口禁用 + 说明；`/api/img2img/status` 未配 provider → 生成按钮禁用 + `PROVIDER_NOT_CONFIGURED` 文案。
- **轴分工**：wt-A = tools（generateImage / asset-create / server 注册表与端点）+ tests；wt-B = web 向导 + verify 语义/扩展 + docs（`docs/text-to-asset.md`）。schema 零变更；web/lib 仍零第三方依赖。

## Risks / Trade-offs

- [模型不懂像素网格] → 量化/色板兜底 + 向导量化前后对比人工拍板；不接受自动采纳。
- [8 张之间风格漂移] → seed 单锁 + 方向句固定 + 逐格过目/单格重试；docs 如实披露"一致性靠人审不靠魔法"。
- [动态注册让半成品目录现身] → validateAsset 门槛天然过滤（不完整资产不进列表、不可被消费）；loopback-only 不变。
- [SD-WebUI txt2img 参数面广] → 适配器只设 prompt/negative/size/seed，其余服务端默认；notes 记录，不逐家写配置。
- [草稿区残留] → `prototypes/` gitignored；创建成功后向导提示可手清草稿，不入库。

## Migration Plan

prep（gen-manifest 契约冻结 + 工件 + docs）→ 双卡并行 → wt-A 合（gate `feat(m5a)`）→ wt-B 尾巴（rebase + verify 重跑）→ 合 → 主控勾 tasks/agent-log/milestones → sync/archive → change 2 prep。Rollback：revert 回 `f471615`（冻结 7 与纯 img2img 状态在 git 历史）。

## Open Questions

- OpenAI 兼容各家 images/generations 字段差异——沿用 `PIXE_OPENAI_EXTRA` JSON 覆盖机制，不逐家写代码。
- SD-WebUI txt2img 默认 sampler/步数在各部署间不同——适配器不假设，notes 记录实际响应元数据（如有）。
