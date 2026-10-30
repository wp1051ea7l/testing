const load = document.querySelector("#load");
const state = document.querySelector("#state");
const list = document.querySelector("#list");

load.addEventListener("click", async () => {
  state.textContent = "Loading…";
  list.replaceChildren();
  const started = performance.now();
  try {
    const response = await fetch(`data.json?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { items } = await response.json();
    for (const item of items) {
      const li = document.createElement("li");
      li.append(item.name);
      const detail = document.createElement("span");
      detail.textContent = item.detail;
      li.append(detail);
      list.append(li);
    }
    state.textContent = `${items.length} items in ${Math.round(performance.now() - started)} ms`;
  } catch (error) {
    state.textContent = `Failed: ${error.message}`;
  }
});
