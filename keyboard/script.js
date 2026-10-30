const $ = (id) => document.querySelector(`#${id}`);
let count = 0;

window.addEventListener("keydown", (event) => {
  // Let Tab keep moving focus so the back link stays reachable.
  if (event.key !== "Tab") event.preventDefault();
  count++;
  const mods = ["ctrlKey", "altKey", "shiftKey", "metaKey"]
    .filter((m) => event[m])
    .map((m) => m.replace("Key", ""));
  $("key").textContent = event.key === " " ? "Space" : event.key;
  $("k-key").textContent = JSON.stringify(event.key);
  $("k-code").textContent = event.code;
  $("k-mods").textContent = mods.join(" + ") || "none";
  $("k-repeat").textContent = String(event.repeat);
  $("k-count").textContent = String(count);
});
