# Sprite sheet contract (for the engineer and the artist)

One transparent PNG per hero and skin, plus a JSON atlas next to it in `art/`.

- `art/vanguard.png`: 864 x 704, RGBA, transparent background.
- `art/vanguard.json`: where each frame sits in the PNG.

| Frame | Where (x, y, w, h) | Used for |
| --- | --- | --- |
| `idle` | 0, 0, 288, 448 | standing in battle, the title scene, the home screen |
| `fire` | 288, 0, 288, 448 | the instant after a shot (muzzle flash) |
| `ability` | 576, 0, 288, 448 | while his ability is active (Overdrive) |
| `icon` | 0, 448, 256, 256 | square head-and-shoulders portrait: hero cards, squad, upgrade and summon cards, ability buttons, app icon |

- The three world frames are the same size (4x the in-game 72 x 112 box). The **feet sit about 12 px above the bottom**, and the figure is centred horizontally, because the game centres the frame on the hero's position and adds its own shadow.
- The `icon` is drawn over a tinted gradient by the game, so keep its background transparent.
- If the frame layout changes, edit the JSON. The game reads only the JSON.
- Other skins keep the procedural art until they get their own sheet; register it in `js/render/art.js` (`SHEETS`).
- `node tools/art/export-sheet.mjs vanguard` regenerates the placeholder sheet from the procedural art.
