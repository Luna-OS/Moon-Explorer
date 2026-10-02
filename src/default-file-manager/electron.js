'use strict';
// Glue for the Electron main process. Usage in main.js:
//
//   const dfm = require('./default-file-manager/electron');
//   if (dfm.handleCliFlags(app)) return;           // --set-default / --unset-default / --default-status, before the single-instance lock
//   const start = dfm.startPathFromArgv(app, process.argv);   // { kind: 'folder', path } | { kind: 'home' } | …
//   app.whenReady().then(() => { dfm.registerIpc(app, ipcMain); dfm.checkOnStartup(app, dialog, win); });

const fs = require('fs');
const { spawn } = require('child_process');
const { createDefaultFileManager } = require('./manager');
const { PowerShellRegistry } = require('./registry');
const { resolveStartPath } = require('./start-path');
const { parseCliAction, runCliAction } = require('./cli');

/** Packaged: MoonExplorer.exe "%1". Development: electron.exe "<app folder>" "%1". */
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

/** Handles the installer flags and quits. Returns true if a flag was found (the caller should not start the UI). */
function handleCliFlags(app, argv = process.argv) {
  const action = parseCliAction(argv);
  if (!action) return false;
  if (process.platform !== 'win32') {
    console.error('Nur unter Windows verfügbar.');
    app.exit(2);
    return true;
  }
  runCliAction(managerFor(app), action).then((code) => app.exit(code));
  return true;
}

/** Start target from a command line (first launch or the argv of 'second-instance'). */
function startPathFromArgv(app, argv) {
  return resolveStartPath(argv.slice(app.isPackaged ? 1 : 2));
}

/** Shell items without a file path (`::{CLSID}`, `shell:…`) are opened by Windows Explorer. */
function openInWindowsExplorer(target) {
  spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
}

/** IPC for the settings toggle: 'default-fm:status', 'default-fm:set' (enabled: boolean). */
function registerIpc(app, ipcMain) {
  const unsupported = { state: 'unsupported', enabled: false, needsAttention: false, targets: [] };
  ipcMain.handle('default-fm:status', () => (process.platform === 'win32' ? managerFor(app).status() : unsupported));
  ipcMain.handle('default-fm:set', (_e, enabled) => {
    if (process.platform !== 'win32') return unsupported;
    return enabled ? managerFor(app).enable() : managerFor(app).disable();
  });
}

/**
 * If Moon Explorer is registered but the registration points to another exe (moved / updated / deleted) or
 * another program took folders over, ask whether to re-register or to give folders back to Windows Explorer.
 */
async function checkOnStartup(app, dialog, win) {
  if (process.platform !== 'win32') return null;
  const m = managerFor(app);
  let s;
  try {
    s = await m.status();
  } catch (err) {
    console.error('default-file-manager: status failed', err);
    return null;
  }
  if (!s.needsAttention) return s;
  const detail =
    s.state === 'stale'
      ? `Eingetragen ist:\n${s.registeredExe}${s.registeredExeExists ? '' : ' (nicht mehr vorhanden)'}\n\nDiese Kopie liegt hier:\n${s.currentExe}`
      : 'Ein Teil der Einträge wurde inzwischen von einem anderen Programm geändert.';
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Moon Explorer',
    message: 'Moon Explorer ist als Standard-Dateimanager eingetragen, aber die Registrierung ist nicht mehr aktuell.',
    detail,
    buttons: ['Neu registrieren', 'Windows Explorer wiederherstellen', 'Später'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (response === 0) return m.enable();
  if (response === 1) return m.disable();
  return s;
}

module.exports = {
  launchCommand,
  managerFor,
  handleCliFlags,
  startPathFromArgv,
  openInWindowsExplorer,
  registerIpc,
  checkOnStartup,
};
