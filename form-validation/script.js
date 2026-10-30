const form = document.querySelector("#signup");
const result = document.querySelector("#result");

const rules = {
  name: (v) => (v.trim().length >= 2 ? "" : "Enter at least 2 characters."),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Enter a valid email address."),
  password: (v) => (v.length >= 8 && /\d/.test(v) ? "" : "Use 8+ characters including a number."),
};

function check(field) {
  const message = rules[field.name](field.value);
  field.setAttribute("aria-invalid", message ? "true" : "false");
  document.querySelector(`#${field.name}-error`).textContent = message;
  return !message;
}

form.addEventListener("input", (event) => {
  if (event.target.name in rules) check(event.target);
  result.textContent = "";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = [...form.elements].filter((el) => el.name in rules);
  const valid = fields.map(check).every(Boolean);
  result.textContent = valid ? `Thanks, ${form.name.value.trim()}! The form is valid.` : "";
  if (!valid) fields.find((f) => f.getAttribute("aria-invalid") === "true").focus();
});
