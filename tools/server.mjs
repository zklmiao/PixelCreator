// server.mjs — web-cli-bridge local server (OpenSpec web-cli-bridge).
//
// One process serves both: static GET (/web/ /assets/* /sheets/* /palettes/*
// /fixtures/* /godot/*) and write APIs (POST /api/*) that call the SAME tool
// functions as the CLI (byte-identical, no forked logic).
// - Zero new npm dependencies: only node: builtins + existing tools/*.mjs.
// - Loopback only; assetId allowlisted to the frozen 7 ids; outDirs fixed.
// - Every write is two-phase: POST /api/* dry-runs in memory and returns
//   { jobId, preview } -> POST /api/jobs/:id/confirm backs up then writes.
// - Long runs stream SSE at GET /api/jobs/:id/events.
// - Usage: node tools/server.mjs [--port 3000] [--host 127.0.0.1]
import http from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve, normalize, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadAsset, validateAsset } from './asset-manifest.mjs';
import { generateKnightSvgs, generateStaticSvgs } from './vectorize.mjs';
import { exportSheets, sheetFileName, sheetMapName } from './sheet.mjs';
import { exportTres } from './tres.mjs';
import {
  loadImportAsset,
  decodePngBuffer,
  quantizeAndMap,
  computeImportArtifacts,
  buildCompare,
} from './import-prototype.mjs';
import { encodePng } from './sheet.mjs';
import { ASSET_IDS } from '../web/lib/asset-shell.js';
import { STATIC_KINDS } from './kinds.mjs';
import {
  img2imgStatus,
  orchestrateGuardianMid,
  orchestrateGuardianTd,
  runGuardianImportSegment,
  TD_DERIVE_PLAN,
} from './img2img-providers.mjs';

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(moduleDir, '..');

const STATIC_PREFIXES = {
  '/web/': 'web',
  '/assets/': 'assets',
  '/sheets/': 'sheets',
  '/palettes/': 'palettes',
  '/fixtures/': 'fixtures',
  '/godot/': 'godot',
  '/tools/': 'tools',
  // Gitignored user-prototype workspace (polish-hardening B3): user-supplied
  // images stay local; the compare flow reads them on the same origin. When
  // the directory does not exist yet, static serving 404s as usual.
  '/prototypes/': 'prototypes',
};

// Hard cap for retained jobs (polish-hardening D3-a): beyond this, the oldest
// finished (done/error) jobs are evicted first by sweepExpired.
export const MAX_JOBS = 100;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.tres': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export const JOB_TTL_MS = 10 * 60 * 1000;
export const MAX_QUEUE = 5;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function errBody(code, message) {
  return { ok: false, code, message };
}

export function assertAssetId(assetId) {
  if (typeof assetId !== 'string' || !ASSET_IDS.includes(assetId)) {
    const e = new Error(`unknown asset id: ${JSON.stringify(assetId)} (want ${ASSET_IDS.join(', ')})`);
    e.code = 'UNKNOWN_ASSET';
    e.status = 400;
    throw e;
  }
  return assetId;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-cache' });
  res.end(body);
}

function sendErr(res, e, fallback = 500) {
  const status = Number.isInteger(e?.status) ? e.status : fallback;
  const code = typeof e?.code === 'string' ? e.code : status === 400 ? 'BAD_REQUEST' : 'PIPELINE_ERROR';
  sendJson(res, status, errBody(code, e?.message ?? String(e)));
}

// ---- static ----

function safeStaticPath(urlPath) {
  let prefix = null;
  for (const p of Object.keys(STATIC_PREFIXES)) {
    if (urlPath === p.slice(0, -1) || urlPath.startsWith(p)) {
      prefix = p;
      break;
    }
  }
  if (!prefix) return null;
  let rel = urlPath === prefix.slice(0, -1) ? '/' : urlPath.slice(prefix.length);
  rel = decodeURIComponent(rel);
  const abs = normalize(join(REPO_ROOT, STATIC_PREFIXES[prefix], rel));
  const root = join(REPO_ROOT, STATIC_PREFIXES[prefix]);
  if (abs !== root && !abs.startsWith(root + requireSep())) return null;
  return abs;
}

function requireSep() {
  return process.platform === 'win32' ? '\\' : '/';
}

function serveStatic(req, res, urlPath) {
  if (urlPath === '/' || urlPath === '/web' || urlPath === '/web/') {
    const idx = join(REPO_ROOT, 'web', 'index.html');
    const body = readFileSync(idx);
    res.writeHead(200, { 'content-type': MIME['.html'], 'content-length': body.length, 'cache-control': 'no-cache' });
    res.end(body);
    return;
  }
  const abs = safeStaticPath(urlPath);
  if (!abs) {
    sendJson(res, 404, errBody('NOT_FOUND', `no route for ${urlPath}`));
    return;
  }
  let file = abs;
  try {
    if (statSync(abs).isDirectory()) {
      const idx = join(abs, 'index.html');
      if (!existsSync(idx)) {
        sendJson(res, 404, errBody('NOT_FOUND', `no index for ${urlPath}`));
        return;
      }
      file = idx;
    }
  } catch {
    sendJson(res, 404, errBody('NOT_FOUND', `missing ${urlPath}`));
    return;
  }
  if (!existsSync(file)) {
    sendJson(res, 404, errBody('NOT_FOUND', `missing ${urlPath}`));
    return;
  }
  const body = readFileSync(file);
  res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-cache' });
  res.end(body);
}

// ---- bodies ----

function readBody(req, maxBytes) {
  return new Promise((resolveP, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error(`body exceeds ${maxBytes} bytes`), { code: 'TOO_LARGE', status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolveP(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Minimal multipart parser: single file field `file` + text fields.
// Returns { fields: Map, file: { filename, contentType, data } | null }.
export function parseMultipartBuffer(buf, contentType) {
  const m = /boundary=([^;]+)/i.exec(contentType ?? '');
  if (!m) throw Object.assign(new Error('multipart missing boundary'), { code: 'BAD_REQUEST', status: 400 });
  const boundary = Buffer.from(`--${m[1].trim().replace(/^"|"$/g, '')}`);
  const parts = [];
  let start = 0;
  for (;;) {
    const i = buf.indexOf(boundary, start);
    if (i === -1) break;
    parts.push(buf.subarray(start, i));
    start = i + boundary.length;
    if (buf.subarray(start, start + 2).toString() === '--') break;
  }
  const fields = new Map();
  let file = null;
  for (const part of parts) {
    const hb = part.indexOf(Buffer.from('\r\n\r\n'));
    if (hb === -1) continue;
    const head = part.subarray(0, hb).toString('latin1');
    let body = part.subarray(hb + 4);
    if (body.subarray(body.length - 2).toString() === '\r\n') body = body.subarray(0, body.length - 2);
    const disp = /name="([^"]+)"/.exec(head);
    if (!disp) continue;
    const name = disp[1];
    const fn = /filename="([^"]*)"/.exec(head);
    if (fn) {
      const ct = (/content-type:\s*([^\r\n]+)/i.exec(head) ?? [])[1]?.trim();
      file = { field: name, filename: fn[1], contentType: ct ?? 'application/octet-stream', data: Buffer.from(body) };
    } else {
      fields.set(name, body.toString('utf8'));
    }
  }
  return { fields, file };
}

export function assertPngUpload(file) {
  if (!file || !file.data || file.data.length === 0) {
    throw Object.assign(new Error('missing file field (want multipart file)'), { code: 'BAD_REQUEST', status: 400 });
  }
  if (file.data.length > MAX_UPLOAD_BYTES) {
    throw Object.assign(new Error(`upload exceeds 5MB (${file.data.length} bytes)`), { code: 'TOO_LARGE', status: 413 });
  }
  if (!file.data.subarray(0, 8).equals(PNG_SIG)) {
    throw Object.assign(new Error('upload is not a PNG (bad signature)'), { code: 'NOT_PNG', status: 400 });
  }
}

// ---- preview builders (dry-run, no writes) ----

function repoRel(abs) {
  return relative(REPO_ROOT, abs).split(requireSep()).join('/');
}

function existingStat(rel) {
  try {
    const st = statSync(join(REPO_ROOT, rel));
    return st.isFile() ? st.size : 0;
  } catch {
    return 0;
  }
}

function loadAssetDoc(assetId) {
  const p = join(REPO_ROOT, 'assets', assetId, 'asset.json');
  return { doc: JSON.parse(readFileSync(p, 'utf8')), dir: dirname(p), manifestPath: p };
}

function clipScopeError(clip) {
  return Object.assign(
    new Error(`unknown clip ${JSON.stringify(clip)} (want "<persp>/<action>/<dir>" within the asset)`),
    { code: 'UNKNOWN_CLIP', status: 400 },
  );
}

// Clip scope (polish-hardening B2): "<persp>/<action>/<dir>" limits preview and
// the run to exactly that clip's frame files; null/empty = whole asset.
function parseClipScope(doc, clip) {
  if (clip === undefined || clip === null || clip === '') return null;
  const parts = String(clip).split('/');
  if (parts.length !== 3) throw clipScopeError(clip);
  const [persp, action, dir] = parts;
  const act = doc.actions?.[action];
  if (
    !(doc.perspectives ?? []).includes(persp) ||
    !act ||
    !(doc.views ?? []).includes(dir) ||
    !Array.isArray(act.clips?.[persp]?.[dir])
  ) {
    throw clipScopeError(clip);
  }
  return { perspective: persp, action, dir };
}

function previewGenerate(assetId, clip) {
  const { doc } = loadAssetDoc(assetId);
  const scope = parseClipScope(doc, clip);
  const willWrite = [];
  if (scope) {
    // Clip-scoped: exactly this clip's frame files, no masters (spec
    // "Clip-scoped regeneration": willWrite lists the clip's frames and no
    // other asset file).
    for (const clipFile of doc.actions[scope.action].clips[scope.perspective][scope.dir] ?? []) {
      willWrite.push(`assets/${assetId}/${clipFile.file}`);
    }
    return finishPreview(willWrite, {
      kind: doc.kind,
      clip: `${scope.perspective}/${scope.action}/${scope.dir}`,
    });
  }
  for (const act of Object.keys(doc.actions ?? {})) {
    for (const persp of doc.perspectives ?? []) {
      for (const d of doc.views ?? []) {
        for (const clip of doc.actions[act].clips?.[persp]?.[d] ?? []) willWrite.push(`assets/${assetId}/${clip.file}`);
      }
    }
  }
  for (const persp of doc.perspectives ?? []) {
    if (doc.masters?.[persp]) willWrite.push(`assets/${assetId}/${doc.masters[persp]}`);
  }
  return finishPreview(willWrite, { kind: doc.kind });
}

function previewSheet(assetId) {
  const { doc } = loadAssetDoc(assetId);
  const prefix = doc.asset;
  const willWrite = [];
  const isStatic = STATIC_KINDS.includes(doc.kind);
  if (isStatic) {
    for (const persp of doc.perspectives ?? []) {
      const sheet = sheetFileName(prefix, persp, 'idle', 'full');
      willWrite.push(`sheets/${sheet}`, `sheets/${sheetMapName(prefix, persp, 'idle', 'full')}`);
    }
  } else {
    for (const action of ['walk', 'attack']) {
      for (const persp of doc.perspectives ?? []) {
        for (const mode of ['full', 'maker']) {
          const sheet = sheetFileName(prefix, persp, action, mode);
          willWrite.push(`sheets/${sheet}`, `sheets/${sheetMapName(prefix, persp, action, mode)}`);
        }
      }
    }
    if (doc.actions?.idle) {
      for (const persp of doc.perspectives ?? []) {
        const sheet = sheetFileName(prefix, persp, 'idle', 'full');
        willWrite.push(`sheets/${sheet}`, `sheets/${sheetMapName(prefix, persp, 'idle', 'full')}`);
      }
    }
  }
  return finishPreview(willWrite, { kind: doc.kind });
}

function previewTres(assetId) {
  return finishPreview([`godot/${assetId}.spriteframes.tres`], {});
}

// M4 img2img orchestration preview (dry-run, no writes, no provider calls):
// lists the fixture PNGs the job will produce plus every asset file the
// follow-up map import re-lands (slots + masters) and the per-source compares.
function previewImg2img(assetId, kind) {
  const { doc } = loadAssetDoc(assetId);
  const willWrite = new Set();
  for (const [action, a] of Object.entries(doc.actions ?? {})) {
    for (const persp of doc.perspectives ?? []) {
      for (const d of doc.views ?? []) {
        for (const clip of a.clips?.[persp]?.[d] ?? []) willWrite.add(`assets/${assetId}/${clip.file}`);
      }
    }
  }
  for (const persp of doc.perspectives ?? []) {
    if (doc.masters?.[persp]) willWrite.add(`assets/${assetId}/${doc.masters[persp]}`);
  }
  if (kind === 'inbetween') {
    for (const d of doc.views ?? []) {
      willWrite.add(`fixtures/guardian/mid/guardian_sd_${d}_mid.png`);
      willWrite.add(`fixtures/guardian/mid/guardian_td_${d}_mid.png`);
    }
  } else {
    for (const d of doc.views ?? []) {
      for (const { action, frames } of TD_DERIVE_PLAN) {
        for (const n of Object.keys(frames)) willWrite.add(`fixtures/guardian/td/guardian_${action}_${d}${n}.png`);
      }
    }
  }
  // One compare per distinct map source, landing next to the source file.
  const mapPath = join(REPO_ROOT, 'fixtures', 'guardian', 'guardian-map.json');
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  for (const src of new Set(Object.values(map.slots ?? {}))) {
    const norm = String(src).split(/[\\/]/).join('/');
    const cut = norm.lastIndexOf('/');
    const dir = cut >= 0 ? norm.slice(0, cut) : '';
    const base = cut >= 0 ? norm.slice(cut + 1) : norm;
    willWrite.add(`fixtures/guardian/${dir ? `${dir}/` : ''}${base.replace(/\.png$/i, '')}.compare.png`);
  }
  return finishPreview([...willWrite].sort(), { kind: 'character' });
}

function finishPreview(willWrite, extra = {}) {
  let willBackup = 0;
  let existingBytes = 0;
  for (const rel of willWrite) {
    const s = existingStat(rel);
    if (s > 0 || existsSync(join(REPO_ROOT, rel))) {
      willBackup++;
      existingBytes += s;
    }
  }
  return { willWrite, willBackup, bytesDelta: null, existingBytes, ...extra };
}

async function previewImport(assetId, buffer, srcBase, dir) {
  const { asset, palette } = await loadImportAsset(assetId);
  const src = decodePngBuffer(buffer, srcBase);
  const quant = quantizeAndMap(src, asset, palette);
  const { files } = computeImportArtifacts({ asset, palette, quant, srcBase, dir });
  const cmp = buildCompare(src.data, src.width, src.height, quant.mapped.data, asset.size);
  const pngBytes = Buffer.from(encodePng(cmp.data, cmp.width, cmp.height));
  const willWrite = [...files.keys()].map((f) => `assets/${assetId}/${f}`);
  let willBackup = 0;
  let bytesDelta = 0;
  const newSizes = new Map();
  for (const [rel, svg] of files) {
    const full = `assets/${assetId}/${rel}`;
    const nb = Buffer.byteLength(svg);
    newSizes.set(full, nb);
    const old = existingStat(full);
    if (existsSync(join(REPO_ROOT, full))) willBackup++;
    bytesDelta += nb - old;
  }
  return {
    preview: { willWrite, willBackup, bytesDelta, srcW: src.width, srcH: src.height, cmpW: cmp.width, cmpH: cmp.height },
    store: { files, pngBytes, cmpW: cmp.width, cmpH: cmp.height, srcW: src.width, srcH: src.height },
  };
}

// ---- backup ----

// Exec-time backup (polish-hardening D3-b): every will-write path is
// re-checked for existence HERE, at execution time — not from the preview
// snapshot — so a file that comes into existence between preview and confirm
// is backed up before being overwritten (web-bridge scenario
// "Late-created files are backed up too"). Exported for direct unit tests.
export function backupFiles(assetId, relPaths) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(REPO_ROOT, '.backup', assetId, ts);
  let count = 0;
  for (const rel of relPaths) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue; // exec-time existence re-check, per path
    const target = join(dest, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(abs, target);
    count++;
  }
  // Prune to the 5 newest per asset.
  try {
    const base = join(REPO_ROOT, '.backup', assetId);
    const entries = readdirSync(base).sort();
    while (entries.length > 5) {
      const oldest = entries.shift();
      rmSync(join(base, oldest), { recursive: true, force: true });
    }
  } catch { /* first backup: nothing to prune */ }
  return { dir: repoRel(dest), count };
}

// ---- jobs ----

const jobs = new Map(); // id -> job
const queue = []; // jobIds awaiting execution
let running = null;
const sseClients = new Map(); // jobId -> Set<res>

// Test/inspection hook (polish-hardening D3-a): direct access to the live
// registry so unit tests can construct aged jobs without HTTP round-trips.
export const __jobRegistry = { jobs, sseClients, queue };

// Remove a job and every resource hanging off it (queue slot + SSE clients).
function dropJob(id) {
  if (!jobs.has(id)) return;
  jobs.delete(id);
  const i = queue.indexOf(id);
  if (i !== -1) queue.splice(i, 1);
  const clients = sseClients.get(id);
  if (clients) {
    for (const res of clients) {
      try {
        res.end();
      } catch { /* client gone */ }
    }
    sseClients.delete(id);
  }
}

// Sweeps expired previews/queued jobs, ages out finished jobs on the same TTL,
// and enforces the MAX_JOBS hard cap. Exported for direct unit tests; the
// request handler calls it with the wall clock.
export function sweepExpired(now = Date.now()) {
  for (const [id, job] of jobs) {
    if ((job.status === 'preview' || job.status === 'queued') && job.expiresAt < now) {
      dropJob(id);
    } else if (
      (job.status === 'done' || job.status === 'error') &&
      job.finishedAt != null &&
      job.finishedAt + JOB_TTL_MS < now
    ) {
      dropJob(id); // finished jobs age out on the same TTL as previews
    }
  }
  // Hard cap (D3-a): beyond MAX_JOBS, evict the oldest finished jobs first.
  while (jobs.size > MAX_JOBS) {
    const oldestFinished = [...jobs.values()]
      .filter((j) => (j.status === 'done' || j.status === 'error') && j.finishedAt != null)
      .sort((a, b) => a.finishedAt - b.finishedAt)[0];
    if (!oldestFinished) break; // only live (preview/queued/running) jobs left
    dropJob(oldestFinished.id);
  }
}

function emit(job, type, data = {}) {
  const evt = { seq: job.events.length, type, data, at: new Date().toISOString() };
  job.events.push(evt);
  const clients = sseClients.get(job.id);
  if (clients) {
    const line = `event: ${type}\ndata: ${JSON.stringify({ seq: evt.seq, ...data })}\n\n`;
    for (const res of clients) {
      try {
        res.write(line);
      } catch { /* client gone */ }
    }
  }
  return evt;
}

function createJob(op, assetId, preview, exec, store = {}) {
  const id = randomUUID();
  const job = {
    id,
    op,
    assetId,
    status: 'preview',
    preview,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + JOB_TTL_MS,
    events: [],
    result: null,
    error: null,
    queuePosition: null,
    ...store,
    exec,
  };
  jobs.set(id, job);
  emit(job, 'preview', { op, assetId, willWrite: preview.willWrite?.length ?? 0, willBackup: preview.willBackup ?? 0 });
  return job;
}

async function pumpQueue() {
  if (running) return;
  const id = queue.shift();
  if (!id) return;
  const job = jobs.get(id);
  if (!job) {
    pumpQueue();
    return;
  }
  running = id;
  job.status = 'running';
  job.queuePosition = null;
  emit(job, 'start', { op: job.op, assetId: job.assetId });
  try {
    const result = await job.exec(job, (type, data) => emit(job, type, data));
    job.status = 'done';
    job.finishedAt = Date.now();
    job.result = result;
    emit(job, 'done', { result });
  } catch (e) {
    job.status = 'error';
    job.finishedAt = Date.now();
    job.error = { code: e?.code ?? 'PIPELINE_ERROR', message: e?.message ?? String(e) };
    emit(job, 'error', job.error);
  } finally {
    running = null;
    // Refresh queue positions.
    queue.forEach((qid, i) => {
      const q = jobs.get(qid);
      if (q) q.queuePosition = i + 1;
    });
    pumpQueue();
  }
}

function enqueue(job) {
  if (queue.length >= MAX_QUEUE) {
    const e = new Error(`queue full (${MAX_QUEUE} waiting)`);
    e.code = 'QUEUE_FULL';
    e.status = 429;
    throw e;
  }
  job.status = 'queued';
  job.queuePosition = queue.length + 1;
  queue.push(job.id);
  emit(job, 'queued', { position: job.queuePosition });
  pumpQueue();
  return job;
}

// ---- executors (confirm path: backup then write, same functions as CLI) ----

async function execGenerate(job, progress) {
  const { assetId } = job;
  const backed = backupFiles(assetId, job.preview.willWrite);
  progress('log', { line: `backup ${backed.count} files -> ${backed.dir}` });
  const { asset } = await loadImportAssetForKind(assetId);
  const isChar = asset.kind === 'character';
  const onProgress = async ({ file, done }) => progress('progress', { done, file });
  const clipStr = job.params?.clip ?? null; // validated at preview time
  const clipFilter = clipStr
    ? (([perspective, action, dir]) => ({ perspective, action, dir }))(String(clipStr).split('/'))
    : null;
  const r = isChar
    ? await generateKnightSvgs(assetId, { onProgress, clipFilter })
    : await generateStaticSvgs(assetId, { onProgress, clipFilter });
  return { ...r, backedUp: backed.count, backupDir: backed.dir };
}

async function loadImportAssetForKind(assetId) {
  const p = join(REPO_ROOT, 'assets', assetId, 'asset.json');
  return { asset: JSON.parse(readFileSync(p, 'utf8')) };
}

async function execSheet(job, progress) {
  const { assetId } = job;
  const backed = backupFiles(assetId, job.preview.willWrite);
  progress('log', { line: `backup ${backed.count} files -> ${backed.dir}` });
  const results = await exportSheets(assetId, 'sheets', {
    onProgress: async ({ sheet, done }) => progress('progress', { done, file: `sheets/${sheet}` }),
  });
  for (const r of results) progress('log', { line: `OK: ${r.sheet} ${r.w}x${r.h}` });
  return { sheets: results.length, backedUp: backed.count, backupDir: backed.dir };
}

async function execTres(job, progress) {
  const { assetId } = job;
  const backed = backupFiles(assetId, job.preview.willWrite);
  progress('log', { line: `backup ${backed.count} files -> ${backed.dir}` });
  const r = await exportTres(assetId, 'godot');
  progress('progress', { done: 1, file: `godot/${assetId}.spriteframes.tres` });
  return { ...r, backedUp: backed.count, backupDir: backed.dir };
}

async function execImport(job, progress) {
  const { assetId } = job;
  const backed = backupFiles(assetId, job.preview.willWrite);
  progress('log', { line: `backup ${backed.count} files -> ${backed.dir}` });
  const { files } = job.store;
  const assetDir = join(REPO_ROOT, 'assets', assetId);
  let done = 0;
  for (const [rel, svg] of files) {
    mkdirSync(assetDir, { recursive: true });
    writeFileSync(join(assetDir, rel), svg, 'utf8');
    done++;
    progress('progress', { done, file: `assets/${assetId}/${rel}` });
  }
  progress('log', { line: `OK: imported ${job.params.srcBase} -> ${assetId} (${done} files)` });
  return { wrote: done, backedUp: backed.count, backupDir: backed.dir, cmpW: job.store.cmpW, cmpH: job.store.cmpH };
}

// M4 img2img executors: provider calls land fixture PNGs, then the shared map
// import re-lands every slot deterministically. Provider/network errors stop
// the job after confirm (design.md: "confirm 后逐文件写、失败即停并保留备份").
async function execImg2img(job, progress) {
  const { assetId, op } = job;
  const backed = backupFiles(assetId, job.preview.willWrite);
  progress('log', { line: `backup ${backed.count} files -> ${backed.dir}` });
  const orchestrate = op === 'img2img-inbetween' ? orchestrateGuardianMid : orchestrateGuardianTd;
  const fixtures = await orchestrate({
    rootDir: REPO_ROOT,
    onProgress: async ({ file, done }) => progress('progress', { done, file: `fixtures/guardian/.../${String(file).split(/[\\/]/).pop()}` }),
  });
  progress('log', { line: `OK: ${fixtures.length} fixture PNGs (provider ${img2imgStatus().active})` });
  const seg = await runGuardianImportSegment({ rootDir: REPO_ROOT });
  progress('progress', { done: seg.views + seg.masters, file: `assets/${assetId}/*` });
  return { fixtures: fixtures.length, views: seg.views, masters: seg.masters, backedUp: backed.count, backupDir: backed.dir };
}

// ---- HTTP ----

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  sweepExpired();

  if (req.method === 'GET' && (path === '/api/health' || path === '/api/health/')) {
    sendJson(res, 200, { ok: true, assets: ASSET_IDS.length, queued: queue.length });
    return;
  }

  // SSE must come before the generic /api/jobs/:id route.
  const eventsMatch = /^\/api\/jobs\/([A-Za-z0-9-]+)\/events\/?$/.exec(path);
  if (req.method === 'GET' && eventsMatch) {
    const job = jobs.get(eventsMatch[1]);
    if (!job) {
      sendJson(res, 404, errBody('UNKNOWN_JOB', 'unknown job'));
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    // Replay buffer so late subscribers see start/progress.
    for (const evt of job.events) {
      res.write(`event: ${evt.type}\ndata: ${JSON.stringify({ seq: evt.seq, ...evt.data })}\n\n`);
    }
    if (job.status === 'done' || job.status === 'error') {
      res.end();
      return;
    }
    let set = sseClients.get(job.id);
    if (!set) {
      set = new Set();
      sseClients.set(job.id, set);
    }
    set.add(res);
    req.on('close', () => {
      set.delete(res);
      if (set.size === 0) sseClients.delete(job.id);
    });
    return;
  }

  const compareMatch = /^\/api\/jobs\/([A-Za-z0-9-]+)\/compare\/?$/.exec(path);
  if (req.method === 'GET' && compareMatch) {
    const job = jobs.get(compareMatch[1]);
    if (!job || job.op !== 'import' || !job.store?.pngBytes) {
      sendJson(res, 404, errBody('NOT_FOUND', 'no compare for job'));
      return;
    }
    const buf = Buffer.from(job.store.pngBytes);
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': buf.length });
    res.end(buf);
    return;
  }

  const jobMatch = /^\/api\/jobs\/([A-Za-z0-9-]+)\/?$/.exec(path);
  if (req.method === 'GET' && jobMatch) {
    const job = jobs.get(jobMatch[1]);
    if (!job) {
      sendJson(res, 404, errBody('UNKNOWN_JOB', 'unknown job'));
      return;
    }
    sendJson(res, 200, {
      ok: true,
      jobId: job.id,
      op: job.op,
      assetId: job.assetId,
      status: job.status,
      preview: job.preview,
      result: job.result,
      error: job.error,
      queuePosition: job.queuePosition,
    });
    return;
  }

  const confirmMatch = /^\/api\/jobs\/([A-Za-z0-9-]+)\/confirm\/?$/.exec(path);
  if (req.method === 'POST' && confirmMatch) {
    const job = jobs.get(confirmMatch[1]);
    if (!job) {
      sendJson(res, 404, errBody('UNKNOWN_JOB', 'unknown job'));
      return;
    }
    await readBody(req, 64 * 1024); // drain (confirm flag optional)
    if (job.status !== 'preview' && job.status !== 'queued') {
      sendJson(res, 409, errBody('ALREADY_CONFIRMED', `job already ${job.status}`));
      return;
    }
    if (job.expiresAt < Date.now()) {
      jobs.delete(job.id);
      sendJson(res, 410, errBody('EXPIRED', 'confirm token expired'));
      return;
    }
    if (job.status === 'queued') {
      sendJson(res, 202, { ok: true, jobId: job.id, status: 'queued', position: job.queuePosition });
      return;
    }
    try {
      enqueue(job);
      sendJson(res, 202, { ok: true, jobId: job.id, status: 'queued', position: job.queuePosition });
    } catch (e) {
      sendErr(res, e);
    }
    return;
  }

  if (req.method === 'POST' && path === '/api/validate') {
    try {
      const buf = await readBody(req, 1024 * 1024);
      const { assetId } = JSON.parse(buf.toString('utf8') ?? '{}');
      assertAssetId(assetId);
      const manifestPath = join(REPO_ROOT, 'assets', assetId, 'asset.json');
      const asset = loadAsset(manifestPath);
      const r = validateAsset(asset, { checkFiles: true, baseDir: dirname(manifestPath), manifestPath });
      sendJson(res, 200, { ok: r.ok, errors: r.errors, missing: r.missing });
    } catch (e) {
      sendErr(res, e, 400);
    }
    return;
  }

  if (req.method === 'POST' && (path === '/api/generate' || path === '/api/sheet/export' || path === '/api/tres/export')) {
    try {
      const buf = await readBody(req, 1024 * 1024);
      const { assetId, clip } = JSON.parse(buf.toString('utf8') ?? '{}');
      assertAssetId(assetId);
      const op = path === '/api/generate' ? 'generate' : path === '/api/sheet/export' ? 'sheet' : 'tres';
      const preview = op === 'generate' ? previewGenerate(assetId, clip) : op === 'sheet' ? previewSheet(assetId) : previewTres(assetId);
      const exec = op === 'generate' ? execGenerate : op === 'sheet' ? execSheet : execTres;
      const job = createJob(op, assetId, preview, exec, { params: { clip: preview.clip ?? null } });
      sendJson(res, 202, { ok: true, jobId: job.id, status: 'preview', preview, links: { events: `/api/jobs/${job.id}/events`, confirm: `/api/jobs/${job.id}/confirm` } });
    } catch (e) {
      sendErr(res, e, 400);
    }
    return;
  }

  if (req.method === 'POST' && path === '/api/import') {
    try {
      const ctype = req.headers['content-type'] ?? '';
      if (!/multipart\/form-data/i.test(ctype)) {
        throw Object.assign(new Error('want multipart/form-data with file field'), { code: 'BAD_REQUEST', status: 400 });
      }
      const buf = await readBody(req, MAX_UPLOAD_BYTES + 1024 * 1024);
      const { fields, file } = parseMultipartBuffer(buf, ctype);
      assertPngUpload(file);
      const assetId = fields.get('assetId') ?? fields.get('asset');
      assertAssetId(assetId);
      const dirRaw = fields.get('dir');
      const dir = dirRaw === '' || dirRaw === undefined ? null : dirRaw;
      const srcBase = (file.filename ?? 'upload').replace(/\.png$/i, '') || 'upload';
      const { preview, store } = await previewImport(assetId, file.data, srcBase, dir);
      const job = createJob('import', assetId, preview, execImport, { store, params: { srcBase, dir } });
      sendJson(res, 202, { ok: true, jobId: job.id, status: 'preview', preview, links: { events: `/api/jobs/${job.id}/events`, confirm: `/api/jobs/${job.id}/confirm`, compare: `/api/jobs/${job.id}/compare` } });
    } catch (e) {
      sendErr(res, e, e.status ?? 400);
    }
    return;
  }

  if (req.method === 'GET' && path === '/api/img2img/status') {
    // Configured provider names only — never key material (web-bridge ADDED).
    sendJson(res, 200, img2imgStatus());
    return;
  }

  if (req.method === 'POST' && (path === '/api/img2img/inbetween' || path === '/api/img2img/derive-td')) {
    try {
      const buf = await readBody(req, 1024 * 1024);
      const { assetId } = JSON.parse(buf.toString('utf8') ?? '{}');
      assertAssetId(assetId);
      if (assetId !== 'guardian_001') {
        throw Object.assign(new Error(`img2img orchestration needs a committed guardian map, got ${JSON.stringify(assetId)}`), {
          code: 'NO_ORCHESTRATION_MAP',
          status: 400,
        });
      }
      const st = img2imgStatus();
      if (!st.active || !st.configured.includes(st.active)) {
        throw Object.assign(
          new Error(`no usable img2img provider configured (active=${JSON.stringify(st.active)}, configured=${JSON.stringify(st.configured)})`),
          { code: 'PROVIDER_NOT_CONFIGURED', status: 400 },
        );
      }
      const kind = path === '/api/img2img/inbetween' ? 'inbetween' : 'derive-td';
      const preview = previewImg2img(assetId, kind);
      const op = kind === 'inbetween' ? 'img2img-inbetween' : 'img2img-derive-td';
      const job = createJob(op, assetId, preview, execImg2img);
      sendJson(res, 202, { ok: true, jobId: job.id, status: 'preview', preview, links: { events: `/api/jobs/${job.id}/events`, confirm: `/api/jobs/${job.id}/confirm` } });
    } catch (e) {
      sendErr(res, e, 400);
    }
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res, path);
    return;
  }
  sendJson(res, 405, errBody('METHOD_NOT_ALLOWED', `${req.method} ${path} not allowed`));
}

export function startServer({ port = 3000, host = '127.0.0.1' } = {}) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`server binds loopback only, got host ${JSON.stringify(host)}`);
  }
  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      try {
        sendErr(res, e);
      } catch { /* socket gone */ }
    });
  });
  return new Promise((resolveP, reject) => {
    server.on('error', (e) => {
      if (e?.code === 'EADDRINUSE') {
        reject(new Error(`port ${port} in use (server exits, no auto-hop)`));
        return;
      }
      reject(e);
    });
    server.listen(port, host, () => {
      const addr = server.address();
      console.log(`OK: bridge on http://${addr.address}:${addr.port} (static+api, loopback)`);
      resolveP({ server, baseUrl: `http://${addr.address}:${addr.port}` });
    });
  });
}

function parseArgs(argv) {
  let port = 3000;
  let host = '127.0.0.1';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' && argv[i + 1]) port = Number(argv[++i]);
    else if (a.startsWith('--port=')) port = Number(a.slice('--port='.length));
    else if (a === '--host' && argv[i + 1]) host = argv[++i];
    else if (a.startsWith('--host=')) host = a.slice('--host='.length);
    else if (a === '--help' || a === '-h') {
      console.log('usage: node tools/server.mjs [--port 3000] [--host 127.0.0.1]');
      process.exit(0);
    }
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`bad --port ${JSON.stringify(argv.join(' '))} (want 1-65535)`);
    process.exit(2);
  }
  return { port, host };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const { port, host } = parseArgs(process.argv.slice(2));
  startServer({ port, host }).catch((e) => {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  });
}
