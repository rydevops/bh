// Procedural art: every hero, enemy and boss is drawn with canvas paths, then cached as a bitmap
// at the current render scale. Bold outlines + two-tone shading keep silhouettes readable at phone size.

import { HEROES, skinColors } from '../data/heroes.js';

const OL = '#0e1120';
const cache = new Map();
const flashCache = new WeakMap();

export function clearSpriteCache() { cache.clear(); }

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Render `draw` into a cached bitmap. Logical size w x h, origin at the centre. */
function bake(key, w, h, scale, draw) {
  const k = key + '@' + scale;
  let c = cache.get(k);
  if (c) return c;
  c = makeCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  ctx.translate(w / 2, h / 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  c.lw = w; c.lh = h;
  cache.set(k, c);
  return c;
}

/** White silhouette of a sprite, used for hit flashes. */
export function flashOf(sprite) {
  let f = flashCache.get(sprite);
  if (f) return f;
  f = makeCanvas(sprite.width, sprite.height);
  const x = f.getContext('2d');
  x.drawImage(sprite, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#fff';
  x.fillRect(0, 0, f.width, f.height);
  f.lw = sprite.lw; f.lh = sprite.lh;
  flashCache.set(sprite, f);
  return f;
}

// ---------------------------------------------------------------- helpers
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function fillStroke(ctx, fill, lw = 2) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OL;
  ctx.stroke();
}
function rr(ctx, x, y, w, h, r, fill, lw) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  fillStroke(ctx, fill, lw);
}
function ell(ctx, x, y, rx, ry, fill, lw) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  fillStroke(ctx, fill, lw);
}
function poly(ctx, pts, fill, lw) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  fillStroke(ctx, fill, lw);
}
function eye(ctx, x, y, r, iris = '#111', white = '#fff') {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = white; ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = OL; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + r * 0.15, y + r * 0.25, r * 0.55, 0, 7); ctx.fillStyle = iris; ctx.fill();
}
function glow(ctx, x, y, r, color, a = 0.8) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- heroes
const SKIN = '#f0c8a0';

function chibi(ctx, c, o = {}) {
  const w = o.w ?? 12, headR = o.headR ?? 11;
  // legs
  rr(ctx, -w * 0.7, 14, w * 0.6, 15, 4, c.dark);
  rr(ctx, w * 0.1, 14, w * 0.6, 15, 4, c.dark);
  rr(ctx, -w * 0.78, 25, w * 0.74, 7, 3, '#222a3d');
  rr(ctx, w * 0.04, 25, w * 0.74, 7, 3, '#222a3d');
  // torso
  rr(ctx, -w, -4, w * 2, 23, 7, c.main);
  rr(ctx, -w + 3, -1, w * 2 - 6, 6, 3, c.light, 0);
  rr(ctx, -w, 12, w * 2, 5, 2, c.dark, 1.5);
  // arms
  ell(ctx, -w - 2, 5, 4.5, 8, c.main);
  ell(ctx, w + 2, 5, 4.5, 8, c.main);
  // head
  ell(ctx, 0, -14, headR, headR - 0.5, SKIN);
}

const HERO_DRAW = {
  vanguard(ctx, c) {
    // rifle (behind hand)
    rr(ctx, 10, -34, 6, 38, 2, '#3b4358');
    rr(ctx, 9, -38, 8, 8, 2, '#222a3d');
    rr(ctx, 11, -45, 4, 9, 1.5, '#222a3d');
    rr(ctx, 7, -8, 12, 7, 3, '#4a5470');
    chibi(ctx, c);
    // helmet + visor
    ctx.beginPath(); ctx.ellipse(0, -17, 12, 10, 0, Math.PI, 0); ctx.closePath(); fillStroke(ctx, c.main);
    rr(ctx, -10, -17, 20, 6, 3, c.accent, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-8, -16, 6, 2);
    eye(ctx, -4, -11, 2.2); eye(ctx, 4, -11, 2.2);
    // ammo bandolier
    ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(10, 14); ctx.lineWidth = 4; ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.lineWidth = 1.6; ctx.strokeStyle = c.accent; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
    ell(ctx, 13, -3, 4.5, 4.5, c.main);
  },
  rook(ctx, c) {
    // shoulder rocket launcher
    rr(ctx, 8, -42, 17, 44, 7, '#3a4560');
    rr(ctx, 6, -45, 21, 11, 5, '#202840');
    ell(ctx, 16.5, -43, 6, 3, '#ffb02e', 1.4);
    rr(ctx, 12, -24, 9, 5, 2, c.accent, 1.2);
    chibi(ctx, c, { w: 15, headR: 10 });
    // big shoulder pad
    ell(ctx, -17, -2, 9, 8, c.light);
    ell(ctx, 17, -2, 8, 8, c.light);
    // helmet
    ctx.beginPath(); ctx.ellipse(0, -16, 11.5, 9.5, 0, Math.PI, 0); ctx.closePath(); fillStroke(ctx, c.dark);
    rr(ctx, -9, -17, 18, 5, 2.5, '#101828', 1.5);
    ctx.fillStyle = c.accent; ctx.fillRect(-7, -16, 14, 2.2);
    rr(ctx, -4, 3, 8, 8, 2, c.accent, 1.2);
    rr(ctx, -12, 12, 24, 4, 1, c.accent, 0);
  },
  patch(ctx, c) {
    chibi(ctx, c, { w: 10.5, headR: 11 });
    // white coat flaps + cross
    rr(ctx, -7, 0, 14, 12, 3, '#ffffff', 1.5);
    ctx.fillStyle = '#e53950';
    ctx.fillRect(-1.6, 2, 3.2, 8); ctx.fillRect(-4, 4.4, 8, 3.2);
    // cap
    ctx.beginPath(); ctx.ellipse(0, -18, 12, 8, 0, Math.PI, 0); ctx.closePath(); fillStroke(ctx, c.main);
    rr(ctx, -12, -19, 24, 4, 2, c.light, 1.5);
    ctx.fillStyle = '#fff'; ctx.fillRect(-1, -24, 2, 5); ctx.fillRect(-3, -22.5, 6, 2);
    eye(ctx, -4, -12, 2.4); eye(ctx, 4, -12, 2.4);
    // small sidearm
    rr(ctx, 11, -8, 11, 5, 2, '#46506a');
    rr(ctx, 18, -12, 4, 10, 1.5, '#2a3350');
  },
  pulse(ctx, c) {
    // backpack emitter glow
    glow(ctx, 0, 4, 22, c.glow, 0.35);
    chibi(ctx, c, { w: 10.5, headR: 10.5 });
    // raised gauntlet with orb
    rr(ctx, 9, -26, 7, 24, 3, c.dark);
    ell(ctx, 12.5, -30, 9, 9, '#10162a', 1.5);
    glow(ctx, 12.5, -30, 14, c.glow, 0.95);
    ell(ctx, 12.5, -30, 5, 5, '#ffffff', 0);
    // hair fins + visor
    poly(ctx, [[-10, -20], [-18, -30], [-6, -24]], c.accent, 1.5);
    poly(ctx, [[10, -20], [14, -34], [4, -25]], c.accent, 1.5);
    ctx.beginPath(); ctx.ellipse(0, -17, 11, 9, 0, Math.PI, 0); ctx.closePath(); fillStroke(ctx, c.main);
    rr(ctx, -9, -16, 18, 6, 3, '#0e1228', 1.5);
    ctx.fillStyle = c.glow; ctx.fillRect(-7, -14.5, 14, 2.4);
    // chest core
    ell(ctx, 0, 6, 3.5, 3.5, c.glow, 1.2);
  },
  specter(ctx, c) {
    // long rifle
    rr(ctx, 11, -50, 4, 56, 1.8, '#2b3446');
    rr(ctx, 9.5, -22, 7, 7, 2, '#4cc9f0', 1.2);
    rr(ctx, 12, -52, 2, 8, 1, '#111', 0);
    // cloak
    poly(ctx, [[-14, -6], [14, -6], [18, 30], [0, 24], [-18, 30]], c.dark);
    chibi(ctx, c, { w: 10, headR: 10 });
    poly(ctx, [[-11, 0], [11, 0], [13, 22], [-13, 22]], c.main, 1.6);
    // hood
    ctx.beginPath(); ctx.moveTo(-13, -10); ctx.quadraticCurveTo(-14, -30, 0, -29); ctx.quadraticCurveTo(14, -30, 13, -10); ctx.quadraticCurveTo(0, -4, -13, -10); fillStroke(ctx, c.main);
    ell(ctx, 0, -14, 8, 7, '#10131f', 1.2);
    glow(ctx, -3.5, -14, 5, c.accent, 1); glow(ctx, 3.5, -14, 5, c.accent, 1);
    ell(ctx, -3.5, -14, 1.7, 1.7, '#fff', 0); ell(ctx, 3.5, -14, 1.7, 1.7, '#fff', 0);
    ell(ctx, 13, -4, 4.5, 4.5, c.main);
  },
  ember(ctx, c) {
    // fuel tank on the back
    rr(ctx, -20, -8, 11, 24, 5, '#475069');
    rr(ctx, -19, -6, 9, 4, 2, '#ffb02e', 0);
    // flamethrower nozzle
    rr(ctx, 10, -32, 8, 30, 3, '#3b4358');
    rr(ctx, 8, -37, 12, 8, 3, '#222a3d');
    ctx.beginPath(); ctx.moveTo(14, -41); ctx.quadraticCurveTo(18, -46, 14, -53); ctx.quadraticCurveTo(10, -46, 14, -41); ctx.fillStyle = '#ffd23f'; ctx.fill();
    chibi(ctx, c, { w: 11.5, headR: 10.5 });
    rr(ctx, -9, 8, 18, 6, 3, c.accent, 1.2);
    // gas mask helmet
    ctx.beginPath(); ctx.ellipse(0, -16, 12, 11, 0, Math.PI, 0); ctx.closePath(); fillStroke(ctx, c.dark);
    rr(ctx, -9.5, -16, 19, 11, 5, '#1a1d2e', 1.5);
    glow(ctx, -4.5, -11, 5, c.glow, 1); glow(ctx, 4.5, -11, 5, c.glow, 1);
    ell(ctx, -4.5, -11, 2.3, 2.3, c.glow, 0); ell(ctx, 4.5, -11, 2.3, 2.3, c.glow, 0);
    rr(ctx, -3, -8, 6, 6, 2, c.main, 1.2);
    ell(ctx, 13, -2, 4.5, 4.5, c.main);
  },
};

export function heroSprite(id, skinId, scale) {
  const c = skinColors(id, skinId);
  return bake(`hero:${id}:${skinId}`, 72, 112, scale, (ctx) => { ctx.translate(0, 12); HERO_DRAW[id](ctx, c); });
}

/** Small support drone that follows Patch. */
export function droneSprite(skinId, scale) {
  const c = skinColors('patch', skinId);
  return bake(`drone:${skinId}`, 34, 28, scale, (ctx) => {
    ell(ctx, -11, -3, 8, 3.2, '#cfe8ff', 1.3);
    ell(ctx, 11, -3, 8, 3.2, '#cfe8ff', 1.3);
    ell(ctx, 0, 2, 9, 7.5, c.main);
    ell(ctx, 0, 2, 5.5, 4.5, '#10162a', 1.2);
    glow(ctx, 0, 2, 7, c.glow, 1);
    ell(ctx, 0, 2, 2.2, 2.2, '#fff', 0);
    rr(ctx, -1.5, 8, 3, 5, 1, '#46506a', 1);
  });
}

export function turretSprite(scale) {
  return bake('turret', 34, 34, scale, (ctx) => {
    rr(ctx, -12, 2, 24, 12, 4, '#4a5470');
    ell(ctx, 0, 0, 10, 9, '#6a7596');
    rr(ctx, -3, -16, 6, 16, 2, '#2b3446');
    rr(ctx, -4.5, -18, 9, 5, 2, '#ffb02e', 1.2);
    ell(ctx, 0, 0, 4, 4, '#ffd23f', 1.2);
  });
}

// ---------------------------------------------------------------- enemies
export const WORLD_PAL = [
  { skin: '#86a26b', dark: '#4a5f3c', accent: '#d2e59a', metal: '#b0694a', metalDark: '#6d3d2b', glow: '#ffcf5a' },
  { skin: '#3fc7c2', dark: '#1a6a74', accent: '#b9fff6', metal: '#8394c0', metalDark: '#454f78', glow: '#4cf0ff' },
  { skin: '#a05ad6', dark: '#56288a', accent: '#e0b3ff', metal: '#6bbf5a', metalDark: '#357a2b', glow: '#9bff6b' },
];

function legs(ctx, r, frame, col) {
  const s = frame ? 3 : -3;
  rr(ctx, -r * 0.55, r * 0.55 + s * 0.4, r * 0.45, r * 0.7, 3, col);
  rr(ctx, r * 0.1, r * 0.55 - s * 0.4, r * 0.45, r * 0.7, 3, col);
}

const ENEMY_DRAW = {
  grunt(ctx, p, r, f, w) {
    legs(ctx, r, f, p.dark);
    ell(ctx, -r * 0.95, r * 0.1 + (f ? 2 : -2), r * 0.3, r * 0.55, p.skin);
    ell(ctx, r * 0.95, r * 0.1 - (f ? 2 : -2), r * 0.3, r * 0.55, p.skin);
    if (w === 1) { // skitter drone: metal shell
      ell(ctx, 0, 0, r, r * 0.95, p.metal);
      ell(ctx, 0, -r * 0.1, r * 0.55, r * 0.5, '#10162a', 1.5);
      glow(ctx, 0, -r * 0.1, r * 0.5, p.glow, 1); ell(ctx, 0, -r * 0.1, r * 0.2, r * 0.2, '#fff', 0);
      return;
    }
    ell(ctx, 0, 0, r, r * 0.95, p.skin);
    if (w === 0) { rr(ctx, -r * 0.8, r * 0.1, r * 1.6, r * 0.55, 3, p.metalDark, 1.5); ctx.fillStyle = p.dark; ctx.fillRect(-r * 0.3, -r * 0.9, r * 0.15, r * 0.5); }
    else { ell(ctx, -r * 0.35, r * 0.25, r * 0.22, r * 0.22, p.accent, 0); ell(ctx, r * 0.4, -r * 0.4, r * 0.18, r * 0.18, p.accent, 0); }
    eye(ctx, -r * 0.35, -r * 0.25, r * 0.28, p.glow === '#ffcf5a' ? '#b32020' : '#2a1a40');
    eye(ctx, r * 0.35, -r * 0.25, r * 0.28, p.glow === '#ffcf5a' ? '#b32020' : '#2a1a40');
    ctx.beginPath(); ctx.moveTo(-r * 0.35, r * 0.25); ctx.lineTo(r * 0.35, r * 0.25); ctx.lineWidth = 1.8; ctx.strokeStyle = OL; ctx.stroke();
  },
  runner(ctx, p, r, f, w) {
    legs(ctx, r * 1.2, f, p.dark);
    poly(ctx, [[0, -r * 1.5], [r * 0.9, r * 0.9], [0, r * 0.5], [-r * 0.9, r * 0.9]], w === 1 ? p.metal : p.skin);
    poly(ctx, [[0, -r * 1.9], [r * 0.35, -r * 0.6], [-r * 0.35, -r * 0.6]], p.accent, 1.5);
    eye(ctx, -r * 0.3, -r * 0.35, r * 0.28, '#b32020'); eye(ctx, r * 0.3, -r * 0.35, r * 0.28, '#b32020');
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.5;
    for (const x of [-r * 0.7, r * 0.7]) { ctx.beginPath(); ctx.moveTo(x, -r * 0.1); ctx.lineTo(x, -r * 1.2); ctx.stroke(); }
  },
  bulwark(ctx, p, r, f, w) {
    legs(ctx, r, f, p.metalDark);
    rr(ctx, -r * 1.05, -r * 0.75, r * 2.1, r * 1.8, r * 0.35, p.metal);
    rr(ctx, -r * 0.95, -r * 0.1, r * 1.9, r * 0.5, 3, p.metalDark, 1.5);
    for (const x of [-0.65, 0, 0.65]) { ell(ctx, r * x, r * 0.15, 2.4, 2.4, '#ddd', 1); }
    rr(ctx, -r * 1.35, -r * 0.9, r * 0.6, r * 0.9, 5, p.metalDark);
    rr(ctx, r * 0.75, -r * 0.9, r * 0.6, r * 0.9, 5, p.metalDark);
    ell(ctx, 0, -r * 0.95, r * 0.5, r * 0.45, p.skin);
    rr(ctx, -r * 0.4, -r * 1.05, r * 0.8, r * 0.28, 3, '#10162a', 1.2);
    ctx.fillStyle = p.glow; ctx.fillRect(-r * 0.3, -r * 0.97, r * 0.6, 2.2);
  },
  sentinel(ctx, p, r, f, w) {
    glow(ctx, 0, 0, r * 1.7, p.glow, 0.28);
    ell(ctx, 0, 0, r * 1.15, r * 0.4, p.metalDark, 1.5);
    ell(ctx, 0, 0, r * 0.95, r * 0.95, p.metal);
    ell(ctx, 0, 0, r * 0.6, r * 0.6, '#10162a', 1.5);
    glow(ctx, 0, 0, r * 0.55, p.glow, 1);
    ell(ctx, 0, 0, r * 0.25, r * 0.25, '#fff', 0);
    ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, -r * 1.5); ctx.lineWidth = 2; ctx.strokeStyle = OL; ctx.stroke();
    ell(ctx, 0, -r * 1.55, 2.6, 2.6, p.glow, 1.2);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.2, r * 0.42, 0, 0, Math.PI * 2); ctx.lineWidth = 1.6; ctx.strokeStyle = p.accent; ctx.stroke();
  },
  spitter(ctx, p, r, f, w) {
    legs(ctx, r, f, p.dark);
    ell(ctx, 0, 0, r * 0.95, r, w === 1 ? p.metal : p.skin);
    rr(ctx, -r * 0.35, r * 0.1, r * 0.7, r * 1.1, 4, p.metalDark);
    ell(ctx, 0, r * 1.2, r * 0.42, r * 0.28, p.glow, 1.5);
    ell(ctx, 0, r * 1.2, r * 0.2, r * 0.13, '#fff', 0);
    eye(ctx, -r * 0.4, -r * 0.35, r * 0.27, '#a01a1a'); eye(ctx, r * 0.4, -r * 0.35, r * 0.27, '#a01a1a');
    ell(ctx, -r * 0.2, -r * 0.9, 2.4, 2.4, p.accent, 0); ell(ctx, r * 0.45, -r * 0.8, 2, 2, p.accent, 0);
  },
  drone(ctx, p, r, f, w) {
    const wy = f ? -3 : 3;
    ell(ctx, -r * 1.2, wy, r * 0.9, r * 0.34, p.accent, 1.5);
    ell(ctx, r * 1.2, wy, r * 0.9, r * 0.34, p.accent, 1.5);
    ell(ctx, 0, 0, r, r * 0.9, p.metal);
    rr(ctx, -r * 0.7, r * 0.2, r * 1.4, r * 0.4, 3, p.metalDark, 1.2);
    glow(ctx, 0, -r * 0.15, r * 0.65, '#ff3d3d', 0.9);
    ell(ctx, 0, -r * 0.15, r * 0.34, r * 0.34, '#ff5a5a', 1.4);
    ell(ctx, 0, -r * 0.15, r * 0.14, r * 0.14, '#fff', 0);
    rr(ctx, -2, r * 0.8, 4, r * 0.5, 1.5, '#333');
  },
  splitter(ctx, p, r, f, w) {
    legs(ctx, r * 0.9, f, p.dark);
    ell(ctx, 0, 0, r * 1.05, r, p.skin);
    ell(ctx, -r * 0.4, r * 0.2, r * 0.42, r * 0.38, shade(p.skin, 0.12), 1.2);
    ell(ctx, r * 0.4, r * 0.3, r * 0.38, r * 0.34, shade(p.skin, 0.12), 1.2);
    ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, r * 0.95); ctx.lineWidth = 1.6; ctx.strokeStyle = p.dark; ctx.stroke();
    eye(ctx, -r * 0.4, -r * 0.4, r * 0.26, '#2a1a40'); eye(ctx, r * 0.4, -r * 0.4, r * 0.26, '#2a1a40');
    ell(ctx, r * 0.55, -r * 0.8, 3, 3, p.accent, 0);
  },
  slimeling(ctx, p, r, f, w) {
    const sq = f ? 1 : -1;
    ctx.beginPath(); ctx.ellipse(0, r * 0.2, r * (1.1 + sq * 0.08), r * (0.8 - sq * 0.06), 0, 0, 7); fillStroke(ctx, p.skin);
    ell(ctx, -r * 0.3, -r * 0.1, r * 0.3, r * 0.3, '#fff', 1);
    ell(ctx, r * 0.3, -r * 0.1, r * 0.3, r * 0.3, '#fff', 1);
    ell(ctx, -r * 0.25, -r * 0.05, r * 0.14, r * 0.14, '#111', 0); ell(ctx, r * 0.35, -r * 0.05, r * 0.14, r * 0.14, '#111', 0);
    ell(ctx, -r * 0.5, r * 0.5, r * 0.15, r * 0.1, p.accent, 0);
  },
};

export function enemySprite(type, world, frame, r, scale) {
  const size = Math.ceil(r * 2 + 28);
  const p = WORLD_PAL[world % 3];
  return bake(`en:${type}:${world}:${frame}:${r}`, size, size, scale, (ctx) => ENEMY_DRAW[type](ctx, p, r, frame, world % 3));
}

// ---------------------------------------------------------------- bosses
const BOSS_DRAW = {
  colossus(ctx, p, r, exposed) {
    // legs
    rr(ctx, -r * 0.95, r * 0.35, r * 0.5, r * 0.75, 6, '#4a3a38');
    rr(ctx, r * 0.45, r * 0.35, r * 0.5, r * 0.75, 6, '#4a3a38');
    rr(ctx, -r * 1.05, r * 0.95, r * 0.7, r * 0.25, 4, '#2d2423');
    rr(ctx, r * 0.35, r * 0.95, r * 0.7, r * 0.25, 4, '#2d2423');
    // shoulder cannons
    rr(ctx, -r * 1.35, -r * 0.7, r * 0.55, r * 1.1, 8, '#6d3d2b');
    rr(ctx, r * 0.8, -r * 0.7, r * 0.55, r * 1.1, 8, '#6d3d2b');
    rr(ctx, -r * 1.2, r * 0.2, r * 0.25, r * 0.7, 3, '#222');
    rr(ctx, r * 0.95, r * 0.2, r * 0.25, r * 0.7, 3, '#222');
    // hull
    rr(ctx, -r * 0.95, -r * 0.8, r * 1.9, r * 1.55, r * 0.28, '#b0694a');
    rr(ctx, -r * 0.85, -r * 0.7, r * 1.7, r * 0.45, 6, '#c98462', 0);
    for (const [x, y] of [[-0.7, -0.55], [0.7, -0.55], [-0.7, 0.55], [0.7, 0.55]]) ell(ctx, r * x, r * y, 3.2, 3.2, '#ddd', 1);
    // hazard stripe
    ctx.save(); ctx.beginPath(); ctx.roundRect(-r * 0.95, r * 0.4, r * 1.9, r * 0.25, 3); ctx.clip();
    for (let i = -8; i < 10; i++) { ctx.fillStyle = i % 2 ? '#ffd23f' : '#222'; ctx.beginPath(); ctx.moveTo(i * 14, r * 0.4); ctx.lineTo(i * 14 + 14, r * 0.4); ctx.lineTo(i * 14 + 4, r * 0.65); ctx.lineTo(i * 14 - 10, r * 0.65); ctx.fill(); }
    ctx.restore();
    // head
    rr(ctx, -r * 0.42, -r * 1.25, r * 0.84, r * 0.6, 8, '#8a4f38');
    rr(ctx, -r * 0.33, -r * 1.12, r * 0.66, r * 0.22, 5, '#10162a', 1.2);
    ctx.fillStyle = '#ff4040'; ctx.fillRect(-r * 0.27, -r * 1.06, r * 0.54, 3);
    // reactor core
    const core = exposed ? '#ffffff' : '#ff8a2e';
    glow(ctx, 0, -r * 0.1, r * (exposed ? 1.1 : 0.7), exposed ? '#9be3ff' : '#ff8a2e', exposed ? 1 : 0.7);
    ell(ctx, 0, -r * 0.1, r * 0.3, r * 0.3, '#251a1a', 1.8);
    ell(ctx, 0, -r * 0.1, r * 0.2, r * 0.2, core, 0);
  },
  leviathan(ctx, p, r, exposed) {
    // fins
    poly(ctx, [[-r * 1.5, -r * 0.1], [-r * 0.7, -r * 0.5], [-r * 0.7, r * 0.5]], '#454f78');
    poly(ctx, [[r * 1.5, -r * 0.1], [r * 0.7, -r * 0.5], [r * 0.7, r * 0.5]], '#454f78');
    poly(ctx, [[0, r * 1.3], [-r * 0.5, r * 0.5], [r * 0.5, r * 0.5]], '#2b3254');
    // hull
    ell(ctx, 0, 0, r * 1.05, r * 0.95, '#6a7bb0');
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.95, 0, 0, 7); ctx.clip();
    ctx.fillStyle = '#8fa2d8'; ctx.fillRect(-r * 1.2, -r, r * 2.4, r * 0.5);
    ctx.fillStyle = '#4a5788'; ctx.fillRect(-r * 1.2, r * 0.35, r * 2.4, r);
    for (let i = -3; i <= 3; i++) { ctx.fillStyle = '#4cf0ff'; ctx.fillRect(i * r * 0.3 - 1.5, -r * 0.1, 3, r * 0.3); }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.95, 0, 0, 7); ctx.lineWidth = 2.2; ctx.strokeStyle = OL; ctx.stroke();
    // eye
    glow(ctx, 0, -r * 0.3, r * (exposed ? 1.1 : 0.75), exposed ? '#ffffff' : '#c066ff', 1);
    ell(ctx, 0, -r * 0.3, r * 0.34, r * 0.34, '#120a24', 1.8);
    ell(ctx, 0, -r * 0.3, r * 0.2, r * 0.2, exposed ? '#fff' : '#e3a6ff', 0);
    // beam emitters
    for (const x of [-0.7, 0.7]) { rr(ctx, r * x - 5, r * 0.45, 10, 18, 4, '#2b3254'); ell(ctx, r * x, r * 0.45 + 18, 5, 3, '#4cf0ff', 1.2); }
  },
  broodmother(ctx, p, r, exposed) {
    // legs
    for (const s of [-1, 1]) for (const k of [0, 1, 2]) {
      ctx.beginPath(); ctx.moveTo(s * r * 0.6, -r * 0.2 + k * r * 0.3); ctx.quadraticCurveTo(s * r * 1.5, -r * 0.5 + k * r * 0.5, s * r * 1.3, r * 0.5 + k * r * 0.35);
      ctx.lineWidth = 7; ctx.strokeStyle = OL; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = '#5a2a8a'; ctx.stroke();
    }
    // abdomen with egg sacs
    ell(ctx, 0, r * 0.35, r * 0.95, r * 0.8, '#7b3fb8');
    for (const [x, y, s] of [[-0.45, 0.5, 0.3], [0.4, 0.6, 0.28], [0, 0.85, 0.24], [-0.1, 0.25, 0.22]]) { ell(ctx, r * x, r * y, r * s, r * s * 0.9, '#9bff6b', 1.4); ell(ctx, r * x - 3, r * y - 3, r * s * 0.3, r * s * 0.3, 'rgba(255,255,255,.7)', 0); }
    // thorax + head
    ell(ctx, 0, -r * 0.35, r * 0.8, r * 0.7, '#a05ad6');
    ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.8); for (let i = 0; i < 5; i++) { ctx.lineTo(-r * 0.6 + i * r * 0.3 + r * 0.15, -r * 1.25); ctx.lineTo(-r * 0.6 + (i + 1) * r * 0.3, -r * 0.8); } ctx.closePath(); fillStroke(ctx, '#e0b3ff');
    // mouth
    ell(ctx, 0, -r * 0.1, r * 0.5, r * 0.34, '#2a0a3a', 1.8);
    for (let i = -2; i <= 2; i++) poly(ctx, [[i * r * 0.18 - 3, -r * 0.3], [i * r * 0.18 + 3, -r * 0.3], [i * r * 0.18, -r * 0.1]], '#fff', 1);
    for (const x of [-0.42, 0.42]) { glow(ctx, r * x, -r * 0.6, r * 0.34, exposed ? '#fff' : '#9bff6b', 1); ell(ctx, r * x, -r * 0.6, r * 0.2, r * 0.2, '#10162a', 1.5); ell(ctx, r * x, -r * 0.6, r * 0.09, r * 0.09, exposed ? '#fff' : '#9bff6b', 0); }
  },
};

export function bossSprite(id, exposed, r, scale) {
  const size = Math.ceil(r * 3.4);
  return bake(`boss:${id}:${exposed ? 1 : 0}:${r}`, size, size, scale, (ctx) => BOSS_DRAW[id](ctx, null, r, exposed));
}

// ---------------------------------------------------------------- portraits for the DOM UI
const portraits = new Map();
export function heroPortrait(id, skinId = 'default', size = 96) {
  const key = `${id}:${skinId}:${size}`;
  if (portraits.has(key)) return portraits.get(key);
  const c = skinColors(id, skinId);
  const cv = makeCanvas(size * 2, size * 2);
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size, size * 1.1, 4, size, size, size * 1.1);
  g.addColorStop(0, shade(c.main, 0.0) + 'aa');
  g.addColorStop(1, '#0d1226');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size * 2, size * 2);
  const s = heroSprite(id, skinId, 3);
  const k = (size * 2) / 98;
  ctx.drawImage(s, size - (s.lw * k) / 2, size * 2 * 0.5 - (s.lh * k) / 2 - 4, s.lw * k, s.lh * k);
  const url = cv.toDataURL ? cv.toDataURL('image/png') : '';
  portraits.set(key, url);
  return url;
}
export function enemyPortrait(type, world = 0, size = 64) {
  const key = `en:${type}:${world}:${size}`;
  if (portraits.has(key)) return portraits.get(key);
  const cv = makeCanvas(size * 2, size * 2);
  const ctx = cv.getContext('2d');
  const r = 14;
  const s = enemySprite(type, world, 0, r, 4);
  const k = (size * 2) / (s.lw * 1.05);
  ctx.drawImage(s, size - (s.lw * k) / 2, size - (s.lh * k) / 2, s.lw * k, s.lh * k);
  const url = cv.toDataURL('image/png');
  portraits.set(key, url);
  return url;
}
export function bossPortrait(id, size = 80) {
  const key = `boss:${id}:${size}`;
  if (portraits.has(key)) return portraits.get(key);
  const cv = makeCanvas(size * 2, size * 2);
  const ctx = cv.getContext('2d');
  const s = bossSprite(id, false, 44, 3);
  const k = (size * 2) / s.lw;
  ctx.drawImage(s, 0, size - (s.lh * k) / 2, s.lw * k, s.lh * k);
  const url = cv.toDataURL('image/png');
  portraits.set(key, url);
  return url;
}

export { HEROES };
