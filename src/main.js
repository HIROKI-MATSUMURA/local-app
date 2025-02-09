import { gsap } from "gsap";

document.addEventListener("DOMContentLoaded", () => {
  const box = document.createElement("div");
  box.style.width = "100px";
  box.style.height = "100px";
  box.style.backgroundColor = "red";
  document.body.appendChild(box);

  gsap.to(box, { x: 300, duration: 2, repeat: -1, yoyo: true });
});

document.getElementById("theme-switch").addEventListener("click", () => {
  const theme = document.body.dataset.theme === "dark" ? "light" : "dark";
  document.body.dataset.theme = theme;
  document.querySelector('link[rel="stylesheet"]').href = `styles/themes/theme-${theme}.css`;
});
