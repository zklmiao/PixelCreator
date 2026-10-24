// vectorize.mjs — per-pixel rect vectorizer + semantic relabel (OpenSpec 3.1).
// Zero npm dependencies so the Web app can import the pure-ESM core directly.
// Library core (all exported fns except the `generate` CLI) never touches fs:
// file writing lives only in `writeViewSvg` (dynamic import, node-only) and
// in `main()` (dynamic fs/path/url). Reuses palette.mjs (getMappableColors +
// transparent rule) and quantize.mjs (geometry, web-safe) for the batch flow.
//
// Two APIs coexist:
// - v1 flat (prior commit): vectorizeFrame + relabelLayers (`id="color-<hex>"`).
// - view SVG (this change): pixelsToSvg + parseSvgGroups
//   (`<g data-part>` outer, `<g data-color>` inner, five parts always present).
import { getMappableColors, ALPHA_THRESHOLD } from './palette.mjs';
import { quantizeGeometry } from './quantize.mjs';

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

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// vectorizeFrame(rgba, w, h, paletteRef) -> SVG string (flat v1, kept for compat).
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

// Internal flat-format parser (id-based). Renamed so the exported
// parseSvgGroups can serve the view-SVG (data-part) format.
function parseIdGroups(svg) {
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

// relabelLayers(svg, regionMap) -> SVG string (flat v1, kept for compat).
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

  const { opening, groups } = parseIdGroups(svg);
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

// --- View SVG (spec svg-engineering) ---
//
// pixelsToSvg(data, w, h, opts) -> SVG string.
// - data: Uint8ClampedArray RGBA row-major (mapped output: opaque a=255 with
//   palette-exact bytes, transparent a=0). Transparent rule a < 128 skips.
// - Grouping: by palette color NAME via getMappableColors (or via opts.names
//   from mapFrameToPalette when provided). Every opaque pixel must resolve to
//   a mappable entry, otherwise throw — output holds only palette-exact fills.
// - opts: { asset, perspective, action, dir, frame, size, palette, paletteDef,
//   mappable, seed, prompt_hash, denoise, source, relabel, names, master }.
//   `palette` may be a palette object (preferred: id + colors) or a palette-id
//   string (then pass `paletteDef` for name resolution). `relabel(x,y,name)`
//   is the v1 semi-manual hook; default routes everything to `body` and leaves
//   `weapon-slot` as the reserved empty group. All five `data-part` groups are
//   always emitted (empty ones included) so every layer stays selectable.
// - Deterministic: parts in SEMANTIC_GROUPS order, colors sorted by name,
//   rects in y,x scan order, no timestamps.
export function pixelsToSvg(data, w, h, opts = {}) {
  assertDims(w, h);
  if (!(data instanceof Uint8ClampedArray)) throw new Error('data must be Uint8ClampedArray RGBA');
  if (data.length !== w * h * 4) throw new Error('data buffer length mismatch w*h*4');
  const {
    asset = '',
    perspective = '',
    action = '',
    dir = '',
    frame = 0,
    size = w,
    seed = '',
    prompt_hash = '',
    denoise = '',
    source = '',
    relabel = null,
    names = null,
    master = false,
  } = opts;
  if (!Number.isInteger(size) || size <= 0) throw new Error(`size must be a positive int, got ${size}`);

  // Resolve palette definition + id string.
  let def = null;
  let paletteId = '';
  if (opts.palette && typeof opts.palette === 'object') {
    def = opts.palette;
    paletteId = def.id ?? '';
  } else if (typeof opts.palette === 'string') {
    paletteId = opts.palette;
    def = opts.paletteDef ?? null;
  } else if (opts.paletteDef && typeof opts.paletteDef === 'object') {
    def = opts.paletteDef;
    paletteId = def.id ?? '';
  }
  let entries = null;
  if (def) {
    entries = getMappableColors(def);
    if (entries.length === 0) throw new Error('palette has no mappable colors');
  } else if (Array.isArray(opts.mappable)) {
    entries = opts.mappable;
  }
  const byRgb = new Map();
  const byName = new Map();
  if (entries) {
    for (const c of entries) {
      const hex = toHex6(c.r, c.g, c.b);
      byRgb.set(`${c.r},${c.g},${c.b}`, { name: c.name, hex });
      if (!byName.has(c.name)) byName.set(c.name, hex);
    }
  }
  if (names !== null && names !== undefined) {
    if (!Array.isArray(names) || names.length !== w * h) {
      throw new Error('opts.names must be an array of length w*h (from mapFrameToPalette)');
    }
  }

  const relabelFn = typeof relabel === 'function' ? relabel : () => 'body';
  // part -> Map(colorName -> [{x,y,hex}])
  const buckets = new Map(SEMANTIC_GROUPS.map((p) => [p, new Map()]));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < ALPHA_THRESHOLD) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      let colorName;
      let hex;
      const named = Array.isArray(names) ? names[y * w + x] : undefined;
      if (named !== undefined && named !== null) {
        colorName = named;
        hex = byName.get(colorName) ?? null;
        if (entries && !hex) {
          throw new Error(`opts.names[${y * w + x}] ${JSON.stringify(colorName)} not in palette ${paletteId}`);
        }
        if (entries && !byRgb.has(`${r},${g},${b}`)) {
          throw new Error(
            `pixel (${x},${y}) color rgb(${r},${g},${b}) not in palette ${paletteId} mappable set`,
          );
        }
        hex = hex ?? toHex6(r, g, b);
      } else if (entries) {
        const hit = byRgb.get(`${r},${g},${b}`);
        if (!hit) {
          throw new Error(
            `pixel (${x},${y}) color rgb(${r},${g},${b}) not in palette ${paletteId} mappable set`,
          );
        }
        colorName = hit.name;
        hex = hit.hex;
      } else {
        hex = toHex6(r, g, b);
        colorName = hex; // hex fallback when no palette def supplied
      }
      let part = relabelFn(x, y, colorName);
      if (part === undefined || part === null) part = 'body';
      if (!SEMANTIC_GROUPS.includes(part)) {
        throw new Error(`relabel(${x},${y},${JSON.stringify(colorName)}) must be one of ${SEMANTIC_GROUPS.join(',')}`);
      }
      const partMap = buckets.get(part);
      let list = partMap.get(colorName);
      if (!list) {
        list = [];
        partMap.set(colorName, list);
      }
      list.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${hex}"/>`);
    }
  }

  const esc = escapeXml;
  const frameStr = String(frame);
  const sizeStr = String(size);
  const seedStr = String(seed);
  const denoiseStr = denoise === '' || denoise === null || denoise === undefined ? '' : String(denoise);
  let out =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"` +
    ` data-asset="${esc(asset)}" data-perspective="${esc(perspective)}" data-action="${esc(action)}"` +
    ` data-dir="${esc(dir)}" data-frame="${esc(frameStr)}" data-size="${esc(sizeStr)}"` +
    ` data-palette="${esc(paletteId)}" data-seed="${esc(seedStr)}"` +
    ` data-prompt-hash="${esc(prompt_hash ?? '')}" data-denoise="${esc(denoiseStr)}"`;
  if (master) out += ' data-master="true"';
  out += '>';
  out +=
    '<metadata>' +
    `<asset>${esc(asset)}</asset>` +
    `<perspective>${esc(perspective)}</perspective>` +
    `<action>${esc(action)}</action>` +
    `<dir>${esc(dir)}</dir>` +
    `<frame>${esc(frameStr)}</frame>` +
    `<size>${esc(sizeStr)}</size>` +
    `<palette>${esc(paletteId)}</palette>` +
    `<seed>${esc(seedStr)}</seed>` +
    `<prompt_hash>${esc(prompt_hash ?? '')}</prompt_hash>` +
    `<denoise>${esc(denoiseStr)}</denoise>` +
    `<source>${esc(source)}</source>` +
    '</metadata>';
  for (const part of SEMANTIC_GROUPS) {
    const colorMap = buckets.get(part);
    if (!colorMap || colorMap.size === 0) {
      out += `<g data-part="${part}"></g>`;
      continue;
    }
    out += `<g data-part="${part}">`;
    for (const name of [...colorMap.keys()].sort()) {
      const rects = colorMap.get(name);
      const fill = (rects[0].match(/fill="([^"]+)"/) ?? [])[1] ?? '#000000';
      out += `<g data-color="${esc(name)}" fill="${fill}">${rects.join('')}</g>`;
    }
    out += '</g>';
  }
  out += '</svg>';
  return out;
}

// parseSvgGroups(svg) -> [{ part, colors }] for view SVGs.
// Parses outer `<g data-part>` layers (nesting-aware) and lists inner
// `<g data-color>` names in document order. Empty layers yield colors: [].
export function parseSvgGroups(svg) {
  if (typeof svg !== 'string' || !svg) throw new Error('svg must be a non-empty string');
  const outerRe = /<g\b[^>]*\bdata-part="([^"]+)"[^>]*>/g;
  const starts = [];
  let m;
  while ((m = outerRe.exec(svg)) !== null) {
    starts.push({ part: m[1], openStart: m.index, openEnd: m.index + m[0].length });
  }
  const result = [];
  for (const s of starts) {
    // Balance nested <g>..</g> from the end of the opening tag.
    let depth = 1;
    const tagRe = /<\/?g\b[^>]*>/g;
    tagRe.lastIndex = s.openEnd;
    let t;
    let closeStart = -1;
    let closeEnd = -1;
    while ((t = tagRe.exec(svg)) !== null) {
      if (t[0].startsWith('</')) depth--;
      else depth++;
      if (depth === 0) {
        closeStart = t.index;
        closeEnd = t.index + t[0].length;
        break;
      }
    }
    if (closeStart === -1) throw new Error(`unclosed data-part group ${JSON.stringify(s.part)}`);
    const inner = svg.slice(s.openEnd, closeStart);
    const colors = [...inner.matchAll(/<g\b[^>]*\bdata-color="([^"]+)"[^>]*>/g)].map((c) => c[1]);
    const rectCount = (inner.match(/<rect\b/g) ?? []).length;
    result.push({ part: s.part, colors, rectCount });
    void closeEnd;
  }
  return result;
}

// --- View SVG decode + asset roundtrip (spec svg-engineering Round trip) ---
//
// svgToPixels(svg, file?) -> { data, w, h, names, meta, parts }.
// Inverse of pixelsToSvg for view SVGs: parses data-part/data-color/rect
// layers, takes dims from viewBox, defaults missing pixels to transparent.
// `names`/`parts` are per-pixel arrays (length w*h, null when transparent);
// `meta` carries the data-* attrs + <metadata> block (entities unescaped).
// Throws naming `file` when the input is not our pipeline format
// (no data-part layers), has a bad viewBox, misses part layers, or holds
// no decodable rects (empty color group / zero rects / overlapping rects).
// Pure (no fs) so the Web app can import it.
function unescapeXml(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function parseFillHex(fill, label, what) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(fill ?? '');
  if (!m) throw new Error(`${label}: bad fill ${JSON.stringify(fill)} on ${what} (want #RRGGBB)`);
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  };
}

export function svgToPixels(svg, file = 'svg') {
  const label = String(file);
  if (typeof svg !== 'string' || !svg) throw new Error(`${label}: svg must be a non-empty string`);
  const openMatch = svg.match(/<svg\b[^>]*>/);
  if (!openMatch) throw new Error(`${label}: missing <svg> opening tag`);
  if (!svg.includes('</svg>')) throw new Error(`${label}: missing </svg> closing tag`);
  const openTag = openMatch[0];
  const vb = openTag.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!vb) {
    const seen = openTag.match(/viewBox="[^"]*"/)?.[0] ?? '(missing)';
    throw new Error(`${label}: bad viewBox ${seen} (want viewBox="0 0 <w> <h>")`);
  }
  const w = Number(vb[1]);
  const h = Number(vb[2]);
  if (!Number.isInteger(w) || w <= 0 || !Number.isInteger(h) || h <= 0) {
    throw new Error(`${label}: bad viewBox dims "0 0 ${vb[1]} ${vb[2]}"`);
  }
  if (!/data-part="/.test(svg)) {
    throw new Error(`${label}: not a view SVG (no data-part layers); flat id-based SVGs are not reversible here`);
  }
  const attr = (name) => {
    const m = openTag.match(new RegExp(`${name}="([^"]*)"`));
    return m ? unescapeXml(m[1]) : '';
  };
  const metaBody = (svg.match(/<metadata>([\s\S]*?)<\/metadata>/) ?? [])[1] ?? '';
  const elem = (name) => {
    const m = metaBody.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`));
    return m ? unescapeXml(m[1]) : undefined;
  };
  const pick = (a, t) => (t !== undefined ? t : a);
  const meta = {
    asset: pick(attr('data-asset'), elem('asset')),
    perspective: pick(attr('data-perspective'), elem('perspective')),
    action: pick(attr('data-action'), elem('action')),
    dir: pick(attr('data-dir'), elem('dir')),
    frame: pick(attr('data-frame'), elem('frame')),
    size: pick(attr('data-size'), elem('size')),
    palette: pick(attr('data-palette'), elem('palette')),
    seed: pick(attr('data-seed'), elem('seed')),
    prompt_hash: pick(attr('data-prompt-hash'), elem('prompt_hash')),
    denoise: pick(attr('data-denoise'), elem('denoise')),
    source: elem('source') ?? '',
    master: /data-master="true"/.test(openTag),
  };
  // Outer part layers (nesting-aware, mirrors parseSvgGroups).
  const outerRe = /<g\b[^>]*\bdata-part="([^"]+)"[^>]*>/g;
  const layers = [];
  let om;
  while ((om = outerRe.exec(svg)) !== null) {
    let depth = 1;
    const tagRe = /<\/?g\b[^>]*>/g;
    tagRe.lastIndex = om.index + om[0].length;
    let t;
    let inner = null;
    while ((t = tagRe.exec(svg)) !== null) {
      if (t[0].startsWith('</')) depth--;
      else depth++;
      if (depth === 0) {
        inner = svg.slice(om.index + om[0].length, t.index);
        break;
      }
    }
    if (inner === null) throw new Error(`${label}: unclosed data-part group ${JSON.stringify(om[1])}`);
    layers.push({ part: om[1], inner });
  }
  const have = new Set(layers.map((l) => l.part));
  const missing = SEMANTIC_GROUPS.filter((p) => !have.has(p));
  if (missing.length > 0) {
    throw new Error(`${label}: missing part layers ${missing.join(',')} (want ${SEMANTIC_GROUPS.join(',')})`);
  }
  const unknown = layers.map((l) => l.part).filter((p) => !SEMANTIC_GROUPS.includes(p));
  if (unknown.length > 0) throw new Error(`${label}: unknown part layers ${unknown.join(',')}`);
  const data = new Uint8ClampedArray(w * h * 4); // transparent default
  const names = new Array(w * h).fill(null);
  const parts = new Array(w * h).fill(null);
  let total = 0;
  for (const { part, inner } of layers) {
    // Color groups hold rects only (no nested g), so non-greedy capture is exact.
    const colorRe = /<g\b[^>]*\bdata-color="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g;
    let cm;
    while ((cm = colorRe.exec(inner)) !== null) {
      const colorName = unescapeXml(cm[1]);
      const rects = cm[2].match(/<rect\b[^>]*?(?:\/>|<\/rect\s*>)/g) ?? [];
      if (rects.length === 0) {
        throw new Error(
          `${label}: empty color group ${JSON.stringify(colorName)} in part ${JSON.stringify(part)} (no rects)`,
        );
      }
      for (const r of rects) {
        const xm = r.match(/\bx="(\d+)"/);
        const ym = r.match(/\by="(\d+)"/);
        const fm = r.match(/\bfill="([^"]+)"/);
        if (!xm || !ym || !fm) {
          throw new Error(
            `${label}: rect missing x/y/fill in part ${JSON.stringify(part)} color ${JSON.stringify(colorName)}`,
          );
        }
        const x = Number(xm[1]);
        const y = Number(ym[1]);
        if (x < 0 || y < 0 || x >= w || y >= h) {
          throw new Error(`${label}: rect out of bounds (${x},${y}) for ${w}x${h}`);
        }
        const c = parseFillHex(fm[1], label, `rect (${x},${y})`);
        const idx = y * w + x;
        if (names[idx] !== null) {
          throw new Error(`${label}: duplicate pixel (${x},${y}) (overlapping rects)`);
        }
        const o = idx * 4;
        data[o] = c.r;
        data[o + 1] = c.g;
        data[o + 2] = c.b;
        data[o + 3] = 255;
        names[idx] = colorName;
        parts[idx] = part;
        total++;
      }
    }
  }
  if (total === 0) throw new Error(`${label}: no rects to decode (empty view SVG)`);
  return { data, w, h, names, meta, parts };
}

// roundTripAsset(assetDir) -> { views, masters, ok, failures }.
// Reads asset.json, decodes every clip + master SVG via svgToPixels, re-emits
// via pixelsToSvg reusing the decoded meta (parts-derived relabel), and
// byte-compares against the file on disk. Read-only: never writes.
// fs comes from dynamic import (writeViewSvg pattern); still zero npm deps.
export async function roundTripAsset(assetDir) {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const dir = String(assetDir);
  const asset = JSON.parse(readFileSync(resolve(dir, 'asset.json'), 'utf8'));
  const staticOnly = ['weapon', 'building', 'prop', 'scenery'].includes(asset.kind);
  const root = resolve(dir, '..', '..');
  const pm = String(asset.palette ?? '').match(/^palette_(\w+)@v(\d+)$/);
  if (!pm) throw new Error(`asset palette ref malformed: ${JSON.stringify(asset.palette)}`);
  const palette = JSON.parse(
    readFileSync(resolve(root, 'palettes', `palette_${pm[1]}.v${pm[2]}.json`), 'utf8'),
  );
  const viewFiles = [];
  for (const act of Object.keys(asset.actions ?? {})) {
    for (const p of asset.perspectives ?? []) {
      for (const d of asset.views ?? []) {
        for (const clip of asset.actions[act].clips?.[p]?.[d] ?? []) viewFiles.push(clip.file);
      }
    }
  }
  const masterFiles = Object.values(asset.masters ?? {});
  const failures = [];
  const check = (file) => {
    const fp = resolve(dir, file);
    let original;
    try {
      original = readFileSync(fp, 'utf8');
    } catch (e) {
      failures.push({ file, reason: `unreadable: ${e.message}` });
      return;
    }
    let parsed;
    try {
      parsed = svgToPixels(original, file);
    } catch (e) {
      failures.push({ file, reason: e.message });
      return;
    }
    const { data, w, h, names, meta } = parsed;
    let remade;
    try {
      remade = pixelsToSvg(data, w, h, {
        asset: meta.asset,
        perspective: meta.perspective,
        action: meta.action,
        dir: meta.dir,
        frame: meta.frame,
        size: Number(meta.size) || w,
        palette,
        seed: meta.seed,
        prompt_hash: meta.prompt_hash,
        denoise: meta.denoise,
        source: meta.source,
        names,
        master: meta.master,
        relabel: staticOnly
          ? staticRelabel
          : (x, y, n) =>
              knightRelabel(x, y, n, { size: w, action: meta.action, perspective: meta.perspective }),
      });
    } catch (e) {
      failures.push({ file, reason: `re-emit: ${e.message}` });
      return;
    }
    if (remade !== original) {
      failures.push({ file, reason: `byte mismatch (disk ${original.length} vs remade ${remade.length})` });
    }
  };
  for (const f of viewFiles) check(f);
  for (const f of masterFiles) check(f);
  return { views: viewFiles.length, masters: masterFiles.length, ok: failures.length === 0, failures };
}

// Node-only thin wrapper: library core never statically imports fs.
export async function writeViewSvg(filePath, svg) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, svg, 'utf8');
  return filePath;
}

// knightRelabel(x, y, colorName, opts?) -> part (pure, deterministic).
// v1 semantic split for the synthetic knight (mirrors synthKnightPixels geometry):
// - Leg/boot band y>=42: leather/leather-dark/boot-dark split left/right by
//   x<size/2 (limb-l / limb-r). size defaults to 64.
// - Sword band (attack only): at/right of the torso's right edge
//   (torsoRight = bx+16, bx = 24 + (perspective==='sd' ? 2 : 0)) in
//   steel-light/outline/gold/leather goes to weapon-slot. `perspective` is an
//   optional extension of the {size,action} contract (defaults 'td') so side
//   views keep their torso edge out of the sword band.
// - Outfit (outside the sword band): tunic-red/tunic-dark/steel-mid/gold.
// - Body: everything else (skin-1..4, hair, eye, white, outline) and any
//   unknown color name (safe default, keeps weapon-slot reserved-empty for idle).
// - Only SEMANTIC_GROUPS members are ever returned (guarded below).
export function knightRelabel(x, y, colorName, opts = {}) {
  const size = Number.isInteger(opts.size) && opts.size > 0 ? opts.size : 64;
  const action = opts.action ?? '';
  const perspective = opts.perspective ?? 'td';
  const name = String(colorName ?? '');
  const bx = 24 + (perspective === 'sd' ? 2 : 0);
  const torsoRight = bx + 16; // exclusive: torso columns are bx..bx+15
  let part = 'body';
  if (y >= 42 && (name === 'leather' || name === 'leather-dark' || name === 'boot-dark')) {
    part = x < size / 2 ? 'limb-l' : 'limb-r';
  } else if (
    action === 'attack' &&
    x >= torsoRight &&
    (name === 'steel-light' || name === 'outline' || name === 'gold' || name === 'leather')
  ) {
    part = 'weapon-slot';
  } else if (name === 'tunic-red' || name === 'tunic-dark' || name === 'steel-mid' || name === 'gold') {
    part = 'outfit';
  } else {
    part = 'body';
  }
  if (!SEMANTIC_GROUPS.includes(part)) {
    throw new Error(`knightRelabel(${x},${y},${JSON.stringify(name)}) produced illegal part ${JSON.stringify(part)}`);
  }
  return part;
}

// --- Deterministic synthetic knight pixels (batch generate only) ---
export function synthKnightPixels({ perspective, action, dir, frameNum, mappable, size }) {
  const byName = new Map(mappable.map((c) => [c.name, c]));
  const C = (n) => {
    const c = byName.get(n);
    if (!c) throw new Error(`palette missing entry ${JSON.stringify(n)}`);
    return c;
  };
  const buf = new Uint8ClampedArray(size * size * 4); // transparent fill
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = c.r;
    buf[i + 1] = c.g;
    buf[i + 2] = c.b;
    buf[i + 3] = 255;
  };
  const fillRect = (x0, y0, ww, hh, c) => {
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) set(x, y, c);
  };
  const borderRect = (x0, y0, ww, hh, c) => {
    for (let x = x0; x < x0 + ww; x++) {
      set(x, y0, c);
      set(x, y0 + hh - 1, c);
    }
    for (let y = y0; y < y0 + hh; y++) {
      set(x0, y, c);
      set(x0 + ww - 1, y, c);
    }
  };
  const dirIdx = { fr: 0, bk: 1, lf: 2, rt: 3 }[dir] ?? 0;
  const dx = perspective === 'sd' ? 2 : 0; // side-view stance shifts right
  const bx = 24 + dx;
  const torsoY = 22;
  const torsoW = 16;
  const torsoH = 20;
  fillRect(bx, torsoY, torsoW, torsoH, C('tunic-red'));
  fillRect(bx + torsoW - 2, torsoY, 2, torsoH, C('tunic-dark'));
  const hx = bx + 3;
  const hy = 10;
  const hw = 10;
  const hh = 10;
  if (dir === 'bk') {
    fillRect(hx, hy, hw, hh, C('hair')); // back of head: no face
  } else {
    // Gaze leads the facing dir by 1px (stays inside the outline ring) so
    // fr/lf/rt heads never render identical — dir must stay visible per cell.
    const eyesDx = dir === 'lf' ? -1 : dir === 'rt' ? 1 : 0;
    fillRect(hx, hy, hw, hh, C('skin-1'));
    set(hx + 2 + eyesDx, hy + 4, C('eye'));
    set(hx + 7 + eyesDx, hy + 4, C('eye'));
    set(hx + 2 + eyesDx, hy + 5, C('white'));
    set(hx + 7 + eyesDx, hy + 5, C('white'));
  }
  fillRect(hx + 4, hy + hh, 2, 2, C('skin-2')); // neck
  borderRect(bx, torsoY, torsoW, torsoH, C('outline'));
  borderRect(hx, hy, hw, hh, C('outline'));
  fillRect(bx + 1, torsoY + 1, 3, 2, C('steel-mid')); // pauldrons
  fillRect(bx + torsoW - 4, torsoY + 1, 3, 2, C('steel-mid'));
  // Modulo 4, not the frame count: with 4 dirs the shared cycle must be >= 4
  // or rt collapses onto fr (dirIdx 3 ≡ 0 mod 3) and attack f4 wraps onto f1.
  const shift = (frameNum + dirIdx) % 4; // walk/attack stride, idle varies by dir
  const legY = 42;
  const legH = 11;
  const legW = 4;
  const llx = bx + 2 + shift;
  const rlx = bx + 10 - shift;
  fillRect(llx, legY, legW, legH, C('leather'));
  fillRect(rlx, legY, legW, legH, C('leather'));
  fillRect(llx - 1, legY + legH, legW + 2, 3, C('boot-dark'));
  fillRect(rlx - 1, legY + legH, legW + 2, 3, C('boot-dark'));
  if (action === 'attack') {
    const sx = bx + torsoW + 2; // sword right of torso
    fillRect(sx, 16, 2, 21, C('steel-light'));
    borderRect(sx, 16, 2, 21, C('outline'));
    fillRect(sx - 2, 37, 6, 2, C('gold'));
    fillRect(sx, 39, 2, 3, C('leather'));
  }
  return { data: buf, width: size, height: size };
}

// --- Deterministic synthetic static pixels (static-kinds batch generate only) ---
//
// Per-kind motif builders on the same rect-grid + outline + orientation-cue
// idiom as synthKnightPixels: fillRect/borderRect over a transparent canvas,
// side-view stance shift (+2 dx), per-dir cues so the 8 cells of one asset
// (2 perspectives x 4 dirs, idle frame 0) are pairwise distinct. Only palette
// entries of the asset kind are ever touched (verified by pixelsToSvg which
// throws on off-palette bytes). No PNG parsing anywhere; pure arithmetic.
// Size-relative layout so every allowed tier (32/48/64, plus 128 for
// building/scenery) renders; skeletons stay 64 this round.
function makeStaticPainter(mappable, size) {
  const byName = new Map(mappable.map((c) => [c.name, c]));
  const C = (n) => {
    const c = byName.get(n);
    if (!c) throw new Error(`palette missing entry ${JSON.stringify(n)}`);
    return c;
  };
  const buf = new Uint8ClampedArray(size * size * 4); // transparent fill
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = c.r;
    buf[i + 1] = c.g;
    buf[i + 2] = c.b;
    buf[i + 3] = 255;
  };
  const clear = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = 0;
    buf[i + 1] = 0;
    buf[i + 2] = 0;
    buf[i + 3] = 0;
  };
  const fillRect = (x0, y0, w, h, c) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c);
  };
  const borderRect = (x0, y0, w, h, c) => {
    for (let x = x0; x < x0 + w; x++) {
      set(x, y0, c);
      set(x, y0 + h - 1, c);
    }
    for (let y = y0; y < y0 + h; y++) {
      set(x0, y, c);
      set(x0 + w - 1, y, c);
    }
  };
  return { buf, C, set, clear, fillRect, borderRect };
}

function staticDirIndex(dir) {
  return { fr: 0, bk: 1, lf: 2, rt: 3 }[dir] ?? 0;
}

// Blade + guard + grip + pommel gem. Cues: sd shifts +2 dx; tip carve, guard
// end caps and pommel gem color vary per dir.
export function synthSwordPixels({ perspective, dir, frameNum = 0, mappable, size }) {
  void frameNum;
  const { buf, C, fillRect, borderRect, clear } = makeStaticPainter(mappable, size);
  const dirIdx = staticDirIndex(dir);
  const px = perspective === 'sd' ? 1 : 0;
  const dx = px ? 2 : 0;
  const cx = Math.floor(size / 2) + dx;
  const bw = Math.max(3, Math.round(size / 16));
  const bx = cx - Math.floor(bw / 2);
  const tipY = Math.max(2, Math.round(size * 0.12));
  const botY = Math.round(size * 0.55);
  fillRect(bx, tipY, bw, botY - tipY, C('steel'));
  fillRect(bx, tipY, 1, botY - tipY, C('edge-light'));
  fillRect(bx + bw - 1, tipY, 1, botY - tipY, C('steel-shadow'));
  if (dir !== 'bk') {
    const fx = bx + Math.floor(bw / 2) + (dir === 'lf' ? -1 : dir === 'rt' ? 1 : 0);
    fillRect(fx, tipY + 2, 1, Math.max(1, botY - tipY - 4), C('fuller-dark'));
  }
  borderRect(bx, tipY, bw, botY - tipY, C('outline'));
  if (dir === 'fr') {
    clear(bx, tipY);
    clear(bx + bw - 1, tipY);
  } else if (dir === 'lf') {
    clear(bx + bw - 1, tipY);
    clear(bx + bw - 1, tipY + 1);
  } else if (dir === 'rt') {
    clear(bx, tipY);
    clear(bx, tipY + 1);
  }
  const gw = Math.max(7, Math.round(size * 0.25));
  const gx = cx - Math.floor(gw / 2);
  const gy = botY;
  fillRect(gx, gy, gw, 2, C('brass'));
  fillRect(gx, gy, gw, 1, C('gold-highlight'));
  borderRect(gx, gy, gw, 2, C('outline'));
  if (dir === 'fr' || dir === 'lf') fillRect(gx, gy, 1, 2, C('gold-highlight'));
  if (dir === 'fr' || dir === 'rt') fillRect(gx + gw - 1, gy, 1, 2, C('gold-highlight'));
  const gxx = cx - 1;
  const gl = Math.max(4, Math.round(size * 0.1));
  fillRect(gxx, gy + 2, 3, gl, C('wood-grip'));
  for (let k = 1; k < gl; k += 3) fillRect(gxx, gy + 2 + k, 3, 1, C('wrap-dark'));
  const gem = (dirIdx + px) % 2 === 0 ? C('gem-red') : C('gem-blue');
  fillRect(gxx, gy + 2 + gl, 3, 2, gem);
  return { data: buf, width: size, height: size };
}

// Plaster walls + stone foundation + stepped gable + door/window/moss cues.
// Cues: sd shifts +2 dx and flips moss side; door slot, window light and moss
// height vary per dir.
export function synthHousePixels({ perspective, dir, frameNum = 0, mappable, size }) {
  void frameNum;
  const { buf, C, fillRect, borderRect } = makeStaticPainter(mappable, size);
  const dirIdx = staticDirIndex(dir);
  const px = perspective === 'sd' ? 1 : 0;
  const dx = px ? 2 : 0;
  const cx = Math.floor(size / 2) + dx;
  const wallW = Math.max(10, Math.round(size * 0.3));
  const wallH = Math.max(10, Math.round(size * 0.3));
  const wx = cx - Math.floor(wallW / 2);
  const wy = Math.round(size * 0.38);
  fillRect(wx, wy, wallW, wallH, C('plaster'));
  fillRect(wx + 2, wy, 2, wallH - 3, C('beam'));
  fillRect(wx + wallW - 4, wy, 2, wallH - 3, C('beam'));
  fillRect(wx + 3, wy, 1, wallH - 3, C('beam-dark'));
  fillRect(wx, wy + wallH - 3, wallW, 3, C('stone-mid'));
  fillRect(wx, wy + wallH - 1, wallW, 1, C('stone-dark'));
  fillRect(wx, wy, wallW, 1, C('stone-light'));
  for (let r = 0; r < 5; r++) {
    const rw = Math.max(4, wallW + 6 - r * 4);
    const rx = cx - Math.floor(rw / 2);
    const ry = wy - 2 - r * 2;
    if (ry < 1) break;
    fillRect(rx, ry, rw, 2, C('roof-red'));
    fillRect(rx + rw - 2, ry, 2, 2, C('roof-dark'));
    borderRect(rx, ry, rw, 2, C('outline'));
  }
  const dw = Math.max(3, Math.round(size / 16));
  const dh = Math.max(6, Math.round(size * 0.13));
  const leftX = wx + 2;
  const rightX = wx + wallW - 2 - dw;
  const midL = wx + Math.floor(wallW / 2) - dw - 1;
  const midR = wx + Math.floor(wallW / 2) + 1;
  const doorX = dir === 'fr' ? leftX : dir === 'bk' ? rightX : dir === 'lf' ? midL : midR;
  const doorY = wy + wallH - 3 - dh;
  fillRect(doorX, doorY, dw, dh, C('door'));
  borderRect(doorX, doorY, dw, dh, C('outline'));
  const winW = Math.max(3, Math.round(size / 16));
  const winX = doorX <= cx ? wx + wallW - 2 - winW : wx + 2;
  fillRect(winX, wy + 2, winW, winW, dir === 'fr' || dir === 'lf' ? C('window-lit') : C('window-dark'));
  borderRect(winX, wy + 2, winW, winW, C('outline'));
  const mossX = px ? wx + wallW - 2 : wx;
  fillRect(mossX, wy + wallH - 5 - (dirIdx % 3), 2, 2, C('moss'));
  borderRect(wx, wy, wallW, wallH, C('outline'));
  return { data: buf, width: size, height: size };
}

// Plank box + corner brackets + rope + cloth patch + strap cues. Cues: sd
// shifts +2 dx and flips strap side; rope height, cloth color/slot vary per dir.
export function synthCratePixels({ perspective, dir, frameNum = 0, mappable, size }) {
  void frameNum;
  const { buf, C, set, fillRect, borderRect } = makeStaticPainter(mappable, size);
  const dirIdx = staticDirIndex(dir);
  const px = perspective === 'sd' ? 1 : 0;
  const dx = px ? 2 : 0;
  const box = Math.max(12, Math.round(size * 0.45));
  const bx0 = Math.floor(size / 2) - Math.floor(box / 2) + dx;
  const by0 = Math.floor(size / 2) - Math.floor(box / 2);
  fillRect(bx0, by0, box, box, C('wood-mid'));
  fillRect(bx0 + 1, by0 + 1, box - 2, 1, C('wood-light'));
  fillRect(bx0 + 1, by0 + box - 2, box - 2, 1, C('wood-dark'));
  const midX = bx0 + Math.floor(box / 2) - 1;
  const midY = by0 + Math.floor(box / 2) - 1;
  fillRect(midX, by0 + 1, 2, box - 2, C('wood-dark'));
  fillRect(bx0 + 1, midY, box - 2, 2, C('wood-dark'));
  for (const [qx, qy] of [
    [bx0, by0],
    [bx0 + box - 2, by0],
    [bx0, by0 + box - 2],
    [bx0 + box - 2, by0 + box - 2],
  ]) {
    fillRect(qx, qy, 2, 2, C('metal-light'));
    set(qx + 1, qy + 1, C('metal-dark'));
  }
  const ropeY = midY + (dirIdx - 1) * 2;
  fillRect(bx0 + 1, Math.min(by0 + box - 2, Math.max(by0 + 1, ropeY)), box - 2, 1, C('rope'));
  const cloth = dir === 'fr' || dir === 'lf' ? C('cloth-red') : C('cloth-blue');
  const inset = 3;
  const slot = { fr: [bx0 + inset, by0 + inset], bk: [bx0 + box - inset - 3, by0 + box - inset - 3], lf: [bx0 + box - inset - 3, by0 + inset], rt: [bx0 + inset, by0 + box - inset - 3] }[dir];
  fillRect(slot[0], slot[1], 3, 3, cloth);
  borderRect(slot[0], slot[1], 3, 3, C('outline'));
  fillRect(px ? bx0 + box - 3 : bx0 + 2, by0 + 2, 1, box - 4, C('leather'));
  borderRect(bx0, by0, box, box, C('outline'));
  return { data: buf, width: size, height: size };
}

// Trunk + canopy + ground + cloud/rock/sand cues. Cues: sd shifts +2 dx;
// canopy lean, cloud slot and rock side vary per dir.
export function synthTreePixels({ perspective, dir, frameNum = 0, mappable, size }) {
  void frameNum;
  const painter = makeStaticPainter(mappable, size);
  const { buf, C, set, fillRect, borderRect } = painter;
  const dirIdx = staticDirIndex(dir);
  const px = perspective === 'sd' ? 1 : 0;
  const dx = px ? 2 : 0;
  const cx = Math.floor(size / 2) + dx;
  const groundY = size - Math.max(3, Math.round(size * 0.07));
  fillRect(0, groundY, size, size - groundY, C('grass-mid'));
  for (let x = 0; x < size; x++) {
    if ((x + dirIdx) % 7 === 0) set(x, groundY, C('grass-dark'));
    if ((x + dirIdx + 3) % 11 === 0) set(x, groundY + 1, C('grass-light'));
  }
  const tw = Math.max(3, Math.round(size / 16));
  const th = Math.max(8, Math.round(size * 0.28));
  const tx = cx - Math.floor(tw / 2);
  const ty = groundY - th;
  fillRect(tx, ty, tw, th, C('trunk'));
  fillRect(tx, ty, 1, th, C('earth-dark'));
  fillRect(tx - 2, groundY - 2, 2, 2, C('earth'));
  fillRect(tx + tw, groundY - 2, 2, 2, C('earth'));
  const lean = (dirIdx - 1) * 2;
  const bands = [
    { w: Math.max(8, Math.round(size * 0.34)), h: Math.max(4, Math.round(size * 0.09)) },
    { w: Math.max(10, Math.round(size * 0.46)), h: Math.max(4, Math.round(size * 0.1)) },
    { w: Math.max(7, Math.round(size * 0.3)), h: Math.max(4, Math.round(size * 0.09)) },
  ];
  let bandY = ty - bands[0].h + 2;
  bands.forEach((band, bi) => {
    const bx = cx + (bi === 1 ? lean : bi === 2 ? -lean : 0) - Math.floor(band.w / 2);
    fillRect(bx, bandY, band.w, band.h, bi === 1 ? C('foliage') : C('grass-mid'));
    fillRect(bx, bandY, band.w, 1, C('grass-light'));
    fillRect(bx + band.w - 2, bandY, 2, band.h, C('grass-dark'));
    borderRect(bx, bandY, band.w, band.h, C('outline'));
    bandY -= band.h - 1;
  });
  const cloudW = Math.max(4, Math.round(size * 0.09));
  const cloudX = (6 + dirIdx * 5 + px * 4) % Math.max(1, size - cloudW - 1);
  fillRect(cloudX, 2, cloudW, 2, C('sky'));
  const rockSide = dir === 'fr' || dir === 'lf' ? -1 : 1;
  const rockX = cx + rockSide * (Math.floor(tw / 2) + 4);
  fillRect(rockX, groundY - 3, 2, 2, C('rock-light'));
  set(rockX, groundY - 1, C('rock-dark'));
  fillRect(cx - rockSide * (Math.floor(tw / 2) + 5), groundY - 2, 3, 1, C('sand'));
  return { data: buf, width: size, height: size };
}

// staticRelabel(x, y, colorName) -> 'body' (pure, deterministic).
// Static kinds carry no anatomical split: every pixel routes to `body` and the
// other four layers stay present-but-empty. Used by generateStaticSvgs and by
// roundTripAsset for static kinds so re-emit matches generation byte-for-byte
// (knightRelabel must NOT run on static palettes: e.g. crate `leather` would
// otherwise split at y>=42 into limb layers).
export function staticRelabel() {
  return 'body';
}

// Dispatcher for tests and batch generate.
export function synthStaticPixels({ kind, perspective, dir, frameNum = 0, mappable, size }) {
  switch (kind) {
    case 'weapon':
      return synthSwordPixels({ perspective, dir, frameNum, mappable, size });
    case 'building':
      return synthHousePixels({ perspective, dir, frameNum, mappable, size });
    case 'prop':
      return synthCratePixels({ perspective, dir, frameNum, mappable, size });
    case 'scenery':
      return synthTreePixels({ perspective, dir, frameNum, mappable, size });
    default:
      throw new Error(`unknown static kind ${JSON.stringify(kind)} (want weapon|building|prop|scenery)`);
  }
}

function frameNumFromFile(file) {
  const m = String(file).match(/(\d+)\.svg$/);
  return m ? Number(m[1]) : 0;
}

export async function generateKnightSvgs(assetId = 'knight_001', opts = {}) {
  const onProgress = typeof opts?.onProgress === 'function' ? opts.onProgress : null;
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { mapFrameToPalette } = await import('./palette.mjs');
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const assetDir = resolve(moduleDir, '..', 'assets', assetId);
  const assetPath = resolve(assetDir, 'asset.json');
  const asset = JSON.parse(readFileSync(assetPath, 'utf8'));
  const palettePath = resolve(moduleDir, '..', 'palettes', 'palette_character.v1.json');
  const palette = JSON.parse(readFileSync(palettePath, 'utf8'));
  const { getMappableColors: getMap } = await import('./palette.mjs');
  const mappable = getMap(palette);
  const size = asset.size;
  const actions = Object.keys(asset.actions);
  let views = 0;
  const build = (perspective, act, d, frameNum, meta) => {
    const synth = synthKnightPixels({ perspective, action: act, dir: d, frameNum, mappable, size });
    const geo = quantizeGeometry(synth.data, synth.width, synth.height, size, { kind: 'character' });
    const mapped = mapFrameToPalette(geo.data, geo.width, geo.height, palette);
    return pixelsToSvg(mapped.data, geo.width, geo.height, {
      asset: asset.id,
      perspective,
      action: act,
      dir: d,
      frame: frameNum,
      size,
      palette,
      seed: meta.seed,
      prompt_hash: meta.prompt_hash,
      denoise: meta.denoise,
      source: meta.source,
      names: mapped.names,
      master: meta.master ?? false,
      relabel: (x, y, n) => knightRelabel(x, y, n, { size, action: act, perspective }),
    });
  };
  mkdirSync(assetDir, { recursive: true });
  for (const act of actions) {
    const clips = asset.actions[act].clips;
    for (const persp of asset.perspectives) {
      for (const d of asset.views) {
        const list = clips?.[persp]?.[d] ?? [];
        for (const clip of list) {
          const frameNum = frameNumFromFile(clip.file);
          const svg = build(persp, act, d, frameNum, {
            seed: clip.seed,
            prompt_hash: clip.prompt_hash,
            denoise: clip.denoise,
            source: `synthetic:${asset.id}:${persp}/${act}/${d}/${frameNum}`,
          });
          writeFileSync(resolve(assetDir, clip.file), svg, 'utf8');
          views++;
          if (onProgress) await onProgress({ file: clip.file, done: views });
        }
      }
    }
  }
  // Masters reuse the idle-fr-0 synthesis per perspective so their pixel sets
  // equal the front view at grid size (master keeps data-master=true marker).
  let masters = 0;
  for (const persp of asset.perspectives) {
    const ref = asset.actions.idle.clips[persp].fr[0];
    const frameNum = frameNumFromFile(ref.file);
    const svg = build(persp, 'idle', 'fr', frameNum, {
      seed: ref.seed,
      prompt_hash: ref.prompt_hash,
      denoise: ref.denoise,
      source: `master:${persp}`,
      master: true,
    });
    writeFileSync(resolve(assetDir, asset.masters[persp]), svg, 'utf8');
    masters++;
    if (onProgress) await onProgress({ file: asset.masters[persp], done: views + masters });
  }
  console.log(`OK: generated ${views} views + ${masters} masters for ${assetId} -> ${assetDir}`);
  return { views, masters, assetDir };
}

export async function generateStaticSvgs(assetId, opts = {}) {
  const onProgressStatic = typeof opts?.onProgress === 'function' ? opts.onProgress : null;
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { mapFrameToPalette, getMappableColors: getMap } = await import('./palette.mjs');
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const assetDir = resolve(moduleDir, '..', 'assets', assetId);
  const asset = JSON.parse(readFileSync(resolve(assetDir, 'asset.json'), 'utf8'));
  const kind = asset.kind;
  if (!['weapon', 'building', 'prop', 'scenery'].includes(kind)) {
    throw new Error(`generateStaticSvgs: ${assetId} kind must be weapon|building|prop|scenery, got ${JSON.stringify(kind)}`);
  }
  const pm = String(asset.palette ?? '').match(/^palette_(\w+)@v(\d+)$/);
  if (!pm || pm[1] !== kind) {
    throw new Error(`generateStaticSvgs: ${assetId} palette ${JSON.stringify(asset.palette)} must match palette_${kind}@vN`);
  }
  const palette = JSON.parse(readFileSync(resolve(moduleDir, '..', 'palettes', `palette_${pm[1]}.v${pm[2]}.json`), 'utf8'));
  const mappable = getMap(palette);
  const size = asset.size;
  const build = (perspective, d, frameNum, meta) => {
    const synth = synthStaticPixels({ kind, perspective, dir: d, frameNum, mappable, size });
    const geo = quantizeGeometry(synth.data, synth.width, synth.height, size, { kind });
    const mapped = mapFrameToPalette(geo.data, geo.width, geo.height, palette);
    return pixelsToSvg(mapped.data, geo.width, geo.height, {
      asset: asset.id,
      perspective,
      action: 'idle',
      dir: d,
      frame: frameNum,
      size,
      palette,
      seed: meta.seed,
      prompt_hash: meta.prompt_hash,
      denoise: meta.denoise,
      source: meta.source,
      names: mapped.names,
      master: meta.master ?? false,
      relabel: staticRelabel,
    });
  };
  mkdirSync(assetDir, { recursive: true });
  let views = 0;
  for (const act of Object.keys(asset.actions)) {
    const clips = asset.actions[act].clips;
    for (const persp of asset.perspectives) {
      for (const d of asset.views) {
        const list = clips?.[persp]?.[d] ?? [];
        for (const clip of list) {
          const frameNum = frameNumFromFile(clip.file);
          const svg = build(persp, d, frameNum, {
            seed: clip.seed,
            prompt_hash: clip.prompt_hash,
            denoise: clip.denoise,
            source: `synthetic:${asset.id}:${persp}/${act}/${d}/${frameNum}`,
          });
          writeFileSync(resolve(assetDir, clip.file), svg, 'utf8');
          views++;
          if (onProgressStatic) await onProgressStatic({ file: clip.file, done: views });
        }
      }
    }
  }
  let masters = 0;
  for (const persp of asset.perspectives) {
    const ref = asset.actions.idle.clips[persp].fr[0];
    const frameNum = frameNumFromFile(ref.file);
    const svg = build(persp, 'fr', frameNum, {
      seed: ref.seed,
      prompt_hash: ref.prompt_hash,
      denoise: ref.denoise,
      source: `master:${persp}`,
      master: true,
    });
    writeFileSync(resolve(assetDir, asset.masters[persp]), svg, 'utf8');
    masters++;
    if (onProgressStatic) await onProgressStatic({ file: asset.masters[persp], done: views + masters });
  }
  console.log(`OK: generated ${views} views + ${masters} masters for ${assetId} -> ${assetDir}`);
  return { views, masters, assetDir };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'selfcheck') {
    console.log('OK: use node --test tools/vectorize.test.mjs for 3.1 verification');
    return;
  }
  if (cmd === 'generate') {
    let assetId = 'knight_001';
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--asset' && rest[i + 1]) assetId = rest[i + 1];
      else if (rest[i].startsWith('--asset=')) assetId = rest[i].slice('--asset='.length);
    }
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    let kind = 'character';
    try {
      kind = JSON.parse(readFileSync(resolve(moduleDir, '..', 'assets', assetId, 'asset.json'), 'utf8')).kind ?? 'character';
    } catch {
      kind = 'character';
    }
    if (kind === 'character') await generateKnightSvgs(assetId);
    else await generateStaticSvgs(assetId);
    return;
  }
  if (cmd === 'roundtrip') {
    let assetId = 'knight_001';
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--asset' && rest[i + 1]) assetId = rest[i + 1];
      else if (rest[i].startsWith('--asset=')) assetId = rest[i].slice('--asset='.length);
    }
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const assetDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets', assetId);
    const r = await roundTripAsset(assetDir);
    console.log(`OK: roundtrip ${r.views} views + ${r.masters} masters for ${assetId} (ok=${r.ok})`);
    if (!r.ok) {
      for (const f of r.failures) console.log(`FAIL: ${f.file}: ${f.reason}`);
      process.exit(1);
    }
    return;
  }
  console.error(
    'usage: node tools/vectorize.mjs selfcheck | node tools/vectorize.mjs generate --asset knight_001 | node tools/vectorize.mjs roundtrip --asset knight_001',
  );
  process.exit(2);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((e) => {
    console.error(e?.stack ?? String(e));
    process.exit(1);
  });
}
