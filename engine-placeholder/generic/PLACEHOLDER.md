# PLACEHOLDER.md — 通用引擎 map.json 直读占位（B 方案终验）

本目录 = 7.1 占位终验体（B 方案：通用 map.json 直读）。文件全部由
`node tools/sheet.mjs export --asset knight_001 --out sheets` 产物原样复制，
逐字节一致，不改名（Maker `$`前缀保留）。人读可执行：任意引擎/脚本照此
切分即得动画，无需 Godot 本体在场。

## 1. 文件清单（8 PNG + 8 map.json）

```
knight_td_walk.png   + knight_td_walk.png.map.json    # Full, 192x256
knight_sd_walk.png   + knight_sd_walk.png.map.json    # Full, 192x256
knight_td_attack.png + knight_td_attack.png.map.json  # Full, 256x256
knight_sd_attack.png + knight_sd_attack.png.map.json  # Full, 256x256
$knight_td_walk.png   + $knight_td_walk.png.map.json    # Maker, 192x256
$knight_sd_walk.png   + $knight_sd_walk.png.map.json    # Maker, 192x256
$knight_td_attack.png + $knight_td_attack.png.map.json  # Maker, 192x256
$knight_sd_attack.png + $knight_sd_attack.png.map.json  # Maker, 192x256
```

几何：walk（3f）192x256；attack Full（4f）256x256；Maker 全表 192x256
（强制 3 列）。`$`前缀 = Maker 表（RPG Maker 单表惯例），引擎不切分
`$`，只按 `map.json` 取 `frames`。

来源：`tools/sheet.mjs`（`buildSheet` + pngjs 同步编码，确定性输出；
同输入同字节）。资产只读消费（`assets/knight_001/asset.json` 64 真 hash +
66 SVG，7.1a 已合流）。

## 2. map.json 字段契约

顶层（以 `knight_td_walk.png.map.json` 为例）：

| 字段 | 含义 | 引擎用法 |
|---|---|---|
| `mode` | `full`/`maker` | Full 原生帧；Maker 读 `mapping` 公示 |
| `asset` | `knight_001` | 归属校验 |
| `perspective` | `td`/`sd` | 切表键（见 §3） |
| `action` | `walk`/`attack` | 动画一级键 |
| `size`/`cell` | `64` | 单元格边长（防 32/48/64 混表） |
| `cols`/`rows` | 列数/4 行 | 表几何校验（`cols*cell x rows*cell`） |
| `sheet` | PNG 文件名（含 `$`即 Maker） | 贴图绑定 |
| `fps` | walk 6 / attack 8 | 播放速率 |
| `loop` | walk true / attack false | 循环 vs 单次 |
| `next` | attack → `idle`，walk → `null` | 攻击收招链（播完切同向 idle） |
| `frames[]` | 逐帧条目（下表） | 切分与播放序 |
| `mapping` | `{kept, dropped, padded}` | Maker 公示；只看不导 |

逐帧条目：

| 字段 | 含义 | 引擎用法 |
|---|---|---|
| `file` | 源 SVG（如 `knight_td_walk_fr1.svg`） | 追溯，不切分 |
| `dir` | `fr`/`bk`/`lf`/`rt` | 方向二级键 |
| `frame` | 源帧号 | 审计序 |
| `col`/`row` | 表内列/行 | 播放序 = 列序；行 = 方向 |
| `x`/`y`/`w`/`h` | 切分矩形（`x=col*cell`，`y=row*cell`，`w=h=cell`） | `Rect(x,y,w,h)` 照抄，零间距无需 margin |
| `kind` | `kept`（Full 恒 kept） | Maker `padded` 帧为同向 idle 源（见下） |

`maker_mapping` 公示说明：`mapping.kept` = 入表文件（attack Maker 每向 3 个，
fr4 截断）；`mapping.dropped` = 截断具名（如 `knight_td_attack_fr4.svg`，
`reason: maker-truncate:cols=3`）；`mapping.padded` = idle 垫帧
（`{col,dir,file}`，短 clip 补齐用；本次 walk/attack 无需垫，`padded: []`
属正常）。引擎只消费 `frames`（已是落表顺序），`mapping` 仅供人审。

## 3. td/sd 分表规则

- td/sd 永不合表：`perspective` 为单值 `td`|`sd`，`buildSheet` 对数组/逗号串
  直接抛错；切视角 = 换整套表（td 4 表 ↔ sd 4 表）。
- 自检：任一 map 的 `perspective` 与其 `sheet` 前缀一致
  （`knight_td_*` ↔ `td`）；不存在同时含 `td`+`sd` 帧的 map。
- 预览 toggle（`web/lib/matrix.js`）与导出分表同源：toggle 换 perspective
  即重载另一叠 12 cells，timing（`fps`）不变。

## 4. 最小消费伪步骤（任意引擎）

1. 选表：`perspective/action/mode` → 1 PNG + 1 map.json。
2. 建 4 方向动画：`row 0/1/2/3 = fr/bk/lf/rt`，每行动画帧 = 该行 `frames`
   按 `col` 排序，`region = (x,y,w,h)`，`speed = map.fps`。
3. `loop=true`（walk）直接循环；`loop=false`（attack）播完按
   `map.next`（`idle`）切同向 idle（与 `tools/clips.mjs nextFrame` 一致）。
4. 放大展示一律最近邻（`texture_filter = nearest`，
   对应 `imageSmoothingEnabled=false`）；线性过滤即算破坏。

## 5. 静态资产直读扩展（static kinds，本轮 SVG-only）

静态资产（`sword_001`/weapon、`house_001`/building、`crate_001`/prop、
`tree_001`/scenery、`potion_001`/prop）的静态单帧导出已随 M2 冻结
（spritesheet-export：`<prefix>_<persp>_idle.png` 4 列 × 1 行 + full-mode
map.json）；截至 M3 实际落表的是 `potion_001`（M2 导入件），
`house_001`/`tree_001` 已升 128 档、出表随时可跑
（`node tools/sheet.mjs export --asset <id>`）。有表资产沿用本直读契约，
未出表资产走单格直读退化形态：

1. 选资产：读 `assets/<id>/asset.json`。实测四静态均为 `idle` 单动作、
   `frames: 1`、`fps: 2`、`loop: true`、`size: 64`，色板按 kind
   （`palette_weapon@v1` / `palette_building@v1` / `palette_prop@v1` /
   `palette_scenery@v1`）。
2. 单格直读：region 缺省全格（`x = y = 0`，`w = h = size`）；
   `perspective`/`dir` 照 asset.json 的 `perspectives`（td/sd）与 `views`
   （fr/bk/lf/rt，8 格）取对应 `file` SVG；`loop = true` 直接循环，
   无 `next` 链。
3. 防呆同 §2 口径：`size` 按 kind 枚举（character/weapon/prop 32/48/64，
   building/scenery 另许 128；本轮四静态实测 64），色板
   `palette_{kind}@vN` 门控（见冻结 `assets/asset.schema.json`）。
4. 将来静态表落地后：一动作一表、行序 `fr/bk/lf/rt`、map.json 字段契约
   直接套用；`generic/` 新增文件必须同提交更新
   `tools/placeholder.test.mjs` 精确文件集断言（现钉 17 文件：
   8 PNG + 8 map.json + 本文件）。本轮 `generic/` 零新增文件，只加本章节。
