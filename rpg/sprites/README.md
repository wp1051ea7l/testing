# Sprites

The game loads these SVG files by name (see `SPRITE_NAMES` in `../script.js`).
Edit a file, save, refresh: the game uses the new art.

## The one rule: 200 canvas units = 1 tile

Draw everything at that scale. The canvas size *is* the object's size:

| Canvas | In the game |
|---|---|
| 200×200, filled edge to edge | Exactly one tile |
| 200×200, drawing in the middle | A smaller object on one tile (like `tree.svg`) |
| 400×200, filled | Exactly two tiles side by side |
| 200×280 or 200×300 | A character: one tile of ground plus headroom above for heads, hats and crowns |
| 400×520 | A 2-tile-wide building with a tall roof |

## How sprites are placed

Every sprite **stands on the ground**: the bottom edge of the canvas lines up
with the bottom of its spot on the map, centred across it. Anything above that
is just height (roofs, treetops, hats). So:

- Put characters' feet near the bottom edge of the canvas.
- For reference, the hero is about 150 units tall and the sage about 220.

## Exporting (Affinity Designer, Figma, Illustrator, Inkscape…)

- Transparent background.
- Export as SVG with the normal settings. It's fine if the file says
  `width="100%"`: the game reads the canvas size from the `viewBox`.
  (That needs the page served from a web server, such as GitHub Pages or a local
  test server. Opened as a plain local file, such sprites come out the wrong size.)
- Shapes only: no embedded images, web fonts or links to other files
  (convert text to outlines).
- Layer names are just for editing; the game ignores them.

## Handled by the game, not the file

- **Shadow** under characters.
- **Motion**: the hero's idle bob, the astronaut's float, the slime squish
  (from the bottom centre), the hit flash (a white silhouette of the sprite).
- **Facing**: `hero.svg` faces right; the game mirrors it to face left.
- **Which tiles an object blocks** is a game setting, separate from the art, so
  a roof can overhang tiles you can walk behind.

## Adding a new sprite

Save it here, add its name to `SPRITE_NAMES`, and draw it with
`drawSprite("name", centreX, groundY)`.
