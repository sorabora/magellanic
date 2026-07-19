const content = createWindow("terminal", "Terminal", {
  closable: true,
  minimizable: true,
  resizable: true,
});

content.innerHTML = `
  <div class="terminal-output"></div>
  <form class="terminal-form">
    <span class="terminal-prefix">
      ${username}@magellanic $
    </span>
    <input
      class="terminal-input"
      type="text"
      autofocus
    >
  </form>
`;

const output = content.querySelector(".terminal-output");
const form = content.querySelector(".terminal-form");
const input = content.querySelector(".terminal-input");

function print(text) {
  output.insertAdjacentHTML("beforeend", "<div></div>");
  const line = output.lastElementChild;
  line.textContent = text;
  output.scrollTop = output.scrollHeight;
}

const shell = {
  print,
  output,
  disk,
  username,
  renderDesktopApps,
  openFile,
  createWindow,
  fs,
  runSandboxed,
  registry: window.registry,
};

function loadCommands() {
  const kcm = disk.system?.children?.kcm?.children;
  if (!kcm) return {};

  const commands = {};
  for (const [name, file] of Object.entries(kcm)) {
    if (!file.data || file.format !== "pjs") continue;
    const cmdName = name.endsWith(".pjs") ? name.slice(0, -4) : name;
    try {
      commands[cmdName] = new Function(
        "args",
        "flags",
        "ctx",
        "shell",
        atob(file.data),
      );
    } catch (err) {
      console.error(`failed to load command: ${name}`, err);
    }
  }
  return commands;
}

function splitCommandChain(input) {
  const parts = [];
  let current = "";
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === "&" && input[i + 1] === "&") {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = "";
      i += 1;
      continue;
    }
    current += input[i];
  }
  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}

function runSingleCommand(raw) {
  let elevated = false;
  let cmd = raw;

  while (cmd.startsWith("sudo ")) {
    elevated = true;
    cmd = cmd.slice(5).trim();
  }

  if (!cmd) {
    print("unknown command: ");
    return false;
  }

  const parts = cmd.split(" ");
  const name = parts[0];
  const args = parts.filter((p) => !p.startsWith("-")).slice(1);
  const flags = parts.filter((p) => p.startsWith("-"));
  const commands = loadCommands();
  const command = commands[name];
  const ctx = {
    elevated,
    admin: elevated,
    user: username,
  };

  if (!command) {
    print(`unknown command: ${name}`);
    return false;
  }

  const result = command(args, flags, ctx, shell);
  return result !== false;
}

function runCommand(raw) {
  const segments = splitCommandChain(raw);
  for (const segment of segments) {
    if (!runSingleCommand(segment)) {
      return false;
    }
  }
  return true;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const cmd = input.value.trim();
  print(`${username}@magellanic $ ${cmd}`);
  runCommand(cmd);
  input.value = "";
});
