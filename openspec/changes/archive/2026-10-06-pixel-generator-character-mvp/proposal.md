# Proposal — pixel-generator-character-mvp

## Why

2D RPG 需要大量风格统一的像素人物（四方向 + 走/攻击动画），纯手绘太慢、纯 AI 生图四视图不一致且不可编辑。本 change 跑通“人物首闭环”：外部生图模型出原型 → 本项目像素化/派生/工程化/预览/拼表，沉淀一套可复用到武器/建筑/道具/景物的管线。

## What Changes

- Web 应用跑通人物首版：双视角（top-down + side-view）× 4方向（fr/bk/lf/rt）× 3组（idle/walk/attack）24 格全齐，每动作 2~5 帧，共 40~88 SVG + 2 母版。
- C1 派生管线：FRONT 母版 —img2img→ 4 方向 —帧继承→ walk/attack 关键帧；首版手动导入外部原型，预留一键调用位（不强制）。
- 像素量化管线：下采样到 32/48/64 + 欧氏最近色到 `palette_character@v1` + 人物 dither 锁 none + alpha<128 丢弃 + 强制正方形 pad + 每像素 rect 矢量化。
- SVG 工程：1 资产 = 2 母版 + N 视图 SVG + `asset.json` + 类色板引用；命名 `{asset}_{td|sd}_{action}_{dir}{N}.svg`；inner 分层 `body/limb-l/limb-r/outfit/weapon-slot`。
- 动画与预览：`asset.json` 存 fps/loop/next/clips；walk（loop,6fps）/attack（once→idle,8fps）；GIF 矩阵轮播 + td/sd 切换；缺格不可导出。
- 拼表导出：一动作一表，行序 fr/bk/lf/rt，无间距 1x；Maker 模式（强制 3 列，`$`命名）+ 完整模式（原帧数 + map.json）双模式；td/sd 永不合表。
- prompt 模板 v0.1：6 必填 + 4 可选字段拼英文；td/sd 基模板 + 方向/动作派生分句；方向派生 denoise 0.5~0.6、帧继承 0.25~0.35；全角色 seed 锁定；固定 negative 串。
- 武器/建筑/道具/景物：本 change 仅静态四视图占位 + 各一套色板初稿，不做动作矩阵与挂点绑定。

## Capabilities

### New Capabilities
- `character-asset`: 人物资产模型：双视角母版、四视图、24 格完整矩阵与校验、命名与目录结构。
- `animation-keyframes`: 关键帧模型：idle/walk/attack 定义、fps/loop/next、clip 存储、预览矩阵与缺格规则。
- `svg-engineering`: SVG 分层规范、母版/视图文件组织、导入导出、asset.json 清单。
- `pixel-quantize`: 像素化与色板量化：分辨率档、正方形 pad、透明规则、欧氏距离、dither 策略、5 套色板初稿。
- `spritesheet-export`: 拼表导出：一动作一表、行列序、Maker/完整双模式、map.json、td/sd 分表。
- `prototype-prompt`: 原型导入与 prompt 模板：外部原型导入、参考合集（风格+结构）、字段表、td/sd/方向/动作模板、negative 与参数、seed 约束。

### Modified Capabilities
- 无（空项目，无既有 specs）。

## Impact

- 全新 Web 前端（canvas 像素化 + SVG 工程管理 + GIF 轮播 + 拼表导出）；无需后端 LLM key 即可跑通首版（手动导入）。
- 新增本地 JSON 资产：5 套 palette（character/weapon/building/prop/scenery）、asset.json 清单、map.json。
- 参考实现：`resources/the-pixel-art`（阈值）、`resources/Image-to-Pixel-main`（彩色量化+抖动）、`resources/piskel-master`（拼表）、`resources/last-guardian-sprites`（命名与 4向×2帧惯例）。
