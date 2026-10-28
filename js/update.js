// Auto-update (required behaviour): every time the game opens it asks the network for the newest build id.
// If it differs from the build that is running, the new service worker is installed, activated and the page
// reloads into it - before the player reaches the menu. Offline? It silently continues with the cached build.
//
//  version.json  - tiny file, always fetched with cache: 'no-store' (the service worker never caches it)
//  sw.js         - byte-different on every release, so browsers install a new worker; it pre-caches the new files
//
// Safety: a per-session guard prevents reload loops if a deploy is half-finished or a proxy serves stale files.

import { BUILD } from './version.js';
import { store } from './store.js';

const GUARD = 'bh-update-attempt';
let reg = null;
let swReady = false;

export const currentBuild = () => BUILD;

function session(k, v) {
  try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch { /* storage blocked */ }
  return null;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    reg = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    swReady = true;
  } catch (e) {
    console.warn('[pwa] service worker registration failed', e);
  }
  return reg;
}

async function fetchRemoteBuild(timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store', signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return String(j.version);
  } finally { clearTimeout(timer); }
}

/** Wipe every cache + registration and reload with a cache-busting URL (last resort). */
async function hardReload(remote) {
  try {
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
    if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  } catch { /* best effort */ }
  store.save(true);
  location.replace(`${location.pathname}?v=${encodeURIComponent(remote)}`);
}

/** Resolve when the page is controlled by a different (newer) service worker, or after `ms`. */
function waitForControllerChange(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); resolve(true); }, { once: true });
  });
}

/**
 * Check for a newer build and apply it.
 * @returns 'current' | 'updating' | 'offline' | 'skipped'
 */
export async function checkForUpdate({ timeoutMs = 4500, onStatus = () => {} } = {}) {
  let remote;
  try {
    remote = await fetchRemoteBuild(timeoutMs);
  } catch {
    onStatus('Offline - using the installed version');
    return 'offline';
  }
  if (remote === BUILD) {
    if (reg) reg.update().catch(() => {}); // keep the worker fresh for next time
    session(GUARD, '');
    return 'current';
  }
  if (session(GUARD) === remote) {
    console.warn('[pwa] already tried to update to', remote, 'this session - not retrying');
    return 'skipped';
  }
  session(GUARD, remote);
  onStatus('New version found - updating…');
  store.save(true);
  if (!('serviceWorker' in navigator) || !swReady) { await hardReload(remote); return 'updating'; }
  // The new worker calls skipWaiting() + clients.claim(), so a successful install fires `controllerchange`.
  const changed = waitForControllerChange(12000);
  try { await reg.update(); } catch { /* network flake: fall through to timeout path */ }
  onStatus('Installing update…');
  if (await changed) { store.save(true); location.reload(); return 'updating'; }
  // The worker never took over (blocked, or stale proxy): force a clean slate.
  await hardReload(remote);
  return 'updating';
}

/** Re-check when the app returns to the foreground; `canReload` lets combat defer the reload. */
export function watchForUpdates(canReload) {
  let last = Date.now();
  const run = async () => {
    if (!canReload() || Date.now() - last < 60_000) return;
    last = Date.now();
    await checkForUpdate({ timeoutMs: 4000 });
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
  setInterval(run, 15 * 60_000);
}
