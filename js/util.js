// Small shared helpers (no DOM access - safe to import from the headless simulation).

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

/** Squared distance from point P to segment AB. */
export function pointSegDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx, cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/** Mulberry32 seeded RNG - deterministic simulation (GDD 13.3). */
export class RNG {
  constructor(seed = 1) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

export function fmt(n) {
  n = Math.round(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
  return String(n);
}
export const fmtFull = (n) => Math.round(n).toLocaleString('en-US');
export const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';

/** Simple object pool with swap-remove iteration (GDD 13.3: avoid unbounded allocation). */
export class Pool {
  constructor(factory) { this.factory = factory; this.items = []; this.free = []; }
  spawn() {
    const o = this.free.pop() || this.factory();
    o.dead = false;
    this.items.push(o);
    return o;
  }
  /** Remove every item flagged dead. Call once per tick after updating. */
  sweep(onRelease) {
    const a = this.items;
    for (let i = a.length - 1; i >= 0; i--) {
      if (a[i].dead) {
        const o = a[i];
        a[i] = a[a.length - 1];
        a.pop();
        if (onRelease) onRelease(o);
        this.free.push(o);
      }
    }
  }
  clear() { for (const o of this.items) this.free.push(o); this.items.length = 0; }
}
