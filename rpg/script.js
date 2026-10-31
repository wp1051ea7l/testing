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

// # tree, ~ water, = bridge, : path, s sand, , flowers, r rock, H hut,
// W wall, D locked door, C key chest, $ gold chest, h potion,
// P player, S sage, A astronaut, g slime, b blue slime, B slime king, . grass
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
  "#,,.....:.,###..A...~~~#......:..b..##.........#",
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
  g: { name: "slime", hp: 3, atk: 1, xp: 2, gold: 3, color: "#4fc46b" },
  b: { name: "blue slime", hp: 6, atk: 2, xp: 4, gold: 6, color: "#4a8be0" },
  B: { name: "slime king", hp: 16, atk: 3, xp: 10, gold: 50, color: "#d1405a", boss: true },
};
// People you talk to by walking into them. talk(n) gets how many times
// you've already talked to them, so lines can change.
const ASTRONAUT_LINES = [
  "My ship came down in your river. Is this... a planet of slimes?",
  "From orbit I saw a chest glinting in the north-east, past the river.",
  "The helmet stays on. I've seen what those slimes do.",
  "If you beat the slime king, maybe I can finally fix my radio in peace.",
];
const NPCS = {
  S: {
    name: "Sage",
    draw: drawSage,
    talk: () => (player.key
      ? "The slime king's castle lies to the south-east. Good luck!"
      : "The slime king hides in the south-east castle. Its key is in a chest in the north-east, across the river."),
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
  "#": "#2f6b34", "~": "#3d7fc4", "=": "#a8743f", ":": "#d6bd85", s: "#e3d08f",
  W: "#7d7f86", D: "#8a5a2e", H: "#b5523b", r: "#8c8c8c", C: "#ffd75e", $: "#ffd75e",
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
  say("Find the sage in the village. Arrow keys or WASD to move.");
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
    popup(player.x, player.y, "LEVEL UP", "#ffd75e");
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

// ---------- World drawing ----------

// Stable pseudo-random per tile so details don't flicker.
function hash(x, y, n = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawGrass(px, py, x, y) {
  ctx.fillStyle = (x + y) % 2 ? "#6aa85a" : "#71af60";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.strokeStyle = "#4f8a43";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const gx = px + 4 + hash(x, y, i) * 24;
    const gy = py + 8 + hash(x, y, i + 9) * 20;
    ctx.beginPath();
    ctx.moveTo(gx - 2, gy - 4);
    ctx.lineTo(gx, gy);
    ctx.lineTo(gx + 2, gy - 4);
    ctx.stroke();
  }
}

function drawWater(px, py) {
  ctx.fillStyle = "#3d7fc4";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.strokeStyle = "#7fb6ea";
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

function drawWall(px, py) {
  ctx.fillStyle = "#7d7f86";
  ctx.fillRect(px, py, TILE, TILE);
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, TILE, TILE);
  ctx.clip();
  ctx.strokeStyle = "#5a5c63";
  ctx.lineWidth = 2;
  for (let r = 0; r < 4; r++) {
    for (let k = r % 2 ? -8 : 0; k < TILE; k += 16) ctx.strokeRect(px + k, py + r * 8, 16, 8);
  }
  ctx.restore();
}

function drawChest(px, py, open) {
  ctx.fillStyle = "#8a5a2e";
  ctx.fillRect(px + 5, py + 12, 22, 14);
  if (open) {
    ctx.fillStyle = "#2a1a0e";
    ctx.fillRect(px + 7, py + 12, 18, 4);
    ctx.fillStyle = "#a8743f";
    ctx.fillRect(px + 5, py + 3, 22, 8);
    return;
  }
  ctx.fillStyle = "#a8743f";
  ctx.fillRect(px + 5, py + 8, 22, 7);
  ctx.fillStyle = "#ffd75e";
  ctx.fillRect(px + 5, py + 14, 22, 2);
  ctx.fillRect(px + 14, py + 13, 4, 6);
}

function drawTile(ch, x, y) {
  const px = x * TILE;
  const py = y * TILE;
  if (ch === "~") return drawWater(px, py);
  if (ch === "W") return drawWall(px, py);
  if (ch === ":") return drawSpeckled(px, py, x, y, "#d6bd85", "#bfa26a");
  if (ch === "s") return drawSpeckled(px, py, x, y, "#e3d08f", "#cdb672");
  if (ch === "=") {
    drawWater(px, py);
    const vertical = tiles[y - 1]?.[x] === "=" || tiles[y + 1]?.[x] === "=";
    ctx.save();
    if (vertical) {
      ctx.translate(px + TILE, py);
      ctx.rotate(Math.PI / 2);
    } else {
      ctx.translate(px, py);
    }
    ctx.fillStyle = "#a8743f";
    ctx.fillRect(0, 3, TILE, TILE - 6);
    ctx.strokeStyle = "#7a5128";
    ctx.lineWidth = 1;
    for (let k = 0; k < TILE; k += 8) ctx.strokeRect(k, 3, 8, TILE - 6);
    ctx.restore();
    return;
  }

  drawGrass(px, py, x, y);
  if (ch === "#") {
    ctx.fillStyle = "#6b4426";
    ctx.fillRect(px + 13, py + 18, 6, 12);
    ctx.fillStyle = "#2f6b34";
    ctx.beginPath();
    ctx.arc(px + 16, py + 14, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3f8645";
    ctx.beginPath();
    ctx.arc(px + 12, py + 10, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (ch === ",") {
    const petals = ["#f5e663", "#f28bb3", "#ffffff"];
    for (let i = 0; i < 3; i++) {
      const fx = px + 6 + hash(x, y, i + 20) * 20;
      const fy = py + 6 + hash(x, y, i + 30) * 20;
      ctx.fillStyle = petals[i];
      ctx.beginPath();
      ctx.arc(fx, fy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e08a2c";
      ctx.fillRect(fx - 1, fy - 1, 2, 2);
    }
  } else if (ch === "r") {
    ctx.fillStyle = "#6f7177";
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 20, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9a9ca3";
    ctx.beginPath();
    ctx.ellipse(px + 13, py + 17, 6, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (ch === "H") {
    ctx.fillStyle = "#c9a46a";
    ctx.fillRect(px + 5, py + 15, 22, 15);
    ctx.fillStyle = "#b5523b";
    ctx.beginPath();
    ctx.moveTo(px + 2, py + 16);
    ctx.lineTo(px + 16, py + 3);
    ctx.lineTo(px + 30, py + 16);
    ctx.fill();
    ctx.fillStyle = "#6b4426";
    ctx.fillRect(px + 13, py + 21, 7, 9);
    ctx.fillStyle = "#ffe08a";
    ctx.fillRect(px + 7, py + 19, 4, 4);
  } else if (ch === "D") {
    drawWall(px, py);
    ctx.fillStyle = "#8a5a2e";
    ctx.beginPath();
    ctx.roundRect(px + 4, py + 2, 24, 30, [12, 12, 0, 0]);
    ctx.fill();
    ctx.fillStyle = "#2a1a0e";
    ctx.beginPath();
    ctx.arc(px + 16, py + 17, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px + 15, py + 18, 2, 6);
  } else if (ch === "C" || ch === "$" || ch === "o") {
    drawChest(px, py, ch === "o");
  } else if (ch === "h") {
    const bob = Math.sin(time * 4) * 2;
    ctx.fillStyle = "#e0e6ea";
    ctx.fillRect(px + 13, py + 7 + bob, 6, 5);
    ctx.fillStyle = "#e0485b";
    ctx.beginPath();
    ctx.arc(px + 16, py + 19 + bob, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff99";
    ctx.fillRect(px + 12, py + 15 + bob, 3, 3);
  }
}

function drawShadow(cx, cy, w) {
  ctx.fillStyle = "#00000030";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 12, w, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHero(p) {
  const cx = p.dx * TILE + 16;
  const cy = p.dy * TILE + 16 + Math.sin(time * 6) * 1;
  drawShadow(cx, p.dy * TILE + 16, 9);
  const flash = p.flash > 0 && Math.floor(time * 20) % 2;
  // sword
  ctx.fillStyle = "#d9dde3";
  ctx.fillRect(cx + 9 * p.facing - 1, cy - 8, 3, 14);
  ctx.fillStyle = "#8a5a2e";
  ctx.fillRect(cx + 9 * p.facing - 3, cy + 4, 7, 3);
  // body
  ctx.fillStyle = flash ? "#fff" : "#3a6fd1";
  ctx.beginPath();
  ctx.roundRect(cx - 7, cy - 2, 14, 14, 4);
  ctx.fill();
  // head
  ctx.fillStyle = flash ? "#fff" : "#f1c79b";
  ctx.beginPath();
  ctx.arc(cx, cy - 7, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b3e1f";
  ctx.beginPath();
  ctx.arc(cx, cy - 9, 7, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.fillRect(cx - 3 + p.facing, cy - 7, 2, 2);
  ctx.fillRect(cx + 1 + p.facing, cy - 7, 2, 2);
}

function drawSage(n) {
  const cx = n.dx * TILE + 16;
  const cy = n.dy * TILE + 16;
  drawShadow(cx, cy, 9);
  ctx.fillStyle = "#7a4fb8";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx + 10, cy + 13);
  ctx.lineTo(cx - 10, cy + 13);
  ctx.fill();
  ctx.fillStyle = "#f1c79b";
  ctx.beginPath();
  ctx.arc(cx, cy - 6, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#eee";
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - 4);
  ctx.lineTo(cx + 5, cy - 4);
  ctx.lineTo(cx, cy + 6);
  ctx.fill();
  ctx.fillStyle = "#5a3790";
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy - 9);
  ctx.lineTo(cx + 9, cy - 9);
  ctx.lineTo(cx + 2, cy - 22);
  ctx.fill();
  ctx.fillStyle = "#8a5a2e";
  ctx.fillRect(cx + 11, cy - 12, 2, 25);
  ctx.fillStyle = "#7fe0ff";
  ctx.beginPath();
  ctx.arc(cx + 12, cy - 13, 3 + Math.sin(time * 5), 0, Math.PI * 2);
  ctx.fill();
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

function drawSlime(e) {
  const size = e.boss ? 1.4 : 1;
  const squish = Math.sin(time * 5 + e.x) * 1.5;
  const cx = e.dx * TILE + 16;
  const base = e.dy * TILE + 16 + 10;
  const w = 11 * size + squish;
  const h = 14 * size - squish;
  drawShadow(cx, e.dy * TILE + 16, w);
  const flash = e.flash > 0 && Math.floor(time * 20) % 2;
  ctx.fillStyle = flash ? "#fff" : e.color;
  ctx.beginPath();
  ctx.moveTo(cx - w, base);
  ctx.quadraticCurveTo(cx - w, base - h * 1.4, cx, base - h * 1.4);
  ctx.quadraticCurveTo(cx + w, base - h * 1.4, cx + w, base);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff70";
  ctx.beginPath();
  ctx.arc(cx - w / 2, base - h, 2.5 * size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.fillRect(cx - 5 * size, base - h * 0.7, 3, 4);
  ctx.fillRect(cx + 3 * size, base - h * 0.7, 3, 4);
  if (e.boss) {
    const top = base - h * 1.4;
    ctx.fillStyle = "#ffd75e";
    ctx.beginPath();
    ctx.moveTo(cx - 8, top + 2);
    ctx.lineTo(cx - 8, top - 8);
    ctx.lineTo(cx - 4, top - 3);
    ctx.lineTo(cx, top - 10);
    ctx.lineTo(cx + 4, top - 3);
    ctx.lineTo(cx + 8, top - 8);
    ctx.lineTo(cx + 8, top + 2);
    ctx.fill();
  }
}

// ---------- HUD (drawn in screen units, SCREEN_W × SCREEN_H) ----------

const FONT = "Trebuchet MS, sans-serif";

function panel(x, y, w, h) {
  ctx.fillStyle = "#0f1a14c0";
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
  ctx.fillText(`${player.gold}g${player.key ? "  🔑" : ""}`, 50, 21);
  bar(15, 27, 122, 8, player.hp / player.maxHp, "#e0485b");
  bar(15, 40, 122, 4, player.xp / (player.level * 4), "#7fb6ea");
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
    ctx.fillText(gameState === "won" ? "Victory!" : "Game over", SCREEN_W / 2, SCREEN_H / 2 + 4);
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
      ctx.fillStyle = MINIMAP_COLORS[tiles[y][x]] || "#6aa85a";
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
  enemies.filter(visible).forEach(drawSlime);
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
