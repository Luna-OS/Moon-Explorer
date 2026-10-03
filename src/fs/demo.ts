/* eslint-disable @typescript-eslint/require-await -- the demo implements the async bridge synchronously. */
/*
 * An in-memory file system with the sample content, so the UI runs in a
 * plain browser (`npm run dev`) and in the tests. Nothing here touches the
 * disk; the Electron shell provides the real bridge (electron/preload.cjs).
 */
import { DRIVES, ENTRIES } from "@/explorer/sample";
import { basename, dirname, extname, isInside, join, normalize, samePath } from "./paths";
import type {
  BridgeEvents,
  Checksums,
  PickerRequest,
  DefaultFileManagerStatus,
  FsDrive,
  FsEntry,
  MoonBridge,
  Places,
  SearchRequest,
  StartTarget,
  TaskUpdate,
} from "./types";

interface Node {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number;
  hidden?: boolean;
  text?: string;
  children?: Map<string, Node>;
}

const HOME = "C:\\Users\\Luna";

function parseDate(s: string): number {
  return new Date(s.replace(" ", "T")).getTime();
}

function dir(name: string, mtime = parseDate("2026-09-20 10:00")): Node {
  return { name, isDir: true, size: 0, mtime, children: new Map() };
}

function file(name: string, size: number, mtime: number, text?: string): Node {
  return { name, isDir: false, size, mtime, text };
}

type Listener = (data: unknown) => void;

/** FNV-1a over the text, stretched to `length` hex digits. */
function fakeDigest(text: string, length: number): string {
  let out = "";
  for (let round = 0; out.length < length; round++) {
    let h = 0x811c9dc5 ^ round;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    out += (h >>> 0).toString(16).padStart(8, "0");
  }
  return out.slice(0, length);
}

function demoDefaultFm(on: boolean): DefaultFileManagerStatus {
  const state = on ? "on" : "off";
  return {
    state,
    enabled: on,
    needsAttention: false,
    targets: [
      { id: "folder", label: "Folders", state },
      { id: "drive", label: "Drives", state },
      { id: "this-pc", label: "This PC", state },
      { id: "win-e", label: "Win+E / new Explorer windows", state },
    ],
  };
}

export class DemoBridge implements MoonBridge {
  readonly kind = "demo" as const;
  private roots = new Map<string, Node>();
  private listeners = new Map<string, Set<Listener>>();
  private taskSeq = 0;
  private start: StartTarget | null;
  /** Pretends to register with Windows; the tests may set it to another state. */
  defaultFm: DefaultFileManagerStatus = demoDefaultFm(false);
  /** Shell actions the UI asked for (open, terminal, …); the tests read them. */
  readonly shellCalls: { action: string; target: string }[] = [];

  constructor(start: StartTarget | null = { kind: "folder", path: `${HOME}\\Documents` }) {
    this.start = start;
    for (const d of DRIVES) this.roots.set(d.letter.toUpperCase(), dir(d.letter));
    const c = this.node("C:\\");
    if (!c?.children) return;
    const users = this.add(c, dir("Users"));
    this.add(c, dir("Windows"));
    const home = this.add(users, dir("Luna"));
    this.add(home, { ...dir("AppData"), hidden: true });
    for (const name of ["Desktop", "Downloads", "Music", "Pictures", "Videos"])
      this.add(home, dir(name));
    const docs = this.add(home, dir("Documents"));
    for (const e of ENTRIES) {
      const mtime = parseDate(e.modified);
      if (e.kind === "folder") this.add(docs, dir(e.name, mtime));
      else this.add(docs, file(e.name, e.size ?? 0, mtime, `${e.name}\n\nSample content.`));
    }
    const night = this.node(`${HOME}\\Documents\\Night sky photos`);
    if (night) this.add(night, file("moonrise.jpg", 3_211_264, parseDate("2026-08-12 21:01")));
    const d = this.node("D:\\");
    if (d) this.add(d, dir("Games"));
  }

  private add(parent: Node, child: Node): Node {
    parent.children?.set(child.name.toLowerCase(), child);
    return child;
  }

  private node(p: string): Node | null {
    const parts = normalize(p).split("\\").filter(Boolean);
    let cur = this.roots.get((parts.shift() ?? "").toUpperCase()) ?? null;
    for (const part of parts) {
      cur = cur?.children?.get(part.toLowerCase()) ?? null;
    }
    return cur;
  }

  private require(p: string): Node {
    const n = this.node(p);
    if (!n) throw Object.assign(new Error(`"${p}" was not found.`), { code: "ENOENT" });
    return n;
  }

  private entry(path: string, n: Node): FsEntry {
    return {
      name: n.name,
      path,
      isDir: n.isDir,
      isLink: false,
      size: n.isDir ? null : n.size,
      mtime: n.mtime,
      ctime: n.mtime,
      ext: n.isDir ? "" : extname(n.name),
      hidden: !!n.hidden,
    };
  }

  private emit<K extends keyof BridgeEvents>(event: K, data: BridgeEvents[K]) {
    for (const fn of this.listeners.get(event) ?? []) fn(data);
  }

  private uniqueName(parent: Node, name: string, isDir: boolean, copy = false): string {
    const ext = isDir ? "" : extname(name) ? `.${name.slice(name.lastIndexOf(".") + 1)}` : "";
    const base = ext ? name.slice(0, -ext.length) : name;
    let candidate = name;
    for (let n = 2; parent.children?.has(candidate.toLowerCase()); n++) {
      candidate = copy
        ? `${base} - Copy${n === 2 ? "" : ` (${n - 1})`}${ext}`
        : `${base} (${n})${ext}`;
    }
    return candidate;
  }

  private clone(n: Node, name = n.name): Node {
    return {
      ...n,
      name,
      children: n.children
        ? new Map([...n.children].map(([k, c]) => [k, this.clone(c)]))
        : undefined,
    };
  }

  private *walk(path: string, n: Node): Generator<FsEntry> {
    for (const child of n.children?.values() ?? []) {
      const p = join(path, child.name);
      yield this.entry(p, child);
      if (child.isDir) yield* this.walk(p, child);
    }
  }

  places(): Promise<Places> {
    return Promise.resolve({
      home: HOME,
      desktop: `${HOME}\\Desktop`,
      documents: `${HOME}\\Documents`,
      downloads: `${HOME}\\Downloads`,
      pictures: `${HOME}\\Pictures`,
      music: `${HOME}\\Music`,
      videos: `${HOME}\\Videos`,
    });
  }

  drives(): Promise<FsDrive[]> {
    return Promise.resolve(DRIVES.map((d) => ({ ...d, path: `${d.letter}\\` })));
  }

  refreshDrives(): Promise<FsDrive[]> {
    return this.drives();
  }

  env(): Promise<Record<string, string>> {
    return Promise.resolve({ USERPROFILE: HOME, USERNAME: "Luna" });
  }

  takeStart(): Promise<StartTarget | null> {
    const s = this.start;
    this.start = null;
    return Promise.resolve(s);
  }

  /** Set by a test to run the UI as an Open/Save dialog. */
  pickerRequest: PickerRequest | null = null;
  /** The path the picker returned (or null for cancel); the tests read it. */
  pickerResult: string | null | undefined = undefined;

  picker(): Promise<PickerRequest | null> {
    return Promise.resolve(this.pickerRequest);
  }

  resolvePicker(path: string | null): Promise<void> {
    this.pickerResult = path;
    return Promise.resolve();
  }

  defaultFileManager(): Promise<DefaultFileManagerStatus> {
    return Promise.resolve(this.defaultFm);
  }

  setDefaultFileManager(enabled: boolean): Promise<DefaultFileManagerStatus> {
    this.defaultFm = demoDefaultFm(enabled);
    return Promise.resolve(this.defaultFm);
  }

  async list(p: string): Promise<FsEntry[]> {
    const n = this.require(p);
    if (!n.isDir) throw Object.assign(new Error("Not a folder."), { code: "ENOTDIR" });
    return [...(n.children?.values() ?? [])].map((c) => this.entry(join(normalize(p), c.name), c));
  }

  async stat(p: string): Promise<FsEntry> {
    return this.entry(normalize(p), this.require(p));
  }

  async exists(p: string): Promise<boolean> {
    return !!this.node(p);
  }

  async isDir(p: string): Promise<boolean> {
    return !!this.node(p)?.isDir;
  }

  async subdirs(p: string): Promise<string[]> {
    return (await this.list(p)).filter((e) => e.isDir).map((e) => e.name);
  }

  async readText(p: string) {
    const n = this.require(p);
    const text = n.text ?? "";
    return { text, truncated: false, binary: n.text === undefined, size: n.size };
  }

  thumbnail(): Promise<string | null> {
    return Promise.resolve(null);
  }

  systemIcon(): Promise<string> {
    return Promise.resolve("");
  }

  fileUrl(): string {
    return "";
  }

  async mkdir(parentPath: string, name: string): Promise<string> {
    const parent = this.require(parentPath);
    const final = this.uniqueName(parent, name, true);
    this.add(parent, dir(final, Date.now()));
    return join(normalize(parentPath), final);
  }

  async createFile(parentPath: string, name: string): Promise<string> {
    const parent = this.require(parentPath);
    const final = this.uniqueName(parent, name, false);
    this.add(parent, file(final, 0, Date.now(), ""));
    return join(normalize(parentPath), final);
  }

  async rename(from: string, to: string): Promise<string> {
    // Like fs.rename, this also moves the entry into another folder.
    const n = this.require(from);
    const parent = this.require(dirname(from) ?? from);
    const target = this.require(dirname(to) ?? to);
    const newName = basename(to);
    if (!samePath(from, to) && target.children?.has(newName.toLowerCase())) {
      throw Object.assign(new Error(`"${newName}" already exists.`), { code: "EEXIST" });
    }
    parent.children?.delete(n.name.toLowerCase());
    n.name = newName;
    this.add(target, n);
    return to;
  }

  async conflicts(sources: string[], destDir: string): Promise<string[]> {
    const dest = this.require(destDir);
    return sources
      .filter((s) => !samePath(dirname(s), destDir))
      .map((s) => basename(s))
      .filter((name) => dest.children?.has(name.toLowerCase()));
  }

  async transfer(opts: {
    op: "copy" | "move";
    sources: string[];
    destDir: string;
    conflict: "replace" | "keep" | "skip";
  }): Promise<number> {
    const id = ++this.taskSeq;
    const dest = this.require(opts.destDir);
    const results: { from: string; to: string }[] = [];
    for (const src of opts.sources) {
      const n = this.node(src);
      const parent = this.node(dirname(src) ?? "");
      if (!n || !parent || isInside(opts.destDir, src)) continue;
      const same = samePath(dirname(src), opts.destDir);
      if (same && opts.op === "move") continue;
      let name = n.name;
      if (dest.children?.has(name.toLowerCase())) {
        if (same) name = this.uniqueName(dest, name, n.isDir, true);
        else if (opts.conflict === "skip") continue;
        else if (opts.conflict === "keep") name = this.uniqueName(dest, name, n.isDir);
      }
      if (opts.op === "move") {
        parent.children?.delete(n.name.toLowerCase());
        n.name = name;
        this.add(dest, n);
      } else {
        this.add(dest, this.clone(n, name));
      }
      results.push({ from: src, to: join(normalize(opts.destDir), name) });
    }
    this.finishTask(id, opts.op, opts.destDir, results.length, results);
    return id;
  }

  async remove(opts: { paths: string[]; permanent: boolean }): Promise<number> {
    const id = ++this.taskSeq;
    const results: { from: string }[] = [];
    for (const p of opts.paths) {
      const n = this.node(p);
      const parent = this.node(dirname(p) ?? "");
      if (!n || !parent) continue;
      parent.children?.delete(n.name.toLowerCase());
      results.push({ from: p });
    }
    this.finishTask(id, "delete", undefined, results.length, results);
    return id;
  }

  private finishTask(
    id: number,
    op: TaskUpdate["op"],
    destDir: string | undefined,
    files: number,
    results: TaskUpdate["results"],
  ) {
    // Like the real bridge, updates arrive after the call has returned the task's id.
    queueMicrotask(() =>
      this.emit("task:update", {
        id,
        label: op === "delete" ? "Deleting" : op === "move" ? "Moving" : "Copying",
        op,
        state: "done",
        destDir,
        doneBytes: 0,
        totalBytes: 0,
        doneFiles: files,
        totalFiles: files,
        current: "",
        results,
      }),
    );
  }

  async cancelTask(): Promise<void> {}

  async dirSize(p: string) {
    let size = 0;
    let files = 0;
    let dirs = 0;
    for (const e of this.walk(normalize(p), this.require(p))) {
      if (e.isDir) dirs++;
      else {
        files++;
        size += e.size ?? 0;
      }
    }
    return { size, files, dirs };
  }

  /** Stand-in digests (the demo has no real file content): stable per path, right length. */
  async checksums(p: string): Promise<Checksums> {
    const n = this.require(p);
    if (n.isDir) throw Object.assign(new Error("Not a file."), { code: "EISDIR" });
    const seed = `${normalize(p)}|${n.size}|${n.text ?? ""}`;
    return { sha256: fakeDigest(seed, 64), sha1: fakeDigest(seed, 40), md5: fakeDigest(seed, 32) };
  }

  async zip(sources: string[], dest: string): Promise<string> {
    const parent = this.require(dirname(dest) ?? dest);
    this.add(parent, file(basename(dest), 1024 * sources.length, Date.now()));
    return dest;
  }

  async unzip(_archive: string, dest: string): Promise<string> {
    const parent = this.require(dirname(dest) ?? dest);
    if (!parent.children?.has(basename(dest).toLowerCase())) this.add(parent, dir(basename(dest)));
    return dest;
  }

  async search(req: SearchRequest): Promise<void> {
    const q = req.query.trim().toLowerCase();
    const items: FsEntry[] = [];
    let scanned = 0;
    for (const e of this.walk(normalize(req.root), this.require(req.root))) {
      scanned++;
      const inName = e.name.toLowerCase().includes(q);
      const inText = req.content && (this.node(e.path)?.text ?? "").toLowerCase().includes(q);
      if (inName || inText) items.push(e);
    }
    queueMicrotask(() => {
      this.emit("search:results", { id: req.id, items, scanned });
      this.emit("search:done", { id: req.id, count: items.length, scanned, limited: false });
    });
  }

  async cancelSearch(): Promise<void> {}
  async watch(): Promise<void> {}

  private record(action: string, target: string): Promise<void> {
    this.shellCalls.push({ action, target });
    return Promise.resolve();
  }

  open(p: string) {
    return this.record("open", p);
  }
  openWith(p: string) {
    return this.record("openWith", p);
  }
  runAsAdmin(p: string) {
    return this.record("runAsAdmin", p);
  }
  reveal(p: string) {
    return this.record("reveal", p);
  }
  openInWindowsExplorer(p: string) {
    return this.record("openInWindowsExplorer", p);
  }
  resolveLink(): Promise<string | null> {
    return Promise.resolve(null);
  }
  terminal(p: string) {
    return this.record("terminal", p);
  }
  properties(p: string) {
    return this.record("properties", p);
  }
  copyText(text: string) {
    return this.record("copyText", text);
  }
  copyFilesToSystem(): Promise<void> {
    return Promise.resolve();
  }
  readSystemFiles(): Promise<string[] | null> {
    return Promise.resolve([]);
  }
  setTheme(): Promise<void> {
    return Promise.resolve();
  }
  devtools(): Promise<void> {
    return Promise.resolve();
  }
  startDrag(): void {}
  pathForFile(f: File): string {
    return f.name;
  }

  on<K extends keyof BridgeEvents>(event: K, fn: (data: BridgeEvents[K]) => void): () => void {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(fn as Listener);
    this.listeners.set(event, set);
    return () => set.delete(fn as Listener);
  }
}
