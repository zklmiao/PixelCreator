// clips.mjs — clip storage with fps/loop/next semantics (OpenSpec 5.1).
// Zero dependencies so the Web app can import it directly later.
// Strict export semantics: any unreadable cell throws (missing-cell
// judgment lives in asset-manifest; here there is no fallback).

export const CLIP_ACTIONS = ['idle', 'walk', 'attack'];
export const CLIP_PERSPECTIVES = ['td', 'sd'];
export const CLIP_DIRS = ['fr', 'bk', 'lf', 'rt'];

function clipId(persp, action, dir, detail) {
  return `${persp}/${action}/${dir}${detail ? `:${detail}` : ''}`;
}

export function clipFrames(asset, persp, action, dir) {
  const tag = clipId(persp, action, dir);
  const def = asset?.actions?.[action];
  if (!def) {
    throw new Error(`missing clip: ${tag}:action absent`);
  }
  if (typeof def.fps !== 'number' || !(def.fps > 0)) {
    throw new Error(`missing clip: ${tag}:bad fps ${JSON.stringify(def?.fps)}`);
  }
  const list = def.clips?.[persp]?.[dir];
  if (!Array.isArray(list)) {
    throw new Error(`missing clip: ${tag}:clip absent`);
  }
  if (Number.isInteger(def.frames) && list.length !== def.frames) {
    throw new Error(`missing clip: ${tag}:expected ${def.frames} frames, found ${list.length}`);
  }
  if (list.length === 0) {
    throw new Error(`missing clip: ${tag}:empty clip`);
  }
  const durationMs = 1000 / def.fps;
  return list.map((f, i) => {
    if (!f || typeof f.file !== 'string' || !f.file) {
      throw new Error(`missing clip: ${clipId(persp, action, dir, `[${i}]`)}:bad file`);
    }
    return { file: f.file, durationMs };
  });
}

export function nextFrame(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('missing clip: bad state');
  }
  const { asset, persp, action, dir, index } = state;
  const tag = clipId(persp, action, dir);
  const def = asset?.actions?.[action];
  if (!def) {
    throw new Error(`missing clip: ${tag}:action absent`);
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`missing clip: ${tag}:bad index ${JSON.stringify(index)}`);
  }
  // Validates the current cell strictly; throws missing clip on any gap.
  const frames = clipFrames(asset, persp, action, dir);
  if (index >= frames.length) {
    throw new Error(`missing clip: ${tag}[${index}]:index out of range`);
  }
  if (index + 1 < frames.length) {
    const n = index + 1;
    // Thread asset through so the returned state feeds straight back into
    // nextFrame (the preview-matrix tick loop); without it the second tick
    // throws `missing clip ... action absent`.
    return { asset, persp, action, dir, index: n, file: frames[n].file, durationMs: frames[n].durationMs };
  }
  // Last frame reached.
  if (def.loop === true) {
    return { asset, persp, action, dir, index: 0, file: frames[0].file, durationMs: frames[0].durationMs };
  }
  // Once (attack): fall back to the same persp+dir idle frame 0.
  // Honors def.next when present, defaults to idle per 3.2/5.1 contract.
  const fallbackAction = typeof def.next === 'string' ? def.next : 'idle';
  const fallbackFrames = clipFrames(asset, persp, fallbackAction, dir);
  return {
    asset,
    persp,
    action: fallbackAction,
    dir,
    index: 0,
    file: fallbackFrames[0].file,
    durationMs: fallbackFrames[0].durationMs,
  };
}
