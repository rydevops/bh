// Hand-made artwork that replaces the procedural sprites, one sprite sheet (PNG + JSON atlas) per hero and skin.
//
//   art/<hero>.png   transparent sprite sheet           art/<hero>.json   where every frame lives in it
//
// Frames: `idle`, `fire` (shot / muzzle flash), `ability` (ability active) - all drawn for the same 72x112 world box -
// and `icon`, a square bust used for portraits and app icons. A hero or skin without a registered sheet keeps using the
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
      loaded.set(key, { img, frames: atlas.frames, scale: atlas.scale, w: atlas.logical.w, h: atlas.logical.h });
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

export function hasArtFrame(heroId, skinId, name) {
  const sh = artSheet(heroId, skinId);
  return !!(sh && sh.frames[name]);
}

/** Test hook. */
export function _resetArt() { loaded.clear(); }
