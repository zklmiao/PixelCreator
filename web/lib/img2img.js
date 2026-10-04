// img2img.js — 4.2 reserved external call site (no-key manual flow is the hard gate).
// Zero deps, pure ESM. Never touches assets//palettes//tools. Only builds job descriptors
// from the 4.1 composer, so the full character flow stays runnable without any model key.

import { PERSPECTIVES, DIRS, ACTIONS, buildPrompt, KNIGHT_EXAMPLE } from './prompt.js';

// Hard ranges from tasks.md 4.2 (also match frozen knight_001 sample: 0.55 / 0.3).
export const DIR_DENOISE_RANGE = [0.5, 0.6];
export const FRAME_DENOISE_RANGE = [0.25, 0.35];

// Default frame counts mirror frozen knight_001 sample (idle 1 / walk 3 / attack 4).
export const DEFAULT_FRAMES = { idle: 1, walk: 3, attack: 4 };

export const inRange = (v, [lo, hi]) => typeof v === 'number' && v >= lo && v <= hi;
export const isDirDenoise = (v) => inRange(v, DIR_DENOISE_RANGE);
export const isFrameDenoise = (v) => inRange(v, FRAME_DENOISE_RANGE);

// C1 ordering: front master -> direction derivation -> frame inheritance.
// idle jobs are direction derivations; walk/attack jobs are frame inheritances.
export function sourceOf(action) {
  if (action === 'idle') return 'direction';
  if (action === 'walk' || action === 'attack') return 'frame';
  throw new Error(`unknown action: ${action}`);
}

// Build one manual-ready job per clip. Seed is locked per character across all jobs.
export function buildDerivationJobs(fields, { seed, frames = DEFAULT_FRAMES } = {}) {
  const lockedSeed = Number(seed ?? fields.seed ?? KNIGHT_EXAMPLE.seed ?? 1234);
  if (!Number.isInteger(lockedSeed)) throw new Error('seed must be an integer');
  const jobs = [];
  for (const perspective of PERSPECTIVES) {
    for (const action of ACTIONS) {
      const n = frames[action] ?? 1;
      for (const dir of DIRS) {
        for (let i = 0; i < n; i++) {
          const composed = buildPrompt({ ...fields, seed: lockedSeed }, { perspective, dir, action, seed: lockedSeed });
          jobs.push({
            perspective,
            action,
            dir,
            frame: action === 'idle' ? 0 : i + 1,
            positive: composed.positive,
            negative: composed.negative,
            denoise: composed.denoise,
            seed: lockedSeed,
            prompt_hash: composed.prompt_hash,
            source: sourceOf(action),
            mode: 'manual-ready',
          });
        }
      }
    }
  }
  return jobs;
}

export function validateSeedLock(jobs) {
  const seeds = new Set(jobs.map((j) => j.seed));
  return { ok: seeds.size === 1, seeds: [...seeds] };
}

export function validateDenoiseRanges(jobs) {
  const bad = [];
  for (const j of jobs) {
    const ok = j.source === 'direction' ? isDirDenoise(j.denoise) : isFrameDenoise(j.denoise);
    if (!ok) bad.push(`${j.perspective}/${j.action}/${j.dir}[${j.frame}]: denoise ${j.denoise} out of ${j.source} range`);
  }
  return { ok: bad.length === 0, bad };
}

// Reserved external call site. With no adapter (no key), it NEVER throws and NEVER
// requires network: it returns a manual instruction so the flow stays runnable.
export async function callImg2imgReserved(job, { adapter } = {}) {
  if (!adapter) {
    return {
      ok: false,
      skipped: true,
      reason: 'no-key',
      manual: `import prototype manually for ${job.perspective}/${job.action}/${job.dir}[${job.frame}] (denoise ${job.denoise}, seed ${job.seed})`,
      job,
    };
  }
  return adapter(job);
}

// Full manual flow without a key: every job resolves to a skipped/manual record.
export async function runManualFlowWithoutKey(fields, opts = {}) {
  const jobs = buildDerivationJobs(fields, opts);
  const results = [];
  for (const job of jobs) {
    results.push(await callImg2imgReserved(job));
  }
  return { jobs, results };
}
