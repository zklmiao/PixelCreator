// img2img-providers.mjs — live img2img adapter layer (OpenSpec img2img-live, wt-A A1).
//
// One interface, three adapters:
//   gemini       — Google Generative Language image editing (image+text -> image).
//   openai       — OpenAI-compatible /images/edits (base_url configurable, covers
//                  OpenAI/Zhipu/Qwen etc. via PIXE_OPENAI_BASE + optional field overrides).
//   sd-webui     — local Automatic1111 /sdapi/v1/img2img (offline fallback).
//
// Configuration is env-only, zero keys in the repository:
//   PIXE_IMG_PROVIDER  'gemini' | 'openai' | 'sd-webui' (active provider)
//   PIXE_IMG_KEY       API key (gemini/openai); never printed, never returned
//   PIXE_OPENAI_BASE   override base URL for the OpenAI-compatible adapter
//   PIXE_SD_URL        override base URL for the local SD-WebUI adapter
//   PIXE_OPENAI_EXTRA  optional JSON object merged as extra multipart fields
//                      (per-provider field quirks; design.md Open Questions)
//
// Iron rule: AI is an import source, not a runtime dependency. Network happens
// only when the bridge/CLI explicitly triggers a job with a configured provider;
// unit tests and verify scripts inject fetch and never touch the network.
//
// Denoise/seed mapping honesty (design.md Decisions, disclosed in meta):
//   - tier (denoise strength) ranges come from the frozen web/lib/img2img.js:
//     direction 0.5-0.6, frame 0.25-0.35.
//   - sd-webui maps tier natively to denoising_strength; seed is native.
//   - gemini/openai have NO native denoise: tier degrades to prompt-level
//     strength wording + meta disclosure (denoiseSupported:false). Seed is
//     passed for gemini via generationConfig.seed (best effort, provider may
//     ignore); openai images/edits has no seed field — meta.seedSupported:false.
//     We never pretend determinism the provider cannot lock.
//
// Adapter request shapes annotated against provider docs as of 2026-10 (M4):
//   gemini: POST /v1beta/models/{model}:generateContent, header x-goog-api-key,
//           contents[].parts[] = [{text},{inline_data:{mime_type,data}}],
//           generationConfig.responseModalities:['IMAGE']. Model default
//           gemini-2.5-flash-image ("nano banana" image editing line). Output
//           size is not exactly controllable -> request 1:1 aspect and let the
//           import pipeline (quantizeGeometry) pad/fit to the asset tier.
//   openai: POST {base}/images/edits, multipart image+prompt, Bearer auth,
//           response {data:[{b64_json}]}. Size maps to the nearest supported
//           enum ('1024x1024'); exact pixel size not guaranteed -> same pad path.
//   sd-webui: POST {base}/sdapi/v1/img2img JSON {init_images,prompt,
//           negative_prompt,denoising_strength,seed,width,height},
//           response {images:[b64]}.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIR_DENOISE_RANGE, FRAME_DENOISE_RANGE } from '../web/lib/img2img.js';

export const IMG2IMG_PROVIDERS = ['gemini', 'openai', 'sd-webui'];
export const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash-image';
export const OPENAI_MODEL_DEFAULT = 'gpt-image-1';
export const SD_URL_DEFAULT = 'http://127.0.0.1:7860';
export const OPENAI_BASE_DEFAULT = 'https://api.openai.com/v1';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_DIM = 4096;

export function geminiEndpoint(model = GEMINI_MODEL_DEFAULT) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}
export function openaiEndpoint(base) {
  return `${base || OPENAI_BASE_DEFAULT}/images/edits`;
}
export function sdWebuiEndpoint(base) {
  return `${base || SD_URL_DEFAULT}/sdapi/v1/img2img`;
}

const PNG_SIG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function pngDims(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIG_BYTES)) {
    throw Object.assign(new Error('image is not a PNG buffer (bad signature)'), { code: 'NOT_PNG', status: 400 });
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function assertImage(image) {
  const { width, height } = pngDims(image);
  if (image.length > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error(`image exceeds ${MAX_IMAGE_BYTES} bytes (${image.length})`), {
      code: 'TOO_LARGE',
      status: 413,
    });
  }
  if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
    throw Object.assign(new Error(`image dims ${width}x${height} exceed ${MAX_IMAGE_DIM}px limit`), {
      code: 'TOO_LARGE',
      status: 413,
    });
  }
}

export function assertTier(tier) {
  const inDir = tier >= DIR_DENOISE_RANGE[0] && tier <= DIR_DENOISE_RANGE[1];
  const inFrame = tier >= FRAME_DENOISE_RANGE[0] && tier <= FRAME_DENOISE_RANGE[1];
  if (typeof tier !== 'number' || (!inDir && !inFrame)) {
    throw Object.assign(
      new Error(
        `tier must be a number in direction ${DIR_DENOISE_RANGE.join('-')} or frame ${FRAME_DENOISE_RANGE.join('-')}, got ${JSON.stringify(tier)}`,
      ),
      { code: 'BAD_TIER', status: 400 },
    );
  }
  return inDir ? 'direction' : 'frame';
}

// Strength wording for providers without a native denoise parameter: tier
// degrades to prompt-level phrasing (design.md: "映射为图像编辑提示强度措辞").
export function strengthWording(tier) {
  return tier <= 0.35
    ? 'subtle in-between edit, keep composition and character identity close to the input frames'
    : 'strong directional reinterpretation of the input view, keep character identity';
}

// Read env config. Never includes key material in the returned payload.
export function readEnvConfig(env = process.env) {
  return {
    rawProvider: env.PIXE_IMG_PROVIDER ?? null,
    key: env.PIXE_IMG_KEY ?? null,
    openaiBase: env.PIXE_OPENAI_BASE || null,
    openaiExtra: env.PIXE_OPENAI_EXTRA || null,
    sdUrl: env.PIXE_SD_URL || null,
  };
}

function providerConfigured(name, env) {
  if (name === 'gemini') return Boolean(env.PIXE_IMG_KEY);
  if (name === 'openai') return Boolean(env.PIXE_IMG_KEY);
  // sd-webui needs no key, but counts as configured only when the operator
  // points it at a local service via PIXE_SD_URL — with no provider env vars
  // set at all, status must report zero configured providers (prototype-prompt
  // delta scenario "No-key fallback intact").
  if (name === 'sd-webui') return Boolean(env.PIXE_SD_URL);
  return false;
}

// Status payload: configured provider names only — NEVER key material, never URLs.
export function img2imgStatus(env = process.env) {
  const cfg = readEnvConfig(env);
  const active = IMG2IMG_PROVIDERS.includes(cfg.rawProvider) ? cfg.rawProvider : null;
  const providers = IMG2IMG_PROVIDERS.map((name) => ({ name, configured: providerConfigured(name, env) }));
  return { ok: true, active, configured: providers.filter((p) => p.configured).map((p) => p.name), providers };
}

function requireConfigured(env) {
  const st = img2imgStatus(env);
  if (!st.active) {
    throw Object.assign(
      new Error(
        `img2img provider not configured: set PIXE_IMG_PROVIDER (${IMG2IMG_PROVIDERS.join('|')})${st.active === null && env.PIXE_IMG_PROVIDER ? ` (got unknown provider ${JSON.stringify(env.PIXE_IMG_PROVIDER)})` : ''}`,
      ),
      { code: 'PROVIDER_NOT_CONFIGURED', status: 400 },
    );
  }
  if (!st.configured.includes(st.active)) {
    const need = st.active === 'sd-webui' ? 'PIXE_SD_URL' : 'PIXE_IMG_KEY';
    const why = st.active === 'sd-webui' ? 'config lives in env only' : 'keys live in env only';
    throw Object.assign(
      new Error(`img2img provider ${JSON.stringify(st.active)} is selected but not usable: missing ${need} (${why})`),
      { code: 'PROVIDER_NOT_CONFIGURED', status: 400 },
    );
  }
}

// Core entry: editImage({image, prompt, negative, tier, seed, size}, {env, fetch})
// -> { buffer: <PNG bytes>, meta: { provider, denoiseSupported, tier, seedSupported, seed, notes } }.
// fetch is injectable; production path uses globalThis.fetch. Error messages
// never embed key material (keys are only placed into auth headers).
export async function editImage(params, opts = {}) {
  const { image, prompt, negative, tier, seed, size } = params ?? {};
  const env = opts.env ?? process.env;
  const doFetch = opts.fetch ?? globalThis.fetch;
  if (!Buffer.isBuffer(image)) throw Object.assign(new Error('image must be a PNG Buffer'), { code: 'BAD_REQUEST', status: 400 });
  assertImage(image);
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw Object.assign(new Error('prompt must be a non-empty string'), { code: 'BAD_REQUEST', status: 400 });
  }
  if (negative !== undefined && typeof negative !== 'string') {
    throw Object.assign(new Error('negative must be a string when provided'), { code: 'BAD_REQUEST', status: 400 });
  }
  assertTier(tier);
  if (seed !== undefined && !Number.isInteger(seed)) {
    throw Object.assign(new Error('seed must be an integer when provided'), { code: 'BAD_REQUEST', status: 400 });
  }
  requireConfigured(env);
  const active = img2imgStatus(env).active;
  const cfg = readEnvConfig(env);
  const notes = [];
  if (active === 'sd-webui') return sdWebuiEdit(params, cfg, doFetch, notes);
  if (active === 'gemini') return geminiEdit(params, cfg, doFetch, notes);
  return openaiEdit(params, cfg, doFetch, notes);
}

function parseB64Image(b64) {
  const buf = Buffer.from(b64, 'base64');
  pngDims(buf); // response must be a decodable PNG
  return buf;
}

function wrapProviderError(e, provider) {
  if (e?.code && e.status) throw e;
  throw Object.assign(new Error(`img2img ${provider} request failed: ${e?.message ?? String(e)}`), {
    code: 'PROVIDER_ERROR',
    status: 502,
  });
}

async function sdWebuiEdit({ image, prompt, negative, tier, seed, size }, cfg, doFetch, notes) {
  const body = {
    init_images: [image.toString('base64')],
    prompt,
    negative_prompt: negative ?? '',
    denoising_strength: tier, // native denoise: direct mapping (design.md)
    width: size,
    height: size,
  };
  if (Number.isInteger(seed)) body.seed = seed;
  else notes.push('seed not provided; SD-WebUI will randomize (-1 semantics not forced)');
  let res;
  try {
    res = await doFetch(sdWebuiEndpoint(cfg.sdUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    wrapProviderError(e, 'sd-webui');
  }
  if (!res.ok) {
    throw Object.assign(new Error(`img2img sd-webui HTTP ${res.status}`), { code: 'PROVIDER_ERROR', status: 502 });
  }
  const json = await res.json();
  const b64 = json?.images?.[0];
  if (typeof b64 !== 'string') {
    throw Object.assign(new Error('img2img sd-webui response missing images[0]'), { code: 'PROVIDER_ERROR', status: 502 });
  }
  const buffer = parseB64Image(b64);
  return {
    buffer,
    meta: {
      provider: 'sd-webui',
      denoiseSupported: true,
      tier,
      seedSupported: true,
      seed: Number.isInteger(seed) ? seed : null,
      notes,
    },
  };
}

async function geminiEdit({ image, prompt, negative, tier, seed, size }, cfg, doFetch, notes) {
  // No native denoise -> strength wording at prompt level; disclosed in meta.
  notes.push('denoise tier has no native gemini parameter: mapped to prompt strength wording');
  const text = [prompt, negative ? `Avoid: ${negative}` : '', strengthWording(tier)].filter(Boolean).join('. ');
  const generationConfig = { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } };
  if (Number.isInteger(seed)) generationConfig.seed = seed; // best effort; provider may ignore
  else notes.push('seed not provided');
  let res;
  try {
    res = await doFetch(geminiEndpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.key },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text }, { inline_data: { mime_type: 'image/png', data: image.toString('base64') } }],
          },
        ],
        generationConfig,
      }),
    });
  } catch (e) {
    wrapProviderError(e, 'gemini');
  }
  if (!res.ok) {
    throw Object.assign(new Error(`img2img gemini HTTP ${res.status}`), { code: 'PROVIDER_ERROR', status: 502 });
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p) => p?.inline_data?.data);
  if (!inline) {
    throw Object.assign(new Error('img2img gemini response missing inline_data image part'), {
      code: 'PROVIDER_ERROR',
      status: 502,
    });
  }
  const buffer = parseB64Image(inline.inline_data.data);
  return {
    buffer,
    meta: {
      provider: 'gemini',
      model: GEMINI_MODEL_DEFAULT,
      denoiseSupported: false,
      tier,
      seedSupported: true,
      seed: Number.isInteger(seed) ? seed : null,
      notes,
    },
  };
}

async function openaiEdit({ image, prompt, negative, tier, seed, size }, cfg, doFetch, notes) {
  // No native denoise and no seed field on images/edits: both disclosed.
  notes.push('denoise tier has no native openai images/edits parameter: mapped to prompt strength wording');
  if (!Number.isInteger(seed)) notes.push('seed not provided');
  else notes.push('provider does not support seed: seed lock degrades, recorded in job metadata');
  const text = [prompt, negative ? `Avoid: ${negative}` : '', strengthWording(tier)].filter(Boolean).join('. ');
  const form = new FormData();
  form.append('image', new Blob([image], { type: 'image/png' }), 'input.png');
  form.append('prompt', text);
  form.append('model', OPENAI_MODEL_DEFAULT);
  form.append('size', '1024x1024'); // nearest supported enum; exact pixels not guaranteed (pad path upstream)
  if (cfg.openaiExtra) {
    let extra;
    try {
      extra = JSON.parse(cfg.openaiExtra);
    } catch {
      throw Object.assign(new Error('PIXE_OPENAI_EXTRA must be a JSON object string'), { code: 'BAD_REQUEST', status: 400 });
    }
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
      throw Object.assign(new Error('PIXE_OPENAI_EXTRA must be a JSON object string'), { code: 'BAD_REQUEST', status: 400 });
    }
    for (const [k, v] of Object.entries(extra)) form.append(k, String(v));
  }
  let res;
  try {
    res = await doFetch(openaiEndpoint(cfg.openaiBase), {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.key}` },
      body: form,
    });
  } catch (e) {
    wrapProviderError(e, 'openai');
  }
  if (!res.ok) {
    throw Object.assign(new Error(`img2img openai HTTP ${res.status}`), { code: 'PROVIDER_ERROR', status: 502 });
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (typeof b64 !== 'string') {
    throw Object.assign(new Error('img2img openai response missing data[0].b64_json'), { code: 'PROVIDER_ERROR', status: 502 });
  }
  const buffer = parseB64Image(b64);
  return {
    buffer,
    meta: {
      provider: 'openai',
      model: OPENAI_MODEL_DEFAULT,
      denoiseSupported: false,
      tier,
      seedSupported: false,
      seed: Number.isInteger(seed) ? seed : null,
      notes,
    },
  };
}

// ---- guardian orchestration (wt-A A3): mid frames + td derivation ----
//
// Job shape (design.md): per direction [f1, f2] -> inbetween (tier frame) ->
// 64px source PNG at fixtures/guardian/mid/guardian_{persp}_{dir}_mid.png ->
// import pipeline lands the new middle slots. td derivation: per sd view ->
// derive (td base template + direction tier) -> fixtures/guardian/td/*.png ->
// quantized into the td slots. After fixtures land, the shared map import
// (tools/import-prototype.mjs runMapImport) regenerates every slot
// deterministically; asset.json is never written by these jobs.
//
// `--offline` is the no-network fallback used by tests/regression: committed
// fixtures stand in for AI output via deterministic derivation (mid = union
// blend of the direction's endpoint frames; td = vertical flip of the source
// view). Offline artifacts are stand-ins — the AI mid slots keep
// prompt_hash/source_hash null until real provider output is adopted (card A3
// hash rule).
import { PNG } from 'pngjs';
import { encodePng } from './sheet.mjs';
import { runMapImport } from './import-prototype.mjs';
import {
  DIR_SENTENCES,
  ACTION_SENTENCES,
  BASE_TEMPLATES,
  FIXED_NEGATIVE,
  BARE_HANDS,
  SINGLE_FIGURE,
} from '../web/lib/prompt.js';

const GUARDIAN_ID = 'guardian_001';
const GUARDIAN_DIRS = ['fr', 'bk', 'lf', 'rt'];
const MID_FRAME_TIER = 0.3; // frame range [0.25,0.35] midpoint (knight sample value)
const TD_DIRECTION_TIER = 0.55; // direction range [0.5,0.6] midpoint (knight sample value)

export function guardianPaths(rootDir) {
  return {
    fixtures: resolve(rootDir, 'fixtures', 'guardian'),
    map: resolve(rootDir, 'fixtures', 'guardian', 'guardian-map.json'),
  };
}

function decodePngImg(buf) {
  const png = PNG.sync.read(buf);
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
}

// Deterministic 2x nearest upscale (32px fixtures -> 64px tier sources).
export function nearestUpscale2x(img) {
  if (!Number.isInteger(img.width) || !Number.isInteger(img.height) || img.width <= 0) {
    throw new Error(`nearestUpscale2x: bad image ${img.width}x${img.height}`);
  }
  const out = new Uint8ClampedArray(img.width * 2 * img.height * 2 * 4);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const si = (y * img.width + x) * 4;
      for (const dy of [0, 1]) {
        for (const dx of [0, 1]) {
          const di = ((y * 2 + dy) * (img.width * 2) + (x * 2 + dx)) * 4;
          out[di] = img.data[si];
          out[di + 1] = img.data[si + 1];
          out[di + 2] = img.data[si + 2];
          out[di + 3] = img.data[si + 3];
        }
      }
    }
  }
  return { data: out, width: img.width * 2, height: img.height * 2 };
}

// Deterministic union blend (offline stand-in for the AI in-between frame):
// silhouette = union of both alpha masks (threshold 128 = palette.mjs
// ALPHA_THRESHOLD), color = alpha-weighted average where both are opaque.
export function blendUnion(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`blendUnion: dims mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const out = new Uint8ClampedArray(a.width * a.height * 4);
  for (let i = 0; i < out.length; i += 4) {
    const aA = a.data[i + 3];
    const bA = b.data[i + 3];
    if (aA < 128 && bA < 128) continue; // transparent
    let r;
    let g;
    let bl;
    if (aA >= 128 && bA >= 128) {
      r = Math.round((a.data[i] * aA + b.data[i] * bA) / (aA + bA));
      g = Math.round((a.data[i + 1] * aA + b.data[i + 1] * bA) / (aA + bA));
      bl = Math.round((a.data[i + 2] * aA + b.data[i + 2] * bA) / (aA + bA));
    } else {
      const src = aA >= 128 ? a.data : b.data;
      r = src[i];
      g = src[i + 1];
      bl = src[i + 2];
    }
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = bl;
    out[i + 3] = 255;
  }
  return { data: out, width: a.width, height: a.height };
}

export function flipVertical(img) {
  const out = new Uint8ClampedArray(img.data.length);
  for (let y = 0; y < img.height; y++) {
    const srcRow = (img.height - 1 - y) * img.width * 4;
    const dstRow = y * img.width * 4;
    out.set(img.data.subarray(srcRow, srcRow + img.width * 4), dstRow);
  }
  return { data: out, width: img.width, height: img.height };
}

// Deterministic side-by-side composite of the two endpoint frames (design.md
// "对每方向 [f1, f2] 调 inbetween" through the frozen single-image adapter
// interface): left panel = earlier frame, right panel = later frame; panels
// share height. The prompt tells the provider how to read the panels.
export function composeSideBySide(a, b) {
  if (a.height !== b.height) {
    throw new Error(`composeSideBySide: height mismatch ${a.height} vs ${b.height}`);
  }
  const out = new Uint8ClampedArray((a.width + b.width) * a.height * 4);
  for (let y = 0; y < a.height; y++) {
    out.set(a.data.subarray(y * a.width * 4, (y + 1) * a.width * 4), y * (a.width + b.width) * 4);
    out.set(
      b.data.subarray(y * b.width * 4, (y + 1) * b.width * 4),
      (y * (a.width + b.width) + a.width) * 4,
    );
  }
  return { data: out, width: a.width + b.width, height: a.height };
}

function encodePngBytes(img) {
  return Buffer.from(encodePng(img.data, img.width, img.height));
}

function writePng(path, img) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePngBytes(img));
}

// Per-slot td derive plan: slot frame -> sd source frame (new structure,
// option-b numbering: walk [1=f1, 2=ai-mid, 3=f2], attack [1=f1, 2=f2, 3=ai]).
// Exported: the bridge preview derives its willWrite plan from the same truth.
export const TD_DERIVE_PLAN = [
  { action: 'idle', frames: { 0: 1 } },
  { action: 'walk', frames: { 1: 1, 3: 2 } },
  { action: 'attack', frames: { 1: 1, 2: 2 } },
];

// Offline mid stand-ins: sd = blend of the direction's two endpoint fixtures;
// td = flip of the sd mid (blend commutes with flip, so this equals blending
// the flipped endpoints — consistent with the td stand-in convention).
export function deriveMidFixtures({ fixturesDir } = {}) {
  const out = [];
  for (const dir of GUARDIAN_DIRS) {
    const f1 = decodePngImg(readFileSync(resolve(fixturesDir, `amg1_${dir}1.png`)));
    const f2 = decodePngImg(readFileSync(resolve(fixturesDir, `amg1_${dir}2.png`)));
    const sdMid = blendUnion(nearestUpscale2x(f1), nearestUpscale2x(f2));
    const sdPath = resolve(fixturesDir, 'mid', `guardian_sd_${dir}_mid.png`);
    writePng(sdPath, sdMid);
    const tdPath = resolve(fixturesDir, 'mid', `guardian_td_${dir}_mid.png`);
    writePng(tdPath, flipVertical(sdMid));
    out.push(sdPath, tdPath);
  }
  return out;
}

// Offline td stand-ins: vertical flip of the 64px-upscaled sd source content,
// one file per existing td slot (derive is per sd view, design.md).
export function deriveTdFixtures({ fixturesDir } = {}) {
  const out = [];
  for (const dir of GUARDIAN_DIRS) {
    for (const { action, frames } of TD_DERIVE_PLAN) {
      for (const [slotFrame, srcFrame] of Object.entries(frames)) {
        const src = decodePngImg(readFileSync(resolve(fixturesDir, `amg1_${dir}${srcFrame}.png`)));
        const path = resolve(fixturesDir, 'td', `guardian_${action}_${dir}${slotFrame}.png`);
        writePng(path, flipVertical(nearestUpscale2x(src)));
        out.push(path);
      }
    }
  }
  return out;
}

function midPrompt(dir) {
  return [
    DIR_SENTENCES[dir],
    `${ACTION_SENTENCES.walk}; ${ACTION_SENTENCES.attack}`,
    'in-between pose between the two input frames (placed side by side: left = earlier frame, right = later frame)',
    BARE_HANDS,
    SINGLE_FIGURE,
  ].join(', ');
}

function tdPrompt(dir, action) {
  return [BASE_TEMPLATES.td, DIR_SENTENCES[dir], ACTION_SENTENCES[action], BARE_HANDS, SINGLE_FIGURE].join(', ');
}

function guardianSeed(rootDir) {
  const asset = JSON.parse(readFileSync(resolve(rootDir, 'assets', GUARDIAN_ID, 'asset.json'), 'utf8'));
  return asset.seed;
}

// guardian-mid job: 8 inbetween calls (2 persp x 4 dirs), each over the PAIR
// of endpoint frames sent as one side-by-side composite (frozen single-image
// interface). sd endpoint pair = amg1_{dir}1 + amg1_{dir}2 (32px -> 2x
// upscaled); td endpoint pair = the td walk fixtures (already 64px). With
// --offline no network happens: deterministic stand-ins instead. `fetch` is
// injectable for tests (editImage defaults to globalThis.fetch). Returns the
// list of fixture paths written.
export async function orchestrateGuardianMid({ offline = false, rootDir, onProgress = async () => {}, fetch } = {}) {
  const { fixtures } = guardianPaths(rootDir);
  const written = [];
  if (offline) {
    for (const p of deriveMidFixtures({ fixturesDir: fixtures })) {
      written.push(p);
      await onProgress({ file: p, done: written.length });
    }
    return written;
  }
  const env = process.env;
  const seed = guardianSeed(rootDir);
  for (const dir of GUARDIAN_DIRS) {
    const pairs = [
      // td endpoints are walk frames 1 and 3 (frame 2 IS the AI mid being made)
      { persp: 'sd', f1: `amg1_${dir}1.png`, f2: `amg1_${dir}2.png`, scale: true },
      { persp: 'td', f1: `td/guardian_walk_${dir}1.png`, f2: `td/guardian_walk_${dir}3.png`, scale: false },
    ];
    for (const { persp, f1, f2, scale } of pairs) {
      const i1 = decodePngImg(readFileSync(resolve(fixtures, f1)));
      const i2 = decodePngImg(readFileSync(resolve(fixtures, f2)));
      const image = encodePngBytes(
        composeSideBySide(scale ? nearestUpscale2x(i1) : i1, scale ? nearestUpscale2x(i2) : i2),
      );
      const { buffer } = await editImage(
        { image, prompt: midPrompt(dir), negative: FIXED_NEGATIVE, tier: MID_FRAME_TIER, seed, size: 64 },
        { env, fetch },
      );
      const path = resolve(fixtures, 'mid', `guardian_${persp}_${dir}_mid.png`);
      writePng(path, decodePngImg(buffer));
      written.push(path);
      await onProgress({ file: path, done: written.length });
    }
  }
  return written;
}

// guardian-td job: 20 derive calls (one per existing sd view). With --offline
// the td fixtures are deterministic flips of the upscaled sd sources.
export async function orchestrateGuardianTd({ offline = false, rootDir, onProgress = async () => {} } = {}) {
  const { fixtures } = guardianPaths(rootDir);
  if (offline) {
    const written = [];
    for (const p of deriveTdFixtures({ fixturesDir: fixtures })) {
      written.push(p);
      await onProgress({ file: p, done: written.length });
    }
    return written;
  }
  const env = process.env;
  const seed = guardianSeed(rootDir);
  const written = [];
  for (const dir of GUARDIAN_DIRS) {
    for (const { action, frames } of TD_DERIVE_PLAN) {
      for (const [slotFrame, srcFrame] of Object.entries(frames)) {
        const image = readFileSync(resolve(fixtures, `amg1_${dir}${srcFrame}.png`));
        const { buffer } = await editImage(
          { image, prompt: tdPrompt(dir, action), negative: FIXED_NEGATIVE, tier: TD_DIRECTION_TIER, seed, size: 64 },
          { env },
        );
        const path = resolve(fixtures, 'td', `guardian_${action}_${dir}${slotFrame}.png`);
        writePng(path, decodePngImg(buffer));
        written.push(path);
        await onProgress({ file: path, done: written.length });
      }
    }
  }
  return written;
}

// Import segment shared by both jobs (and by the deterministic regression):
// re-land every slot from the committed map. stageRoot redirects writes for
// byte-stable temp-dir reruns.
export async function runGuardianImportSegment({ rootDir, stageRoot = null } = {}) {
  const { map } = guardianPaths(rootDir);
  return runMapImport({ assetId: GUARDIAN_ID, mapPath: map, stageRoot });
}

// ---- CLI ----
// node tools/img2img-providers.mjs status
// node tools/img2img-providers.mjs guardian-mid [--offline] [--stage <dir>]
// node tools/img2img-providers.mjs guardian-td [--offline] [--stage <dir>]
async function main() {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const [cmd, ...rest] = process.argv.slice(2);
  const has = (flag) => rest.includes(flag);
  const stageIdx = rest.indexOf('--stage');
  const stageRoot = stageIdx >= 0 && rest[stageIdx + 1] ? resolve(rest[stageIdx + 1]) : null;
  if (cmd === 'status') {
    console.log(JSON.stringify(img2imgStatus()));
    return;
  }
  if (cmd === 'guardian-mid' || cmd === 'guardian-td') {
    const offline = has('--offline');
    if (!offline) {
      const st = img2imgStatus();
      if (!st.active || !st.configured.includes(st.active)) {
        console.error(
          `FAIL: no usable img2img provider configured (active=${JSON.stringify(st.active)}, configured=${JSON.stringify(st.configured)}); use --offline for deterministic stand-ins`,
        );
        process.exit(3);
      }
    }
    const job = cmd === 'guardian-mid' ? orchestrateGuardianMid : orchestrateGuardianTd;
    const files = await job({ offline, rootDir, onProgress: ({ file, done }) => console.log(`OK: fixture ${done} ${file}`) });
    console.log(`OK: ${cmd} wrote ${files.length} fixtures${offline ? ' (offline stand-ins)' : ''}`);
    const seg = await runGuardianImportSegment({ rootDir, stageRoot });
    console.log(`OK: import segment landed ${seg.views} views + ${seg.masters} masters${stageRoot ? ` (staged: ${stageRoot})` : ''}`);
    return;
  }
  console.error(
    'usage: node tools/img2img-providers.mjs status | guardian-mid [--offline] [--stage <dir>] | guardian-td [--offline] [--stage <dir>]',
  );
  process.exit(2);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e));
    process.exit(1);
  });
}
