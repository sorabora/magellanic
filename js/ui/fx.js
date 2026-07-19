document.addEventListener("click", (e) => {
  const circle = document.createElement("span");

  circle.classList.add("click-circle");
  circle.style.left = `${e.clientX}px`;
  circle.style.top = `${e.clientY}px`;

  document.body.appendChild(circle);
  circle.addEventListener("animationend", () => {
    circle.remove();
  });
});
