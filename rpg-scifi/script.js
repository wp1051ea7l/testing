const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const stage = document.querySelector("#stage");

// Drawing happens in "world units": one tile is TILE units, and the view is
// always VIEW_W × VIEW_H tiles (16:9). resize() maps units to device pixels.
const TILE = 32;
const VIEW_W = 16;
const VIEW_H = 9;
const SCREEN_W = VIEW_W * TILE;
const SCREEN_H = VIEW_H * TILE;

// # crystals, ~ coolant canal, = catwalk, : floor plating, s regolith,
// , bio-sprouts, r meteorite, H habitat dome, W bulkhead, D security door,
// C crate with the access card, $ credit crate, h medkit,
// P player, S commander, A astronaut, g drone, b sentry drone, B Overmind,
// . alien ground. (Same layout and rules as rpg/, sci-fi art.)
const MAP = [
  "################################################",
  "#...,..,..,.........~~~..........#####.###....$#",
  "#,.H,.H,#,#.........~~~...g....................#",
  "#.....,#.,#H.....r..~~~.......:::::::::::......#",
  "##,#....###,.......#~~~.......:.........:...h..#",
  "####..S.............~~~.......:.#...###.:......#",
  "##,#.:::::::::::::::===::::::::.##...#..:......#",
  "#.,..P..:,..........~~~.......:.#.......:...##.#",
  "#.......:.###.A.....~~~#.##...:.........:...##.#",
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
  g: { name: "drone", hp: 3, atk: 1, xp: 2, gold: 3, color: "#4fdc8b" },
  b: { name: "sentry drone", hp: 6, atk: 2, xp: 4, gold: 6, color: "#4aa8ff" },
  B: { name: "Overmind", hp: 16, atk: 3, xp: 10, gold: 50, color: "#ff4a5a", boss: true },
};
// People you talk to by walking into them. talk(n) gets how many times
// you've already talked to them, so lines can change.
const ASTRONAUT_LINES = [
  "My ship came down in your coolant canal. Is this whole planet run by robots?",
  "From orbit I saw a supply crate in the north-east, past the canal.",
  "The helmet stays on. I've seen what those drones do.",
  "Shut down the Overmind and maybe I can finally fix my radio in peace.",
];
const NPCS = {
  S: {
    name: "Commander",
    draw: drawCommander,
    talk: () => (player.key
      ? "The Overmind's facility lies to the south-east. Good luck, ranger!"
      : "A rogue AI, the Overmind, has seized the facility to the south-east. Its access card is in a supply crate in the north-east, across the canal."),
  },
  A: { name: "Astronaut", draw: drawAstronaut, talk: (n) => ASTRONAUT_LINES[n % ASTRONAUT_LINES.length] },
};

// The astronaut is an SVG. It's drawn once into a canvas at the current
// scale (and again on resize) so it stays crisp at any screen size.
const ASTRONAUT_H = 28; // world units tall
const astronautSvg = new Image();
let astronautSprite = null;
astronautSvg.onload = prerenderAstronaut;
astronautSvg.src = "astronaut.svg";

function prerenderAstronaut() {
  if (!astronautSvg.naturalWidth) return;
  const h = Math.round(ASTRONAUT_H * unit / TILE);
  const sprite = document.createElement("canvas");
  sprite.height = h;
  sprite.width = Math.round(h * astronautSvg.naturalWidth / astronautSvg.naturalHeight);
  sprite.getContext("2d").drawImage(astronautSvg, 0, 0, sprite.width, sprite.height);
  astronautSprite = sprite;
}

const MINIMAP_COLORS = {
  "#": "#4fc3d8", "~": "#13706f", "=": "#7d8494", ":": "#8d93a3", s: "#8a5b48",
  W: "#3a4152", D: "#ff4a5a", H: "#e6eaf0", r: "#3b3644", C: "#e8c23a", $: "#e8c23a",
};

let tiles, seen, player, enemies, npcs, effects, gameState, message, time = 0;
let unit = TILE;
let lastMove = 0;

function reset() {
  tiles = MAP.map((row) => row.split(""));
  seen = tiles.map((row) => row.map(() => false));
  enemies = [];
  npcs = [];
  effects = [];
  gameState = "play";
  tiles.forEach((row, y) => row.forEach((ch, x) => {
    const actor = { x, y, dx: x, dy: y, flash: 0 };
    if (ch === "P") player = { ...actor, hp: 10, maxHp: 10, atk: 1, xp: 0, level: 1, gold: 0, key: false, facing: 1 };
    if (NPCS[ch]) npcs.push({ ...actor, ...NPCS[ch], talks: 0 });
    if (ENEMIES[ch]) enemies.push({ ...actor, ...ENEMIES[ch] });
    if (ch === "P" || NPCS[ch] || ENEMIES[ch]) row[x] = ".";
  }));
  say("Find the commander at the colony. Arrow keys or WASD to move.");
}

// Largest exact 16:9 area that fits: unit = min(width / 16, height / 9),
// floored to whole device pixels. The leftover space stays black.
function resize() {
  const dpr = window.devicePixelRatio || 1;
  unit = Math.max(1, Math.floor(Math.min(innerWidth * dpr / VIEW_W, innerHeight * dpr / VIEW_H)));
  canvas.width = unit * VIEW_W;
  canvas.height = unit * VIEW_H;
  stage.style.width = `${canvas.width / dpr}px`;
  stage.style.height = `${canvas.height / dpr}px`;
  stage.style.setProperty("--u", `${unit / dpr}px`);
  prerenderAstronaut();
}

function say(text) {
  message = { text, time };
}

function actorAt(x, y) {
  return enemies.find((e) => e.x === x && e.y === y) || npcs.find((n) => n.x === x && n.y === y) || null;
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

  if (target?.talk) {
    say(`${target.name}: ${target.talk(target.talks++)}`);
  } else if (target) {
    attack(target);
  } else if (tile === "C" || tile === "$") {
    tiles[ny][nx] = "o";
    const gold = tile === "C" ? 10 : 25;
    player.gold += gold;
    if (tile === "C") {
      player.key = true;
      popup(nx, ny, "+card", "#5fe6ff");
      say(`You found the access card and ${gold} credits!`);
    } else {
      popup(nx, ny, `+${gold}`, "#ffd75e");
      say(`You found ${gold} credits!`);
    }
  } else if (tile === "D") {
    if (player.key) {
      tiles[ny][nx] = ":";
      say("The security door slides open...");
    } else {
      say("The security door is locked. You need an access card.");
    }
  } else if (!SOLID.has(tile)) {
    player.x = nx;
    player.y = ny;
    if (tile === "h") {
      tiles[ny][nx] = ".";
      player.hp = player.maxHp;
      popup(nx, ny, "healed", "#7be08f");
      say("You use a medkit. Fully healed!");
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
  say(`The ${enemy.name} is destroyed! +${enemy.xp} XP`);
  while (player.xp >= player.level * 4) {
    player.xp -= player.level * 4;
    player.level += 1;
    player.maxHp += 3;
    player.hp = player.maxHp;
    player.atk += 1;
    popup(player.x, player.y, "LEVEL UP", "#ffd75e");
    say(`Level up! You are now level ${player.level}.`);
  }
  if (enemy.boss) {
    gameState = "won";
    say("You shut down the Overmind!");
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

// ---------- World drawing ----------

// Stable pseudo-random per tile so details don't flicker.
function hash(x, y, n = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawGround(px, py, x, y) {
  ctx.fillStyle = (x + y) % 2 ? "#4b4763" : "#504b69";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = "#3d3a52";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(px + 4 + hash(x, y, i) * 24, py + 4 + hash(x, y, i + 9) * 24, 2.5, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Now and then a faintly glowing spore.
  if (hash(x, y, 40) > 0.7) {
    ctx.fillStyle = `rgba(140, 255, 220, ${0.35 + Math.sin(time * 2 + x * 3 + y) * 0.25})`;
    ctx.fillRect(px + hash(x, y, 41) * 28, py + hash(x, y, 42) * 28, 2, 2);
  }
}

function drawCoolant(px, py) {
  ctx.fillStyle = "#13706f";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.strokeStyle = "#5fe6d2";
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    const wy = py + 10 + i * 13;
    ctx.beginPath();
    for (let k = 0; k <= TILE; k += 4) {
      const off = Math.sin((px + k) / 6 + time * 3 + i * 2) * 2;
      k ? ctx.lineTo(px + k, wy + off) : ctx.moveTo(px + k, wy + off);
    }
    ctx.stroke();
  }
}

function drawSpeckled(px, py, x, y, base, speck) {
  ctx.fillStyle = base;
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = speck;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(px + hash(x, y, i) * 28, py + hash(x, y, i + 5) * 28, 3, 3);
  }
}

// Metal floor plates with rivets in the corners.
function drawPlating(px, py) {
  ctx.fillStyle = "#8d93a3";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.strokeStyle = "#6c7282";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  ctx.fillStyle = "#b4b9c6";
  for (const [rx, ry] of [[3, 3], [27, 3], [3, 27], [27, 27]]) ctx.fillRect(px + rx, py + ry, 2, 2);
}

function drawBulkhead(px, py, x, y) {
  ctx.fillStyle = "#3a4152";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.strokeStyle = "#262c3a";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, 14, 30);
  ctx.strokeRect(px + 17, py + 1, 14, 30);
  if (hash(x, y, 50) > 0.6) {
    ctx.fillStyle = Math.sin(time * 3 + x) > 0 ? "#5fe6ff" : "#2a6f80";
    ctx.fillRect(px + 5, py + 5, 3, 2);
  }
}

function drawCrate(px, py, open) {
  ctx.fillStyle = "#6b7385";
  ctx.fillRect(px + 5, py + 12, 22, 15);
  ctx.fillStyle = "#e8c23a";
  ctx.fillRect(px + 5, py + 22, 22, 2);
  if (open) {
    ctx.fillStyle = "#1a1f2a";
    ctx.fillRect(px + 7, py + 12, 18, 4);
    ctx.fillStyle = "#8b93a6";
    ctx.fillRect(px + 5, py + 3, 22, 6);
    return;
  }
  ctx.fillStyle = "#8b93a6";
  ctx.fillRect(px + 5, py + 8, 22, 6);
  ctx.fillStyle = Math.sin(time * 4) > 0 ? "#3cf0ff" : "#1fa8c0";
  ctx.fillRect(px + 14, py + 15, 4, 4);
}

function drawShard(x, tip, half, base, dark, light) {
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(x, tip);
  ctx.lineTo(x + half, tip + 7);
  ctx.lineTo(x + half * 0.8, base);
  ctx.lineTo(x - half * 0.8, base);
  ctx.lineTo(x - half, tip + 7);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(x, tip);
  ctx.lineTo(x, base);
  ctx.lineTo(x - half * 0.8, base);
  ctx.lineTo(x - half, tip + 7);
  ctx.fill();
}

function drawTile(ch, x, y) {
  const px = x * TILE;
  const py = y * TILE;
  if (ch === "~") return drawCoolant(px, py);
  if (ch === "W") return drawBulkhead(px, py, x, y);
  if (ch === ":") return drawPlating(px, py);
  if (ch === "s") return drawSpeckled(px, py, x, y, "#8a5b48", "#6f4636");
  if (ch === "=") {
    drawCoolant(px, py);
    const vertical = tiles[y - 1]?.[x] === "=" || tiles[y + 1]?.[x] === "=";
    ctx.save();
    if (vertical) {
      ctx.translate(px + TILE, py);
      ctx.rotate(Math.PI / 2);
    } else {
      ctx.translate(px, py);
    }
    // Catwalk: grille with hazard-striped edges.
    ctx.fillStyle = "#7d8494";
    ctx.fillRect(0, 3, TILE, TILE - 6);
    ctx.fillStyle = "#5f6575";
    for (let k = 2; k < TILE; k += 4) ctx.fillRect(k, 6, 1, TILE - 12);
    ctx.fillStyle = "#e8c23a";
    ctx.fillRect(0, 3, TILE, 2);
    ctx.fillRect(0, TILE - 5, TILE, 2);
    ctx.restore();
    return;
  }

  drawGround(px, py, x, y);
  if (ch === "#") {
    // Crystal spires.
    ctx.fillStyle = "#3a3650";
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 27, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    drawShard(px + 9, py + 11, 5, py + 27, "#2a7f95", "#4fc3d8");
    drawShard(px + 23, py + 9, 5, py + 27, "#2a7f95", "#4fc3d8");
    drawShard(px + 16, py + 2, 6, py + 28, "#3a9fb8", "#8ff0ff");
  } else if (ch === ",") {
    const glow = ["#7dffb0", "#ff7de0", "#7dd8ff"];
    for (let i = 0; i < 3; i++) {
      const fx = px + 6 + hash(x, y, i + 20) * 20;
      const fy = py + 8 + hash(x, y, i + 30) * 18;
      ctx.strokeStyle = "#3d6b5a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy + 6);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.globalAlpha = 0.75 + Math.sin(time * 3 + i * 2 + x) * 0.25;
      ctx.fillStyle = glow[i];
      ctx.beginPath();
      ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else if (ch === "r") {
    // Meteorite with glowing cracks.
    ctx.fillStyle = "#3b3644";
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 20, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a5466";
    ctx.beginPath();
    ctx.ellipse(px + 13, py + 17, 6, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ff8a3a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 9, py + 22);
    ctx.lineTo(px + 15, py + 19);
    ctx.lineTo(px + 18, py + 24);
    ctx.lineTo(px + 24, py + 20);
    ctx.stroke();
  } else if (ch === "H") {
    // Habitat dome.
    ctx.fillStyle = "#9aa3b2";
    ctx.fillRect(px + 3, py + 22, 26, 8);
    ctx.fillStyle = "#e6eaf0";
    ctx.beginPath();
    ctx.arc(px + 16, py + 22, 12, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#5fd8ff";
    ctx.beginPath();
    ctx.ellipse(px + 11, py + 17, 3.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a4152";
    ctx.fillRect(px + 15, py + 22, 7, 8);
    ctx.strokeStyle = "#9aa3b2";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 22, py + 12);
    ctx.lineTo(px + 25, py + 4);
    ctx.stroke();
    ctx.fillStyle = Math.sin(time * 4 + x) > 0 ? "#ff4a5a" : "#7a2a32";
    ctx.fillRect(px + 24, py + 2, 2, 2);
  } else if (ch === "D") {
    // Security door, locked until you have the card.
    drawBulkhead(px, py, x, y);
    ctx.fillStyle = "#5c6577";
    ctx.fillRect(px + 4, py + 2, 24, 30);
    ctx.fillStyle = "#262c3a";
    ctx.fillRect(px + 15, py + 2, 2, 30);
    ctx.fillStyle = "#e8c23a";
    ctx.fillRect(px + 4, py + 26, 24, 2);
    ctx.fillStyle = Math.sin(time * 5) > 0 ? "#ff4a5a" : "#7a2a32";
    ctx.fillRect(px + 13, py + 6, 6, 3);
  } else if (ch === "C" || ch === "$" || ch === "o") {
    drawCrate(px, py, ch === "o");
  } else if (ch === "h") {
    // Medkit.
    const bob = Math.sin(time * 4) * 2;
    ctx.fillStyle = "#9aa3ad";
    ctx.fillRect(px + 13, py + 8 + bob, 6, 3);
    ctx.fillStyle = "#eef2f5";
    ctx.fillRect(px + 8, py + 11 + bob, 16, 12);
    ctx.fillStyle = "#e0485b";
    ctx.fillRect(px + 14, py + 13 + bob, 4, 8);
    ctx.fillRect(px + 12, py + 15 + bob, 8, 4);
  }
}

function drawShadow(cx, cy, w) {
  ctx.fillStyle = "#00000040";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 12, w, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHero(p) {
  const cx = p.dx * TILE + 16;
  const cy = p.dy * TILE + 16 + Math.sin(time * 6) * 1;
  drawShadow(cx, p.dy * TILE + 16, 9);
  const flash = p.flash > 0 && Math.floor(time * 20) % 2;
  // energy blade
  const bx = cx + 9 * p.facing;
  ctx.fillStyle = "#2fd0ff60";
  ctx.fillRect(bx - 2, cy - 10, 5, 16);
  ctx.fillStyle = "#e8ffff";
  ctx.fillRect(bx, cy - 9, 1.5, 14);
  ctx.fillStyle = "#555c6b";
  ctx.fillRect(bx - 3, cy + 4, 7, 3);
  // jumpsuit
  ctx.fillStyle = flash ? "#fff" : "#e07b2e";
  ctx.beginPath();
  ctx.roundRect(cx - 7, cy - 2, 14, 14, 4);
  ctx.fill();
  ctx.fillStyle = flash ? "#fff" : "#3a3f4b";
  ctx.fillRect(cx - 7, cy + 5, 14, 2);
  // head, hair and visor
  ctx.fillStyle = flash ? "#fff" : "#f1c79b";
  ctx.beginPath();
  ctx.arc(cx, cy - 7, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2b2f3a";
  ctx.beginPath();
  ctx.arc(cx, cy - 9, 7, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#5fe6ff";
  ctx.fillRect(cx - 5 + p.facing, cy - 8, 10, 3);
}

// The commander is a hologram flickering above a projector.
function drawCommander(n) {
  const cx = n.dx * TILE + 16;
  const cy = n.dy * TILE + 16;
  ctx.fillStyle = "#3a4152";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 12, 9, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5fe6ff";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 11, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = (Math.random() < 0.04 ? 0.3 : 0.75) + Math.sin(time * 7) * 0.08;
  ctx.fillStyle = "#5fe6ff30";
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy + 11);
  ctx.lineTo(cx + 6, cy + 11);
  ctx.lineTo(cx + 11, cy - 20);
  ctx.lineTo(cx - 11, cy - 20);
  ctx.fill();
  ctx.fillStyle = "#7feeff";
  ctx.beginPath();
  ctx.roundRect(cx - 7, cy - 3, 14, 13, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - 8, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - 7, cy - 14, 14, 3);
  ctx.fillRect(cx - 5, cy - 18, 10, 4);
  // scanlines
  ctx.fillStyle = "#0b2a3a70";
  for (let y = cy - 18; y < cy + 10; y += 3) ctx.fillRect(cx - 8, y + ((time * 6) % 3), 16, 1);
  ctx.globalAlpha = 1;
}

function drawAstronaut(n) {
  const cx = n.dx * TILE + 16;
  drawShadow(cx, n.dy * TILE + 16, 8);
  if (!astronautSprite) return;
  // Bobs gently upward, like it's not used to this gravity yet.
  const float = (1 - Math.cos(time * 2)) * 1.5;
  const w = ASTRONAUT_H * astronautSprite.width / astronautSprite.height;
  ctx.drawImage(astronautSprite, cx - w / 2, n.dy * TILE + 29 - ASTRONAUT_H - float, w, ASTRONAUT_H);
}

// Hover drones: a metal sphere with an eye that watches you.
function drawDrone(e) {
  const size = e.boss ? 1.4 : 1;
  const hover = Math.sin(time * 4 + e.x) * 2;
  const cx = e.dx * TILE + 16;
  const cy = e.dy * TILE + 14 - (size - 1) * 10 + hover;
  const r = 9 * size;
  drawShadow(cx, e.dy * TILE + 16, 8 * size - hover * 0.5);
  const flash = e.flash > 0 && Math.floor(time * 20) % 2;
  ctx.fillStyle = e.color + "80";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r + 2, r * 0.5, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = flash ? "#fff" : "#5c6577";
  ctx.fillRect(cx - r - 4 * size, cy - 2, 4 * size, 4);
  ctx.fillRect(cx + r, cy - 2, 4 * size, 4);
  ctx.fillStyle = flash ? "#fff" : "#a3abbb";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = flash ? "#fff" : "#7d8596";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = "#1a1f2a";
  ctx.beginPath();
  ctx.arc(cx, cy - 1, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  const look = Math.max(-1.5, Math.min(1.5, player.dx - e.dx)) * size;
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(cx + look, cy - 1, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
  if (e.boss) {
    ctx.strokeStyle = "#a3abbb";
    ctx.lineWidth = 1.5;
    for (const ax of [-6, 0, 6]) {
      ctx.beginPath();
      ctx.moveTo(cx + ax * 0.6, cy - r + 2);
      ctx.lineTo(cx + ax, cy - r - 7);
      ctx.stroke();
      ctx.fillStyle = Math.sin(time * 6 + ax) > 0 ? e.color : "#7a2a32";
      ctx.fillRect(cx + ax - 1.5, cy - r - 9, 3, 3);
    }
  }
}

// ---------- HUD (drawn in screen units, SCREEN_W × SCREEN_H) ----------

const FONT = "Trebuchet MS, sans-serif";

function panel(x, y, w, h) {
  ctx.fillStyle = "#0b1424c8";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();
}

function bar(x, y, w, h, fraction, color) {
  ctx.fillStyle = "#00000080";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, fraction), h);
}

function wrapText(text, maxWidth) {
  const lines = [""];
  for (const word of text.split(" ")) {
    const test = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && lines[lines.length - 1]) lines.push(word);
    else lines[lines.length - 1] = test;
  }
  return lines;
}

function drawHud() {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  panel(8, 8, 136, 46);
  ctx.fillStyle = "#fff";
  ctx.font = `bold 11px ${FONT}`;
  ctx.fillText(`Lv ${player.level}`, 15, 21);
  ctx.font = `10px ${FONT}`;
  ctx.fillStyle = "#ffd75e";
  ctx.fillText(`${player.gold}cr${player.key ? "  💳" : ""}`, 50, 21);
  bar(15, 27, 122, 8, player.hp / player.maxHp, "#e0485b");
  bar(15, 40, 122, 4, player.xp / (player.level * 4), "#5fe6ff");
  ctx.fillStyle = "#fff";
  ctx.font = `bold 7px ${FONT}`;
  ctx.fillText(`${player.hp}/${player.maxHp}`, 17, 34);

  if (message && time - message.time < 6) {
    ctx.globalAlpha = Math.min(1, 6 - (time - message.time));
    ctx.font = `11px ${FONT}`;
    const lines = wrapText(message.text, 240);
    const h = 10 + lines.length * 14;
    panel(SCREEN_W / 2 - 130, SCREEN_H - 8 - h, 260, h);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    lines.forEach((line, i) => ctx.fillText(line, SCREEN_W / 2, SCREEN_H - 8 - h + 18 + i * 14));
    ctx.globalAlpha = 1;
  }

  drawMinimap();

  if (gameState !== "play") {
    ctx.fillStyle = "#000000a0";
    ctx.fillRect(0, SCREEN_H / 2 - 34, SCREEN_W, 68);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = `bold 28px ${FONT}`;
    ctx.fillText(gameState === "won" ? "Mission complete!" : "Mission failed", SCREEN_W / 2, SCREEN_H / 2 + 4);
    ctx.font = `12px ${FONT}`;
    ctx.fillText("Press R or ↻ to play again", SCREEN_W / 2, SCREEN_H / 2 + 24);
  }
}

function drawMinimap() {
  const s = 1.5;
  const mx = SCREEN_W - 8 - WORLD_W * s;
  const my = SCREEN_H - 8 - WORLD_H * s;
  panel(mx - 3, my - 3, WORLD_W * s + 6, WORLD_H * s + 6);
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (!seen[y][x]) continue;
      ctx.fillStyle = MINIMAP_COLORS[tiles[y][x]] || "#504b69";
      ctx.fillRect(mx + x * s, my + y * s, s, s);
    }
  }
  ctx.fillStyle = "#fff";
  ctx.fillRect(mx + player.x * s - 0.5, my + player.y * s - 0.5, s + 1, s + 1);
}

// ---------- Main loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  time = now / 1000;
  if (heldKeys.length && time - lastMove >= STEP_TIME) move(...KEYS[heldKeys.at(-1)]);

  // Ease drawn positions toward grid positions for smooth steps.
  for (const a of [player, ...npcs, ...enemies]) {
    a.dx += (a.x - a.dx) * Math.min(dt * 18, 1);
    a.dy += (a.y - a.dy) * Math.min(dt * 18, 1);
    a.flash = Math.max(0, a.flash - dt * 2.5);
  }

  // Camera follows the player, clamped to the world edges and snapped to
  // whole device pixels so tile edges never blur or seam.
  const camX = Math.min(Math.max(player.dx + 0.5 - VIEW_W / 2, 0), WORLD_W - VIEW_W);
  const camY = Math.min(Math.max(player.dy + 0.5 - VIEW_H / 2, 0), WORLD_H - VIEW_H);
  const scale = unit / TILE;
  ctx.setTransform(scale, 0, 0, scale, -Math.round(camX * unit), -Math.round(camY * unit));

  const x0 = Math.floor(camX);
  const y0 = Math.floor(camY);
  const x1 = Math.min(WORLD_W - 1, Math.ceil(camX + VIEW_W));
  const y1 = Math.min(WORLD_H - 1, Math.ceil(camY + VIEW_H));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      drawTile(tiles[y][x], x, y);
      seen[y][x] = true;
    }
  }
  const visible = (a) => a.dx > x0 - 2 && a.dx < x1 + 2 && a.dy > y0 - 2 && a.dy < y1 + 2;
  npcs.filter(visible).forEach((n) => n.draw(n));
  enemies.filter(visible).forEach(drawDrone);
  drawHero(player);

  ctx.textAlign = "center";
  ctx.font = `bold 13px ${FONT}`;
  for (const fx of effects) {
    fx.life -= dt;
    ctx.globalAlpha = Math.max(fx.life, 0);
    ctx.fillStyle = "#000";
    ctx.fillText(fx.text, fx.x + 1, fx.y - (1 - fx.life) * 20 + 1);
    ctx.fillStyle = fx.color;
    ctx.fillText(fx.text, fx.x, fx.y - (1 - fx.life) * 20);
  }
  ctx.globalAlpha = 1;
  effects = effects.filter((fx) => fx.life > 0);

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawHud();
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

// Held movement keys, most recent last. frame() keeps stepping while one is
// down, so walking starts right away instead of waiting for key repeat.
const heldKeys = [];
const STEP_TIME = 0.16;

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR") return reset();
  const dir = KEYS[event.code];
  if (!dir) return;
  event.preventDefault();
  if (event.repeat) return;
  if (!heldKeys.includes(event.code)) heldKeys.push(event.code);
  move(...dir);
});

window.addEventListener("keyup", (event) => {
  const i = heldKeys.indexOf(event.code);
  if (i >= 0) heldKeys.splice(i, 1);
});

window.addEventListener("blur", () => { heldKeys.length = 0; });

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
