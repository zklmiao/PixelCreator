// prompt.js — 4.1 prompt composer (10-field form + v0.2 four constraints).
// Pure ES module: imported by web/app.js (browser) and web/verify-4.1.mjs (node).
// Frozen-contract note: reads asset.json seed/palette only, never writes assets/.

export const REQUIRED_FIELDS = ['charClass', 'body', 'outfit', 'colors', 'weapon', 'hair'];
export const OPTIONAL_FIELDS = ['cape', 'vibe', 'perspective', 'seed'];
export const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

export const PERSPECTIVES = ['td', 'sd'];
export const DIRS = ['fr', 'bk', 'lf', 'rt'];
export const ACTIONS = ['idle', 'walk', 'attack'];

// td/sd master base templates (proportions locked, perspective only differs here).
export const BASE_TEMPLATES = {
  td: 'top-down pixel-art RPG character sprite, chibi proportions, large head, full body, centered, white background',
  sd: 'side-view pixel-art RPG character sprite, chibi proportions, large head, full body, centered, white background',
};

// Direction derivation sub-sentences. bk forbids face (Back-view hallucination guard).
export const DIR_SENTENCES = {
  fr: 'facing front, face visible, symmetric stance',
  bk: 'facing back, back of head visible, no face, no eyes, cape covering back',
  lf: 'facing left, side profile facing left',
  rt: 'facing right, side profile facing right',
};

// Action sub-sentences. v0.2: idle neutral vs walk stride split.
export const ACTION_SENTENCES = {
  idle: 'neutral standing pose, feet shoulder-width on baseline, sword pointing down, cape resting',
  walk: 'mid-stride walking pose, one foot forward one back, cape slight lift',
  attack: 'attack lunge pose, sword swung forward, front foot planted, cape flared',
};

// v0.2 four constraints (always injected, not user-editable).
export const BARE_HANDS = 'skin-colored bare hands, no gloves, five fingers';
export const SINGLE_FIGURE = 'single character only, one pose per image, no diptych, no side-by-side';
export const SWORD_SEP = 'sword held forward, clearly separated from legs, no overlap';

// Fixed negative string: limb errors, cropped feet, shadows, gradients,
// photo/3d, face-on-back, gloves, diptych. Uneditable in v1 except advanced toggle.
export const FIXED_NEGATIVE =
  'extra limbs, mutated hands, cropped feet, shadows, gradients, photorealistic, 3d render, face on back view, gloves, diptych, side-by-side, blurry, cropped head';

// Static kind-aware sentences (idle-only objects, no human-figure wording).
// Character constants above frozen; static path never emits BARE_HANDS /
// SINGLE_FIGURE / SWORD_SEP.
export const STATIC_KINDS = ['weapon', 'building', 'prop', 'scenery'];
export const KIND_OBJECT_WORDS = { weapon: 'sword', building: 'house', prop: 'crate', scenery: 'tree' };
export const STATIC_BASE_TEMPLATES = {
  td: 'top-down pixel-art RPG object sprite, centered, white background',
  sd: 'side-view pixel-art RPG object sprite, centered, white background',
};
export const STATIC_DIR_SENTENCES = {
  fr: 'front view, symmetric',
  bk: 'back view, rear side visible',
  lf: 'left side view, profile facing left',
  rt: 'right side view, profile facing right',
};
export const STATIC_ACTION_SENTENCES = {
  idle: 'resting idle state, stable placement on baseline',
};
export const STATIC_KIND_SENTENCES = {
  weapon: 'a steel sword weapon, sharp blade',
  building: 'a small stone house building with tiled roof',
  prop: 'a wooden crate prop with nailed planks',
  scenery: 'a leafy green tree scenery with dense canopy',
};
export const STATIC_REQUIRED_FIELDS = ['object', 'colors'];

// Denoise tiers (design: C1 derivation ordering). Matches frozen knight_001 sample:
// idle clips 0.55 (direction derivation), walk/attack clips 0.3 (frame inheritance).
export const DENOISE = {
  master: 1.0,
  direction: 0.55,
  frame: 0.3,
};

export function getDenoiseTier(action) {
  if (action === 'idle') return 'direction';
  if (action === 'walk' || action === 'attack') return 'frame';
  throw new Error(`unknown action: ${action}`);
}

export function getDenoise(action) {
  return DENOISE[getDenoiseTier(action)];
}

function normStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function validateFields(fields) {
  const errors = [];
  for (const k of REQUIRED_FIELDS) {
    if (!normStr(fields[k])) errors.push(`${k} is required`);
  }
  if (fields.perspective !== undefined && fields.perspective !== '' && !PERSPECTIVES.includes(fields.perspective)) {
    errors.push(`perspective must be one of ${PERSPECTIVES.join(', ')}`);
  }
  if (fields.seed !== undefined && fields.seed !== '' && !Number.isInteger(Number(fields.seed))) {
    errors.push('seed must be an integer');
  }
  return { ok: errors.length === 0, errors };
}

const resolveKind = (fields, opts) => fields?.kind ?? opts?.kind ?? 'character';

export function validateStaticFields(fields) {
  const errors = [];
  for (const k of STATIC_REQUIRED_FIELDS) {
    if (!normStr(fields[k])) errors.push(`${k} is required`);
  }
  if (fields.perspective !== undefined && fields.perspective !== '' && !PERSPECTIVES.includes(fields.perspective)) {
    errors.push(`perspective must be one of ${PERSPECTIVES.join(', ')}`);
  }
  if (fields.seed !== undefined && fields.seed !== '' && !Number.isInteger(Number(fields.seed))) {
    errors.push('seed must be an integer');
  }
  return { ok: errors.length === 0, errors };
}

// djb2 hex, 8 chars — deterministic prompt_hash for clip traceability.
export function hashPrompt(positive) {
  let h = 5381;
  for (let i = 0; i < positive.length; i++) {
    h = ((h << 5) + h + positive.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function buildPositive(fields, { perspective, dir, action, kind } = {}) {
  const resolvedKind = resolveKind(fields, { kind });
  if (STATIC_KINDS.includes(resolvedKind)) {
    if (!PERSPECTIVES.includes(perspective)) throw new Error(`bad perspective: ${perspective}`);
    if (!DIRS.includes(dir)) throw new Error(`bad dir: ${dir}`);
    if (action !== 'idle') throw new Error(`static kind "${resolvedKind}" supports idle only, got "${action}"`);
    const v = validateStaticFields(fields);
    if (!v.ok) throw new Error(`invalid fields: ${v.errors.join('; ')}`);
    const parts = [STATIC_BASE_TEMPLATES[perspective]];
    parts.push(STATIC_KIND_SENTENCES[resolvedKind]);
    parts.push(`${normStr(fields.object)}`);
    parts.push(`colors ${normStr(fields.colors)}`);
    if (normStr(fields.vibe)) parts.push(`${normStr(fields.vibe)} style`);
    parts.push(STATIC_DIR_SENTENCES[dir]);
    parts.push(STATIC_ACTION_SENTENCES.idle);
    return parts.filter(Boolean).join(', ');
  }
  if (!PERSPECTIVES.includes(perspective)) throw new Error(`bad perspective: ${perspective}`);
  if (!DIRS.includes(dir)) throw new Error(`bad dir: ${dir}`);
  if (!ACTIONS.includes(action)) throw new Error(`bad action: ${action}`);

  const v = validateFields(fields);
  if (!v.ok) throw new Error(`invalid fields: ${v.errors.join('; ')}`);

  const parts = [BASE_TEMPLATES[perspective]];
  parts.push(`${normStr(fields.charClass)} ${normStr(fields.body)}`.trim());
  parts.push(`wearing ${normStr(fields.outfit)}`);
  parts.push(`colors ${normStr(fields.colors)}`);
  if (normStr(fields.weapon)) parts.push(`holding ${normStr(fields.weapon)}`);
  parts.push(`${normStr(fields.hair)}`);
  if (normStr(fields.cape)) parts.push(`${normStr(fields.cape)}`);
  if (normStr(fields.vibe)) parts.push(`${normStr(fields.vibe)} style`);
  parts.push(DIR_SENTENCES[dir]);
  parts.push(ACTION_SENTENCES[action]);
  // v0.2 four constraints — always last, fixed order for template-equality check.
  parts.push(BARE_HANDS);
  parts.push(SINGLE_FIGURE);
  if (normStr(fields.weapon)) parts.push(SWORD_SEP);
  return parts.filter(Boolean).join(', ');
}

export function buildPrompt(fields, { perspective, dir, action, seed, kind } = {}) {
  const p = perspective ?? normStr(fields.perspective) ?? 'td';
  const lockedSeed = Number(seed ?? fields.seed ?? 1234);
  if (!Number.isInteger(lockedSeed)) throw new Error('seed must be an integer');
  const resolvedKind = resolveKind(fields, { kind });
  const positive = buildPositive(fields, { perspective: p, dir, action, kind: resolvedKind });
  const negative = FIXED_NEGATIVE;
  const denoise = getDenoise(action);
  return {
    positive,
    negative,
    perspective: p,
    dir,
    action,
    denoise,
    seed: lockedSeed,
    prompt_hash: hashPrompt(positive),
  };
}

// Knight example used by verify-4.1 + prefilled in the UI form.
// Seed 1234 matches frozen assets/knight_001/asset.json (read-only reference).
export const KNIGHT_EXAMPLE = {
  charClass: 'knight',
  body: 'stocky male soldier, chibi proportions',
  outfit: 'red tunic with silver chest plate',
  colors: 'red, silver, brown, skin',
  weapon: 'straight steel sword',
  hair: 'short brown hair',
  cape: 'dark red cape',
  vibe: 'brave, classic JRPG',
  perspective: 'td',
  seed: 1234,
};

// Static examples (one per kind) used by verify-static + docs.
// Seeds match frozen assets/*/asset.json (read-only reference).
export const SWORD_EXAMPLE = {
  kind: 'weapon',
  object: 'straight steel sword',
  colors: 'silver, gray, brown',
  vibe: 'sharp, game-ready',
  perspective: 'td',
  seed: 2001,
};
export const HOUSE_EXAMPLE = {
  kind: 'building',
  object: 'small stone house',
  colors: 'brown, gray, green',
  vibe: 'cozy RPG',
  perspective: 'td',
  seed: 2002,
};
export const CRATE_EXAMPLE = {
  kind: 'prop',
  object: 'wooden crate',
  colors: 'brown, tan',
  vibe: 'sturdy storage',
  perspective: 'td',
  seed: 2003,
};
export const TREE_EXAMPLE = {
  kind: 'scenery',
  object: 'leafy green tree',
  colors: 'green, brown',
  vibe: 'lush forest',
  perspective: 'td',
  seed: 2004,
};
export const STATIC_EXAMPLES = {
  weapon: SWORD_EXAMPLE,
  building: HOUSE_EXAMPLE,
  prop: CRATE_EXAMPLE,
  scenery: TREE_EXAMPLE,
};
