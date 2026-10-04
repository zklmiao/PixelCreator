// verify-4.2.mjs — 4.2 progress check (not yet gated in tasks.md).
// Hard gate: no-key full flow stays runnable. Run: node web/verify-4.2.mjs
import { KNIGHT_EXAMPLE } from './lib/prompt.js';
import {
  DIR_DENOISE_RANGE, FRAME_DENOISE_RANGE,
  buildDerivationJobs, validateSeedLock, validateDenoiseRanges,
  callImg2imgReserved, runManualFlowWithoutKey,
} from './lib/img2img.js';

let failed = false;
const fail = (m) => { console.log(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`OK: ${m}`);

if (DIR_DENOISE_RANGE.join() !== '0.5,0.6') fail('dir range must be 0.5~0.6');
else ok('direction denoise range 0.5~0.6');
if (FRAME_DENOISE_RANGE.join() !== '0.25,0.35') fail('frame range must be 0.25~0.35');
else ok('frame-inherit denoise range 0.25~0.35');

const jobs = buildDerivationJobs(KNIGHT_EXAMPLE, { seed: 1234 });
// Default frames idle 1 / walk 3 / attack 4 -> per perspective (1+3+4)*4 = 32, x2 persp = 64.
if (jobs.length !== 64) fail(`expected 64 jobs, got ${jobs.length}`);
else ok('64 derivation jobs (2 persp x 4 dirs x (1+3+4) frames)');

const seedCheck = validateSeedLock(jobs);
if (!seedCheck.ok) fail(`seed not locked: ${seedCheck.seeds}`);
else ok(`same-character seed locked (${seedCheck.seeds[0]})`);

const denoiseCheck = validateDenoiseRanges(jobs);
if (!denoiseCheck.ok) {
  for (const b of denoiseCheck.bad.slice(0, 5)) console.log(`FAIL: ${b}`);
  fail('denoise out of range');
} else ok('all denoise values inside 4.2 ranges');

const single = await callImg2imgReserved(jobs[0]);
if (!single.skipped || single.reason !== 'no-key') fail('no-adapter call must return no-key skipped');
else ok('reserved call site returns manual instruction without key');

const flow = await runManualFlowWithoutKey(KNIGHT_EXAMPLE, { seed: 1234 });
if (flow.results.length !== jobs.length || !flow.results.every((r) => r.skipped)) {
  fail('manual flow without key must resolve all jobs as skipped/manual');
} else ok('no-key full flow runnable (all jobs manual-ready, zero network calls)');

if (failed) process.exit(1);
console.log('OK: 4.2 reserved slot verified (progress, not gated)');
