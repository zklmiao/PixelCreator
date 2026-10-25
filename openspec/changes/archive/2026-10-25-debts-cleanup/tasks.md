# Tasks — debts-cleanup

## 单轴（主控执行：全部为既有工具执行/测试/文档/token 级改动）

- [x] C1 静态单帧表补齐：sword/crate（64）+ house/tree（128）各 2 PNG + 2 map 落盘 `sheets/`。
- [x] C2 svg-engineering 母版条款降格（MODIFIED delta，移除条件式）+ 归档时 CLI 同步主 spec。
- [x] C3 Bayer 效果测试：water 中点带 none 单色 / bayer 双色打散断言（探针依据注释在案）。
- [x] C4 verify-bridge 模块可达性审计：import 闭包 ⊆ STATIC_PREFIXES，缺失即红。
- [x] C5 UI 深冷调 token：styles.css `:root` 九 token 重写（色值全部仍取自项目色板）。
- [ ] C6 回归：全量测试 + 7 verify + 7× manifest + 浏览器截图核对新配色；突变证明（bayer 效果测试对"死 bayer"实现变红）。

## 主控集成（不派工）

- [ ] M1 评审（全套回归 + 新配色截图）→ --no-ff 归档（sync svg-engineering）→ agent-log/milestones 记录。
