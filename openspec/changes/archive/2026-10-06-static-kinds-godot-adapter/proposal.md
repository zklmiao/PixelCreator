# Proposal — static-kinds-godot-adapter

## Why

MVP 只跑通人物闭环：武器/建筑/道具/景物四类在 proposal 里只留了静态四视图占位与色板初稿、从未立项实现；同时 7.1 双表虽已落地 generic 直读占位，Godot 侧仍缺可执行的 AtlasTexture 导入配方（engine-placeholder §2 gap #13–#17 无落点）。本 change 一轮并走这两项，把管线从单人物扩展到 5 资产、把呈现从占位说明推进到配方级可用。

## What Changes

- 契约冻结（prep，主控预落，本轮不再改）：`assets/asset.schema.json` kind-aware（5 kind、kind→palette/size/action 规则），`assets/{sword_001,house_001,crate_001,tree_001}/asset.json` 四骨架（2 视角 × 4 方向 × idle 单帧静态占位，无 SVG、无表）。
- ①四类静态（wt-A 管线轴）：kind-aware `validateAsset` + 生成器/复验（确定性字节一致）+ 四资产 SVG 再生成 + 5 资产 manifest 全过；色板引用不内嵌；命名遵 `{asset}_{td|sd}_idle_{dir}0.svg`；`map.json` 与 sheet 导出不在本轮（静态无表，.tres 生成器留轮 2）。
- ④Godot 配方（wt-B 呈现轴）：`map.json` 零改动；交付可执行的 `engine-placeholder/godot-atlas/IMPORT-RECIPE.md`（覆盖 gap #13–#17 含缺省声明：texture_filter=nearest、anchor/offset 缺省、animation 命名 `{persp}/{action}/{dir}`、方向枚举映射、loop→loop_mode、speed_scale 缺省 1.0、hitbox/挂点声明无判定/缺省、version/generator/palette_ref/cell 追溯字段取自何处）+ `generic/` 扩展说明（静态资产如何沿用直读契约）；generic 新增文件须同步更新 `tools/placeholder.test.mjs` 精确文件集断言。
- 非目标：OKLCH（轮次②）、ordered-Bayer（③）、img2img 实调（⑤）、.tres 生成器（轮 2 管线轴）、idle 之外动作矩阵与挂点绑定。

## Capabilities

### New Capabilities
- `static-asset`: 非人物静态资产模型：四类 kind（weapon/building/prop/scenery）× 双视角 × 四方向 idle 单帧骨架、kind-aware 校验（palette/size/action 门控）、色板引用规则、确定性再生成。
- `godot-adapter`: Godot AtlasTexture 配方适配：map.json 零改下的导入配方（region/fps/loop/next 映射 + gap 缺省声明）、generic 直读扩展说明、配方可执行性校验。

### Modified Capabilities
- 无（既有 6 主 specs 不动；map.json 字段冻结）。

## Impact

- 新增/改动：`assets/asset.schema.json`（prep 已冻结，wt-A 只读）、`assets/{sword_001,house_001,crate_001,tree_001}/`（prep 骨架 → wt-A 补 SVG）、`tools/asset-manifest.mjs` + `tools/*.test.mjs`（wt-A）、`tools/vectorize.mjs` 生成器扩展（wt-A）、`engine-placeholder/godot-atlas/IMPORT-RECIPE.md` + `generic/` 说明 + `tools/placeholder.test.mjs`（wt-B）、`docs/**`（wt-B）。
- 零依赖新增，离线可跑；确定性铁律延续（同输入字节级一致）。
