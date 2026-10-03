"use strict";
// The bridge between the UI and the main process. Its shape is the MoonBridge type in src/fs/types.ts.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res.ok) {
    const err = new Error(res.error);
    err.code = res.code;
    throw err;
  }
  return res.data;
}

const EVENTS = new Set([
  "task:update",
  "search:results",
  "search:done",
  "fs:changed",
  "open-request",
]);

/** moon-file://local/C:/Users/… – served by the main process (see registerFileProtocol). */
function fileUrl(p) {
  const parts = String(p)
    .replace(/\\/g, "/")
    .split("/")
    .map((s, i) => (i === 0 && /^[a-z]:$/i.test(s) ? s : encodeURIComponent(s)));
  return `moon-file://local/${parts.join("/")}`;
}

if (process.env.MOON_SHOT) {
  contextBridge.exposeInMainWorld("moonDev", {
    shot: (name) => ipcRenderer.invoke("dev:shot", name),
  });
}

contextBridge.exposeInMainWorld("moon", {
  kind: "electron",
  places: () => call("sys:places"),
  drives: () => call("sys:drives"),
  refreshDrives: () => call("sys:refreshDrives"),
  env: () => call("sys:env"),
  takeStart: () => call("sys:takeStart"),
  picker: () => call("sys:picker"),
  resolvePicker: (chosen) => call("picker:resolve", chosen),
  defaultFileManager: () => call("sys:defaultFileManager"),
  setDefaultFileManager: (enabled) => call("sys:setDefaultFileManager", enabled),

  list: (dir) => call("fs:list", dir),
  stat: (p) => call("fs:stat", p),
  exists: (p) => call("fs:exists", p),
  isDir: (p) => call("fs:isDir", p),
  subdirs: (dir) => call("fs:subdirs", dir),
  readText: (p, max) => call("fs:readText", p, max),
  thumbnail: (p, size) => call("fs:thumb", p, size),
  systemIcon: (p) => call("fs:icon", p),
  fileUrl,
  mkdir: (dir, name) => call("fs:mkdir", dir, name),
  createFile: (dir, name) => call("fs:createFile", dir, name),
  rename: (from, to) => call("fs:rename", from, to),
  conflicts: (sources, destDir) => call("fs:conflicts", sources, destDir),
  transfer: (opts) => call("fs:transfer", opts),
  remove: (opts) => call("fs:delete", opts),
  cancelTask: (id) => call("task:cancel", id),
  dirSize: (p) => call("fs:dirSize", p),
  checksums: (p) => call("fs:checksums", p),
  zip: (sources, dest) => call("fs:zip", sources, dest),
  unzip: (archive, dest) => call("fs:unzip", archive, dest),
  search: (opts) => call("search:start", opts),
  cancelSearch: (id) => call("search:cancel", id),
  watch: (paneId, dir) => call("fs:watch", paneId, dir),

  open: (p) => call("shell:open", p),
  openWith: (p) => call("shell:openWith", p),
  runAsAdmin: (p) => call("shell:runAsAdmin", p),
  reveal: (p) => call("shell:reveal", p),
  openInWindowsExplorer: (target) => call("shell:openInWindowsExplorer", target),
  resolveLink: (p) => call("shell:resolveLink", p),
  terminal: (dir) => call("shell:terminal", dir),
  properties: (p) => call("shell:properties", p),

  copyText: (t) => call("clip:writeText", t),
  copyFilesToSystem: (paths) => call("clip:writeFiles", paths),
  readSystemFiles: (knownFirst) => call("clip:readFiles", knownFirst),

  setTheme: (theme) => call("win:setTheme", theme),
  devtools: () => call("win:devtools"),
  startDrag: (paths) => ipcRenderer.send("drag:start", paths),
  pathForFile: (file) => webUtils.getPathForFile(file),

  on(channel, fn) {
    if (!EVENTS.has(channel)) throw new Error(`Unknown event ${channel}`);
    const listener = (_e, data) => fn(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
