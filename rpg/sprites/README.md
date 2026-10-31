# Sprites

The game loads these SVG files by name (see `SPRITE_NAMES` in `../script.js`).
Edit a file, save, refresh: the game uses the new art.

## Canvas sizes

All coordinates are in game units; one tile is 32×32.

| Kind | Canvas | Notes |
|---|---|---|
| Tile objects (`tree`, `hut`) | 32×32 | Exactly one tile. Drawn on top of the grass, so leave the background transparent. |
| Characters (`hero`, `sage`, `astronaut`, `slime*`) | 32×48 | The **bottom 32×32 is the character's tile**; the extra 16 on top is room for heads, hats and crowns. Feet rest around y = 44–45. |

Keep `width`, `height` and `viewBox` on the `<svg>` tag, and keep the canvas size
the same when editing so the sprite stays lined up with the grid. Art can go
right up to the edges, but anything outside the canvas is cut off.

## Handled by the game, not the file

- **Shadow** under characters.
- **Motion**: the hero's idle bob, the slime squish (scaled from the bottom
  centre of the tile), the hit flash (a white silhouette of the whole sprite).
- **Facing**: `hero.svg` faces right; the game mirrors it to face left.

## Rules of thumb

- Shapes only: no embedded images, web fonts or links to other files
  (convert text to outlines).
- Transparent background.
- Layer names (`id="sword"` etc.) are just for editing; the game ignores them.
- To add a new sprite: save it here, add its name to `SPRITE_NAMES`, and call
  `drawSprite("name", x, y)` where it should appear.
