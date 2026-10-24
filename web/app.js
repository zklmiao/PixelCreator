// app.js — web-shell-v2 four-zone workspace (zero dependencies).
// Zones: library / import / export / prompt. web/lib behavior contracts are
// frozen (guarded by web/verify-*.mjs); this file only re-wires presentation.
import { loadShell, ASSET_IDS, ASSET_URLS, assetUrlFor } from './lib/asset-shell.js';
import { buildPrompt, validateFields, FIXED_NEGATIVE, KNIGHT_EXAMPLE } from './lib/prompt.js';
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
  for (const b of document.querySelectorAll('[data-goto]')) {
    b.addEventListener('click', () => showZone(b.dataset.goto));
  }
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
    head.textContent = `${cell.action} · ${cell.dir}`;
    el.appendChild(head);
    if (cell.missing) {
      const ph = document.createElement('p');
      ph.className = 'ph';
      ph.textContent = `missing ${cell.clipId}`;
      el.appendChild(ph);
      const gen = document.createElement('button');
      gen.type = 'button';
      gen.textContent = '生成此格';
      gen.title = `generate ${cell.clipId}`;
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
    startJob('/api/generate', { assetId: currentAssetId }, `重新生成 ${btn.dataset.clip}`);
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
    ctx.clearRect(0, 0, w, h);
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
function initImportFlow() {
  $('b-import-file')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setBridgeBusy(true);
      const fd = new FormData();
      fd.append('assetId', importTargetId);
      fd.append('file', f, f.name);
      const res = await fetch('/api/import', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? 'import failed');
      bridgeJobId = j.jobId;
      const p = j.preview ?? {};
      $('import-compare').hidden = false;
      // paint the in-memory compare preview served by the bridge
      makeCompareSlider($('import-compare'), j.links.compare, assetSizeOf(importTargetId));
      showConfirm(
        `导入 ${f.name}（${p.srcW}×${p.srcH}）→ 将写入 ${p.willWrite?.length ?? '?'} 个文件，备份 ${p.willBackup ?? '?'} 个`,
        'confirm-slot',
      );
      setBridgeBusy(false);
    } catch (err) {
      setBridgeBusy(false);
      bridgeStatus(`导入失败：${err.message}`);
    }
  });
  $('proto-refresh')?.addEventListener('click', () => updatePrototypeCompare());
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
  const c = $('b-confirm');
  if (c) c.disabled = busy || !bridgeJobId;
  for (const id of ['b-validate', 'b-generate', 'b-sheets', 'b-tres']) {
    const el = $(id);
    if (el) el.disabled = busy;
  }
}

function showConfirm(text, slotId) {
  const bar = $('confirm-bar');
  $('confirm-text').textContent = text;
  $(slotId).appendChild(bar);
  bar.hidden = false;
  const c = $('b-confirm');
  c.disabled = bridgeBusy || !bridgeJobId;
}

async function bridgePost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.message ?? `${res.status} ${path}`);
  return j;
}

async function startJob(path, body, label) {
  try {
    setBridgeBusy(true);
    const j = await bridgePost(path, body);
    bridgeJobId = j.jobId ?? null;
    const p = j.preview ?? {};
    if (!bridgeJobId && j.ok !== undefined) {
      bridgeStatus(`${label}：完成（无写入）`);
      bridgeLog(JSON.stringify(j).slice(0, 300));
      setBridgeBusy(false);
      return;
    }
    showConfirm(
      `${label}：将写入 ${p.willWrite?.length ?? '?'} 个文件，备份 ${p.willBackup ?? '?'} 个（Δ${p.bytesDelta ?? 'n/a'} 字节）`,
      'confirm-slot-export',
    );
    bridgeStatus(`${label}：预览就绪，确认后落盘`);
    setBridgeBusy(false);
  } catch (e) {
    bridgeStatus(`${label} 失败：${e.message}（bridge 未运行？请先 node tools/server.mjs）`);
    setBridgeBusy(false);
  }
}

async function confirmJob() {
  if (!bridgeJobId) return;
  try {
    setBridgeBusy(true);
    await bridgePost(`/api/jobs/${bridgeJobId}/confirm`, {});
    bridgeStatus('已确认——执行中…');
    const src = new EventSource(`/api/jobs/${bridgeJobId}/events`);
    src.addEventListener('progress', (e) => bridgeLog(`progress: ${e.data}`));
    src.addEventListener('log', (e) => bridgeLog(`log: ${e.data}`));
    src.addEventListener('done', async (e) => {
      bridgeStatus('完成——矩阵已刷新');
      bridgeLog(`done: ${e.data}`);
      src.close();
      setBridgeBusy(false);
      bridgeJobId = null;
      $('confirm-bar').hidden = true;
      await reloadMatrixFor(currentAssetId);
      await initCards();
      markSelectedCard(currentAssetId);
    });
    src.addEventListener('error', (e) => {
      bridgeLog(`error: ${e.data ?? 'stream closed'}`);
      src.close();
      setBridgeBusy(false);
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
  $('b-validate')?.addEventListener('click', () =>
    startJob('/api/validate', { assetId: currentAssetId }, '校验'),
  );
  $('b-generate')?.addEventListener('click', () =>
    startJob('/api/generate', { assetId: currentAssetId }, '重新生成 SVG'),
  );
  $('b-sheets')?.addEventListener('click', () =>
    startJob('/api/sheet/export', { assetId: currentAssetId }, '导出拼表'),
  );
  $('b-tres')?.addEventListener('click', () =>
    startJob('/api/tres/export', { assetId: currentAssetId }, '导出 .tres'),
  );
  $('b-confirm')?.addEventListener('click', confirmJob);
}

// ---------- prompt workbench (behavior frozen) ----------
function readForm() {
  return {
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

function renderPrompt() {
  const fields = readForm();
  const v = validateFields({ ...fields, seed: fields.seed === '' ? '' : fields.seed });
  const out = $('prompt-out');
  if (!v.ok) {
    out.textContent = `表单未完成：${v.errors.join('; ')}`;
    return;
  }
  const perspective = $('f-persp').value;
  const dir = $('f-dir').value;
  const action = $('f-action').value;
  const seed = fields.seed === '' ? 1234 : fields.seed;
  try {
    const r = buildPrompt({ ...fields, seed }, { perspective, dir, action, seed });
    out.textContent =
      `positive:\n${r.positive}\n\nnegative:\n${r.negative}\n\n` +
      `perspective=${r.perspective} dir=${r.dir} action=${r.action} denoise=${r.denoise} seed=${r.seed} hash=${r.prompt_hash}`;
  } catch (e) {
    out.textContent = `FAIL: ${e.message}`;
  }
}

function initForm() {
  fillForm(KNIGHT_EXAMPLE);
  $('f-neg').value = FIXED_NEGATIVE;
  for (const id of ['f-class', 'f-body', 'f-outfit', 'f-colors', 'f-weapon', 'f-hair', 'f-cape', 'f-vibe', 'f-persp', 'f-seed', 'f-dir', 'f-action']) {
    $(id).addEventListener('input', renderPrompt);
    $(id).addEventListener('change', renderPrompt);
  }
  $('f-reset-knight').addEventListener('click', () => {
    fillForm(KNIGHT_EXAMPLE);
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
initCards()
  .then(() => selectAsset(currentAssetId))
  .then(() => {
    initFixtureCompares();
    initGuardianCompares();
    updatePrototypeCompare();
  })
  .catch((e) => bridgeStatus(`初始化失败：${e.message}`));
