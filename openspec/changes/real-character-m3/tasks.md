# Tasks — real-character-m3

## wt-A 管线轴（`feat/m3-tracks`；拥有 `tools/*.mjs` + `tools/*.test.mjs`（placeholder 除外）+ `fixtures/guardian/` + `godot/` 新目录 + guardian/house/tree 再生成；禁碰 schema/openspec/docs/web/engine-placeholder；`assets/house_001`+`tree_001` 仅 `size` 字段授权改）

- [ ] A1 guardian 导入与 fixtures：amg1 8 GIF 经 System.Drawing 转 PNG 入库 `fixtures/guardian/`（32x32 RGBA + f1≠f2 断言）+ `guardian-map.json`（clip → 源 GIF 名，复用宣言：idle f1 / walk f1,f2 / attack f2,f1）；`import-prototype --map` 多槽扩展；40 视图 + 2 母版落盘（td = sd 像素复制，占位测试钉 td==sd 字节）；guardian 6 Full + 4 Maker sheets 导出（idle 仅 Full；walk/attack 双模式，Maker 按既有 f1,f2+idle-pad 路径；出不了则 docs 注明）；
- [ ] A2 `.tres` 生成器：`tools/tres.mjs`（`exportTres(assetId)` + CLI）：只读 Full maps → `godot/<id>.spriteframes.tres`（knight 24 动画 / guardian 24 动画，名 `{persp}/{action}/{dir}`，speed=fps，loop 映射，filter 缺省写 docs）；顺手补 knight idle sheets（Full-only，+2 PNG +2 map，既有欠账；确有阻塞则 docs/recipe §6 声明无 idle）；测试值断言（动画名集/regions/帧数 + 最小单动画 golden）；recipe 映射一致性复核。
- [ ] A3 128 实测：house_001 + tree_001 `size`→128（单字段授权改）+ synth motif 重跑（8+2 文件各）；同步旧 64 尺寸断言；几何/确定性回归（临时目录重跑字节一致）。
- [ ] A4 全量自检 + 提交：`node --test tools/*.test.mjs` 全绿；7× manifest `--check-files` 全 OK（含 guardian）；guardian export + tres 可重跑；单 commit，消息含 `feat(m3)`（例：`feat(m3): guardian import plus tres generator plus 128 tiers (A1-A4)`，gate 判式见卡）。

## wt-B 呈现轴（`feat/m3-view`；拥有 `web/**` + `docs/**` + recipe §6 修文；禁碰 `tools/`/`assets/`/`palettes/`/`fixtures/`/`godot/`/openspec）

- [ ] B1 7 资产切换：`ASSET_IDS`/`ASSET_URLS` 扩 guardian_001 + 同提交同步 `verify-static` 精确断言到 7；guardian 矩阵 40 视图经既有 `buildMatrix`（td 占位按正常视角消费）；旧 5 verify 不改一字全绿。
- [ ] B2 guardian 验收 + docs：`verify-real-import.mjs` 增 guardian provenance 段（map 在位 + 8 源 PNG + 复用宣言一致 + td==sd 占位）；compare 视图列 guardian fixture compares；`docs/real-import.md` 扩展（td 占位声明、GIF→PNG 转换说明、128 档说明）；recipe §6 "不产.tres" 改指 `godot/`。
- [ ] B3 尾巴（gate 后）：rebase 到新 main → guardian SVG/compare 在位确认 → 全套 DoD 重跑（测试数以实际为准，预期 ≥136）→ 补发尾巴报告。

## 主控集成（不派工）

- [ ] M1 先合 wt-A（--no-ff，主干全绿），通知；wt-B 尾巴确认后合（--no-ff）；勾本 tasks；agent-log 追加轮 4；milestones M3 刷新；sync/archive。
