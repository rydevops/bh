# Bullet Heroes

A squad shooter / tower-defense RPG that runs in the browser as an installable **PWA**, built from the
*Bullet Heroes – Game Design Document* (v1.0). **No ads. No real-money purchases. No accounts, no trackers.**
Everything is drawn and synthesised in code — there are no image or audio assets to download.

Plays offline once opened, and **updates itself every time you launch it**.

## Play

Hosted on GitHub Pages (see [Deploying](#deploying-to-github-pages)). On a phone:

- **iPhone:** Safari → Share → *Add to Home Screen*
- **Android:** Chrome menu → *Install app*

Locally: `npm run serve` → <http://localhost:8080>

### How to play

- Every stage is **12 rounds**, and the opening rounds are gentle: each battle starts with **just your lead hero** (squad slot 1). After a round, the reward cards may include a gold **Summon** card that calls the next squad member into the fight. It is **random** (50% per reward round) but you never go two reward rounds in a row without one. You choose the join order in the Squad screen.
- **Ammo / the revolver:** heroes don't have unlimited bullets. A revolver's **slicer** cuts bullets from its cylinder into the **ammo pile** (bottom of the screen), and every hero shot takes bullets from that pile. If the pile runs dry, heroes **wait for the slicer**. It starts at **1 bullet per cut**; *Slicer Chambers* upgrades raise this up to **6**, *Quick Slicer* speeds the cycle and *Deep Pile* raises capacity. Each hero fires **one bullet per shot** by default, up to **5** with *Multi-Shot* upgrades (each extra bullet costs ammo). Cutting enemy bullets with a swipe **recycles them into the pile**.
- **2× speed** is locked until you have cleared that stage once.
- Heroes defend a wall at the bottom of the screen and **fire automatically** (as long as there is ammo).
- **Swipe across enemy bullets to cut them** out of the air (limited by the CUT meter). Heavy bombs need several cuts.
- **Tap a hero portrait** (or keys `1`–`4`) to use their ability. Cutting bullets charges abilities.
- After each wave, **pick 1 of 3 upgrades** (skills, firepower, ammunition, defense, utility). Upgrades last for the run.
- **Settings** (gear icon on every main screen) has audio, accessibility, save backup, update check and **Reset all progress** (double-confirmed; keeps your sound/accessibility settings).
- Win stages to earn coins, hero fragments, gems and research tokens. Level up and rank up heroes, buy research, collect cosmetics.
- Bosses telegraph their attacks, change phase as they are damaged, and have a **vulnerability window** after big attacks.

## Auto-update (how it works)

Every launch the splash screen asks the network for `version.json` (`cache: 'no-store'`, never cached by the service worker)
and compares it with the build that is running (`js/version.js`).

1. **Same build** → continue to the game.
2. **Different build** → `registration.update()` installs the new service worker, which pre-caches the new files
   (bypassing the HTTP cache), calls `skipWaiting()` + `clients.claim()`, and deletes the old cache. The page then
   reloads into the new version — before the player reaches the menu.
3. **Offline / server unreachable** → silently runs the installed build.
4. **Safety nets:** if the new worker never takes over within 12 s the app clears all caches, unregisters, and reloads with a
   cache-busting URL; a per-session guard stops reload loops. The app also re-checks when it returns to the foreground
   (menus only — never mid-battle) and saves progress before every reload.

The build id is a **content hash of every shipped file** (`tools/stamp.mjs`), so any change to the game produces a new id
automatically. CI re-stamps on deploy, and the committed stamp is verified in tests (`npm run stamp:check`).

## Deploying to GitHub Pages

1. Repo **Settings → Pages → Build and deployment → Source: _GitHub Actions_**.
2. Merge to `main`. `.github/workflows/pages.yml` runs the tests, runs `tools/build.mjs` (stamp + copy shipped files to `dist/`) and deploys.

All URLs are relative, so it works under `https://<user>.github.io/<repo>/`.

## Development

Requires Node 22+. No dependencies, no bundler — the game is plain ES modules.

| Command | What it does |
| --- | --- |
| `npm run serve` | Static server on :8080 |
| `npm test` | 56 unit/integration tests (simulation, economy, saves, PWA invariants) |
| `npm run e2e` | Real-browser tests: every screen, summon flow, settings and reset, and the auto-update flow (needs Playwright) |
| `npm run balance` | Headless bot plays every stage and prints win rates (`LVMUL=0.7 npm run balance` to test under-levelled squads) |
| `npm run stamp` | Re-stamp `sw.js`, `js/version.js`, `version.json` (run after changing shipped files) |
| `npm run icons` | Regenerate app icons with headless Chromium (uses the game's own sprites) |
| `npm run build` | Produce `dist/` for deployment |

### Layout

```
index.html, manifest.webmanifest, sw.js, version.json   PWA shell
js/data/       heroes, enemies+bosses, upgrades, stages (data-driven), research, missions
js/sim/        headless combat simulation (no DOM): game.js, bosses.js, damage.js
js/render/     canvas renderer, procedural sprites + backgrounds, particles
js/audio/      WebAudio SFX synth + generative music sequencer
js/ui/         screens (home, heroes, stages, squad, results, meta, settings) + combat controller/HUD
js/            save.js (versioned, checksummed, backup), economy.js, progression.js, update.js, store.js
tools/         stamp/build/serve, balance bot, icon generator, dev pages
tests/         node:test suites
```

## Design-document coverage

| GDD | Implemented |
| --- | --- |
| §3 loop, §4 combat | Auto-targeting (closest to wall, overkill avoidance, stable retargeting), pooled projectiles with pierce/splash/crit/elements, formula `Attack × Skill × Crit × Resistance`, shields + armor + armor-piercing, pause on interruption, checkpoint/resume |
| §4.4 bullet cutting | Swipe-to-cut enemy projectiles with a regenerating CUT meter; bombs need multiple cuts. *(The GDD asks that the exact mechanic be verified against the reference game — this is one of its listed alternatives.)* |
| §3/§5 summon format | Battles deploy only the lead hero; the rest of the squad is summoned by *random* reward cards (50% per reward round, with a pity rule: never two rounds in a row without one) |
| §7.3 ammunition model | Revolver + slicer + ammo pile (see How to play): shared limited ammo, 1→6 bullets per cut via upgrades, 1→5 bullets per shot via upgrades |
| §9 stage structure | 12 rounds per stage. Each round's enemy budget is derived from the damage a typical player's hero can deal in that round's time window × a smooth round curve × a gentle stage ramp (`buildWaves`, `TUNE` in `js/data/enemies.js`), so counts stay sane while enemy health scales |
| §5 heroes | Vanguard, Rook, Pulse, Patch from the GDD **+ Specter and Ember** (6 total), each with an active ability, passive, 4 rank perks, skins; 3 squad slots → 4 after stage 2-2; no duplicates; saved presets; strengths/gaps analysis |
| §6 enemies | Grunt, Runner, Bulwark, Sentinel (+ Spitter, Drone, Splitter, Slimeling = 8 archetypes) and 3 world bosses with phases, telegraphs and vulnerability windows; `Health(stage) = Base × (1 + α·stage)` |
| §7 upgrades | 27 in-run cards across skill / firepower / ammunition / defense / utility, weighted by squad tags, owned tags, enemy mix, rarity and caps; rerolls |
| §8 modes | Campaign (MVP), **Survival** (unlocks after 2-4), Hard difficulty (after 3-4). Boss Rush and competitive modes are post-MVP in the GDD and are not included |
| §9 worlds | Wasteland / Orbital Frontier / Monster Realm × 4 stages (12 total), stage modifiers, data-driven waves |
| §10 economy | Coins, hero fragments, research tokens, gems — **all earned in play**; first-clear bonuses, partial rewards on defeat, rank/level caps, research tree, milestones |
| §11 UI/UX | Portrait-first, safe-area aware, one-handed bottom navigation, text scaling, high contrast, reduced shake/flash, damage-type icons (not colour alone), independent music/SFX/haptics |
| §12 art/audio | Procedural 2.5D-style sprites with outlines, animated particles/telegraphs; synthesised SFX with voice limiting + music ducking; 5 generative tracks |
| §13 tech | Simulation separated from presentation, seeded deterministic RNG, object pooling, adaptive VFX budget, versioned save with migration + backup, offline-first |
| §14 monetization | **Intentionally none.** The Shop is a cosmetic *Wardrobe* bought with earned gems. No ads, IAP, rewarded video, or season pass |
| §15 analytics | **Intentionally local-only.** Stats (kills, cuts, runs…) stay on the device; nothing is sent anywhere |

### Deliberate deviations

- **PWA instead of Unity/iOS native** (per the brief). Game Center, StoreKit, iCloud and Core Haptics are replaced by: local saves
  with export/import backup, `navigator.vibrate` (Android; iOS Safari ignores it), and no purchases.
- Original placeholder characters and art, as the GDD recommends — no assets from the reference game.
- Balance numbers are tuned with the headless bot (`tools/balance.mjs`), not with real players. Treat them as a starting point.
