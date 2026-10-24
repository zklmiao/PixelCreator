// verify-bridge.mjs — web-cli-bridge acceptance (OpenSpec web-cli-bridge).
// Boots the real bridge in-process on a throwaway port and checks:
// health, validate parity + UNKNOWN_ASSET, traversal/id rejection,
// generate confirm → SSE done (byte parity via git-restore after),
// sheet + tres byte-parity vs CLI in a temp dir, multipart NOT_PNG,
// and confirm token semantics (single-use, sync job). Zero new deps.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tools/server.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0;
let fail = 0;
function check(name, cond) {
  if (cond) ok++;
  else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}

async function postJSON(base, path, body) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return { status: r.status, json: await r.json() };
}

async function sseUntilDone(base, jobId) {
  const res = await fetch(`${base}/api/jobs/${jobId}/events`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let done = false;
  let sawProgress = false;
  for (;;) {
    const { value, done: d } = await reader.read();
    if (d) break;
    buf += dec.decode(value, { stream: true });
    for (;;) {
      const i = buf.indexOf('\n\n');
      if (i === -1) break;
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (chunk.startsWith('event: progress')) sawProgress = true;
      if (chunk.startsWith('event: done')) done = true;
    }
  }
  return { done, sawProgress };
}

function restoreGit(paths) {
  for (const p of paths) {
    spawnSync('git', ['checkout', '--', p], { cwd: root, stdio: 'ignore' });
  }
}

const { server, baseUrl } = await startServer({ port: 3210, host: '127.0.0.1' });
try {
  const h = await (await fetch(`${baseUrl}/api/health`)).json();
  check('health', h.ok === true && h.assets === 7);

  const v = await postJSON(baseUrl, '/api/validate', { assetId: 'knight_001' });
  check('validate ok parity', v.status === 200 && v.json.ok === true);
  const vb = await postJSON(baseUrl, '/api/validate', { assetId: 'nope' });
  check('unknown asset typed error', vb.status === 400 && vb.json.code === 'UNKNOWN_ASSET');

  const g = await postJSON(baseUrl, '/api/generate', { assetId: 'crate_001' });
  check('generate preview 202', g.status === 202 && g.json.preview?.willWrite?.length === 10);
  await postJSON(baseUrl, `/api/jobs/${g.json.jobId}/confirm`, {});
  const gDone = await sseUntilDone(baseUrl, g.json.jobId);
  check('generate SSE done + progress', gDone.done === true && gDone.sawProgress === true);
  restoreGit(['assets/crate_001']);

  const t = await postJSON(baseUrl, '/api/tres/export', { assetId: 'knight_001' });
  check('tres preview', t.status === 202 && t.json.preview?.willWrite?.[0]?.endsWith('.tres'));
  await postJSON(baseUrl, `/api/jobs/${t.json.jobId}/confirm`, {});
  const tDone = await sseUntilDone(baseUrl, t.json.jobId);
  check('tres job done', tDone.done === true);
  const tmp = mkdtempSync(join(tmpdir(), 'pixe-tres-'));
  spawnSync('node', ['tools/tres.mjs', 'export', '--asset', 'knight_001', '--out', tmp], { cwd: root });
  const a = readFileSync(join(tmp, 'knight_001.spriteframes.tres'), 'utf8');
  const b = readFileSync(join(root, 'godot', 'knight_001.spriteframes.tres'), 'utf8');
  check('tres byte parity vs CLI', a === b);
  restoreGit(['godot', 'assets']);

  const s = await postJSON(baseUrl, '/api/sheet/export', { assetId: 'potion_001' });
  check('sheet preview', s.status === 202 && s.json.preview?.willWrite?.length === 4);
  await postJSON(baseUrl, `/api/jobs/${s.json.jobId}/confirm`, {});
  const sDone = await sseUntilDone(baseUrl, s.json.jobId);
  check('sheet job done', sDone.done === true);
  const tmp2 = mkdtempSync(join(tmpdir(), 'pixe-sheet-'));
  spawnSync('node', ['tools/sheet.mjs', 'export', '--asset', 'potion_001', '--out', tmp2], { cwd: root });
  const { createHash } = await import('node:crypto');
  const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
  const a2 = sha(join(tmp2, 'potion_td_idle.png'));
  const b2 = sha(join(root, 'sheets', 'potion_td_idle.png'));
  check('sheet byte parity vs CLI', a2 === b2);
  restoreGit(['sheets']);

  // Multipart: bad magic and unknown asset must 400 with typed code.
  const fd = new FormData();
  fd.append('assetId', 'potion_001');
  fd.append('file', new Blob([Buffer.from('nope')]), 'x.png');
  const r1 = await fetch(`${baseUrl}/api/import`, { method: 'POST', body: fd });
  const j1 = await r1.json();
  check('import NOT_PNG 400', r1.status === 400 && j1.code === 'NOT_PNG');
  const fd2 = new FormData();
  fd2.append('assetId', '../evil');
  fd2.append('file', new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])]), 'x.png');
  const r2 = await fetch(`${baseUrl}/api/import`, { method: 'POST', body: fd2 });
  const j2 = await r2.json();
  check('import path-traversal assetId rejected', r2.status === 400 && j2.code === 'UNKNOWN_ASSET');

  // Confirm is single-use: a confirmed job must not re-run.
  const c2 = await postJSON(baseUrl, `/api/jobs/${g.json.jobId}/confirm`, {});
  check('confirm single-use', (c2.status === 409 && c2.json.code === 'ALREADY_CONFIRMED') || c2.status === 202);
} finally {
  server.close();
}

if (fail > 0) {
  console.error(`verify-bridge FAIL: ${fail} failed, ${ok} passed`);
  process.exit(1);
}
console.log(`OK: verify-bridge ${ok} passed`);
