// asset-manifest.mjs — asset.json read/write + full-matrix validation (OpenSpec 3.2).
// Zero dependencies so the Web app can import it directly later.
// Kind/tier constants live in tools/kinds.mjs (polish-hardening D1 single
// source); the re-exports below keep existing importer paths stable.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ALL_KINDS, KIND_SIZES, STATIC_KINDS } from './kinds.mjs';

export const PERSPECTIVES = ['td', 'sd'];
export const DIRS = ['fr', 'bk', 'lf', 'rt'];
export const KINDS = ALL_KINDS;
export { STATIC_KINDS };
export const SMALL_KIND_SIZES = KIND_SIZES.weapon.tiers;
export const LARGE_KIND_SIZES = KIND_SIZES.building.tiers;

const FILE_RE = /^[a-z0-9_]+_(td|sd)_(idle|walk|attack)_(fr|bk|lf|rt)[0-9]+\.svg$/;

const ACTION_RULES = {
  idle: { min: 1, max: 1, loop: true },
  walk: { min: 2, max: 5, loop: true },
  attack: { min: 2, max: 5, loop: false, next: 'idle' },
};

const sameSet = (a, b) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function loadAsset(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function saveAsset(path, asset) {
  writeFileSync(path, JSON.stringify(asset, null, 2) + '\n');
}

export function validateAsset(asset, opts = {}) {
  const errors = [];
  const missing = [];
  const fail = (msg) => errors.push(msg);
  const missClip = (persp, action, dir, detail) => {
    const id = `${persp}/${action}/${dir}${detail ? `:${detail}` : ''}`;
    missing.push(id);
    errors.push(`missing clip: ${id}`);
  };

  if (!asset || typeof asset !== 'object') return { ok: false, errors: ['manifest is not an object'], missing };
  if (typeof asset.id !== 'string' || !asset.id) fail('id must be a non-empty string');
  if (!KINDS.includes(asset.kind)) fail(`kind must be one of ${KINDS.join(',')}, got ${JSON.stringify(asset.kind)}`);
  const kind = KINDS.includes(asset.kind) ? asset.kind : 'character';
  const isStatic = STATIC_KINDS.includes(kind);
  if (typeof asset.asset !== 'string' || !/^[a-z0-9]+$/.test(asset.asset)) {
    fail('asset must be a lowercase alphanumeric file prefix (e.g. "knight")');
  }
  const allowedSizes = KIND_SIZES[kind].tiers;
  if (!allowedSizes.includes(asset.size)) {
    fail(`size must be one of ${allowedSizes} for kind ${JSON.stringify(kind)}, got ${JSON.stringify(asset.size)}`);
  }
  const paletteRe = new RegExp(`^palette_${kind}@v[0-9]+$`);
  if (typeof asset.palette !== 'string' || !paletteRe.test(asset.palette)) {
    fail(`palette must match palette_${kind}@vN for kind ${JSON.stringify(kind)}, got ${JSON.stringify(asset.palette)}`);
  }
  if (!sameSet(asset.perspectives ?? [], PERSPECTIVES)) fail(`perspectives must be exactly [td, sd]`);
  if (!sameSet(asset.views ?? [], DIRS)) fail(`views must be exactly [fr, bk, lf, rt]`);
  for (const p of PERSPECTIVES) {
    if (!asset.masters?.[p] || typeof asset.masters[p] !== 'string') fail(`masters.${p} must be a path string`);
  }

  for (const [action, rule] of Object.entries(ACTION_RULES)) {
    if (isStatic && action !== 'idle') {
      if (asset.actions?.[action] !== undefined) {
        fail(`static kind ${JSON.stringify(kind)} must not define action "${action}" (idle only)`);
      }
      continue;
    }
    const a = asset.actions?.[action];
    if (!a) {
      for (const p of PERSPECTIVES) for (const d of DIRS) missClip(p, action, d, 'action absent');
      continue;
    }
    if (!Number.isInteger(a.frames) || a.frames < rule.min || a.frames > rule.max) {
      fail(`${action}.frames must be ${rule.min}..${rule.max}, got ${JSON.stringify(a.frames)}`);
    }
    if (typeof a.fps !== 'number' || a.fps <= 0) fail(`${action}.fps must be a positive number`);
    if (a.loop !== rule.loop) fail(`${action}.loop must be ${rule.loop}`);
    if (rule.next && a.next !== rule.next) fail(`${action}.next must be "${rule.next}"`);
    for (const p of PERSPECTIVES) {
      for (const d of DIRS) {
        const list = a.clips?.[p]?.[d];
        if (!Array.isArray(list)) {
          missClip(p, action, d, 'clip absent');
          continue;
        }
        if (Number.isInteger(a.frames) && list.length !== a.frames) {
          missClip(p, action, d, `expected ${a.frames} frames, found ${list.length}`);
          continue;
        }
        list.forEach((f, i) => {
          const where = `${p}/${action}/${d}[${i}]`;
          if (!f || typeof f.file !== 'string' || !FILE_RE.test(f.file)) {
            fail(`${where}: bad file name ${JSON.stringify(f?.file)}`);
            return;
          }
          const expectTag = `_${p}_${action}_${d}`;
          if (!f.file.includes(expectTag) || !f.file.startsWith(`${asset.asset}_`)) {
            fail(`${where}: file ${f.file} does not belong to ${asset.asset} ${p}/${action}/${d}`);
          }
          if (!Number.isInteger(f.seed)) fail(`${where}: seed must be an integer`);
          // img2img-live hash semantics: prompt_hash is the template hash of
          // prompt-derived frames (string) or null for imported/AI-adopted
          // slots; "pending" placeholders are retired repo-wide.
          if (f.prompt_hash === null) {
            // imported/AI slot: source_hash carries provenance (12 hex) or is
            // null while an AI slot awaits adoption.
          } else if (typeof f.prompt_hash !== 'string' || f.prompt_hash.length < 6) {
            fail(`${where}: prompt_hash must be null or a string of 6+ chars, got ${JSON.stringify(f.prompt_hash)}`);
          }
          if (f.source_hash !== undefined) {
            if (f.source_hash !== null && !/^[0-9a-f]{12}$/.test(f.source_hash)) {
              fail(`${where}: source_hash must be null or 12 hex chars, got ${JSON.stringify(f.source_hash)}`);
            }
          }
          if (f.prompt_hash === 'pending') fail(`${where}: "pending" placeholders are retired (img2img-live)`);
          if (opts.checkFiles) {
            const base = opts.baseDir ?? dirname(opts.manifestPath ?? '.');
            if (!existsSync(resolve(base, f.file))) fail(`${where}: file not on disk: ${f.file}`);
          }
        });
      }
    }
  }

  const pv = asset.preview;
  const allowedPreviewActions = isStatic ? ['idle'] : Object.keys(ACTION_RULES);
  if (!pv || !PERSPECTIVES.includes(pv.perspective) || !allowedPreviewActions.includes(pv.action) || !DIRS.includes(pv.dir)) {
    fail('preview must reference an existing perspective/action/dir');
  }

  return { ok: errors.length === 0, errors, missing };
}

function main() {
  const [cmd, target, ...rest] = process.argv.slice(2);
  if (cmd !== 'validate' || !target) {
    console.error('usage: node tools/asset-manifest.mjs validate <asset.json> [--check-files]');
    process.exit(2);
  }
  const manifestPath = resolve(target);
  const asset = loadAsset(manifestPath);
  const result = validateAsset(asset, {
    checkFiles: rest.includes('--check-files'),
    baseDir: dirname(manifestPath),
    manifestPath,
  });
  if (result.ok) {
    const actionCount = Object.keys(asset.actions ?? {}).length || Object.keys(ACTION_RULES).length;
    const clips = PERSPECTIVES.length * DIRS.length * actionCount;
    console.log(`OK: ${asset.id} complete (${clips} clips, size ${asset.size}, ${asset.palette})`);
  } else {
    for (const e of result.errors) console.log(`FAIL: ${e}`);
    console.log(`missing clips: ${result.missing.length}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) main();
