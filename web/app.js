// app.js — 1.1 shell + 4.1 form wiring (zero dependencies).
import { loadShell } from './lib/asset-shell.js';
import { buildPrompt, validateFields, FIXED_NEGATIVE, KNIGHT_EXAMPLE } from './lib/prompt.js';
import { buildMatrix, createPlayer, tickPlayer, canExport } from './lib/matrix.js';

const $ = (id) => document.getElementById(id);

async function initAsset() {
  const box = $('asset-status');
  try {
    const { asset, shell, slots } = await loadShell();
    $('master-td').textContent = slots.find((s) => s.perspective === 'td').file;
    $('master-sd').textContent = slots.find((s) => s.perspective === 'sd').file;
    $('asset-meta').textContent = `${asset.id} · size ${asset.size} · ${asset.palette} · seed ${asset.seed}`;
    box.textContent = shell.ok ? 'OK: dual-master shell loadable' : `FAIL: ${shell.errors.join('; ')}`;
    box.dataset.ok = String(shell.ok);
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
  meta.textContent = `${persp}: 12 cells, ${missing.length} missing`;
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
  btn.disabled = !ex.ok;
  btn.title = ex.ok ? 'all 24 clips present' : `missing: ${ex.missing.slice(0, 3).join('; ')}${ex.missing.length > 3 ? '…' : ''}`;
  hint.textContent = ex.ok ? 'ready: 24 clips full' : `export disabled — missing ${ex.missing.length}: ${ex.missing.slice(0, 3).join('; ')}${ex.missing.length > 3 ? '…' : ''}`;
}

async function initMatrix() {
  if (!$('matrix-grid')) return;
  try {
    const { asset } = await loadShell();
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
