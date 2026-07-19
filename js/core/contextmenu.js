function closeContextMenus() {
  document

    .querySelectorAll(".context-menu")

    .forEach((menu) => {
      menu.remove();
    });
}

function openContextMenu(items, x, y) {
  closeContextMenus();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.innerHTML = items
    .map((item) => {
      const dangerClass = item.danger ? " danger" : "";
      return `
          <button class="${dangerClass.trim()}" data-id="${item.id}">
            ${item.label}
          </button>
        `;
    })
    .join("");

  menu.style.left = x + "px";
  menu.style.top = y + "px";
  document.body.append(menu);

  menu.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = items.find((i) => i.id === button.dataset.id);
      if (item?.action) {
        item.action();
      }
      closeContextMenus();
    });
  });

  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = window.innerWidth - rect.width - 10 + "px";
    }

    if (rect.bottom > window.innerHeight) {
      menu.style.top = window.innerHeight - rect.height - 10 + "px";
    }
  });
}

document.addEventListener("click", closeContextMenus);

document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  openContextMenu(
    [
      {
        id: "refresh",
        label: "Refresh",
        action() {
          renderDesktopApps();
        },
      },
    ],
    e.clientX,
    e.clientY
  );
});
