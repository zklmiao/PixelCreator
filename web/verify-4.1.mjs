// verify-4.1.mjs — prompt-form acceptance: 10 fields, td/sd + dir/action sentences,
// fixed negative, denoise/seed tiers, v0.2 four constraints, knight example consistency.
// Run: node web/verify-4.1.mjs
import {
  ALL_FIELDS, REQUIRED_FIELDS, OPTIONAL_FIELDS,
  BASE_TEMPLATES, DIR_SENTENCES, ACTION_SENTENCES,
  BARE_HANDS, SINGLE_FIGURE, SWORD_SEP, FIXED_NEGATIVE,
  getDenoise, buildPrompt, KNIGHT_EXAMPLE,
} from './lib/prompt.js';

let failed = false;
const fail = (m) => { console.log(`FAIL: ${m}`); failed = true; };
const ok = (m) => console.log(`OK: ${m}`);

// 10 fields = 6 required + 4 optional.
if (ALL_FIELDS.length !== 10) fail(`expected 10 fields, got ${ALL_FIELDS.length}`);
else ok('10 fields');
if (REQUIRED_FIELDS.join() !== 'charClass,body,outfit,colors,weapon,hair') fail('6 required fields mismatch');
else ok('6 required fields');
if (OPTIONAL_FIELDS.join() !== 'cape,vibe,perspective,seed') fail('4 optional fields mismatch');
else ok('4 optional fields (cape/vibe/perspective/seed)');

// Fixed negative covers spec list.
for (const needle of ['cropped feet', 'shadows', 'gradients', 'photorealistic', '3d render', 'face on back view', 'gloves', 'diptych']) {
  if (!FIXED_NEGATIVE.includes(needle)) fail(`negative missing "${needle}"`);
}
ok('fixed negative covers limb/crop/shadow/gradient/photo-3d/face-back/gloves/diptych');

// Denoise tiers match frozen sample (idle 0.55 direction, walk/attack 0.3 frame).
if (getDenoise('idle') !== 0.55) fail('idle denoise must be 0.55');
else ok('idle denoise 0.55 (direction derivation 0.5~0.6)');
if (getDenoise('walk') !== 0.3 || getDenoise('attack') !== 0.3) fail('walk/attack denoise must be 0.3');
else ok('walk/attack denoise 0.3 (frame inheritance 0.25~0.35)');

// Knight example: td+sd bases, all dirs/actions, v0.2 four constraints, seed lock.
const combos = [];
for (const p of ['td', 'sd']) for (const d of ['fr', 'bk', 'lf', 'rt']) for (const a of ['idle', 'walk', 'attack']) combos.push([p, d, a]);
for (const [p, d, a] of combos) {
  const r = buildPrompt(KNIGHT_EXAMPLE, { perspective: p, dir: d, action: a, seed: KNIGHT_EXAMPLE.seed });
  if (!r.positive.includes(BASE_TEMPLATES[p])) fail(`${p}/${d}/${a}: missing base template`);
  if (!r.positive.includes(DIR_SENTENCES[d])) fail(`${p}/${d}/${a}: missing dir sentence`);
  if (!r.positive.includes(ACTION_SENTENCES[a])) fail(`${p}/${d}/${a}: missing action sentence`);
  if (!r.positive.includes(BARE_HANDS)) fail(`${p}/${d}/${a}: missing bare-hands lock`);
  if (!r.positive.includes(SINGLE_FIGURE)) fail(`${p}/${d}/${a}: missing single-figure lock`);
  if (!r.positive.includes(SWORD_SEP)) fail(`${p}/${d}/${a}: missing sword-leg separation`);
  if (r.negative !== FIXED_NEGATIVE) fail(`${p}/${d}/${a}: negative mutated`);
  if (r.seed !== 1234) fail(`${p}/${d}/${a}: seed not locked to 1234`);
  if (typeof r.prompt_hash !== 'string' || r.prompt_hash.length < 6) fail(`${p}/${d}/${a}: bad prompt_hash`);
}
// Stance split: idle neutral vs walk stride wording must differ.
const idleW = buildPrompt(KNIGHT_EXAMPLE, { perspective: 'td', dir: 'fr', action: 'idle', seed: 1234 }).positive;
const walkW = buildPrompt(KNIGHT_EXAMPLE, { perspective: 'td', dir: 'fr', action: 'walk', seed: 1234 }).positive;
if (!idleW.includes('neutral standing pose') || !walkW.includes('mid-stride')) fail('idle-neutral vs walk-stride split missing');
else ok('idle-neutral vs walk-stride split');
if (!buildPrompt(KNIGHT_EXAMPLE, { perspective: 'td', dir: 'bk', action: 'idle', seed: 1234 }).positive.includes('no face')) {
  fail('bk must forbid face');
} else ok('bk forbids face');
ok(`knight example consistent across ${combos.length} clips (2 persp x 4 dirs x 3 actions), seed locked`);

if (failed) process.exit(1);
console.log('OK: 4.1 prompt template verified');
