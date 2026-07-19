const content = createWindow("textedit", "Text Edit", {
  closable: true,
  minimizable: true,
  resizable: true,
});

let openPath = null;

const ctx = () => ({
  user: metadata.user || username,
  elevated: metadata.elevated || false,
  admin: metadata.admin || false,
});

content.innerHTML = `
  <div class="flex-row mb">
    <button id="openFile" class="auto f-1">Open file</button>
    <button id="saveFile" class="f-1">Save</button>
  </div>
  <textarea id="texteditArea" style="width:100%;height:calc(100% - 48px);resize:none;"></textarea>
`;

const textarea = content.getElementById("texteditArea");

if (metadata.textEditPath) {
  openPath = metadata.textEditPath;
}
if (metadata.textEditContent != null) {
  textarea.value = metadata.textEditContent;
}

content.getElementById("openFile").addEventListener("click", async () => {
  const picked = await fs.pickFile();
  if (!picked) return;

  openPath = picked.path;
  textarea.value = fs.readFileContent(picked.item, picked.name);
});

content.getElementById("saveFile").addEventListener("click", () => {
  if (!openPath) {
    alert("No file open");
    return;
  }

  const result = fs.writeFile(openPath, textarea.value, ctx());

  if (!result.ok) {
    alert(result.error);
  }
});
