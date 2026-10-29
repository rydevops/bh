# Bullet Heroes

A squad shooter / tower-defense RPG that runs in the browser as an installable **PWA**, built from the
*Bullet Heroes – Game Design Document* (v1.0). **No ads. No real-money purchases. No accounts, no trackers.**
Everything is drawn and synthesised in code — there are no image or audio assets to download.

Plays offline once opened, and **updates itself every time you launch it**.

## Play

Hosted on GitHub Pages (see [Deploying](#deploying-to-github-pages)). On a phone:

- **iPhone:** Safari → Share → *Add to Home Screen*
- **Android:** Chrome menu → *Install app*

> **iOS 26 note:** iOS 26 draws a soft system blur ("scroll edge effect") under the status bar of installed web apps. The game covers that area with a solid, colour-matched strip (`#edge`, follows the current world's sky) and uses the `black` status-bar style. The status-bar style is read when the app is added, so **remove the app from the Home Screen and add it again once** after this update.

Locally: `npm run serve` → <http://localhost:8080>

### How to play

- Every stage is **12 rounds**, and the opening rounds are gentle: each battle starts with **just one hero, which you pick every time you start** ("Start with" on the stage screen, or a quick "who starts?" prompt from Home > Battle, Survive, Next and Retry; resuming a saved battle keeps its hero). After a round, the reward cards may include a gold **Summon** card that calls another squad member into the fight. Both the timing and **which hero** turn up are **random** (50% per reward round, never two reward rounds in a row without one).
- **Ammo / the revolver:** heroes don't have unlimited bullets. The revolver sits under your squad with six chambers. A **clock-hand slicer** sweeps around it (once every 1.2s), and **every loaded chamber it passes drops one bullet onto the ammo pile**. Every hero shot takes a bullet from the pile; if the pile is empty heroes **wait for the hand** (they show a red marker). You start with **one loaded chamber**; *Slicer Chambers* upgrades load more (up to **6**), *Quick Slicer* makes the hand sweep faster and *Deep Pile* raises capacity. Swiping across enemy bullets **recycles them into the pile**.
- **Reload bars:** every hero has a reload time and a **progress bar under their feet** showing when the next shot fires (white = ready, red = out of ammo). Beam and flame heroes fire a short burst per bullet, then reload. *Quick Reload* (2 levels) cuts every hero's reload by 20% each.
- Each hero fires **one bullet per shot** by default. **Multi-Shot is per hero**: every hero on the field has their own Multi-Shot card (shown with their portrait) and their own levels, so taking it makes just that one hero fire up to **5** bullets in a **sequence**: the extra bullets leave one after another, each aimed fresh, **without waiting for the reload gauge** (the gauge starts refilling once the last bullet is away). Every bullet uses one ammo. Beam and flame heroes chain extra bursts the same way.
- Enemies **come in from behind the HUD bars** (wave counter and wall bar): until they have walked past them they fade in, can't be hit by anyone (heroes, beams, splash, turrets) and don't shoot. The line is measured from the real on-screen layout, so it is right on every phone.
- **Rewards:** every wave ends with a reward pick (Survival too). **Every card has exactly the same chance of being offered**: no rarity weighting, no synergy or enemy bonuses, no guaranteed slots. A card is skipped only if it is maxed out, missing a prerequisite (e.g. turret upgrades need an Auxiliary Turret), or belongs to a hero who isn't on the field yet. Bullet upgrades **change how your bullets look**: Heavy Rounds make them fatter, Hypervelocity gives longer streaks, Cryo tints them icy, Explosive gives them a fiery head, Armor-Piercing a golden core.
- **Survival loops:** the three worlds take 10 waves each. After a full sweep (wave 30) the worlds start over and **every enemy stat is multiplied by 1.2 for each completed sweep** (×1.2, then ×1.44, ×1.73…): health, shields, damage, speed, armor, how fast they shoot and how fast their bullets fly, bosses included. The wave label shows the current multiplier and a "WORLDS RESET" banner announces each new sweep.
- A thin **wave bar** under the wave counter shows how many enemies of the current wave are still to come or alive, and drains as you clear them.
- **2× speed** is locked until you have cleared that stage once.
- The **title screen** is an animated diorama that cycles through the three worlds (drifting clouds, crows, patrolling drones, searchlights, floating spores) while your squad shoots at enemies marching toward the wall. It shows a single still frame if you enable *Reduce flashing* or your device asks for reduced motion.
- The **battlefield uses the same living scenery as the title screen**: gradient sky, sun / planet / moon, drifting clouds, parallax skylines, crows, patrol drones with searchlights and glowing spores. Enemies march out of the horizon haze, and the HUD sits in the sky, clear of the status bar.
- Heroes defend a wall at the bottom of the screen and **fire automatically** (as long as there is ammo).
- **CUT:** swipe a finger across an enemy bullet to slice it out of the air before it hits the wall. Each slice costs 5 energy from the **CUT bar** (bottom of the battle screen, it slowly refills); heavy bombs need several cuts; every bullet you fully cut drops into your ammo pile and charges your abilities. Research can enlarge the bar, refill it faster and make slices cheaper.
- **Tap a hero portrait** (or keys `1`–`4`) to use their ability. Cutting bullets charges abilities.
- After each wave, **pick 1 of 3 upgrades** (skills, firepower, ammunition, defense, utility). Upgrades last for the run.
- **Settings** (gear icon on every main screen) has audio, accessibility, save backup, update check and **Reset all progress** (double-confirmed; keeps your sound/accessibility settings).
- **First run (and after a reset): a guided tutorial round** on a forgiving wall explains the wall, waves, reload bars, the revolver ammo, CUT, abilities and reward cards, then tours stages, heroes, research, missions and the wardrobe. Every card has a **Skip tutorial** button that goes straight to the main menu. It gives no rewards and only shows once.
- **Every stage pays research tokens**, more the further you get (1 on stage 1-1 up to 6 for the last boss). A first clear pays the full amount; a replay pays half, rounded up, never less than 1. Defeats pay none.
- Win stages to earn coins, hero fragments, gems and research tokens. **Every stage drops fragments for all three starting heroes** (Vanguard, Rook, Patch) so each can be ranked up from the very first stage, and even a lost run gives each of them one. Survival pays starter fragments too. Pulse, Specter and Ember (recruited with fragments) keep their own drops. Level up and rank up heroes, buy research, collect cosmetics.
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
| `npm test` | 63 unit/integration tests (simulation, economy, saves, PWA invariants) |
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
art/, art_desc/  sprite sheets (shipped) and the artist briefs (not shipped)
tools/         stamp/build/serve, balance bot, icon generator, dev pages
tests/         node:test suites
```

## Replacing the procedural art with an artist's sprite sheets

Heroes are drawn in code by default (`js/render/sprites.js`). A hero can be switched to real art one at a time:

- `art/<hero>.png` is one transparent sprite sheet and `art/<hero>.json` is its atlas. Frames: `idle`, `fire`, `ability` (the 72 x 112 world box at 4x) and `icon` (a square bust for portraits and the app icon). The exact layout is in `art_desc/SHEET_SPEC.md`.
- `art_desc/<hero>.md` is a short description (500 words max) for the artist.
- The sheet is registered in `js/render/art.js` (`SHEETS`, keyed `hero:skin`). Anything not registered, and any sheet that fails to load, keeps the procedural sprite, so the game always renders.
- **Vanguard is the first hero converted** (default skin; his other skins still use the procedural art until they get sheets). `node tools/art/export-sheet.mjs vanguard` regenerates the placeholder sheet from the procedural drawing; an artist's finished PNG just replaces it. `node tools/gen-icons.mjs` rebuilds the app icons from the art.

## Design-document coverage

| GDD | Implemented |
| --- | --- |
| §3 loop, §4 combat | Auto-targeting (closest to wall, overkill avoidance, stable retargeting), pooled projectiles with pierce/splash/crit/elements, formula `Attack × Skill × Crit × Resistance`, shields + armor + armor-piercing, pause on interruption, checkpoint/resume |
| §4.4 bullet cutting | Swipe-to-cut enemy projectiles with a regenerating CUT meter; bombs need multiple cuts. *(The GDD asks that the exact mechanic be verified against the reference game — this is one of its listed alternatives.)* |
| §3/§5 summon format | Battles deploy only the lead hero; the rest of the squad is summoned by *random* reward cards (50% per reward round, with a pity rule: never two rounds in a row without one) |
| §7.3 ammunition model | Static revolver + clock-hand slicer + ammo pile (see How to play): shared limited ammo, 1→6 loaded chambers via upgrades, 1→5 bullets per shot via upgrades; per-hero reload cooldowns with progress bars |
| §9 stage structure | 12 rounds per stage. Each round's enemy budget is derived from the damage a typical player's hero can deal in that round's time window × a smooth round curve × a gentle stage ramp (`buildWaves`, `TUNE` in `js/data/enemies.js`), so counts stay sane while enemy health scales |
| §5 heroes | Vanguard, Rook, Pulse, Patch from the GDD **+ Specter and Ember** (6 total), each with an active ability, passive, 4 rank perks, skins; 3 squad slots → 4 after stage 2-2; no duplicates; saved presets; strengths/gaps analysis |
| §6 enemies | Grunt, Runner, Bulwark, Sentinel (+ Spitter, Drone, Splitter, Slimeling = 8 archetypes) and 3 world bosses with phases, telegraphs and vulnerability windows; `Health(stage) = Base × (1 + α·stage)` |
| §7 upgrades | In-run cards across skill / firepower / ammunition / defense / utility (plus a Multi-Shot card per hero), every card equally likely to be offered, with level caps and prerequisites; rerolls |
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
