const KEY = "testing:note";
const note = document.querySelector("#note");
const saved = document.querySelector("#saved");
const clear = document.querySelector("#clear");

function store(value) {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
    saved.textContent = value ? `Saved at ${new Date().toLocaleTimeString()}` : "Cleared";
  } catch {
    saved.textContent = "Storage is unavailable in this browser.";
  }
}

try {
  note.value = localStorage.getItem(KEY) ?? "";
  if (note.value) saved.textContent = "Restored from local storage";
} catch {
  saved.textContent = "Storage is unavailable in this browser.";
}

note.addEventListener("input", () => store(note.value));
clear.addEventListener("click", () => {
  note.value = "";
  store("");
  note.focus();
});
