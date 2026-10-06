# 引擎占位项目预研 — 7.1 双表进引擎（research，docs only）

依据：`openspec/changes/pixel-generator-character-mvp/specs/spritesheet-export/spec.md`
（一动作一表、行序、双模式、map.json、td/sd 分表）、`design.md`
Open Questions（SpriteFrames vs AtlasTexture + map.json）与 Migration Plan
（sheet packer for Godot AtlasTexture 为 forward path）。
本任务只回答“7.1 占位建成什么样”，不写实现代码、不搭工程、不导真实资源。

> 首版按 spec 字段写。6.x Full `map.json` 样例待导出实现（A 任务）产出后再补一节
> “附录：实测 map.json 贴合度”，届时逐字段回填实测值。

## 1. 两种候选的最小可用结构对比

共同约束（来自 spec，不可谈判）：一动作一 PNG，按视角分文件
（如 `knight_td_walk.png`、`knight_td_attack.png`）；行序固定 `fr/bk/lf/rt`；
零间距、1x 单元格、`cell = asset.size`；td/sd 永不合表，切换视角即换表；
例：64px walk 3 帧 → `192x256`（3 列 ×64 宽，4 行 ×64 高）。

### A. Godot 4.x AtlasTexture + map.json 适配（占位，不建 `.godot` 工程）

目录树（占位示意，7.1 只校验“摆得下”，不生成 `.godot/.tres`）：

```
engine-placeholder/godot-atlas/
  knight_td_walk.png          # 192x256（64px × 3f walk，行 fr/bk/lf/rt）
  knight_td_attack.png        # 256x256（64px × 4f attack，行 fr/bk/lf/rt）
  knight_sd_walk.png
  knight_sd_attack.png
  knight_full.map.json        # Full 模式：原生帧数 + x/y/w/h + fps/loop/next
  knight_maker.map.json       # Maker 模式：强制 3 列 + 截断/补齐映射公示
  IMPORT-RECIPE.md            # 人读：map.json → AtlasTexture 切分步骤（见下）
```

文件清单：4 PNG（walk+attack × td/sd，7.1 范围；idle 表按需另加，不计入 7.1
必须项）+ 2 map.json（Full/Maker 各一）+ 1 配方文档。无 `.godot`、
无 `.tres/.res`、无编辑器导入件——占位止于“文件齐 + 配方可执行”。

导入配方（占位自检用，不执行）：Godot 侧对每张 PNG 建 `AtlasTexture`
（`atlas = PNG`，`region = map.json` 中对应 `x/y/w/h`），再按
`animation = {perspective}/{action}/{dir}` 组装
`AnimatedSprite2D`（或 `SpriteFrames`，二选一见 §3），`fps/loop/next`
照 `map.json` 填，`texture_filter = nearest`（像素风关平滑，与 2.3 一致）。

### B. 通用引擎 map.json 直读占位（推荐，见 §3）

目录树：

```
engine-placeholder/generic/
  knight_td_walk.png
  knight_td_attack.png
  knight_sd_walk.png
  knight_sd_attack.png
  knight_full.map.json        # 同 A 的 Full 表（同一份，不另生成）
  knight_maker.map.json       # 同 A 的 Maker 表（`$`命名见 §3）
  PLACEHOLDER.md              # 人读：任意引擎直读 map.json 的字段契约
```

文件清单：与 A 同样的 4 PNG + 2 map.json + 1 占位说明。区别仅在于消费方式：
不经过 Godot 资源格式，引擎运行时（或占位校验脚本）直接读 `map.json`
的 `file/x/y/w/h/fps/loop/next` 切分 PNG。占位校验 = “PNG 几何对 +
map.json 可解析 + 行列可定位”，无需引擎本体在场。

## 2. Full map.json 已有字段 vs 引擎侧还缺字段（gap 清单）

“已有”口径 = `spritesheet-export/spec.md` Full 模式明示字段
（`x/y/w/h`、`fps`、`loop`、`next-action` + 一动作一表/行序隐含字段）。
6.x 未落地，首版不虚构实现字段；待 A 产出后补实测附录。

| # | 字段名 | Full map.json（spec 已有） | 引擎侧需要 | 结论 |
|---|---|---|---|---|
| 1 | `sheet`（如 `knight_td_walk.png`） | 有（一动作一 PNG 隐含） | 需要 | 已有 |
| 2 | `perspective`（`td`/`sd`，分表） | 有（文件名 + 永不合表） | 需要（切表键） | 已有 |
| 3 | `action`（`idle`/`walk`/`attack`） | 有（一动作一表隐含） | 需要（动画名一级键） | 已有 |
| 4 | `dir` / 行（`fr/bk/lf/rt` 行序） | 有（行序固定） | 需要（方向二级键） | 已有 |
| 5 | `frame` / 列（原生帧序号） | 有（Full 原生帧数隐含） | 需要 | 已有 |
| 6 | `x` | 有（spec 明示） | 需要（切分） | 已有 |
| 7 | `y` | 有（spec 明示） | 需要（切分） | 已有 |
| 8 | `w` | 有（spec 明示，`= asset.size`） | 需要（切分） | 已有 |
| 9 | `h` | 有（spec 明示，`= asset.size`） | 需要（切分） | 已有 |
| 10 | `fps` | 有（spec 明示；walk 6 / attack 8 / idle 2） | 需要（`AnimatedSprite2D.fps` / 通用 `speed`） | 已有 |
| 11 | `loop` | 有（spec 明示；walk true / attack false） | 需要（循环 vs 单次） | 已有 |
| 12 | `next`（attack → `idle`） | 有（spec 明示 next-action） | 需要（攻击收招链） | 已有 |
| 13 | `texture_filter`（= `nearest`） | 无（仅 2.3 关平滑展示提及，未进 map 契约） | Godot 需要（导入覆盖默认线性过滤） | **缺** |
| 14 | `anchor` / `offset`（脚底/中心对齐） | 无 | 需要（行走不抖、攻击不飘；顶视角与侧视角可能不同） | **缺** |
| 15 | `animation` 命名（`{persp}/{action}/{dir}` 或 SpriteFrames 轨名） | 无（仅文件+行列，无动画名字符串） | 需要（引擎侧动画库键） | **缺** |
| 16 | `direction` 枚举映射（引擎侧朝向号） | 无 | 需要（`fr/bk/lf/rt` → 引擎朝向 ID） | **缺** |
| 17 | `loop_mode`（Godot 前向 vs ping-pong 等） | 无（仅布尔 `loop`） | Godot SpriteFrames 需要（布尔转枚举） | **缺** |
| 18 | `speed_scale`（变速/慢放） | 无 | 可选（7.1 可缺省 1.0，占位需声明缺省） | **缺** |
| 19 | `hitbox` / `attack_active_frame`（判定帧） | 无 | 战斗需要，但 7.1 可声明“占位无判定” | **缺** |
| 20 | `mount`（`weapon-slot` 挂点） | 无（SVG 有 `weapon-slot` 语义，表未带出） | 换装/武器绑定需要；7.1 可声明缺省 | **缺** |
| 21 | `maker_mapping`（ kept/dropped/padded + `$`命名） | Maker 表有（spec 要求公示映射） | Maker 消费方需要；Full 表不需要 | Maker 有 / Full 不适用 |
| 22 | `version` / `generator`（表版本与产出commit） | 无 | 需要（7.1 终验追溯：哪次导出、哪个 asset commit） | **缺** |
| 23 | `palette_ref`（如 `palette_character@v1`） | 无（在 `asset.json`，表未冗余） | 占位自检需要（确认表与资产同色板） | **缺** |
| 24 | `cell` / `size` 冗余（`= asset.size`） | 无（spec 说 cell=asset.size，但未定为 map 字段） | 需要（防 32/48/64 混表） | **缺** |

gap 合计：**11 项缺**（#13–#20、#22–#24；#21 为 Maker 专属、不计 Full 缺）。
其中 7.1 阻塞项仅 #13–#17（过滤、对齐、动画名、朝向映射、循环枚举）；
#18–#20 可声明缺省/无判定，#22–#24 为追溯与防呆字段，建议 6.x 顺手带上。

## 3. 推荐：B（通用 map.json 直读占位）

- **离线可用**：B 只需 PNG + map.json + 人读配方，`node` 自检即可终验；
  A 的 SpriteFrames/`.tres` 需 Godot 编辑器版本配合，违背“无 key/离线可跑”
  的项目基线，且落入 §5 非目标（搭 Godot 工程）。
- **改动面最小**：B 的消费契约 = Full map.json 已有 12 字段（§2 #1–#12），
  6.x 实现什么、B 就验什么；A 还需维护 Godot 侧枚举翻译层
  （`loop`→`loop_mode`、`filter`、`animation` 命名），多一层漂移。
- **与 td/sd 分表兼容**：两种方案都满足“永不合表”，但 B 把“切换视角即换表”
  写成占位目录事实（`knight_td_*` vs `knight_sd_*` 两叠），终验一条
  `ls` 即见；A 还需解释 SpriteFrames  library 切分，易把分表藏进资源树。
- **与 Maker 模式兼容**：Maker 的 3 列截断/补齐 + `$`命名本质是“导出适配器”
  （design.md：never stored），B 用 `knight_maker.map.json` 把
  `maker_mapping` 公示为数据，引擎/人工都可审计；A 若用 SpriteFrames
  会把截断藏进动画轨，丢了“映射公示”的可审计性。
- **呼应 design.md 默认值**：Open Questions 原文“defaults to generic map.json,
  adapter later”——7.1 选 B 即执行默认值；A（AtlasTexture packer）仍保留为
  Migration Plan 的 forward path，6.x 后补适配器，不在本 change 终验。

一句话推荐：**7.1 用 B（通用 map.json 直读占位）终验，A 只留导入配方不建工程。**

## 4. 7.1 验收清单草案（供主 Agent 终验用）

前置（6.x 未合不跑本节；跑之前先 `git merge --ff-only main` 并确认干净）：

- [ ] **SVG 落盘数**：`assets/knight_001/` 内 view SVG **64 个**
  （idle 1f×8 clip=8 ＋ walk 3f×8=24 ＋ attack 4f×8=32；另 2 母版不计入 64）。
  另满足 proposal 区间 40~88（64 落在区间内）。
- [ ] **矩阵可播项**：td/sd 各 12 cells、`missing=0`、逐格 `tickPlayer` 不抛、
  attack 末帧回同向 idle（`verify-5.2` 全 OK）。
- [ ] **双表**：walk+attack × td/sd × Full+Maker 共 **8 PNG + 8 map.json**
  （`sheets/` 全集：walk Full/Maker 192x256、attack Full 256x256、attack Maker
  192x256，每表 1 PNG + 1 `*.map.json`）；walk 表几何抽查 `192x256`（64px×3f）；
  attack 表几何抽查 Full `256x256`（64px×4f）/ Maker `192x256`；行序 `fr/bk/lf/rt`；
  td/sd 无合表；Maker 表含 `maker_mapping` 公示与 `$`命名。
- [ ] **占位项目**：`engine-placeholder/generic/`（B）文件齐
  （8 PNG + 8 map.json + `PLACEHOLDER.md`，`sheets/` 全集逐字节复制，不改名）；
  `engine-placeholder/godot-atlas/`（A）仅配方、无 `.godot/.tres`。

自检命令（占位与回归，全部只读、不写资产）：

```
node tools/asset-manifest.mjs validate assets/knight_001/asset.json --check-files
node --test tools/*.test.mjs
node web/verify-1.1.mjs
node web/verify-4.1.mjs
node web/verify-4.2.mjs
node web/verify-5.2.mjs
```

占位结构自检（7.1 落地后应全 OK；逐个解析 `generic/` 下全部 per-sheet map.json）：

```
node -e "const fs=require('fs');const dir='engine-placeholder/generic';for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.map.json')).sort()){JSON.parse(fs.readFileSync(dir+'/'+f,'utf8'));console.log('OK: '+dir+'/'+f)}"
```

## 5. 明确非目标

- 不搭建 Godot 工程（无 `.godot`、无 `.tres/.res`、无编辑器导入件）。
- 不导出真实引擎资源（本任务零 PNG/map.json 产出；§1 目录树为“应然结构”，
  不是本次交付）。
- 不改任何代码与资产（`tools/`、`web/`、`assets/`、`palettes/` 只读；
  `openspec/` 不勾选；本任务仅新增本文件）。
