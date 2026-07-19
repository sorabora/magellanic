const content = createWindow("appcreator", "Create an App", {
  closable: true,
  minimizable: true,
  resizable: true,
});

content.innerHTML = `
    <h2>Create your custom app.</h2>
    <form id="createAppForm">
      <label for="createAppName">Name</label>
      <input type="text" id="createAppName" required><br><br>

      <label for="createAppIcon">Icon</label>
      <input type="file" id="createAppIcon" accept="image/*" required><br><br>

      <label for="createAppURL">URL</label>
      <input type="url" value="https://example.com/game" id="createAppURL" required><br><br>

      <button type="submit" id="createAppSubmit">Create</button>
    </form>
  `;

function readIconAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

content.getElementById("createAppForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const name = content.getElementById("createAppName").value.trim();
  const url = content.getElementById("createAppURL").value.trim();
  const iconFile = content.getElementById("createAppIcon").files[0];

  let iconUrl = null;
  if (iconFile) {
    try {
      iconUrl = await readIconAsDataUrl(iconFile);
    } catch {
      alert("Could not read icon file.");
      return;
    }
  }

  const result = createWebApp(name, { url, label: name, iconUrl });
  if (!result.ok) {
    alert(result.error);
    return;
  }

  form.reset();
  alert("App created!");
});
