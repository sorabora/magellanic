return {
  extension: "kaizex",
  open(file) {
    const decoded = atob(file.data);
    const meta = file.metadata || {};
    const admin = meta.admin || file.admin === true;

    if (file.admin === true && !meta.elevated) {
      const runtime = new Function(decoded);
      runtime();
      return;
    }

    if (admin && meta.elevated) {
      const runtime = new Function(
        "metadata",
        "username",
        "disk",
        "createWindow",
        "openFile",
        "fs",
        "renderDesktopApps",
        "runSandboxed",
        decoded
      );
      runtime(
        meta,
        username,
        disk,
        createWindow,
        openFile,
        fs,
        renderDesktopApps,
        runSandboxed
      );
      return;
    }

    runSandboxed(decoded, {
      currentUser: username,
      metadata: meta,
      disk,
      username,
      renderDesktopApps,
      createWebApp,
    });
  },
};
