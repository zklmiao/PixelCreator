// server-jobs.test.mjs — polish-hardening wt-A (A2/A3/A4 verification).
// A2 job lifecycle: done/error jobs age out on the same TTL as previews, the
// registry evicts oldest finished jobs beyond MAX_JOBS, SSE clients die with
// their job (direct registry tests via the exported hook).
// A3 TOCTOU: a will-write path that comes into existence between preview and
// confirm is backed up at execution time (real preview→confirm round-trip).
// A4 clip-scoped generate: preview willWrite is exactly the clip's frame files,
// and confirm writes only those (a poisoned non-clip file stays poisoned).
// A3/A4 run against a TEMP REPO COPY (tools/assets/palettes/web + pngjs) so the
// disk mutations never race the other test files reading the real tree
// (node --test executes files in parallel processes). No network beyond the
// loopback test server; .backup/ is gitignored.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, mkdirSync, cpSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer, backupFiles, __jobRegistry, sweepExpired, JOB_TTL_MS, MAX_JOBS } from './server.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Isolated repo copy: the temp server.mjs resolves its own REPO_ROOT, so all
// writes (assets/.backup) land inside the temp tree.
async function startTempRepoServer(port) {
  const temp = mkdtempSync(join(tmpdir(), 'pixe-server-jobs-'));
  for (const dir of ['tools', 'assets', 'palettes', 'web']) {
    cpSync(join(root, dir), join(temp, dir), { recursive: true });
  }
  mkdirSync(join(temp, 'node_modules'), { recursive: true });
  cpSync(join(root, 'node_modules', 'pngjs'), join(temp, 'node_modules', 'pngjs'), { recursive: true });
  const mod = await import(pathToFileURL(join(temp, 'tools', 'server.mjs')).href);
  const { server, baseUrl } = await mod.startServer({ port, host: '127.0.0.1' });
  return { temp, server, baseUrl };
}

async function waitDone(baseUrl, jobId) {
  for (let i = 0; i < 100; i++) {
    const st = await (await fetch(`${baseUrl}/api/jobs/${jobId}`)).json();
    if (st.status === 'done' || st.status === 'error') return st;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('job did not settle in time');
}

describe('A2 job lifecycle (direct registry tests)', () => {
  const { jobs, sseClients, queue } = __jobRegistry;
  const inserted = [];

  afterEach(() => {
    for (const id of inserted) {
      jobs.delete(id);
      const i = queue.indexOf(id);
      if (i !== -1) queue.splice(i, 1);
      sseClients.delete(id);
    }
    inserted.length = 0;
  });

  const seed = (id, status, { age = 0, withClient = false } = {}) => {
    const job = {
      id,
      status,
      createdAt: 'test',
      expiresAt: Date.now() + JOB_TTL_MS,
      finishedAt: status === 'done' || status === 'error' ? Date.now() - age : null,
      events: [],
      queuePosition: null,
    };
    jobs.set(id, job);
    inserted.push(id);
    if (withClient) {
      const clients = new Set([{ end() {} }]);
      sseClients.set(id, clients);
    }
    return job;
  };

  it('done job past TTL is swept; fresh done job is kept', () => {
    seed('a2-done-old', 'done', { age: JOB_TTL_MS + 1000 });
    seed('a2-done-fresh', 'done', { age: 0 });
    sweepExpired();
    assert.equal(jobs.has('a2-done-old'), false, 'aged done job must be swept');
    assert.equal(jobs.has('a2-done-fresh'), true, 'fresh done job must survive');
  });

  it('error job past TTL is swept; expired preview job too (existing semantics)', () => {
    seed('a2-err-old', 'error', { age: JOB_TTL_MS + 1000 });
    const p = seed('a2-preview-expired', 'preview');
    p.expiresAt = Date.now() - 1;
    seed('a2-preview-live', 'preview');
    sweepExpired();
    assert.equal(jobs.has('a2-err-old'), false);
    assert.equal(jobs.has('a2-preview-expired'), false);
    assert.equal(jobs.has('a2-preview-live'), true);
  });

  it('SSE clients are dropped together with their swept job', () => {
    seed('a2-sse', 'done', { age: JOB_TTL_MS + 1000, withClient: true });
    assert.ok(sseClients.has('a2-sse'));
    sweepExpired();
    assert.equal(sseClients.has('a2-sse'), false, 'clients must die with the job');
  });

  it('hard cap: beyond MAX_JOBS the oldest finished jobs are evicted', () => {
    const overflow = MAX_JOBS - jobs.size + 3; // push registry past the cap
    for (let i = 0; i < overflow; i++) seed(`a2-cap-${i}`, 'done', { age: JOB_TTL_MS + i * 1000 + 1000 });
    assert.ok(jobs.size > MAX_JOBS, 'precondition: registry over cap');
    const before = new Set(jobs.keys());
    sweepExpired();
    assert.ok(jobs.size <= MAX_JOBS, `registry must be capped at ${MAX_JOBS}, got ${jobs.size}`);
    // the aged-out ones (oldest finishedAt) are exactly the swept set
    for (let i = 0; i < overflow; i++) {
      const id = `a2-cap-${i}`;
      if (before.has(id)) {
        // every inserted job was past TTL, so all of them must be gone
        assert.equal(jobs.has(id), false, `${id} (past TTL) must be swept`);
      }
    }
  });
});

describe('A3 exec-time backup re-check (TOCTOU closed)', () => {
  it('backupFiles re-checks existence per path at call time (direct unit)', () => {
    const r = backupFiles('selftest-a3', ['tools/kinds.mjs', 'no/such/file.txt']);
    assert.equal(r.count, 1, 'existing path backed up, missing path skipped');
    const copied = join(root, '.backup', 'selftest-a3', r.dir.split(/[\\/]/).pop(), 'tools', 'kinds.mjs');
    assert.deepEqual(readFileSync(copied), readFileSync(resolve(root, 'tools/kinds.mjs')));
    rmSync(join(root, '.backup', 'selftest-a3'), { recursive: true, force: true });
  });

  it('file created between preview and confirm lands in .backup (HTTP round-trip)', async () => {
    const { temp, server, baseUrl } = await startTempRepoServer(3215);
    try {
      const lateAbs = join(temp, 'assets', 'crate_001', 'crate_sd_idle_fr0.svg');
      const previewRes = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetId: 'crate_001' }),
      });
      const preview = await previewRes.json();
      assert.equal(previewRes.status, 202);
      // Late mutation: the will-write path is recreated with new content AFTER
      // the preview snapshot was taken — at execution time the file exists with
      // content the preview never saw.
      writeFileSync(lateAbs, '<svg>late-created-marker</svg>', 'utf8');
      const confirmRes = await fetch(`${baseUrl}/api/jobs/${preview.jobId}/confirm`, { method: 'POST' });
      const confirm = await confirmRes.json();
      assert.equal(confirmRes.status, 202);
      const st = await waitDone(baseUrl, preview.jobId);
      assert.equal(st.status, 'done', st.error?.message ?? '');
      const base = join(temp, '.backup', 'crate_001');
      const entries = readdirSync(base).sort();
      const dir = join(base, entries[entries.length - 1]);
      const backed = readFileSync(join(dir, 'assets', 'crate_001', 'crate_sd_idle_fr0.svg'));
      assert.equal(
        backed.toString('utf8').includes('late-created-marker'),
        true,
        'backup must hold the late-created content (exec-time re-check), not the preview snapshot',
      );
      // after the run the generator rewrote the file: marker gone, generator
      // fingerprint present (byte-identity is not asserted here because the
      // committed static SVGs predate the asset.json prompt_hash backfill)
      const after = readFileSync(lateAbs, 'utf8');
      assert.equal(after.includes('late-created-marker'), false, 'marker must be overwritten by the generator');
      assert.ok(after.includes('synthetic:crate_001:sd/idle/fr/0'), 'generator fingerprint must be present');
    } finally {
      server.close();
      rmSync(temp, { recursive: true, force: true });
    }
  });
});

describe('A4 clip-scoped generate', () => {
  it('preview willWrite is exactly the clip frame set (knight td/walk/fr = 3 files)', async () => {
    const { temp, server, baseUrl } = await startTempRepoServer(3216);
    try {
      const genRes = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetId: 'knight_001', clip: 'td/walk/fr' }),
      });
      const r = await genRes.json();
      assert.equal(genRes.status, 202);
      assert.deepEqual(
        r.preview.willWrite,
        ['assets/knight_001/knight_td_walk_fr1.svg', 'assets/knight_001/knight_td_walk_fr2.svg', 'assets/knight_001/knight_td_walk_fr3.svg'],
        'willWrite must be exactly the clip frame files',
      );
      assert.equal(r.preview.clip, 'td/walk/fr');

      for (const badClip of ['td/walk/xx', 'td/walk', 'xx/walk/fr']) {
        const bad = await (await fetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ assetId: 'knight_001', clip: badClip }),
        })).json();
        assert.equal(bad.code, 'UNKNOWN_CLIP', badClip);
      }

      // confirm writes ONLY the clip files: poison a non-clip file after
      // preview; if the exec wrote the whole asset, the poison would vanish.
      const poisonAbs = join(temp, 'assets', 'knight_001', 'knight_sd_idle_fr0.svg');
      writeFileSync(poisonAbs, `${readFileSync(poisonAbs, 'utf8')}<!-- poison -->`, 'utf8');
      const confirmRes = await fetch(`${baseUrl}/api/jobs/${r.jobId}/confirm`, { method: 'POST' });
      assert.equal(confirmRes.status, 202);
      const st = await waitDone(baseUrl, r.jobId);
      assert.equal(st.status, 'done', st.error?.message ?? '');
      assert.equal(st.result.views, 3, 'clip-scoped run generates exactly 3 views');
      assert.equal(st.result.masters, 0, 'clip-scoped run skips masters');
      assert.ok(
        readFileSync(poisonAbs, 'utf8').endsWith('<!-- poison -->'),
        'non-clip file must stay untouched by a clip-scoped run',
      );
      // the three clip files were regenerated content-identical to committed
      // (EOL normalized: checkout may hold CRLF, generator writes LF)
      const norm = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
      for (const f of ['knight_td_walk_fr1.svg', 'knight_td_walk_fr2.svg', 'knight_td_walk_fr3.svg']) {
        assert.equal(
          norm(join(temp, 'assets', 'knight_001', f)),
          norm(join(root, 'assets', 'knight_001', f)),
          `${f} content-identical`,
        );
      }
    } finally {
      server.close();
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
