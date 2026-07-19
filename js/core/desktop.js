const handlers = {};
let recent = [];
let taskbar = [];
let osVersion = "1.0.0";
let hash;

createSystemHash();
loadHandlers();

async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function isOfficialHash() {
  const officialHashes = ["23cf66"]
  if (officialHashes.includes(hash)) {
    return "This installation matches an official magellanic build."
  } else {
    return "This installation does not match an official magellanic build. It may be a vendor build or a modified version."
  }
}

async function createSystemHash() {
  const version = await sha256(osVersion);
  const systemLibaries = await sha256(JSON.stringify(disk.system.children.filetypehandlers.children));
  
  const fTypes = await sha256(JSON.stringify(disk.system.children[".ftypes"]));
  const hostName = await sha256(JSON.stringify(window.location.hostname));

  hash = (await sha256([version, systemLibaries, fTypes, hostName])).slice(0, 6);
}

function loadHandlers() {
  const systemHandlers = disk.system.children.filetypehandlers.children;

  for (const name in systemHandlers) {
    const file = systemHandlers[name];
    if (file.format !== "skaizex") {
      continue;
    }
    const decoded = atob(file.data);
    const runtime = new Function(decoded);

    if (file.target) {
      const target = disk[username].children[file.target];

      openFile(file.target, {
        ...target,
        metadata: file.metadata ?? target.metadata ?? {},
      });
      return;
    }

    const handler = runtime();
    handlers[handler.extension] = handler;
  }
}

function openFile(name, file, options = {}) {
  const elevated = options.elevated ?? false;
  const admin = options.admin ?? file.admin ?? elevated;
  const meta = {
    ...file.metadata,
    elevated,
    admin,
    user: username,
  };

  if (file.type === "webapp") {
    const content = createWindow(name, name, {
      closable: true,
      minimizable: true,
      resizable: true,
    });

    content.innerHTML = `
      <iframe
        src="${file.url}"
        style="
          width:100%;
          height:100%;
          border:none;
        "
      ></iframe>
    `;
    return;
  }

  if (file.format === "txt") {
    alert(atob(file.data));
    return;
  }
  if (file.format === "skaizex") {
    alert("Cannot directly run system executables");
    return;
  }
  const handler = handlers[file.format];
  if (!handler) {
    const openers = window.fs.loadFtypeOpeners();
    const opener = openers[file.format] || openers.default || "textedit";
    if (opener === "textedit") {
      openInTextEditor(name, file, meta, options.path);
      return;
    }
    const openerApp = homeChildren()[opener];
    const openerHandler = openerApp ? handlers[openerApp.format] : null;
    if (openerApp && openerHandler) {
      recent.push(options.path ?? name);
      openerHandler.open({
        ...openerApp,
        metadata: {
          ...meta,
          textEditPath: options.path,
          textEditName: name,
          textEditContent: window.fs.readFileContent(file, name),
        },
      });
      return;
    }
    openInTextEditor(name, file, meta, options.path);
    return;
  }
  recent.push(name);
  handler.open({
    ...file,
    metadata: meta,
  });
}

function homeChildren() {
  return disk[username]?.children ?? {};
}

function openInTextEditor(name, file, meta, path) {
  const textedit = homeChildren().textedit;
  const kaizexHandler = handlers.kaizex;
  if (!textedit || !kaizexHandler) {
    alert(`No handler for ${file.format ?? "unknown"}`);
    return;
  }
  recent.push(path ?? name);
  kaizexHandler.open({
    ...textedit,
    metadata: {
      ...meta,
      textEditPath: path,
      textEditName: name,
      textEditContent: window.fs.readFileContent(file, name),
    },
  });
}

let systemFailureShown = false;

function hasSystemFolder() {
  return Boolean(disk?.system?.children);
}

async function watchSystemIntegrity() {
  if (systemFailureShown) return;
  if (hasSystemFolder()) return;

  systemFailureShown = true;

  await showConfirmation({
    title: "This system is kinda cooked up",
    message:
      "/system is missing, auto-restarting the OS",
    buttons: [
      {
        id: "ok",
        label: "OK",
        primary: true,
      },
    ],
  });
}

function createWebApp(name, options = {}) {
  const key = String(name).trim();
  if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) {
    return {
      ok: false,
      error: "Invalid app name (use letters, numbers, - or _)",
    };
  }

  const url = String(options.url || "").trim();
  if (!url) {
    return { ok: false, error: "URL is required" };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "URL must be http or https" };
    }
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  const home = disk[username];
  if (!home?.children) {
    return { ok: false, error: "Home directory not found" };
  }

  if (home.children[key]) {
    return { ok: false, error: "An app with that name already exists" };
  }

  const entry = {
    type: "webapp",
    url,
    owner: username,
    label: String(options.label || key).trim() || key,
  };

  const iconUrl = options.iconUrl;
  if (iconUrl && String(iconUrl).startsWith("data:image/")) {
    entry.icon = String(iconUrl);
  }

  home.children[key] = entry;
  renderDesktopApps();
  return { ok: true };
}

function isLaunchableEntry(key, node) {
  if (key.startsWith(".")) return false;
  if (node.type === "webapp") return true;
  if (node.type === "file" && (
    node.format === "kaizex" ||
    node.format === "zipapp"
  )) {
    return true;
  }
  return false;
}

function restoreWindow(id) {
  const existing = taskbar.find((item) => item.id === id);
  if (!existing) {
    return false;
  }

  existing.window.style.display = "block";
  taskbar = taskbar.filter((item) => item !== existing);

  return true;
}

const maxWindowsPerApp = 3;
const appStylesheets = ["core.css", "terminal.css"];
const fontAwesomeStylesheet =
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";
let cachedAppCss = "";

async function loadAppStylesheets() {
  try {
    const sources = [...appStylesheets, fontAwesomeStylesheet];
    const parts = await Promise.all(
      sources.map((href) =>
        fetch(href, { cache: "no-store" }).then((res) => res.text()),
      ),
    );
    cachedAppCss = parts.join("\n");
    document.querySelectorAll(".window-content").forEach((host) => {
      const shadow = host.shadowRoot;
      if (!shadow || shadow.querySelector("style[data-os-styles]")) {
        return;
      }
      const osStyle = document.createElement("style");
      osStyle.dataset.osStyles = "true";
      osStyle.textContent = cachedAppCss;
      shadow.prepend(osStyle);
    });
  } catch (err) {
    console.warn("failed to preload app stylesheets", err);
  }
}

function countAppWindows(appId) {
  return document.querySelectorAll(`.window[data-app-id="${appId}"]`).length;
}

function createAppSurface(host, appRoot) {
  return {
    get metadata() {
      return host.metadata;
    },
    set metadata(value) {
      host.metadata = value;
    },
    get innerHTML() {
      return appRoot.innerHTML;
    },
    set innerHTML(value) {
      appRoot.innerHTML = value;
    },
    appendChild(node) {
      return appRoot.appendChild(node);
    },
    getElementById(id) {
      return host.shadowRoot.getElementById(id);
    },
    querySelector(selector) {
      return appRoot.querySelector(selector);
    },
    querySelectorAll(selector) {
      return appRoot.querySelectorAll(selector);
    },
  };
}

function mountAppContent(host, metadata) {
  host.metadata = metadata ?? {};

  let shadow = host.shadowRoot;
  if (!shadow) {
    shadow = host.attachShadow({ mode: "open" });

    const hostStyle = document.createElement("style");
    hostStyle.dataset.systemStyle = "true";
    hostStyle.textContent =
      ":host { display: block; height: 100%; overflow: hidden; color: white; transform: translateZ(0); contain: paint; isolation: isolate; } .app-root { height: 100%; overflow: auto; position: relative; }";
    shadow.appendChild(hostStyle);

    if (cachedAppCss) {
      const osStyle = document.createElement("style");
      osStyle.dataset.osStyles = "true";
      osStyle.textContent = cachedAppCss;
      shadow.appendChild(osStyle);
    } else {
      for (const href of [...appStylesheets, fontAwesomeStylesheet]) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        shadow.appendChild(link);
      }
    }

    const appRoot = document.createElement("div");
    appRoot.className = "app-root";
    shadow.appendChild(appRoot);
    host.appRoot = appRoot;
  }

  return createAppSurface(host, host.appRoot);
}

function isAllowedBodyNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return true;
  }
  if (node.id === "desktop" || node.id === "ex") {
    return true;
  }
  if (node.classList?.contains("click-circle")) {
    return true;
  }
  if (node.classList?.contains("context-menu")) {
    return true;
  }
  return false;
}

function isAllowedHeadNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return true;
  }
  if (node.tagName === "STYLE") {
    if (node.dataset.systemStyle === "true") {
      return true;
    }
    if (node.dataset.faStyles === "true") {
      return true;
    }
    const id = node.id || "";
    if (id.includes("fontawesome") || id.startsWith("fa-")) {
      return true;
    }
    const styleText = node.textContent || "";
    if (id.includes("ace") || styleText.includes(".ace_")) {
      return true;
    }
    return false;
  }
  if (node.tagName === "LINK") {
    return true;
  }
  if (node.tagName === "META" || node.tagName === "TITLE") {
    return true;
  }
  if (node.tagName === "SCRIPT") {
    return true;
  }
  return false;
}

function isInjectedThreat(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  if (
    node.tagName === "STYLE" &&
    node.dataset.systemStyle !== "true" &&
    node.dataset.osStyles !== "true"
  ) {
    return true;
  }

  if (node.tagName === "DIV" || node.tagName === "IFRAME") {
    if (node.classList?.contains("context-menu")) {
      return false;
    }
    const style = node.style;
    const zIndex = Number.parseInt(style.zIndex, 10);
    if (style.position === "fixed" && zIndex >= 99990) {
      return true;
    }
  }

  return false;
}

function removeInjectedThreat(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }
  if (isInjectedThreat(node)) {
    node.remove();
  }
  node
    .querySelectorAll?.(
      "style:not([data-system-style]):not([data-os-styles]), #beforeCssLeak, #beforeCssDomLeak, #virusCorruptionLayer",
    )
    .forEach((el) => el.remove());
}

function installDomGuard() {
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (mutation.target === document.body && !isAllowedBodyNode(node)) {
          node.remove();
          continue;
        }
        if (mutation.target === document.head && !isAllowedHeadNode(node)) {
          node.remove();
          continue;
        }
        removeInjectedThreat(node);
      }
    }
  }).observe(document.body, { childList: true });

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!isAllowedHeadNode(node)) {
          node.remove();
        }
        removeInjectedThreat(node);
      }
    }
  }).observe(document.head, { childList: true });

  for (const rootId of ["desktop", "workspace"]) {
    const root = document.getElementById(rootId);
    if (!root) continue;
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          removeInjectedThreat(node);
        }
      }
    }).observe(root, { childList: true, subtree: true });
  }
}

function resolveWindowControls(controls = {}) {
  if (registry.get("system.forceAllOptions")) {
    return { closable: true, minimizable: true, resizable: true };
  }
  return {
    closable: Boolean(controls.closable),
    minimizable: Boolean(controls.minimizable),
    resizable: Boolean(controls.resizable),
  };
}

let registryEditorAuthorized = false;

function authorizeRegistryEditor() {
  registryEditorAuthorized = true;
}

function openRegistryEditor() {
  if (!registryEditorAuthorized) {
    alert("Registry Editor requires admin privileges.");
    return;
  }
  registryEditorAuthorized = false;
  const content = createWindow("registryedit", "Registry Editor", {
    closable: true,
    minimizable: true,
    resizable: true,
  });

  renderRegistryEditor(content);
}

// Renders the editor from the hive schema so new settings in hive.json show up
// automatically, grouped by category with a safe/dangerous badge each.
function renderRegistryEditor(content) {
  const settings = registry.getSettings();

  const escapeAttr = (value) =>
    String(value).replace(/"/g, "&quot;").replace(/</g, "&lt;");

  function renderControl(setting) {
    const value = registry.get(setting.key, setting.default);
    if (setting.type === "boolean") {
      return `<input type="checkbox" data-reg-key="${setting.key}" data-reg-type="boolean" ${
        value ? "checked" : ""
      } />`;
    }
    if (setting.type === "number") {
      const min = setting.min != null ? `min="${setting.min}"` : "";
      const max = setting.max != null ? `max="${setting.max}"` : "";
      return `<input type="number" data-reg-key="${setting.key}" data-reg-type="number" ${min} ${max} value="${escapeAttr(value)}" />`;
    }
    if (setting.type === "select") {
      const options = (setting.options || [])
        .map(
          (opt) =>
            `<option value="${escapeAttr(opt)}" ${opt === value ? "selected" : ""}>${escapeAttr(opt)}</option>`,
        )
        .join("");
      return `<select data-reg-key="${setting.key}" data-reg-type="select">${options}</select>`;
    }
    return `<input type="text" data-reg-key="${setting.key}" data-reg-type="text" value="${escapeAttr(value)}" />`;
  }

  const groups = [];
  for (const setting of settings) {
    let group = groups.find((g) => g.category === setting.category);
    if (!group) {
      group = { category: setting.category, items: [] };
      groups.push(group);
    }
    group.items.push(setting);
  }

  const groupsHtml = groups
    .map((group) => {
      const rows = group.items
        .map((setting) => {
          const dangerous = setting.risk === "dangerous";
          const badge = dangerous
            ? `<span class="registry-badge danger">DANGEROUS</span>`
            : `<span class="registry-badge safe">SAFE</span>`;
          return `
          <label class="registry-option ${dangerous ? "is-dangerous" : ""}">
            ${renderControl(setting)}
            <span>
              <strong>${setting.key} ${badge}</strong>
              <small>${setting.description || ""}</small>
            </span>
          </label>`;
        })
        .join("");
      return `<section class="registry-group"><h3>${group.category}</h3>${rows}</section>`;
    })
    .join("");

  content.innerHTML = `
    <div class="registry-editor">
      <h2>Registry Editor</h2>
      <p class="mb">System settings stored in the virtual registry (hive.json).</p>
      ${groupsHtml || "<p>Loading settings…</p>"}
    </div>
  `;

  content.querySelectorAll("[data-reg-key]").forEach((input) => {
    const key = input.dataset.regKey;
    const type = input.dataset.regType;
    input.addEventListener("change", (e) => {
      const el = e.target;
      let value;
      if (type === "boolean") value = el.checked;
      else if (type === "number") value = Number(el.value);
      else value = el.value;
      registry.set(key, value);
    });
  });
}

function createWindow(appId, title, controls, metadata) {
  const windowLimit = registry.get("system.maxWindowsPerApp", maxWindowsPerApp);
  if (countAppWindows(appId) >= windowLimit) {
    throw new Error(
      `window limit reached for ${appId} (max ${windowLimit})`,
    );
  }

  const win = document.createElement("div");

  win.className = controls?.maximized ? "window max" : "window";
  win.dataset.appId = appId;

  if (!controls?.maximized) {
    win.style.width = (controls?.width ?? 450) + "px";
    win.style.height = (controls?.height ?? 330) + "px";
  }

  const resolvedControls = resolveWindowControls(controls);
  win.innerHTML = `
  <div class="window-bar">
    <span>${title}</span>
    <div class="window-controls">
      ${
        resolvedControls.closable
          ? `
      <button type="button" class="nomargin control-button close" aria-label="Close">
        <i class="fa-solid fa-circle"></i>
      </button>
      `
          : ""
      }
      ${
        resolvedControls.minimizable
          ? `
      <button type="button" class="nomargin control-button minimize" aria-label="Minimize">
        <i class="fa-solid fa-circle"></i>
      </button>
      `
          : ""
      }
      ${
        resolvedControls.resizable
          ? `
      <button type="button" class="nomargin control-button maximize" aria-label="Maximize">
        <i class="fa-solid fa-circle"></i>
      </button>
      `
          : ""
      }
    </div>
  </div>
  <div class="window-content"></div>
  `;

  document.getElementById("workspace").appendChild(win);
  const bar = win.querySelector(".window-bar");

  makeDraggable(win, bar);

  const stopBarDrag = (e) => e.stopPropagation();

  const closeBtn = win.querySelector(".window-controls .close");
  if (closeBtn) {
    closeBtn.addEventListener("mousedown", stopBarDrag);
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (
        registry.get("system.confirmOnClose") &&
        !confirm(`Close "${title}"?`)
      ) {
        return;
      }
      win.remove();
    });
  }

  const minimizeBtn = win.querySelector(".window-controls .minimize");
  if (minimizeBtn) {
    minimizeBtn.addEventListener("mousedown", stopBarDrag);
    minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      win.style.display = "none";
      taskbar.push({
        id: appId,
        title,
        window: win,
      });
      renderTaskbar();
    });
  }

  const resizeBtn = win.querySelector(".window-controls .maximize");
  if (resizeBtn) {
    resizeBtn.addEventListener("mousedown", stopBarDrag);
    resizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      win.classList.toggle("max");
    });
  }

  const host = win.querySelector(".window-content");
  return mountAppContent(host, metadata);
}

function showConfirmation(options = {}) {
  return new Promise((resolve) => {
    const appId = `confirm-${Date.now()}`;
    let settled = false;

    const inputDefs = Array.isArray(options.inputs) ? options.inputs : [];
    const hasInputs = inputDefs.length > 0;

    function collectValues() {
      const values = {};
      for (const def of inputDefs) {
        const field = content.getElementById(`confirmInput-${def.id}`);
        values[def.id] = field ? field.value : def.value ?? "";
      }
      return values;
    }

    // Backwards-compatible: resolves to the button id string, unless `inputs`
    // were requested — then resolves to `{ button, values }`.
    function finish(buttonId) {
      if (settled) return;
      settled = true;
      const result = hasInputs
        ? { button: buttonId, values: collectValues() }
        : buttonId;
      const win = document.querySelector(`.window[data-app-id="${appId}"]`);
      if (win) win.remove();
      resolve(result);
    }

    const content = createWindow(appId, options.title ?? "Confirm", {
      closable: true,
      minimizable: false,
      resizable: false,
    });

    const win = document.querySelector(`.window[data-app-id="${appId}"]`);
    if (win) {
      win.style.minHeight = "160px";
      const closeBtn = win.querySelector(".window-controls .close");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => finish("cancel"), {
          once: true,
        });
      }
    }

    const buttons = options.buttons ?? [
      { id: "cancel", label: "Cancel" },
      { id: "confirm", label: "Confirm", primary: true },
    ];

    content.innerHTML = `
      <div class="confirm-dialog">
        <p id="confirmMessage"></p>
        <div id="confirmInputs"></div>
        <div class="flex-row mt" id="confirmActions"></div>
      </div>
    `;

    content.getElementById("confirmMessage").textContent =
      options.message ?? "";

    // The button Enter submits to: the primary one, else the first non-cancel.
    const submitButton =
      buttons.find((b) => b.primary && !b.danger) ??
      buttons.find((b) => b.id !== "cancel") ??
      buttons[0];

    const inputsHost = content.getElementById("confirmInputs");
    let firstField = null;
    for (const def of inputDefs) {
      const wrap = document.createElement("label");
      wrap.className = "confirm-field";
      if (def.label) {
        const lbl = document.createElement("span");
        lbl.className = "confirm-field-label";
        lbl.textContent = def.label;
        wrap.appendChild(lbl);
      }
      const field = document.createElement("input");
      field.type = def.type ?? "text";
      field.id = `confirmInput-${def.id}`;
      if (def.placeholder) field.placeholder = def.placeholder;
      field.value = def.value ?? "";
      field.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && submitButton) {
          e.preventDefault();
          finish(submitButton.id);
        }
      });
      wrap.appendChild(field);
      inputsHost.appendChild(wrap);
      if (!firstField) firstField = field;
    }
    if (firstField) firstField.focus();

    const actions = content.getElementById("confirmActions");
    for (const btn of buttons) {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = btn.label;
      el.className = "f-1";
      if (btn.danger) {
        el.classList.add("danger");
      } else if (btn.primary) {
        el.classList.add("auto");
      } else {
        el.classList.add("dark");
      }
      el.addEventListener("click", () => finish(btn.id));
      actions.appendChild(el);
    }
  });
}

setInterval(watchSystemIntegrity, 1000);
watchSystemIntegrity();

window.showConfirmation = showConfirmation;

let newZIndex = 2;

function makeDraggable(win, bar) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  bar.addEventListener("mousedown", (e) => {
    if (registry.get("system.disableWindowDrag")) return;
    dragging = true;
    offsetX = e.clientX - win.offsetLeft;
    offsetY = e.clientY - win.offsetTop;
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;
    if (registry.get("system.snapToGrid")) {
      const grid = Number(registry.get("system.snapGridSize", 20)) || 20;
      x = Math.round(x / grid) * grid;
      y = Math.round(y / grid) * grid;
    }
    win.style.left = x + "px";
    win.style.top = y + "px";
    newZIndex++;
    win.style.zIndex = newZIndex;
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
}

function renderTaskbar() {
  const list = document.getElementById("appsList");
  list.innerHTML = "";

  for (const app of taskbar) {
    const button = document.createElement("button");
    button.className = "taskbar-app-btn";
    button.dataset.app = app.id;
    button.title = app.title;
    button.setAttribute("aria-label", app.title);
    button.innerHTML = buildAppIconMarkup(
      app.id,
      getAppEntry(app.id),
      "taskbar-app-icon",
    );

    button.addEventListener("click", () => {
      restoreWindow(app.id);
      renderTaskbar();
    });
    list.append(button);
  }
}

document.getElementById("startMenu").addEventListener("click", () => {
  const interface = document.getElementById("startMenuInterface");
  interface.classList.toggle("hidden");
});

function setBatteryDisplay(level, charging) {
  const el = document.getElementById("batteryPercent");
  const fill = document.getElementById("batteryFill");
  if (!el || !fill) return;

  el.classList.remove("color-red", "color-yellow", "color-green");

  if (charging) {
    el.classList.add("color-green");
    fill.style.backgroundColor = "#08ff08";
  } else if (level <= 0.1) {
    el.classList.add("color-red");
    fill.style.backgroundColor = "#ff382a";
  } else if (level <= 0.25) {
    el.classList.add("color-yellow");
    fill.style.backgroundColor = "#fffb08";
  } else {
    fill.style.backgroundColor = "#08ff08";
  }

  const percent = Math.round(level * 100);
  fill.style.width = percent + "%";
  el.textContent = charging ? `${percent}% ⚡` : `${percent}%`;
}

let simulatedLevel = 0.84;
let simulatedCharging = false;
let batteryApiBound = false;

function updateSimulatedBattery() {
  if (Math.random() > 0.94) {
    simulatedCharging = !simulatedCharging;
  }
  if (simulatedCharging) {
    simulatedLevel = Math.min(1, simulatedLevel + 0.015);
  } else {
    simulatedLevel = Math.max(0.08, simulatedLevel - 0.003);
  }
  setBatteryDisplay(simulatedLevel, simulatedCharging);
}

function bindBatteryEvents(battery) {
  if (batteryApiBound) return;
  batteryApiBound = true;
  battery.addEventListener("levelchange", () => {
    setBatteryDisplay(battery.level, battery.charging);
  });
  battery.addEventListener("chargingchange", () => {
    setBatteryDisplay(battery.level, battery.charging);
  });
}

function updateBattery() {
  if (typeof navigator.getBattery !== "function") {
    updateSimulatedBattery();
    return;
  }

  navigator
    .getBattery()
    .then((battery) => {
      bindBatteryEvents(battery);
      setBatteryDisplay(battery.level, battery.charging);
    })
    .catch(() => {
      updateSimulatedBattery();
    });
}

setInterval(updateBattery, 10000);

const defaultDesktopAppIcons = {
  calculator: { icon: "fa-solid fa-calculator", color: "#ff9500" },
  textedit: { icon: "fa-solid fa-file-lines", color: "#5d85ff" },
  filesearch: { icon: "fa-solid fa-folder-open", color: "#ffc73b" },
  appcreator: { icon: "fa-solid fa-plus", color: "#6843ff" },
  registryedit: { icon: "fa-solid fa-sliders", color: "#af52de" },
  terminal: { icon: "fa-solid fa-terminal", color: "#30d158" },
  karionet: { icon: "fa-solid fa-globe", color: "#2db9ff" },
  lunaview: { icon: "fa-solid fa-play", color: "#ff0000" },
};

function getDesktopAppPresentation(key, node) {
  if (node.type === "webapp" && node.icon) {
    return { kind: "image", src: node.icon };
  }

  const defaults = defaultDesktopAppIcons[key] ?? {
    icon:
      node.type === "webapp"
        ? "fa-solid fa-window-maximize"
        : "fa-solid fa-cube",
    color: "#2db9ff",
  };

  return {
    kind: "fa",
    icon: node.iconFa || defaults.icon,
    color: node.iconColor || defaults.color,
  };
}

function buildAppIconMarkup(key, node, iconClass = "desktop-app-icon") {
  const presentation = getDesktopAppPresentation(key, node);

  if (presentation.kind === "image") {
    return `<span class="${iconClass}"><img src="${presentation.src}" alt="" /></span>`;
  }

  return `<span class="${iconClass}" style="color:${presentation.color}"><i class="${presentation.icon}" aria-hidden="true"></i></span>`;
}

function buildDesktopAppIconMarkup(key, node) {
  return buildAppIconMarkup(key, node, "desktop-app-icon");
}

function getAppEntry(appId) {
  return homeChildren()[appId] ?? { type: "file", format: "kaizex" };
}

function openApp(appName) {
  if (restoreWindow(appName)) return;
  const app = homeChildren()[appName];
  if (!app) return;
  openFile(appName, app);
}

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", async () => {
    const action = button.dataset.action;
    if (action === "export") {
      document.getElementById("exportBtn")?.click();
    }

    switch (action) {
      case "about":
        let content = createWindow("about", "About magellanic", {
          closable: true,
          width: 720,
          height: 400
        });
        content.innerHTML = `
          <h1>magellanic</h1>
          <div class="info-box">
            ${isOfficialHash()}
            <b>Hash: ${hash}</b>
          </div>
          <p>A lightweight operating system simulation built for the web.</p>
          <p>Run apps, browse files, write scripts, and customize your own virtual computer.</p>
          <p>Version ${osVersion}</p>
          <p>Copyright (c) 2026 sorabora</p>
          `;
        return;
      case "settings":
        openApp("registryedit");
        return;
      case "open-file":
        openApp("filesearch");
        return;
    }

    closeTopbarMenus();
  });
});

function updateTopbarClock() {
  const el = document.getElementById("topbarClock");
  if (!el) return;
  el.textContent = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
setInterval(updateTopbarClock, 1000);
updateTopbarClock();

function init() {
  installDomGuard();
  loadAppStylesheets();
  renderDesktopApps();
  updateBattery();
}

init();

document.querySelectorAll("[data-menu]").forEach((button) => {
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const menuName = button.dataset.menu;
    const menu = document.getElementById("menu-" + menuName);
    const alreadyOpen = menu.classList.contains("open");
    closeTopbarMenus();

    if (!alreadyOpen) {
      button.classList.add("active");
      menu.classList.add("open");
    }
  });
});

document.addEventListener("click", closeTopbarMenus);

function closeTopbarMenus() {
  document.querySelectorAll(".dropdown.open").forEach((menu) => {
    menu.classList.remove("open");
  });

  document.querySelectorAll(".topbar-item.active").forEach((button) => {
    button.classList.remove("active");
  });
}

window.fs = {
  pickResolve: null,
  browserContent: null,
  currentDir: disk,
  currentPath: [],
  history: [],
  showHidden: false,

  toggleHidden() {
    this.showHidden = !this.showHidden;
    if (this.browserContent && this.currentDir) {
      this.renderDir(this.currentDir);
    }
  },

  resolvePath(path) {
    const parts = path.replace(/^\//, "").split("/").filter(Boolean);
    if (!parts.length) {
      return { item: disk, name: "", parent: null, parts: [], path: "/" };
    }

    let current = disk;
    let parent = null;
    let name = "";

    for (const part of parts) {
      const children = current.children || current;
      if (!children[part]) return null;
      parent = current;
      name = part;
      current = children[part];
    }

    return {
      item: current,
      name,
      parent,
      parts,
      path: "/" + parts.join("/"),
    };
  },

  parsePermissions(perms) {
    if (!perms || perms.length < 9) {
      return { owner: "rwx", group: "r-x", other: "r-x" };
    }
    return {
      owner: perms.slice(0, 3),
      group: perms.slice(3, 6),
      other: perms.slice(6, 9),
    };
  },

  hasPerm(bits, op) {
    const index = op === "read" ? 0 : op === "write" ? 1 : 2;
    return bits[index] !== "-";
  },

  checkAccessRule(rule, context, path) {
    if (!rule) return false;
    if (rule === "*") return true;
    if (rule === "prompted") return true;
    if (rule === "$user/.*") {
      const home = "/" + context.user;
      return path === home || path.startsWith(home + "/");
    }
    return false;
  },

  canAccess(path, op, context = {}) {
    if (context.elevated || context.admin) return true;

    const resolved = this.resolvePath(path);
    if (!resolved) return false;

    const { item, parent } = resolved;

    if (
      (item.protected || parent?.protected) &&
      (op === "write" || op === "delete") &&
      !context.elevated &&
      !context.admin
    ) {
      return false;
    }

    const accessKey =
      op === "read" ? "read" : op === "write" ? "write" : "delete";

    if (item.access?.[accessKey]) {
      return this.checkAccessRule(item.access[accessKey], context, path);
    }

    const perms = this.parsePermissions(
      item.permissions || parent?.permissions || "rwxr-xr-x",
    );
    const bits = item.owner === context.user ? perms.owner : perms.other;
    const permOp = op === "read" ? "read" : op === "write" ? "write" : "delete";

    if (op === "delete") {
      return this.hasPerm(bits, "write");
    }

    return this.hasPerm(bits, permOp);
  },

  pathIsUnderProtected(path) {
    const parts = path.replace(/^\//, "").split("/").filter(Boolean);
    let current = disk;
    if (current.protected) return true;
    for (const part of parts) {
      const children = current.children || current;
      current = children[part];
      if (!current) break;
      if (current.protected) return true;
    }
    return false;
  },

  isSpecialItem(item) {
    if (registry.get("system.bypassProtections")) {
      return false;
    }
    return Boolean(item?.special);
  },

  isFolderItem(item) {
    return Boolean(item?.children);
  },

  joinPath(base, name) {
    return base === "/" ? `/${name}` : `${base}/${name}`;
  },

  removeEntryFromParent(resolved) {
    if (resolved.parent?.children) {
      delete resolved.parent.children[resolved.name];
    } else if (resolved.parts.length === 1) {
      delete disk[resolved.name];
    }
  },

  deleteDirectoryContents(folder, folderPath, context, skipped, deleted) {
    const children = folder.children;
    if (!children) return;

    for (const name of Object.keys(children)) {
      const child = children[name];
      const childPath = this.joinPath(folderPath, name);

      if (this.isSpecialItem(child)) {
        skipped.push(childPath);
        continue;
      }

      if (!this.canAccess(childPath, "delete", context)) {
        skipped.push(childPath);
        continue;
      }

      if (this.isFolderItem(child)) {
        this.deleteDirectoryContents(
          child,
          childPath,
          context,
          skipped,
          deleted,
        );
        if (Object.keys(child.children || {}).length === 0) {
          delete children[name];
          deleted.push(childPath);
        }
      } else {
        delete children[name];
        deleted.push(childPath);
      }
    }
  },

  removePath(path, context = {}) {
    if (registry.get("system.readOnlyFilesystem")) {
      return { ok: false, error: "Filesystem is read-only" };
    }
    if (path === "/" || path === "") {
      return { ok: false, error: "Cannot delete root" };
    }

    const resolved = this.resolvePath(path);
    if (!resolved) {
      return { ok: false, error: "Not found" };
    }

    if (this.isSpecialItem(resolved.item)) {
      return { ok: false, error: "Cannot delete special system file" };
    }

    if (!this.canAccess(path, "delete", context)) {
      return { ok: false, error: "Permission denied" };
    }

    const skipped = [];
    const deleted = [];
    const targetPath = resolved.path || path;

    if (this.isFolderItem(resolved.item)) {
      this.deleteDirectoryContents(
        resolved.item,
        targetPath,
        context,
        skipped,
        deleted,
      );
      if (Object.keys(resolved.item.children || {}).length === 0) {
        this.removeEntryFromParent(resolved);
        deleted.push(targetPath);
      }
    } else {
      this.removeEntryFromParent(resolved);
      deleted.push(targetPath);
    }

    if (resolved.parts[0] === username) {
      renderDesktopApps();
    }

    const result = { ok: true, deleted, skipped };
    if (skipped.length) {
      result.warning = `Some files could not be deleted: ${skipped.join(", ")}`;
    }
    return result;
  },

  async deleteFile(path, context = {}) {
    if (path === "/" || path === "") {
      return { ok: false, error: "Cannot delete root" };
    }

    const resolved = this.resolvePath(path);
    if (!resolved) {
      return { ok: false, error: "Not found" };
    }

    if (this.isSpecialItem(resolved.item)) {
      return { ok: false, error: "Cannot delete special system file" };
    }

    if (!this.canAccess(path, "delete", context)) {
      return { ok: false, error: "Permission denied" };
    }

    const needsConfirm =
      resolved.item.protected ||
      resolved.parent?.protected ||
      this.pathIsUnderProtected(path);

    if (needsConfirm) {
      const choice = await showConfirmation({
        title: "Delete protected item?",
        message: `Delete ${path}? This is in a protected location and cannot be undone.`,
        buttons: [
          { id: "cancel", label: "Cancel" },
          { id: "delete", label: "Delete", primary: true, danger: true },
        ],
      });
      if (choice !== "delete") {
        return { ok: false, error: "Cancelled" };
      }
    }

    return this.removePath(path, context);
  },

  encodeFileContent(item, text) {
    const ftypes = this.loadFtypes();
    const handler = ftypes[item.format] || ftypes.default || "default";

    if (handler === "decodebase64") {
      return btoa(text);
    }
    return text;
  },

  writeFile(path, textContent, context = {}) {
    if (!this.canAccess(path, "write", context)) {
      return { ok: false, error: "Permission denied" };
    }

    const resolved = this.resolvePath(path);
    if (!resolved) {
      return { ok: false, error: "Not found" };
    }

    const { item } = resolved;
    if (item.children) {
      return { ok: false, error: "Is a directory" };
    }

    if (
      !context.elevated &&
      !context.admin &&
      item.access?.write === "prompted"
    ) {
      if (!confirm(`Allow saving to ${path}?`)) {
        return { ok: false, error: "Write denied" };
      }
    }

    if (item.protected && !context.elevated && !context.admin) {
      return { ok: false, error: "Permission denied" };
    }

    item.data = this.encodeFileContent(item, textContent);
    return { ok: true };
  },

  readFile(path, context = {}) {
    if (!this.canAccess(path, "read", context)) {
      return { ok: false, error: "Permission denied" };
    }

    const resolved = this.resolvePath(path);
    if (!resolved || resolved.item.children) {
      return { ok: false, error: "Not found" };
    }

    return {
      ok: true,
      content: this.readFileContent(resolved.item, resolved.name),
      item: resolved.item,
    };
  },

  parseFtypes(text) {
    const map = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (trimmed.startsWith("open:")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key) map[key] = value;
    }
    return map;
  },

  loadFtypes() {
    const file = disk.system?.children?.[".ftypes"];
    if (!file?.data) return {};
    return this.parseFtypes(file.data);
  },

  loadFtypeOpeners() {
    const file = disk.system?.children?.[".ftypes"];
    const openers = { default: "textedit" };
    if (!file?.data) return openers;
    for (const line of file.data.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (!trimmed.startsWith("open:")) continue;
      const rest = trimmed.slice(5);
      const eq = rest.indexOf("=");
      if (eq === -1) continue;
      const key = rest.slice(0, eq).trim();
      const value = rest.slice(eq + 1).trim();
      if (key) openers[key] = value;
    }
    return openers;
  },

  readFileContent(item, name = "file") {
    if (!item?.data) return `[${name}]`;

    const ftypes = this.loadFtypes();
    const handler = ftypes[item.format] || ftypes.default || "default";

    switch (handler) {
      case "decodebase64":
        try {
          return atob(item.data);
        } catch {
          return item.data;
        }
      case "url":
        return item.data;
      case "default":
      default:
        return item.data;
    }
  },

  renderDir(dir) {
    this.currentDir = dir;
    const content = this.browserContent;
    if (!content) return;

    const entries = dir.children || dir;

    content.innerHTML = `
      <button id="goUp" class="auto mb">
        ..
      </button>
    `;

    content.innerHTML += Object.keys(entries)
      .filter((key) => this.showHidden || !key.startsWith("."))
      .map((key) => {
        const item = entries[key];
        let iconHtml = `<i class="fa-solid fa-file"></i>`;
        if (item.children) {
          iconHtml = `<i style="color: #ffc73b" class="fa-solid fa-folder"></i>`;
        } else if (item.format === "skaizex") {
          iconHtml = `<i style="color: #b3b3b3" class="fa-solid fa-gear"></i>`;
        } else if (item.format === "kaizex") {
          iconHtml = `
            <span class="fa-stack">
              <i style="color: #4275ff" class="fa-solid fa-folder fa-stack-2x"></i>
              <i class="fa-solid fa-terminal fa-stack-1x fa-inverse"></i>
            </span>
          `;
        } else if (item.format === "js" || item.format === "pjs") {
          iconHtml = `<i style="color: gold" class="fa-brands fa-js"></i>`;
        }

        return `
          <button class="dark row-list" data-name="${key}">
            ${iconHtml}
            ${key}
          </button>
        `;
      })
      .join("");

    const browserCtx = { admin: true, user: username, elevated: true };

    content.querySelectorAll("[data-name]").forEach((button) => {
      button.addEventListener("click", () => {
        const name = button.dataset.name;
        const item = entries[name];
        if (item.children) {
          this.history.push(this.currentDir);
          this.currentPath.push(name);
          this.renderDir(item);
          return;
        }
        if (this.pickResolve) {
          const resolve = this.pickResolve;
          this.pickResolve = null;
          const path = "/" + [...this.currentPath, name].join("/");
          resolve({ name, item, path });
          return;
        }

        openFile(name, item, {
          path: "/" + [...this.currentPath, name].join("/"),
        });
      });

      button.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const name = button.dataset.name;
        const path = "/" + [...this.currentPath, name].join("/");

        openContextMenu(
          [
            {
              id: "delete",
              label: "Delete",
              danger: true,
              action: async () => {
                const result = await this.deleteFile(path, browserCtx);
                if (!result.ok && result.error !== "Cancelled") {
                  alert(result.error);
                }
                if (result.ok) {
                  if (result.warning) {
                    alert(result.warning);
                  }
                  this.renderDir(this.currentDir);
                }
              },
            },
          ],
          e.clientX,
          e.clientY,
        );
      });
    });

    const upBtn = content.querySelector("#goUp");
    if (upBtn) {
      upBtn.addEventListener("click", () => {
        const previous = this.history.pop();
        if (!previous) return;
        this.currentPath.pop();
        this.renderDir(previous);
      });
    }
  },

  openBrowserWindow() {
    this.browserContent = createWindow("filesearch", "File Search", {
      closable: true,
      minimizable: true,
      resizable: true,
    });
    this.currentDir = disk;
    this.currentPath = [];
    this.history = [];
    this.renderDir(disk);
  },

  openBrowser() {
    this.pickResolve = null;
    this.openBrowserWindow();
  },

  pickFile() {
    return new Promise((resolve) => {
      this.pickResolve = resolve;
      this.openBrowserWindow();
    });
  },
};

document.addEventListener("keydown", (e) => {
  if (!window.fs.browserContent) return;
  if (e.shiftKey && e.code === "Period") {
    e.preventDefault();
    window.fs.toggleHidden();
  }
});

function persistIconOrder(orderedKeys) {
  registry.set("desktop.iconOrder", orderedKeys);
}

function getPersistedIconOrder() {
  return registry.get("desktop.iconOrder") || null;
}

function orderEntries(entries) {
  const saved = getPersistedIconOrder();
  if (!saved) return entries;

  const byKey = new Map(entries);
  const ordered = [];

  for (const key of saved) {
    if (byKey.has(key)) {
      ordered.push([key, byKey.get(key)]);
      byKey.delete(key);
    }
  }
  for (const [key, node] of byKey) {
    ordered.push([key, node]);
  }
  return ordered;
}

function makeIconsDraggable() {
  const appsList = document.getElementById("apps-list");
  if (!appsList) return;

  const tiles = Array.from(appsList.querySelectorAll(".desktop-app-tile"));

  for (const tile of tiles) {
    tile.addEventListener("pointerdown", onIconPointerDown);
  }

  function onIconPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;

    const tile = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let placeholder = null;

    function onMove(moveEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (!dragging) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        dragging = true;
        tile.setPointerCapture(e.pointerId);
        tile.classList.add("dragging");
        tile.style.position = "relative";
        tile.style.zIndex = "1000";
        tile.style.pointerEvents = "none";

        placeholder = document.createElement("div");
        placeholder.className = "desktop-app-tile-placeholder";
        const rect = tile.getBoundingClientRect();
        placeholder.style.width = `${rect.width}px`;
        placeholder.style.height = `${rect.height}px`;
        tile.parentNode.insertBefore(placeholder, tile.nextSibling);
      }

      tile.style.transform = `translate(${dx}px, ${dy}px)`;

      const list = document.getElementById("apps-list");
      const others = Array.from(
        list.querySelectorAll(".desktop-app-tile:not(.dragging)"),
      );

      const hovered = others.find((other) => {
        const r = other.getBoundingClientRect();
        return (
          moveEvent.clientX >= r.left &&
          moveEvent.clientX <= r.right &&
          moveEvent.clientY >= r.top &&
          moveEvent.clientY <= r.bottom
        );
      });

      if (hovered && placeholder) {
        const hoveredRect = hovered.getBoundingClientRect();
        const placeholderRect = placeholder.getBoundingClientRect();
        const insertAfter =
          placeholderRect.top > hoveredRect.top ? hovered : hovered.nextSibling;
        list.insertBefore(placeholder, insertAfter || null);
      }
    }

    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);

      if (!dragging) return;

      tile.style.transform = "";
      tile.style.position = "";
      tile.style.zIndex = "";
      tile.style.pointerEvents = "";
      tile.classList.remove("dragging");

      if (placeholder) {
        placeholder.replaceWith(tile);
      }

      const list = document.getElementById("apps-list");
      const newOrder = Array.from(
        list.querySelectorAll(".desktop-app-tile"),
      ).map((el) => el.dataset.app);

      persistIconOrder(newOrder);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }
}

function renderDesktopApps() {
  const appsList = document.getElementById("apps-list");
  const rawEntries = Object.entries(homeChildren()).filter(([key, node]) =>
    isLaunchableEntry(key, node),
  );
  const entries = orderEntries(rawEntries);

  appsList.innerHTML = entries
    .map(([key, node]) => {
      const label = node.label ?? key;
      return `
        <button class="desktop-app-tile" data-app="${key}" type="button">
          ${buildDesktopAppIconMarkup(key, node)}
          <span class="desktop-app-label">${label}</span>
        </button>
      `;
    })
    .join("");

  appsList.querySelectorAll("[data-app]").forEach((button) => {
    button.addEventListener("click", () => {
      const appName = button.dataset.app;
      if (restoreWindow(appName)) {
        return;
      }
      const app = homeChildren()[appName];
      openFile(appName, app);
    });
  });

  makeIconsDraggable();
}

///

/*const appstore = createWindow("appstore", "Appstore", {
  closable: true,
  minimizable: true,
  resizable: true,
  width: 864,
  height: 520
});

appstore.innerHTML = `
<div class="tabs" id="tabs">
    <button class="tab active">Browse</button>
    <button class="tab">Installed</button>
    <button class="tab">Updates</button>
</div>
`
let buffer = "";
let loginData = {};
document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        document.activeElement?.isContentEditable
    ) {
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key.length === 1) {
        buffer += e.key;
        buffer = buffer.slice(-20);

        if (buffer.endsWith("$admin")) {
            buffer = "";
            openAdminLogin();
        }
    }
});

async function updateTabsForLogin() {
  appstore.getElementById("tabs").innerHTML += `<button class="tab">${loginData.role}: ${loginData.username}</button>`
}

async function openAdminLogin() {
  const choice = await showConfirmation({
    title: "Login for developers",
    message: "Login to edit your apps, manage your apps, and publish apps onto the app store.",
    buttons: [
      { id: "cancel", label: "Cancel" },
      { id: "submit", label: "Submit" },
    ],
    inputs: [
      {
        id: "appstoreDevLoginUsername",
        label: "Username",
        type: "text"
      },
      {
        id: "appstoreDevLoginPassword",
        label: "Password",
        type: "password"
      }
    ]
  });

  if (choice.button == "submit") {
    const res = await fetch("https://2suodc4ftlmjloqssr6cn5fxym0xyoxp.lambda-url.us-east-1.on.aws/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: choice.values.appstoreDevLoginUsername,
        password: choice.values.appstoreDevLoginPassword
      })
    });

    const data = await res.json();

    if (data.ok) {
      loginData = data;
      await showConfirmation({
        title: `Logged into ${data.username}, role: ${data.role}.`,
        buttons: [
          { id: "ok", label: "Ok" },
        ],
      })
      updateTabsForLogin();
    } else {
      await showConfirmation({
        title: "Invalid username or password.",
        buttons: [
          { id: "ok", label: "Ok" },
        ],
      })
    }
  }

  console.log(choice);
}*/

///