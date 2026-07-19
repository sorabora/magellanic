async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}`);
  }

  return await response.arrayBuffer();
}

async function installVendorApps() {
  const home = disk[username]?.children;
  if (!home) return;

  for (const app of window.vendorSettings.download) {
    if (home[app.name]) {
      console.warn(`vendor: "${app.name}" is already installed`);
      continue;
    }

    const zip = await download(app.url);

    home[app.name] = {
      type: "file",
      owner: username,
      format: "zipapp",
      data: zip
    };

    console.log(`Installed ${app.name}`);
  }

  renderDesktopApps();
}

installVendorApps();