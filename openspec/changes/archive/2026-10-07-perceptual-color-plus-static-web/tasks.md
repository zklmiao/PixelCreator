# Tasks — perceptual-color-plus-static-web

## wt-A 管线轴（`feat/oklch-bayer`；拥有 `tools/*.mjs` + `tools/*.test.mjs`（placeholder 除外）+ `palettes/` 只读 + 资产再生成；禁碰 schema/assets JSON 手改/openspec/docs/web/engine-placeholder）

- [x] A1 OKLCH 默认色距：`mapFrameToPalette` 默认距离换 `oklchDistance`（`euclideanDistance` 保留导出）；更新钉死欧氏落点的单测为 OKLCH 期望 + 保留一处欧氏对照；`map-selfcheck` 在 OKLCH 下仍报告 cross-view 收敛；character 跨视角同落点（cloak 红 front/back）不断言破裂。
- [x] A2 Bayer 启用与无害证明：scenery/building 的 `ordered-bayer` 路径单测（在板合成帧 none-vs-bayer `data`+`names` 字节一致 + 跑两遍确定性 + 覆盖高 chroma ramp 与透明边缘）；character/weapon/prop 传 `ordered-bayer` 必抛错单测；`error-diffusion` 全局拒收保持。
- [x] A3 全量再生成：`node tools/vectorize.mjs generate --asset` × 5（knight 64 视图 + 2 母版；静态各 8 视图 + 2 母版）+ `node tools/sheet.mjs export --asset knight_001 --out sheets`（16 文件）；新增/更新确定性回归测试（临时目录重跑字节一致）；OKLCH 致字节变化属预期，不以旧字节验收。
- [x] A4 全套自检全绿 + 提交：`node --test tools/*.test.mjs` 全绿；5× `node tools/asset-manifest.mjs validate assets/{knight,sword,house,crate,tree}_001/asset.json --check-files` 全 OK；单分支单 commit（或 squash），提交消息须含 `oklch`（合并 gate）。

## wt-B 呈现轴（`feat/static-web`；拥有 `web/**` + `docs/**` + `engine-placeholder/**` + `tools/placeholder.test.mjs`；禁碰 `tools/` 其余/`assets/`/`palettes/`/openspec）

- [x] B1 asset-shell kind-aware：`loadShell` 按 kind 加载 5 资产（默认 knight 兼容）；`checkShell` kind 分支（character 24-clip 要求不变；静态 idle-only 8-clip + preview idle）；`app.js` 资产切换器；旧 verify-1.1 全 OK + 新单测覆盖 5 资产 shell。
- [x] B2 matrix + prompt kind-aware：`buildMatrix` 静态 idle×4dir（单视角 4 格，双视角 8 格），character 12 格路径不动（verify-5.2 全 OK 不改一字）；`prompt.js` 静态 kind-keyed 句式（禁 bare-hands/sword-leg/single-character 人物约束词，必含 kind 对象词），character 输入输出字节不变（verify-4.1/4.2 全 OK）。
- [x] B3 verify + docs + 重拷：新增 `web/verify-static.mjs`（5 资产 shell + 静态 8 格矩阵 + 静态 prompt 值断言全 OK）；docs 落档（静态 web 支持说明）；gate（main 含 `oklch`）通过后 rebase 到新 main，再 `cp sheets/*.png sheets/*.map.json engine-placeholder/generic/`（字节复制；`placeholder.test.mjs` 同提交同步）；`node --test tools/*.test.mjs` + 全部 `web/verify-*.mjs` 全绿。

## 主控集成（不派工）

- [x] M1 先合 wt-A（--no-ff，主干全绿），gate 通知；wt-B 确认 rebase + 重拷后合（--no-ff）；回填 32 静态帧 `prompt_hash` 并 5× manifest 复验；勾本 tasks；agent-log 追加轮 2；sync/archive。
