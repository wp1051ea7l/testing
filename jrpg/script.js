import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#game");
const stage = $("#stage");
const V3 = THREE.Vector3;

// ---------- Renderer and 16:9 sizing ----------

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

// Largest exact 16:9 area that fits: unit = min(width / 16, height / 9),
// floored to whole device pixels. The leftover space stays black.
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const unit = Math.max(1, Math.floor(Math.min(innerWidth * dpr / 16, innerHeight * dpr / 9)));
  renderer.setSize(unit * 16, unit * 9, false);
  stage.style.width = `${(unit * 16) / dpr}px`;
  stage.style.height = `${(unit * 9) / dpr}px`;
  stage.style.setProperty("--u", `${unit / dpr}px`);
}

// ---------- Small helpers ----------

const tweens = new Set();
const ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 2,
  in: (t) => t * t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
};

// Runs fn(t) every frame for `duration` seconds, t going 0 → 1.
function tween(duration, fn, easing = ease.inOut) {
  return new Promise((resolve) => tweens.add({ t: 0, duration, fn, easing, resolve }));
}

function updateTweens(dt) {
  for (const tw of [...tweens]) {
    tw.t = Math.min(1, tw.t + dt / tw.duration);
    tw.fn(tw.easing(tw.t));
    if (tw.t >= 1) {
      tweens.delete(tw);
      tw.resolve();
    }
  }
}

const wait = (seconds) => tween(seconds, () => {});
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Deterministic random so the field layout is the same every visit.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const materials = new Map();
function mat(color, options = {}) {
  const key = color + JSON.stringify(options);
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...options }));
  }
  return materials.get(key);
}

function mesh(geometry, color, x = 0, y = 0, z = 0, options) {
  const m = new THREE.Mesh(geometry, typeof color === "string" ? mat(color, options) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const box = (w, h, d, color, x, y, z, options) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, options);
const glow = (color, intensity = 1.5) => ({ emissive: color, emissiveIntensity: intensity });

function canvasTexture(size, repeatX, repeatY, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

function noiseTexture(base, specks, repeatX, repeatY) {
  return canvasTexture(128, repeatX, repeatY, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = pick(specks);
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
  });
}

function cobbleTexture(repeatX, repeatY) {
  return canvasTexture(256, repeatX, repeatY, (g, s) => {
    g.fillStyle = "#3a3540";
    g.fillRect(0, 0, s, s);
    const n = 8;
    const cell = s / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const shade = 95 + Math.random() * 40;
        g.fillStyle = `rgb(${shade + 12}, ${shade}, ${shade - 6})`;
        g.beginPath();
        g.roundRect(x * cell + 3 + (y % 2) * cell / 2 - cell / 2, y * cell + 3, cell - 6, cell - 6, 8);
        g.roundRect(x * cell + 3 + (y % 2) * cell / 2 + cell / 2, y * cell + 3, cell - 6, cell - 6, 8);
        g.fill();
      }
    }
  });
}

function skyTexture(stops) {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const g = c.getContext("2d");
  const gradient = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([at, color]) => gradient.addColorStop(at, color));
  g.fillStyle = gradient;
  g.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function ground(texture, w, d, x, z, y = 0) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(x, y, z);
  plane.receiveShadow = true;
  plane.userData.dynamic = true;
  return plane;
}

// Merge all static scenery into one mesh per material: hundreds of draw
// calls become a few dozen. Anything flagged userData.dynamic is left alone.
function mergeStatic(scene) {
  scene.updateMatrixWorld(true);
  const buckets = new Map();
  const merged = [];
  (function walk(object) {
    for (const child of object.children) {
      if (child.userData.dynamic) continue;
      if (child.isMesh) {
        const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        geometry.applyMatrix4(child.matrixWorld);
        if (!buckets.has(child.material)) buckets.set(child.material, []);
        buckets.get(child.material).push(geometry);
        merged.push(child);
      }
      walk(child);
    }
  })(scene);
  merged.forEach((m) => m.removeFromParent());
  for (const [material, geometries] of buckets) {
    const combined = new THREE.Mesh(mergeGeometries(geometries), material);
    combined.castShadow = combined.receiveShadow = true;
    scene.add(combined);
    geometries.forEach((g) => g.dispose());
  }
}

function face(object, x, z) {
  object.rotation.y = Math.atan2(x - object.position.x, z - object.position.z);
}

function turnToward(object, angle, amount) {
  let diff = angle - object.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  object.rotation.y += diff * amount;
}

// ---------- Models (all built from primitives) ----------

// A chunky low-poly person. Model faces +z; limbs pivot at hips/shoulders.
function makeHumanoid(look, weaponInHand = false) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.17 * side, 0.95, 0);
    pivot.add(box(0.26, 0.95, 0.3, look.bottom, 0, -0.47, 0));
    pivot.add(box(0.3, 0.16, 0.42, look.boots, 0, -0.88, 0.05));
    body.add(pivot);
    return pivot;
  });

  body.add(box(0.72, 0.78, 0.42, look.top, 0, 1.36, 0));
  body.add(box(0.76, 0.12, 0.46, look.accent, 0, 1.0, 0));
  if (look.pads) [-1, 1].forEach((s) => body.add(box(0.32, 0.18, 0.5, look.accent, 0.5 * s, 1.8, 0)));
  if (look.robe) body.add(box(0.78, 0.6, 0.48, look.top, 0, 0.62, 0));

  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.48 * side, 1.68, 0);
    pivot.add(box(0.2, 0.72, 0.24, look.sleeve ?? look.top, 0, -0.34, 0));
    const fist = look.fists ? 0.32 : 0.2;
    pivot.add(box(fist, look.fists ? 0.26 : 0.2, fist, look.fists ? look.accent : look.skin, 0, -0.78, 0));
    body.add(pivot);
    return pivot;
  });

  const head = new THREE.Group();
  head.position.set(0, 1.95, 0);
  body.add(head);
  head.add(box(0.46, 0.5, 0.46, look.skin, 0, 0.1, 0));
  [-1, 1].forEach((s) => head.add(box(0.07, 0.09, 0.02, "#1a1a2a", 0.1 * s, 0.13, 0.235)));

  if (look.hairStyle === "spiky") {
    head.add(box(0.52, 0.18, 0.52, look.hair, 0, 0.38, -0.02));
    const spikes = [[0, 0.5, -0.1, -0.5, 0], [-0.18, 0.45, -0.05, -0.4, 0.5], [0.18, 0.45, -0.05, -0.4, -0.5],
      [0, 0.35, -0.3, -1.3, 0], [-0.2, 0.3, -0.25, -1.1, 0.6], [0.2, 0.3, -0.25, -1.1, -0.6], [0, 0.5, 0.15, 0.4, 0]];
    for (const [x, y, z, rx, rz] of spikes) {
      const spike = mesh(new THREE.ConeGeometry(0.13, 0.5, 4), look.hair, x, y, z);
      spike.rotation.set(rx, 0, rz);
      head.add(spike);
    }
  } else if (look.hairStyle === "long") {
    head.add(box(0.52, 0.16, 0.52, look.hair, 0, 0.38, 0));
    head.add(box(0.52, 0.8, 0.14, look.hair, 0, -0.05, -0.24));
    [-1, 1].forEach((s) => head.add(box(0.08, 0.45, 0.4, look.hair, 0.25 * s, 0.12, -0.02)));
  } else {
    head.add(box(0.5, 0.12, 0.5, look.hair, 0, 0.38, 0));
  }
  if (look.beard) head.add(box(0.42, 0.24, 0.1, look.beard, 0, -0.1, 0.23));

  let weapon = null;
  if (look.weapon === "sword") {
    // Built along +z: a broad blade, guard and grip.
    weapon = new THREE.Group();
    weapon.add(box(0.08, 0.3, 1.5, "#c9ced6", 0, 0, 0.95, { metalness: 0.6, roughness: 0.35 }));
    weapon.add(box(0.12, 0.1, 0.12, "#8a7a50", 0, 0, 0.18));
    weapon.add(box(0.1, 0.42, 0.1, "#8a7a50", 0, 0, 0.2));
    weapon.add(box(0.09, 0.09, 0.32, "#3a2a20", 0, 0, -0.02));
    if (weaponInHand) {
      weapon.position.set(0, -0.8, 0.05);
      arms[1].add(weapon);
    } else {
      weapon.position.set(0.15, 1.95, -0.3);
      weapon.rotation.set(Math.PI / 2, 0, 0.45);
      body.add(weapon);
    }
  } else if (look.weapon === "staff") {
    weapon = new THREE.Group();
    weapon.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6), "#6a4a2a", 0, -0.45, 0.14));
    weapon.add(mesh(new THREE.OctahedronGeometry(0.16), "#bfefff", 0, 0.58, 0.14, glow("#5fd7ff", 2)));
    arms[1].add(weapon);
  }

  return { root, body, legs, arms, head, weapon, height: 2.5, radius: 0.5 };
}

function animateWalk(model, phase, amount) {
  const swing = Math.sin(phase) * amount;
  model.legs[0].rotation.x = swing * 0.8;
  model.legs[1].rotation.x = -swing * 0.8;
  model.arms[0].rotation.x = -swing * 0.6;
  model.arms[1].rotation.x = swing * 0.6;
  model.body.position.y = Math.abs(Math.sin(phase)) * 0.07 * amount;
}

function makeHound() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(box(0.7, 0.55, 1.3, "#7a4a2c", 0, 0.85, 0));
  body.add(box(0.76, 0.14, 0.7, "#8d939b", 0, 1.17, -0.1, { metalness: 0.5, roughness: 0.5 }));
  body.add(box(0.2, 0.2, 0.2, "#8d939b", 0, 1.3, 0.25, { metalness: 0.5 }));
  const head = new THREE.Group();
  head.position.set(0, 1.05, 0.75);
  body.add(head);
  head.add(box(0.5, 0.45, 0.5, "#6d3f24"));
  head.add(box(0.32, 0.22, 0.38, "#5a321c", 0, -0.08, 0.38));
  [-1, 1].forEach((s) => {
    head.add(box(0.09, 0.07, 0.03, "#ff3b2f", 0.13 * s, 0.08, 0.26, glow("#ff3b2f", 3)));
    const ear = mesh(new THREE.ConeGeometry(0.1, 0.3, 4), "#5a321c", 0.16 * s, 0.32, -0.05);
    head.add(ear);
  });
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.25 * sx, 0.65, 0.45 * sz);
    pivot.add(box(0.18, 0.65, 0.2, "#5a321c", 0, -0.32, 0));
    body.add(pivot);
    return pivot;
  });
  const tail = box(0.1, 0.1, 0.6, "#8d939b", 0, 1.05, -0.85, { metalness: 0.5 });
  tail.rotation.x = -0.5;
  body.add(tail);
  return { root, body, head, legs, height: 1.7, radius: 0.8 };
}

function makeWisp() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.6;
  root.add(body);
  const core = mesh(new THREE.OctahedronGeometry(0.45), "#bff4ff", 0, 0, 0, glow("#3fd7ff", 2.2));
  body.add(core);
  const ring = mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 24), "#c9ced6", 0, 0, 0, { metalness: 0.7, roughness: 0.3 });
  ring.rotation.x = Math.PI / 2.4;
  body.add(ring);
  const shards = [0, 1, 2].map((i) => {
    const shard = mesh(new THREE.TetrahedronGeometry(0.14), "#bff4ff", 0, 0, 0, glow("#3fd7ff", 1.5));
    body.add(shard);
    return shard;
  });
  const light = new THREE.PointLight("#5fe1ff", 4, 5, 2);
  body.add(light);
  const update = (t) => {
    body.position.y = 1.6 + Math.sin(t * 2) * 0.15;
    core.rotation.y = t;
    ring.rotation.z = t * 0.7;
    shards.forEach((s, i) => {
      const a = t * 1.5 + (i * Math.PI * 2) / 3;
      s.position.set(Math.cos(a) * 0.9, Math.sin(a * 2) * 0.2, Math.sin(a) * 0.9);
      s.rotation.set(t, t * 1.3, 0);
    });
  };
  return { root, body, update, height: 2.4, radius: 0.8 };
}

function makeGolem() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const stone = "#6f6a63";
  const moss = "#4f7a3a";
  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.45 * s, 1.1, 0);
    pivot.add(box(0.55, 1.1, 0.6, stone, 0, -0.55, 0));
    body.add(pivot);
    return pivot;
  });
  body.add(box(1.5, 1.3, 0.95, stone, 0, 1.75, 0));
  body.add(box(1.0, 0.25, 0.1, "#ff9a3a", 0, 1.7, 0.48, glow("#ff7a1a", 2)));
  body.add(box(0.65, 0.55, 0.65, stone, 0, 2.6, 0.15));
  [-1, 1].forEach((s) => body.add(box(0.12, 0.08, 0.04, "#ffb04a", 0.15 * s, 2.65, 0.48, glow("#ff9a1a", 3))));
  [-1, 1].forEach((s) => body.add(box(0.6, 0.3, 0.8, moss, 0.8 * s, 2.45, 0)));
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(1.0 * s, 2.25, 0);
    pivot.add(box(0.5, 1.4, 0.55, stone, 0, -0.7, 0));
    pivot.add(box(0.65, 0.5, 0.65, "#5d5852", 0, -1.45, 0));
    body.add(pivot);
    return pivot;
  });
  return { root, body, legs, arms, height: 3.3, radius: 1.2 };
}

// ---------- Game data ----------

const LOOKS = {
  kael: { skin: "#f0c6a0", hair: "#e8d27a", hairStyle: "spiky", top: "#3b4f8a", sleeve: "#2a3a6a", bottom: "#2c2c38", boots: "#5a3a24", accent: "#9a7b4a", pads: true, weapon: "sword" },
  mira: { skin: "#f3d2b8", hair: "#8a2a3a", hairStyle: "long", top: "#e8e0d0", bottom: "#5a3a6a", boots: "#3a2a30", accent: "#c9a24a", robe: true, weapon: "staff" },
  bram: { skin: "#9a6a48", hair: "#2a2a2a", hairStyle: "short", beard: "#2a2a2a", top: "#6a3a2a", sleeve: "#9a6a48", bottom: "#3a4a3a", boots: "#2a2a2a", accent: "#8d939b", fists: true },
  elder: { skin: "#e8c4a8", hair: "#d8d8d8", hairStyle: "short", beard: "#e8e8e8", top: "#5a4a7a", bottom: "#4a3a5a", boots: "#2a2020", accent: "#c9a24a", robe: true },
  guard: { skin: "#d8a888", hair: "#4a3020", hairStyle: "short", top: "#7a2a2a", sleeve: "#8d939b", bottom: "#3a3a44", boots: "#2a2a2a", accent: "#8d939b", pads: true },
};

const party = [
  { name: "Kael", look: LOOKS.kael, maxHp: 140, maxMp: 18, atk: 20, mag: 9, spd: 1.0, spells: ["Fire"] },
  { name: "Mira", look: LOOKS.mira, maxHp: 95, maxMp: 42, atk: 10, mag: 20, spd: 1.15, spells: ["Fire", "Frost", "Cure"] },
  { name: "Bram", look: LOOKS.bram, maxHp: 175, maxMp: 14, atk: 17, mag: 7, spd: 0.85, spells: ["Cure"] },
];
party.forEach((m) => Object.assign(m, { hp: m.maxHp, mp: m.maxMp, level: 1, xp: 0, limit: 0 }));

const inventory = { Potion: 5, Ether: 2 };
let gil = 0;

const SPELLS = {
  Fire: { mp: 4, power: 2.4, color: "#ff7a2a", target: "enemy" },
  Frost: { mp: 5, power: 2.6, color: "#7fe8ff", target: "enemy" },
  Cure: { mp: 5, power: 3.2, color: "#7dff9a", target: "ally" },
};
const ITEMS = {
  Potion: { hp: 80, color: "#7dff9a" },
  Ether: { mp: 20, color: "#9fb0ff" },
};
const ENEMY_TYPES = {
  hound: { name: "Scrap Hound", hp: 70, atk: 13, spd: 0.95, xp: 14, gil: 22, weak: "Fire", skill: "Rust Bite", make: makeHound },
  wisp: { name: "Glimmer Wisp", hp: 48, atk: 12, spd: 1.2, xp: 12, gil: 18, weak: "Frost", skill: "Static Spark", ranged: true, make: makeWisp },
  golem: { name: "Moss Golem", hp: 170, atk: 21, spd: 0.6, xp: 40, gil: 60, skill: "Boulder Crush", make: makeGolem },
};
const FORMATIONS = [["hound", "hound"], ["wisp", "hound"], ["wisp", "wisp", "wisp"], ["hound", "golem"], ["golem"], ["hound", "wisp", "hound"]];

// ---------- Shared input ----------

const held = new Set();
const stick = { x: 0, y: 0 };
let mode = "field";
const CONFIRM = ["Enter", "Space", "KeyE", "KeyZ"];
const CANCEL = ["Escape", "Backspace", "KeyQ", "KeyX"];

function moveInput() {
  const k = (...codes) => (codes.some((c) => held.has(c)) ? 1 : 0);
  let x = k("KeyD", "ArrowRight") - k("KeyA", "ArrowLeft") + stick.x;
  let y = k("KeyW", "ArrowUp") - k("KeyS", "ArrowDown") + stick.y;
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y, len: Math.min(len, 1) };
}

// ---------- Field ----------

const field = (() => {
  const scene = new THREE.Scene();
  scene.background = skyTexture([[0, "#141433"], [0.45, "#4a3a6a"], [0.75, "#c9746a"], [1, "#f2b37a"]]);
  scene.fog = new THREE.Fog("#5a4466", 35, 95);
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 300);

  scene.add(new THREE.HemisphereLight("#a8b4ff", "#4a3030", 1.1));
  const sun = new THREE.DirectionalLight("#ffc890", 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const colliders = [];
  const interactables = [];
  const animated = [];
  const R = seeded(42);

  // Walkable regions overlap slightly so the player can pass between them.
  const regions = [
    { x0: -18, x1: 18, z0: -16, z1: 14 },
    { x0: -3, x1: 3, z0: -37, z1: -15 },
    { x0: -26, x1: 26, z0: -84, z1: -36 },
  ];

  const addBox = (x0, x1, z0, z1) => colliders.push({ x0, x1, z0, z1 });
  const addCircle = (x, z, r) => colliders.push({ x, z, r });

  // Ground: town side, chasm, wilds side.
  scene.add(ground(noiseTexture("#4c6a3c", ["#57784a", "#405a32", "#5d6a3a"], 20, 12), 80, 46, 0, -3));
  scene.add(ground(cobbleTexture(9, 7.5), 36, 30, 0, -1, 0.01));
  scene.add(ground(cobbleTexture(1.5, 2.5), 6, 10, 0, -21, 0.01));
  scene.add(ground(noiseTexture("#3e4a34", ["#4a5a3a", "#33402c", "#5a5040"], 20, 14), 80, 54, 0, -63));
  scene.add(ground(noiseTexture("#6a5a44", ["#7a684e", "#5a4a38"], 1.5, 8), 5, 26, 0, -49, 0.01));

  // Chasm under the bridge.
  scene.add(box(80, 16, 0.5, "#2e2630", 0, -8, -26.25));
  scene.add(box(80, 16, 0.5, "#2e2630", 0, -8, -35.75));
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(80, 10), new THREE.MeshBasicMaterial({ color: "#8a4aaa", transparent: true, opacity: 0.35 }));
  mist.rotation.x = -Math.PI / 2;
  mist.position.set(0, -9, -31);
  scene.add(mist);

  // Bridge deck, posts and rails.
  for (let z = -35.75; z < -26; z += 0.5) scene.add(box(6.4, 0.2, 0.45, R() > 0.5 ? "#7a5232" : "#6a4628", 0, -0.1, z));
  for (const s of [-1, 1]) {
    for (let z = -36; z <= -26; z += 2.5) scene.add(box(0.25, 1.2, 0.25, "#4a3020", 3.2 * s, 0.5, z));
    scene.add(box(0.15, 0.15, 10.2, "#5a3a24", 3.2 * s, 1.0, -31));
  }

  // Low stone wall around the square, open to the north road.
  const wallColor = "#6a6470";
  for (const [x, z, w, d] of [[-10.5, -16.3, 15, 0.6], [10.5, -16.3, 15, 0.6], [0, 14.3, 36.6, 0.6], [-18.3, -1, 0.6, 30.6], [18.3, -1, 0.6, 30.6]]) {
    scene.add(box(w, 0.8, d, wallColor, x, 0.4, z));
  }
  // Fences along the road.
  for (const s of [-1, 1]) {
    for (let z = -25.5; z <= -16.5; z += 1.5) scene.add(box(0.2, 1.0, 0.2, "#5a3a24", 3.3 * s, 0.5, z));
    scene.add(box(0.1, 0.12, 9.5, "#6a4628", 3.3 * s, 0.75, -21));
  }

  function house(x, z, w, d, h, wall, roof) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.add(box(w, h, d, wall, 0, h / 2, 0));
    const top = mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), roof, 0, h + 1.2, 0);
    top.rotation.y = Math.PI / 4;
    top.scale.set(w + 0.8, 2.4, d + 0.8);
    group.add(top);
    group.add(box(0.8, 1.8, 0.8, "#6a6470", w / 2 - 1, h + 1.6, 0));
    // Warm windows on every side.
    for (let i = -1; i <= 1; i += 2) {
      for (const [px, pz, rw, rd] of [[i * w / 4, d / 2 + 0.03, 0.9, 0.05], [i * w / 4, -d / 2 - 0.03, 0.9, 0.05], [w / 2 + 0.03, i * d / 4, 0.05, 0.9], [-w / 2 - 0.03, i * d / 4, 0.05, 0.9]]) {
        group.add(box(rw, 1.0, rd, "#ffcf7a", px, h * 0.6, pz, glow("#ffb04a", 1.6)));
      }
    }
    scene.add(group);
    addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
  }
  house(-12, -12, 10, 6, 5, "#b9a58a", "#7a3b2e");
  house(12, -12, 10, 6, 6, "#9aa3b0", "#3b4f6a");
  house(-15, 3, 5, 9, 4.5, "#c9b89a", "#5a6a3a");
  house(15, 2, 5, 8, 5, "#a89080", "#7a3b2e");

  // Fountain.
  scene.add(mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.7, 12), "#7a7480", 0, 0.35, 0));
  const water = mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.1, 12), "#3f7fd4", 0, 0.66, 0, { ...glow("#1f5fb4", 0.4), roughness: 0.2 });
  water.userData.dynamic = true;
  scene.add(water);
  scene.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.8, 8), "#7a7480", 0, 1.2, 0));
  scene.add(mesh(new THREE.CylinderGeometry(1.0, 0.5, 0.35, 10), "#7a7480", 0, 2.1, 0));
  const spout = mesh(new THREE.SphereGeometry(0.4, 8, 6), "#9fd0ff", 0, 2.45, 0, glow("#4f9fff", 0.8));
  spout.userData.dynamic = true;
  scene.add(spout);
  animated.push((t) => { water.position.y = 0.66 + Math.sin(t * 2) * 0.02; spout.scale.setScalar(1 + Math.sin(t * 6) * 0.08); });
  addCircle(0, 0, 2.8);

  // Lamp posts with warm point lights.
  for (const [x, z] of [[-5, -7], [5, -7], [-5, 8], [5, 8]]) {
    scene.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.2, 6), "#2a2a30", x, 1.6, z));
    scene.add(box(0.45, 0.55, 0.45, "#ffe0a0", x, 3.4, z, glow("#ffb04a", 2.5)));
    const light = new THREE.PointLight("#ffb46a", 12, 12, 2);
    light.position.set(x, 3.3, z);
    scene.add(light);
    addCircle(x, z, 0.35);
  }

  // Crates and barrels.
  for (const [x, z] of [[-9, 11], [-8, 11.6], [9.5, -8.6], [-16.5, -6]]) {
    scene.add(box(1, 1, 1, "#8a6a42", x, 0.5, z));
    addCircle(x, z, 0.75);
  }
  for (const [x, z] of [[10.5, -8.4], [-16.6, -4.6], [16.6, 9]]) {
    scene.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), "#6a4628", x, 0.55, z));
    addCircle(x, z, 0.55);
  }

  // Save crystal: restores the party and becomes the respawn point.
  const crystalPos = new V3(10, 0, 7);
  scene.add(mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 8), "#5a5464", crystalPos.x, 0.2, crystalPos.z));
  const crystal = mesh(new THREE.OctahedronGeometry(0.6), "#c8f4ff", crystalPos.x, 1.8, crystalPos.z, { ...glow("#3fd7ff", 1.8), transparent: true, opacity: 0.9 });
  crystal.scale.y = 1.6;
  crystal.userData.dynamic = true;
  scene.add(crystal);
  const crystalLight = new THREE.PointLight("#6fe0ff", 10, 9, 2);
  crystalLight.position.set(crystalPos.x, 2, crystalPos.z);
  scene.add(crystalLight);
  animated.push((t) => { crystal.rotation.y = t; crystal.position.y = 1.8 + Math.sin(t * 2) * 0.15; crystalLight.intensity = 9 + Math.sin(t * 3) * 2; });
  addCircle(crystalPos.x, crystalPos.z, 1.1);
  interactables.push({
    pos: crystalPos,
    lines: () => {
      party.forEach((m) => Object.assign(m, { hp: m.maxHp, mp: m.maxMp }));
      return [["Crystal", "The crystal hums softly. Your party's HP and MP are fully restored."]];
    },
  });

  // NPCs.
  function npc(look, x, z, angle, lines) {
    const model = makeHumanoid(look);
    model.root.position.set(x, 0, z);
    model.root.rotation.y = angle;
    model.root.userData.dynamic = true;
    scene.add(model.root);
    addCircle(x, z, 0.55);
    const entry = { pos: new V3(x, 0, z), model, angle, lines: () => lines };
    interactables.push(entry);
    animated.push((t) => { model.body.position.y = Math.sin(t * 2 + x) * 0.015; });
    return entry;
  }
  npc(LOOKS.elder, -4, 3.5, 2.2, [
    ["Old Fenn", "Evening, Kael. The lanterns burn low tonight."],
    ["Old Fenn", "Creatures keep crawling out of the rift in the Ashen Wilds, past the old bridge to the north."],
    ["Old Fenn", "If they rough you up, touch the crystal by the east houses. Its light mends any wound."],
  ]);
  npc(LOOKS.guard, -2.2, -18, Math.PI / 2, [
    ["Watchman Orrin", "The bridge holds. The wilds beyond it don't."],
    ["Watchman Orrin", "Scrap hounds hate fire. Those glowing wisps? Hit them with frost."],
    ["Watchman Orrin", "And if a moss golem shows up... well. Good luck."],
  ]);

  // Ashen Wilds: forest edge, trees, rocks, ruins and a glowing rift.
  function tree(x, z, s = 1) {
    scene.add(mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 1.4 * s, 6), "#4a3020", x, 0.7 * s, z));
    for (let i = 0; i < 3; i++) {
      scene.add(mesh(new THREE.ConeGeometry((1.4 - i * 0.35) * s, 1.6 * s, 7), i % 2 ? "#2f5a3a" : "#3a6a40", x, (1.6 + i * 0.9) * s, z));
    }
    addCircle(x, z, 0.6 * s);
  }
  function rock(x, z, s) {
    const r = mesh(new THREE.DodecahedronGeometry(s, 0), "#6a6470", x, s * 0.5, z);
    r.rotation.set(R() * 3, R() * 3, R() * 3);
    r.scale.y = 0.7;
    scene.add(r);
    addCircle(x, z, s * 0.9);
  }
  for (let x = -27; x <= 27; x += 2.2) tree(x + R() - 0.5, -85 + R(), 1.2 + R() * 0.4);
  for (let z = -84; z <= -37; z += 2.2) {
    tree(-27 + R(), z, 1.2 + R() * 0.4);
    tree(27 - R(), z, 1.2 + R() * 0.4);
  }
  for (let i = 0; i < 70; i++) {
    const x = -24 + R() * 48;
    const z = -82 + R() * 44;
    if (Math.abs(x) < 4 && z > -64) continue;
    if (Math.hypot(x, z + 75) < 6) continue;
    if (Math.hypot(x - 11, z + 58) < 4) continue;
    if (R() < 0.75) tree(x, z, 0.8 + R() * 0.6);
    else rock(x, z, 0.6 + R() * 0.8);
  }
  for (const [x, z, h] of [[9, -56, 3], [13, -57, 1.6], [11, -61, 2.4], [8, -60, 0.8]]) {
    scene.add(box(1, h, 1, "#8a8478", x, h / 2, z));
    addCircle(x, z, 0.75);
  }
  const rift = mesh(new THREE.OctahedronGeometry(1.4), "#e0a0ff", 0, 2.2, -75, { ...glow("#a040ff", 2.5), transparent: true, opacity: 0.85 });
  rift.scale.set(0.35, 1.8, 0.35);
  rift.userData.dynamic = true;
  scene.add(rift);
  const riftLight = new THREE.PointLight("#b060ff", 30, 18, 2);
  riftLight.position.set(0, 2.5, -75);
  scene.add(riftLight);
  animated.push((t) => { rift.rotation.y = t * 0.8; riftLight.intensity = 26 + Math.sin(t * 5) * 6; });
  addCircle(0, -75, 1.6);
  // Glowing flowers scattered through the wilds.
  for (let i = 0; i < 40; i++) {
    const x = -24 + R() * 48;
    const z = -82 + R() * 44;
    scene.add(mesh(new THREE.SphereGeometry(0.09, 5, 4), "#d8a0ff", x, 0.15, z, glow("#b060ff", 2)));
  }

  // Player.
  const player = makeHumanoid(LOOKS.kael);
  const start = new V3(0, 0, 10);
  player.root.position.copy(start);
  player.root.rotation.y = Math.PI;
  player.root.userData.dynamic = true;
  scene.add(player.root);
  let respawn = start.clone();
  let walkPhase = 0;

  // A small marker floats over whatever you can talk to.
  const marker = mesh(new THREE.OctahedronGeometry(0.18), "#ffe27a", 0, 0, 0, glow("#ffc02a", 1.5));
  marker.castShadow = false;
  marker.userData.dynamic = true;
  scene.add(marker);
  mergeStatic(scene);

  // Fixed, cinematic camera per zone; it pans to keep Kael in frame.
  const ZONES = [
    { name: "Lantern Square", test: (p) => p.z > -16.5, cam: (p) => new V3(p.x * 0.35, 11, 19 + p.z * 0.45), look: (p) => new V3(p.x * 0.7, 1, p.z * 0.8 - 1.5), encounters: false },
    { name: "Old Bridge", test: (p) => p.z > -36.5, cam: () => new V3(11, 8, -15), look: (p) => new V3(p.x, 0.5, p.z - 1), encounters: false },
    { name: "Ashen Wilds", test: () => true, cam: (p) => new V3(p.x * 0.7 - 6, 15, p.z + 17), look: (p) => new V3(p.x, 1, p.z - 2), encounters: true },
  ];
  let zone = null;
  const look = new V3();
  // The movement basis only updates when input is released, so a camera cut
  // never flips the direction you're already walking.
  const basis = { forward: new V3(0, 0, -1), right: new V3(1, 0, 0), moving: false };

  let dialog = null;
  let distanceSinceBattle = 0;
  let nextEncounter = rand(18, 30);

  function walkable(x, z) {
    const r = 0.4;
    if (!regions.some((g) => x > g.x0 + r && x < g.x1 - r && z > g.z0 + r && z < g.z1 - r)) return false;
    return !colliders.some((c) => (c.r !== undefined
      ? Math.hypot(x - c.x, z - c.z) < c.r + r
      : x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r));
  }

  function nearestInteractable() {
    const p = player.root.position;
    let best = null;
    for (const it of interactables) {
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (d < 2.4 && (!best || d < best.d)) best = { it, d };
    }
    return best?.it ?? null;
  }

  function showDialog(lines, onClose) {
    dialog = { lines, index: 0, onClose };
    $("#dialog").hidden = false;
    renderDialog();
  }

  function renderDialog() {
    const [who, text] = dialog.lines[dialog.index];
    $("#dialog strong").textContent = who;
    $("#dialog p").textContent = text;
  }

  function advanceDialog() {
    dialog.index += 1;
    if (dialog.index < dialog.lines.length) return renderDialog();
    const { onClose } = dialog;
    dialog = null;
    $("#dialog").hidden = true;
    onClose?.();
  }

  function setZone(next, snap) {
    zone = next;
    const p = player.root.position;
    if (snap) {
      camera.position.copy(zone.cam(p));
      look.copy(zone.look(p));
    }
    const banner = $("#zone");
    banner.textContent = zone.name;
    banner.hidden = true;
    void banner.offsetWidth;
    banner.hidden = false;
  }

  function onKey(code) {
    if (!CONFIRM.includes(code)) return;
    if (dialog) return advanceDialog();
    const it = nearestInteractable();
    if (!it) return;
    if (it.model) face(it.model.root, player.root.position.x, player.root.position.z);
    if (it === interactables[0]) respawn = new V3(crystalPos.x - 2, 0, crystalPos.z);
    showDialog(it.lines(), () => it.model && (it.model.root.rotation.y = it.angle));
  }

  function update(dt, t) {
    animated.forEach((fn) => fn(t));
    const p = player.root.position;
    const input = dialog ? { x: 0, y: 0, len: 0 } : moveInput();

    if (input.len > 0.1) {
      if (!basis.moving) {
        camera.getWorldDirection(basis.forward);
        basis.forward.setY(0).normalize();
        basis.right.crossVectors(basis.forward, new V3(0, 1, 0));
        basis.moving = true;
      }
      const dir = basis.forward.clone().multiplyScalar(input.y).addScaledVector(basis.right, input.x);
      const speed = 6.5 * input.len;
      const nx = p.x + dir.x * speed * dt;
      const nz = p.z + dir.z * speed * dt;
      const before = p.clone();
      if (walkable(nx, p.z)) p.x = nx;
      if (walkable(p.x, nz)) p.z = nz;
      const moved = Math.hypot(p.x - before.x, p.z - before.z);
      turnToward(player.root, Math.atan2(dir.x, dir.z), Math.min(1, dt * 12));
      walkPhase += moved * 2.2;
      animateWalk(player, walkPhase, Math.min(1, moved / (dt * 4 + 1e-6)));
      if (zone?.encounters) distanceSinceBattle += moved;
    } else {
      basis.moving = false;
      animateWalk(player, 0, 0);
      player.body.position.y = Math.sin(t * 2) * 0.015;
    }

    const next = ZONES.find((z) => z.test(p));
    if (next !== zone) setZone(next, true);

    const it = dialog ? null : nearestInteractable();
    marker.visible = !!it;
    if (it) marker.position.set(it.pos.x, (it.model ? 3.0 : 3.4) + Math.sin(t * 4) * 0.1, it.pos.z);
    marker.rotation.y = t * 2;

    camera.position.lerp(zone.cam(p), 1 - Math.exp(-dt * 3));
    look.lerp(zone.look(p), 1 - Math.exp(-dt * 4));
    camera.lookAt(look);

    sun.position.set(p.x + 20, 30, p.z + 10);
    sun.target.position.set(p.x, 0, p.z);

    if (distanceSinceBattle > nextEncounter) {
      distanceSinceBattle = 0;
      nextEncounter = rand(18, 32);
      startBattle(pick(FORMATIONS));
    }
  }

  function returnToRespawn() {
    player.root.position.copy(respawn);
    player.root.rotation.y = Math.PI;
    zone = null;
  }

  return {
    scene, camera, update, onKey, returnToRespawn, player,
    resetEncounter: () => { distanceSinceBattle = 0; },
    advanceDialog: () => dialog && advanceDialog(),
    get dialogOpen() { return !!dialog; },
  };
})();

// ---------- Battle ----------

const battle = (() => {
  const scene = new THREE.Scene();
  scene.background = skyTexture([[0, "#0e1030"], [0.5, "#3a2a5a"], [0.8, "#a0566a"], [1, "#e09a6a"]]);
  scene.fog = new THREE.Fog("#4a3555", 25, 60);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);

  scene.add(new THREE.HemisphereLight("#b0b8ff", "#4a3030", 1.2));
  const sun = new THREE.DirectionalLight("#ffd0a0", 2.4);
  sun.position.set(8, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#a060ff", 1.2);
  rim.position.set(-10, 6, -12);
  scene.add(rim);

  const disc = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ map: noiseTexture("#4a5038", ["#565e40", "#3a4030", "#5a5040"], 24, 24), roughness: 1 }));
  disc.rotation.x = -Math.PI / 2;
  disc.receiveShadow = true;
  scene.add(disc);
  const R = seeded(7);
  for (let i = 0; i < 40; i++) {
    const a = R() * Math.PI * 2;
    const d = 15 + R() * 12;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (z > 8) continue;
    if (R() < 0.6) {
      const s = 1 + R();
      scene.add(mesh(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 1.6 * s, 6), "#4a3020", x, 0.8 * s, z));
      for (let k = 0; k < 3; k++) scene.add(mesh(new THREE.ConeGeometry((1.5 - k * 0.4) * s, 1.8 * s, 7), "#2f5a3a", x, (1.8 + k) * s, z));
    } else {
      const r = mesh(new THREE.DodecahedronGeometry(0.8 + R() * 1.5, 0), "#5a5464", x, 0.4, z);
      r.scale.y = 0.6;
      scene.add(r);
    }
  }

  mergeStatic(scene);

  const cursor = mesh(new THREE.ConeGeometry(0.22, 0.45, 4), "#ffe27a", 0, 0, 0, glow("#ffc02a", 1.5));
  cursor.rotation.x = Math.PI;
  cursor.visible = false;
  scene.add(cursor);
  const activeRing = mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 32), "#ffe27a", 0, 0.05, 0, glow("#ffc02a", 1.2));
  activeRing.rotation.x = Math.PI / 2;
  activeRing.visible = false;
  scene.add(activeRing);

  const partyModels = party.map((m) => makeHumanoid(m.look, true));
  const PARTY_SPOTS = [[4.2, -2.6], [5.0, 0], [5.8, 2.6]];
  const ENEMY_SPOTS = { 1: [[-4.8, 0]], 2: [[-4.3, -1.8], [-5.3, 1.8]], 3: [[-4.2, -2.8], [-5.0, 0], [-5.8, 2.8]] };

  const cam = { goalPos: new V3(), goalLook: new V3(), look: new V3(), sway: true };
  let actors = [];
  let queue = [];
  let ready = [];
  let busy = false;
  let over = false;
  let menu = null;
  let resultContinue = null;

  const alive = (side) => actors.filter((a) => a.side === side && a.state !== "dead");

  function camDefault() {
    cam.goalPos.set(2, 5.8, 13.5);
    cam.goalLook.set(0, 1.2, 0);
    cam.sway = true;
  }

  function camFocus(a, b) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    cam.goalLook.set(mid.x, 1.4, mid.z);
    cam.goalPos.set(mid.x + 2, 3.4, mid.z + 7.5);
    cam.sway = false;
  }

  function start(formation) {
    actors.forEach((a) => scene.remove(a.model.root));
    actors = [];
    party.forEach((member, i) => {
      const model = partyModels[i];
      model.root.position.set(PARTY_SPOTS[i][0], 0, PARTY_SPOTS[i][1]);
      model.root.rotation.set(0, -Math.PI / 2, 0);
      model.body.rotation.set(0, 0, 0);
      model.body.position.set(0, 0, 0);
      model.arms.forEach((a) => a.rotation.set(0, 0, 0));
      model.legs.forEach((l) => l.rotation.set(0, 0, 0));
      scene.add(model.root);
      actors.push({ side: "party", data: member, model, home: model.root.position.clone(), atb: rand(0.25, 0.7), state: member.hp > 0 ? "charging" : "dead" });
    });
    const spots = ENEMY_SPOTS[formation.length];
    const counts = {};
    formation.forEach((key, i) => {
      const type = ENEMY_TYPES[key];
      const model = type.make();
      model.root.position.set(spots[i][0], 0, spots[i][1]);
      model.root.rotation.y = Math.PI / 2;
      scene.add(model.root);
      counts[key] = (counts[key] ?? 0) + 1;
      const label = formation.filter((k) => k === key).length > 1 ? `${type.name} ${"ABC"[counts[key] - 1]}` : type.name;
      actors.push({ side: "enemy", type, data: { name: label, hp: type.hp, maxHp: type.hp, atk: type.atk, spd: type.spd }, model, home: model.root.position.clone(), atb: rand(0, 0.35), state: "charging" });
    });

    queue = [];
    ready = [];
    busy = false;
    over = false;
    menu = null;
    resultContinue = null;
    cursor.visible = false;
    activeRing.visible = false;
    $("#command").hidden = true;
    $("#result").hidden = true;
    $("#announce").hidden = true;
    buildPanels();
    camera.position.set(-6, 10, 18);
    cam.look.set(0, 1, 0);
    camDefault();
  }

  // ----- Panels -----

  function buildPanels() {
    $("#enemies").innerHTML = "";
    for (const a of actors.filter((x) => x.side === "enemy")) {
      a.row = document.createElement("div");
      a.row.className = "enemy-row";
      a.row.textContent = a.data.name;
      $("#enemies").append(a.row);
    }
    $("#party").innerHTML = "";
    for (const a of actors.filter((x) => x.side === "party")) {
      a.row = document.createElement("div");
      a.row.className = "member";
      a.row.innerHTML = `<span class="name">${a.data.name}</span><span class="stat"><small>HP</small><b class="hp"></b></span><span class="stat"><small>MP</small><b class="mp"></b></span>
        <span class="gauges"><span class="gauge atb"><span></span></span><span class="gauge limit"><span></span></span></span>`;
      $("#party").append(a.row);
    }
  }

  function updatePanels() {
    for (const a of actors) {
      if (a.side === "enemy") {
        a.row.classList.toggle("dead", a.state === "dead");
        continue;
      }
      const m = a.data;
      a.row.querySelector(".hp").textContent = `${m.hp}/${m.maxHp}`;
      a.row.querySelector(".mp").textContent = `${m.mp}`;
      a.row.querySelector(".atb span").style.width = `${a.atb * 100}%`;
      a.row.querySelector(".atb").classList.toggle("full", a.atb >= 1 && a.state !== "dead");
      a.row.querySelector(".limit span").style.width = `${m.limit * 100}%`;
      a.row.querySelector(".limit").classList.toggle("full", m.limit >= 1);
      a.row.classList.toggle("ready", a.state === "ready");
      a.row.classList.toggle("ko", a.state === "dead");
    }
  }

  async function announce(text) {
    const el = $("#announce");
    el.textContent = text;
    el.hidden = false;
    await wait(0.9);
    el.hidden = true;
  }

  function showNumber(actor, text, kind = "") {
    const pos = actor.model.root.position.clone().setY(actor.model.height * 0.75);
    pos.project(camera);
    const el = document.createElement("div");
    el.className = `number ${kind}`;
    el.textContent = text;
    el.style.left = `${((pos.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - pos.y) / 2) * 100}%`;
    $("#numbers").append(el);
    setTimeout(() => el.remove(), 1200);
  }

  // ----- Effects -----

  const sparkGeo = new THREE.OctahedronGeometry(0.12);
  function burst(at, color, { count = 16, spread = 1.4, rise = 0, duration = 0.6, size = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.copy(at);
      m.scale.setScalar(size);
      const dir = new V3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(spread * rand(0.5, 1));
      dir.y += rise;
      scene.add(m);
      tween(duration * rand(0.7, 1.2), (t) => {
        m.position.copy(at).addScaledVector(dir, t);
        m.material.opacity = 1 - t;
        m.rotation.set(t * 6, t * 4, 0);
      }, ease.out).then(() => { scene.remove(m); m.material.dispose(); });
    }
  }

  async function projectile(from, to, color, duration = 0.45) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color }));
    scene.add(orb);
    await tween(duration, (t) => {
      orb.position.lerpVectors(from, to, t);
      orb.position.y += Math.sin(t * Math.PI) * 1.2;
      orb.scale.setScalar(1 + Math.sin(t * 20) * 0.15);
    }, ease.in);
    scene.remove(orb);
    orb.material.dispose();
  }

  async function shockwave(at, color) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 32), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(at).setY(0.2);
    scene.add(ring);
    await tween(0.5, (t) => { ring.scale.setScalar(0.3 + t * 3.5); ring.material.opacity = 1 - t; }, ease.out);
    scene.remove(ring);
    ring.material.dispose();
  }

  async function shake(actor) {
    const base = actor.model.root.position.clone();
    await tween(0.25, (t) => {
      actor.model.root.position.copy(base);
      actor.model.root.position.x += Math.sin(t * 40) * 0.12 * (1 - t);
    }, ease.linear);
    actor.model.root.position.copy(base);
  }

  const center = (a, h = 0.55) => a.model.root.position.clone().setY(a.model.height * h);

  // ----- Rules -----

  function damage(target, amount, kind = "") {
    const m = target.data;
    m.hp = Math.max(0, m.hp - amount);
    showNumber(target, amount, kind);
    shake(target);
    burst(center(target), "#ffffff", { count: 8, spread: 0.9, duration: 0.35 });
    if (target.side === "party") m.limit = Math.min(1, m.limit + (amount / m.maxHp) * 1.3);
    if (m.hp <= 0) knockOut(target);
  }

  function heal(target, hp, mp) {
    const m = target.data;
    if (hp) {
      m.hp = Math.min(m.maxHp, m.hp + hp);
      showNumber(target, hp, "heal");
    }
    if (mp) {
      m.mp = Math.min(m.maxMp, m.mp + mp);
      showNumber(target, `${mp} MP`, "heal");
    }
  }

  function knockOut(actor) {
    actor.state = "dead";
    actor.atb = 0;
    ready = ready.filter((a) => a !== actor);
    if (menu?.actor === actor) closeMenu();
    const { model } = actor;
    if (actor.side === "enemy") {
      burst(center(actor), "#c080ff", { count: 24, spread: 2, duration: 0.9 });
      const s = model.root.scale.clone();
      tween(0.8, (t) => {
        model.root.scale.set(s.x * (1 - t), s.y * (1 - t * 0.5), s.z * (1 - t));
        model.root.position.y = -t * 0.8;
        model.root.rotation.y = Math.PI / 2 + t * 4;
      }).then(() => { model.root.visible = false; });
    } else {
      tween(0.4, (t) => {
        model.body.rotation.z = (t * Math.PI) / 2;
        model.body.position.y = t * 0.3;
      });
    }
  }

  function retarget(target, side) {
    if (target && target.state !== "dead") return target;
    const options = alive(side);
    return options.length ? pick(options) : null;
  }

  async function runTo(actor, target) {
    const { model } = actor;
    const from = model.root.position.clone();
    const to = target.model.root.position.clone();
    const dir = to.clone().sub(from).setY(0).normalize();
    const dest = to.clone().addScaledVector(dir, -(target.model.radius + actor.model.radius + 0.6));
    face(model.root, to.x, to.z);
    let phase = 0;
    await tween(0.35, (t) => {
      model.root.position.lerpVectors(from, dest, t);
      if (model.legs.length === 2) animateWalk(model, (phase += 0.5), 1);
    });
    if (model.legs.length === 2) animateWalk(model, 0, 0);
  }

  async function runHome(actor) {
    const { model } = actor;
    const from = model.root.position.clone();
    face(model.root, actor.home.x, actor.home.z);
    let phase = 0;
    await tween(0.35, (t) => {
      model.root.position.lerpVectors(from, actor.home, t);
      if (model.legs.length === 2) animateWalk(model, (phase += 0.5), 1);
    });
    if (model.legs.length === 2) animateWalk(model, 0, 0);
    model.root.rotation.y = actor.side === "party" ? -Math.PI / 2 : Math.PI / 2;
  }

  async function swing(actor) {
    const { model } = actor;
    if (actor.side === "party" || actor.type.make === makeGolem) {
      const arms = actor.side === "party" ? [model.arms[1]] : model.arms;
      await tween(0.16, (t) => arms.forEach((a) => (a.rotation.x = -2.6 * t)), ease.out);
      await tween(0.1, (t) => arms.forEach((a) => (a.rotation.x = -2.6 + 2.2 * t)), ease.in);
    } else {
      await tween(0.12, (t) => { model.body.rotation.x = -0.4 * t; });
      await tween(0.1, (t) => { model.body.rotation.x = -0.4 + 0.7 * t; });
    }
  }

  function resetPose(actor) {
    const { model } = actor;
    model.arms?.forEach((a) => (a.rotation.x = 0));
    model.body.rotation.x = 0;
  }

  async function attack(actor, target, surge = false) {
    target = retarget(target, "enemy");
    if (!target) return;
    const m = actor.data;
    if (surge) {
      m.limit = 0;
      announce(`${m.name}: ${{ Kael: "Riftbreaker", Mira: "Starfall", Bram: "Mountain Fist" }[m.name]}`);
    }
    camFocus(actor.model.root.position, target.model.root.position);
    await runTo(actor, target);
    await swing(actor);
    if (!surge && Math.random() < 0.06) {
      showNumber(target, "Miss", "miss");
    } else {
      const amount = Math.round(m.atk * (surge ? 3.4 : 1) * rand(0.9, 1.1));
      if (surge) {
        burst(center(target), "#ffd14a", { count: 30, spread: 2.4, duration: 0.9, size: 1.6 });
        shockwave(target.model.root.position, "#ffd14a");
      }
      damage(target, amount, surge ? "weak" : "");
    }
    await wait(0.3);
    resetPose(actor);
    await runHome(actor);
  }

  async function cast(actor, spellName, target) {
    const spell = SPELLS[spellName];
    const side = spell.target === "enemy" ? "enemy" : "party";
    target = retarget(target, side);
    if (!target) return;
    actor.data.mp -= spell.mp;
    announce(spellName);
    camFocus(actor.model.root.position, target.model.root.position);
    const { model } = actor;
    face(model.root, target.model.root.position.x, target.model.root.position.z);
    await tween(0.25, (t) => model.arms.forEach((a) => (a.rotation.x = -2.8 * t)));
    burst(center(actor, 0.8), spell.color, { count: 10, spread: 0.8, rise: 0.6, duration: 0.5 });
    await wait(0.15);
    if (spell.target === "enemy") {
      await projectile(center(actor, 0.7), center(target), spell.color);
      burst(center(target), spell.color, { count: 26, spread: 2, rise: spellName === "Fire" ? 1.2 : 0, duration: 0.8, size: 1.4 });
      const weak = target.type.weak === spellName;
      const amount = Math.round(actor.data.mag * spell.power * rand(0.95, 1.05) * (weak ? 2 : 1));
      damage(target, amount, weak ? "weak" : "");
    } else {
      burst(center(target), spell.color, { count: 22, spread: 1.2, rise: 1.5, duration: 1 });
      heal(target, Math.round(actor.data.mag * spell.power * rand(0.95, 1.05)));
    }
    await wait(0.45);
    resetPose(actor);
    model.root.rotation.y = -Math.PI / 2;
  }

  async function useItem(actor, itemName, target) {
    target = retarget(target, "party");
    if (!target || inventory[itemName] <= 0) return;
    inventory[itemName] -= 1;
    announce(itemName);
    const item = ITEMS[itemName];
    await tween(0.2, (t) => (actor.model.arms[1].rotation.x = -1.6 * t));
    burst(center(target), item.color, { count: 18, spread: 1, rise: 1.4, duration: 0.9 });
    heal(target, item.hp, item.mp);
    await wait(0.5);
    resetPose(actor);
  }

  async function enemyTurn(actor) {
    const target = pick(alive("party"));
    if (!target) return;
    announce(actor.type.skill);
    camFocus(actor.model.root.position, target.model.root.position);
    await wait(0.3);
    const amount = Math.round(actor.data.atk * rand(0.85, 1.15));
    if (actor.type.ranged) {
      await tween(0.2, (t) => actor.model.body.scale.setScalar(1 + t * 0.3));
      await projectile(center(actor), center(target), "#7fe8ff", 0.4);
      actor.model.body.scale.setScalar(1);
      burst(center(target), "#bff4ff", { count: 16, spread: 1.2 });
      damage(target, amount);
      await wait(0.4);
    } else {
      await runTo(actor, target);
      await swing(actor);
      if (actor.type.make === makeGolem) shockwave(target.model.root.position, "#c9b89a");
      damage(target, amount);
      await wait(0.3);
      resetPose(actor);
      await runHome(actor);
    }
  }

  // Actions run one at a time; ATB keeps filling while they play.
  function enqueue(actor, action) {
    actor.state = "queued";
    queue.push(async () => {
      if (actor.state === "dead" || over) return;
      actor.state = "acting";
      await action();
      if (actor.state !== "dead") {
        actor.state = "charging";
        actor.atb = 0;
      }
    });
  }

  function checkEnd() {
    if (over) return;
    if (!alive("enemy").length) victory();
    else if (!alive("party").length) defeat();
  }

  // ----- Command menu -----

  function openMenu(actor) {
    const m = actor.data;
    const surge = m.limit >= 1;
    const enemyTargets = (fn) => ({ title: "Target", targets: "enemy", options: alive("enemy").map((t) => ({ label: t.data.name, target: t, run: () => fn(t) })) });
    const allyTargets = (fn) => ({ title: "Target", targets: "party", options: alive("party").map((t) => ({ label: t.data.name, right: `${t.data.hp}/${t.data.maxHp}`, target: t, run: () => fn(t) })) });
    const commit = (action) => {
      closeMenu();
      ready = ready.filter((a) => a !== actor);
      enqueue(actor, action);
    };
    const root = {
      title: m.name,
      options: [
        surge
          ? { label: "Surge", className: "surge", next: () => enemyTargets((t) => commit(() => attack(actor, t, true))) }
          : { label: "Attack", next: () => enemyTargets((t) => commit(() => attack(actor, t))) },
        {
          label: "Magic",
          next: () => ({
            title: "Magic",
            options: m.spells.map((name) => ({
              label: name,
              right: `${SPELLS[name].mp} MP`,
              disabled: m.mp < SPELLS[name].mp,
              next: () => (SPELLS[name].target === "enemy" ? enemyTargets : allyTargets)((t) => commit(() => cast(actor, name, t))),
            })),
          }),
        },
        {
          label: "Item",
          next: () => ({
            title: "Item",
            options: Object.keys(ITEMS).map((name) => ({
              label: name,
              right: `×${inventory[name]}`,
              disabled: inventory[name] <= 0,
              next: () => allyTargets((t) => commit(() => useItem(actor, name, t))),
            })),
          }),
        },
      ],
    };
    menu = { actor, stack: [{ ...root, index: 0 }] };
    renderMenu();
  }

  function closeMenu() {
    menu = null;
    $("#command").hidden = true;
    cursor.visible = false;
  }

  function renderMenu() {
    const level = menu.stack[menu.stack.length - 1];
    const el = $("#command");
    el.hidden = false;
    el.innerHTML = `<h3>${level.title}</h3>`;
    level.options.forEach((option, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = [option.className, i === level.index ? "selected" : ""].join(" ");
      btn.disabled = !!option.disabled;
      btn.innerHTML = `<span>${option.label}</span><span>${option.right ?? ""}</span>`;
      btn.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        level.index = i;
        choose();
      });
      el.append(btn);
    });
    const target = level.options[level.index]?.target;
    cursor.visible = !!target;
    if (target) cursor.userData.target = target;
  }

  function choose() {
    const level = menu.stack[menu.stack.length - 1];
    const option = level.options[level.index];
    if (!option || option.disabled) return;
    if (option.run) return option.run();
    const next = option.next();
    if (!next.options.length) return;
    menu.stack.push({ ...next, index: 0 });
    renderMenu();
  }

  function onKey(code) {
    if (resultContinue && CONFIRM.includes(code)) return resultContinue();
    if (!menu) return;
    const level = menu.stack[menu.stack.length - 1];
    const n = level.options.length;
    const step = { ArrowUp: -1, KeyW: -1, ArrowLeft: -1, KeyA: -1, ArrowDown: 1, KeyS: 1, ArrowRight: 1, KeyD: 1 }[code];
    if (step) {
      level.index = (level.index + step + n) % n;
      renderMenu();
    } else if (CONFIRM.includes(code)) {
      choose();
    } else if (CANCEL.includes(code) && menu.stack.length > 1) {
      menu.stack.pop();
      renderMenu();
    }
  }

  // ----- Endings -----

  async function victory() {
    over = true;
    closeMenu();
    activeRing.visible = false;
    await wait(0.9);
    const foes = actors.filter((a) => a.side === "enemy");
    const xp = foes.reduce((s, a) => s + a.type.xp, 0);
    const earned = foes.reduce((s, a) => s + a.type.gil, 0);
    gil += earned;
    const lines = [`Gained ${xp} EXP and ${earned} gil.`];
    for (const a of alive("party")) {
      const m = a.data;
      m.xp += xp;
      while (m.xp >= m.level * 40) {
        m.xp -= m.level * 40;
        m.level += 1;
        m.maxHp += 14;
        m.maxMp += 3;
        m.atk += 2;
        m.mag += 2;
        lines.push(`${m.name} reached level ${m.level}!`);
      }
    }
    cam.goalPos.set(9, 2.6, 6);
    cam.goalLook.set(5, 1.6, 0);
    cam.sway = false;
    for (const a of alive("party")) {
      a.model.root.rotation.y = 0.4;
      tween(0.5, (t) => { a.model.root.position.y = Math.sin(t * Math.PI) * 0.6; a.model.arms[1].rotation.x = -2.9 * t; });
    }
    showResult("Victory!", lines);
  }

  async function defeat() {
    over = true;
    closeMenu();
    await wait(1);
    showResult("Defeat…", ["The party has fallen.", "You wake beside the crystal, your wounds mended."], true);
  }

  function showResult(title, lines, lost = false) {
    const el = $("#result");
    el.innerHTML = `<h2>${title}</h2>${lines.map((l) => `<div>${l}</div>`).join("")}<div class="hint">Press Enter or tap to continue</div>`;
    el.hidden = false;
    resultContinue = () => {
      resultContinue = null;
      el.hidden = true;
      for (const m of party) {
        if (lost) Object.assign(m, { hp: m.maxHp, mp: m.maxMp, limit: 0 });
        else m.hp = Math.max(1, m.hp);
      }
      endBattle(lost);
    };
  }

  $("#result").addEventListener("pointerdown", () => resultContinue?.());

  // ----- Frame update -----

  function update(dt, t) {
    const waitMode = menu && menu.stack.length > 1;
    if (!over && !waitMode) {
      for (const a of actors) {
        if (a.state !== "charging") continue;
        a.atb = Math.min(1, a.atb + dt * a.data.spd * (a.side === "party" ? 0.24 : 0.17));
        if (a.atb < 1) continue;
        if (a.side === "party") {
          a.state = "ready";
          ready.push(a);
        } else {
          enqueue(a, () => enemyTurn(a));
        }
      }
    }

    if (!busy && queue.length && !over) {
      busy = true;
      queue.shift()().then(() => {
        busy = false;
        camDefault();
        checkEnd();
      });
    }

    if (!menu && ready.length && !over) openMenu(ready[0]);

    // Idle motion.
    for (const a of actors) {
      if (a.state === "dead") continue;
      a.model.update?.(t + a.home.z);
      if (a.side === "party" && a.state !== "acting") a.model.body.position.y = Math.sin(t * 2.5 + a.home.z) * 0.03;
      if (a.type?.make === makeHound && a.state !== "acting") a.model.body.position.y = Math.abs(Math.sin(t * 4 + a.home.z)) * 0.04;
      if (a.type?.make === makeGolem && a.state !== "acting") a.model.body.rotation.z = Math.sin(t * 1.2) * 0.03;
    }

    activeRing.visible = !!menu;
    if (menu) {
      activeRing.position.set(menu.actor.model.root.position.x, 0.05, menu.actor.model.root.position.z);
      activeRing.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
    }
    if (cursor.visible) {
      const target = cursor.userData.target;
      cursor.position.set(target.model.root.position.x, target.model.height + 0.5 + Math.sin(t * 6) * 0.12, target.model.root.position.z);
      cursor.rotation.y = t * 3;
    }

    const goal = cam.goalPos.clone();
    if (cam.sway) goal.applyAxisAngle(new V3(0, 1, 0), Math.sin(t * 0.35) * 0.28);
    camera.position.lerp(goal, 1 - Math.exp(-dt * 2.5));
    cam.look.lerp(cam.goalLook, 1 - Math.exp(-dt * 3));
    camera.lookAt(cam.look);

    updatePanels();
  }

  return { scene, camera, start, update, onKey, get state() { return { actors, queue, ready, busy, over, menu }; } };
})();

// ---------- Mode switching ----------

const transitionEl = $("#transition");

async function playTransition(name, seconds) {
  transitionEl.className = "";
  void transitionEl.offsetWidth;
  transitionEl.className = name;
  await wait(seconds);
}

async function startBattle(formation) {
  if (mode !== "field") return;
  mode = "transition";
  held.clear();
  stick.x = stick.y = 0;
  // Spin the field camera around Kael while the screen shatters.
  const cam = field.camera;
  const pivot = field.player.root.position;
  const offset = cam.position.clone().sub(pivot);
  tween(0.9, (t) => {
    cam.position.copy(pivot).add(offset.clone().applyAxisAngle(new V3(0, 1, 0), t * 2.5).multiplyScalar(1 - t * 0.6));
    cam.lookAt(pivot.x, 1.2, pivot.z);
  }, ease.in);
  await playTransition("in", 0.9);
  battle.start(formation);
  $("#battle").hidden = false;
  stage.classList.add("in-battle");
  mode = "battle";
  await playTransition("out", 0.6);
  transitionEl.className = "";
}

async function endBattle(lost) {
  mode = "transition";
  await playTransition("in", 0.9);
  $("#battle").hidden = true;
  stage.classList.remove("in-battle");
  if (lost) field.returnToRespawn();
  field.resetEncounter();
  mode = "field";
  await playTransition("out", 0.6);
  transitionEl.className = "";
}

// ---------- Input wiring ----------

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if (event.repeat && !event.code.startsWith("Arrow") && !"KeyWKeyAKeySKeyD".includes(event.code)) return;
  held.add(event.code);
  if (mode === "field" && !event.repeat) field.onKey(event.code);
  else if (mode === "battle") battle.onKey(event.code);
});
window.addEventListener("keyup", (event) => held.delete(event.code));
window.addEventListener("blur", () => held.clear());

const stickEl = $("#stick");
stickEl.addEventListener("pointerdown", (event) => {
  stickEl.setPointerCapture(event.pointerId);
  moveStick(event);
});
stickEl.addEventListener("pointermove", (event) => {
  if (stickEl.hasPointerCapture(event.pointerId)) moveStick(event);
});
const releaseStick = () => {
  stick.x = stick.y = 0;
  stickEl.firstElementChild.style.transform = "translate(-50%, -50%)";
};
stickEl.addEventListener("pointerup", releaseStick);
stickEl.addEventListener("pointercancel", releaseStick);

function moveStick(event) {
  const rect = stickEl.getBoundingClientRect();
  let x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
  let y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  stick.x = x;
  stick.y = -y;
  stickEl.firstElementChild.style.transform = `translate(calc(-50% + ${x * 70}%), calc(-50% + ${y * 70}%))`;
}

$("#action").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (mode === "field") field.onKey("Enter");
});
$("#dialog").addEventListener("pointerdown", () => field.advanceDialog());

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

$("#hint").textContent = "WASD / arrows: move · Enter: talk & confirm · Esc: back";
setTimeout(() => $("#hint").classList.add("gone"), 8000);

// ---------- Main loop ----------

window.addEventListener("resize", resize);
resize();

let last = performance.now();
let clock = 0;
function step(dt) {
  clock += dt;
  updateTweens(dt);
  if (mode === "field") field.update(dt, clock);
  if (mode === "battle") battle.update(dt, clock);
}

function frame(now) {
  step(Math.min((now - last) / 1000, 0.05));
  last = now;
  const showBattle = mode === "battle" || (mode === "transition" && !$("#battle").hidden);
  renderer.render(showBattle ? battle.scene : field.scene, showBattle ? battle.camera : field.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame((now) => {
  last = now;
  frame(now);
  $("#loading").hidden = true;
});

// Handy for testing from the console; advance() runs game time without rendering.
window.game = { advance: (seconds) => { for (let i = 0; i < seconds / 0.05; i++) step(0.05); }, renderer, field, battle, party, inventory, startBattle, get mode() { return mode; } };
