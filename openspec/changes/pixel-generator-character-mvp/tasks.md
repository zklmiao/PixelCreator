# Tasks — pixel-generator-character-mvp

## 1. Web 脚手架与资产地基

- [x] 1.1 创建 Web 应用骨架与 `knight_001/` 资产目录结构，验证双母版槽与 asset.json 空壳可加载
- [x] 1.2 落地 5 套 palette JSON（character/weapon/building/prop/scenery v1 初稿），验证色值解析与透明占位排除

## 2. 像素量化管线

- [x] 2.1 实现下采样到 32/48/64/128 档 + 强制正方形 pad + alpha<128 丢弃，验证非正方形原型输出等大正方形
- [x] 2.2 实现欧氏最近色映射到类色板（含 OKLCH 替换钩子），验证前后视图同色收敛到同一色板项
- [x] 2.3 实现关平滑放大展示与 dither 开关（人物锁 none），验证 walk 连播无抖动并附量化前后对比文档

## 3. SVG 工程与清单

- [ ] 3.1 实现每像素 rect 矢量化（按色分组 g）与 body/limb/outfit/weapon-slot 语义重标，验证 view SVG 图层可单独选中
- [x] 3.2 实现 asset.json 读写（视角×方向×动作×帧、fps/loop/next、seed/prompt_hash、色板引用），验证缺格检测报错命名到 clip
- [ ] 3.3 实现 png/svg 参考合集导入与散装 SVG 导出/重导入回环，验证导出再导入零丢失

## 4. prompt 模板与派生位

- [x] 4.1 实现 10 字段表单拼英文 prompt（含 td/sd 基模板、方向/动作分句、固定 negative、denoise/seed 参数、v0.2 四约束：裸手/单人单帧/idle中立与walk stride分句/剑腿分离），验证示例骑士输出与模板一致
- [x] 4.2 预留外部 img2img 调用位（方向 0.5~0.6、帧继承 0.25~0.35、同角色 seed 锁定），验证无 key 时全流程仍可手动跑通

## 5. 动画矩阵与预览

- [ ] 5.1 实现 idle/walk/attack clip 存储与 fps/loop/next 语义（含 attack 播完回 idle），验证 attack 单次后落回同向 idle
- [ ] 5.2 实现 12 格 GIF 轮播矩阵 + td/sd 切换 + 缺格占位，验证 24 格全齐时矩阵满格播放、缺格时导出置灰

## 6. 拼表导出

- [ ] 6.1 实现一动作一表拼合（行序 fr/bk/lf/rt、无间距 1x、cell=asset.size）+ map.json，验证 64px walk 表几何为 192x256
- [ ] 6.2 实现 Maker/完整双模式（含 3 列截断补齐映射公示与 `$`命名），验证 4 帧 attack 在 Maker 模式下的映射说明正确

## 7. 首人物贯通验收

- [ ] 7.1 用 walk+attack × td/sd 跑通 knight_001 全 24 格并导出双模式表，验证 40~88 SVG 落盘、矩阵可播、双表可进引擎占位项目
