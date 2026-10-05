// vectorize.test.mjs — 3.1 verification: per-pixel rect + semantic relabel (node --test).
// Reuses palette.mjs (mappable set) and quantize.mjs (geometry) for end-to-end;
// zero new dependencies.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, getMappableColors, mapFrameToPalette } from './palette.mjs';
import { quantizeGeometry } from './quantize.mjs';
import { vectorizeFrame, relabelLayers, SEMANTIC_GROUPS } from './vectorize.mjs';

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

  it('end-to-end quantize output runs byte-identical twice', () => {
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
      return vectorizeFrame(mapped.data, g.width, g.height, character);
    };
    const a = run();
    const b = run();
    assert.equal(a, b);
    assert.deepEqual(Buffer.from(a), Buffer.from(b));
    assertWellFormedXml(a, 32, 32);
    assert.ok(countRects(a) > 0);
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

  it('vectorize+relabel chain is deterministic', () => {
    const src = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const i = (y * 8 + x) * 4;
        const c = mappable[(x + y) % mappable.length];
        src[i] = c.r;
        src[i + 1] = c.g;
        src[i + 2] = c.b;
        src[i + 3] = x === 0 && y === 0 ? 0 : 255;
      }
    }
    const run = () => {
      const mapped = mapFrameToPalette(src, 8, 8, character);
      const svg = vectorizeFrame(mapped.data, 8, 8, character);
      const ids = groupIds(svg);
      const regionMap = {};
      ids.forEach((id, k) => {
        regionMap[id] = SEMANTIC_GROUPS[k % SEMANTIC_GROUPS.length];
      });
      return relabelLayers(svg, regionMap);
    };
    assert.equal(run(), run());
  });
});
