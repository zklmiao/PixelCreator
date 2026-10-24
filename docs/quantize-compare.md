# 量化前后对比 — pixel-generator-character-mvp 2.3

依据：`openspec/specs/pixel-quantize/spec.md`（原 change 已归档：`openspec/changes/archive/2026-10-06-pixel-generator-character-mvp/`）
（分辨率档与正方形 pad、透明规则、类色板、dither 策略）。
数据来源均为本仓库：`palettes/*.v1.json`、`tools/quantize.mjs`、`tools/palette.mjs`。
无外部图片。

## 1. 管线四步

1. **下采样到档位** — `quantizeGeometry`：按最长边等比 fit 到 32/48/64（人物）或 128（他类），
   面积平均 `downscaleBox`，输出前 `alpha<128` 丢弃为透明，再居中 pad 到等大正方形。
   例：512x384 → 64x48 内容 + 上下各 8 行透明 pad = 64x64（`node tools/quantize.mjs selfcheck 64`）。
2. **欧氏量化到类色板** — `mapFrameToPalette`：每个不透明像素按欧氏距离取最近色板项
   （`palette_character@v1` 等，跨视角共享同一套色板保证一致性；OKLCH 经 `colorDistance`
   注入替换，默认仍为欧氏 v1）。
3. **抖动策略** — 默认全种类 `none`；`ordered-bayer` 4x4 仅 scenery/building 可选；
   `error-diffusion` 全局永拒；character（含 weapon/prop）传入非 `none` 直接抛错（人物锁 none）。
4. **整数放大展示** — `upscaleNearest(src, w, h, factor)`：整数倍最近邻复制，
   对应前端 `imageSmoothingEnabled=false`；`factor` 非正整数抛错；透明块保持透明。

复现：`node --test tools/quantize-upscale.test.mjs`（13 项），
`node tools/palette.mjs map-selfcheck palettes/palette_character.v1.json`。

## 2. 采样像素“原值 → 色板项”映射表（`palette_character@v1`，欧氏默认）

| # | 输入（原型采样） | 落点色板项 | 色板值 | 说明 |
|---|---|---|---|---|
| 1 | `#FFD9B3` | `skin-1` | `#FFD9B3` | 肤色 ramp 高光，精确命中 |
| 2 | `#E8A87C` | `skin-2` | `#E8A87C` | 肤色 ramp 中间调，精确命中 |
| 3 | `#C87A4E` | `skin-3` | `#C07A4E` | 肤色 ramp 阴影，近似值收敛到同一档 |
| 4 | `#7A4A2E` | `skin-4` | `#7A4A2E` | 肤色 ramp 深影，精确命中 |
| 5 | `#C2322A`（front 披风红） | `tunic-red` | `#C03028` | 前后视图收敛项之一 |
| 6 | `#BE2E26`（back 披风红） | `tunic-red` | `#C03028` | 前后视图收敛项之二，与 #5 同项 |
| 7 | `#C83028`（另一样本红） | `tunic-red` | `#C03028` | 同色系第三样本，仍收敛到 `tunic-red` |
| 8 | `#DDE3EA` | `steel-light` | `#DDE3EA` | 盔甲高光，精确命中 |
| 9 | `#5A556E` | `steel-dark` | `#565E6C` | 盔甲暗部，近似值收敛 |
| 10 | alpha=100 的羽化边（如 `#C03028@100`） | `transparent`（丢弃） | `#00000000` | 先于映射丢弃，不参与最近色查找 |

核验命令即上节“复现”；OKLCH 钩子下 #5/#6 同样收敛到 `tunic-red`
（`palette-map.test.mjs` 中 `colorDistance: oklchDistance` 用例）。

## 3. walk 无抖动判定标准

- **none 模式逐字节一致**：同一 walk clip（3 帧合成样例：8x8、中线 stride 位移、首尾透明行）
  经 `mapFrameToPalette(..., { dither: 'none' })` 跑两遍，`data` 与 `names` 均 `deepEqual`
 （单测：`same walk clip mapped twice in none mode is byte-identical`）。
- **Bayer 确定性**：`ordered-bayer` 同输入跑两遍输出一致；偏移量只与 `(x, y)` 有关
  （4x4 矩阵位置固定），不随帧序号漂移，故连播不闪（单测：`ordered-bayer output is deterministic`）。
- **输出封闭性**：映射后每像素非透明即色板精确字节、`a=255`，透明即 `(0,0,0,0)`；
  不存在中间色，故逐帧色数有界、循环播放无抖动
 （单测：`mapped walk frames hold only palette bytes or transparent`）。
- **端到端确定性**：`quantizeGeometry → mapFrameToPalette → upscaleNearest` 同输入两次运行
  输出一致（单测：`geometry+map+upscale chain is end-to-end deterministic`）。
