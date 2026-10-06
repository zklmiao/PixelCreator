// verify-recipe.mjs — Godot import recipe self-check (read-only, no Godot needed).
// Re-derives every frame region from the shipped maps in ../generic using the
// recipe formula (x=col*cell, y=row*cell, w=h=cell) and asserts:
//   - sheet filename matches its map file name
//   - PNG IHDR geometry equals cols*cell x rows*cell (no marg in, zero spacing)
//   - stored x/y/w/h equals the re-derived region and lies inside geometry
//   - row order fr/bk/lf/rt (col-0 frames)
//   - fps/loop/next contract per action (walk 6/true/null, attack 8/false/idle)
// Reads only: never writes assets/sheets/placeholder/output files.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../generic');
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DIRS = ['fr', 'bk', 'lf', 'rt'];
const CONTRACT = {
  walk: { fps: 6, loop: true, next: null },
  attack: { fps: 8, loop: false, next: 'idle' },
};

let failures = 0;
let mapCount = 0;
let frameCount = 0;

function fail(map, msg) {
  failures += 1;
  console.error(`FAIL: ${map}: ${msg}`);
}

function pngDims(buf, map) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) {
    fail(map, 'bad PNG signature');
    return null;
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const maps = readdirSync(dir).filter((f) => f.endsWith('.map.json')).sort();
if (maps.length === 0) fail('(dir)', `no shipped maps in ${dir}`);

for (const m of maps) {
  const map = JSON.parse(readFileSync(resolve(dir, m), 'utf8'));
  mapCount += 1;
  if (map.sheet + '.map.json' !== m) fail(m, 'sheet field must match file name');
  const png = readFileSync(resolve(dir, map.sheet));
  const dims = pngDims(png, m);
  if (!dims) continue;
  if (dims.w !== map.cols * map.cell || dims.h !== map.rows * map.cell) {
    fail(m, `PNG ${dims.w}x${dims.h} != cols*cell x rows*cell (${map.cols * map.cell}x${map.rows * map.cell})`);
  }
  const want = CONTRACT[map.action];
  if (!want) {
    fail(m, `unexpected action ${map.action}`);
  } else {
    if (map.fps !== want.fps) fail(m, `fps ${map.fps} != ${want.fps}`);
    if (map.loop !== want.loop) fail(m, `loop ${map.loop} != ${want.loop}`);
    if (map.next !== want.next) fail(m, `next ${JSON.stringify(map.next)} != ${JSON.stringify(want.next)}`);
  }
  const firsts = map.frames.filter((f) => f.col === 0).map((f) => f.dir);
  if (JSON.stringify(firsts) !== JSON.stringify(DIRS)) {
    fail(m, `row order ${firsts.join(',')} != fr,bk,lf,rt`);
  }
  for (const f of map.frames) {
    frameCount += 1;
    const rx = f.col * map.cell;
    const ry = f.row * map.cell;
    if (f.x !== rx || f.y !== ry || f.w !== map.cell || f.h !== map.cell) {
      fail(m, `${f.file}: stored (${f.x},${f.y},${f.w},${f.h}) != re-derived (${rx},${ry},${map.cell},${map.cell})`);
    }
    if (f.x + f.w > dims.w || f.y + f.h > dims.h) {
      fail(m, `${f.file}: rect outside sheet ${dims.w}x${dims.h}`);
    }
  }
  console.log(`OK: ${m} (${map.frames.length} frames, ${dims.w}x${dims.h})`);
}

if (failures > 0) {
  console.error(`recipe self-check FAILED: ${failures} failure(s) in ${mapCount} maps`);
  process.exit(1);
}
console.log(`OK: recipe self-check passed (${mapCount} maps, ${frameCount} frames)`);
