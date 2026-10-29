# Sprite sheet contract (for the engineer and the artist)

One transparent PNG per hero and skin, plus a JSON atlas next to it in `art/`. The game reads only the atlas, so frame
positions and names can change as long as the JSON says so.

- `art/vanguard.png`: 1440 x 704, RGBA, transparent background.
- `art/vanguard.json`: where each frame sits in the PNG, and which frames play when.

| Frame | Where (x, y, w, h) | Used for |
| --- | --- | --- |
| `idle` | 0, 0, 288, 448 | standing in battle, the title scene, the home screen |
| `fire_1`, `fire_2` | 288 and 576, 0, 288, 448 | the `fire` animation after each shot: big muzzle flash, then a smaller one, 70 ms each |
| `overdrive_1`, `overdrive_2` | 864 and 1152, 0, 288, 448 | the `ability` animation while Overdrive is active: the two aura poses alternate every 180 ms |
| `icon` | 0, 448, 256, 256 | square head-and-shoulders portrait: hero cards, squad, upgrade and summon cards, ability buttons, app icon |

- Every world frame has the same size, which is the in-game 72 x 112 box at 4x. The **boots sit on the line y = 400 (12 world px above the bottom edge)** and are centred horizontally, because the game centres the frame on the hero's position and adds its own shadow. Effects (flash, aura) may overhang.
- The `icon` is drawn over a tinted gradient by the game, so keep its background transparent.
- `animations` in the atlas lists the frames and `frameDurationsMs` (or `frameDurationMs`) of `idle`, `fire` and `ability`. Idle is a single frame with a gentle vertical bob added by the game (an `idle.bob` `{ y, periodMs }` entry overrides the default bob). A sheet with single `fire` and `ability` frames and no `animations` block also works.
- Other skins keep the procedural art until they get their own sheet; register it in `js/render/art.js` (`SHEETS`).

## From the artist's raw sheet to the game's sheet

`art_src/vanguard_raw.webp` is the sheet as the artist delivered it (1400 x 960: five poses in a row, a bust below) and
`art_src/vanguard_artist_atlas.json` is their atlas. The packer uses their rectangles, then:

- moves the cut between two neighbouring poses to the quietest column nearby (the Overdrive glow spills over its cell edge) and fades it;
- removes the faint haze (alpha 1-12) the generator leaves around each pose;
- scales every pose by the same factor (0.72) and puts the boots of each on the shared baseline, so nothing jumps between frames;
- fits the bust into the 256 x 256 icon, bottom-aligned.

    node tools/art/pack-sheet.mjs vanguard

For the next hero, drop `art_src/<hero>_raw.webp` and `art_src/<hero>_artist_atlas.json` in `art_src/`. If the atlas
says a size that differs from the picture, the packer stops and says so.
`node tools/art/export-sheet.mjs <hero>` still makes a placeholder sheet from the procedural art.
