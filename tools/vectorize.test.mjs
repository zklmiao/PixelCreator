// vectorize.test.mjs — 3.1 verification: per-pixel rect + semantic relabel (node --test).
// Reuses palette.mjs (mappable set) and quantize.mjs (geometry) for end-to-end;
// zero new dependencies.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, getMappableColors, mapFrameToPalette } from './palette.mjs';
import { quantizeGeometry } from './quantize.mjs';
import {
  vectorizeFrame,
  relabelLayers,
  SEMANTIC_GROUPS,
  pixelsToSvg,
  parseSvgGroups,
  svgToPixels,
  knightRelabel,
  synthKnightPixels,
} from './vectorize.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const character = loadPalette(resolve(root, 'palettes/palette_character.v1.json'));
const mappable = getMappableColors(character);

function toHex(r, g, b) {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function countRects(svg) {
  return (svg.match(/<rect\b/g) ?? []).length;
}

function groupIds(svg) {
  return [...svg.matchAll(/<g\b[^>]*\bid="([^"]+)"[^>]*>/g)].map((m) => m[1]);
}

function groupInner(svg, id) {
  const re = new RegExp(`<g\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/g>`);
  const m = svg.match(re);
  assert.ok(m, `group ${id} must be selectable by id`);
  return m[1];
}

// Minimal well-formedness check (no deps): balanced tags, quoted attrs,
// self-closed rects, unique ids, viewBox present. Rejects malformed XML.
function assertWellFormedXml(svg, w, h) {
  assert.ok(svg.startsWith('<svg'), 'must start with <svg');
  assert.ok(svg.endsWith('</svg>'), 'must end with </svg>');
  assert.ok(svg.includes(`viewBox="0 0 ${w} ${h}"`), `viewBox must be "0 0 ${w} ${h}"`);
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'must carry svg xmlns');
  const tagRe = /<\/?[A-Za-z_][\w:.-]*(?:\s+[\w:.-]+="[^"]*")*\s*\/?>/g;
  const tags = svg.match(tagRe) ?? [];
  assert.ok(tags.length >= 2, 'must contain tags');
  const stack = [];
  for (const t of tags) {
    if (t.startsWith('</')) {
      const name = t.slice(2, -1).trim();
      assert.ok(stack.length > 0, `stray closing ${t}`);
      assert.equal(stack.pop(), name, `mismatched closing ${t}`);
    } else if (t.endsWith('/>')) {
      // self-contained (rect) — no stack push
    } else {
      const name = t.slice(1, t.endsWith('>') ? -1 : undefined).split(/\s/)[0];
      stack.push(name);
    }
  }
  assert.equal(stack.length, 0, `unclosed tags: ${stack}`);
  const ids = groupIds(svg);
  assert.equal(new Set(ids).size, ids.length, 'group ids must be unique');
  for (const r of svg.match(/<rect\b[^>]*>/g) ?? []) {
    for (const attr of ['x=', 'y=', 'width=', 'height=', 'fill=']) {
      assert.ok(r.includes(attr), `rect missing ${attr}: ${r}`);
    }
  }
}

// 64px frame cycling palette colors with deterministic transparent holes.
function fullFrame64() {
  const w = 64;
  const h = 64;
  const buf = new Uint8ClampedArray(w * h * 4);
  let opaque = 0;
  const usedHex = new Set();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if ((x * w + y) % 9 === 0) {
        buf[i + 3] = 0; // transparent hole
        continue;
      }
      const c = mappable[(y * w + x) % mappable.length];
      buf[i] = c.r;
      buf[i + 1] = c.g;
      buf[i + 2] = c.b;
      buf[i + 3] = 255;
      opaque++;
      usedHex.add(toHex(c.r, c.g, c.b));
    }
  }
  return { buf, w, h, opaque, usedHex };
}

describe('3.1 per-pixel rect vectorizer', () => {
  it('64px full frame rect count equals non-transparent pixel count', () => {
    const { buf, w, h, opaque, usedHex } = fullFrame64();
    const svg = vectorizeFrame(buf, w, h, character);
    assert.equal(countRects(svg), opaque);
    assert.equal(groupIds(svg).length, usedHex.size);
  });

  it('each color group is individually selectable by id', () => {
    const { buf, w, h } = fullFrame64();
    const svg = vectorizeFrame(buf, w, h, character);
    const ids = groupIds(svg);
    assert.ok(ids.length > 0);
    let total = 0;
    for (const id of ids) {
      assert.match(id, /^color-[0-9a-f]{6}$/, `group id shape: ${id}`);
      const inner = groupInner(svg, id);
      const n = (inner.match(/<rect\b/g) ?? []).length;
      assert.ok(n > 0, `${id} must hold rects`);
      const wantFill = `#${id.slice('color-'.length)}`;
      for (const r of inner.match(/<rect\b[^>]*>/g) ?? []) {
        assert.ok(r.includes(`fill="${wantFill}"`), `${id}: rect fill must be ${wantFill}`);
      }
      total += n;
    }
    assert.equal(total, countRects(svg));
  });

  it('fully transparent frame yields zero rects', () => {
    const svg = vectorizeFrame(new Uint8ClampedArray(8 * 8 * 4), 8, 8, character);
    assert.equal(countRects(svg), 0);
    assert.equal(groupIds(svg).length, 0);
    assertWellFormedXml(svg, 8, 8);
  });

  it('output is well-formed XML with viewBox', () => {
    const { buf } = fullFrame64();
    assertWellFormedXml(vectorizeFrame(buf, 64, 64, character), 64, 64);
    const tiny = new Uint8ClampedArray([0xc0, 0x30, 0x28, 255, 0, 0, 0, 0, 0xff, 0xd9, 0xb3, 255, 0, 0, 0, 0]);
    assertWellFormedXml(vectorizeFrame(tiny, 2, 2, character), 2, 2);
    assert.equal(countRects(vectorizeFrame(tiny, 2, 2, character)), 2);
  });

  it('opaque pixels must be palette mappable; sub-threshold alpha skips first', () => {
    const bad = new Uint8ClampedArray([1, 2, 3, 255]);
    assert.throws(() => vectorizeFrame(bad, 1, 1, character), /not in palette/);
    const softSame = new Uint8ClampedArray([1, 2, 3, 100]);
    assert.equal(countRects(vectorizeFrame(softSame, 1, 1, character)), 0);
    const edge127 = new Uint8ClampedArray([0xc0, 0x30, 0x28, 127]);
    assert.equal(countRects(vectorizeFrame(edge127, 1, 1, character)), 0);
    const edge128 = new Uint8ClampedArray([0xc0, 0x30, 0x28, 128]);
    assert.equal(countRects(vectorizeFrame(edge128, 1, 1, character)), 1);
  });
});

describe('3.1 semantic relabel', () => {
  function fiveColorSvg() {
    const picks = mappable.slice(0, 5);
    const buf = new Uint8ClampedArray(5 * 1 * 4);
    picks.forEach((c, k) => {
      buf[k * 4] = c.r;
      buf[k * 4 + 1] = c.g;
      buf[k * 4 + 2] = c.b;
      buf[k * 4 + 3] = 255;
    });
    const svg = vectorizeFrame(buf, 5, 1, character);
    assert.equal(groupIds(svg).length, 5);
    return { svg, picks };
  }

  it('relabels color groups into body/limb-l/limb-r/outfit/weapon-slot', () => {
    const { svg, picks } = fiveColorSvg();
    const regionMap = {};
    picks.forEach((c, k) => {
      regionMap[`color-${toHex(c.r, c.g, c.b).slice(1)}`] = SEMANTIC_GROUPS[k];
    });
    const out = relabelLayers(svg, regionMap);
    assert.deepEqual(groupIds(out), SEMANTIC_GROUPS);
    for (const sem of SEMANTIC_GROUPS) {
      const inner = groupInner(out, sem);
      assert.equal((inner.match(/<rect\b/g) ?? []).length, 1, `${sem} holds one rect`);
    }
    assert.equal(countRects(out), countRects(svg));
    assertWellFormedXml(out, 5, 1);
  });

  it('merges multiple colors into one semantic and keeps unmapped as-is', () => {
    const picks = mappable.slice(0, 4);
    const buf = new Uint8ClampedArray(4 * 1 * 4);
    picks.forEach((c, k) => {
      buf[k * 4] = c.r;
      buf[k * 4 + 1] = c.g;
      buf[k * 4 + 2] = c.b;
      buf[k * 4 + 3] = 255;
    });
    const svg = vectorizeFrame(buf, 4, 1, character);
    const ids = groupIds(svg);
    const regionMap = {
      [ids[0]]: 'body',
      [ids[1]]: 'body',
      [ids[2]]: 'outfit',
    };
    const out = relabelLayers(svg, regionMap);
    const outIds = groupIds(out);
    assert.ok(outIds.includes('body'));
    assert.ok(outIds.includes('outfit'));
    assert.ok(outIds.includes(ids[3]), 'unmapped group keeps original id');
    assert.equal((groupInner(out, 'body').match(/<rect\b/g) ?? []).length, 2);
    assert.equal(countRects(out), 4);
  });

  it('accepts #hex and bare-hex keys case-insensitively; rejects bad semantic', () => {
    const { svg, picks } = fiveColorSvg();
    const hex0 = toHex(picks[0].r, picks[0].g, picks[0].b);
    const regionMap = { [`#${hex0.slice(1).toUpperCase()}`]: 'body' };
    const out = relabelLayers(svg, regionMap);
    assert.ok(groupIds(out).includes('body'));
    assert.throws(() => relabelLayers(svg, { [groupIds(svg)[0]]: 'head' }), /must be one of/);
  });
});

describe('3.1 view svg layers (pixelsToSvg)', () => {
  const byName = new Map(mappable.map((c) => [c.name, c]));

  // 4x4 view: two tunic-red pixels share one color group, one skin-1 differs.
  function smallView(extra = {}) {
    const w = 4;
    const h = 4;
    const buf = new Uint8ClampedArray(w * h * 4);
    const put = (x, y, name) => {
      const c = byName.get(name);
      const i = (y * w + x) * 4;
      buf[i] = c.r;
      buf[i + 1] = c.g;
      buf[i + 2] = c.b;
      buf[i + 3] = 255;
    };
    put(0, 0, 'tunic-red');
    put(1, 0, 'tunic-red');
    put(2, 0, 'skin-1');
    return pixelsToSvg(buf, w, h, {
      asset: 'knight_001',
      perspective: 'td',
      action: 'idle',
      dir: 'fr',
      frame: 0,
      size: 4,
      palette: character,
      seed: 1234,
      prompt_hash: 'td-idle-fr',
      denoise: 0.55,
      source: 'synthetic:knight_001:td/idle/fr/0',
      ...extra,
    });
  }

  function rectSet(svg) {
    const out = [];
    for (const tag of svg.match(/<rect\b[^>]*>/g) ?? []) {
      const x = tag.match(/x="(\d+)"/)?.[1];
      const y = tag.match(/y="(\d+)"/)?.[1];
      const fill = tag.match(/fill="([^"]+)"/)?.[1];
      out.push(`${x},${y},${(fill ?? '').toLowerCase()}`);
    }
    return out.sort();
  }

  it('parts addressable: five part layers separately selectable (empty kept)', () => {
    const svg = smallView();
    const groups = parseSvgGroups(svg);
    assert.deepEqual(groups.map((g) => g.part), SEMANTIC_GROUPS);
    for (const part of SEMANTIC_GROUPS) {
      const re = new RegExp(`<g\\b[^>]*\\bdata-part="${part}"[^>]*>`);
      assert.ok(re.test(svg), `${part} layer must be selectable via data-part`);
    }
    // NOTE: default (no relabel hook) routes everything to body by design
    // (v1 semi-manual: relabel stays caller-provided). Empty limb/outfit/
    // weapon-slot layers below assert the DEFAULT, not real anatomy
    // separation — shipped batch SVGs are body-only until a relabel map lands.
    // Default routes everything to body; reserved weapon-slot stays empty but present.
    const body = groups.find((g) => g.part === 'body');
    assert.ok(body.colors.length > 0);
    for (const part of ['limb-l', 'limb-r', 'outfit', 'weapon-slot']) {
      assert.deepEqual(groups.find((g) => g.part === part).colors, [], `${part} empty but present`);
    }
  });

  it('same color shares one group, different colors split groups', () => {
    const svg = smallView();
    const groups = parseSvgGroups(svg);
    const body = groups.find((g) => g.part === 'body');
    assert.deepEqual([...body.colors].sort(), ['skin-1', 'tunic-red']);
    const redRe = /<g\b[^>]*\bdata-color="tunic-red"[^>]*>([\s\S]*?)<\/g>/;
    const redInner = svg.match(redRe)?.[1] ?? '';
    assert.equal((redInner.match(/<rect\b/g) ?? []).length, 2);
    const skinRe = /<g\b[^>]*\bdata-color="skin-1"[^>]*>([\s\S]*?)<\/g>/;
    const skinInner = svg.match(skinRe)?.[1] ?? '';
    assert.equal((skinInner.match(/<rect\b/g) ?? []).length, 1);
  });

  it('metadata recovers source prototype, seed and palette ref', () => {
    const svg = smallView();
    for (const attr of [
      'data-asset="knight_001"',
      'data-perspective="td"',
      'data-action="idle"',
      'data-dir="fr"',
      'data-frame="0"',
      'data-size="4"',
      'data-palette="palette_character@v1"',
      'data-seed="1234"',
      'data-prompt-hash="td-idle-fr"',
      'data-denoise="0.55"',
      'viewBox="0 0 4 4"',
    ]) {
      assert.ok(svg.includes(attr), `svg must carry ${attr}`);
    }
    for (const tag of [
      '<source>synthetic:knight_001:td/idle/fr/0</source>',
      '<seed>1234</seed>',
      '<palette>palette_character@v1</palette>',
      '<prompt_hash>td-idle-fr</prompt_hash>',
    ]) {
      assert.ok(svg.includes(tag), `metadata must carry ${tag}`);
    }
  });

  it('palette-exact only (no intermediate colors)', () => {
    const src = new Uint8ClampedArray(16 * 12 * 4);
    for (let i = 0; i < src.length; i += 4) {
      src[i] = 200;
      src[i + 1] = 48;
      src[i + 2] = 40;
      src[i + 3] = 255;
    }
    const run = () => {
      const g = quantizeGeometry(src, 16, 12, 32, { kind: 'character' });
      const mapped = mapFrameToPalette(g.data, g.width, g.height, character);
      return pixelsToSvg(mapped.data, g.width, g.height, {
        asset: 'knight_001',
        perspective: 'td',
        action: 'walk',
        dir: 'fr',
        frame: 1,
        size: 32,
        palette: character,
        seed: 1234,
        prompt_hash: 'td-walk-fr',
        denoise: 0.3,
        source: 'synthetic:knight_001:td/walk/fr/1',
        names: mapped.names,
      });
    };
    const svg = run();
    const allowed = new Set(mappable.map((c) => `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`));
    for (const tag of svg.match(/<rect\b[^>]*>/g) ?? []) {
      const fill = tag.match(/fill="([^"]+)"/)[1].toLowerCase();
      assert.ok(allowed.has(fill), `fill must be palette-exact, got ${fill}`);
    }
  });

  // NOTE: generate reuses the idle-fr-0 synthesis for masters (see
  // vectorize.mjs generateKnightSvgs), so this asserts grid-equality by
  // construction, NOT infinite-precision mastery. Spec svg-engineering
  // "master retains infinite precision" remains open; this test only guards
  // against master/front drift at 64px.
  it('master vs front: master_td grid pixels equal td idle fr0', () => {
    const dir = resolve(root, 'assets/knight_001');
    const masterPath = resolve(dir, 'master_td.svg');
    const frontPath = resolve(dir, 'knight_td_idle_fr0.svg');
    assert.ok(existsSync(masterPath), 'master_td.svg must exist (run generate)');
    assert.ok(existsSync(frontPath), 'knight_td_idle_fr0.svg must exist (run generate)');
    const master = readFileSync(masterPath, 'utf8');
    const front = readFileSync(frontPath, 'utf8');
    assert.ok(master.includes('data-master="true"'), 'master must be marked data-master');
    assert.deepEqual(rectSet(master), rectSet(front), 'master and front pixel sets must match at 64px');
  });

  it('all 64 view svgs exist on disk with valid layers', () => {
    const dir = resolve(root, 'assets/knight_001');
    const asset = JSON.parse(readFileSync(resolve(dir, 'asset.json'), 'utf8'));
    let n = 0;
    for (const act of Object.keys(asset.actions)) {
      for (const p of asset.perspectives) {
        for (const d of asset.views) {
          for (const clip of asset.actions[act].clips[p][d]) {
            const fp = resolve(dir, clip.file);
            assert.ok(existsSync(fp), `${clip.file} must exist (run generate)`);
            const svg = readFileSync(fp, 'utf8');
            assert.deepEqual(
              parseSvgGroups(svg).map((g) => g.part),
              SEMANTIC_GROUPS,
              `${clip.file} must carry five layers`,
            );
            n++;
          }
        }
      }
    }
    assert.equal(n, 64, 'idle8+walk24+attack32 = 64 views');
  });
});

describe('3.1 semantic split (knightRelabel)', () => {
  const assetDir = resolve(root, 'assets/knight_001');
  const readView = (f) => readFileSync(resolve(assetDir, f), 'utf8');
  const partMap = (svg) => new Map(parseSvgGroups(svg).map((g) => [g.part, g]));

  it('knightRelabel routes legs/sword/outfit/body by rule', () => {
    assert.equal(knightRelabel(26, 42, 'leather', { size: 64, action: 'walk' }), 'limb-l');
    assert.equal(knightRelabel(36, 53, 'boot-dark', { size: 64, action: 'walk' }), 'limb-r');
    assert.equal(
      knightRelabel(42, 20, 'steel-light', { size: 64, action: 'attack', perspective: 'td' }),
      'weapon-slot',
    );
    assert.equal(knightRelabel(30, 30, 'tunic-red', { size: 64, action: 'idle' }), 'outfit');
    assert.equal(knightRelabel(30, 30, 'steel-mid', { size: 64, action: 'idle' }), 'outfit');
    assert.equal(knightRelabel(30, 12, 'skin-1', { size: 64, action: 'idle' }), 'body');
    assert.equal(knightRelabel(30, 12, 'hair', { size: 64, action: 'idle' }), 'body');
    assert.equal(knightRelabel(0, 0, 'mystery-color', { size: 64, action: 'idle' }), 'body');
    assert.equal(knightRelabel(0, 0, 'skin-1'), 'body', 'defaults work without opts');
  });

  it('attack view has all five layers non-empty (sword lands in weapon-slot)', () => {
    const groups = partMap(readView('knight_td_attack_fr1.svg'));
    for (const part of SEMANTIC_GROUPS) {
      assert.ok((groups.get(part)?.rectCount ?? 0) > 0, `attack ${part} must be non-empty`);
    }
    // NOTE: the 2-wide blade is fully covered by its outline border (see
    // synthKnightPixels borderRect), so the sword survives as outline border +
    // gold hilt + leather grip — no steel-light pixels remain. Gold hilt is
    // the unambiguous sword marker.
    assert.ok(groups.get('weapon-slot').colors.includes('gold'));
  });

  it('idle view keeps weapon-slot empty while body/limbs/outfit stay non-empty', () => {
    const groups = partMap(readView('knight_td_idle_fr0.svg'));
    assert.equal(groups.get('weapon-slot').rectCount, 0, 'idle weapon-slot stays reserved-empty');
    for (const part of ['body', 'limb-l', 'limb-r', 'outfit']) {
      assert.ok((groups.get(part)?.rectCount ?? 0) > 0, `idle ${part} must be non-empty`);
    }
  });

  it('walk limbs non-empty and total rects unchanged across in-memory roundtrip', () => {
    const file = 'knight_td_walk_fr1.svg';
    const original = readView(file);
    const groups = partMap(original);
    assert.ok(groups.get('limb-l').rectCount > 0, 'walk limb-l non-empty');
    assert.ok(groups.get('limb-r').rectCount > 0, 'walk limb-r non-empty');
    const total = (original.match(/<rect\b/g) ?? []).length;
    const parsed = svgToPixels(original, file);
    const remade = pixelsToSvg(parsed.data, parsed.w, parsed.h, {
      asset: parsed.meta.asset,
      perspective: parsed.meta.perspective,
      action: parsed.meta.action,
      dir: parsed.meta.dir,
      frame: parsed.meta.frame,
      size: Number(parsed.meta.size) || parsed.w,
      palette: character,
      seed: parsed.meta.seed,
      prompt_hash: parsed.meta.prompt_hash,
      denoise: parsed.meta.denoise,
      source: parsed.meta.source,
      names: parsed.names,
      master: parsed.meta.master,
      relabel: (x, y, n) =>
        knightRelabel(x, y, n, { size: parsed.w, action: parsed.meta.action, perspective: parsed.meta.perspective }),
    });
    assert.equal(remade, original, 'same-relabel roundtrip must be byte-identical (totals unchanged)');
    assert.equal((remade.match(/<rect\b/g) ?? []).length, total);
  });
});

// Regression: the stride cycle used modulo 3, which collapsed rt onto fr
// (dirIdx 3 ≡ 0) for every clip and wrapped attack f4 onto f1. All poses of a
// perspective must stay pairwise distinct or the 12-cell matrix shows clones.
describe('3.1 synthetic knight pose distinctness (regression: %3 collapse)', () => {
  const FRAMES = { idle: [0], walk: [1, 2, 3], attack: [1, 2, 3, 4] };
  const DIRS = ['fr', 'bk', 'lf', 'rt'];
  const pose = (persp, act, dir, f) =>
    Buffer.from(
      synthKnightPixels({ perspective: persp, action: act, dir, frameNum: f, mappable, size: 64 }).data,
    );

  it('all 32 poses per perspective are pairwise distinct', () => {
    for (const persp of ['td', 'sd']) {
      const seen = new Map();
      for (const [act, frames] of Object.entries(FRAMES)) {
        for (const dir of DIRS) {
          for (const f of frames) {
            const key = `${persp}/${act}/${dir}${f}`;
            const buf = pose(persp, act, dir, f);
            for (const [other, otherBuf] of seen) {
              assert.ok(!buf.equals(otherBuf), `${key} renders identical to ${other}`);
            }
            seen.set(key, buf);
          }
        }
      }
      assert.equal(seen.size, 32, `${persp}: expected 32 distinct poses`);
    }
  });
});
