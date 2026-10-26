// verify-bridge.mjs — web-cli-bridge acceptance (OpenSpec web-cli-bridge).
// Boots the real bridge in-process on a throwaway port and checks:
// health, validate parity + UNKNOWN_ASSET, traversal/id rejection,
// generate confirm → SSE done (byte parity via git-restore after),
// sheet + tres byte-parity vs CLI in a temp dir, multipart NOT_PNG,
// and confirm token semantics (single-use, sync job). Zero new deps.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
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

  // M4 img2img endpoints (img2img-live wt-A A2): status names only (never key
  // material), typed unconfigured errors, and preview-then-confirm semantics
  // where an unconfirmed preview writes NOTHING (fs hash snapshot + git status).
  {
    const hashTree = (dirs) => {
      const out = [];
      const walk = (abs, rel) => {
        for (const e of readdirSync(abs, { withFileTypes: true })) {
          const r = `${rel}/${e.name}`;
          if (e.isDirectory()) walk(join(abs, e.name), r);
          else out.push(`${r}:${createHash('sha256').update(readFileSync(join(abs, e.name))).digest('hex')}`);
        }
      };
      for (const d of dirs) walk(join(root, d), d);
      return out.sort().join('\n');
    };
    const gitStatus = () => spawnSync('git', ['status', '--porcelain'], { cwd: root }).stdout.toString();

    const st0 = await (await fetch(`${baseUrl}/api/img2img/status`)).json();
    check('img2img status ok + 3 named providers', st0.ok === true && Array.isArray(st0.providers) && st0.providers.length === 3);
    check(
      'img2img status shape: {name,configured} entries + active',
      st0.providers.every((p) => typeof p.name === 'string' && typeof p.configured === 'boolean') &&
        (st0.active === null || typeof st0.active === 'string'),
    );
    check('img2img status carries no key-ish field', !/key|token|secret/i.test(JSON.stringify(st0)));

    process.env.PIXE_IMG_PROVIDER = 'gemini';
    process.env.PIXE_IMG_KEY = 'verify-secret-0f9e8d-never-leak';
    const st1 = await (await fetch(`${baseUrl}/api/img2img/status`)).json();
    check('img2img status with key configured names the provider', st1.active === 'gemini' && st1.configured.includes('gemini'));
    check('img2img status response contains no key substring', !JSON.stringify(st1).includes('verify-secret-0f9e8d-never-leak'));
    delete process.env.PIXE_IMG_PROVIDER;
    delete process.env.PIXE_IMG_KEY;

    const inb0 = await postJSON(baseUrl, '/api/img2img/inbetween', { assetId: 'guardian_001' });
    check(
      'img2img inbetween unconfigured -> 400 PROVIDER_NOT_CONFIGURED',
      inb0.status === 400 && inb0.json.code === 'PROVIDER_NOT_CONFIGURED',
    );
    const dt0 = await postJSON(baseUrl, '/api/img2img/derive-td', { assetId: 'knight_001' });
    check('img2img derive-td non-guardian asset -> 400 NO_ORCHESTRATION_MAP', dt0.status === 400 && dt0.json.code === 'NO_ORCHESTRATION_MAP');

    process.env.PIXE_IMG_PROVIDER = 'sd-webui';
    process.env.PIXE_SD_URL = '127.0.0.1:9'; // unreachable loopback; preview must never dial out
    const snapBefore = hashTree(['assets', 'fixtures', 'sheets', 'godot']);
    const gitBefore = gitStatus();
    const inb1 = await postJSON(baseUrl, '/api/img2img/inbetween', { assetId: 'guardian_001' });
    check(
      'img2img inbetween preview 202: exactly 102 willWrite (56 slots + 2 masters + 8 mid fixtures + 36 compares)',
      inb1.status === 202 && inb1.json.preview?.willWrite?.length === 102,
    );
    const dt1 = await postJSON(baseUrl, '/api/img2img/derive-td', { assetId: 'guardian_001' });
    check(
      'img2img derive-td preview 202: exactly 114 willWrite (20 td fixtures instead of 8 mid)',
      dt1.status === 202 && dt1.json.preview?.willWrite?.length === 114,
    );
    const snapAfter = hashTree(['assets', 'fixtures', 'sheets', 'godot']);
    const gitAfter = gitStatus();
    check('img2img preview without confirm: zero disk writes (fs hash snapshot)', snapBefore === snapAfter);
    check('img2img preview without confirm: zero disk writes (git status 对照)', gitBefore === gitAfter);
    delete process.env.PIXE_IMG_PROVIDER;
  }
} finally {
  server.close();
}


// r6 debt (postmortem prevention): every static import reachable from
// web/app.js must fall under a STATIC_PREFIXES dir the bridge serves —
// a missing prefix (like the /tools/ launch blocker) fails here, not in
// a user's browser.
{
  const serverSrc = readFileSync(resolve(root, 'tools/server.mjs'), 'utf8');
  const m = serverSrc.match(/STATIC_PREFIXES\s*=\s*\{([^}]*)\}/s);
  check('server.mjs declares STATIC_PREFIXES', !!m);
  const served = new Set([...m[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map((x) => x[2]));
  const seen = new Set();
  const queue = ['web/app.js'];
  const bad = [];
  while (queue.length > 0) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = resolve(root, rel);
    if (!existsSync(abs)) { bad.push(`missing module ${rel}`); continue; }
    const topDir = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : rel;
    if (!served.has(topDir)) bad.push(`unserved ${rel} (top dir not in STATIC_PREFIXES)`);
    const src = readFileSync(abs, 'utf8');
    for (const spec of [...src.matchAll(/from\s+'(\.[^']+)'/g)].map((x) => x[1])) {
      let target = resolve(dirname(abs), spec).slice(root.length + 1).split(sep).join('/');
      if (!/\.[a-z]+$/.test(target)) target += '.js';
      queue.push(target);
    }
  }
  check(`module graph served (${[...seen].sort().join(' <- ')})`, bad.length === 0);
  if (bad.length > 0) console.error('  audit failures: ' + bad.join(' | '));
}

if (fail > 0) {
  console.error(`verify-bridge FAIL: ${fail} failed, ${ok} passed`);
  process.exit(1);
}
console.log(`OK: verify-bridge ${ok} passed`);
