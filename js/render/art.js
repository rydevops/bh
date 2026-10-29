// Hand-made artwork that replaces the procedural sprites, one sprite sheet (PNG + JSON atlas) per hero and skin.
//
//   art/<hero>.png   transparent sprite sheet           art/<hero>.json   where every frame lives in it
//
// The atlas lists named frames - `idle`, the `fire_*` and `overdrive_*` poses... all drawn for the same 72x112 world box -
// plus `icon`, a square bust used for portraits and app icons, and `animations` that say which frames play when
// (`fire` after a shot, `ability` while it is active) and for how long. A hero or skin without a registered sheet keeps using the
// procedural sprite, and a sheet that fails to load falls back to it too, so the game always renders.

const SHEETS = {
  'vanguard:default': 'art/vanguard.json',
};

const loaded = new Map(); // 'hero:skin' -> { img, frames, scale, w, h } | null

const base = () => new URL('../../', import.meta.url);

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load ' + url));
    img.src = url;
  });
}

/** Load every registered sheet. Never rejects: a failed sheet is simply left out. Call once at boot. */
export async function loadArt() {
  if (typeof Image === 'undefined') return; // headless (tests, tools)
  await Promise.all(Object.entries(SHEETS).map(async ([key, atlasPath]) => {
    try {
      const atlasUrl = new URL(atlasPath, base());
      const atlas = await (await fetch(atlasUrl)).json();
      const img = await loadImage(new URL(atlas.image, atlasUrl).href);
      loaded.set(key, { img, frames: atlas.frames, animations: atlas.animations || {}, scale: atlas.scale, w: atlas.logical.w, h: atlas.logical.h });
    } catch (e) {
      console.warn('[art] falling back to procedural art for', key, e.message);
      loaded.set(key, null);
    }
  }));
}

/** The sheet for a hero + skin, or null when that hero still uses procedural art. */
export function artSheet(heroId, skinId) { return loaded.get(`${heroId}:${skinId}`) || null; }

/** { img, x, y, w, h } for a frame (falls back to `idle`), or null. */
export function artFrame(heroId, skinId, name = 'idle') {
  const sh = artSheet(heroId, skinId);
  if (!sh) return null;
  const f = sh.frames[name] || sh.frames.idle;
  return f ? { img: sh.img, x: f.x, y: f.y, w: f.w, h: f.h, logicalW: sh.w, logicalH: sh.h } : null;
}

const durations = (anim, n) => {
  const per = anim.frameDurationsMs || (anim.frameDurationMs ? Array(n).fill(anim.frameDurationMs) : null);
  return Array.from({ length: n }, (_, i) => (per && per[i]) || 100);
};

/** Frame list + per-frame durations (ms) for an animation, or null when the sheet has none by that name. */
function sequence(sh, name, legacyFrame) {
  const a = sh.animations[name];
  const frames = (a && a.frames && a.frames.filter((f) => sh.frames[f])) || (sh.frames[legacyFrame] ? [legacyFrame] : []);
  if (!frames.length) return null;
  return { frames, ms: durations(a || {}, frames.length) };
}

/**
 * Which frame of the sheet a hero shows right now (`idle` for procedural heroes - the name is then ignored):
 *   ability  while the ability is active: cycles through the `ability` animation
 *   fire     for the length of the `fire` animation after a shot (sinceShot, seconds), frame by frame
 *   idle     otherwise
 */
export function artPose(heroId, skinId, { ability = false, sinceShot = Infinity, time = 0 } = {}) {
  const sh = artSheet(heroId, skinId);
  if (!sh) return 'idle';
  if (ability) {
    const seq = sequence(sh, 'ability', 'ability');
    if (seq) return pick(seq, (time * 1000) % seq.ms.reduce((a, b) => a + b, 0));
  }
  const fire = sequence(sh, 'fire', 'fire');
  if (fire && sinceShot * 1000 < fire.ms.reduce((a, b) => a + b, 0)) return pick(fire, sinceShot * 1000);
  return 'idle';
}

function pick(seq, ms) {
  let t = ms;
  for (let i = 0; i < seq.frames.length; i++) { if (t < seq.ms[i]) return seq.frames[i]; t -= seq.ms[i]; }
  return seq.frames[seq.frames.length - 1];
}

/** Idle bob the artist asked for, if any: { bobY (world px of total travel), bobSec } - otherwise the renderer's default. */
export function artBob(heroId, skinId) {
  const sh = artSheet(heroId, skinId);
  const bob = sh && sh.animations.idle && sh.animations.idle.bob;
  return bob && bob.y > 0 && bob.periodMs > 0 ? { bobY: bob.y, bobSec: bob.periodMs / 1000 } : null;
}

/** Test hooks. */
export function _resetArt() { loaded.clear(); }
export function _setSheet(key, atlas) { loaded.set(key, { img: null, frames: atlas.frames, animations: atlas.animations || {}, scale: atlas.scale, w: atlas.logical.w, h: atlas.logical.h }); }
