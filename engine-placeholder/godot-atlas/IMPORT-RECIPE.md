# IMPORT-RECIPE.md — Godot 4 AtlasTexture 导入配方（knight_001 拼表，配方级）

范围与铁律：`map.json` 零改动（只读消费）；本目录只留配方 + 自检脚本，
不建 `.godot/`、不产 `.tres/.godot/.res`（`.tres/.godot` 生成器留轮 2 管线轴，
本轮禁产）。配方字段只写 shipped 实测值：`engine-placeholder/generic/`
8 表 + 8 `*.map.json`（walk+attack × td/sd × Full/Maker，逐字节同 `sheets/`）。
实测几何：walk 192x256（Full/Maker 同），attack Full 256x256，
attack Maker 192x256。

## 1. map.json → AtlasTexture region 映射

每表配套 `*.map.json`，顶层实测字段（`knight_td_walk` 例）：
`mode/action/perspective/size/cell/cols/rows/sheet/fps/loop/next/frames[]/mapping`，
逐帧条目 `{file,dir,frame,col,row,x,y,w,h,kind}`（map 无其他字段，
`version/generator/palette_ref` 取处见 §3 #22–#24）。

- Godot 侧每帧 = 一个 `AtlasTexture`，其 `atlas` 指向整表 PNG，
  `region = Rect2(x, y, w, h)` 照抄落表值即可（零间距 1x，
  无需 margin/separation）。
- 自导公式（自检脚本同式重导）：`x = col*cell`，`y = row*cell`，
  `w = h = cell`（实测 `cell = size = 64`）。
- 行语义：`row 0/1/2/3 = fr/bk/lf/rt`，4 行即 4 个方向动画，不跨行混帧。
- Maker 表多一个 `mapping` 公示：`kept`（入表 12 帧）、`dropped`
  （实测 attack Maker 每向截 fr4，`reason: maker-truncate:cols=3`，4 向共 4 条）、
  `padded`（本次 walk/attack 无需垫，`[]` 属正常）。引擎只消费 `frames`
  （已是落表顺序），`mapping` 仅供人审，不必导入。Full 表 `dropped/padded`
  为空，`kind` 恒为 `kept`。

## 2. fps/loop/next → AnimatedSprite2D 映射

每视角每动作一个 `AnimatedSprite2D` + 一套 `SpriteFrames`
（8 表 → 8 套，每套 4 个方向动画，动画名见 §3 #15，共 32 个）：

1. `fps` → 动画 `speed`：实测 walk 6 / attack 8（idle 2 不在 7.1 表内）。
2. `loop` → `loop_mode`（§3 #17）：`true → LOOP_FORWARD`，
   `false → LOOP_NONE`；`LOOP_PINGPONG`/`LOOP_BACKWARD` 本管线永不用。
3. `next` → 收招链（与 `tools/clips.mjs` 的 nextFrame 语义一致）：
   ```gdscript
   func play_attack(dir: String) -> void:
       $AnimatedSprite2D.play("td/attack/" + dir)
       await $AnimatedSprite2D.animation_finished
       $AnimatedSprite2D.play("td/idle/" + dir)  # map.next == "idle" 时
   ```
   `walk`（`next == null`）直接循环，无需接管。注意：idle 表本轮未导出
   （7.1 仅 walk+attack 8 表），`{persp}/idle/{dir}` 动画待 idle 表落地后补；
   attack→同向 idle 的回退语义已在矩阵级验证（`node web/verify-5.2.mjs` 全 OK）。
4. `speed_scale` 缺省 `1.0`（§3 #18）：变速只走 `fps`，
   `AnimatedSprite2D.speed_scale` 保持 `1.0`。
5. td/sd 永不合表：切视角 = 换整套 `SpriteFrames`（td 4 表 ↔ sd 4 表），
   不要试图把两个视角拼进同一动画（与 `buildSheet` 的合表抛错对应）。

像素表必须关闭一切平滑（§3 #13），三处取其一（推荐第 1 处，项目级）：

1. 项目级（推荐）：Project Settings → Rendering → Textures → Canvas Textures →
   Default Texture Filter = **Nearest**。
2. 单图级：选中 PNG → Import 标签 → Filter Mode **Nearest** → Reimport。
3. 代码级：`texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST` 写到装配脚本的
   `_ready()`，防止换项目漏配。

本管线放大展示约定与 `imageSmoothingEnabled=false` 等价，线性过滤即算破坏。

## 3. gap #13–#20 逐项映射/缺省 + 追溯字段取处

对照 `docs/engine-placeholder.md` §2 缺口清单。结论只有两种：
“映射”（map 现有字段直转）或“缺省声明”（map 无字段，人/引擎侧定死）。

| # | 字段 | 映射或缺省声明 |
|---|---|---|
| 13 | `texture_filter = nearest` | 缺省转项目配置：见 §2 三处（推荐项目级 Nearest）；导入覆盖 Godot 默认线性过滤。 |
| 14 | `anchor` / `offset` | 缺省：保持 Godot 默认（centered，不额外 offset）；全格 64px + nearest 保证行走不抖；脚底对齐如需由游戏侧定，配方不断言。 |
| 15 | `animation` 命名 | 映射：`{persp}/{action}/{dir}`（如 `td/walk/fr`）；8 套 SpriteFrames × 4 动画 = 32 动画名。 |
| 16 | `direction` 枚举映射 | 映射：`fr/bk/lf/rt` → 行号 `0/1/2/3`（即 `row`），引擎侧朝向 ID 直接用行号；方向向量配方不定（缺省，由移动代码侧定义），只锁定“同 dir 字符串端到端一致”（map.dir → 动画名 → 输入映射同一字符串）。 |
| 17 | `loop_mode` | 映射：见 §2（`loop` true → `LOOP_FORWARD`，false → `LOOP_NONE`；ping-pong/backward 永不用）。 |
| 18 | `speed_scale` | 缺省 `1.0`（见 §2，变速只走 `fps`）。 |
| 19 | `hitbox` / `attack_active_frame` | 占位无判定声明：本轮无判定数据，战斗系统后补；`attack_active_frame` 不定。 |
| 20 | `mount`（`weapon-slot` 挂点） | 缺省无挂点：SVG 的 `weapon-slot` 语义表未带出（map 无挂点字段）；武器已 baked 进 attack 表（attack 表含剑）；换装/绑定后补。 |
| 21 | `maker_mapping` | Maker 专属（kept/dropped/padded + `$`命名），Full 不适用；引擎不导入，只看 §1。 |
| 22 | `version` / `generator` | map 无此字段 → 追溯取处：git 导出提交 + 导出命令 `node tools/sheet.mjs export --asset knight_001 --out sheets`；后补字段时再写表，本轮以 git 为准。 |
| 23 | `palette_ref` | map 无冗余 → 取自 `assets/knight_001/asset.json`（实测 `palette_character@v1`）。 |
| 24 | `cell` / `size` | map 有（实测 `size: 64, cell: 64`）→ 防呆：`size == cell == asset.size`，且 `cols*cell x rows*cell` 必须等于 PNG IHDR 几何（自检脚本断言，§5）。 |

## 4. worked example：knight_td_walk（全部实测值）

- 输入：`knight_td_walk.png`（192x256）+ `knight_td_walk.png.map.json`
  （`mode: full, perspective: td, action: walk, fps: 6, loop: true, next: null,
  cols: 3, rows: 4, size/cell: 64`；`mapping.kept` 12 文件，
  `dropped/padded` 为空）。
- 建 `AnimatedSprite2D` + `SpriteFrames`，4 动画 `td/walk/fr|bk|lf|rt`，
  `speed = 6`，`loop_mode = LOOP_FORWARD`，`speed_scale = 1.0`。
- regions（`Rect2` 照抄，共 12 帧）：
  - `td/walk/fr`（row 0，y=0）：`(0,0,64,64)`，`(64,0,64,64)`，`(128,0,64,64)`
  - `td/walk/bk`（row 1，y=64）：`(0,64,64,64)`，`(64,64,64,64)`，`(128,64,64,64)`
  - `td/walk/lf`（row 2，y=128）：`(0,128,64,64)`，`(64,128,64,64)`，`(128,128,64,64)`
  - `td/walk/rt`（row 3，y=192）：`(0,192,64,64)`，`(64,192,64,64)`，`(128,192,64,64)`
- texture_filter = Nearest；centered/offset 缺省；无 hitbox/挂点。
- 照此把 `td/sd × walk/attack × Full/Maker` 做完即 8 套 32 动画；
  Maker attack 每向只有 3 帧（fr4 截断见 `mapping.dropped`，属预期非漏帧）。

## 5. 配方自检（无 Godot 可执行）

```
node engine-placeholder/godot-atlas/verify-recipe.mjs
```

纯只读脚本：读 `../generic/` 8 map，按 §1 公式重导 region 并与落表值逐帧
比对 + 断言几何内（PNG IHDR == `cols*cell x rows*cell`）+ 行序 `fr/bk/lf/rt` +
`fps/loop/next` 动作契约（walk 6/true/null，attack 8/false/idle）；
不写资产/表/占位任何文件。全绿才算配方可执行。

## 6. 本配方不做什么

- 不含 PNG（去 `sheets/` 或 `../generic/` 取）、不建 `.godot/.tres/.res`、
  不改 `asset.json` 与 66 SVG、不动 `web/`。
- 不虚构 map 字段：凡 map 没有的（#13–#14、#18–#20、#22–#23），只给缺省声明
  或追溯取处，不写进表（map 冻结，见 §3）。
