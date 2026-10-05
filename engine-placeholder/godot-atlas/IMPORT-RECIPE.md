# IMPORT-RECIPE.md — Godot 4 AtlasTexture 导入配方(knight_001 拼表)

仅配方文档,不含 PNG、不建 `.godot/`、`.tres`、`.res`。输入是 `sheets/` 下的
8 表 + 8 `*.map.json`(walk+attack × td/sd × Full/Maker),均为本仓 `exportSheets`
产物,几何见 `tools/sheet.test.mjs`(walk 192x256、attack-full 256x256、maker 192x256)。

## 1. 前提:texture_filter = nearest(像素 crisp)

像素表必须关闭一切平滑,三处取其一(推荐第 1 处,项目级):

1. 项目级(推荐):Project Settings → Rendering → Textures → Canvas Textures →
   Default Texture Filter = **Nearest**。GI 中对应 `Sprite2D`/`AnimatedSprite2D`
   默认最近邻,所有表一次生效。
2. 单图级:选中 PNG → Import 标签 → Filter Mode **Nearest** → Reimport。
3. 代码级:`texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST` 写到装配脚本的
   `_ready()`(见第 3 节),防止换项目漏配。

本管线放大展示约定与 `imageSmoothingEnabled=false` 等价,线性过滤即算破坏。

## 2. map.json → AtlasTexture region 映射

每表配套 `*.map.json`,顶层含 `cols/rows/cell(64)/fps/loop/next`,逐帧条目:

```json
{ "file": "knight_td_walk_fr1.svg", "dir": "fr", "frame": 1,
  "col": 0, "row": 0, "x": 0, "y": 0, "w": 64, "h": 64, "kind": "kept" }
```

- Godot 侧每帧 = 一个 `AtlasTexture`,其 `atlas` 指向整表 PNG,`region =
  Rect2(x, y, w, h)` 照抄即可(零间距 1x,无需 margin/separation)。
- 行语义:`row 0/1/2/3 = fr/bk/lf/rt`,4 行即 4 个方向动画,不要跨行混帧。
- Maker 表多一个 `mapping` 公示:`kept`(入表 12 帧)、`dropped`(如 attack fr4
  截断,具名)、`padded`(idle 垫帧,`{col,dir,file}`,与源同文件)。引擎只消费
  `frames`(已是落表顺序),`mapping` 仅供人审,不必导入。
- Full 表 `dropped/padded` 为空,`frames` 即原生帧;`kind` 恒为 `kept`。

## 3. AnimatedSprite2D 组装(每视角每动作一个)

以 `knight_td_walk.png + .map.json` 为例:

1. 新建 `AnimatedSprite2D`,`SpriteFrames` 新建 4 个动画,命名与行对应:
   `walk_fr/walk_bk/walk_lf/walk_rt`,每动画 `speed = map.fps`(walk 6,attack 8,
   idle 2),`loop = map.loop`(attack 为 false)。
2. 每动画按 `row` 取该行 `frames` 的 region 依次 Add Frame(列序即播放序;
   Maker 表 attack 缺 fr4 属预期截断,见公示)。
3. `attack` 播完回 idle(与 `tools/clips.mjs` 的 nextFrame 语义一致):
   ```gdscript
   func play_attack(dir: String) -> void:
       $AnimatedSprite2D.play("attack_" + dir)
       await $AnimatedSprite2D.animation_finished
       $AnimatedSprite2D.play("idle_" + dir)  # map.next == "idle" 时
   ```
   `walk/idle` 的 `loop=true` 直接循环,无需接管。
4. td/sd 永不合表:切视角 = 换整套 `SpriteFrames`(td 4 表 ↔ sd 4 表),不要试图
   把两个视角拼进同一动画(与 `buildSheet` 的合表抛错对应)。

## 4. 校验清单(进引擎前)

- [ ] 表几何:walk 192x256、attack-full 256x256、maker 192x256(错一行即行序错)。
- [ ] attack map `next=="idle"` 且 `loop==false`;walk `loop==true`。
- [ ] 放大 4x 观察:边缘无半透明渗色(本管线 alpha 非 0 即 255,透明即 `(0,0,0,0)`)。
- [ ] Maker attack 缺 fr4 已在 `mapping.dropped` 具名(非漏帧)。

## 5. 本配方不做什么

- 不含 PNG(去 `sheets/` 取)、不建 `.godot/.tres`、不改 `asset.json`(hash 已由
  `tools/backfill-hashes.mjs` 回填)、不动 66 SVG 与 `web/`。
