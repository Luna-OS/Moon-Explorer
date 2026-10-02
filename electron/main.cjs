"use strict";
// Moon Explorer – Electron main process: the window, file-system access and background tasks
// (copy / move / delete with progress, search, folder sizes, folder watching).

const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeImage,
  clipboard,
  Menu,
  protocol,
  net,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { pathToFileURL } = require("url");
const crypto = require("crypto");
const { execFile, spawn } = require("child_process");
const { startFromArgv } = require("./start.cjs");
const defaultFileManager = require("./default-file-manager/index.cjs");

const ROOT = path.join(__dirname, "..");
const BUILD = path.join(ROOT, "build");
// Windows' own bsdtar (System32) reads and writes ZIP; another tar on PATH (e.g. from Git) may not.
const TAR = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
const FILE_SCHEME = "moon-file";
const SKIP_DIRS = new Set([
  "$recycle.bin",
  "system volume information",
  "$windows.~bt",
  "$windows.~ws",
]);
const TEXT_EXT = new Set(
  (
    "txt md markdown log ini cfg conf toml yml yaml json jsonc xml csv tsv js mjs cjs ts tsx jsx " +
    "html htm css scss sass less py rb php java kt c h cpp hpp cc cs go rs swift lua sh bash zsh ps1 psm1 bat cmd " +
    "sql vue svelte astro gitignore gitattributes editorconfig env properties gradle dockerfile makefile srt vtt nfo reg"
  ).split(" "),
);
// Matches FRAME_COLORS in src/theme/frame-colors.ts.
const FRAME = {
  dark: { color: "#0b0920", symbolColor: "#f4f1ff" },
  light: { color: "#ece7f7", symbolColor: "#1c1733" },
};
const TITLE_BAR_HEIGHT = 40;

let win = null;
let pendingStart = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: FILE_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

// ---------------------------------------------------------------- helpers

/** Runs fn over items with at most `limit` promises in flight. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function execText(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, maxBuffer: 32 << 20, timeout: 15000, ...opts },
      (err, stdout, stderr) => {
        resolve({ err, stdout: stdout || "", stderr: stderr || "" });
      },
    );
  });
}

function powershell(script) {
  return execText("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);
}

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Names carrying the Windows "hidden" attribute (lower-cased). cmd /u writes UTF-16, so every file name survives. */
async function hiddenNames(dir) {
  if (process.platform !== "win32") return new Set();
  const { stdout } = await execText("cmd.exe", ["/d", "/u", "/s", "/c", `"dir /a:h /b "${dir}""`], {
    encoding: "utf16le",
    windowsVerbatimArguments: true,
    timeout: 8000,
  });
  return new Set(
    stdout
      .split(/\r?\n/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function toEntry(p, name, st, isLink = false) {
  const isDir = st ? st.isDirectory() : false;
  return {
    name,
    path: p,
    isDir,
    isLink,
    size: isDir ? null : st ? st.size : 0,
    mtime: st ? st.mtimeMs : 0,
    ctime: st ? st.birthtimeMs : 0,
    ext: isDir ? "" : path.extname(name).slice(1).toLowerCase(),
    hidden: false,
  };
}

async function entryFor(dir, dirent) {
  const p = path.join(dir, dirent.name);
  let st = null;
  try {
    st = await fsp.stat(p);
  } catch {
    try {
      st = await fsp.lstat(p);
    } catch {
      /* unreadable */
    }
  }
  const entry = toEntry(p, dirent.name, st, dirent.isSymbolicLink());
  if (!st) entry.isDir = dirent.isDirectory();
  return entry;
}

/** Breadth-first walk with a bounded number of parallel readdir calls. visit() may return false to skip a folder. */
async function walk(root, visit, token, parallel = 12) {
  const queue = [root];
  let active = 0;
  await new Promise((resolve) => {
    const pump = () => {
      if (token.cancelled && active === 0) {
        resolve();
        return;
      }
      while (!token.cancelled && active < parallel && queue.length) {
        const dir = queue.shift();
        active++;
        fsp
          .readdir(dir, { withFileTypes: true })
          .then(async (ents) => {
            for (const d of ents) {
              if (token.cancelled) break;
              const keep = await visit(dir, d);
              if (
                d.isDirectory() &&
                !d.isSymbolicLink() &&
                keep !== false &&
                !SKIP_DIRS.has(d.name.toLowerCase())
              ) {
                queue.push(path.join(dir, d.name));
              }
            }
          })
          .catch(() => {})
          .finally(() => {
            active--;
            if ((queue.length === 0 || token.cancelled) && active === 0) resolve();
            else pump();
          });
      }
      if (queue.length === 0 && active === 0) resolve();
    };
    pump();
  });
}

async function uniqueName(dir, name, isDir, style = "number") {
  const ext = isDir ? "" : path.extname(name);
  const base = isDir ? name : name.slice(0, name.length - ext.length);
  let candidate = name;
  for (let n = 2; fs.existsSync(path.join(dir, candidate)); n++) {
    if (style === "copy")
      candidate = n === 2 ? `${base} - Copy${ext}` : `${base} - Copy (${n - 1})${ext}`;
    else candidate = `${base} (${n})${ext}`;
  }
  return candidate;
}

const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};
const sameDir = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// ---------------------------------------------------------------- drives and places

let driveInfoPromise = null;
function loadDriveInfo() {
  driveInfoPromise = powershell(
    "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,VolumeSerialNumber,DriveType,Size,FreeSpace | ConvertTo-Json -Compress",
  ).then(({ stdout }) => {
    try {
      const data = JSON.parse(stdout.trim() || "[]");
      return new Map([].concat(data).map((d) => [String(d.DeviceID).toUpperCase(), d]));
    } catch {
      return new Map();
    }
  });
  return driveInfoPromise;
}

/** Drives in the shape of the UI's Drive type (src/explorer/sample.ts), plus the root path. */
async function listDrives() {
  const timeout = new Promise((r) => setTimeout(() => r(new Map()), 2500));
  const info = await Promise.race([driveInfoPromise || loadDriveInfo(), timeout]);
  const systemLetter = (process.env.SystemDrive || "C:").toUpperCase();
  const drives = [];
  for (let c = 65; c <= 90; c++) {
    const letter = `${String.fromCharCode(c)}:`;
    const root = `${letter}\\`;
    const meta = info.get(letter);
    if (!meta && !fs.existsSync(root)) continue;
    let total = meta ? Number(meta.Size) || 0 : 0;
    let free = meta ? Number(meta.FreeSpace) || 0 : 0;
    if (!total) {
      try {
        const s = await fsp.statfs(root);
        total = s.blocks * s.bsize;
        free = s.bavail * s.bsize;
      } catch {
        /* not ready, e.g. an empty card reader */
      }
    }
    const type = meta ? Number(meta.DriveType) : 3;
    const kind =
      letter === systemLetter
        ? "system"
        : type === 4
          ? "network"
          : type === 2 || type === 5
            ? "removable"
            : "fixed";
    const fallbackLabel = {
      system: "Local Disk",
      fixed: "Local Disk",
      removable: "Removable Disk",
      network: "Network Drive",
    }[kind];
    drives.push({
      id: letter[0].toLowerCase(),
      letter,
      path: root,
      label: (meta && meta.VolumeName) || fallbackLabel,
      kind,
      volumeId: meta && meta.VolumeSerialNumber ? String(meta.VolumeSerialNumber) : undefined,
      used: Math.max(0, total - free),
      total,
    });
  }
  return drives;
}

function places() {
  const get = (k) => {
    try {
      return app.getPath(k);
    } catch {
      return null;
    }
  };
  return {
    home: get("home"),
    desktop: get("desktop"),
    documents: get("documents"),
    downloads: get("downloads"),
    pictures: get("pictures"),
    music: get("music"),
    videos: get("videos"),
  };
}

// ---------------------------------------------------------------- tasks (copy / move / delete)

const tasks = new Map();
let taskSeq = 0;

function taskUpdate(t, extra = {}) {
  Object.assign(t, extra);
  const now = Date.now();
  if (extra.state || now - (t.lastSent || 0) > 120) {
    t.lastSent = now;
    send("task:update", {
      id: t.id,
      label: t.label,
      op: t.op,
      state: t.state,
      destDir: t.destDir,
      doneBytes: t.doneBytes,
      totalBytes: t.totalBytes,
      doneFiles: t.doneFiles,
      totalFiles: t.totalFiles,
      current: t.current,
      error: t.error,
      results: t.state === "done" ? t.results : undefined,
    });
  }
}

async function measure(paths, token) {
  let bytes = 0;
  let files = 0;
  for (const p of paths) {
    let st;
    try {
      st = await fsp.stat(p);
    } catch {
      continue;
    }
    if (!st.isDirectory()) {
      bytes += st.size;
      files++;
      continue;
    }
    await walk(
      p,
      async (dir, d) => {
        if (d.isDirectory()) return true;
        files++;
        try {
          bytes += (await fsp.stat(path.join(dir, d.name))).size;
        } catch {
          /* vanished */
        }
        return true;
      },
      token,
    );
  }
  return { bytes, files };
}

async function copyFileWithProgress(src, dst, t) {
  const st = await fsp.stat(src);
  t.current = path.basename(src);
  if (st.size < 32 * 1024 * 1024) {
    await fsp.copyFile(src, dst);
    t.doneBytes += st.size;
  } else {
    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(src, { highWaterMark: 4 << 20 });
      const ws = fs.createWriteStream(dst);
      rs.on("data", (chunk) => {
        if (t.cancelled) {
          rs.destroy();
          ws.destroy();
          reject(new Error("Cancelled"));
          return;
        }
        t.doneBytes += chunk.length;
        taskUpdate(t);
      });
      rs.on("error", reject);
      ws.on("error", reject);
      ws.on("finish", resolve);
      rs.pipe(ws);
    });
    await fsp.utimes(dst, st.atime, st.mtime).catch(() => {});
  }
  t.doneFiles++;
  taskUpdate(t);
}

async function copyRecursive(src, dst, t) {
  if (t.cancelled) throw new Error("Cancelled");
  const st = await fsp.stat(src);
  if (!st.isDirectory()) return copyFileWithProgress(src, dst, t);
  await fsp.mkdir(dst, { recursive: true });
  for (const d of await fsp.readdir(src, { withFileTypes: true })) {
    await copyRecursive(path.join(src, d.name), path.join(dst, d.name), t);
  }
}

async function runTransfer(t, { op, sources, destDir, conflict }) {
  t.results = [];
  const { bytes, files } = await measure(sources, t);
  taskUpdate(t, { totalBytes: bytes, totalFiles: files, state: "running" });
  for (const src of sources) {
    if (t.cancelled) break;
    const name = path.basename(src);
    let isDir = false;
    try {
      isDir = (await fsp.stat(src)).isDirectory();
    } catch {
      continue;
    }
    if (isDir && isInside(destDir, src)) {
      t.error = `"${name}" can't be copied into itself.`;
      continue;
    }
    const intoSameDir = sameDir(path.dirname(src), destDir);
    if (intoSameDir && op === "move") continue;
    let target = path.join(destDir, name);
    if (fs.existsSync(target)) {
      if (intoSameDir) target = path.join(destDir, await uniqueName(destDir, name, isDir, "copy"));
      else if (conflict === "skip") continue;
      else if (conflict === "keep")
        target = path.join(destDir, await uniqueName(destDir, name, isDir));
      else if (conflict === "replace")
        await shell.trashItem(target).catch(() => fsp.rm(target, { recursive: true, force: true }));
    }
    t.current = name;
    if (op === "move") {
      try {
        await fsp.rename(src, target);
        t.results.push({ from: src, to: target });
        continue;
      } catch (e) {
        if (e.code !== "EXDEV" && e.code !== "EPERM") throw e;
      }
    }
    await copyRecursive(src, target, t);
    if (op === "move") await fsp.rm(src, { recursive: true, force: true });
    t.results.push({ from: src, to: target });
  }
}

async function runDelete(t, { paths, permanent }) {
  t.results = [];
  taskUpdate(t, { totalFiles: paths.length, state: "running" });
  for (const p of paths) {
    if (t.cancelled) break;
    t.current = path.basename(p);
    taskUpdate(t);
    try {
      if (permanent) await fsp.rm(p, { recursive: true, force: true });
      else await shell.trashItem(p);
      t.results.push({ from: p });
    } catch (e) {
      t.error = `${path.basename(p)}: ${e.message}`;
    }
    t.doneFiles++;
  }
}

function startTask(label, op, fn, extra = {}) {
  const t = {
    id: ++taskSeq,
    label,
    op,
    state: "scanning",
    doneBytes: 0,
    totalBytes: 0,
    doneFiles: 0,
    totalFiles: 0,
    current: "",
    cancelled: false,
    ...extra,
  };
  tasks.set(t.id, t);
  taskUpdate(t, { state: "scanning" });
  fn(t)
    .then(() => taskUpdate(t, { state: t.cancelled ? "cancelled" : "done" }))
    .catch((e) => taskUpdate(t, { state: t.cancelled ? "cancelled" : "error", error: e.message }))
    .finally(() => setTimeout(() => tasks.delete(t.id), 60000));
  return t.id;
}

const describeItems = (paths) =>
  paths.length === 1 ? `"${path.basename(paths[0])}"` : `${paths.length} items`;

// ---------------------------------------------------------------- search

const searches = new Map();

function makeMatcher(query) {
  const q = query.trim();
  if (/[*?]/.test(q)) {
    const re = new RegExp(
      `^${q
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")}$`,
      "i",
    );
    return (name) => re.test(name);
  }
  const parts = q.toLowerCase().split(/\s+/).filter(Boolean);
  return (name) => {
    const n = name.toLowerCase();
    return parts.every((p) => n.includes(p));
  };
}

async function fileContains(p, needle) {
  try {
    const st = await fsp.stat(p);
    if (st.size > 8 * 1024 * 1024) return false;
    const buf = await fsp.readFile(p);
    if (buf.subarray(0, 4096).includes(0)) return false;
    return buf.toString("utf8").toLowerCase().includes(needle);
  } catch {
    return false;
  }
}

const MAX_RESULTS = 10000;

function startSearch({ id, root, query, content }) {
  const token = { cancelled: false };
  searches.set(id, token);
  const match = makeMatcher(query);
  const needle = query.trim().toLowerCase();
  let batch = [];
  let count = 0;
  let scanned = 0;
  const flush = () => {
    send("search:results", { id, items: batch, scanned });
    batch = [];
  };
  const timer = setInterval(flush, 150);
  walk(
    root,
    async (dir, d) => {
      scanned++;
      let hit = match(d.name);
      if (
        !hit &&
        content &&
        !d.isDirectory() &&
        TEXT_EXT.has(path.extname(d.name).slice(1).toLowerCase())
      ) {
        hit = await fileContains(path.join(dir, d.name), needle);
      }
      if (hit) {
        batch.push(await entryFor(dir, d));
        if (++count >= MAX_RESULTS) token.cancelled = true;
      }
      return true;
    },
    token,
    16,
  ).then(() => {
    clearInterval(timer);
    flush();
    send("search:done", { id, count, scanned, limited: count >= MAX_RESULTS });
    searches.delete(id);
  });
}

// ---------------------------------------------------------------- folder watching

const watchers = new Map();
function watchDir(paneId, dir) {
  const old = watchers.get(paneId);
  if (old) {
    old.watcher.close();
    clearTimeout(old.timer);
    watchers.delete(paneId);
  }
  if (!dir) return;
  try {
    const entry = { timer: null, watcher: null };
    entry.watcher = fs.watch(dir, { persistent: false }, () => {
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => send("fs:changed", { paneId, dir }), 350);
    });
    entry.watcher.on("error", () => {});
    watchers.set(paneId, entry);
  } catch {
    /* not watchable */
  }
}

// ---------------------------------------------------------------- Windows dialogs

/**
 * Opens Windows' own Properties dialog. The dialog belongs to the process that asks for it, so a hidden
 * PowerShell hosts it. It must not be a DETACHED_PROCESS (those can't host shell dialogs), and the hidden
 * launch makes Windows create the dialog hidden too, so the helper finds its dialog (#32770), shows it and
 * lives exactly as long as the dialog is open.
 */
function showProperties(p) {
  const isRoot = path.parse(p).root === p;
  const target = isRoot
    ? `$s.Namespace(${psQuote(p)}).Self`
    : `$s.Namespace(${psQuote(path.dirname(p))}).ParseName(${psQuote(path.basename(p))})`;
  const helper =
    "Add-Type 'using System;using System.Text;using System.Runtime.InteropServices;public static class MoonW{" +
    'public delegate bool P(IntPtr h,IntPtr l);[DllImport("user32.dll")]public static extern bool EnumWindows(P f,IntPtr l);' +
    '[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);' +
    '[DllImport("user32.dll")]public static extern bool IsWindow(IntPtr h);' +
    '[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);' +
    '[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);' +
    '[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetClassName(IntPtr h,StringBuilder s,int n);' +
    "public static IntPtr Find(uint t){IntPtr f=IntPtr.Zero;EnumWindows((h,l)=>{uint p;GetWindowThreadProcessId(h,out p);" +
    'if(p==t){var sb=new StringBuilder(64);GetClassName(h,sb,64);if(sb.ToString()=="#32770"){f=h;return false;}}return true;},IntPtr.Zero);return f;}}\';';
  const script =
    `${helper}$s=New-Object -ComObject Shell.Application;${target}.InvokeVerb('properties');` +
    "$h=[IntPtr]::Zero;$t=0;while($t -lt 100 -and $h -eq [IntPtr]::Zero){Start-Sleep -Milliseconds 100;$h=[MoonW]::Find($PID);$t++};" +
    "if($h -ne [IntPtr]::Zero){[void][MoonW]::ShowWindow($h,5);[void][MoonW]::SetForegroundWindow($h);" +
    "while([MoonW]::IsWindow($h)){Start-Sleep -Milliseconds 500}}";
  spawn("powershell.exe", ["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-Command", script], {
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

function openTerminal(dir) {
  return new Promise((resolve) => {
    const child = spawn("wt.exe", ["-d", dir], { detached: true, stdio: "ignore" });
    child.on("error", () => {
      spawn("cmd.exe", ["/c", "start", '""', "powershell.exe", "-NoExit"], {
        cwd: dir,
        detached: true,
        stdio: "ignore",
      }).unref();
      resolve();
    });
    child.on("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

// ---------------------------------------------------------------- IPC

/** Every handler resolves to { ok, data } or { ok: false, error, code }; preload turns the latter into an Error. */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e.message, code: e.code };
    }
  });
}

function registerIpc() {
  handle("sys:places", places);
  handle("sys:drives", listDrives);
  handle("sys:refreshDrives", () => {
    loadDriveInfo();
    return listDrives();
  });
  handle("sys:env", () => ({ ...process.env }));
  handle("sys:takeStart", () => {
    const s = pendingStart;
    pendingStart = null;
    return s;
  });
  handle("sys:defaultFileManager", () => defaultFileManager.status(app));
  handle("sys:setDefaultFileManager", (enabled) =>
    defaultFileManager.setEnabled(app, Boolean(enabled)),
  );

  handle("fs:list", async (dir) => {
    const [dirents, hidden] = await Promise.all([
      fsp.readdir(dir, { withFileTypes: true }),
      hiddenNames(dir),
    ]);
    const items = await mapLimit(dirents, 64, (d) => entryFor(dir, d));
    for (const it of items) it.hidden = hidden.has(it.name.toLowerCase());
    return items;
  });
  handle("fs:stat", async (p) => toEntry(p, path.basename(p) || p, await fsp.stat(p)));
  handle("fs:exists", (p) => fs.existsSync(p));
  handle("fs:isDir", async (p) => {
    try {
      return (await fsp.stat(p)).isDirectory();
    } catch {
      return false;
    }
  });
  handle("fs:subdirs", async (dir) =>
    (await fsp.readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name),
  );
  handle("fs:readText", async (p, max = 256 * 1024) => {
    const fh = await fsp.open(p, "r");
    try {
      const { size } = await fh.stat();
      const buf = Buffer.alloc(Math.min(size, max));
      await fh.read(buf, 0, buf.length, 0);
      const binary = buf.subarray(0, 8192).includes(0);
      return { text: binary ? "" : buf.toString("utf8"), truncated: size > max, binary, size };
    } finally {
      await fh.close();
    }
  });
  handle("fs:thumb", async (p, size = 256) => {
    const img = await nativeImage.createThumbnailFromPath(p, { width: size, height: size });
    return img.isEmpty() ? null : img.toDataURL();
  });
  handle("fs:icon", async (p) => (await app.getFileIcon(p, { size: "large" })).toDataURL());

  handle("fs:mkdir", async (dir, name) => {
    const p = path.join(dir, await uniqueName(dir, name, true));
    await fsp.mkdir(p);
    return p;
  });
  handle("fs:createFile", async (dir, name) => {
    const p = path.join(dir, await uniqueName(dir, name, false));
    await fsp.writeFile(p, "", { flag: "wx" });
    return p;
  });
  handle("fs:rename", async (from, to) => {
    if (from.toLowerCase() !== to.toLowerCase() && fs.existsSync(to)) {
      const e = new Error(`"${path.basename(to)}" already exists.`);
      e.code = "EEXIST";
      throw e;
    }
    await fsp.rename(from, to);
    return to;
  });
  handle("fs:conflicts", async (sources, destDir) =>
    sources
      .filter((s) => !sameDir(path.dirname(s), destDir))
      .map((s) => path.basename(s))
      .filter((n) => fs.existsSync(path.join(destDir, n))),
  );
  handle("fs:transfer", (opts) => {
    const verb = opts.op === "move" ? "Moving" : "Copying";
    return startTask(
      `${verb} ${describeItems(opts.sources)} to "${path.basename(opts.destDir) || opts.destDir}"`,
      opts.op,
      (t) => runTransfer(t, opts),
      { destDir: opts.destDir },
    );
  });
  handle("fs:delete", (opts) =>
    startTask(
      `${opts.permanent ? "Deleting" : "Moving to the Recycle Bin:"} ${describeItems(opts.paths)}`,
      "delete",
      (t) => runDelete(t, opts),
    ),
  );
  handle("task:cancel", (id) => {
    const t = tasks.get(id);
    if (t) t.cancelled = true;
  });

  handle("fs:checksums", async (p) => {
    const algorithms = ["sha256", "sha1", "md5"];
    const hashes = algorithms.map((a) => crypto.createHash(a));
    for await (const chunk of fs.createReadStream(p)) for (const h of hashes) h.update(chunk);
    return Object.fromEntries(algorithms.map((a, i) => [a, hashes[i].digest("hex")]));
  });
  handle("fs:dirSize", async (p) => {
    let size = 0;
    let files = 0;
    let dirs = 0;
    await walk(
      p,
      async (dir, d) => {
        if (d.isDirectory()) {
          dirs++;
          return true;
        }
        files++;
        try {
          size += (await fsp.lstat(path.join(dir, d.name))).size;
        } catch {
          /* vanished */
        }
        return true;
      },
      { cancelled: false },
      24,
    );
    return { size, files, dirs };
  });

  handle("fs:zip", async (sources, destZip) => {
    const cwd = path.dirname(sources[0]);
    const { err, stderr } = await execText(
      TAR,
      ["-a", "-c", "-f", destZip, ...sources.map((s) => path.basename(s))],
      { cwd, timeout: 0 },
    );
    if (err) throw new Error(stderr.trim() || err.message);
    return destZip;
  });
  handle("fs:unzip", async (archive, destDir) => {
    await fsp.mkdir(destDir, { recursive: true });
    const { err, stderr } = await execText(TAR, ["-x", "-f", archive, "-C", destDir], {
      timeout: 0,
    });
    if (err) throw new Error(stderr.trim() || err.message);
    return destDir;
  });

  handle("search:start", (opts) => startSearch(opts));
  handle("search:cancel", (id) => {
    const t = searches.get(id);
    if (t) t.cancelled = true;
  });
  handle("fs:watch", (paneId, dir) => watchDir(paneId, dir));

  handle("shell:open", async (p) => {
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
  });
  handle("shell:openWith", (p) => {
    spawn("rundll32.exe", ["shell32.dll,OpenAs_RunDLL", p], {
      detached: true,
      stdio: "ignore",
    }).unref();
  });
  handle("shell:reveal", (p) => shell.showItemInFolder(p));
  // Always explorer.exe itself, so this keeps working when Moon Explorer is the default file manager.
  handle("shell:openInWindowsExplorer", (target) => {
    spawn("explorer.exe", [target], { detached: true, stdio: "ignore" }).unref();
  });
  handle("shell:resolveLink", (p) => {
    try {
      return shell.readShortcutLink(p).target || null;
    } catch {
      return null;
    }
  });
  handle("shell:terminal", openTerminal);
  handle("shell:properties", showProperties);

  handle("clip:writeText", (t) => clipboard.writeText(t));
  // Puts the files on the Windows clipboard too, so they can be pasted in Windows Explorer.
  handle("clip:writeFiles", async (paths) => {
    await powershell(`Set-Clipboard -LiteralPath ${paths.map(psQuote).join(",")}`);
  });
  // Files Windows Explorer put on the clipboard, or null when it still holds the ones we wrote (`knownFirst`).
  handle("clip:readFiles", async (knownFirst) => {
    const probe = clipboard.readBuffer("FileNameW");
    if (!probe.length) return [];
    const first = probe.toString("utf16le").split(String.fromCharCode(0))[0];
    if (knownFirst && first.toLowerCase() === knownFirst.toLowerCase()) return null;
    const { stdout } = await powershell(
      "Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }",
    );
    return stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  });

  handle("win:setTheme", (theme) => {
    const colors = FRAME[theme] || FRAME.dark;
    if (!win) return;
    win.setBackgroundColor(colors.color);
    try {
      win.setTitleBarOverlay({ ...colors, height: TITLE_BAR_HEIGHT });
    } catch {
      /* not supported */
    }
  });
  handle("win:devtools", () => win && win.webContents.toggleDevTools());

  ipcMain.on("drag:start", (e, paths) => {
    if (!Array.isArray(paths) || !paths.length) return;
    const icon = nativeImage.createFromPath(path.join(BUILD, "drag.png"));
    e.sender.startDrag({ file: paths[0], files: paths, icon });
  });
}

/** moon-file://local/C:/path/to/file serves local files to the UI (previews, thumbnails, media). */
function registerFileProtocol() {
  protocol.handle(FILE_SCHEME, (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers });
  });
}

// ---------------------------------------------------------------- window

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 780,
    minHeight: 500,
    show: false,
    backgroundColor: FRAME.dark.color,
    titleBarStyle: "hidden",
    titleBarOverlay: { ...FRAME.dark, height: TITLE_BAR_HEIGHT },
    icon: path.join(BUILD, "icon.png"),
    title: "Moon Explorer",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      plugins: true,
      spellcheck: false,
    },
  });
  if (process.env.MOON_DEV_URL) win.loadURL(process.env.MOON_DEV_URL);
  else win.loadFile(path.join(ROOT, "dist", "index.html"));
  win.once("ready-to-show", () => {
    win.show();
    // Only the installed app: a development run would offer to register electron.exe instead.
    // A few seconds later, so it doesn't slow the start down or race the installer's --set-default.
    if (app.isPackaged && !process.env.MOON_SHOT) {
      setTimeout(() => {
        if (win) void defaultFileManager.checkOnStartup(app, dialog, win);
      }, 5000);
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.on("closed", () => {
    win = null;
  });
  if (process.env.MOON_SHOT) runScreenshotScript();
}

/**
 * Development helper for automated screenshots: MOON_SHOT=<folder> and optionally MOON_SCRIPT=<js file>.
 * The script runs in the UI, may call `await shot('name')`, and its return value goes to result.txt.
 */
function runScreenshotScript() {
  const outDir = process.env.MOON_SHOT;
  ipcMain.handle("dev:shot", async (_e, name) => {
    const img = await win.webContents.capturePage();
    await fsp.writeFile(path.join(outDir, `${name}.png`), img.toPNG());
  });
  win.webContents.once("did-finish-load", async () => {
    await new Promise((r) => setTimeout(r, 2500));
    const script = process.env.MOON_SCRIPT ? fs.readFileSync(process.env.MOON_SCRIPT, "utf8") : "";
    const result = await win.webContents
      .executeJavaScript(
        `(async () => {
      const shot = (n) => window.moonDev.shot(n);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      let out;
      try { out = await (async () => { ${script}\n })(); } catch (e) { out = 'ERROR ' + (e && e.stack || e); }
      await shot('final');
      return String(out ?? '');
    })()`,
      )
      .catch((e) => `ERROR ${e.message}`);
    await fsp.writeFile(path.join(outDir, "result.txt"), result);
    app.quit();
  });
}

if (process.env.MOON_SHOT) app.setPath("userData", path.join(process.env.MOON_SHOT, "userdata"));

// --set-default / --unset-default / --default-status (docs/default-file-manager.md) do their work and quit
// without a window, so they come before the single-instance lock.
if (defaultFileManager.handleCliFlags(app)) {
  // Nothing else to start.
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  pendingStart = startFromArgv(app, process.argv);
  app.on("second-instance", (_e, argv) => {
    send("open-request", startFromArgv(app, argv));
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    loadDriveInfo();
    registerFileProtocol();
    registerIpc();
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
