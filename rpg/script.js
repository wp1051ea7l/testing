const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d");
const statsEl = document.querySelector("#stats");
const logEl = document.querySelector("#log");
const TILE = 32;

// # tree, ~ water, = bridge, : path, W wall, D locked door, C chest,
// h potion, P player, S sage, g slime, B slime king, . grass
const MAP = [
  "################",
  "#P..:....~~~...#",
  "#...:....~~~.g.#",
  "#.S.:::::===...#",
  "#...:....~~~...#",
  "#.g.:....~~~.C.#",
  "#...:....~~~...#",
  "#...:::::::::..#",
  "#WWWWWWDWWWW...#",
  "#W.........W.g.#",
  "#W....B..h.W...#",
  "################",
];
const SOLID = new Set(["#", "~", "W", "D", "C"]);

let tiles, player, enemies, npc, effects, gameState, time;

function reset() {
  tiles = MAP.map((row) => row.split(""));
  enemies = [];
  effects = [];
  gameState = "play";
  tiles.forEach((row, y) => row.forEach((ch, x) => {
    const actor = { x, y, dx: x, dy: y, flash: 0 };
    if (ch === "P") player = { ...actor, hp: 10, maxHp: 10, atk: 1, xp: 0, level: 1, gold: 0, key: false, facing: 1 };
    if (ch === "S") npc = actor;
    if (ch === "g") enemies.push({ ...actor, hp: 3, atk: 1, boss: false });
    if (ch === "B") enemies.push({ ...actor, hp: 10, atk: 2, boss: true });
    if ("PSgB".includes(ch)) row[x] = ".";
  }));
  say("Talk to the sage on the left.");
}

function say(text) { logEl.textContent = text; }

function updateHud() {
  statsEl.textContent = `Lv ${player.level} · HP ${player.hp}/${player.maxHp} · XP ${player.xp}/${player.level * 4} · Gold ${player.gold}${player.key ? " · 🔑" : ""}`;
}

function actorAt(x, y) {
  return enemies.find((e) => e.x === x && e.y === y) || (npc.x === x && npc.y === y ? npc : null);
}

function popup(x, y, text, color) {
  effects.push({ x: x * TILE + TILE / 2, y: y * TILE, text, color, life: 1 });
}

function move(mx, my) {
  if (gameState !== "play") return;
  if (mx) player.facing = mx;
  const nx = player.x + mx;
  const ny = player.y + my;
  const target = actorAt(nx, ny);
  const tile = tiles[ny][nx];

  if (target === npc) {
    say(player.key ? "Sage: The king waits behind the door. Good luck!" : "Sage: A key lies in a chest across the bridge.");
  } else if (target) {
    attack(target);
  } else if (tile === "C") {
    tiles[ny][nx] = ".";
    player.key = true;
    player.gold += 10;
    popup(nx, ny, "+key", "#ffd75e");
    say("You found a key and 10 gold!");
  } else if (tile === "D") {
    if (player.key) {
      tiles[ny][nx] = ":";
      say("The door creaks open...");
    } else {
      say("The door is locked.");
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
  enemyTurn();
  updateHud();
}

function attack(enemy) {
  const dmg = player.atk + Math.floor(Math.random() * 2);
  enemy.hp -= dmg;
  enemy.flash = 1;
  popup(enemy.x, enemy.y, `-${dmg}`, "#fff");
  if (enemy.hp > 0) return say(`You hit the ${enemy.boss ? "slime king" : "slime"}.`);

  enemies = enemies.filter((e) => e !== enemy);
  const xp = enemy.boss ? 10 : 2;
  player.xp += xp;
  player.gold += enemy.boss ? 50 : 3;
  say(`Slime defeated! +${xp} XP`);
  if (player.xp >= player.level * 4) {
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
    say("You defeated the slime king! Press R to play again.");
  }
}

function enemyTurn() {
  for (const e of enemies) {
    const distX = player.x - e.x;
    const distY = player.y - e.y;
    if (Math.abs(distX) + Math.abs(distY) === 1) {
      if (Math.random() < 0.7) {
        player.hp -= e.atk;
        player.flash = 1;
        popup(player.x, player.y, `-${e.atk}`, "#ff6b6b");
      }
      continue;
    }
    // Chase when close, otherwise wander now and then.
    let step;
    if (Math.abs(distX) + Math.abs(distY) <= 4) {
      step = Math.abs(distX) > Math.abs(distY) ? [Math.sign(distX), 0] : [0, Math.sign(distY)];
    } else if (Math.random() < 0.4) {
      step = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
    } else continue;
    const nx = e.x + step[0];
    const ny = e.y + step[1];
    if (!SOLID.has(tiles[ny][nx]) && !actorAt(nx, ny) && !(nx === player.x && ny === player.y)) {
      e.x = nx;
      e.y = ny;
    }
  }
  if (player.hp <= 0) {
    player.hp = 0;
    gameState = "lost";
    say("You were defeated. Press R to try again.");
  }
}

// ---------- Drawing ----------

// Stable pseudo-random per tile so grass tufts don't flicker.
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

function drawTile(ch, x, y) {
  const px = x * TILE;
  const py = y * TILE;
  if (ch === "~") {
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
    return;
  }
  if (ch === "W") {
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
    return;
  }
  if (ch === "=") {
    ctx.fillStyle = "#3d7fc4";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#a8743f";
    ctx.fillRect(px, py + 3, TILE, TILE - 6);
    ctx.strokeStyle = "#7a5128";
    for (let k = 0; k < TILE; k += 8) ctx.strokeRect(px + k, py + 3, 8, TILE - 6);
    return;
  }
  if (ch === ":") {
    ctx.fillStyle = "#d6bd85";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#bfa26a";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(px + hash(x, y, i) * 28, py + hash(x, y, i + 5) * 28, 3, 3);
    }
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
  } else if (ch === "D") {
    ctx.fillStyle = "#7d7f86";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#8a5a2e";
    ctx.beginPath();
    ctx.roundRect(px + 4, py + 2, 24, 30, [12, 12, 0, 0]);
    ctx.fill();
    ctx.fillStyle = "#2a1a0e";
    ctx.beginPath();
    ctx.arc(px + 16, py + 17, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px + 15, py + 18, 2, 6);
  } else if (ch === "C") {
    ctx.fillStyle = "#8a5a2e";
    ctx.fillRect(px + 5, py + 10, 22, 16);
    ctx.fillStyle = "#a8743f";
    ctx.fillRect(px + 5, py + 8, 22, 7);
    ctx.fillStyle = "#ffd75e";
    ctx.fillRect(px + 5, py + 14, 22, 2);
    ctx.fillRect(px + 14, py + 13, 4, 6);
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

function drawSlime(e) {
  const size = e.boss ? 1.4 : 1;
  const squish = Math.sin(time * 5 + e.x) * 1.5;
  const cx = e.dx * TILE + 16;
  const base = e.dy * TILE + 16 + 10;
  const w = 11 * size + squish;
  const h = 14 * size - squish;
  drawShadow(cx, e.dy * TILE + 16, w);
  const flash = e.flash > 0 && Math.floor(time * 20) % 2;
  ctx.fillStyle = flash ? "#fff" : e.boss ? "#d1405a" : "#4fc46b";
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

function drawBanner(text) {
  ctx.fillStyle = "#000000a0";
  ctx.fillRect(0, canvas.height / 2 - 34, canvas.width, 68);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  ctx.font = "14px Trebuchet MS, sans-serif";
  ctx.fillText("Press R or Restart to play again", canvas.width / 2, canvas.height / 2 + 24);
}

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

  tiles.forEach((row, y) => row.forEach((ch, x) => drawTile(ch, x, y)));
  drawSage(npc);
  enemies.forEach(drawSlime);
  drawHero(player);

  ctx.textAlign = "center";
  ctx.font = "bold 13px Trebuchet MS, sans-serif";
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

  if (gameState === "won") drawBanner("Victory!");
  if (gameState === "lost") drawBanner("Game over");
  requestAnimationFrame(frame);
}

const KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR") {
    reset();
    updateHud();
    return;
  }
  const dir = KEYS[event.code];
  if (!dir) return;
  event.preventDefault();
  move(...dir);
});

document.querySelectorAll(".pad button").forEach((btn) => {
  btn.addEventListener("click", () => move(...DIRS[btn.dataset.dir]));
});

document.querySelector("#restart").addEventListener("click", () => {
  reset();
  updateHud();
});

reset();
updateHud();
requestAnimationFrame(frame);
