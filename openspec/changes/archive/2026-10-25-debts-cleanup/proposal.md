# Proposal — debts-cleanup

## Why

轮 5 收官后的 code review 与启动阻塞 postmortem 留下四笔已确认欠账，另有一项用户拍板的视觉返工。全部为小改动，打包一轮清掉后 spec 与实现零偏差、M4（img2img-live）轻装开工。

## What Changes

- **静态单帧表补齐**：sword_001/crate_001（64 档，256×64）与 house_001/tree_001（128 档，512×128）各出 `*_td_idle.png`/`*_sd_idle.png` + map.json（spritesheet-export 静态单帧条款的既有欠账；工具已存在，仅执行并入库）。
- **svg-engineering 母版条款降格**：原 SHALL "the master retains infinite precision" 光栅导入管线下不可实现（母版与视图同为网格锁定 SVG）——降格为"母版与视图同为网格锁定，矢量精度待矢量源导入"，附移除条件（矢量源到达时单列 change 升级，guardian td 占位同款写法）。
- **Bayer 效果测试补齐**：现有测试只证明 ordered-Bayer 确定性与在板恒等，未证明"离板输入真的在抖"——新增 water 中点 ramp 测试（none 坍缩单色 / bayer 打散双色，探针依据注释在案）。
- **verify-bridge 模块可达性审计**（postmortem 预防项）：遍历 `web/app.js` 的静态 import 闭包，断言每个顶部目录都在 `STATIC_PREFIXES` 内——白名单再漏端点（如轮 5 的 `/tools/` 启动阻塞）时 verify 直接红。
- **UI 换深冷调**（用户拍板）：styles.css 九 token 从暖棕系换为钢蓝/暗夜系（全部仍取自项目色板实际色值：eye/steel-dark/steel-light/steel-mid/outline），像素框架不动。

## Non-Goals

- 不动 guardian/knight/potion 既有资产与表；不改 web/lib 与 bridge API 协议；img2img 实调属 M4（`img2img-live`，另行立项）。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `svg-engineering`：母版精度条款降格（移除条件式）。

## Impact

- 改动：`sheets/` +8 PNG +8 map；`openspec/specs/svg-engineering/spec.md`（归档时 CLI 同步）；`tools/oklch-bayer.test.mjs`（+1 效果测试）；`web/verify-bridge.mjs`（+模块可达性审计）；`web/styles.css`（token 重写）。
