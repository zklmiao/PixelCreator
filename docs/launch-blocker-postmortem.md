# Postmortem — 桥服务器启动即死页（模块图被静态白名单切断）

**日期**：2026-10-07　**发现**：评审方人工启动（"你启动一个自己看看"）　**修复**：`585ee0b`
**影响**：轮 4（`web-cli-bridge`）落地后，凡通过 `node tools/server.mjs` 启动的页面均为**无 JS 的死骨架**——资产卡片墙不渲染、所有交互失效、确认条幽灵显示；仅 `npx serve`（服务整个仓库根）的旧启动方式不受影响。轮 5 的四区 UI 重设计合并后同样死页，但四区骨架与像素主题（纯 HTML/CSS）仍可见——这也是问题被"信息乱"反馈部分掩盖的原因。
**严重级**：Launch blocker（用户启动即复现）。

---

## 1. 现象

`node tools/server.mjs` 启动后打开 `/web/`，页面渲染出四区导航与像素主题（纯 HTML/CSS 部分），但：

- 资产卡片墙空壳：`#asset-cards` 0 子元素，`#asset-meta`/`#asset-status` 停在 HTML 初始值 `loading…`；
- `#bridge-status` 停在 HTML 默认值 `bridge: 检测中…`（健康检查明明返回 `{"ok":true,"assets":7,"queued":0}`）；
- `#confirm-bar` 带着原生 `hidden` 属性却**在页面上可见**（幽灵"确认写入"条）。

浏览器控制台无用户可操作的报错提示，`window.__errs`（冒泡阶段 error 监听）为空。

## 2. 排查时间线（假设 → 实验 → 结论）

### 2.1 确认"模块从未执行"
DOM 探针（page evaluate）：`.card` 数 = 0、`#asset-cards` 0 子元素、`#detail-name` = `—`、`#asset-status` = `loading…`、`#bridge-status` = `检测中…`——全部是 HTML 初始值，**没有任何一处被 JS 更新过**。结论：`app.js` 模块根本没有执行，而非"执行了一半"。

### 2.2 假设一：重写后引用了不存在的元素？→ 排除（部分命中）
静态比对 `app.js` 全部 45 个 `$('id')` 引用 vs 新 `index.html` 的 id：仅缺 `compare-grid`、`guardian-grid`（M2 时代对比区容器，四区重设计后已被 `#import-compare`/`#proto-compare` 取代）。二者都在 async 函数内引用（`initFixtureCompares` 甚至在 `.then` 链里被调用，其 rejection 不经过主链 catch）——但它们不该**同步**杀死模块启动。命中但不致命。

### 2.3 假设二：注入 error 监听抓错？→ 监听方式错了
注入 `window.addEventListener('error', …)`（冒泡阶段）+ 重载：`__errs` 为空。**教训**：资源加载失败（script/img 404、MIME 拒绝）不冒泡，必须 `capture: true`。改进后立即抓到：`resource http://…/web/app.js`——**app.js 的 `<script>` 资源本身加载失败**。

### 2.4 假设三：MIME / 缓存 / 语法？→ 全部排除
- `GET /web/app.js` → `200` + `content-type: text/javascript; charset=utf-8`（server MIME 表第 45 行正确）；
- `node --check web/app.js` 语法 OK；全部 import 的文件 curl 均 200；
- 无 Cache-Control/ETag/Last-Modified 头，`fetch(url, {cache:'reload'})` 强刷 + reload 后依旧——缓存假设排除。

### 2.5 关键转折：Node ESM 探针 + 逐模块二分
在仓库树用 Node 动态 import 逐模块探测（浏览器与 Node 对"缺失导出绑定"报同样的错）：

```
./web/lib/compare.js     OK（8 个导出齐全）
./web/lib/asset-shell.js OK
./web/lib/matrix.js      OK（Node 里能完整加载——文件级无问题！）
./web/lib/prompt.js      OK
./web/app.js             FAIL: window is not defined（仅因 Node 无 window，插桩行所致）
```

浏览器侧（页面原生 `import()` 逐模块）：`asset-shell ✓ compare ✓ img2img ✓ prompt ✓`，**唯独 `lib/matrix.js` → "Failed to fetch dynamically imported module: /web/lib/matrix.js"**。

### 2.6 根因
`web/lib/matrix.js` 头部：

```js
import { clipFrames, nextFrame } from '../../tools/clips.mjs';
```

浏览器解析为 `GET /tools/clips.mjs`，而桥服务器的静态白名单（`tools/server.mjs:33` `STATIC_PREFIXES`）只含 `/web/ /assets/ /sheets/ /palettes/ /fixtures/ /godot/` → **404** → matrix.js 加载失败 → 导入它的 app.js 连锁失败 → 整个模块图死亡。

**为何 Node 探测不到**：Node 解析相对路径走文件系统，`../../tools/clips.mjs` 真实存在且合法——这条失效面**只存在于"HTTP 服务 + 白名单"的浏览器语境**。

**为何设计如此**：matrix.js 头注释明写 "Reuses tools/clips.mjs … so app.js can import it and node verify can too"——作者有意复用；轮 4 bridge 提案的服务清单（`/web/ /assets/ /sheets/ /palettes/ /fixtures/ /godot/`）漏列了 `/tools/`，而全部验证手段（fs 类 verify、fetch 类自证）恰好都覆盖不到"浏览器模块解析"。

## 3. 为什么四轮都没暴露

| 盲区 | 说明 |
|---|---|
| verify 脚本全是 fs 断言 | 读的是磁盘文件，不经过 HTTP 层 |
| agent 自证用 fetch | fetch 只验证"能取到 200"，不执行 `type="module"` 的模块图 |
| M2 人工验收用的启动方式 | 当时还没有 bridge（`npx serve` 服务整根，`/tools/` 天然可达） |
| bridge 上线后无人工启动 | M3 验收聚焦 Godot/.tres；"信息乱"反馈看的是旧启动方式的页面 |

## 4. 修复（`585ee0b`，4 文件 + spec 修订）

| 文件 | 修复 |
|---|---|
| `tools/server.mjs` | `STATIC_PREFIXES` += `'/tools/': 'tools'`（根因修复：模块引用图必须可达；loopback-only，暴露自身源码可接受） |
| `web/index.html` | 导入区补回 `#compare-grid` + `#guardian-grid` 对比画廊容器（轮 5 卡 B1/B2 本要求"compare 视图列 fixtures/guardian compares"，迁移时容器丢失） |
| `web/app.js` | `initFixtureCompares` 补空值防御（对齐 `initGuardianCompares` 的既有守卫风格） |
| `web/styles.css` | `[hidden] { display: none !important; }`——修 `.confirm-bar` 的 display 规则压过 `hidden` 属性的幽灵显示 |
| `openspec/specs/web-bridge/spec.md` | 服务清单条款加入 `/tools/*` 并注明原因（matrix.js 的既定 import） |

**回归证明**：
- 浏览器（修复后服务）：`.card` = 7、fixture compares 3 + guardian compares 8、`#confirm-bar` 真不可见、`#bridge-status` = `bridge: 正常（7 资产，队列 0）`、详情区 knight_001 矩阵正常播放（截图存档于评审会话）；
- 突变回归：lab 中删除已落盘的 `guardian_sd_walk_fr1.svg` → verify-real-import `exit 1`（修复前 exit 0）；破坏 tres 写入器 → tres.test 红（修复前绿）；
- 全量：`node --test` 142/142；7× verify 全绿；7× manifest 全 OK；recipe 104 帧。

## 5. 教训与预防

1. **"agent 自证" ≠ 浏览器真实执行**：fetch/DOM 结构检查证明不了 `type="module"` 模块图可用。任何"网页可启动"的验收，必须包含至少一条**模块真实执行**的证据（如 `window.__bootLog` 类启动标记，或动态 import 的成功回执）。
2. **资源错误只在捕获阶段**：`window.addEventListener('error', h, true)` 才能抓到 script/img 资源加载失败；冒泡阶段只能抓未捕获异常。排查"模块静默死亡"第一步就应挂捕获监听。
3. **Node 侧可加载 ≠ 浏览器侧可达**：相对路径 import 在浏览器里经过 HTTP 服务与白名单，这是浏览器特有的失效面。新增服务端点时，应对既有模块引用图做**可达性审计**（遍历 import 闭包，逐一核对静态服务覆盖）。
4. **新服务上线必须配一次"用户路径"人工启动**：bridge 上线（轮 4）到发现（轮 5 后）隔了两轮，因为无人用"bridge 方式"启动过页面。
5. **预防性固化（建议，M4 可选）**：`verify-bridge.mjs` 增加一条静态审计——遍历 `web/` 与其 import 闭包（含跨目录 `../../tools/`），断言每条相对 import 都被 `STATIC_PREFIXES` 覆盖；新增端点忘加白名单时直接红。

## 6. 处置记录

- 修复提交：`585ee0b` fix(bridge): serve /tools/ static prefix, restore compare containers, guard [hidden] (launch blocker)
- 关联：web-bridge spec 修订（服务清单 + `/tools/*`）；轮 5 双 change 归档（`2026-10-24-web-cli-bridge`、`2026-10-24-web-shell-v2`）不受影响
- 运维：修复前启动的桥进程（如 3199 端口旧进程）需重启才能生效；`node tools/server.mjs` 重启即用新白名单
