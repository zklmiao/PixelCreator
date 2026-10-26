// app.js — web-shell-v2 four-zone workspace (zero dependencies).
// Zones: library / import / export / prompt. web/lib behavior contracts are
// frozen (guarded by web/verify-*.mjs); this file only re-wires presentation.
import { loadShell, ASSET_IDS, ASSET_URLS, assetUrlFor } from './lib/asset-shell.js';
import { buildPrompt, validateFields, validateStaticFields, STATIC_EXAMPLES, FIXED_NEGATIVE, KNIGHT_EXAMPLE } from './lib/prompt.js';
import { buildMatrix, createPlayer, tickPlayer, canExport } from './lib/matrix.js';
import {
  COMPARE_FIXTURES, prototypeCompareUrlFor, prototypeInputFor,
  GUARDIAN_MAP_URL, guardianSourcesFromMap, guardianCompareUrlFor,
} from './lib/compare.js';

const $ = (id) => document.getElementById(id);

// ---------- state ----------
let currentAssetId = 'knight_001';
let importTargetId = 'potion_001';
let bridgeJobId = null;
let bridgeBusy = false;
let matrixAsset = null;
let matrixPersp = 'td';
let cellStates = [];
let playing = true;

const isStaticKind = (k) => ['weapon', 'building', 'prop', 'scenery'].includes(k ?? 'character');
const ACTION_ZH = { idle: '待机', walk: '行走', attack: '攻击' };
const DIR_ZH = { fr: '前 ↓', bk: '后 ↑', lf: '左 ←', rt: '右 →' };
function matrixTitle(action, dir) {
  return `${ACTION_ZH[action] ?? action} · ${DIR_ZH[dir] ?? dir}`;
}
const kindOf = (asset) => asset?.kind ?? 'character';

// ---------- nav ----------
function showZone(name) {
  for (const z of document.querySelectorAll('.zone')) z.hidden = z.id !== `zone-${name}`;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.zone === name);
}

function initNav() {
  for (const t of document.querySelectorAll('.tab')) {
    t.addEventListener('click', () => showZone(t.dataset.zone));
  }
  // delegate: result rows / dynamic content may add data-goto anytime
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (b) showZone(b.dataset.goto);
  });
}

// ---------- asset meta + dev panel ----------
async function loadAssetMeta(assetId) {
  currentAssetId = assetId;
  const box = $('asset-status');
  try {
    const { asset, shell, slots } = await loadShell(assetUrlFor(assetId));
    $('master-td').textContent = slots.find((s) => s.perspective === 'td').file;
    $('master-sd').textContent = slots.find((s) => s.perspective === 'sd').file;
    $('asset-meta').textContent =
      `size ${asset.size} · ${asset.palette} · seed ${asset.seed} · ${clipsTotal(asset)} clips`;
    box.textContent = shell.ok ? 'OK' : `FAIL: ${shell.errors.join('; ')}`;
    box.dataset.ok = String(shell.ok);
    return asset;
  } catch (e) {
    box.textContent = `FAIL: ${e.message}`;
    box.dataset.ok = 'false';
    throw e;
  }
}

function clipsTotal(asset) {
  let n = 0;
  for (const a of Object.values(asset.actions ?? {})) {
    for (const persp of Object.values(a.clips ?? {})) {
      for (const list of Object.values(persp)) n += list.length;
    }
  }
  return n;
}

// ---------- library: cards ----------
function idlePreviewUrl(assetId, asset) {
  const f = asset?.actions?.idle?.clips?.td?.fr?.[0]?.file;
  return f ? `../assets/${assetId}/${f}` : null;
}

async function initCards() {
  const grid = $('asset-cards');
  grid.innerHTML = '';
  for (const id of ASSET_IDS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.asset = id;
    const img = document.createElement('img');
    img.alt = `${id} idle preview`;
    const ph = document.createElement('p');
    ph.className = 'ph';
    ph.hidden = true;
    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = id;
    const badge = document.createElement('span');
    badge.className = 'badge';
    card.append(img, ph, name, badge);
    card.addEventListener('click', () => selectAsset(id));
    grid.appendChild(card);
    try {
      const asset = await loadAsset(id);
      sizeCache[id] = asset.size;
      const kind = kindOf(asset);
      badge.textContent = kind;
      img.dataset.kind = kind;
      const url = idlePreviewUrl(id, asset);
      if (url) {
        img.addEventListener('error', () => {
          img.hidden = true;
          ph.hidden = false;
          ph.textContent = '预览缺失';
        });
        img.src = url;
      } else {
        img.hidden = true;
        ph.hidden = false;
        ph.textContent = '预览缺失';
      }
    } catch (e) {
      img.hidden = true;
      ph.hidden = false;
      ph.textContent = `加载失败: ${e.message}`;
    }
  }
  // A2: placeholder card closes the grid visually and hooks the M5 wizard.
  const newCard = document.createElement('button');
  newCard.type = 'button';
  newCard.className = 'card new';
  newCard.textContent = '+ 新建资产';
  newCard.title = '跳转 Prompt 工作台（新建资产向导在 M5 规划中）';
  newCard.addEventListener('click', () => {
    showZone('prompt');
    $('m5-hint').hidden = false;
  });
  grid.appendChild(newCard);
}

function markSelectedCard(id) {
  for (const c of document.querySelectorAll('.card')) {
    c.classList.toggle('selected', c.dataset.asset === id);
  }
}

async function loadAsset(id) {
  const { asset } = await loadShell(assetUrlFor(id));
  return asset;
}

async function selectAsset(id) {
  currentAssetId = id;
  importTargetId = id;
  markSelectedCard(id);
  $('import-target').textContent = id;
  $('export-asset').textContent = id;
  try {
    const asset = await loadAssetMeta(id);
    sizeCache[id] = asset.size;
    matrixAsset = asset;
    const kind = kindOf(asset);
    $('detail-name').textContent = id;
    $('detail-kind').textContent = kind;
    matrixPersp = asset.preview?.perspective ?? 'td';
    $('m-persp').value = matrixPersp;
    renderMatrix(matrixPersp);
    updatePrototypeCompare();
    await refreshImg2imgPanel();
  } catch (e) {
    $('detail-name').textContent = id;
    $('detail-kind').textContent = '—';
    $('asset-meta').textContent = `FAIL: ${e.message}`;
  }
}

// ---------- matrix player (with play/pause/step) ----------
function clearMatrixTimers() {
  for (const s of cellStates) if (s.timer) clearInterval(s.timer);
  cellStates = cellStates.map((s) => ({ ...s, timer: null }));
}

function armMatrixTimers() {
  clearMatrixTimers();
  if (!playing) return;
  for (const s of cellStates) {
    if (s.missing) continue;
    s.timer = setInterval(() => stepCell(s), s.player.durationMs);
  }
}

function stepCell(s) {
  try {
    s.player = tickPlayer(s.player);
    s.img.src = `../assets/${matrixAsset.id}/${s.player.file}`;
  } catch {
    if (s.timer) clearInterval(s.timer);
    s.timer = null;
  }
}

function renderMatrix(persp) {
  const grid = $('matrix-grid');
  const hint = $('export-hint');
  if (!grid || !matrixAsset) return;
  matrixPersp = persp;
  clearMatrixTimers();
  cellStates = [];
  grid.innerHTML = '';
  const { cells } = buildMatrix(matrixAsset, persp);
  const missing = cells.filter((c) => c.missing);
  for (const cell of cells) {
    const el = document.createElement('div');
    el.className = `cell${cell.missing ? ' missing' : ''}`;
    el.dataset.action = cell.action;
    el.dataset.dir = cell.dir;
    const head = document.createElement('h4');
    head.textContent = matrixTitle(cell.action, cell.dir);
    head.title = `${cell.action} · ${cell.dir}`;
    el.appendChild(head);
    if (cell.missing) {
      const ph = document.createElement('p');
      ph.className = 'ph';
      ph.textContent = `missing ${cell.clipId}`;
      el.appendChild(ph);
      const gen = document.createElement('button');
      gen.type = 'button';
      gen.textContent = '生成此格';
      gen.title = `generate ${cell.clipId} —— 当前为整资产重生成（单格模式 wt-A 合并后自动生效）`;
      gen.dataset.clip = cell.clipId;
      el.appendChild(gen);
    } else {
      const img = document.createElement('img');
      img.alt = `${cell.action} ${cell.dir} frame`;
      img.src = `../assets/${matrixAsset.id}/${cell.files[0]}`;
      el.appendChild(img);
      const meta = document.createElement('p');
      meta.className = 'meta';
      meta.textContent = `${cell.files.length}f · ${cell.durationMs.toFixed(0)}ms`;
      el.appendChild(meta);
      const player = createPlayer(matrixAsset, persp, cell.action, cell.dir, 0);
      cellStates.push({ player, img, el, missing: false, timer: null });
    }
    grid.appendChild(el);
  }
  armMatrixTimers();
  const ex = canExport(matrixAsset);
  hint.textContent = ex.ok
    ? `已就绪：全部 ${cells.length * 2} clips 在位，可在导出中心出表`
    : `导出暂不可用（缺 ${ex.missing.length}：${ex.missing.slice(0, 3).join('; ')}${ex.missing.length > 3 ? '…' : ''}）——缺失格可点"生成此格"补齐`;
}

function initMatrixControls() {
  $('m-persp')?.addEventListener('change', (e) => renderMatrix(e.target.value));
  $('ctl-play')?.addEventListener('click', () => {
    playing = !playing;
    $('ctl-play').textContent = playing ? '⏸ 暂停' : '▶ 播放';
    if (playing) armMatrixTimers();
    else clearMatrixTimers();
  });
  $('ctl-step')?.addEventListener('click', () => {
    for (const s of cellStates) if (!s.missing) stepCell(s);
  });
  $('matrix-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-clip]');
    if (!btn) return;
    startJob('/api/generate', { assetId: currentAssetId, clip: btn.dataset.clip }, `重新生成 ${btn.dataset.clip}`);
  });
}

async function reloadMatrixFor(assetId) {
  await selectAsset(assetId);
}

// ---------- compare sliders (source left / quantized right, draggable) ----------
function makeCompareSlider(fig, url, size) {
  for (const n of [...fig.querySelectorAll(':scope > :not(figcaption)')]) n.remove();
  const img = document.createElement('img');
  img.alt = 'quantize compare';
  img.hidden = true;
  const ph = document.createElement('p');
  ph.className = 'ph';
  ph.hidden = true;
  const cv = document.createElement('canvas');
  cv.className = 'compare-canvas';
  cv.hidden = true;
  const bar = document.createElement('div');
  bar.className = 'divider';
  bar.hidden = true;
  fig.append(cv, bar, img, ph);
  const paint = (pct) => {
    const w = cv.width, h = cv.height, srcW = w - size;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // checkerboard underlay so transparent pixels stay visible on dark theme
    const chk = 8;
    for (let yy = 0; yy < h; yy += chk) {
      for (let xx = 0; xx < w; xx += chk) {
        ctx.fillStyle = ((xx / chk | 0) + (yy / chk | 0)) % 2 ? '#9aa4b2' : '#dde3ea';
        ctx.fillRect(xx, yy, Math.min(chk, w - xx), Math.min(chk, h - yy));
      }
    }
    // base: quantized right panel stretched to full canvas
    ctx.drawImage(comp.img, srcW, 0, size, h, 0, 0, w, h);
    // overlay: source left panel clipped to the divider
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, Math.max(1, Math.round((w * pct) / 100)), h);
    ctx.clip();
    ctx.drawImage(comp.img, 0, 0, srcW, h, 0, 0, w, h);
    ctx.restore();
    bar.style.left = `${pct}%`;
    bar.dataset.side = pct < 50 ? 'src' : 'out';
  };
  const comp = { img: null, w: 0, h: 0 };
  const image = new Image();
  image.addEventListener('error', () => {
    cv.hidden = true;
    bar.hidden = true;
    ph.hidden = false;
    ph.textContent = `对比图缺失：${url}`;
  });
  image.addEventListener('load', () => {
    img.hidden = true;
    ph.hidden = true;
    comp.img = image;
    comp.w = image.width;
    comp.h = image.height;
    cv.width = image.width;
    cv.height = image.height;
    cv.hidden = false;
    bar.hidden = false;
    paint(50);
    // center the divider under the pointer on first click
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect();
      paint(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    };
  });
  image.src = url;
  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const move = (ev) => {
      const r = cv.getBoundingClientRect();
      paint(Math.min(100, Math.max(0, ((ev.clientX - r.left) / r.width) * 100)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  return { paint };
}

// ---------- compare sections (fixtures / guardian / prototype) ----------
function parkFigure(fig, text) {
  let ph = fig.querySelector(':scope > .ph');
  if (!ph) {
    ph = document.createElement('p');
    ph.className = 'ph';
    fig.appendChild(ph);
  }
  ph.hidden = false;
  ph.textContent = text;
}

async function initFixtureCompares() {
  const fixtureGrid = $('compare-grid');
  if (!fixtureGrid) return;
  for (const { name, url } of COMPARE_FIXTURES) {
    const fig = document.createElement('figure');
    fig.className = 'compare';
    fig.dataset.compareName = name;
    const cap = document.createElement('figcaption');
    cap.textContent = `${name} — 左原始 / 右量化`;
    fig.append(cap);
    fixtureGrid.appendChild(fig);
    makeCompareSlider(fig, url, 64);
  }
}

async function initGuardianCompares() {
  const grid = $('guardian-grid');
  if (!grid) return;
  let map;
  try {
    const res = await fetch(GUARDIAN_MAP_URL);
    if (!res.ok) throw new Error(`fetch ${GUARDIAN_MAP_URL}: ${res.status}`);
    map = await res.json();
  } catch (e) {
    parkFigure(grid, `guardian 对比缺失：${e.message}`);
    return;
  }
  const sources = guardianSourcesFromMap(map);
  if (sources.length === 0) {
    parkFigure(grid, 'guardian-map.json 无源帧');
    return;
  }
  grid.innerHTML = '';
  for (const base of sources) {
    const fig = document.createElement('figure');
    fig.className = 'compare';
    fig.dataset.compareName = base;
    const cap = document.createElement('figcaption');
    cap.textContent = `${base} — 左源帧 / 右量化`;
    fig.append(cap);
    grid.appendChild(fig);
    makeCompareSlider(fig, guardianCompareUrlFor(base), 64);
  }
}

function updatePrototypeCompare() {
  const fig = $('proto-compare');
  if (!fig) return;
  fig.innerHTML = '';
  const cap = document.createElement('figcaption');
  cap.textContent = `prototypes/${importTargetId}/input.compare.png — 左源图 / 右量化（拖动分隔对比）`;
  fig.append(cap);
  makeCompareSlider(fig, prototypeCompareUrlFor(importTargetId), assetSizeOf(importTargetId));
}

const sizeCache = {};
function assetSizeOf(id) {
  return sizeCache[id] ?? 64;
}

// ---------- import flow (two-phase write via bridge) ----------
// PNG keeps the direct-upload path (byte-identical to previous rounds).
// JPEG/WebP decode in the browser, get a marquee crop stage, and only the
// cropped region is re-encoded to PNG — the bridge keeps receiving PNG only
// (tools stay pngjs-only).
function initImportFlow() {
  $('b-import-file')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type === 'image/png') {
      await uploadImportFile(f);
      return;
    }
    try {
      await openCropStage(f);
    } catch (err) {
      bridgeStatus(`无法解码 ${f.type}：${err.message}`);
    }
  });
  $('crop-upload')?.addEventListener('click', async () => {
    const blob = await cropSelectionToPng();
    if (!blob) {
      bridgeStatus('请先在图上拖出框选区域');
      return;
    }
    await uploadImportFile(blob, 'crop.png');
    closeCropStage();
  });
  $('crop-full')?.addEventListener('click', async () => {
    const blob = await cropWholeToPng();
    if (!blob) return;
    await uploadImportFile(blob, 'full.png');
    closeCropStage();
  });
  $('crop-cancel')?.addEventListener('click', closeCropStage);
  $('proto-refresh')?.addEventListener('click', () => updatePrototypeCompare());
}

async function uploadImportFile(fileOrBlob, fallbackName) {
  const name = fileOrBlob.name ?? fallbackName ?? 'upload.png';
  try {
    setBridgeBusy(true);
    const fd = new FormData();
    fd.append('assetId', importTargetId);
    fd.append('file', fileOrBlob, name);
    const res = await fetch('/api/import', { method: 'POST', body: fd });
    const j = await res.json();
    if (!res.ok) throw new Error(j.message ?? 'import failed');
    bridgeJobId = j.jobId;
    const p = j.preview ?? {};
    $('import-compare').hidden = false;
    // paint the in-memory compare preview served by the bridge
    makeCompareSlider($('import-compare'), j.links.compare, assetSizeOf(importTargetId));
    addConfirmRow(bridgeJobId, `导入 ${name}（${p.srcW}×${p.srcH}）→ 将写入 ${p.willWrite?.length ?? '?'} 个文件，备份 ${p.willBackup ?? '?'} 个`, 'confirm-slot');
    setBridgeBusy(false);
  } catch (err) {
    setBridgeBusy(false);
    bridgeStatus(`导入失败：${err.message}`);
  }
}

// ---------- crop stage (JPEG/WebP -> marquee -> PNG blob) ----------
let cropState = null;

async function openCropStage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('browser decode failed'));
    img.src = url;
  });
  URL.revokeObjectURL(url);
  cropState = { img, rect: null, scale: 1, drag: null };
  $('import-compare').hidden = true;
  $('crop-stage').hidden = false;
  $('crop-upload').disabled = true;
  drawCropBase();
}

function closeCropStage() {
  cropState = null;
  $('crop-stage').hidden = true;
}

function drawCropBase() {
  const cv = $('crop-canvas');
  const img = cropState.img;
  const maxW = Math.min(960, img.width);
  cropState.scale = Math.min(maxW / img.width, 1);
  cv.width = Math.round(img.width * cropState.scale);
  cv.height = Math.round(img.height * cropState.scale);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  paintMarquee(ctx, cv);
}

function paintMarquee(ctx, cv) {
  if (!cropState.rect) return;
  const r = cropState.rect;
  ctx.save();
  ctx.fillStyle = '#00000088';
  ctx.fillRect(0, 0, cv.width, r.y);
  ctx.fillRect(0, r.y + r.h, cv.width, cv.height - r.y - r.h);
  ctx.fillRect(0, r.y, r.x, r.h);
  ctx.fillRect(r.x + r.w, r.y, cv.width - r.x - r.w, r.h);
  ctx.strokeStyle = '#6ac8e8';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

function initCropStage() {
  const cv = $('crop-canvas');
  const toImg = (ev) => {
    const r = cv.getBoundingClientRect();
    const x = Math.round((ev.clientX - r.left) / cropState.scale);
    const y = Math.round((ev.clientY - r.top) / cropState.scale);
    return {
      x: Math.max(0, Math.min(cropState.img.width, x)),
      y: Math.max(0, Math.min(cropState.img.height, y)),
    };
  };
  cv.addEventListener('pointerdown', (e) => {
    if (!cropState) return;
    e.preventDefault();
    cropState.drag = toImg(e);
    cropState.rect = { x: cropState.drag.x, y: cropState.drag.y, w: 0, h: 0 };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!cropState?.drag) return;
    const p = toImg(e);
    cropState.rect = {
      x: Math.min(cropState.drag.x, p.x),
      y: Math.min(cropState.drag.y, p.y),
      w: Math.abs(p.x - cropState.drag.x),
      h: Math.abs(p.y - cropState.drag.y),
    };
    drawCropBase();
  });
  cv.addEventListener('pointerup', (e) => {
    if (!cropState?.drag) return;
    const p = toImg(e);
    cropState.rect = {
      x: Math.min(cropState.drag.x, p.x),
      y: Math.min(cropState.drag.y, p.y),
      w: Math.abs(p.x - cropState.drag.x),
      h: Math.abs(p.y - cropState.drag.y),
    };
    cropState.drag = null;
    if (cropState.rect.w < 8 || cropState.rect.h < 8) cropState.rect = null;
    $('crop-upload').disabled = !cropState.rect;
    drawCropBase();
  });
}

async function cropSelectionToPng() {
  if (!cropState?.rect) return null;
  return cropToPng(cropState.rect);
}

async function cropWholeToPng() {
  if (!cropState) return null;
  return cropToPng({ x: 0, y: 0, w: cropState.img.width, h: cropState.img.height });
}

function cropToPng(rect) {
  const cv = document.createElement('canvas');
  cv.width = rect.w;
  cv.height = rect.h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cropState.img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
}

// ---------- img2img orchestration panel (guardian only; 501/未配显式降级) ----------
const DERIVE_GATE = (asset) => kindOf(asset) === 'character' && asset.id !== 'knight_001';

function setImg2imgStatus(text) {
  const el = $('img2img-status');
  if (el) el.textContent = text;
}

function setOrchestrationEnabled(on) {
  for (const id of ['b-inbetween', 'b-derive-td']) {
    const el = $(id);
    if (el) el.disabled = !on || bridgeBusy;
  }
}

async function refreshImg2imgPanel() {
  const panel = $('img2img-panel');
  const gate = DERIVE_GATE(matrixAsset);
  if (panel) panel.hidden = !gate;
  if (!gate) return;
  try {
    const r = await fetch('/api/img2img/status');
    if ([404, 405, 501].includes(r.status)) {
      throw Object.assign(new Error('编排端点未上线（wt-A 合并后可用）'), { soft: true });
    }
    if (!r.ok) throw new Error(`status ${r.status}`);
    const j = await r.json();
    const names = j.configured ?? [];
    $('img2img-badges').textContent = names.length ? names.join('、') : '未配置';
    setOrchestrationEnabled(names.length > 0);
    setImg2imgStatus(
      names.length === 0
        ? '未配置 provider——在服务端环境变量配置后刷新（配置指引见 docs/img2img.md）'
        : '选择上方编排动作：先预览将写入的文件，确认后落盘',
    );
  } catch (e) {
    $('img2img-badges').textContent = '—';
    setOrchestrationEnabled(false);
    setImg2imgStatus(`img2img 不可用：${e.message}`);
  }
}

async function startImg2imgJob(path, label) {
  if (bridgeBusy) return;
  try {
    setBridgeBusy(true);
    const j = await bridgePost(path, { assetId: currentAssetId });
    bridgeJobId = j.jobId ?? null;
    const p = j.preview ?? {};
    addConfirmRow(bridgeJobId, `${label}：将写入 ${p.willWrite?.length ?? '?'} 个文件，备份 ${p.willBackup ?? '?'} 个`, 'confirm-slot-img2img');
    setImg2imgStatus(`${label}：预览就绪，确认后落盘（AI 帧采纳前请过目三帧对比）`);
    setBridgeBusy(false);
  } catch (e) {
    // server img2img route garbles Error.message via object spread — map by
    // code so the user always sees an explicit reason (dev panel keeps raw).
    const friendly = {
      PROVIDER_NOT_CONFIGURED: 'provider 未配置：在服务端环境变量设置 PIXE_IMG_PROVIDER（gemini|openai|sd-webui），详见 docs/img2img.md',
      NO_ORCHESTRATION_MAP: '目标资产没有已入库的编排 map（当前仅 guardian_001 支持编排）',
    }[e.code];
    setImg2imgStatus(`${label} 失败：${friendly ?? `${e.message}${[404, 405, 501].includes(e.status) ? '（编排端点未上线，wt-A 合并后可用）' : ''}`}`);
    bridgeLog(`error: ${e.code ?? ''} ${e.message}`);
    setBridgeBusy(false);
  }
}

function initImg2imgPanel() {
  $('b-inbetween')?.addEventListener('click', () =>
    startImg2imgJob('/api/img2img/inbetween', 'AI 补帧（2→3 帧）'),
  );
  $('b-derive-td')?.addEventListener('click', () =>
    startImg2imgJob('/api/img2img/derive-td', '派生俯视角（td 真源）'),
  );
}

// ---------- export center + bridge (two-phase, SSE) ----------
function bridgeStatus(text) {
  const el = $('bridge-status');
  if (el) el.textContent = text;
  const dot = $('bridge-dot');
  if (dot) {
    const ok = !/未|NOT|失败|error/i.test(text);
    dot.classList.toggle('bad', !ok);
    dot.classList.toggle('ok', ok);
    dot.title = text;
  }
}

function bridgeLog(line) {
  const el = $('job-log');
  if (el) el.textContent += `${line}\n`;
}

function setBridgeBusy(busy) {
  bridgeBusy = busy;
  setAllConfirmButtons(busy);
  for (const id of ['b-validate', 'b-generate', 'b-sheets', 'b-tres', 'b-inbetween', 'b-derive-td']) {
    const el = $(id);
    if (el) el.disabled = busy;
  }
}

async function bridgePost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const j = await res.json();
  if (!res.ok) {
    const err = new Error(j.message ?? `${res.status} ${path}`);
    err.code = j.code;
    err.status = res.status;
    throw err;
  }
  return j;
}

async function startJob(path, body, label) {
  try {
    setBridgeBusy(true);
    const j = await bridgePost(path, body);
    bridgeJobId = j.jobId ?? null;
    const p = j.preview ?? {};
    const summary = exportSummary(label, p, body?.clip);
    renderExportResult('preview', { label, p, summary });
    if (!bridgeJobId && j.ok !== undefined) {
      bridgeStatus(`${label}：完成（无写入）`);
      bridgeLog(JSON.stringify(j).slice(0, 300));
      setBridgeBusy(false);
      return;
    }
    addConfirmRow(bridgeJobId, `${label}：将写入 ${p.willWrite?.length ?? '?'} 个文件，备份 ${p.willBackup ?? '?'} 个`, 'confirm-slot-export');
    bridgeStatus(`${label}：预览就绪，确认后落盘`);
    setBridgeBusy(false);
  } catch (e) {
    renderExportResult('error', { label, message: e.message });
    bridgeStatus(`${label} 失败：${e.message}（bridge 未运行？请先 node tools/server.mjs）`);
    setBridgeBusy(false);
  }
}

async function runValidate() {
  try {
    setBridgeBusy(true);
    const j = await bridgePost('/api/validate', { assetId: currentAssetId });
    renderExportResult('validate', j);
    bridgeStatus(j.ok ? '校验：通过' : `校验：未通过（${(j.errors ?? []).length + (j.missing ?? []).length} 项，见结果区）`);
    bridgeLog(`validate: ${JSON.stringify(j).slice(0, 300)}`);
    setBridgeBusy(false);
  } catch (e) {
    renderExportResult('error', { label: '校验', message: e.message });
    bridgeStatus(`校验 失败：${e.message}（bridge 未运行？请先 node tools/server.mjs）`);
    setBridgeBusy(false);
  }
}

// A3: fact-based summary lines from client-side asset data (no invention).
function exportSummary(label, p, clip) {
  if (!matrixAsset) return '';
  if (label === '导出拼表') {
    const isStatic = isStaticKind(kindOf(matrixAsset));
    if (isStatic) {
      const s = matrixAsset.size;
      return `静态单帧表 ${4 * s}x${s}（td/sd 各一张）`;
    }
    const frames = { walk: matrixAsset.actions?.walk?.frames ?? 3, attack: matrixAsset.actions?.attack?.frames ?? 4 };
    const s = matrixAsset.size;
    return `walk ${frames.walk * s}x${4 * s} · attack ${frames.attack * s}x${4 * s}（Full+Maker × td/sd，行序 fr/bk/lf/rt）`;
  }
  if (label === '导出 .tres') return `${clipsTotal(matrixAsset)} 动画 → godot/${matrixAsset.id}.spriteframes.tres`;
  if (label.startsWith('重新生成')) {
    return clip ? `单格 ${clip}（wt-A 合并后真单格生效）` : `整资产 ${clipsTotal(matrixAsset)} 个视图文件`;
  }
  return '';
}

function renderExportResult(kind, data) {
  const box = $('export-result');
  if (!box) return;
  box.hidden = false;
  if (kind === 'validate') {
    if (data.ok) {
      box.className = 'result ok';
      box.innerHTML = `<p>✅ 校验通过：${clipsTotal(matrixAsset)} clips 在位，asset.json 与磁盘文件均正常，可导出。</p>`;
    } else {
      const items = [
        ...(data.errors ?? []).map((x) => `❌ ${x}`),
        ...(data.missing ?? []).map((x) => `❌ 缺失 ${x}`),
      ];
      box.className = 'result bad';
      box.innerHTML =
        `<p>⛔ 校验未通过（${items.length} 项）——缺格资产不可导出：</p><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` +
        `<p><button type="button" class="linklike" data-goto="library">去资产库查看/补齐</button></p>`;
    }
    return;
  }
  if (kind === 'preview') {
    const files = data.p?.willWrite ?? [];
    box.className = 'result info';
    box.innerHTML =
      `<p>${data.label}：将写入 ${files.length} 个文件${data.summary ? ` · ${data.summary}` : ''}</p><ul>` +
      `${files.slice(0, 8).map((f) => `<li>${f}</li>`).join('')}${files.length > 8 ? `<li>…共 ${files.length} 项</li>` : ''}</ul>`;
    return;
  }
  box.className = 'result bad';
  box.innerHTML = `<p>⛔ ${data.label} 失败：${data.message}</p>`;
}

// B5: confirm rows — one row per jobId, multiple previews coexist, per-row
// confirm/SSE; SSE 'error' with data = job failure (row turns red), builtin
// error without data = stream close (row notes it, log keeps details).
function addConfirmRow(jobId, text, slotId) {
  const slot = $(slotId);
  if (!slot) return;
  const row = document.createElement('div');
  row.className = 'confirm-row';
  row.dataset.job = jobId;
  const span = document.createElement('span');
  span.className = 'confirm-text';
  span.textContent = text;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'confirm-btn';
  btn.textContent = '确认写入';
  btn.dataset.job = jobId;
  if (bridgeBusy) btn.disabled = true;
  btn.addEventListener('click', () => confirmJob(jobId, row));
  row.append(span, btn);
  slot.appendChild(row);
}

function setAllConfirmButtons(busy) {
  for (const b of document.querySelectorAll('.confirm-btn')) b.disabled = busy;
}

async function confirmJob(jobId, row) {
  if (!jobId || !row || row.dataset.done) return;
  try {
    setBridgeBusy(true);
    await bridgePost(`/api/jobs/${jobId}/confirm`, {});
    bridgeStatus('已确认——执行中…');
    const src = new EventSource(`/api/jobs/${jobId}/events`);
    src.addEventListener('progress', (e) => bridgeLog(`progress: ${e.data}`));
    src.addEventListener('log', (e) => bridgeLog(`log: ${e.data}`));
    src.addEventListener('done', async (e) => {
      bridgeStatus('完成——矩阵已刷新');
      bridgeLog(`done: ${e.data}`);
      src.close();
      setBridgeBusy(false);
      row.classList.add('done');
      row.querySelector('.confirm-text').textContent = `✅ 完成：${e.data}`;
      row.dataset.done = '1';
      setTimeout(() => row.remove(), 8000);
      await reloadMatrixFor(currentAssetId);
      await initCards();
      markSelectedCard(currentAssetId);
    });
    src.addEventListener('error', (e) => {
      src.close();
      setBridgeBusy(false);
      if (e.data) {
        // server-reported job failure: keep row, turn red (distinct from a
        // plain stream close, which just re-enables the button).
        row.classList.add('failed');
        row.querySelector('.confirm-text').textContent = `⛔ 作业失败：${e.data}`;
        bridgeLog(`job error: ${e.data}`);
      } else {
        row.classList.add('stream-closed');
        row.querySelector('.confirm-btn').disabled = false;
        bridgeLog('stream closed（作业可能仍在执行，结果以矩阵/日志为准）');
      }
      bridgeJobId = null;
    });
  } catch (e) {
    bridgeStatus(`confirm 失败：${e.message}`);
    setBridgeBusy(false);
  }
}

function initBridge() {
  const hv = async () => {
    try {
      const r = await fetch('/api/health');
      const j = await r.json();
      bridgeStatus(`bridge: 正常（${j.assets} 资产，队列 ${j.queued}）`);
    } catch {
      bridgeStatus('bridge 未运行——请先 node tools/server.mjs，然后刷新页面');
    }
  };
  hv();
  $('b-validate')?.addEventListener('click', () => runValidate());
  $('b-generate')?.addEventListener('click', () =>
    startJob('/api/generate', { assetId: currentAssetId }, '重新生成 SVG'),
  );
  $('b-sheets')?.addEventListener('click', () =>
    startJob('/api/sheet/export', { assetId: currentAssetId }, '导出拼表'),
  );
  $('b-tres')?.addEventListener('click', () =>
    startJob('/api/tres/export', { assetId: currentAssetId }, '导出 .tres'),
  );
}

// ---------- prompt workbench (behavior frozen) ----------
const formKind = () => $('f-kind').value;

function readForm() {
  const kind = formKind();
  if (isStaticKind(kind)) {
    return {
      kind,
      object: $('f-sobject').value,
      colors: $('f-scolors').value,
      vibe: $('f-svibe').value,
      perspective: $('f-persp').value,
      seed: $('f-seed').value === '' ? '' : Number($('f-seed').value),
    };
  }
  return {
    kind: 'character',
    charClass: $('f-class').value,
    body: $('f-body').value,
    outfit: $('f-outfit').value,
    colors: $('f-colors').value,
    weapon: $('f-weapon').value,
    hair: $('f-hair').value,
    cape: $('f-cape').value,
    vibe: $('f-vibe').value,
    perspective: $('f-persp').value,
    seed: $('f-seed').value === '' ? '' : Number($('f-seed').value),
  };
}

function fillForm(v) {
  if ((v.kind ?? 'character') !== 'character') {
    $('f-kind').value = v.kind;
    syncKindFields();
    $('f-sobject').value = v.object ?? '';
    $('f-scolors').value = v.colors ?? '';
    $('f-svibe').value = v.vibe ?? '';
    $('f-persp').value = v.perspective ?? 'td';
    $('f-seed').value = v.seed ?? 2002;
    return;
  }
  $('f-kind').value = 'character';
  syncKindFields();
  $('f-class').value = v.charClass ?? '';
  $('f-body').value = v.body ?? '';
  $('f-outfit').value = v.outfit ?? '';
  $('f-colors').value = v.colors ?? '';
  $('f-weapon').value = v.weapon ?? '';
  $('f-hair').value = v.hair ?? '';
  $('f-cape').value = v.cape ?? '';
  $('f-vibe').value = v.vibe ?? '';
  $('f-persp').value = v.perspective ?? 'td';
  $('f-seed').value = v.seed ?? 1234;
}

function syncKindFields() {
  const staticMode = isStaticKind(formKind());
  $('char-fields').hidden = staticMode;
  $('static-fields').hidden = !staticMode;
  // static assets are idle-only: lock action to idle
  for (const o of $('f-action').options) o.disabled = staticMode && o.value !== 'idle';
  if (staticMode) $('f-action').value = 'idle';
}

function renderPrompt() {
  const fields = readForm();
  const kind = fields.kind ?? 'character';
  const out = $('prompt-out');
  const v = isStaticKind(kind) ? validateStaticFields(fields) : validateFields(fields);
  if (!v.ok) {
    out.textContent = `表单未完成：${v.errors.join('; ')}`;
    return;
  }
  const perspective = fields.perspective === '' ? 'td' : fields.perspective;
  const dir = $('f-dir').value;
  const action = isStaticKind(kind) ? 'idle' : $('f-action').value;
  const seed = fields.seed === '' ? 1234 : fields.seed;
  try {
    const r = buildPrompt({ ...fields, seed }, { perspective, dir, action, seed });
    out.textContent =
      `positive:\n${r.positive}\n\nnegative:\n${r.negative}\n\n` +
      `perspective=${r.perspective} dir=${r.dir} action=${r.action} denoise=${r.denoise} seed=${r.seed} hash=${r.prompt_hash}` +
      (r.provider_note ? `\nprovider_note=${r.provider_note}` : '');
  } catch (e) {
    out.textContent = `FAIL: ${e.message}`;
  }
}

function initForm() {
  fillForm(KNIGHT_EXAMPLE);
  $('f-neg').value = FIXED_NEGATIVE;
  const ids = ['f-class', 'f-body', 'f-outfit', 'f-colors', 'f-weapon', 'f-hair', 'f-cape', 'f-vibe', 'f-persp', 'f-seed', 'f-dir', 'f-action', 'f-kind', 'f-sobject', 'f-scolors', 'f-svibe'];
  for (const id of ids) {
    $(id).addEventListener('input', renderPrompt);
    $(id).addEventListener('change', () => {
      if (id === 'f-kind') syncKindFields();
      renderPrompt();
    });
  }
  $('f-reset-knight').addEventListener('click', () => {
    fillForm(isStaticKind(formKind()) ? STATIC_EXAMPLES[formKind()] : KNIGHT_EXAMPLE);
    renderPrompt();
  });
  renderPrompt();
}

// ---------- startup ----------
initNav();
initForm();
initMatrixControls();
initBridge();
initImportFlow();
initCropStage();
initImg2imgPanel();
initCards()
  .then(() => selectAsset(currentAssetId))
  .then(() => {
    initFixtureCompares();
    initGuardianCompares();
    updatePrototypeCompare();
  })
  .catch((e) => bridgeStatus(`初始化失败：${e.message}`));
