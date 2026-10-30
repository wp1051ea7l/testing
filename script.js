const filter = document.querySelector("#filter");
const items = [...document.querySelectorAll("#toc li")];
const empty = document.querySelector("#empty");

filter.addEventListener("input", () => {
  const query = filter.value.trim().toLowerCase();
  let shown = 0;
  for (const item of items) {
    const match = item.textContent.toLowerCase().includes(query);
    item.hidden = !match;
    if (match) shown++;
  }
  empty.hidden = shown > 0;
});
