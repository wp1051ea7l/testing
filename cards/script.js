const $ = (selector) => document.querySelector(selector);
const stage = $("#stage");

// Largest exact 16:9 area that fits: unit = min(width / 16, height / 9),
// floored to whole device pixels. The leftover space stays black.
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const unit = Math.max(1, Math.floor(Math.min(innerWidth * dpr / 16, innerHeight * dpr / 9)));
  stage.style.width = `${(unit * 16) / dpr}px`;
  stage.style.height = `${(unit * 9) / dpr}px`;
  stage.style.setProperty("--u", `${unit / dpr}px`);
}

// ---------- Rules ----------

const HERO_HP = 20;
const MAX_MANA = 10;
const MAX_BOARD = 5;
const MAX_HAND = 10;

// Keywords: taunt (must be attacked first), charge (attacks the turn it's
// played), shield (ignores the first damage it takes).
// cry = battlecry, runs when the minion is played. Spells have cast();
// target is "any", "friendly" or absent (no target).
const CARDS = {
  imp: { name: "Spark Imp", cost: 1, atk: 2, hp: 1, art: "😈" },
  squire: { name: "Squire", cost: 1, atk: 1, hp: 1, art: "🛡️", shield: true },
  wolf: { name: "Grey Wolf", cost: 2, atk: 3, hp: 2, art: "🐺" },
  golem: { name: "Mud Golem", cost: 2, atk: 1, hp: 4, art: "🗿", taunt: true },
  otter: { name: "River Scout", cost: 2, atk: 2, hp: 2, art: "🦦", text: "Battlecry: Draw a card.", cry: (p) => draw(p) },
  raider: { name: "Raider", cost: 3, atk: 3, hp: 2, art: "🏇", charge: true },
  medic: { name: "Field Medic", cost: 3, atk: 2, hp: 3, art: "⛑️", text: "Battlecry: Restore 4 Health to your hero.", cry: (p) => heal(p.hero, 4) },
  mage: {
    name: "Ember Mage", cost: 4, atk: 3, hp: 3, art: "🧙", text: "Battlecry: Deal 2 damage to a random enemy.",
    cry: (p) => damage(pick(characters(other(p))), 2),
  },
  bear: { name: "Cave Bear", cost: 4, atk: 4, hp: 5, art: "🐻" },
  knight: { name: "Sun Knight", cost: 5, atk: 4, hp: 4, art: "🤺", shield: true, taunt: true },
  drake: { name: "Storm Drake", cost: 6, atk: 6, hp: 6, art: "🐉" },
  zap: { name: "Zap", cost: 1, spell: true, art: "⚡", target: "any", text: "Deal 2 damage.", cast: (p, t) => damage(t, 2) },
  mend: { name: "Mend", cost: 1, spell: true, art: "💚", target: "friendly", text: "Restore 5 Health.", cast: (p, t) => heal(t, 5) },
  insight: { name: "Insight", cost: 3, spell: true, art: "📜", text: "Draw 2 cards.", cast: (p) => { draw(p); draw(p); } },
  wave: {
    name: "Flame Wave", cost: 4, spell: true, art: "🌋", text: "Deal 2 damage to all enemy minions.",
    cast: (p) => other(p).board.forEach((m) => damage(m, 2)),
  },
  fireball: { name: "Fireball", cost: 4, spell: true, art: "🔥", target: "any", text: "Deal 5 damage.", cast: (p, t) => damage(t, 5) },
};
for (const [id, card] of Object.entries(CARDS)) card.id = id;

const DECK = {
  imp: 2, squire: 1, wolf: 2, golem: 2, otter: 2, raider: 2, medic: 1, mage: 2,
  bear: 2, knight: 1, drake: 1, zap: 2, mend: 1, insight: 1, wave: 1, fireball: 1,
};

const KEYWORDS = {
  taunt: "Taunt: enemies must attack this first.",
  charge: "Charge: can attack right away.",
  shield: "Shield: ignores the first damage taken.",
};

let you, foe, current, busy, over, nextUid;
let gameId = 0;
const pops = [];
const game = { speed: 1 };

// Pauses for animations. A wait from a game that has since been restarted
// never resolves, so leftover turns from the old game just stop.
const wait = (ms) => {
  const id = gameId;
  return new Promise((resolve) => setTimeout(() => id === gameId && resolve(), ms * game.speed));
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const other = (p) => (p === you ? foe : you);
const alive = (c) => c.hp > 0;
const characters = (p) => [p.hero, ...p.board.filter(alive)];

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function makePlayer(id, name, art) {
  const deck = shuffle(Object.entries(DECK).flatMap(([cardId, n]) => Array(n).fill(CARDS[cardId])));
  return {
    id, deck, hand: [], board: [], mana: 0, maxMana: 0, fatigue: 0,
    hero: { uid: `${id}-hero`, kind: "hero", name, art, hp: HERO_HP, maxHp: HERO_HP },
  };
}

function find(uid) {
  for (const p of [you, foe]) {
    if (p.hero.uid === uid) return p.hero;
    const m = p.board.find((x) => x.uid === uid);
    if (m) return m;
  }
  return null;
}

function ownerOf(c) {
  return c === you.hero || you.board.includes(c) ? you : foe;
}

function draw(p) {
  if (!p.deck.length) {
    p.fatigue++;
    pop(p.hero, "Out of cards!", "info");
    damage(p.hero, p.fatigue);
    return;
  }
  const card = p.deck.pop();
  if (p.hand.length >= MAX_HAND) {
    pop(p.hero, `${card.name} burned`, "info");
    return;
  }
  p.hand.push({ uid: nextUid++, card });
}

function damage(c, amount) {
  if (!c || amount <= 0) return;
  if (c.shield) {
    c.shield = false;
    pop(c, "Blocked", "info");
    return;
  }
  c.hp -= amount;
  pop(c, `-${amount}`, "damage");
}

function heal(c, amount) {
  if (!c) return;
  const healed = Math.min(amount, c.maxHp - c.hp);
  c.hp += healed;
  pop(c, `+${healed}`, "heal");
}

function canAttack(m) {
  return current && current.board.includes(m) && alive(m) && m.atk > 0 && !m.attacked && (!m.sleeping || m.charge);
}

// Enemy characters a minion owned by p may attack (taunts must go first).
function attackTargets(p) {
  const enemy = other(p);
  const taunts = enemy.board.filter((m) => m.taunt && alive(m));
  return taunts.length ? taunts : characters(enemy);
}

function spellTargets(p, card) {
  if (card.target === "any") return [...characters(p), ...characters(other(p))];
  if (card.target === "friendly") return characters(p);
  return [];
}

function canPlay(p, card) {
  return card.cost <= p.mana && (card.spell || p.board.length < MAX_BOARD);
}

async function playCard(p, handIndex, target) {
  const { card } = p.hand[handIndex];
  p.mana -= card.cost;
  p.hand.splice(handIndex, 1);
  if (card.spell) {
    card.cast(p, target);
  } else {
    p.board.push({
      uid: nextUid++, kind: "minion", card,
      atk: card.atk, hp: card.hp, maxHp: card.hp,
      taunt: !!card.taunt, charge: !!card.charge, shield: !!card.shield,
      sleeping: true, attacked: false,
    });
    render();
    if (card.cry) {
      await wait(250);
      card.cry(p);
    }
  }
  render();
  await settle();
}

async function attack(attacker, target) {
  attacker.attacked = true;
  const from = elementOf(attacker);
  const to = elementOf(target);
  if (from && to && game.speed) {
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const dx = (b.x + b.width / 2 - (a.x + a.width / 2)) * 0.8;
    const dy = (b.y + b.height / 2 - (a.y + a.height / 2)) * 0.8;
    from.style.zIndex = 4;
    from.animate([
      { transform: "none" },
      { transform: "translateY(-6%) scale(1.12)", offset: 0.35 },
      { transform: `translate(${dx}px, ${dy}px) scale(1.12)`, offset: 0.65 },
      { transform: "none" },
    ], { duration: 520 * game.speed, easing: "ease-in-out" });
    await wait(340);
    from.style.zIndex = "";
  }
  damage(target, attacker.atk);
  if (target.kind === "minion") damage(attacker, target.atk);
  render();
  await settle();
}

// Removes dead minions (after a short fade) and checks for a winner.
async function settle() {
  const dead = [you, foe].some((p) => p.board.some((m) => !alive(m)));
  if (dead) {
    await wait(450);
    for (const p of [you, foe]) p.board = p.board.filter(alive);
    render();
  }
  if (!over && (!alive(you.hero) || !alive(foe.hero))) {
    over = true;
    await wait(500);
    const won = alive(you.hero);
    $("#result").className = won ? "win" : "lose";
    $("#result strong").textContent = won ? "Victory!" : "Defeat";
    $("#result").hidden = false;
  }
}

async function startTurn(p) {
  current = p;
  p.maxMana = Math.min(MAX_MANA, p.maxMana + 1);
  p.mana = p.maxMana;
  for (const m of p.board) m.sleeping = m.attacked = false;
  banner(p === you ? "Your turn" : "Opponent's turn");
  draw(p);
  render();
  await settle();
  await wait(700);
}

async function endTurn() {
  if (busy || over || current !== you) return;
  busy = true;
  clearSelection();
  await startTurn(foe);
  if (!over) await aiTurn();
  if (!over) await startTurn(you);
  busy = false;
  render();
}

// ---------- Opponent AI ----------
// Greedy and simple: play the priciest card that is worth playing, repeat,
// then attack with every ready minion, trading when it's a good deal.

function aiPlan(card) {
  const enemy = you;
  const hurt = (c) => c.maxHp - c.hp;
  if (!canPlay(foe, card)) return null;
  if (!card.spell) return {};
  if (card.id === "insight") return foe.hand.length <= 7 ? {} : null;
  if (card.id === "wave") return enemy.board.filter((m) => !m.shield).length >= 2 ? {} : null;
  if (card.id === "mend") {
    const target = characters(foe).filter((c) => hurt(c) >= 3).sort((a, b) => hurt(b) - hurt(a))[0];
    return target ? { target } : null;
  }
  // Damage spells: finish the enemy hero, else kill the best minion we can.
  const dmg = card.id === "zap" ? 2 : 5;
  if (enemy.hero.hp <= dmg) return { target: enemy.hero };
  const kill = enemy.board
    .filter((m) => !m.shield && m.hp <= dmg && (dmg === 2 || m.atk + m.hp >= 6))
    .sort((a, b) => b.atk - a.atk)[0];
  if (kill) return { target: kill };
  return card.id === "zap" && foe.mana > 3 ? { target: enemy.hero } : null;
}

function aiAttackTarget(m) {
  const targets = attackTargets(foe);
  const kills = (t) => !t.shield && m.atk >= t.hp;
  const survives = (t) => t.kind === "hero" || t.atk < m.hp || t.atk === 0;
  const minions = targets.filter((t) => t.kind === "minion");
  if (!targets.includes(you.hero)) {
    return minions.find((t) => kills(t) && survives(t)) || minions.find(kills) || minions.sort((a, b) => a.hp - b.hp)[0];
  }
  const readyDamage = foe.board.filter(canAttack).reduce((sum, x) => sum + x.atk, 0);
  if (readyDamage >= you.hero.hp) return you.hero;
  const value = minions
    .filter((t) => kills(t) && (survives(t) || t.atk + t.hp > m.atk + m.hp))
    .sort((a, b) => b.atk - a.atk)[0];
  return value || you.hero;
}

async function aiTurn() {
  await wait(400);
  for (;;) {
    if (over) return;
    const options = foe.hand
      .map((h, i) => ({ card: h.card, i, plan: aiPlan(h.card) }))
      .filter((o) => o.plan)
      .sort((a, b) => b.card.cost - a.card.cost);
    if (!options.length) break;
    const { card, i, plan } = options[0];
    await revealCard(card);
    await playCard(foe, i, plan.target);
    await wait(350);
  }
  for (const m of [...foe.board]) {
    if (over) return;
    if (!canAttack(m)) continue;
    const target = aiAttackTarget(m);
    if (!target) continue;
    await attack(m, target);
    await wait(300);
  }
  await wait(300);
}

async function revealCard(card) {
  const el = $("#reveal");
  el.innerHTML = cardHtml(card);
  el.hidden = false;
  await wait(1100);
  el.hidden = true;
}

// ---------- Rendering ----------

function cardHtml(card) {
  const stats = card.spell ? "" : `<span class="stat atk">${card.atk}</span><span class="stat hp">${card.hp}</span>`;
  const keys = ["taunt", "charge", "shield"].filter((k) => card[k]).map((k) => k[0].toUpperCase() + k.slice(1));
  const text = [keys.join(", "), card.text || ""].filter(Boolean).join(". ").replace(/^(Battlecry):/, "<b>$1:</b>");
  return `<div class="card ${card.spell ? "spell" : "minion"}">
    <span class="cost">${card.cost}</span>
    <div class="art">${card.art}</div>
    <div class="name">${card.name}</div>
    <div class="text">${text}</div>${stats}</div>`;
}

// Keeps one element per item (keyed by uid) so animations survive re-renders.
function sync(container, items, make, update) {
  const old = new Map([...container.children].map((el) => [el.dataset.key, el]));
  items.forEach((item, i) => {
    const key = String(item.uid);
    let el = old.get(key);
    if (el) old.delete(key);
    else el = make(item);
    el.dataset.key = key;
    update(el, item, i);
    if (container.children[i] !== el) container.insertBefore(el, container.children[i] || null);
  });
  old.forEach((el) => el.remove());
}

function elementOf(c) {
  return document.querySelector(`[data-uid="${c.uid}"]`);
}

function statHtml(c) {
  const atk = c.kind === "minion" ? `<span class="stat atk ${c.atk > c.card.atk ? "buffed" : ""}">${c.atk}</span>` : "";
  return `${atk}<span class="stat hp ${c.hp < c.maxHp ? "hurt" : ""}">${Math.max(0, c.hp)}</span>`;
}

function renderMinion(el, m, targets) {
  el.dataset.uid = m.uid;
  el.className = [
    "minion",
    m.taunt && "taunt", m.shield && "shield",
    !alive(m) && "dying",
    current === you && you.board.includes(m) && canAttack(m) && !busy && "ready",
    m.sleeping && !m.charge && "sleeping",
    targets.has(m) && "targetable",
    selection?.uid === m.uid && "selected",
  ].filter(Boolean).join(" ");
  const html = `<div class="portrait">${m.card.art}</div>${statHtml(m)}`;
  if (el.innerHTML !== html) el.innerHTML = html;
}

function newMinion() {
  const el = document.createElement("div");
  el.animate([{ transform: "scale(1.4)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 300 * game.speed || 1, easing: "ease-in" });
  return el;
}

function renderHero(el, p, targets) {
  const h = p.hero;
  el.dataset.uid = h.uid;
  el.className = ["hero", current === p && "turn", targets.has(h) && "targetable"].filter(Boolean).join(" ");
  el.innerHTML = `<div class="portrait">${h.art}</div>${statHtml(h)}<div class="name">${h.name}</div>`;
}

// Fan positions (in units) for card i of n, centred on x = 8.
function fan(i, n, step, width) {
  const offset = i - (n - 1) / 2;
  return { x: 8 + offset * step - width / 2, r: offset * 3, y: Math.abs(offset) ** 2 * 0.025 };
}

function render() {
  const aiming = selection && selectionTargets();
  const targets = new Set(aiming || []);

  renderHero($("#foe-hero"), foe, targets);
  renderHero($("#you-hero"), you, targets);
  for (const p of [you, foe]) {
    sync($(`#${p.id}-board`), p.board, newMinion, (el, m) => renderMinion(el, m, targets));
  }

  const handStep = Math.min(1.3, 8.4 / Math.max(1, you.hand.length));
  sync($("#hand"), you.hand, () => {
    const el = document.createElement("div");
    const u = stage.getBoundingClientRect().width / 16;
    el.animate([{ opacity: 0, translate: `0 ${u * 1.5}px` }, { opacity: 1, translate: "0 0" }], { duration: 300 * game.speed || 1 });
    return el;
  }, (el, h, i) => {
    const { x, r, y } = fan(i, you.hand.length, handStep, 1.6);
    el.dataset.hand = i;
    if (el.innerHTML === "" || el.dataset.card !== h.card.id) {
      el.innerHTML = cardHtml(h.card);
      el.dataset.card = h.card.id;
    }
    const inner = el.firstElementChild;
    inner.className = ["card", h.card.spell ? "spell" : "minion",
      current === you && !busy && canPlay(you, h.card) && "playable",
      selection?.hand === h.uid && "selected",
      drag?.held && selection?.hand === h.uid && "held"].filter(Boolean).join(" ");
    inner.style.setProperty("--x", x);
    inner.style.setProperty("--y", 6.9 + y);
    inner.style.setProperty("--r", `${r}deg`);
    if (!inner.classList.contains("held")) inner.style.transform = "";
  });

  const backStep = Math.min(0.75, 6 / Math.max(1, foe.hand.length));
  sync($("#foe-hand"), foe.hand, () => document.createElement("div"), (el, h, i) => {
    const { x, r } = fan(i, foe.hand.length, backStep, 1);
    el.className = "back";
    el.style.setProperty("--x", x);
    el.style.setProperty("--r", `${-r}deg`);
  });

  $("#you-mana").innerHTML = `<b>${you.mana}/${you.maxMana}</b>` +
    Array.from({ length: you.maxMana }, (_, i) => `<span class="gem ${i < you.mana ? "" : "spent"}"></span>`).join("");
  $("#foe-mana").textContent = `🔷 ${foe.mana}/${foe.maxMana}`;
  $("#foe-deck").innerHTML = `Deck ${foe.deck.length}<br>Hand ${foe.hand.length}`;
  $("#you-deck").innerHTML = `Deck ${you.deck.length}`;

  const button = $("#end-turn");
  button.disabled = current !== you || busy || over;
  button.textContent = current === you ? "End Turn" : "Enemy Turn";
  const moves = you.hand.some((h) => canPlay(you, h.card)) || you.board.some(canAttack);
  button.classList.toggle("done", current === you && !busy && !moves);

  flushPops();
  updateArrow();
}

function pop(c, text, type) {
  pops.push({ c, text, type });
}

function flushPops() {
  const rect = stage.getBoundingClientRect();
  const count = new Map();
  for (const { c, text, type } of pops.splice(0)) {
    const el = elementOf(c);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const n = count.get(c) || 0;
    count.set(c, n + 1);
    const div = document.createElement("div");
    div.className = `pop ${type}`;
    div.textContent = text;
    div.style.left = `${r.x + r.width / 2 - rect.x}px`;
    div.style.top = `${r.y + r.height * 0.45 - rect.y - n * r.height * 0.25}px`;
    $("#fx").append(div);
    setTimeout(() => div.remove(), 1000);
    if (type === "damage") {
      el.classList.remove("shake");
      void el.offsetWidth;
      el.classList.add("shake");
    }
  }
}

function banner(text, sub = "") {
  const el = $("#banner");
  el.hidden = true;
  void el.offsetWidth;
  el.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
  el.hidden = false;
  clearTimeout(banner.timer);
  banner.timer = setTimeout(() => (el.hidden = true), 1400);
}

// ---------- Input ----------
// Drag a card onto the board (or onto a target) to play it; drag a ready
// minion onto an enemy to attack. Tap-tap works too: tap to pick, tap the
// target. Everything goes through `selection`.

let selection = null; // { hand: uid } or { uid } (an attacking minion)
let drag = null;      // { x, y, moved, held }
let pointer = null;   // last pointer position in stage units

function selectedCard() {
  return selection?.hand !== undefined && you.hand.find((h) => h.uid === selection.hand);
}

function selectionTargets() {
  const h = selectedCard();
  if (h) return h.card.target ? spellTargets(you, h.card) : null;
  const m = selection && find(selection.uid);
  return m ? attackTargets(you) : null;
}

function clearSelection() {
  selection = null;
  drag = null;
  $("#you-board").classList.remove("drop");
  showInspect(null);
}

function toUnits(e) {
  const rect = stage.getBoundingClientRect();
  const u = rect.width / 16;
  return { x: (e.clientX - rect.left) / u, y: (e.clientY - rect.top) / u };
}

function targetAt(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-uid]");
  return el && find(Number(el.dataset.uid) || el.dataset.uid);
}

// Tries to finish the current selection at the pointer. Returns true if it
// played or attacked something.
function resolve(e) {
  const h = selectedCard();
  if (h) {
    const index = you.hand.indexOf(h);
    if (h.card.target) {
      const t = targetAt(e);
      if (!t || !spellTargets(you, h.card).includes(t)) return false;
      act(() => playCard(you, index, t));
      return true;
    }
    if (toUnits(e).y > 6.7 || !canPlay(you, h.card)) return false;
    act(() => playCard(you, index));
    return true;
  }
  const m = selection && find(selection.uid);
  const t = targetAt(e);
  if (!m || !t || !attackTargets(you).includes(t)) return false;
  act(() => attack(m, t));
  return true;
}

async function act(fn) {
  busy = true;
  clearSelection();
  render();
  await fn();
  busy = false;
  render();
}

stage.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button, a")) return;
  pointer = toUnits(e);
  if (busy || over || current !== you) return;
  const handEl = e.target.closest("[data-hand]");
  const h = handEl && you.hand[Number(handEl.dataset.hand)];
  if (selection && !(h && selection.hand === h.uid) && resolve(e)) return;

  const t = targetAt(e);
  if (h && canPlay(you, h.card)) {
    selection = { hand: h.uid };
    showInspect(null);
  } else if (t && you.board.includes(t) && canAttack(t)) {
    selection = { uid: t.uid };
    showInspect(t.card, t);
  } else {
    clearSelection();
    render();
    return;
  }
  drag = { x: e.clientX, y: e.clientY, moved: false, held: false };
  render();
});

stage.addEventListener("pointermove", (e) => {
  pointer = toUnits(e);
  if (!selection) {
    hoverInspect(e);
    return;
  }
  if (drag && !drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
    drag.moved = true;
    const h = selectedCard();
    if (h && !h.card.target) {
      drag.held = true;
      $("#you-board").classList.add("drop");
      render();
    }
  }
  if (drag?.held) moveHeldCard(e);
  updateArrow();
});

stage.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  if (moved) {
    if (!resolve(e)) clearSelection();
    render();
  }
});

stage.addEventListener("pointerleave", () => {
  if (!selection) showInspect(null);
});

function moveHeldCard(e) {
  const card = $(`#hand [data-key="${selection.hand}"] .card`);
  if (!card) return;
  const rect = stage.getBoundingClientRect();
  const u = rect.width / 16;
  card.style.transform = `translate(${e.clientX - rect.left - 0.8 * u}px, ${e.clientY - rect.top - 1.1 * u}px) scale(0.9)`;
}

function updateArrow() {
  const svg = $("#arrow");
  const needsArrow = selection && selectionTargets() && pointer && (drag?.moved || !drag);
  svg.style.display = needsArrow ? "" : "none";
  if (!needsArrow) return;
  const src = selection.uid ? elementOf({ uid: selection.uid }) : $(`#hand [data-key="${selection.hand}"] .card`);
  if (!src) return;
  const rect = stage.getBoundingClientRect();
  const u = rect.width / 16;
  const r = src.getBoundingClientRect();
  const sx = (r.x + r.width / 2 - rect.x) / u;
  const sy = (r.y + r.height / 2 - rect.y) / u;
  const { x, y } = pointer;
  const mx = (sx + x) / 2;
  const my = Math.min(sy, y) - Math.abs(x - sx) * 0.15 - 0.3;
  svg.querySelector("path").setAttribute("d", `M${sx} ${sy} Q${mx} ${my} ${x} ${y}`);
  svg.querySelector("circle").setAttribute("cx", x);
  svg.querySelector("circle").setAttribute("cy", y);
}

function showInspect(card, minion) {
  const el = $("#inspect");
  if (!card) {
    el.hidden = true;
    el.dataset.key = "";
    return;
  }
  const key = `${card.id}:${minion?.uid ?? ""}:${minion?.hp}:${minion?.shield}`;
  if (el.dataset.key === key && !el.hidden) return;
  el.dataset.key = key;
  const keys = ["taunt", "charge", "shield"].filter((k) => card[k]).map((k) => KEYWORDS[k]);
  el.innerHTML = cardHtml(card) + (keys.length ? `<div class="keywords">${keys.join("<br>")}</div>` : "");
  el.hidden = false;
}

function hoverInspect(e) {
  if (!matchMedia("(hover: hover)").matches) return;
  const c = targetAt(e);
  showInspect(c?.kind === "minion" ? c.card : null, c);
}

$("#end-turn").addEventListener("click", endTurn);
addEventListener("keydown", (e) => {
  if (e.key === "Escape") { clearSelection(); render(); }
  if (e.key === "e" || e.key === "E") endTurn();
});

// ---------- Setup ----------

async function newGame() {
  gameId++;
  over = false;
  busy = true;
  nextUid = 1;
  selection = drag = null;
  current = null;
  you = makePlayer("you", "You", "🧝");
  foe = makePlayer("foe", "Warlord Grub", "👹");
  for (const id of ["you-board", "foe-board", "hand", "foe-hand", "fx"]) $(`#${id}`).replaceChildren();
  $("#result").hidden = true;
  showInspect(null);
  for (let i = 0; i < 3; i++) draw(you);
  for (let i = 0; i < 4; i++) draw(foe);
  render();
  banner("Card Duel", "Drag cards onto the table · drag minions onto enemies · E to end turn");
  await wait(1600);
  await startTurn(you);
  busy = false;
  render();
}

$("#result button").addEventListener("click", newGame);
$("#restart").addEventListener("click", newGame);

// Fullscreen removes browser chrome so the 16:9 area can grow; on phones
// we also try to lock landscape (unsupported browsers just ignore it).
const fullscreenBtn = $("#fullscreen");
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

addEventListener("resize", () => { resize(); render(); });
resize();
newGame();

// Handy for testing from the console. Set game.speed = 0 to skip animations.
Object.defineProperties(game, Object.getOwnPropertyDescriptors({
  get you() { return you; },
  get foe() { return foe; },
  get current() { return current; },
  get busy() { return busy; },
  get over() { return over; },
  play: (i, targetUid) => act(() => playCard(you, i, targetUid && find(targetUid))),
  attack: (uid, targetUid) => act(() => attack(find(uid), find(targetUid))),
  endTurn,
  newGame,
  canPlay: (card) => canPlay(you, card),
  canAttack,
  attackTargets: () => attackTargets(you),
  spellTargets: (card) => spellTargets(you, card),
}));
window.game = game;
