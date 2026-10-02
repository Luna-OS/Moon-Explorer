"use strict";
// What to open when Moon Explorer is started with an argument (a folder, a file, a drive or --this-pc).
// As the default file manager (electron/default-file-manager), this is how Windows hands over the
// folder, drive or This PC that was double-clicked.

const fs = require("fs");
const path = require("path");

const THIS_PC_ARG = "--this-pc";

function statKind(p) {
  try {
    return fs.statSync(p).isDirectory() ? "dir" : "file";
  } catch {
    return null;
  }
}

/** A drive root registered as "%1" arrives as `C:"`, because in `"C:\"` the backslash escapes the quote. */
function normalizeArg(raw) {
  let s = String(raw).trim();
  if (s.startsWith('"')) s = s.slice(1);
  if (s.endsWith('"')) s = s.slice(0, -1);
  if (/^[a-zA-Z]:$/.test(s)) s = `${s.toUpperCase()}\\`;
  return s;
}

/**
 * @returns {{kind: 'home'} | {kind: 'this-pc'} | {kind: 'folder', path: string}
 *   | {kind: 'file', path: string, folder: string} | {kind: 'shell', target: string} | {kind: 'missing', path: string}}
 */
function resolveStart(args, { stat = statKind, cwd = process.cwd() } = {}) {
  for (const raw of args || []) {
    if (raw === THIS_PC_ARG) return { kind: "this-pc" };
    const arg = normalizeArg(raw);
    // Electron and Chromium switches; a real path is never a flag.
    if (!arg || arg.startsWith("-")) continue;
    if (arg.startsWith("::") || /^shell:/i.test(arg)) return { kind: "shell", target: arg };
    const p = path.win32.resolve(cwd, arg);
    const type = stat(p);
    if (type === "dir") return { kind: "folder", path: p };
    if (type === "file") return { kind: "file", path: p, folder: path.win32.dirname(p) };
    return { kind: "missing", path: p };
  }
  return { kind: "home" };
}

/** The start target from a command line (the first launch, or the argv of 'second-instance'). */
function startFromArgv(app, argv) {
  return resolveStart(argv.slice(app.isPackaged ? 1 : 2));
}

module.exports = { startFromArgv, resolveStart, normalizeArg, THIS_PC_ARG };
