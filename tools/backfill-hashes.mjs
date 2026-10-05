// backfill-hashes.mjs —回填 asset.json 64 个 clip 的 prompt_hash 真值(7.1 前置)。
// 真值 = buildPrompt(KNIGHT_EXAMPLE, { perspective, dir, action, seed }).prompt_hash
// (djb2,8 hex;seed/denoise 已与样例一致,本次只回填 hash)。
// 可重入幂等:二次运行零变更。约束:只改 prompt_hash 值,不动任何键结构、
// seed/denoise/文件名;同(persp,dir,action)多帧同 hash 属预期(帧继承同 prompt)。
// 用法:node tools/backfill-hashes.mjs [assets/knight_001/asset.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt, KNIGHT_EXAMPLE } from '../web/lib/prompt.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const target = resolve(process.argv[2] ?? `${moduleDir}/../assets/knight_001/asset.json`);

const asset = JSON.parse(readFileSync(target, 'utf8'));
let text = readFileSync(target, 'utf8');
let changed = 0;
let total = 0;
// 只做 prompt_hash 值的文本级替换,不重排 JSON 空白:diff 仅含 64 行 hash 变更。
const pending = new Map(); // oldHash -> { want, count }
for (const action of Object.keys(asset.actions ?? {})) {
  const clips = asset.actions[action].clips;
  for (const persp of asset.perspectives ?? []) {
    for (const dir of asset.views ?? []) {
      for (const clip of clips?.[persp]?.[dir] ?? []) {
        total++;
        const want = buildPrompt(KNIGHT_EXAMPLE, {
          perspective: persp,
          dir,
          action,
          seed: clip.seed,
        }).prompt_hash;
        if (clip.prompt_hash !== want) {
          changed++;
          if (!pending.has(clip.prompt_hash)) pending.set(clip.prompt_hash, { want, count: 0 });
          pending.get(clip.prompt_hash).count++;
          if (pending.get(clip.prompt_hash).want !== want) {
            throw new Error(`placeholder ${clip.prompt_hash} maps to two hashes (mixed contexts?)`);
          }
        }
      }
    }
  }
}
for (const [oldHash, { want, count }] of pending) {
  const needle = `"prompt_hash": "${oldHash}"`;
  const hits = text.split(needle).length - 1;
  if (hits !== count) throw new Error(`expected ${count} occurrences of ${oldHash}, found ${hits}`);
  text = text.split(needle).join(`"prompt_hash": "${want}"`);
}
if (changed > 0) {
  writeFileSync(target, text, 'utf8');
}
console.log(`OK: backfilled ${changed}/${total} prompt_hash in ${target}${changed === 0 ? ' (idempotent, no changes)' : ''}`);
