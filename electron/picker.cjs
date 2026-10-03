"use strict";
// Moon Explorer as an Open/Save file dialog. When the app is launched with one of the picker flags
// it shows the explorer with a Moon-styled picker bar, and writes the chosen path back to the caller.
// See docs/picker.md. This is Moon Explorer's own dialog; it does not replace the Windows dialog that
// other programs show.
//
//   "Moon Explorer.exe" --save-dialog --name "notes.txt" --filter "Text:txt,md" --result out.txt
//   "Moon Explorer.exe" --open-dialog --filter "Images:png,jpg" --result out.txt
//   "Moon Explorer.exe" --pick-folder --result out.txt
//
// The chosen path is written to the --result file (and printed to stdout). On cancel the file is left
// empty and the exit code is 1; on a choice the exit code is 0.

const fs = require("fs");

const MODES = { "--save-dialog": "save", "--open-dialog": "open", "--pick-folder": "folder" };

/** `"Label:ext1,ext2"` → `{ label, extensions }`. `*` means every file. */
function parseFilter(raw) {
  const sep = String(raw).indexOf(":");
  const label = sep >= 0 ? raw.slice(0, sep) : raw;
  const exts = (sep >= 0 ? raw.slice(sep + 1) : "")
    .split(",")
    .map((e) =>
      e
        .trim()
        .replace(/^[.*]+/, "")
        .toLowerCase(),
    )
    .filter(Boolean);
  return { label: label.trim() || "Files", extensions: exts.length ? exts : ["*"] };
}

/**
 * Reads the picker flags out of a command line. Returns null for a normal launch.
 * @returns {{mode:'save'|'open'|'folder', title:string, suggestedName:string, startDir:string|null,
 *   filters:{label:string,extensions:string[]}[], resultPath:string|null} | null}
 */
function parsePicker(args) {
  let mode = null;
  let title = "";
  let suggestedName = "";
  let startDir = null;
  let resultPath = null;
  const filters = [];
  for (let i = 0; i < (args || []).length; i++) {
    const a = args[i];
    if (MODES[a]) mode = MODES[a];
    else if (a === "--name") suggestedName = args[++i] || "";
    else if (a === "--picker-title") title = args[++i] || "";
    else if (a === "--start-dir") startDir = args[++i] || null;
    else if (a === "--filter") filters.push(parseFilter(args[++i] || ""));
    else if (a === "--result") resultPath = args[++i] || null;
  }
  if (!mode) return null;
  if (!title) title = mode === "save" ? "Save As" : mode === "open" ? "Open" : "Select Folder";
  return { mode, title, suggestedName, startDir, filters, resultPath };
}

/** Same slice rule as start.cjs: the app folder precedes the flags in development. */
function fromArgv(app, argv) {
  return parsePicker(argv.slice(app.isPackaged ? 1 : 2));
}

/**
 * Hands the result back to the caller and ends the process. `chosen` is the path, or null on cancel.
 * Never throws; a result file that can't be written is reported on stderr but still exits.
 */
function deliver(app, picker, chosen) {
  const text = typeof chosen === "string" ? chosen : "";
  if (picker && picker.resultPath) {
    try {
      fs.writeFileSync(picker.resultPath, text, "utf8");
    } catch (e) {
      process.stderr.write(`Could not write the result: ${e.message}\n`);
    }
  }
  if (text) process.stdout.write(`${text}\n`);
  app.exit(chosen == null ? 1 : 0);
}

module.exports = { parsePicker, fromArgv, deliver, MODES };
