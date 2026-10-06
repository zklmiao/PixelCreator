# Tasks — static-kinds-godot-adapter

## wt-A 管线轴（feat/static-kinds；拥有 tools/*.mjs + tools/*.test.mjs（placeholder 除外）+ palettes/ + 资产 SVG 再生成；禁碰 schema/assets 骨架/openspec/docs/web）

- [ ] A1 kind-aware validator：按冻结 schema 实现 `validateAsset` kind 分支（palette/size/action 门控 per-kind），character 行为零改；新增 kind 门控单测（错 palette、超尺寸、static 含 walk、命名越界必须红），旧套件不改一字全绿。
- [ ] A2 static 生成器与再生成：`vectorize.mjs` 新增 per-kind synth（sword/house/crate/tree，导出供测）+ `generate` 支持四资产；落盘 32 SVG（4 资产 × 8 格）；新增 distinctness（每资产 8 格两两不同）+ 确定性（重跑字节一致）回归测试。
- [ ] A3 五资产全绿：`node tools/asset-manifest.mjs validate <5 asset.json> --check-files` 全 OK；`node --test tools/*.test.mjs` 全绿；`node tools/sheet.mjs export`（knight）重导字节一致（静态无表不导出）。

## wt-B 呈现轴（feat/godot-adapter；拥有 web/** + docs/** + engine-placeholder/** + tools/placeholder.test.mjs；禁碰 tools/ 其余/assets/palettes/openspec）

- [ ] B1 IMPORT-RECIPE 可执行：`engine-placeholder/godot-atlas/IMPORT-RECIPE.md`（map 零改；region/fps/loop/next 映射 + gap #13–#20 逐项映射或缺省声明 + knight_td_walk  worked example）+ 配方自检脚本（由 shipped maps 重导 region 并断言几何内）；自检全绿。
- [ ] B2 generic 扩展与锁步：`generic/` 扩展说明（静态沿用直读契约；本轮若零新增文件则只加章节）+ 同提交更新 `tools/placeholder.test.mjs` 精确文件集断言；`node --test tools/placeholder.test.mjs` 全绿；全套 `node --test tools/*.test.mjs` + web/verify 全绿。

## 主控集成（不派工）

- [ ] M1 评审双分支（log/diff + 全套自检 + 突变/确定性抽查）后依次 --no-ff 合并，merge 前后主干全绿。
