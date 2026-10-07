# 真实导入人工查看（M2 compare 视图 + 6 资产矩阵）

`web/` 新增量化对比区（读 `fixtures/import/*.compare.png`，左原图 / 右量化结果）
与 6 资产切换（含 `potion_001`）。本文把人工从零带到看见。

## 1. 人工查看路径（3 步）

1. 仓库根起本地 server（例 `npx serve`，根目录执行，保持默认端口后记住地址）。
2. 浏览器打开 `/web/`（如 `http://localhost:3000/web/`）。
3. 先看 `M2 Compare view` 对比区（I_Chest01 / I_Key01 / I_GoldCoin 三张并排图），
   再用资产切换器切 6 资产（knight_001 默认，potion_001 在末位）看矩阵：
   人物 12 格/视角，静态（含 potion）4 格/视角（SVG 未生成前允许 missing 占位）。

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
  并排尺寸公式 + 6 shells 全 OK（`loadShell` 禁在 node 下调，走 fs +
  `checkShell`）+ potion 8 格形态（只断形态不断满格）+ character 回归。
- 人物红线：`verify-1.1/4.1/4.2/5.2` 四文件不改一字且全绿。
- `web/lib/*.js`（含新增 `compare.js`）零依赖（`node:` 禁入）；verify 脚本不受此限。
