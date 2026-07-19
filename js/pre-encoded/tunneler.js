const content = createWindow(
  "tunneler",
  "Loading...",
  {
    closable: false,
    minimizable: false,
    resizable: false,
  },
  metadata
);

console.log(metadata);
console.log(metadata.url);
content.innerHTML = `
    <iframe
      src="${metadata.url}"
      style="
        width:100%;
        height:100%;
        border:none;
      "
    ></iframe>
  `;
