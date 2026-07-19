return {
  extension: "referencepng",

  async open(file) {
    const content = createWindow("referencepng", "Image Viewer", {
      closable: true,
      minimizable: true,
      resizable: true,
    });
    content.innerHTML = "<p>Loading image...</p>";

    try {
      const res = await fetch(file.data);
      if (!res.ok) {
        content.innerHTML = "<p>Failed to load image: " + res.status + "</p>";
        return;
      }
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) {
        content.innerHTML = "<p>Referenced URL did not return an image.</p>";
        return;
      }

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      content.innerHTML = "";
      const img = document.createElement("img");

      img.src = dataUrl;
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      content.appendChild(img);
    } catch (err) {
      content.innerHTML = "<p>Failed to load image.</p>";

      console.error(err);
    }
  },
};
