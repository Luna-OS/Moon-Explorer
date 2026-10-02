'use strict';
// Command-line flags, e.g. for an installer:
//   MoonExplorer.exe --set-default      register as default file manager (exit 0 on success)
//   MoonExplorer.exe --unset-default    restore Windows Explorer
//   MoonExplorer.exe --default-status   print the state as JSON

const FLAGS = {
  '--set-default': 'set',
  '--unset-default': 'unset',
  '--default-status': 'status',
};

function parseCliAction(argv) {
  for (const a of argv || []) if (FLAGS[a]) return FLAGS[a];
  return null;
}

/** Returns the process exit code. Never throws. */
async function runCliAction(manager, action, out = console) {
  try {
    if (action === 'set') {
      const s = await manager.enable();
      out.log(`Moon Explorer ist jetzt der Standard-Dateimanager (${s.state}).`);
      return s.state === 'on' ? 0 : 1;
    }
    if (action === 'unset') {
      const s = await manager.disable();
      for (const k of s.skipped || []) out.log(`Nicht zurückgesetzt, wurde inzwischen geändert: HKCU\\${k.key} [${k.name || '(Standard)'}]`);
      for (const k of s.keptKeys || []) out.log(`Schlüssel behalten, enthält fremde Einträge: HKCU\\${k}`);
      out.log('Windows Explorer ist wieder der Standard-Dateimanager.');
      return s.state === 'off' ? 0 : 1;
    }
    if (action === 'status') {
      out.log(JSON.stringify(await manager.status(), null, 2));
      return 0;
    }
    out.error(`Unbekannte Aktion: ${action}`);
    return 2;
  } catch (err) {
    out.error(`Fehler: ${err.message}`);
    return 1;
  }
}

module.exports = { parseCliAction, runCliAction, FLAGS };
