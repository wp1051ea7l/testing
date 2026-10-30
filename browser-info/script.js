const info = document.querySelector("#info");
const media = (query) => window.matchMedia(query).matches;

function facts() {
  return {
    "Viewport": `${window.innerWidth} × ${window.innerHeight}`,
    "Screen": `${screen.width} × ${screen.height}`,
    "Pixel ratio": String(window.devicePixelRatio),
    "Color scheme": media("(prefers-color-scheme: dark)") ? "dark" : "light",
    "Reduced motion": media("(prefers-reduced-motion: reduce)") ? "yes" : "no",
    "Touch": navigator.maxTouchPoints > 0 ? `yes (${navigator.maxTouchPoints} points)` : "no",
    "Online": navigator.onLine ? "yes" : "no",
    "Language": navigator.language,
    "Time zone": Intl.DateTimeFormat().resolvedOptions().timeZone,
    "Cookies enabled": navigator.cookieEnabled ? "yes" : "no",
    "Protocol": location.protocol,
    "User agent": navigator.userAgent,
  };
}

function render() {
  info.replaceChildren(
    ...Object.entries(facts()).flatMap(([label, value]) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      return [dt, dd];
    })
  );
}

for (const type of ["resize", "online", "offline"]) window.addEventListener(type, render);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
render();
