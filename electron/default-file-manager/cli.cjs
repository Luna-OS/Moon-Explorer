"use strict";
// Command-line flags, e.g. for an installer:
//   "Moon Explorer.exe" --set-default      register as default file manager (exit 0 on success)
//   "Moon Explorer.exe" --unset-default    restore Windows Explorer
//   "Moon Explorer.exe" --default-status   print the state as JSON

const FLAGS = {
  "--set-default": "set",
  "--unset-default": "unset",
  "--default-status": "status",
};

function parseCliAction(argv) {
  for (const a of argv || []) if (FLAGS[a]) return FLAGS[a];
  return null;
}

/** Returns the process exit code. Never throws. */
async function runCliAction(manager, action, out = console) {
  try {
    if (action === "set") {
      const s = await manager.enable();
      out.log(`Moon Explorer is now the default file manager (${s.state}).`);
      return s.state === "on" ? 0 : 1;
    }
    if (action === "unset") {
      const s = await manager.disable();
      for (const k of s.skipped || [])
        out.log(
          `Left as is (changed by another program since): HKCU\\${k.key} [${k.name || "(Default)"}]`,
        );
      for (const k of s.keptKeys || [])
        out.log(`Kept (holds entries of other programs): HKCU\\${k}`);
      out.log("Windows Explorer is the default file manager again.");
      return s.state === "off" ? 0 : 1;
    }
    if (action === "status") {
      out.log(JSON.stringify(await manager.status(), null, 2));
      return 0;
    }
    out.error(`Unknown action: ${action}`);
    return 2;
  } catch (err) {
    out.error(`Error: ${err.message}`);
    return 1;
  }
}

module.exports = { parseCliAction, runCliAction, FLAGS };
