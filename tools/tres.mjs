// tres.mjs — Godot 4 SpriteFrames `.tres` generator (OpenSpec real-character-m3,
// godot-adapter MODIFIED: retires the recipe-only "No tres" clause).
//
// Reads shipped Full maps only (`sheets/<prefix>_<persp>_<action>.png.map.json`,
// mode full; Maker `$` sheets never enter) and writes one text resource per
// asset: `godot/<id>.spriteframes.tres`.
//
// Text contract (Godot 4.x SpriteFrames, pinned by tools/tres.test.mjs):
// - header `[gd_resource type="SpriteFrames" load_steps=N format=3]`, no uid
//   (Godot rebuilds it on import; docs note it).
// - one `[ext_resource type="Texture2D" path="res://sheets/<png>" id]` per
//   Full sheet (import path default `res://sheets/`, documented).
// - one `[sub_resource type="AtlasTexture"]` per map frame,
//   `region = Rect2(x, y, w, h)` copied map-exact (recipe §1, zero spacing).
// - one `[sub_resource type="SpriteFrames"]` with `animations` named
//   `{persp}/{action}/{dir}` (recipe #15), `"speed"` = map fps (recipe §2.1),
//   `"loop"` = map loop as bool (true→LOOP_FORWARD, false→LOOP_NONE per
//   recipe #17; SpriteFrames stores bool, no ping-pong/backward in pipeline),
//   per-frame `"duration": 1.0`.
// - absent by design: `texture_filter` (project-level Nearest default, recipe
//   #13, docs-owned), `speed_scale` (1.0 default, recipe #18), hitbox/mount
//   (recipe #19–#20, no source data), Maker mapping (recipe #21, Full only).
// Deterministic: fixed sheet/animation/frame order, LF, trailing newline.
export const TRES_DIRS = ['fr', 'bk', 'lf', 'rt'];
export const TRES_PERSPS = ['td', 'sd'];
export const TRES_ACTIONS = ['idle', 'walk', 'attack'];

function fmtFloat(n) {
  if (!Number.isFinite(n) || n <= 0) throw new Error(`tres speed must be a positive number, got ${JSON.stringify(n)}`);
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

// Pure builder: sheets = [{ png, map }] with map parsed JSON (mode full).
// Returns the full `.tres` text.
export function buildTresText({ assetId, sheets }) {
  if (typeof assetId !== 'string' || !assetId) throw new Error('tres: assetId required');
  if (!Array.isArray(sheets) || sheets.length === 0) throw new Error(`tres: ${assetId} needs Full maps, got none`);
  const order = new Map(TRES_ACTIONS.map((a, i) => [a, i]));
  const perank = new Map(TRES_PERSPS.map((p, i) => [p, i]));
  const sorted = [...sheets].sort(
    (a, b) => perank.get(a.map.perspective) - perank.get(b.map.perspective) || order.get(a.map.action) - order.get(b.map.action),
  );
  for (const s of sorted) {
    if (s.map.mode !== 'full') throw new Error(`tres: ${assetId} reads Full maps only, got mode ${JSON.stringify(s.map.mode)} (${s.png})`);
    if (s.png.startsWith('$')) throw new Error(`tres: Maker sheet must not enter ${assetId} (${s.png})`);
  }
  const extIds = new Map(sorted.map((s, i) => [s.png, String(i + 1)]));
  const lines = [];
  // Atlas frames in animation emission order: sheet × dir(fr..rt) × col.
  const anims = [];
  let atlasN = 0;
  const atlasBlocks = [];
  for (const s of sorted) {
    const { map, png } = s;
    const have = new Set();
    for (const f of map.frames) {
      if (!TRES_DIRS.includes(f.dir)) {
        throw new Error(`tres: ${assetId} ${map.perspective}/${map.action} has unknown dir ${JSON.stringify(f.dir)}`);
      }
      have.add(f.dir);
    }
    // Completeness (24 animations on shipped assets) is pinned by
    // tools/tres.test.mjs against the frozen skeletons, not here, so the
    // single-animation golden can run through this same builder.
    for (const dir of TRES_DIRS.filter((d) => have.has(d))) {
      const cells = map.frames.filter((f) => f.dir === dir).sort((a, b) => a.col - b.col);
      const refs = [];
      for (const c of cells) {
        atlasN++;
        const id = `AtlasTexture_${atlasN}`;
        atlasBlocks.push(
          `[sub_resource type="AtlasTexture" id="${id}"]\n` +
            `atlas = ExtResource("${extIds.get(png)}")\n` +
            `region = Rect2(${c.x}, ${c.y}, ${c.w}, ${c.h})`,
        );
        refs.push(id);
      }
      anims.push({ name: `${map.perspective}/${map.action}/${dir}`, speed: map.fps, loop: map.loop, refs });
    }
  }
  const loadSteps = sorted.length + atlasN + 2;
  lines.push(`[gd_resource type="SpriteFrames" load_steps=${loadSteps} format=3]`);
  lines.push('');
  for (const s of sorted) {
    lines.push(`[ext_resource type="Texture2D" path="res://sheets/${s.png}" id="${extIds.get(s.png)}"]`);
  }
  lines.push('');
  lines.push(...atlasBlocks);
  lines.push('');
  lines.push('[sub_resource type="SpriteFrames" id="SpriteFrames_1"]');
  const animTexts = anims.map(
    (a) =>
      `{\n"frames": [${a.refs
        .map((r) => `{\n"duration": 1.0,\n"texture": SubResource("${r}")\n}`)
        .join(', ')}],\n"loop": ${a.loop ? 'true' : 'false'},\n"name": &"${a.name}",\n"speed": ${fmtFloat(a.speed)}\n}`,
  );
  lines.push(`animations = [${animTexts.join(', ')}]`);
  return lines.join('\n') + '\n';
}

// exportTres(assetId, outDir='godot') -> { path, anims, frames, bytes }.
// Reads asset.json + shipped Full maps from sheets/, writes godot/<id>.spriteframes.tres.
export async function exportTres(assetId = 'knight_001', outDir = 'godot') {
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const assetDir = resolve(moduleDir, '..', 'assets', assetId);
  const sheetsDir = resolve(moduleDir, '..', 'sheets');
  const asset = JSON.parse(readFileSync(resolve(assetDir, 'asset.json'), 'utf8'));
  const sheets = [];
  for (const persp of TRES_PERSPS) {
    for (const action of Object.keys(asset.actions ?? {})) {
      const png = `${asset.asset}_${persp}_${action}.png`;
      const mapFile = `${png}.map.json`;
      let map;
      try {
        map = JSON.parse(readFileSync(resolve(sheetsDir, mapFile), 'utf8'));
      } catch (e) {
        throw new Error(`tres: missing shipped Full map sheets/${mapFile} for ${assetId} (export first): ${e.message}`);
      }
      sheets.push({ png, map });
    }
  }
  const text = buildTresText({ assetId, sheets });
  const out = resolve(moduleDir, '..', outDir);
  mkdirSync(out, { recursive: true });
  const file = `${assetId}.spriteframes.tres`;
  writeFileSync(resolve(out, file), text, 'utf8');
  const anims = TRES_PERSPS.length * Object.keys(asset.actions ?? {}).length * TRES_DIRS.length;
  const frames = sheets.reduce((n, s) => n + s.map.frames.length, 0);
  console.log(`OK: ${file} (${anims} animations, ${frames} frames, Full only)`);
  return { path: resolve(out, file), anims, frames, bytes: Buffer.byteLength(text) };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd !== 'export') {
    console.error('usage: node tools/tres.mjs export [--asset knight_001] [--out godot]');
    process.exit(2);
  }
  let assetId = 'knight_001';
  let outDir = 'godot';
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--asset' && rest[i + 1]) assetId = rest[i + 1];
    else if (rest[i].startsWith('--asset=')) assetId = rest[i].slice('--asset='.length);
    else if (rest[i] === '--out' && rest[i + 1]) outDir = rest[i + 1];
    else if (rest[i].startsWith('--out=')) outDir = rest[i].slice('--out='.length);
  }
  await exportTres(assetId, outDir);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e));
    process.exit(1);
  });
}
