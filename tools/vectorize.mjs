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
        relabel: (x, y, n) =>
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
function synthKnightPixels({ perspective, action, dir, frameNum, mappable, size }) {
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
    fillRect(hx, hy, hw, hh, C('skin-1'));
    set(hx + 2, hy + 4, C('eye'));
    set(hx + 7, hy + 4, C('eye'));
    set(hx + 2, hy + 5, C('white'));
    set(hx + 7, hy + 5, C('white'));
  }
  fillRect(hx + 4, hy + hh, 2, 2, C('skin-2')); // neck
  borderRect(bx, torsoY, torsoW, torsoH, C('outline'));
  borderRect(hx, hy, hw, hh, C('outline'));
  fillRect(bx + 1, torsoY + 1, 3, 2, C('steel-mid')); // pauldrons
  fillRect(bx + torsoW - 4, torsoY + 1, 3, 2, C('steel-mid'));
  const shift = (frameNum + dirIdx) % 3; // walk/attack stride, idle varies by dir
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

function frameNumFromFile(file) {
  const m = String(file).match(/(\d+)\.svg$/);
  return m ? Number(m[1]) : 0;
}

async function generateKnightSvgs(assetId = 'knight_001') {
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
    await generateKnightSvgs(assetId);
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
