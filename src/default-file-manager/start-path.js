'use strict';
// What to show when Moon Explorer is started with a path, e.g. by Windows after a double-click on a folder.

const path = require('path');
const fs = require('fs');
const { THIS_PC_ARG } = require('./layout');

function defaultStat(p) {
  try {
    return fs.statSync(p).isDirectory() ? 'dir' : 'file';
  } catch {
    return null;
  }
}

/**
 * Clean up one argument as Windows hands it over.
 * A drive root registered as "%1" arrives as `C:"`: in `"C:\"` the backslash escapes the closing quote.
 */
function normalizeArg(raw) {
  let s = String(raw).trim();
  if (s.startsWith('"')) s = s.slice(1);
  if (s.endsWith('"')) s = s.slice(0, -1);
  if (/^[a-zA-Z]:$/.test(s)) s = `${s.toUpperCase()}\\`;
  return s;
}

/**
 * @param {string[]} args   arguments after the exe (and after the app folder in development)
 * @param {object} [opts]
 * @param {(p: string) => 'dir'|'file'|null} [opts.stat]
 * @param {string} [opts.cwd]   for relative paths given on a command line
 * @returns {{kind: 'home'} | {kind: 'this-pc'} | {kind: 'folder', path: string}
 *   | {kind: 'file', path: string, folder: string} | {kind: 'shell', target: string} | {kind: 'missing', path: string}}
 */
function resolveStartPath(args, { stat = defaultStat, cwd = process.cwd() } = {}) {
  for (const raw of args || []) {
    if (raw === THIS_PC_ARG) return { kind: 'this-pc' };
    const arg = normalizeArg(raw);
    // Our own flags and Chromium/Electron switches; a real path from Windows is always absolute.
    if (!arg || arg.startsWith('-')) continue;
    // Shell namespace items without a file system path (Recycle Bin, Control Panel, …): hand back to Explorer.
    if (arg.startsWith('::') || /^shell:/i.test(arg)) return { kind: 'shell', target: arg };
    const p = path.win32.resolve(cwd, arg);
    const type = stat(p);
    if (type === 'dir') return { kind: 'folder', path: p };
    if (type === 'file') return { kind: 'file', path: p, folder: path.win32.dirname(p) };
    return { kind: 'missing', path: p };
  }
  return { kind: 'home' };
}

module.exports = { resolveStartPath, normalizeArg };
