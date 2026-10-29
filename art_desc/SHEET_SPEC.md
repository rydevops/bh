# Sprite sheet contract (for the engineer and the artist)

One transparent PNG per hero and skin, plus a JSON atlas next to it in `art/`. The game reads only the atlas, so frame
positions and sizes can change as long as the JSON says so.

- `art/vanguard.png`: 1296 x 928, RGBA, transparent background.
- `art/vanguard.json`: where each frame sits in the PNG, plus optional timings.

| Frame | Where (x, y, w, h) | Used for |
| --- | --- | --- |
| `idle` | 0, 0, 432, 672 | standing in battle, the title scene, the home screen |
| `fire` | 432, 0, 432, 672 | shown for `duration` ms after each shot (muzzle flash) |
| `ability` | 864, 0, 432, 672 | while the hero's ability is active (Overdrive) |
| `icon` | 0, 672, 256, 256 | square head-and-shoulders portrait: hero cards, squad, upgrade and summon cards, ability buttons, app icon |

- The three world frames share one size, which is the in-game 72 x 112 box at 6x. The **feet sit 12 world px above the bottom edge (y = 600)**, centred horizontally, because the game centres the frame on the hero's position and adds its own shadow. Effects (flash, aura) may overhang.
- The `icon` is drawn over a tinted gradient by the game, so keep its background transparent.
- Optional atlas timings: `animations.idle.bob` `{ y, periodMs }` (idle bob, total travel in world px) and `frames.fire.duration` (ms).
- Other skins keep the procedural art until they get their own sheet; register it in `js/render/art.js` (`SHEETS`).

## From the artist's raw sheet to the game's sheet

`art_src/vanguard_raw.webp` is the sheet as the artist delivered it (1536 x 1024: three poses in a row, a bust below).
Their atlas coordinates (`art_src/vanguard_artist_atlas.json`) describe a different layout from the picture, so the packer
ignores the coordinates and finds the poses from the transparency. It scales all three poses by the same factor (0.75),
lines their feet up on the shared baseline and writes the sheet and atlas above:

    node tools/art/pack-sheet.mjs vanguard

For the next hero, drop `art_src/<hero>_raw.webp` (and optionally the artist's atlas, for the timings) in `art_src/`.
`node tools/art/export-sheet.mjs <hero>` still makes a placeholder sheet from the procedural art.
