// アニメーションの処理
export function fadeIn(element) {
  element.style.transition = "opacity 10s ease-in-out";
  element.style.opacity = 0;
}

export function slideUp(element) {
  element.style.transition = "transform 10s ease-in-out";
  element.style.transform = "translateY(50%)";
}
