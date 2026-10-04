// verify-1.1.mjs — scaffold acceptance: dual-master slots + asset.json shell loadable.
// Read-only: never writes assets/. Run: node web/verify-1.1.mjs
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAsset } from '../tools/asset-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'assets/knight_001/asset.json');
const fail = (m) => { console.log(`FAIL: ${m}`); process.exitCode = 1; };
const ok = (m) => console.log(`OK: ${m}`);

const requiredWeb = ['web/index.html', 'web/app.js', 'web/styles.css', 'web/lib/prompt.js', 'web/lib/asset-shell.js'];
for (const f of requiredWeb) {
  if (!existsSync(resolve(root, f))) fail(`missing scaffold file ${f}`);
  else ok(`scaffold file ${f}`);
}
if (process.exitCode) process.exit(process.exitCode);

const asset = JSON.parse(readFileSync(manifestPath, 'utf8'));
// 1.1 shell check: dual masters + perspectives/views + preview pointer.
if (asset.masters?.td !== 'master_td.svg') fail('masters.td slot mismatch');
else ok('masters.td slot = master_td.svg');
if (asset.masters?.sd !== 'master_side.svg') fail('masters.sd slot mismatch');
else ok('masters.sd slot = master_side.svg');

const r = validateAsset(asset); // no checkFiles: shell-only stage, view SVGs not yet on disk.
if (!r.ok) {
  for (const e of r.errors) console.log(`FAIL: ${e}`);
  process.exit(1);
}
ok(`${asset.id} shell loadable (2 perspectives x 4 dirs x 3 actions, size ${asset.size}, ${asset.palette})`);
