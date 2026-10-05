// vectorize.mjs — per-pixel rect vectorizer + semantic relabel (OpenSpec 3.1).
// Zero dependencies so the Web app can import it directly later.
// Reuses palette.mjs (getMappableColors + transparent rule); input buffers are
// expected to come from quantizeGeometry + mapFrameToPalette (palette-exact
// bytes plus transparent), so every opaque pixel MUST be a mappable entry.
import { getMappableColors, ALPHA_THRESHOLD } from './palette.mjs';

export const SEMANTIC_GROUPS = ['body', 'limb-l', 'limb-r', 'outfit', 'weapon-slot'];

function toHex6(r, g, b) {
  return (
    '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0')
  );
}

function groupIdForHex(hex) {
  return `color-${hex.slice(1)}`;
}

function assertDims(w, h) {
  if (!Number.isInteger(w) || w <= 0 || !Number.isInteger(h) || h <= 0) {
    throw new Error(`dims must be positive ints, got ${w}x${h}`);
  }
}

// vectorizeFrame(rgba, w, h, paletteRef) -> SVG string.
// - rgba: Uint8ClampedArray RGBA row-major, length w*h*4.
// - paletteRef: palette object ({ id, colors }) — resolved via getMappableColors.
// - Transparent rule: alpha < ALPHA_THRESHOLD (128) pixels emit no rect.
// - Every opaque pixel must exactly match a mappable entry, otherwise throw.
// - Output: <svg viewBox="0 0 w h"> with one <g id="color-<hex>"> per color,
//   each holding <rect x y width=1 height=1 fill> in y,x scan order.
// - Groups sorted by hex ascending; no timestamps — same input -> byte-identical.
export function vectorizeFrame(rgba, w, h, paletteRef) {
  assertDims(w, h);
  if (!(rgba instanceof Uint8ClampedArray)) throw new Error('rgba must be Uint8ClampedArray RGBA');
  if (rgba.length !== w * h * 4) throw new Error('rgba buffer length mismatch w*h*4');
  if (!paletteRef || typeof paletteRef !== 'object' || !Array.isArray(paletteRef.colors)) {
    throw new Error('paletteRef must be a palette object with colors[] (pass loaded palette JSON)');
  }
  const mappable = getMappableColors(paletteRef);
  if (mappable.length === 0) throw new Error('palette has no mappable colors');
  const allowed = new Map();
  for (const c of mappable) {
    allowed.set(`${c.r},${c.g},${c.b}`, toHex6(c.r, c.g, c.b));
  }

  const groups = new Map(); // hex -> rect string array (scan order)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3];
      if (a < ALPHA_THRESHOLD) continue; // transparent rule: skip before color check
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const key = `${r},${g},${b}`;
      const hex = allowed.get(key);
      if (!hex) {
        throw new Error(
          `pixel (${x},${y}) color rgb(${r},${g},${b}) not in palette ${paletteRef.id ?? '(unknown)'} mappable set`,
        );
      }
      let list = groups.get(hex);
      if (!list) {
        list = [];
        groups.set(hex, list);
      }
      list.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${hex}"/>`);
    }
  }

  const sortedHex = [...groups.keys()].sort();
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`;
  for (const hex of sortedHex) {
    out += `<g id="${groupIdForHex(hex)}">${groups.get(hex).join('')}</g>`;
  }
  out += '</svg>';
  return out;
}

function normColorKey(k) {
  return String(k).trim().toLowerCase().replace(/^#/, '').replace(/^color-/, '');
}

function parseSvgGroups(svg) {
  const open = svg.match(/<svg\b[^>]*>/);
  if (!open) throw new Error('svg must contain an <svg> opening tag');
  if (!svg.includes('</svg>')) throw new Error('svg must contain a </svg> closing tag');
  const groups = [];
  const re = /<g\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const id = m[1];
    const inner = m[2];
    const rects = inner.match(/<rect\b[^>]*?(?:\/>|<\/rect\s*>)/g) ?? [];
    groups.push({ id, inner, rects });
  }
  return { opening: open[0], groups };
}

// relabelLayers(svg, regionMap) -> SVG string.
// - regionMap: hand-passed v1 mapping from color group to semantic group.
//   Keys accept `color-<hex>`, `#<hex>` or `<hex>` (case-insensitive);
//   values must be one of body/limb-l/limb-r/outfit/weapon-slot.
// - Multiple color groups may map to one semantic group (rects merged).
// - Unmapped g blocks are preserved as-is (still individually selectable).
// - Semantic groups emitted in SEMANTIC_GROUPS canonical order, then unmapped
//   in first-seen order. Already-semantic ids pass through merged.
export function relabelLayers(svg, regionMap) {
  if (typeof svg !== 'string' || !svg) throw new Error('svg must be a non-empty string');
  if (!regionMap || typeof regionMap !== 'object' || Array.isArray(regionMap)) {
    throw new Error('regionMap must be an object { colorId: semanticGroup }');
  }
  const normMap = new Map(); // normalized color key -> semantic
  for (const [k, v] of Object.entries(regionMap)) {
    if (!SEMANTIC_GROUPS.includes(v)) {
      throw new Error(
        `regionMap[${JSON.stringify(k)}] must be one of ${SEMANTIC_GROUPS.join(',')}, got ${JSON.stringify(v)}`,
      );
    }
    normMap.set(normColorKey(k), v);
  }

  const { opening, groups } = parseSvgGroups(svg);
  if (groups.length === 0) return svg;

  const semanticBuckets = new Map(); // semantic -> rect[]
  const unmapped = []; // { id, rects } in first-seen order
  let mappedCount = 0;

  for (const g of groups) {
    if (SEMANTIC_GROUPS.includes(g.id)) {
      let bucket = semanticBuckets.get(g.id);
      if (!bucket) {
        bucket = [];
        semanticBuckets.set(g.id, bucket);
      }
      bucket.push(...g.rects);
      mappedCount++;
      continue;
    }
    const hit = normMap.get(normColorKey(g.id));
    // Also try fill-derived hex: all rects in a color group share one fill.
    let fillHit = null;
    if (!hit && g.rects.length > 0) {
      const fill = g.rects[0].match(/fill="([^"]+)"/);
      if (fill) fillHit = normMap.get(normColorKey(fill[1]));
    }
    const semantic = hit ?? fillHit;
    if (semantic) {
      let bucket = semanticBuckets.get(semantic);
      if (!bucket) {
        bucket = [];
        semanticBuckets.set(semantic, bucket);
      }
      bucket.push(...g.rects);
      mappedCount++;
    } else {
      unmapped.push(g);
    }
  }

  if (mappedCount === 0) return svg; // pure no-op preserves bytes

  let out = opening;
  for (const sem of SEMANTIC_GROUPS) {
    const rects = semanticBuckets.get(sem);
    if (rects && rects.length > 0) out += `<g id="${sem}">${rects.join('')}</g>`;
  }
  // Any semantic outside canonical list cannot happen (validated), but keep guard.
  for (const [sem, rects] of semanticBuckets) {
    if (!SEMANTIC_GROUPS.includes(sem)) out += `<g id="${sem}">${rects.join('')}</g>`;
  }
  for (const g of unmapped) out += `<g id="${g.id}">${g.rects.join('')}</g>`;
  out += '</svg>';
  return out;
}

export function getGroupIds(svg) {
  return [...svg.matchAll(/<g\b[^>]*\bid="([^"]+)"[^>]*>/g)].map((m) => m[1]);
}

export function countRects(svg) {
  return (svg.match(/<rect\b/g) ?? []).length;
}

function main() {
  const [cmd] = process.argv.slice(2);
  if (cmd !== 'selfcheck') {
    console.error('usage: node tools/vectorize.mjs selfcheck');
    process.exit(2);
  }
  console.log('OK: use node --test tools/vectorize.test.mjs for 3.1 verification');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) main();
