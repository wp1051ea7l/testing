const button = document.querySelector("#test-button");
const count = document.querySelector("#count");
let clicks = 0;

button.addEventListener("click", () => {
  clicks += 1;
  count.textContent = `${clicks} ${clicks === 1 ? "click" : "clicks"}`;
});