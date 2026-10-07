// sheet.mjs — spritesheet export: one action one PNG + map.json (OpenSpec 6.1/6.2,
// Maker vs Full dual mode, td/sd never merged).
//
// PNG 库选型: pngjs@7.0.0 (MIT, 零传递依赖).
// 为什么是它: ①纯 JS 实现,无原生绑定(对比 sharp/canvas 需编译链,离线/CI
// 不可用);②同步 API(PNG.sync.write),与管线确定性单测风格一致;③node 生态
// 最常用的 PNG 编解码,API 稳定,输出字节确定(同输入同字节,无时间戳);
// ④零传递依赖, footprint 仅 package.json + lock + node_modules(已在
// .gitignore)。备选 upng-js 同样 MIT/纯 JS,但 node 侧同步读写不如 pngjs
// 顺手,故选 pngjs。
//
// 约束:库函数(buildSheet/encodePng)纯逻辑,不碰 fs(帧数据由调用方经
// svgToPixels 解码后传入,复用 3.3 解析器,禁止另起解析器);fs 只出现在
// loadActionFrames/exportSheets(CLI/批量脚本,动态 import)与 main()。
import { PNG } from 'pngjs';

export const SHEET_DIRS = ['fr', 'bk', 'lf', 'rt'];
export const SHEET_ROWS = SHEET_DIRS.length; // 4
export const MAKER_COLS = 3;
export const SHEET_ACTIONS = ['idle', 'walk', 'attack'];
export const SHEET_MODES = ['maker', 'full'];
export const STATIC_SHEET_KINDS = ['weapon', 'building', 'prop', 'scenery'];

function frameNumFromFile(file) {
  const m = String(file).match(/(\d+)\.svg$/);
  return m ? Number(m[1]) : 0;
}

function assertCell(cell) {
  if (!Number.isInteger(cell) || cell <= 0) {
    throw new Error(`asset.size must be a positive int cell, got ${JSON.stringify(cell)}`);
  }
}

// Maker/Full 共用的表文件名:Maker 带 `$` 前缀(RPG Maker 单表惯例,引擎不切分)。
export function sheetFileName(assetPrefix, perspective, action, mode) {
  const base = `${assetPrefix}_${perspective}_${action}`;
  return mode === 'maker' ? `$${base}.png` : `${base}.png`;
}

export function sheetMapName(assetPrefix, perspective, action, mode) {
  return `${sheetFileName(assetPrefix, perspective, action, mode)}.map.json`;
}

// buildSheet(asset, { perspective, action, mode, frames }) -> { rgba, w, h, map }.
// - 纯函数:不读盘。frames = [{ file, dir, data, w, h }],由调用方经 svgToPixels
//   解码(含 maker 垫帧所需的同向 idle 帧);缺帧直接抛错点名 clip/file。
// - 行序 fr/bk/lf/rt(4 行),零间距 1x,cell=asset.size。
// - Full:保原生帧数(cols=clips 帧数);Maker:强制 3 列(取 f1/f2/f3,不足用同向
//   idle 帧补,超长截断),mapping 公示 {kept, dropped, padded}。
// - perspective 必须为单个 'td'|'sd';数组/逗号串/缺失一律抛错(td/sd 永不合表)。
export function buildSheet(asset, { perspective, action, mode, frames } = {}) {
  if (Array.isArray(perspective) || typeof perspective !== 'string' || !['td', 'sd'].includes(perspective)) {
    throw new Error(
      `td/sd 永不合表: perspective must be a single 'td'|'sd', got ${JSON.stringify(perspective)}`,
    );
  }
  if (!SHEET_ACTIONS.includes(action)) {
    throw new Error(`action must be one of ${SHEET_ACTIONS.join(',')}, got ${JSON.stringify(action)}`);
  }
  if (!SHEET_MODES.includes(mode)) {
    throw new Error(`mode must be one of ${SHEET_MODES.join(',')}, got ${JSON.stringify(mode)}`);
  }
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('frames required: [{ file, dir, data, w, h }] decoded via svgToPixels (fs lives in CLI)');
  }
  const a = asset?.actions?.[action];
  if (!a) throw new Error(`missing clips: ${perspective}/${action} (action absent)`);
  const clips = a.clips?.[perspective];
  if (!clips) throw new Error(`missing clips: ${perspective}/${action} (perspective absent)`);
  const cell = asset.size;
  assertCell(cell);
  const byFile = new Map(frames.map((f) => [f.file, f]));

  const placed = []; // [{ file, dir, frame, col, row, kind }]
  const kept = [];
  const dropped = [];
  const padded = [];
  for (let row = 0; row < SHEET_DIRS.length; row++) {
    const dir = SHEET_DIRS[row];
    const list = clips[dir];
    if (!Array.isArray(list)) throw new Error(`missing clip: ${perspective}/${action}/${dir} (clip absent)`);
    const files = list.map((c) => c.file);
    if (mode === 'full') {
      files.forEach((file, c) => {
        placed.push({ file, dir, frame: frameNumFromFile(file), col: c, row, kind: 'kept' });
        kept.push(file);
      });
    } else {
      const keepN = Math.min(MAKER_COLS, files.length);
      for (let c = 0; c < keepN; c++) {
        placed.push({ file: files[c], dir, frame: frameNumFromFile(files[c]), col: c, row, kind: 'kept' });
        kept.push(files[c]);
      }
      for (let c = files.length; c < MAKER_COLS; c++) {
        const idleFile = asset.actions?.idle?.clips?.[perspective]?.[dir]?.[0]?.file;
        if (!idleFile) throw new Error(`missing idle pad source: ${perspective}/idle/${dir}`);
        placed.push({ file: idleFile, dir, frame: frameNumFromFile(idleFile), col: c, row, kind: 'padded' });
        padded.push({ col: c, dir, file: idleFile });
      }
      for (const file of files.slice(MAKER_COLS)) {
        dropped.push({ file, reason: 'maker-truncate:cols=3' });
      }
    }
  }
  const cols = mode === 'full' ? a.frames : MAKER_COLS;
  const w = cols * cell;
  const h = SHEET_ROWS * cell;
  const rgba = new Uint8ClampedArray(w * h * 4); // transparent fill, zero spacing 1x
  for (const p of placed) {
    const src = byFile.get(p.file);
    if (!src) throw new Error(`missing frame data: ${p.file} (decode it via svgToPixels first)`);
    if (src.w !== cell || src.h !== cell) {
      throw new Error(`${p.file}: sheet cell must be ${cell}x${cell}, got ${src.w}x${src.h}`);
    }
    const dx = p.col * cell;
    const dy = p.row * cell;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const si = (y * cell + x) * 4;
        const di = ((dy + y) * w + (dx + x)) * 4;
        rgba[di] = src.data[si];
        rgba[di + 1] = src.data[si + 1];
        rgba[di + 2] = src.data[si + 2];
        rgba[di + 3] = src.data[si + 3];
      }
    }
  }
  const map = {
    mode,
    asset: asset.id,
    perspective,
    action,
    size: cell,
    cell,
    cols,
    rows: SHEET_ROWS,
    sheet: sheetFileName(asset.asset, perspective, action, mode),
    fps: a.fps,
    loop: a.loop,
    next: a.next ?? null,
    frames: placed.map((p) => ({
      file: p.file,
      dir: p.dir,
      frame: p.frame,
      col: p.col,
      row: p.row,
      x: p.col * cell,
      y: p.row * cell,
      w: cell,
      h: cell,
      kind: p.kind,
    })),
    mapping: { kept, dropped, padded },
  };
  return { rgba, w, h, map };
}

// encodePng(rgba, w, h) -> Buffer (PNG bytes,经 pngjs 同步编码,确定性输出).
export function encodePng(rgba, w, h) {
  if (!Number.isInteger(w) || w <= 0 || !Number.isInteger(h) || h <= 0) {
    throw new Error(`dims must be positive ints, got ${w}x${h}`);
  }
  if (!(rgba instanceof Uint8ClampedArray) && !Buffer.isBuffer(rgba)) {
    throw new Error('rgba must be Uint8ClampedArray RGBA (or Buffer)');
  }
  if (rgba.length !== w * h * 4) throw new Error('rgba buffer length mismatch w*h*4');
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(rgba);
  return PNG.sync.write(png);
}

// loadActionFrames(assetDir, asset, perspective, action, mode?) -> frames[].
//(fs 在此批量 helper 内,动态 import;mode=maker 时顺带载入同向 idle 垫帧源。)
export async function loadActionFrames(assetDir, asset, perspective, action, mode = 'full') {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const { svgToPixels } = await import('./vectorize.mjs');
  const cell = asset.size;
  assertCell(cell);
  const out = [];
  const seen = new Set();
  const pushFile = (file, dir) => {
    if (seen.has(file)) return;
    seen.add(file);
    const svg = readFileSync(resolve(assetDir, file), 'utf8');
    const { data, w, h } = svgToPixels(svg, file);
    if (w !== cell || h !== cell) {
      throw new Error(`${file}: sheet cell must be ${cell}x${cell}, got ${w}x${h}`);
    }
    out.push({ file, dir, data, w, h });
  };
  const list = asset.actions?.[action]?.clips?.[perspective] ?? null;
  if (!list) throw new Error(`missing clips: ${perspective}/${action} (action absent)`);
  for (const d of SHEET_DIRS) {
    for (const clip of list[d] ?? []) pushFile(clip.file, d);
  }
  if (mode === 'maker') {
    for (const d of SHEET_DIRS) {
      if ((list[d] ?? []).length < MAKER_COLS) {
        const idleFile = asset.actions?.idle?.clips?.[perspective]?.[d]?.[0]?.file;
        if (!idleFile) throw new Error(`missing idle pad source: ${perspective}/idle/${d}`);
        pushFile(idleFile, d);
      }
    }
  }
  return out;
}

// buildStaticSheet(asset, { perspective, frames }) -> { rgba, w, h, map }.
// Static single-frame export (real-import-mvp ADDED, full-only):
// one PNG per perspective (`<prefix>_<persp>_idle.png`), 4 columns x 1 row,
// cell = asset.size, column order fr/bk/lf/rt. Pure function: no fs.
// frames = [{ file, dir, data, w, h }] decoded via svgToPixels (one idle frame
// per dir); missing/extra dirs throw. Maker mode SHALL NOT apply (no mode
// param at all). Knight dual-mode buildSheet below is untouched.
export function buildStaticSheet(asset, { perspective, frames } = {}) {
  if (Array.isArray(perspective) || typeof perspective !== 'string' || !['td', 'sd'].includes(perspective)) {
    throw new Error(
      `td/sd 永不合表: perspective must be a single 'td'|'sd', got ${JSON.stringify(perspective)}`,
    );
  }
  if (!STATIC_SHEET_KINDS.includes(asset?.kind)) {
    throw new Error(
      `static sheet needs kind ${STATIC_SHEET_KINDS.join('|')}, got ${JSON.stringify(asset?.kind)}`,
    );
  }
  const idle = asset?.actions?.idle;
  if (!idle) throw new Error(`missing clips: ${perspective}/idle (action absent)`);
  const clips = idle.clips?.[perspective];
  if (!clips) throw new Error(`missing clips: ${perspective}/idle (perspective absent)`);
  const cell = asset.size;
  assertCell(cell);
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('frames required: [{ file, dir, data, w, h }] decoded via svgToPixels (fs lives in CLI)');
  }
  const byFile = new Map(frames.map((f) => [f.file, f]));
  const placed = [];
  const kept = [];
  for (let col = 0; col < SHEET_DIRS.length; col++) {
    const dir = SHEET_DIRS[col];
    const list = clips[dir];
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(`missing clip: ${perspective}/idle/${dir} (clip absent)`);
    }
    const file = list[0].file;
    placed.push({ file, dir, frame: frameNumFromFile(file), col, row: 0, kind: 'kept' });
    kept.push(file);
  }
  const cols = SHEET_DIRS.length;
  const rows = 1;
  const w = cols * cell;
  const h = rows * cell;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (const p of placed) {
    const src = byFile.get(p.file);
    if (!src) throw new Error(`missing frame data: ${p.file} (decode it via svgToPixels first)`);
    if (src.w !== cell || src.h !== cell) {
      throw new Error(`${p.file}: sheet cell must be ${cell}x${cell}, got ${src.w}x${src.h}`);
    }
    const dx = p.col * cell;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const si = (y * cell + x) * 4;
        const di = (y * w + (dx + x)) * 4;
        rgba[di] = src.data[si];
        rgba[di + 1] = src.data[si + 1];
        rgba[di + 2] = src.data[si + 2];
        rgba[di + 3] = src.data[si + 3];
      }
    }
  }
  const map = {
    mode: 'full',
    asset: asset.id,
    perspective,
    action: 'idle',
    size: cell,
    cell,
    cols,
    rows,
    sheet: `${asset.asset}_${perspective}_idle.png`,
    fps: idle.fps,
    loop: idle.loop,
    next: idle.next ?? null,
    frames: placed.map((p) => ({
      file: p.file,
      dir: p.dir,
      frame: p.frame,
      col: p.col,
      row: p.row,
      x: p.col * cell,
      y: 0,
      w: cell,
      h: cell,
      kind: p.kind,
    })),
    mapping: { kept, dropped: [], padded: [] },
  };
  return { rgba, w, h, map };
}

// exportSheets(assetId?, outDir?) -> [{ sheet, map, w, h, mode, perspective, action, bytes }].
// 人物:walk+attack × td/sd × maker/full = 8 表 + idle × td/sd × full = 2 表,
// 共 10 表 + 10 map.json 落盘到 sheets/（idle 仅 Full：单帧无 Maker 形态）。
// 静态 idle-only 资产走单帧分支:td/sd 各 1 表 + 1 map(full-only,无 maker)。
export async function exportSheets(assetId = 'knight_001', outDir = 'sheets') {
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const assetDir = resolve(moduleDir, '..', 'assets', assetId);
  const out = resolve(moduleDir, '..', outDir);
  const asset = JSON.parse(readFileSync(resolve(assetDir, 'asset.json'), 'utf8'));
  mkdirSync(out, { recursive: true });
  const results = [];
  if (STATIC_SHEET_KINDS.includes(asset.kind)) {
    if (!asset.actions?.idle) throw new Error(`missing clips: idle (action absent) for static ${assetId}`);
    for (const perspective of asset.perspectives) {
      const frames = await loadActionFrames(assetDir, asset, perspective, 'idle', 'full');
      const { rgba, w, h, map } = buildStaticSheet(asset, { perspective, frames });
      const png = encodePng(rgba, w, h);
      writeFileSync(resolve(out, map.sheet), png);
      const mapFile = `${map.sheet}.map.json`;
      writeFileSync(resolve(out, mapFile), JSON.stringify(map, null, 2) + '\n');
      console.log(`OK: ${map.sheet} ${w}x${h} (full, ${perspective}/idle) + ${mapFile}`);
      results.push({ sheet: map.sheet, map: mapFile, w, h, mode: 'full', perspective, action: 'idle', bytes: png.length });
    }
    return results;
  }
  for (const action of ['walk', 'attack']) {
    for (const perspective of asset.perspectives) {
      for (const mode of ['full', 'maker']) {
        const frames = await loadActionFrames(assetDir, asset, perspective, action, mode);
        const { rgba, w, h, map } = buildSheet(asset, { perspective, action, mode, frames });
        const png = encodePng(rgba, w, h);
        writeFileSync(resolve(out, map.sheet), png);
        const mapFile = `${map.sheet}.map.json`;
        writeFileSync(resolve(out, mapFile), JSON.stringify(map, null, 2) + '\n');
        console.log(`OK: ${map.sheet} ${w}x${h} (${mode}, ${perspective}/${action}) + ${mapFile}`);
        results.push({ sheet: map.sheet, map: mapFile, w, h, mode, perspective, action, bytes: png.length });
      }
    }
  }
  if (asset.actions?.idle) {
    for (const perspective of asset.perspectives) {
      const frames = await loadActionFrames(assetDir, asset, perspective, 'idle', 'full');
      const { rgba, w, h, map } = buildSheet(asset, { perspective, action: 'idle', mode: 'full', frames });
      const png = encodePng(rgba, w, h);
      writeFileSync(resolve(out, map.sheet), png);
      const mapFile = `${map.sheet}.map.json`;
      writeFileSync(resolve(out, mapFile), JSON.stringify(map, null, 2) + '\n');
      console.log(`OK: ${map.sheet} ${w}x${h} (full, ${perspective}/idle) + ${mapFile}`);
      results.push({ sheet: map.sheet, map: mapFile, w, h, mode: 'full', perspective, action: 'idle', bytes: png.length });
    }
  }
  return results;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'selfcheck') {
    console.log('OK: use node --test tools/sheet.test.mjs for 6.1/6.2 verification');
    return;
  }
  if (cmd === 'export') {
    let assetId = 'knight_001';
    let outDir = 'sheets';
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--asset' && rest[i + 1]) assetId = rest[i + 1];
      else if (rest[i].startsWith('--asset=')) assetId = rest[i].slice('--asset='.length);
      else if (rest[i] === '--out' && rest[i + 1]) outDir = rest[i + 1];
      else if (rest[i].startsWith('--out=')) outDir = rest[i].slice('--out='.length);
    }
    await exportSheets(assetId, outDir);
    return;
  }
  console.error('usage: node tools/sheet.mjs selfcheck | node tools/sheet.mjs export [--asset knight_001] [--out sheets]');
  process.exit(2);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e));
    process.exit(1);
  });
}
