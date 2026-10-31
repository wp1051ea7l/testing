const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const stage = document.querySelector("#stage");

// The whole game is drawn at its native pixel-art size into `low`
// (16 × 9 tiles of 16px = 256 × 144), then scaled up by a whole number.
const TILE = 16;
const VIEW_W = 16;
const VIEW_H = 9;
const SCREEN_W = VIEW_W * TILE;
const SCREEN_H = VIEW_H * TILE;
const low = document.createElement("canvas");
low.width = SCREEN_W;
low.height = SCREEN_H;
const g = low.getContext("2d");

// # tree, ~ water, = bridge, : path, s sand, , flowers, r rock, H hut,
// W wall, D locked door, C key chest, $ gold chest, h potion,
// P player, S sage, g slime, b blue slime, B slime king, . grass
const MAP = [
  "################################################",
  "#...,..,..,.........~~~..........#####.###....$#",
  "#,.H,.H,#,#.........~~~...g....................#",
  "#.....,#.,#H.....r..~~~.......:::::::::::......#",
  "##,#....###,.......#~~~.......:.........:...h..#",
  "####..S.............~~~.......:.#...###.:......#",
  "##,#.:::::::::::::::===::::::::.##...#..:......#",
  "#.,..P..:,..........~~~.......:.#.......:...##.#",
  "#.......:.###.......~~~#.##...:.........:...##.#",
  "#..Hr,..:.##H#,,g..#~~~##.....:......#....C.##.#",
  "#,,.....:.,###......~~~#......:..b..##.........#",
  "#.##...,:..,##,.....~~~#......:.....##.........#",
  "#.###...:...........~~~#..h...:.............b..#",
  "#..##...:...........~~~.......:................#",
  "#.....#.:...g.......~~~.......:::::::::........#",
  "#....##.:.......$...~~~...............:...###..#",
  "#.......:...........~~~...............:....#...#",
  "#.......:..###......~~~....g.......b..:..r.....#",
  "#...g...:...####....~~~...............:........#",
  "#.......:...........~~~...............:.....####",
  "#.......:...........~~~~~~~~~~~~~~~~~~=~~~~~~~~#",
  "#####.#.:.##..g.....~~~~~~~~~~~~~~~~~~=~~~~~~~~#",
  "######..:.##........~~~~~~~~~~~~~~~~~~=~~~~~~~~#",
  "#.#.#...:.............................:.#......#",
  "#.....#.:::::::::::::::::::::::::::::::.#...b..#",
  "#...ssssss.......h...................:.........#",
  "#..ss~~~~ss..........#........WWWWWWWDWWWWWWWW.#",
  "##s~~~~~~~~s............g.....W..............W.#",
  "##s~~~~~~~~s....##............W...b......b...W.#",
  "##s~~~~~~~~s....r.............W..W........W..W.#",
  "##s~~~~~~~~s.$...........###..W....h.........W.#",
  "###ss~~~~ss........g.......#..W..W........W..W##",
  "#...ssssss....................W......B.......W##",
  "#.......#.....##........g.....W..............W##",
  "#.............#####...........WWWWWWWWWWWWWWWW.#",
  "################################################",
];
const WORLD_W = MAP[0].length;
const WORLD_H = MAP.length;
const SOLID = new Set(["#", "~", "W", "D", "C", "$", "o", "r", "H"]);
const ENEMIES = {
  g: { name: "slime", hp: 3, atk: 1, xp: 2, gold: 3, art: "slime" },
  b: { name: "blue slime", hp: 6, atk: 2, xp: 4, gold: 6, art: "blueSlime" },
  B: { name: "slime king", hp: 16, atk: 3, xp: 10, gold: 50, art: "kingSlime", boss: true },
};

// ---------- Pixel art ----------
// Each sprite is a grid of characters; each character is one pixel whose
// color comes from PALETTE ("." or any unlisted character is transparent).
// To swap in your own art, edit these grids, or replace a bake() call
// with a loaded image of the same size.

const PALETTE = {
  k: "#1a1c2c", x: "#222222", W: "#ffffff", e: "#d9dde3",
  g: "#71af60", G: "#5d9b4e", d: "#3f7a3a",
  t: "#2f6b34", T: "#3f8645", l: "#5aa654",
  b: "#6b4426", B: "#8a5a2e", w: "#a8743f", D: "#2a1a0e",
  y: "#ffd75e", Y: "#c9962a",
  "~": "#3d7fc4", c: "#7fb6ea", C: "#2c5f9a",
  r: "#7d7f86", R: "#5a5c63", q: "#9a9ca3",
  h: "#c9a46a", o: "#b5523b", O: "#8a3a2a",
  f: "#f1c79b", H: "#6b3e1f", u: "#3a6fd1", U: "#27509e",
  v: "#7a4fb8", V: "#5a3790", z: "#7fe0ff",
  m: "#e0485b", M: "#a8293b",
  n: "#4fc46b", N: "#2e8a47",
  1: "#f5e663", 2: "#f28bb3",
  s: "#00000040",
};

const GRASS = [
  "................",
  "..v.............",
  ".v.v........,...",
  "................",
  "................",
  "...........v....",
  "..........v.v...",
  "................",
  "....,...........",
  "................",
  "................",
  ".......v........",
  "......v.v.....,.",
  "................",
  ".,..............",
  "................",
];

const SPECKLE = [
  "................",
  "..x.........x...",
  "................",
  ".......x........",
  "................",
  ".x..........x...",
  ".....x..........",
  "................",
  "..........x.....",
  "...x............",
  "................",
  "........x.....x.",
  ".x..............",
  ".....x....x.....",
  "................",
  "..x.........x...",
];

const WATER = [
  "~~~~~~~~~~~~~~~~",
  "~~~~~~~~~~~~~~~~",
  "~~cc~~~~~~~~~~~~",
  "~c~~c~~~~~~~cc~~",
  "~~~~~cc~~~~c~~c~",
  "~~~~~~~~~~~~~~~~",
  "~~~~~~~~~~~~~~~~",
  "~~~~~~~~~CC~~~~~",
  "~~~~~~~~~~~~~~~~",
  "~~~~~~cc~~~~~~~~",
  "~~~~~c~~c~~~~~~~",
  "~~~~~~~~~cc~~~~~",
  "~c~~~~~~~~~~~~~~",
  "~~~~~~~~~~~~~~cc",
  "~~~~~~~~~~~~~c~~",
  "~~~~~~~~~~~~~~~~",
];

const WALL = [
  "RRRRRRRRRRRRRRRR",
  "rrrrrrrRqrrrrrrR",
  "rqrrrrrRrrrrrrrR",
  "rrrrrrrRrrrrrrrR",
  "RRRRRRRRRRRRRRRR",
  "rrrRrrrrrrrRqrrr",
  "rrrRrqrrrrrRrrrr",
  "rrrRrrrrrrrRrrrr",
  "RRRRRRRRRRRRRRRR",
  "rrrrrrrRrrrrrrrR",
  "rrrrqrrRrrrrrqrR",
  "rrrrrrrRrrrrrrrR",
  "RRRRRRRRRRRRRRRR",
  "rrrRrrrrrrrRrrrr",
  "rrrRrrrqrrrRrrrr",
  "rrrRrrrrrrrRrrrr",
];

const DOOR = [
  "................",
  "....kkkkkkkk....",
  "...kBBwBBwBBk...",
  "..kBBBwBBwBBBk..",
  "..kBBBwBBwBBBk..",
  "..kBBBwBBwBBBk..",
  "..kBBBwBBwBBBk..",
  "..kBBBwDDwBBBk..",
  "..kBBBwDDwBBBk..",
  "..kBBBwBDwBBBk..",
  "..kBBBwBDwBBBk..",
  "..kBBBwBBwBBBk..",
  "..kBBBwBBwBBBk..",
  "..kBBBwBBwBBBk..",
  "..kBBBwBBwBBBk..",
  "..kkkkkkkkkkkk..",
];

const TREE = [
  ".....tttttt.....",
  "...ttTTTTTTtt...",
  "..tTTllTTTTTTt..",
  ".tTTlllTTTTTTTt.",
  ".tTTllTTTTTTTTt.",
  "tTTTTTTTTTTTTTTt",
  "tTTTTTTTTTTTTTtt",
  "tTTTTTTTTTTTTTtt",
  ".tTTTTTTTTTTTtt.",
  ".ttTTTTTTTTTttt.",
  "..tttTTTTTtttt..",
  "....tttttttt....",
  "......bbbb......",
  "......bBbb......",
  ".....dbbbbd.....",
  "....ddddddd.....",
];

const FLOWERS = [
  "................",
  "................",
  "...1............",
  "..1y1.......2...",
  "...1.......2y2..",
  "...G........2...",
  "...G........G...",
  "................",
  ".......2........",
  "......2y2.......",
  ".......2........",
  ".......G........",
  ".............1..",
  "............1y1.",
  ".............1..",
  ".............G..",
];

const ROCK = [
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....kkkkk......",
  "....kqqrrrkk....",
  "...kqqrrrrrrk...",
  "..kqrrrrrrrrRk..",
  "..krrrrrrrrRRk..",
  "..krrrrrrRRRRk..",
  "..kRrrRRRRRRRk..",
  "...kkkkkkkkkk...",
  "....dddddddd....",
  "................",
  "................",
];

const HUT = [
  "................",
  ".......kk.......",
  "......kOOk......",
  ".....kOooOk.....",
  "....kOooooOk....",
  "...kOooooooOk...",
  "..kOooooooooOk..",
  ".kOOOOOOOOOOOOk.",
  "..khhhhhhhhhhk..",
  "..khyyhhhhhhhk..",
  "..khyyhhkkkhhk..",
  "..khhhhhkDkhhk..",
  "..khhhhhkDkhhk..",
  "..khhhhhkDkhhk..",
  "..kkkkkkkkkkkk..",
  "...dddddddddd...",
];

const CHEST = [
  "................",
  "................",
  "................",
  "....kkkkkkkk....",
  "...kwwwwwwwwk...",
  "..kwBBBBBBBBwk..",
  "..kBBBBBBBBBBk..",
  "..kyyyyyyyyyyk..",
  "..kBBBByyBBBBk..",
  "..kBBBBYYBBBBk..",
  "..kBBBBBBBBBBk..",
  "..kBBBBBBBBBBk..",
  "..kkkkkkkkkkkk..",
  "...dddddddddd...",
  "................",
  "................",
];

const CHEST_OPEN = [
  "................",
  "....kkkkkkkk....",
  "...kwwwwwwwwk...",
  "...kBBBBBBBBk...",
  "...kyyyyyyyyk...",
  "..kkkkkkkkkkkk..",
  "..kDDDDDDDDDDk..",
  "..kyyyyyyyyyyk..",
  "..kBBBBBBBBBBk..",
  "..kBBBBBBBBBBk..",
  "..kBBBBBBBBBBk..",
  "..kBBBBBBBBBBk..",
  "..kkkkkkkkkkkk..",
  "...dddddddddd...",
  "................",
  "................",
];

const POTION = [
  "................",
  "................",
  "......kkkk......",
  "......keek......",
  ".......kk.......",
  "......kWWk......",
  ".....kmmmmk.....",
  "....kmWmmmmk....",
  "....kmWmmmmk....",
  "....kmmmmmmk....",
  "....kMmmmmMk....",
  ".....kMMMMk.....",
  "......kkkk......",
  "................",
  "................",
  "................",
];

const BRIDGE = [
  "................",
  "................",
  "kkkkkkkkkkkkkkkk",
  "wwwkwwwkwwwkwwwk",
  "wBBkwBBkwBBkwBBk",
  "wBBkwBBkwBBkwBBk",
  "wBBkwBBkwBBkwBBk",
  "wBBkwBBkwBBkwBBk",
  "wBBkwBBkwBBkwBBk",
  "wBBkwBBkwBBkwBBk",
  "wBBkwBBkwBBkwBBk",
  "wBBkwBBkwBBkwBBk",
  "wBBkwBBkwBBkwBBk",
  "kkkkkkkkkkkkkkkk",
  "................",
  "................",
];

const SHADOW = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "....ssssssss....",
  ".....ssssss.....",
];

const HERO = [
  "................",
  ".....kkkkkk.....",
  "....kHHHHHHk....",
  "...kHHHHHHHHk.e.",
  "...kHffffffHk.e.",
  "...kffxffxffk.e.",
  "...kffffffffk.e.",
  "....kffffffk..e.",
  "...kkuuuuuukkBBB",
  "..kuuuuuuuuuukf.",
  "..kfuuuuuuuuk...",
  "...kuuuyuuuk....",
  "...kUUUUUUUk....",
  "...kbbbkbbbk....",
  "...kbbk.kbbk....",
  "....kkk.kkk.....",
];

const SAGE = [
  "........k....kk.",
  ".......kVk..kzzk",
  "......kVVVk.kzzk",
  ".....kVVVVVk.kk.",
  "...kkkkkkkkkkkB.",
  "....kffffffk..B.",
  "....kfxffxfk..B.",
  "....kWWWWWWk..B.",
  "....kvWWWWvk.fB.",
  "...kvvvWWvvvkfk.",
  "...kvvvvvvvvk.B.",
  "..kvvvvyvvvvvkB.",
  "..kvvvvvvvvvvkB.",
  "..kVVVVVVVVVVkB.",
  "...kkkkkkkkkk.B.",
  "..............B.",
];

const SLIME = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......kkkk......",
  "....kknnnnkk....",
  "...knWWnnnnnk...",
  "..knnWnnnnnnnk..",
  "..knnnnnnnnnnk..",
  ".knnnxnnnnxnnnk.",
  ".knnnxnnnnxnnnk.",
  ".knnnnnnnnnnnnk.",
  ".kNnnnnnnnnnnNk.",
  "..kNNNNNNNNNNk..",
  "...kkkkkkkkkk...",
];

const SLIME_SQUISH = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....kkkkkk.....",
  "...kknWWnnnnkk..",
  "..knnWnnnnnnnnk.",
  ".knnnxnnnnxnnnk.",
  ".knnnxnnnnxnnnk.",
  "knnnnnnnnnnnnnnk",
  "kNnnnnnnnnnnnnNk",
  ".kNNNNNNNNNNNNk.",
  "..kkkkkkkkkkkk..",
];

const CROWN = [
  "y..y..y",
  "yy.y.yy",
  "yyyyyyy",
  "ymyyymy",
  "YYYYYYY",
];

const HEART = [
  ".mm.mm.",
  "mmmmmmm",
  "mmmmmmm",
  ".mmmmm.",
  "..mmm..",
  "...m...",
];

const COIN = [
  ".yyy.",
  "yyYyy",
  "yyYyy",
  "yyYyy",
  ".yyy.",
];

const KEY = [
  "yyy.....",
  "y.yyyyyy",
  "yyy..y.y",
];

const ICONS = {
  fullscreen: ["WW...WW", "W.....W", ".......", ".......", ".......", "W.....W", "WW...WW"],
  restart: ["..WWW.W", ".W...WW", "W...WWW", "W......", "W.....W", ".W...W.", "..WWW.."],
  close: ["W.....W", ".W...W.", "..W.W..", "...W...", "..W.W..", ".W...W.", "W.....W"],
  arrow: ["...W...", "..WWW..", ".WWWWW.", "WWWWWWW", "..WWW..", "..WWW..", "..WWW.."],
};

// 3×5 pixel font: each glyph is five rows, each row a 3-bit number.
// M, N and W need five columns to be readable, so they're spelled out.
const FONT = {
  A: "25755", B: "65656", C: "34443", D: "65556", E: "74647", F: "74644", G: "34553",
  H: "55755", I: "72227", J: "11152", K: "55655", L: "44447",
  O: "25552", P: "65644", Q: "25563", R: "65655", S: "34216", T: "72222", U: "55557",
  V: "55522", X: "55255", Y: "55222", Z: "71247",
  0: "75557", 1: "26227", 2: "61247", 3: "61216", 4: "55711",
  5: "74616", 6: "34652", 7: "71222", 8: "25252", 9: "25316",
  ".": "00002", ",": "00024", "!": "22202", "'": "22000", ":": "02020",
  "/": "11244", "-": "00700", "+": "02720", "?": "61202", " ": "00000",
};
const GLYPHS = {
  ...Object.fromEntries(Object.entries(FONT).map(([ch, rows]) => [ch, [...rows].map((d) => (+d).toString(2).padStart(3, "0"))])),
  M: ["10001", "11011", "10101", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001"],
  W: ["10001", "10001", "10101", "11011", "10001"],
};

// Turn a grid into a small canvas. `turns` rotates by quarter turns.
function bake(rows, palette = PALETTE, turns = 0) {
  const w = rows[0].length;
  const h = rows.length;
  rows.forEach((row) => {
    if (row.length !== w) throw new Error(`Sprite row "${row}" is ${row.length} wide, expected ${w}`);
  });
  const c = document.createElement("canvas");
  c.width = turns % 2 ? h : w;
  c.height = turns % 2 ? w : h;
  const cg = c.getContext("2d");
  cg.translate(c.width / 2, c.height / 2);
  cg.rotate((turns * Math.PI) / 2);
  cg.translate(-w / 2, -h / 2);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!palette[ch]) return;
    cg.fillStyle = palette[ch];
    cg.fillRect(x, y, 1, 1);
  }));
  return c;
}

// Shift a grid with wraparound, for tile variants and water animation.
function shift(rows, dx, dy) {
  const h = rows.length;
  return rows.map((_, y) => {
    const row = rows[(y - dy + h * 16) % h];
    const k = (row.length - (dx % row.length)) % row.length;
    return row.slice(k) + row.slice(0, k);
  });
}

// White copy of a sprite, used for the hit flash.
function silhouette(src) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const cg = c.getContext("2d");
  cg.drawImage(src, 0, 0);
  cg.globalCompositeOperation = "source-in";
  cg.fillStyle = "#fff";
  cg.fillRect(0, 0, c.width, c.height);
  return c;
}

function slimeArt(body, dark) {
  const palette = { ...PALETTE, n: body, N: dark };
  const frames = [bake(SLIME, palette), bake(SLIME_SQUISH, palette)];
  return { frames, flash: frames.map(silhouette), tops: [5, 7] };
}

const grassPalette = { ".": "#71af60", v: "#3f7a3a", ",": "#5d9b4e" };
const ART = {
  grass: [bake(GRASS, grassPalette), bake(shift(GRASS, 8, 5), grassPalette), bake(shift(GRASS, 3, 11), grassPalette)],
  water: [0, 4, 8, 12].map((s) => bake(shift(WATER, s, 0))),
  path: bake(SPECKLE, { ".": "#d6bd85", x: "#bfa26a" }),
  sand: bake(shift(SPECKLE, 5, 3), { ".": "#e3d08f", x: "#cdb672" }),
  wall: bake(WALL),
  door: bake(DOOR),
  tree: bake(TREE),
  flowers: bake(FLOWERS),
  rock: bake(ROCK),
  hut: bake(HUT),
  chest: bake(CHEST),
  chestOpen: bake(CHEST_OPEN),
  potion: bake(POTION),
  bridge: [bake(BRIDGE), bake(BRIDGE, PALETTE, 1)],
  shadow: bake(SHADOW),
  hero: bake(HERO),
  sage: [bake(SAGE), bake(SAGE, { ...PALETTE, z: "#ffffff" })],
  slime: slimeArt("#4fc46b", "#2e8a47"),
  blueSlime: slimeArt("#4a8be0", "#2c5f9a"),
  kingSlime: slimeArt("#d1405a", "#8a2438"),
  crown: bake(CROWN),
  heart: bake(HEART),
  coin: bake(COIN),
  key: bake(KEY),
};
ART.heroFlash = silhouette(ART.hero);

// The HTML buttons use the same pixel icons, scaled with CSS.
const iconUrl = (rows, turns = 0) => `url(${bake(rows, { W: "#fff" }, turns).toDataURL()})`;
document.querySelector("#fullscreen").style.backgroundImage = iconUrl(ICONS.fullscreen);
document.querySelector("#restart").style.backgroundImage = iconUrl(ICONS.restart);
document.querySelector(".buttons a").style.backgroundImage = iconUrl(ICONS.close);
[["up", 0], ["right", 1], ["down", 2], ["left", 3]].forEach(([dir, turns]) => {
  document.querySelector(`[data-dir="${dir}"]`).style.backgroundImage = iconUrl(ICONS.arrow, turns);
});

// ---------- Game state ----------

let tiles, seen, player, enemies, npc, effects, gameState, message, time = 0;
let scale = 1;
let lastMove = 0;

function reset() {
  tiles = MAP.map((row) => row.split(""));
  seen = tiles.map((row) => row.map(() => false));
  enemies = [];
  effects = [];
  gameState = "play";
  tiles.forEach((row, y) => row.forEach((ch, x) => {
    const actor = { x, y, dx: x, dy: y, flash: 0 };
    if (ch === "P") player = { ...actor, hp: 10, maxHp: 10, atk: 1, xp: 0, level: 1, gold: 0, key: false, facing: 1 };
    if (ch === "S") npc = actor;
    if (ENEMIES[ch]) enemies.push({ ...actor, ...ENEMIES[ch] });
    if ("PS".includes(ch) || ENEMIES[ch]) row[x] = ".";
  }));
  say("Find the sage in the village. Arrow keys or WASD to move.");
}

// Largest exact 16:9 area that fits, rounded down so one art pixel is a
// whole number of device pixels (one tile = a multiple of 16 device px).
function resize() {
  const dpr = window.devicePixelRatio || 1;
  scale = Math.max(1, Math.floor(Math.min(innerWidth * dpr / SCREEN_W, innerHeight * dpr / SCREEN_H)));
  canvas.width = SCREEN_W * scale;
  canvas.height = SCREEN_H * scale;
  stage.style.width = `${canvas.width / dpr}px`;
  stage.style.height = `${canvas.height / dpr}px`;
  stage.style.setProperty("--u", `${(TILE * scale) / dpr}px`);
}

function say(text) {
  message = { text, time };
}

function actorAt(x, y) {
  return enemies.find((e) => e.x === x && e.y === y) || (npc.x === x && npc.y === y ? npc : null);
}

function popup(x, y, text, color) {
  effects.push({ x: x * TILE + TILE / 2, y: y * TILE, text, color, life: 1 });
}

function move(mx, my) {
  if (gameState !== "play" || time - lastMove < 0.09) return;
  if (mx) player.facing = mx;
  const nx = player.x + mx;
  const ny = player.y + my;
  const target = actorAt(nx, ny);
  const tile = tiles[ny][nx];

  if (target === npc) {
    say(player.key
      ? "Sage: The slime king's castle lies to the south-east. Good luck!"
      : "Sage: The slime king hides in the south-east castle. Its key is in a chest in the north-east, across the river.");
  } else if (target) {
    attack(target);
  } else if (tile === "C" || tile === "$") {
    tiles[ny][nx] = "o";
    const gold = tile === "C" ? 10 : 25;
    player.gold += gold;
    if (tile === "C") {
      player.key = true;
      popup(nx, ny, "+key", "#ffd75e");
      say(`You found the castle key and ${gold} gold!`);
    } else {
      popup(nx, ny, `+${gold}`, "#ffd75e");
      say(`You found ${gold} gold!`);
    }
  } else if (tile === "D") {
    if (player.key) {
      tiles[ny][nx] = ":";
      say("The castle door creaks open...");
    } else {
      say("The castle door is locked.");
    }
  } else if (!SOLID.has(tile)) {
    player.x = nx;
    player.y = ny;
    if (tile === "h") {
      tiles[ny][nx] = ".";
      player.hp = player.maxHp;
      popup(nx, ny, "healed", "#7be08f");
      say("You drink a potion. Fully healed!");
    }
  } else {
    return;
  }
  lastMove = time;
  enemyTurn();
}

function attack(enemy) {
  const dmg = player.atk + Math.floor(Math.random() * 2);
  enemy.hp -= dmg;
  enemy.flash = 1;
  popup(enemy.x, enemy.y, `-${dmg}`, "#fff");
  if (enemy.hp > 0) return say(`You hit the ${enemy.name}.`);

  enemies = enemies.filter((e) => e !== enemy);
  player.xp += enemy.xp;
  player.gold += enemy.gold;
  say(`The ${enemy.name} is defeated! +${enemy.xp} XP`);
  while (player.xp >= player.level * 4) {
    player.xp -= player.level * 4;
    player.level += 1;
    player.maxHp += 3;
    player.hp = player.maxHp;
    player.atk += 1;
    popup(player.x, player.y, "level up", "#ffd75e");
    say(`Level up! You are now level ${player.level}.`);
  }
  if (enemy.boss) {
    gameState = "won";
    say("You defeated the slime king!");
  }
}

function enemyTurn() {
  for (const e of enemies) {
    const distX = player.x - e.x;
    const distY = player.y - e.y;
    const dist = Math.abs(distX) + Math.abs(distY);
    if (dist === 1) {
      if (Math.random() < 0.7) {
        player.hp -= e.atk;
        player.flash = 1;
        popup(player.x, player.y, `-${e.atk}`, "#ff6b6b");
      }
      continue;
    }
    // Chase when close, otherwise wander now and then.
    let step;
    if (dist <= 4) {
      step = Math.abs(distX) > Math.abs(distY) ? [Math.sign(distX), 0] : [0, Math.sign(distY)];
    } else if (Math.random() < 0.4) {
      step = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
    } else continue;
    const nx = e.x + step[0];
    const ny = e.y + step[1];
    if (!SOLID.has(tiles[ny][nx]) && tiles[ny][nx] !== "=" && !actorAt(nx, ny) && !(nx === player.x && ny === player.y)) {
      e.x = nx;
      e.y = ny;
    }
  }
  if (player.hp <= 0) {
    player.hp = 0;
    gameState = "lost";
    say("You were defeated.");
  }
}

// ---------- Drawing (all coordinates in art pixels) ----------

// Stable pseudo-random per tile so grass variants don't flicker.
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawTile(ch, x, y, sx, sy) {
  let base = ART.grass[Math.floor(hash(x, y) * 3)];
  if (ch === "~" || ch === "=") base = ART.water[Math.floor(time * 3) % 4];
  else if (ch === ":") base = ART.path;
  else if (ch === "s") base = ART.sand;
  else if (ch === "W" || ch === "D") base = ART.wall;
  g.drawImage(base, sx, sy);

  if (ch === "=") {
    const vertical = tiles[y - 1]?.[x] === "=" || tiles[y + 1]?.[x] === "=";
    g.drawImage(ART.bridge[vertical ? 1 : 0], sx, sy);
  } else if (ch === "h") {
    g.drawImage(ART.potion, sx, sy - (Math.floor(time * 2) % 2));
  } else {
    const over = { "#": ART.tree, ",": ART.flowers, r: ART.rock, H: ART.hut, D: ART.door,
      C: ART.chest, $: ART.chest, o: ART.chestOpen }[ch];
    if (over) g.drawImage(over, sx, sy);
  }
}

function drawSprite(img, sx, sy, flip) {
  if (!flip) return g.drawImage(img, sx, sy);
  g.save();
  g.translate(sx + img.width, sy);
  g.scale(-1, 1);
  g.drawImage(img, 0, 0);
  g.restore();
}

const flashing = (a) => a.flash > 0 && Math.floor(time * 20) % 2;

const glyph = (ch) => GLYPHS[ch.toUpperCase()] || GLYPHS["?"];
const textWidth = (text) => [...text].reduce((w, ch) => w + glyph(ch)[0].length + 1, -1);

function drawText(text, x, y, color, { align = "left", size = 1, outline = null } = {}) {
  const width = textWidth(text) * size;
  let left = Math.round(align === "center" ? x - width / 2 : align === "right" ? x - width : x);
  if (outline) {
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      drawText(text, left + ox * size, y + oy * size, outline, { size });
    }
  }
  g.fillStyle = color;
  for (const ch of text) {
    const rows = glyph(ch);
    rows.forEach((bits, row) => [...bits].forEach((bit, col) => {
      if (bit === "1") g.fillRect(left + col * size, y + row * size, size, size);
    }));
    left += (rows[0].length + 1) * size;
  }
}

function wrapText(text, maxWidth) {
  const lines = [""];
  for (const word of text.split(" ")) {
    const current = lines[lines.length - 1];
    if (current && textWidth(`${current} ${word}`) > maxWidth) lines.push(word);
    else lines[lines.length - 1] = current ? `${current} ${word}` : word;
  }
  return lines;
}

function panel(x, y, w, h) {
  g.fillStyle = "#000";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#0f1a14e0";
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
}

function bar(x, y, w, h, fraction, color) {
  g.fillStyle = "#000";
  g.fillRect(x, y, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, Math.round(w * Math.max(0, fraction)), h);
}

function drawHud() {
  panel(3, 3, 74, 25);
  drawText(`Lv ${player.level}`, 7, 7, "#fff");
  g.drawImage(ART.coin, 29, 7);
  drawText(`${player.gold}`, 36, 7, "#ffd75e");
  if (player.key) g.drawImage(ART.key, 64, 8);
  g.drawImage(ART.heart, 7, 14);
  bar(16, 15, 32, 4, player.hp / player.maxHp, "#e0485b");
  drawText(`${player.hp}/${player.maxHp}`, 51, 14, "#fff");
  bar(7, 23, 66, 2, player.xp / (player.level * 4), "#7fb6ea");

  if (message && time - message.time < 6) {
    const lines = wrapText(message.text, 130);
    const h = lines.length * 7 + 5;
    const top = SCREEN_H - 4 - h;
    panel(SCREEN_W / 2 - 69, top, 138, h);
    lines.forEach((line, i) => drawText(line, SCREEN_W / 2, top + 4 + i * 7, "#fff", { align: "center" }));
  }

  drawMinimap();

  if (gameState !== "play") {
    g.fillStyle = "#000000b0";
    g.fillRect(0, 50, SCREEN_W, 40);
    drawText(gameState === "won" ? "Victory!" : "Game over", SCREEN_W / 2, 56, "#ffd75e", { align: "center", size: 3, outline: "#000" });
    drawText("Press R to play again", SCREEN_W / 2, 78, "#fff", { align: "center" });
  }
}

function drawMinimap() {
  const colors = {
    "#": "#2f6b34", "~": "#3d7fc4", "=": "#a8743f", ":": "#d6bd85", s: "#e3d08f",
    W: "#7d7f86", D: "#8a5a2e", H: "#b5523b", r: "#8c8c8c", C: "#ffd75e", $: "#ffd75e",
  };
  const mx = SCREEN_W - 4 - WORLD_W;
  const my = SCREEN_H - 4 - WORLD_H;
  panel(mx - 2, my - 2, WORLD_W + 4, WORLD_H + 4);
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (!seen[y][x]) continue;
      g.fillStyle = colors[tiles[y][x]] || "#71af60";
      g.fillRect(mx + x, my + y, 1, 1);
    }
  }
  if (Math.floor(time * 3) % 2) {
    g.fillStyle = "#fff";
    g.fillRect(mx + player.x, my + player.y, 1, 1);
  }
}

// ---------- Main loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  time = now / 1000;

  // Ease drawn positions toward grid positions for smooth steps.
  for (const a of [player, npc, ...enemies]) {
    a.dx += (a.x - a.dx) * Math.min(dt * 18, 1);
    a.dy += (a.y - a.dy) * Math.min(dt * 18, 1);
    a.flash = Math.max(0, a.flash - dt * 2.5);
  }

  // Camera follows the player in whole art pixels, clamped to the world.
  const camX = Math.min(Math.max(player.dx + 0.5 - VIEW_W / 2, 0), WORLD_W - VIEW_W);
  const camY = Math.min(Math.max(player.dy + 0.5 - VIEW_H / 2, 0), WORLD_H - VIEW_H);
  const ox = Math.round(camX * TILE);
  const oy = Math.round(camY * TILE);
  const toScreen = (a) => [Math.round(a.dx * TILE) - ox, Math.round(a.dy * TILE) - oy];

  const x0 = Math.floor(camX);
  const y0 = Math.floor(camY);
  const x1 = Math.min(WORLD_W - 1, Math.ceil(camX + VIEW_W));
  const y1 = Math.min(WORLD_H - 1, Math.ceil(camY + VIEW_H));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      drawTile(tiles[y][x], x, y, x * TILE - ox, y * TILE - oy);
      seen[y][x] = true;
    }
  }

  const visible = (a) => a.dx > x0 - 2 && a.dx < x1 + 2 && a.dy > y0 - 2 && a.dy < y1 + 2;
  const bob = Math.floor(time * 2) % 2;
  if (visible(npc)) {
    const [sx, sy] = toScreen(npc);
    g.drawImage(ART.shadow, sx, sy);
    g.drawImage(ART.sage[Math.floor(time * 4) % 2], sx, sy);
  }
  for (const e of enemies.filter(visible)) {
    const [sx, sy] = toScreen(e);
    const art = ART[e.art];
    const f = (Math.floor(time * 3) + e.x) % 2;
    g.drawImage(ART.shadow, sx, sy);
    g.drawImage(flashing(e) ? art.flash[f] : art.frames[f], sx, sy);
    if (e.boss) g.drawImage(ART.crown, sx + 4, sy + art.tops[f] - 4);
  }
  {
    const [sx, sy] = toScreen(player);
    g.drawImage(ART.shadow, sx, sy);
    drawSprite(flashing(player) ? ART.heroFlash : ART.hero, sx, sy - bob, player.facing < 0);
  }

  for (const fx of effects) {
    fx.life -= dt;
    drawText(fx.text, fx.x - ox, Math.round(fx.y - oy - (1 - fx.life) * 10), fx.color, { align: "center", outline: "#000" });
  }
  effects = effects.filter((fx) => fx.life > 0);

  drawHud();

  // Scale the finished frame up by a whole number, without smoothing.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(low, 0, 0, canvas.width, canvas.height);
  requestAnimationFrame(frame);
}

// ---------- Input ----------

const KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR") return reset();
  const dir = KEYS[event.code];
  if (!dir) return;
  event.preventDefault();
  move(...dir);
});

// Touch pad: press and hold to keep walking.
document.querySelectorAll(".pad button").forEach((btn) => {
  let timer;
  const stop = () => clearInterval(timer);
  btn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    btn.setPointerCapture(event.pointerId);
    move(...DIRS[btn.dataset.dir]);
    stop();
    timer = setInterval(() => move(...DIRS[btn.dataset.dir]), 160);
  });
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("lostpointercapture", stop);
});

document.querySelector("#restart").addEventListener("click", (event) => {
  reset();
  event.currentTarget.blur();
});

// Fullscreen removes browser chrome so the 16:9 area can grow; on phones
// we also try to lock landscape (unsupported browsers just ignore it).
const fullscreenBtn = document.querySelector("#fullscreen");
fullscreenBtn.hidden = !document.fullscreenEnabled;
fullscreenBtn.addEventListener("click", () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen()
      .then(() => screen.orientation?.lock?.("landscape"))
      .catch(() => {});
  }
  fullscreenBtn.blur();
});

window.addEventListener("resize", resize);
resize();
reset();
canvas.focus();
requestAnimationFrame(frame);
