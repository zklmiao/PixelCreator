// img2img-providers.test.mjs — img2img-live wt-A A1 verification (node --test).
// Adapter layer verification with INJECTED fetch mocks only: request shape
// (URL/auth/fields), response parsing, typed error paths, key secrecy.
// No test in this file performs a network call (self-guarded below: the test
// source contains no URL literal at all — endpoints come from the module).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  editImage,
  img2imgStatus,
  geminiEndpoint,
  openaiEndpoint,
  sdWebuiEndpoint,
  assertTier,
  pngDims,
  blendUnion,
  flipVertical,
  nearestUpscale2x,
  composeSideBySide,
  deriveMidFixtures,
  deriveTdFixtures,
  orchestrateGuardianMid,
  GEMINI_MODEL_DEFAULT,
} from './img2img-providers.mjs';
import { encodePng } from './sheet.mjs';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Self-guard: this test file must never carry a URL literal (no network by grep).
{
  const self = readFileSync(new URL(import.meta.url), 'utf8');
  const needle = ['ht', 'tp'].join(''); // built dynamically: the guard itself must not match
  assert.equal(self.includes(needle), false, 'test file must not contain URL literals (network isolation)');
}

function tinyPng(w = 2, h = 2, rgba = null) {
  const data = rgba ?? new Uint8ClampedArray(w * h * 4).fill(200);
  return Buffer.from(encodePng(data, w, h));
}

const KEY = 'SUPERSECRET-KEY-VALUE';

function mockFetch(response) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (typeof response === 'function') return response({ url: String(url), opts, calls });
    return response;
  };
  fn.calls = calls;
  return fn;
}

function okJson(json) {
  return { ok: true, status: 200, json: async () => json };
}

const ENV_GEMINI = { PIXE_IMG_PROVIDER: 'gemini', PIXE_IMG_KEY: KEY };
const ENV_OPENAI = { PIXE_IMG_PROVIDER: 'openai', PIXE_IMG_KEY: KEY };
const ENV_SD = { PIXE_IMG_PROVIDER: 'sd-webui', PIXE_SD_URL: '127.0.0.1:7860' };

describe('A1 status(): names only, never key material', () => {
  it('no env at all: active null, ZERO configured providers (spec scenario), zero key fields', () => {
    const st = img2imgStatus({});
    assert.equal(st.ok, true);
    assert.equal(st.active, null);
    assert.deepEqual(st.configured, [], 'no provider env vars -> zero configured (prototype-prompt delta)');
    assert.deepEqual(
      st.providers.map((p) => p.name),
      ['gemini', 'openai', 'sd-webui'],
    );
    assert.equal(st.providers[2].configured, false, 'sd-webui unconfigured without PIXE_SD_URL');
    assert.equal(Object.keys(st).some((k) => /key|token|secret/i.test(k)), false);
  });

  it('PIXE_SD_URL alone: sd-webui counts as configured (no key needed), active still null', () => {
    const st = img2imgStatus({ PIXE_SD_URL: '127.0.0.1:7860' });
    assert.equal(st.active, null);
    assert.deepEqual(st.configured, ['sd-webui']);
  });

  it('gemini configured via env: active + configured names, no key value', () => {
    const st = img2imgStatus(ENV_GEMINI);
    assert.equal(st.active, 'gemini');
    assert.deepEqual(st.configured, ['gemini', 'openai'], 'sd-webui stays unconfigured without PIXE_SD_URL');
    assert.equal(JSON.stringify(st).includes(KEY), false);
  });

  it('unknown provider string: active stays null', () => {
    const st = img2imgStatus({ PIXE_IMG_PROVIDER: 'midjourney', PIXE_IMG_KEY: KEY });
    assert.equal(st.active, null);
  });
});

describe('A1 gemini adapter (injected fetch)', () => {
  it('request shape: endpoint/auth header/text+inline parts', async () => {
    const image = tinyPng();
    const fetchMock = mockFetch(
      okJson({ candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/png', data: image.toString('base64') } }] } }] }),
    );
    const r = await editImage(
      { image, prompt: 'in-between pose', negative: 'blurry', tier: 0.3, seed: 2006, size: 64 },
      { env: ENV_GEMINI, fetch: fetchMock },
    );
    assert.equal(fetchMock.calls.length, 1);
    const call = fetchMock.calls[0];
    assert.equal(call.url, geminiEndpoint(GEMINI_MODEL_DEFAULT));
    assert.equal(call.opts.method, 'POST');
    assert.equal(call.opts.headers['x-goog-api-key'], KEY);
    const body = JSON.parse(call.opts.body);
    const parts = body.contents[0].parts;
    assert.equal(parts.length, 2);
    assert.ok(parts[0].text.includes('in-between pose'), 'prompt present');
    assert.ok(parts[0].text.includes('Avoid: blurry'), 'negative folded into prompt text');
    assert.ok(parts[0].text.includes('subtle in-between edit'), 'tier degrades to strength wording');
    assert.equal(parts[1].inline_data.mime_type, 'image/png');
    assert.equal(parts[1].inline_data.data, image.toString('base64'));
    assert.deepEqual(body.generationConfig.responseModalities, ['IMAGE']);
    assert.equal(body.generationConfig.seed, 2006);
    // response parsing -> PNG buffer + honest meta
    assert.deepEqual(pngDims(r.buffer), { width: 2, height: 2 });
    assert.equal(r.buffer.equals(image), true);
    assert.equal(r.meta.provider, 'gemini');
    assert.equal(r.meta.denoiseSupported, false);
    assert.equal(r.meta.seed, 2006);
    assert.ok(r.meta.notes.join(' ').includes('no native gemini parameter'));
  });

  it('HTTP 500 / missing image part / broken PNG / fetch throw -> typed errors, key never leaks', async () => {
    const image = tinyPng();
    const cases = [
      mockFetch({ ok: false, status: 500, json: async () => ({}) }),
      mockFetch(okJson({ candidates: [{ content: { parts: [{ text: 'no image here' }] } }] })),
      mockFetch(okJson({ candidates: [{ content: { parts: [{ inline_data: { data: Buffer.from('notpng').toString('base64') } }] } }] })),
    ];
    for (const fetchMock of cases) {
      await assert.rejects(
        () => editImage({ image, prompt: 'p', tier: 0.3, size: 64 }, { env: ENV_GEMINI, fetch: fetchMock }),
        (e) => {
          assert.ok(['PROVIDER_ERROR', 'NOT_PNG'].includes(e.code), `typed code, got ${e.code}`);
          assert.equal(String(e.message).includes(KEY), false, 'key must not appear in error text');
          return true;
        },
      );
    }
    const thrower = mockFetch(async () => {
      throw new Error('ECONNREFUSED whatever');
    });
    await assert.rejects(
      () => editImage({ image, prompt: 'p', tier: 0.3, size: 64 }, { env: ENV_GEMINI, fetch: thrower }),
      (e) => e.code === 'PROVIDER_ERROR' && !String(e.message).includes(KEY),
    );
  });
});

describe('A1 openai-compatible adapter (injected fetch)', () => {
  it('request shape: base override/Bearer/multipart fields + EXTRA override', async () => {
    const image = tinyPng();
    const fetchMock = mockFetch(okJson({ data: [{ b64_json: image.toString('base64') }] }));
    const env = { ...ENV_OPENAI, PIXE_OPENAI_BASE: 'ark.example.internal/api/v3', PIXE_OPENAI_EXTRA: JSON.stringify({ user: 'u1' }) };
    const r = await editImage(
      { image, prompt: 'top-down derive', tier: 0.55, seed: 2006, size: 64 },
      { env, fetch: fetchMock },
    );
    const call = fetchMock.calls[0];
    assert.equal(call.url, openaiEndpoint(env.PIXE_OPENAI_BASE));
    assert.equal(call.opts.headers.authorization, `Bearer ${KEY}`);
    const form = call.opts.body;
    const fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '<blob>']));
    assert.equal(fields.model, 'gpt-image-1');
    assert.ok(fields.prompt.includes('top-down derive'));
    assert.ok(fields.prompt.includes('strong directional reinterpretation'), 'direction tier wording');
    assert.equal(fields.user, 'u1', 'PIXE_OPENAI_EXTRA fields merged');
    assert.equal(r.buffer.equals(image), true);
    assert.equal(r.meta.provider, 'openai');
    assert.equal(r.meta.seedSupported, false, 'images/edits has no seed field (disclosed)');
    assert.ok(r.meta.notes.join(' ').includes('does not support seed'));
  });

  it('missing b64_json -> PROVIDER_ERROR without key leak; bad EXTRA JSON -> typed 400', async () => {
    const image = tinyPng();
    const fetchMock = mockFetch(okJson({ data: [] }));
    await assert.rejects(
      () => editImage({ image, prompt: 'p', tier: 0.3, size: 64 }, { env: ENV_OPENAI, fetch: fetchMock }),
      (e) => e.code === 'PROVIDER_ERROR' && !String(e.message).includes(KEY),
    );
    const fetchMock2 = mockFetch(okJson({ data: [{ b64_json: image.toString('base64') }] }));
    await assert.rejects(
      () =>
        editImage(
          { image, prompt: 'p', tier: 0.3, size: 64 },
          { env: { ...ENV_OPENAI, PIXE_OPENAI_EXTRA: '{not json' }, fetch: fetchMock2 },
        ),
      (e) => e.code === 'BAD_REQUEST',
    );
  });
});

describe('A1 sd-webui adapter (injected fetch, offline fallback)', () => {
  it('request shape: native denoise mapping + seed/size passthrough', async () => {
    const image = tinyPng();
    const fetchMock = mockFetch(okJson({ images: [image.toString('base64')] }));
    const r = await editImage(
      { image, prompt: 'derive td', negative: 'extra limbs', tier: 0.55, seed: 2006, size: 64 },
      { env: ENV_SD, fetch: fetchMock },
    );
    const call = fetchMock.calls[0];
    assert.equal(call.url, sdWebuiEndpoint(ENV_SD.PIXE_SD_URL));
    const body = JSON.parse(call.opts.body);
    assert.deepEqual(body.init_images, [image.toString('base64')]);
    assert.equal(body.denoising_strength, 0.55, 'tier maps natively to denoising_strength');
    assert.equal(body.negative_prompt, 'extra limbs');
    assert.equal(body.seed, 2006);
    assert.equal(body.width, 64);
    assert.equal(body.height, 64);
    assert.equal(r.buffer.equals(image), true);
    assert.equal(r.meta.denoiseSupported, true);
    assert.equal(r.meta.seedSupported, true);
  });

  it('base override via PIXE_SD_URL; service down -> PROVIDER_ERROR', async () => {
    const image = tinyPng();
    const fetchMock = mockFetch(okJson({ images: [image.toString('base64')] }));
    await editImage({ image, prompt: 'p', tier: 0.3, size: 64 }, { env: { ...ENV_SD, PIXE_SD_URL: '127.0.0.1:9999' }, fetch: fetchMock });
    assert.equal(fetchMock.calls[0].url, sdWebuiEndpoint('127.0.0.1:9999'));
    const down = mockFetch(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    await assert.rejects(
      () => editImage({ image, prompt: 'p', tier: 0.3, size: 64 }, { env: ENV_SD, fetch: down }),
      (e) => e.code === 'PROVIDER_ERROR',
    );
  });
});

describe('A1 validation gates (no fetch reached)', () => {
  const image = tinyPng();
  it('no provider env -> PROVIDER_NOT_CONFIGURED naming the env vars, no key anywhere', async () => {
    await assert.rejects(
      () => editImage({ image, prompt: 'p', tier: 0.3, size: 64 }, { env: {}, fetch: mockFetch(okJson({})) }),
      (e) => {
        assert.equal(e.code, 'PROVIDER_NOT_CONFIGURED');
        assert.ok(e.message.includes('PIXE_IMG_PROVIDER'));
        assert.equal(e.message.includes(KEY), false);
        return true;
      },
    );
  });
  it('gemini selected without key -> PROVIDER_NOT_CONFIGURED', async () => {
    await assert.rejects(
      () => editImage({ image, prompt: 'p', tier: 0.3, size: 64 }, { env: { PIXE_IMG_PROVIDER: 'gemini' }, fetch: mockFetch(okJson({})) }),
      (e) => e.code === 'PROVIDER_NOT_CONFIGURED',
    );
  });
  it('tier outside both frozen ranges -> BAD_TIER', () => {
    for (const bad of [0.1, 0.45, 0.7, 'x', undefined]) {
      assert.throws(() => assertTier(bad), (e) => e.code === 'BAD_TIER');
    }
    assert.equal(assertTier(0.3), 'frame');
    assert.equal(assertTier(0.55), 'direction');
  });
  it('non-PNG / oversized / over-dim images rejected before any provider call', async () => {
    await assert.rejects(
      () => editImage({ image: Buffer.from('nope'), prompt: 'p', tier: 0.3, size: 64 }, { env: ENV_SD, fetch: mockFetch(okJson({})) }),
      (e) => e.code === 'NOT_PNG',
    );
    const big = Buffer.concat([tinyPng(), Buffer.alloc(8 * 1024 * 1024, 0)]);
    await assert.rejects(
      () => editImage({ image: big, prompt: 'p', tier: 0.3, size: 64 }, { env: ENV_SD, fetch: mockFetch(okJson({})) }),
      (e) => e.code === 'TOO_LARGE',
    );
    const wide = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(wide, 0);
    wide.writeUInt32BE(5000, 16);
    wide.writeUInt32BE(10, 20);
    await assert.rejects(
      () => editImage({ image: wide, prompt: 'p', tier: 0.3, size: 64 }, { env: ENV_SD, fetch: mockFetch(okJson({})) }),
      (e) => e.code === 'TOO_LARGE' && e.message.includes('4096'),
    );
    await assert.rejects(
      () => editImage({ image, prompt: '  ', tier: 0.3, size: 64 }, { env: ENV_SD, fetch: mockFetch(okJson({})) }),
      (e) => e.code === 'BAD_REQUEST' && e.message.includes('prompt'),
    );
  });
});

describe('A1 offline stand-in helpers (deterministic, no network)', () => {
  it('nearestUpscale2x replicates pixels exactly', () => {
    const img = { data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]), width: 1, height: 2 };
    const up = nearestUpscale2x(img);
    assert.deepEqual([up.width, up.height], [2, 4]);
    assert.deepEqual([...up.data.subarray(0, 8)], [1, 2, 3, 255, 1, 2, 3, 255]);
    assert.deepEqual([...up.data.subarray(16, 24)], [4, 5, 6, 255, 4, 5, 6, 255]);
  });

  it('blendUnion: transparent passthrough, weighted average, union silhouette', () => {
    const px = (r, g, b, a) => new Uint8ClampedArray([r, g, b, a]);
    const mk = (p1, p2) => ({ data: new Uint8ClampedArray([...p1, ...p2]), width: 2, height: 1 });
    const out = blendUnion(mk(px(100, 0, 0, 255), px(0, 0, 0, 0)), mk(px(0, 0, 0, 0), px(9, 8, 7, 255)));
    assert.deepEqual([...out.data.subarray(0, 4)], [100, 0, 0, 255], 'a-opaque/b-transparent -> a color');
    assert.deepEqual([...out.data.subarray(4, 8)], [9, 8, 7, 255], 'a-transparent/b-opaque -> b color (union silhouette)');
    const avg = blendUnion(mk(px(100, 0, 0, 255), px(0, 0, 0, 0)), mk(px(200, 0, 0, 255), px(9, 8, 7, 0)));
    assert.deepEqual([...avg.data.subarray(0, 4)], [150, 0, 0, 255], 'two opaques -> alpha-weighted average');
    const none = blendUnion(mk(px(1, 2, 3, 0), px(1, 2, 3, 0)), mk(px(4, 5, 6, 100), px(0, 0, 0, 127)));
    assert.deepEqual([...none.data.subarray(0, 4)], [0, 0, 0, 0], 'below-threshold alpha stays transparent');
  });

  it('flipVertical reverses rows', () => {
    const img = {
      data: new Uint8ClampedArray([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255]),
      width: 2,
      height: 2,
    };
    const out = flipVertical(img);
    assert.deepEqual([...out.data.subarray(0, 8)], [3, 3, 3, 255, 4, 4, 4, 255]);
    assert.deepEqual([...out.data.subarray(8, 16)], [1, 1, 1, 255, 2, 2, 2, 255]);
  });

  it('composeSideBySide: left = a, right = b, shared height; mismatch throws', () => {
    const a = { data: new Uint8ClampedArray([10, 0, 0, 255, 20, 0, 0, 255]), width: 1, height: 2 };
    const b = { data: new Uint8ClampedArray([0, 30, 0, 255, 0, 40, 0, 255]), width: 1, height: 2 };
    const out = composeSideBySide(a, b);
    assert.deepEqual([out.width, out.height], [2, 2]);
    assert.deepEqual([...out.data.subarray(0, 8)], [10, 0, 0, 255, 0, 30, 0, 255], 'row 0: a then b');
    assert.deepEqual([...out.data.subarray(8, 16)], [20, 0, 0, 255, 0, 40, 0, 255], 'row 1: a then b');
    assert.throws(() => composeSideBySide(a, { data: new Uint8ClampedArray(4), width: 1, height: 1 }), /height mismatch/);
  });

  it('deriveMid/deriveTd fixtures: byte-identical across reruns in a temp dir', async () => {
    const fixturesDir = resolve(root, 'fixtures', 'guardian');
    const t1 = mkdtempSync(join(tmpdir(), 'pixe-mid-a-'));
    const t2 = mkdtempSync(join(tmpdir(), 'pixe-mid-b-'));
    // Derivation reads amg1 sources from fixturesDir, so stage temp mirrors of
    // the committed top-level sources (read-only inputs) and compare bytes
    // across two runs into independent temp roots.
    const { mkdirSync, copyFileSync, readdirSync } = await import('node:fs');
    const stage = (dest) => {
      mkdirSync(resolve(dest, 'mid'), { recursive: true });
      mkdirSync(resolve(dest, 'td'), { recursive: true });
      for (const f of readdirSync(fixturesDir)) {
        if (/^amg1_.*\.png$/.test(f)) copyFileSync(resolve(fixturesDir, f), resolve(dest, f));
      }
      return dest;
    };
    const a = deriveMidFixtures({ fixturesDir: stage(t1) });
    const b = deriveMidFixtures({ fixturesDir: stage(t2) });
    assert.equal(a.length, 8, '4 sd mids + 4 td mids');
    for (let i = 0; i < a.length; i++) {
      assert.deepEqual(readFileSync(a[i]), readFileSync(b[i]), `mid fixture ${i} must be byte-stable across runs`);
    }
    const c = deriveTdFixtures({ fixturesDir: stage(t1) });
    const d = deriveTdFixtures({ fixturesDir: stage(t2) });
    assert.equal(c.length, 20, '20 per-slot td fixtures');
    for (let i = 0; i < c.length; i++) {
      assert.deepEqual(readFileSync(c[i]), readFileSync(d[i]), `td fixture ${i} must be byte-stable`);
    }
  });
});

describe('A1 guardian-mid live path (injected fetch, temp root)', () => {
  it('sends the endpoint PAIR as one 128x64 composite (f1 left / f2 right) and writes 8 fixtures', async () => {
    const { mkdirSync, copyFileSync, readdirSync } = await import('node:fs');
    const temp = mkdtempSync(join(tmpdir(), 'pixe-mid-live-'));
    process.env.PIXE_IMG_PROVIDER = 'sd-webui';
    process.env.PIXE_SD_URL = '127.0.0.1:9'; // never dialed: fetch is injected
    try {
      mkdirSync(join(temp, 'fixtures', 'guardian', 'td'), { recursive: true });
      mkdirSync(join(temp, 'assets', 'guardian_001'), { recursive: true });
      copyFileSync(resolve(root, 'assets/guardian_001/asset.json'), join(temp, 'assets', 'guardian_001', 'asset.json'));
      const gdir = resolve(root, 'fixtures', 'guardian');
      for (const f of readdirSync(gdir)) {
        if (/^amg1_.*\.png$/.test(f)) copyFileSync(resolve(gdir, f), join(temp, 'fixtures', 'guardian', f));
      }
      for (const d of ['fr', 'bk', 'lf', 'rt']) {
        for (const n of ['1', '3']) {
          copyFileSync(resolve(gdir, 'td', `guardian_walk_${d}${n}.png`), join(temp, 'fixtures', 'guardian', 'td', `guardian_walk_${d}${n}.png`));
        }
      }
      const stub = tinyPng(2, 2);
      const fetchMock = mockFetch(okJson({ images: [stub.toString('base64')] }));
      const written = await orchestrateGuardianMid({ rootDir: temp, fetch: fetchMock });
      assert.equal(fetchMock.calls.length, 8, '2 persp x 4 dirs');
      assert.equal(written.length, 8);
      // Composite honesty (design.md "对每方向 [f1, f2] 调 inbetween"): the sd
      // pair arrives 2x-upscaled side-by-side, left = f1, right = f2 — checked
      // pixel-exactly on the first call.
      const dec = (p) => {
        const img = PNG.sync.read(readFileSync(p));
        return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
      };
      const sent = PNG.sync.read(Buffer.from(JSON.parse(fetchMock.calls[0].opts.body).init_images[0], 'base64'));
      assert.deepEqual([sent.width, sent.height], [128, 64]);
      const leftWant = nearestUpscale2x(dec(resolve(gdir, 'amg1_fr1.png')));
      const rightWant = nearestUpscale2x(dec(resolve(gdir, 'amg1_fr2.png')));
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const wi = (y * 64 + x) * 4;
          assert.deepEqual([...sent.data.subarray((y * 128 + x) * 4, (y * 128 + x) * 4 + 4)], [...leftWant.data.subarray(wi, wi + 4)]);
          assert.deepEqual([...sent.data.subarray((y * 128 + 64 + x) * 4, (y * 128 + 64 + x) * 4 + 4)], [...rightWant.data.subarray(wi, wi + 4)]);
        }
      }
      // td pair = the 64px td walk endpoints (frames 1 and 3; frame 2 IS the mid)
      const tdSent = PNG.sync.read(Buffer.from(JSON.parse(fetchMock.calls[1].opts.body).init_images[0], 'base64'));
      assert.deepEqual([tdSent.width, tdSent.height], [128, 64]);
      assert.ok(JSON.parse(fetchMock.calls[1].opts.body).prompt.includes('left = earlier frame'));
      // provider stub output lands as the mid fixtures inside the temp root only
      for (const p of written) {
        assert.ok(p.startsWith(temp), 'fixture written inside temp root only');
        assert.deepEqual(pngDims(readFileSync(p)), { width: 2, height: 2 });
      }
    } finally {
      delete process.env.PIXE_IMG_PROVIDER;
      delete process.env.PIXE_SD_URL;
    }
  });
});
