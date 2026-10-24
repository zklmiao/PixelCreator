// app.js — 1.1 shell + 4.1 form wiring (zero dependencies).
import { loadShell, ASSET_IDS, ASSET_URLS, assetUrlFor } from './lib/asset-shell.js';
import { buildPrompt, validateFields, FIXED_NEGATIVE, KNIGHT_EXAMPLE } from './lib/prompt.js';
import { buildMatrix, createPlayer, tickPlayer, canExport } from './lib/matrix.js';
import { COMPARE_FIXTURES, prototypeCompareUrlFor, prototypeInputFor } from './lib/compare.js';
import {
  GUARDIAN_MAP_URL, guardianSourcesFromMap, guardianCompareUrlFor,
} from './lib/compare.js';

const $ = (id) => document.getElementById(id);

let currentAssetId = 'knight_001';
let bridgeJobId = null;
let bridgeBusy = false;

async function initAsset(assetId = currentAssetId) {
  currentAssetId = assetId;
  const box = $('asset-status');
  try {
    const { asset, shell, slots } = await loadShell(assetUrlFor(currentAssetId));
    $('master-td').textContent = slots.find((s) => s.perspective === 'td').file;
    $('master-sd').textContent = slots.find((s) => s.perspective === 'sd').file;
    $('asset-meta').textContent = `${asset.id} · ${asset.kind ?? 'character'} · size ${asset.size} · ${asset.palette} · seed ${asset.seed}`;
    box.textContent = shell.ok ? 'OK: dual-master shell loadable' : `FAIL: ${shell.errors.join('; ')}`;
    box.dataset.ok = String(shell.ok);
    const kindEl = $('asset-kind');
    if (kindEl) kindEl.textContent = `kind=${asset.kind ?? 'character'} (idle-only=${['weapon', 'building', 'prop', 'scenery'].includes(asset.kind ?? '')})`;
  } catch (e) {
    box.textContent = `FAIL: ${e.message} (serve repo root, e.g. npx serve, then open /web/)`;
    box.dataset.ok = 'false';
  }
}

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
    out.textContent = `form incomplete: ${v.errors.join('; ')}`;
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

initAsset();
initForm();
initMatrix();
initAssetSwitcher();
initCompare();
initBridge();

// M2 compare view: fixture imgs carry data-compare URLs; any load failure
// parks a named placeholder hint instead of breaking the page. The local
// prototype slot follows the same left/right convention under the
// gitignored prototypes/<id>/input.compare.png path.
function wireCompareImg(img, ph, missingText) {
  if (!img) return;
  img.addEventListener('error', () => {
    img.hidden = true;
    if (ph) {
      ph.hidden = false;
      ph.textContent = missingText;
    }
  });
  img.addEventListener('load', () => {
    img.hidden = false;
    if (ph) ph.hidden = true;
  });
}

function updatePrototypeCompare(assetId) {
  const img = $('cmp-proto');
  const ph = $('cmp-proto-ph');
  const meta = $('proto-meta');
  if (!img) return;
  const url = prototypeCompareUrlFor(assetId);
  if (meta) meta.textContent = url;
  img.hidden = false;
  if (ph) ph.hidden = true;
  img.src = url;
}

function initCompare() {
  for (const { name, url } of COMPARE_FIXTURES) {
    const img = $(`cmp-${name}`);
    const ph = $(`cmp-${name}-ph`);
    if (!img) continue;
    wireCompareImg(img, ph, `missing ${url} (fixtures land after the wt-A import merge; page stays usable)`);
    img.src = url;
  }
  const protoImg = $('cmp-proto');
  const protoPh = $('cmp-proto-ph');
  wireCompareImg(
    protoImg,
    protoPh,
    `missing prototypes/<id>/input.compare.png — put the source at ${prototypeInputFor('potion_001')} and run the import command below`,
  );
  const sel = $('proto-asset');
  if (sel) {
    sel.addEventListener('change', () => updatePrototypeCompare(sel.value));
    updatePrototypeCompare(sel.value);
  } else {
    updatePrototypeCompare('potion_001');
  }
  initGuardianCompare();
}

// M3 guardian compares: data-driven from fixtures/guardian/guardian-map.json
// (clip -> source), so the view never hardcodes source names. Any failure
// (map or image) parks a named placeholder hint; the page never crashes.
async function initGuardianCompare() {
  const grid = $('guardian-grid');
  const status = $('guardian-status');
  if (!grid) return;
  const parkAll = (text) => {
    grid.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'ph';
    p.textContent = text;
    grid.appendChild(p);
  };
  let map;
  try {
    const res = await fetch(GUARDIAN_MAP_URL);
    if (!res.ok) throw new Error(`fetch ${GUARDIAN_MAP_URL} failed: ${res.status}`);
    map = await res.json();
  } catch (e) {
    if (status) status.textContent = `missing ${GUARDIAN_MAP_URL} (guardian fixtures land with the wt-A m3 merge; page stays usable)`;
    else parkAll(`missing ${GUARDIAN_MAP_URL} (guardian fixtures land with the wt-A m3 merge; page stays usable)`);
    return;
  }
  const sources = guardianSourcesFromMap(map);
  if (sources.length === 0) {
    if (status) status.textContent = `empty source list in ${GUARDIAN_MAP_URL} (no guardian compares to show)`;
    else parkAll(`empty source list in ${GUARDIAN_MAP_URL} (no guardian compares to show)`);
    return;
  }
  grid.innerHTML = '';
  sources.forEach((base, i) => {
    const url = guardianCompareUrlFor(base);
    const fig = document.createElement('figure');
    fig.className = 'compare';
    fig.dataset.compareName = base;
    const cap = document.createElement('figcaption');
    cap.textContent = `${base} — left source / right quantized`;
    fig.appendChild(cap);
    const img = document.createElement('img');
    img.id = `cmp-guardian-${i}`;
    img.alt = `${base} compare: source left, quantized right`;
    const ph = document.createElement('p');
    ph.className = 'ph';
    ph.hidden = true;
    fig.appendChild(img);
    fig.appendChild(ph);
    wireCompareImg(img, ph, `missing ${url} (guardian compare not yet landed; page stays usable)`);
    img.src = url;
    grid.appendChild(fig);
  });
}

// CLI bridge wiring (web-cli-bridge): every write op is two-phase.
// POST /api/* returns { jobId, preview }; the confirm button commits it
// (server backs up then writes); SSE streams progress into #job-log.

function bridgeStatus(text) {
  const el = $('bridge-status');
  if (el) el.textContent = text;
}

function bridgeLog(line) {
  const el = $('job-log');
  if (el) el.textContent += `${line}\n`;
}

function setBridgeUiBusy(busy) {
  bridgeBusy = busy;
  const c = $('b-confirm');
  if (c) c.disabled = busy || !bridgeJobId;
  for (const id of ['b-validate', 'b-generate', 'b-sheets', 'b-tres']) {
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
  if (!res.ok) throw new Error(j.message ?? `${res.status} ${path}`);
  return j;
}

async function startJob(path, body, label) {
  try {
    setBridgeUiBusy(true);
    const j = await bridgePost(path, body);
    bridgeJobId = j.jobId ?? null;
    const p = j.preview ?? {};
    bridgeStatus(
      `${label}: willWrite ${p.willWrite?.length ?? '?'}, willBackup ${p.willBackup ?? '?'}, delta ${p.bytesDelta ?? 'n/a'} — click Confirm write to apply`,
    );
    if (!bridgeJobId && j.ok !== undefined) {
      // sync response (validate)
      bridgeLog(JSON.stringify(j).slice(0, 200));
    }
    setBridgeUiBusy(false);
  } catch (e) {
    bridgeStatus(`bridge error: ${e.message} (is \`node tools/server.mjs\` running?)`);
    setBridgeUiBusy(false);
  }
}

async function confirmJob() {
  if (!bridgeJobId) return;
  try {
    setBridgeUiBusy(true);
    await bridgePost(`/api/jobs/${bridgeJobId}/confirm`, {});
    bridgeStatus('confirmed — queued; streaming progress…');
    const src = new EventSource(`/api/jobs/${bridgeJobId}/events`);
    src.onmessage = (e) => bridgeLog(`${e.type ?? 'msg'}: ${e.data}`);
    src.addEventListener('progress', (e) => bridgeLog(`progress: ${e.data}`));
    src.addEventListener('log', (e) => bridgeLog(`log: ${e.data}`));
    src.addEventListener('done', async (e) => {
      bridgeStatus('done — matrix reloading…');
      bridgeLog(`done: ${e.data}`);
      src.close();
      setBridgeUiBusy(false);
      bridgeJobId = null;
      await reloadMatrixFor(currentAssetId);
    });
    src.addEventListener('error', (e) => {
      bridgeLog(`error: ${e.data ?? 'stream closed'}`);
      src.close();
      setBridgeUiBusy(false);
      bridgeJobId = null;
    });
  } catch (e) {
    bridgeStatus(`confirm error: ${e.message}`);
    setBridgeUiBusy(false);
  }
}

function initBridge() {
  const hv = async () => {
    try {
      const r = await fetch('/api/health');
      const j = await r.json();
      bridgeStatus(`bridge: ok (${j.assets} assets, queue ${j.queued}) — pick an op`);
    } catch {
      bridgeStatus('bridge: NOT running — start `node tools/server.mjs --port 3000` then reload');
    }
  };
  hv();
  $('b-validate')?.addEventListener('click', () =>
    startJob('/api/validate', { assetId: currentAssetId }, 'validate'),
  );
  $('b-generate')?.addEventListener('click', () =>
    startJob('/api/generate', { assetId: currentAssetId }, 'generate'),
  );
  $('b-sheets')?.addEventListener('click', () =>
    startJob('/api/sheet/export', { assetId: currentAssetId }, 'sheet export'),
  );
  $('b-tres')?.addEventListener('click', () =>
    startJob('/api/tres/export', { assetId: currentAssetId }, 'tres export'),
  );
  $('b-confirm')?.addEventListener('click', confirmJob);
  $('b-import-file')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('assetId', currentAssetId);
    fd.append('file', f, f.name);
    try {
      setBridgeUiBusy(true);
      const res = await fetch('/api/import', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? 'import failed');
      bridgeJobId = j.jobId;
      const p = j.preview ?? {};
      $('bridge-status').textContent =
        `import: ${f.name} ${p.srcW}x${p.srcH} -> willWrite ${p.willWrite?.length}, backup ${p.willBackup}, delta ${p.bytesDelta} — confirm to apply`;
      setBridgeUiBusy(false);
    } catch (err) {
      bridgeStatus(`import error: ${err.message}`);
      setBridgeUiBusy(false);
    }
  });
  // Dead buttons from the read-only era now trigger the same flow.
  $('export-btn')?.addEventListener('click', () =>
    startJob('/api/sheet/export', { assetId: currentAssetId }, 'sheet export'),
  );
  document.getElementById('matrix-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-clip]');
    if (!btn) return;
    startJob('/api/generate', { assetId: currentAssetId }, `regenerate for ${btn.dataset.clip}`);
  });
}
function initAssetSwitcher() {
  const sel = $('asset-select');
  if (!sel) return;
  sel.value = currentAssetId;
  sel.addEventListener('change', async () => {
    const id = sel.value;
    if (!ASSET_IDS.includes(id)) return;
    await initAsset(id);
    await reloadMatrixFor(id);
  });
}

// 5.2 matrix wiring (additive; 1.1/4.1 above untouched).
let matrixAsset = null;
let matrixTimers = [];

function clearMatrixTimers() {
  for (const t of matrixTimers) clearInterval(t);
  matrixTimers = [];
}

function renderMatrix(persp) {
  const grid = $('matrix-grid');
  const meta = $('matrix-meta');
  const btn = $('export-btn');
  const hint = $('export-hint');
  if (!grid || !matrixAsset) return;
  clearMatrixTimers();
  grid.innerHTML = '';
  const { cells } = buildMatrix(matrixAsset, persp);
  const missing = cells.filter((c) => c.missing);
  meta.textContent = `${persp}: ${cells.length} cells, ${missing.length} missing`;
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
      gen.textContent = 'Generate';
      gen.title = `generate ${cell.clipId} (manual flow, 4.2 reserved slot)`;
      gen.dataset.clip = cell.clipId;
      el.appendChild(gen);
    } else {
      const cur = document.createElement('code');
      cur.textContent = cell.files[0];
      el.appendChild(cur);
      const sub = document.createElement('p');
      sub.className = 'hint';
      sub.textContent = `${cell.files.length}f × ${cell.durationMs.toFixed(2)}ms`;
      el.appendChild(sub);
      let player = createPlayer(matrixAsset, persp, cell.action, cell.dir, 0);
      const timer = setInterval(() => {
        try {
          player = tickPlayer(player);
          cur.textContent = player.file;
        } catch {
          // Strict cell vanished mid-play (should not happen on full asset).
          clearInterval(timer);
        }
      }, player.durationMs);
      matrixTimers.push(timer);
    }
    grid.appendChild(el);
  }
  const ex = canExport(matrixAsset);
  const total = cells.length * 2;
  btn.disabled = !ex.ok;
  btn.title = ex.ok ? `all ${total} clips present` : `missing: ${ex.missing.slice(0, 3).join('; ')}${ex.missing.length > 3 ? '…' : ''}`;
  hint.textContent = ex.ok ? `ready: ${total} clips full` : `export disabled — missing ${ex.missing.length}: ${ex.missing.slice(0, 3).join('; ')}${ex.missing.length > 3 ? '…' : ''}`;
}

async function initMatrix() {
  if (!$('matrix-grid')) return;
  try {
    const { asset } = await loadShell(assetUrlFor(currentAssetId));
    matrixAsset = asset;
    const sel = $('m-persp');
    const start = asset.preview?.perspective ?? 'td';
    if (sel) {
      sel.value = start;
      sel.addEventListener('change', () => renderMatrix(sel.value));
    }
    renderMatrix(start);
  } catch (e) {
    const meta = $('matrix-meta');
    if (meta) meta.textContent = `FAIL: ${e.message}`;
  }
}

async function reloadMatrixFor(assetId) {
  currentAssetId = assetId;
  try {
    const { asset } = await loadShell(assetUrlFor(currentAssetId));
    matrixAsset = asset;
    const sel = $('m-persp');
    const persp = sel?.value ?? asset.preview?.perspective ?? 'td';
    if (sel) sel.value = persp;
    renderMatrix(persp);
  } catch (e) {
    const meta = $('matrix-meta');
    if (meta) meta.textContent = `FAIL: ${e.message}`;
  }
}
