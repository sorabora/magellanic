// The hive: the virtual registry store.
//
// Setting *definitions* live in hive.json (data only). This file loads them,
// holds the live registry state, and applies each setting's real effect to the
// running desktop. Behavioral settings (window limits, drag, filesystem) are
// read on demand by desktop.js; appearance settings are applied here.

const registryData = {
  user: {},
  system: {},
};

// Flat list of setting definitions, populated once hive.json loads.
let hiveSettings = [];

function readPath(obj, path) {
  const keys = path.split(".");
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function writePath(obj, path, value) {
  const keys = path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function applyDefaults() {
  for (const setting of hiveSettings) {
    if (readPath(registryData, setting.key) === undefined) {
      writePath(registryData, setting.key, setting.default);
    }
  }
}

// ---- Functional effects -------------------------------------------------
// Appearance settings map to classes / CSS variables on <body>. Toggling a
// setting in the Registry Editor calls registry.set(), which re-applies here.

function toggleClass(name, on) {
  if (document.body) document.body.classList.toggle(name, Boolean(on));
}

function applySystemSettings() {
  const body = document.body;
  if (!body) return;
  const root = document.documentElement;

  // Theme
  body.dataset.theme = registry.get("system.theme", "dark");

  // Accent color -> drives --primary used across core.css
  const accent = registry.get("system.accentColor", "");
  if (accent) root.style.setProperty("--primary", accent);
  else root.style.removeProperty("--primary");

  // Font scale -> scales rem-based type
  const scale = Number(registry.get("system.fontScale", 100)) || 100;
  root.style.fontSize = 16 * (scale / 100) + "px";

  // Wallpaper
  const wallpaper = registry.get("system.wallpaperUrl", "");
  if (wallpaper) root.style.setProperty("--wallpaper", `url("${wallpaper}")`);
  else root.style.removeProperty("--wallpaper");

  const dim = Number(registry.get("system.wallpaperDim", 0)) || 0;
  root.style.setProperty("--wallpaper-dim", Math.max(0, Math.min(90, dim)) / 100);

  // Class-driven effects
  toggleClass("no-animations", !registry.get("system.animations", true));
  toggleClass("reduce-motion", registry.get("system.reduceMotion", false));
  toggleClass("no-transparency", !registry.get("system.transparency", true));
  toggleClass("wallpaper-blur", registry.get("system.wallpaperBlur", false));
  toggleClass("no-wallpaper-zoom", registry.get("system.disableWallpaperZoom", false));
  toggleClass("fx-grayscale", registry.get("system.grayscale", false));
  toggleClass("fx-invert", registry.get("system.invertColors", false));
  toggleClass("fx-crt", registry.get("system.crtEffect", false));
  toggleClass("high-contrast", registry.get("system.highContrast", false));
  toggleClass("compact", registry.get("system.compactMode", false));
  toggleClass("hide-desktop-icons", registry.get("system.hideDesktopIcons", false));
  toggleClass("debug-mode", registry.get("system.debugMode", false));
}

const registry = {
  get(path, defaultValue) {
    const value = readPath(registryData, path);
    return value === undefined ? defaultValue : value;
  },

  set(path, value) {
    const previous = readPath(registryData, path);
    writePath(registryData, path, value);
    if (registry.get("system.verboseLogging")) {
      console.log(`[hive] ${path}:`, previous, "->", value);
    }
    applySystemSettings();
  },

  getData() {
    return structuredClone(registryData);
  },

  // Setting definitions, so the Registry Editor can render itself.
  getSettings() {
    return hiveSettings;
  },

  replaceAll(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Registry must be a JSON object");
    }
    registryData.user =
      data.user && typeof data.user === "object" ? data.user : {};
    registryData.system =
      data.system && typeof data.system === "object" ? data.system : {};
    applyDefaults();
    applySystemSettings();
  },
};

window.registry = registry;

// Load definitions from hive.json, seed defaults, and apply everything.
window.hiveReady = fetch("js/core/hive.json", { cache: "no-store" })
  .then((res) => res.json())
  .then((data) => {
    const groups = Array.isArray(data.groups) ? data.groups : [];
    hiveSettings = groups.flatMap((group) =>
      (group.settings || []).map((s) => ({ ...s, category: group.category })),
    );
    applyDefaults();
    applySystemSettings();
    document.dispatchEvent(new CustomEvent("hive-ready"));
  })
  .catch((err) => {
    console.error("[hive] failed to load hive.json", err);
  });
