# 真实导入人工查看（compare 视图 + 7 资产矩阵，M2/M3）

`web/` 新增量化对比区（读 `fixtures/import/*.compare.png`，左原图 / 右量化结果；
M3 起另列 `fixtures/guardian/*.compare.png` 真实角色对比）与 7 资产切换
（含 `potion_001` 与首个真实角色 `guardian_001`）。本文把人工从零带到看见。

## 1. 人工查看路径（3 步）

1. 仓库根起本地 server（例 `npx serve`，根目录执行，保持默认端口后记住地址）。
2. 浏览器打开 `/web/`（如 `http://localhost:3000/web/`）。
3. 先看对比区（`fixtures/import` 三张并排图 + `fixtures/guardian` 真实角色对比），
   再用资产切换器切 7 资产（knight_001 默认，guardian_001 在末位）看矩阵：
   人物 12 格/视角（含 guardian），静态（含 potion）4 格/视角
   （SVG 未生成前允许 missing 占位）。

## 2. 必须走 server 的前提（file:// 会被拦）

- `web/app.js` 用 `fetch('../assets/<id>/asset.json')` 加载资产 JSON。
- 用 `file://` 直接双击打开 `/web/index.html` 时，浏览器会拦截 `fetch`
 （页面 shell/matrix 显示 FAIL），这是浏览器安全策略，不是 bug。
- 对比图的 `<img>` 本身不受此限，但 shell + 矩阵依赖 fetch，所以人工验收
  必须走第 1 步的本地 server。

## 3. 对比区文件约定

- fixtures（随 wt-A 入库提交）：`fixtures/import/I_Chest01.compare.png`、
  `fixtures/import/I_Key01.compare.png`、`fixtures/import/I_GoldCoin.compare.png`
 （各自由 `<basename>.compare.png` 约定生成：左 34 宽原生源条，右 64 宽量化结果，
  同高 64，即 98x64；源为 34x34 图标，量化宽为资产 size 档 64）。
- 本地自备图（gitignored，不入库）：`prototypes/<id>/input.compare.png`
  同约定兼容；对比区原型槽跟随 `proto-asset` 选择器，文件缺席时显示
  缺位提示，页面不崩。

## 4. 用户自备图流程（1 条命令）

1. 把源图放到 `prototypes/<id>/input.png`（如 `prototypes/potion_001/input.png`）。
2. 运行 `node tools/import-prototype.mjs --asset <id> --src prototypes/<id>/input.png`
   （输出落 8 视图 SVG + `prototypes/<id>/input.compare.png`）。
3. 回到 `/web/`，对比区原型槽选同一 `<id>` 即可看见。

## 5. 验证（agent 侧）

- `node web/verify-real-import.mjs`：3 源 34x34 + 3 compare 可解析 PNG +
  并排尺寸公式 + 7 shells 全 OK（`loadShell` 禁在 node 下调，走 fs +
  `checkShell`）+ potion 8 格形态（只断形态不断满格）+ guardian provenance
  （map + 8 源 + 复用宣言对落盘 + td==sd 占位 + 24 格形态）+ character 回归。
- 人物红线：`verify-1.1/4.1/4.2/5.2` 四文件不改一字且全绿。
- `web/lib/*.js`（含新增 `compare.js`）零依赖（`node:` 禁入）；verify 脚本不受此限。

## 6. guardian td 占位声明（M3）

- guardian 全系侧视语义，无顶视真源：20 个 td 视图填 sd 像素复制
 （`guardian_td_*` 与对应 `guardian_sd_*` 逐字节相等，由
 `node web/verify-real-import.mjs` guardian 段钉死 `td==sd`）。
- 矩阵/拼表/`.tres` 把 td 当正常视角消费，不特殊处理。
- 有顶视真源即换：届时删占位测试 + 换文件 + 回归（spec 许可条件）。

## 7. GIF→PNG 转换说明（一次性入库动作）

- guardian 备料是单帧 GIF（32x32 8bpp Indexed，amg1 系 4 方向 × 2 帧），
 由 PowerShell System.Drawing 一次性转 PNG 入库 `fixtures/guardian/`
 （8 源，入库即断言 32x32 RGBA + 同方向 f1≠f2）。
- 管线运行时只认 PNG（pngjs）；GIF 解码不进管线，零依赖约束不破；
 zip/GIF 原件不入库。
- 复用宣言（`fixtures/guardian/guardian-map.json`，clip → 源文件名）：
 idle=[f1] / walk=[f1,f2] / attack=[f2,f1]；attack 取逆序使序列不同于 walk。

## 8. 128 档说明（M3 实测）

- `house_001` + `tree_001` 由 64 提到 128（仅 `size` 字段，synth 原 motif
 重跑，各 8 视图 + 2 母版；building/scenery 双 kind 覆盖）。
- web 矩阵与 verify 按 manifest 消费尺寸，无硬编码档位：128 下仍是
 4 格/视角（idle-only），时序仍 fps 2 → 500ms。

## 9. `.tres` 位置说明（M3 一键生成）

- `tools/tres.mjs` 只读 Full maps 生成 `godot/<id>.spriteframes.tres`
 （`godot/knight_001.spriteframes.tres` 与
 `godot/guardian_001.spriteframes.tres`，各 24 动画，名
 `{persp}/{action}/{dir}`，speed=fps，loop→LOOP_FORWARD/LOOP_NONE）。
- Maker 表不进 `.tres`（Godot 侧用 Full）；recipe 手工路径仍覆盖 Maker。
- engine 占位的 recipe §6 已改指 `godot/`（此前“不产.tres”退役）。
