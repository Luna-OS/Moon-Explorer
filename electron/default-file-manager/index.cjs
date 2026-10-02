"use strict";
// Moon Explorer as the default file manager: the glue for the Electron main process (electron/main.cjs).
// See docs/default-file-manager.md.

const fs = require("fs");
const { createDefaultFileManager } = require("./manager.cjs");
const { PowerShellRegistry } = require("./registry.cjs");
const { parseCliAction, runCliAction } = require("./cli.cjs");

/** What status() reports outside Windows, where there is no registry to change. */
const UNSUPPORTED = { state: "unsupported", enabled: false, needsAttention: false, targets: [] };

const isWindows = () => process.platform === "win32";

/** Packaged: "Moon Explorer.exe" "%1". Development: "electron.exe" "<app folder>" "%1". */
function launchCommand(app) {
  return { exePath: process.execPath, launchArgs: app.isPackaged ? [] : [app.getAppPath()] };
}

let manager = null;
function managerFor(app) {
  if (!manager) {
    manager = createDefaultFileManager({
      registry: new PowerShellRegistry(),
      ...launchCommand(app),
      fileExists: (p) => fs.existsSync(p),
    });
  }
  return manager;
}

/**
 * Handles --set-default / --unset-default / --default-status (e.g. from an installer) and quits.
 * Returns true if a flag was found; the caller must then not start the UI.
 */
function handleCliFlags(app, argv = process.argv) {
  const action = parseCliAction(argv);
  if (!action) return false;
  if (!isWindows()) {
    console.error("Only available on Windows.");
    app.exit(2);
    return true;
  }
  void runCliAction(managerFor(app), action).then((code) => app.exit(code));
  return true;
}

/** The current state, for the settings switch. */
function status(app) {
  return isWindows() ? managerFor(app).status() : Promise.resolve(UNSUPPORTED);
}

/** Makes Moon Explorer the default file manager (or repairs the registration), or gives it back to Windows Explorer. */
function setEnabled(app, enabled) {
  if (!isWindows()) return Promise.resolve(UNSUPPORTED);
  return enabled ? managerFor(app).enable() : managerFor(app).disable();
}

/**
 * If Moon Explorer is registered but the registration points to another exe (moved / updated / deleted) or
 * another program took folders over, asks whether to register again or to give folders back to Windows Explorer.
 */
async function checkOnStartup(app, dialog, win) {
  if (!isWindows()) return null;
  const m = managerFor(app);
  let s;
  try {
    s = await m.status();
  } catch (err) {
    console.error("default-file-manager: status failed", err);
    return null;
  }
  if (!s.needsAttention) return s;
  const detail =
    s.state === "stale"
      ? `Registered:\n${s.registeredExe}${s.registeredExeExists ? "" : " (no longer exists)"}\n\nThis copy is here:\n${s.currentExe}`
      : "Another program has changed some of the entries since.";
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    title: "Moon Explorer",
    message:
      "Moon Explorer is set as the default file manager, but the registration is out of date.",
    detail,
    buttons: ["Register again", "Restore Windows Explorer", "Later"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (response === 0) return m.enable();
  if (response === 1) return m.disable();
  return s;
}

module.exports = { launchCommand, handleCliFlags, status, setEnabled, checkOnStartup, UNSUPPORTED };
