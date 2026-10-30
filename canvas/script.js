const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d");
const toggle = document.querySelector("#toggle");
const reset = document.querySelector("#reset");
const fps = document.querySelector("#fps");
const colors = ["#245c3b", "#58a773", "#9dc9a8", "#c98b3a", "#4f7cac"];

let balls = [];
let running = true;
let last = performance.now();
let frames = 0;
let fpsTime = last;

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function addBall(x, y) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 80 + Math.random() * 120;
  balls.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 6 + Math.random() * 10,
    color: colors[balls.length % colors.length],
  });
}

function seed() {
  balls = [];
  for (let i = 0; i < 8; i++) {
    addBall(Math.random() * canvas.clientWidth, Math.random() * canvas.clientHeight);
  }
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  for (const b of balls) {
    if (running) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < b.r || b.x > w - b.r) { b.vx *= -1; b.x = Math.max(b.r, Math.min(w - b.r, b.x)); }
      if (b.y < b.r || b.y > h - b.r) { b.vy *= -1; b.y = Math.max(b.r, Math.min(h - b.r, b.y)); }
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.fill();
  }
  frames++;
  if (now - fpsTime >= 500) {
    fps.textContent = `${Math.round((frames * 1000) / (now - fpsTime))} fps · ${balls.length} balls`;
    frames = 0;
    fpsTime = now;
  }
  requestAnimationFrame(frame);
}

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  addBall(event.clientX - rect.left, event.clientY - rect.top);
});
toggle.addEventListener("click", () => {
  running = !running;
  toggle.textContent = running ? "Pause" : "Play";
});
reset.addEventListener("click", seed);
window.addEventListener("resize", resize);

resize();
seed();
requestAnimationFrame(frame);
