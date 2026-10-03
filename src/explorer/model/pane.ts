import { compareNames, typeLabel } from "@/fs/format";
import { dirname, isRoot, normalize, basename } from "@/fs/paths";
import type { FolderSize, FsEntry, MoonBridge } from "@/fs/types";
import { Store } from "./store";

/** Where a pane is: "This PC", a folder, or search results under a folder. */
export type Location =
  | { kind: "this-pc" }
  | { kind: "dir"; path: string }
  | { kind: "search"; root: string; query: string; content: boolean };

export type SortKey = "name" | "date" | "type" | "size" | "folder";
export interface Sort {
  key: SortKey;
  dir: "asc" | "desc";
}
export type ViewMode = "list" | "grid";

interface HistoryEntry {
  loc: Location;
  scrollTop?: number;
  focusPath?: string;
}

export interface SearchState {
  id: string;
  running: boolean;
  scanned: number;
  ms: number;
  started: number;
  limited: boolean;
}

/** What a pane needs from the rest of the app. */
export interface PaneHost {
  bridge: MoonBridge;
  readonly showHidden: boolean;
  readonly folderSizes: Map<string, FolderSize>;
  displayName(path: string): string;
  onNavigate(pane: PaneModel): void;
  onSelection(pane: PaneModel): void;
  registerSearch(id: string, pane: PaneModel | null): void;
  reportError(message: string): void;
  /** In Open/Save dialog mode, the extensions the chosen file type allows (lower-case, no dot), or null for all. */
  pickerExtensions(): string[] | null;
  /** Asks Windows again for the drives' size and free space (This PC shows them). */
  refreshDrives(): Promise<void>;
}

let paneSeq = 0;
let searchSeq = 0;

/** Turns `*.pdf` style patterns into a regular expression. */
export function globToRegExp(glob: string): RegExp {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${body}$`, "i");
}

/** Keeps the entries whose name matches every word (or the wildcard pattern). */
export function filterEntries(entries: FsEntry[], filter: string): FsEntry[] {
  const f = filter.trim();
  if (!f) return entries;
  if (/[*?]/.test(f)) {
    const re = globToRegExp(f);
    return entries.filter((e) => re.test(e.name));
  }
  const words = f.toLowerCase().split(/\s+/);
  return entries.filter((e) => {
    const name = e.name.toLowerCase();
    return words.every((w) => name.includes(w));
  });
}

/** Folders first, then by the chosen column; ties fall back to the name. */
export function sortEntries(
  entries: FsEntry[],
  sort: Sort,
  folderSizes: Map<string, FolderSize> = new Map(),
): FsEntry[] {
  const m = sort.dir === "desc" ? -1 : 1;
  const sizeOf = (e: FsEntry) => (e.isDir ? (folderSizes.get(e.path)?.size ?? -1) : (e.size ?? 0));
  const byName = (a: FsEntry, b: FsEntry) => compareNames(a.name, b.name);
  const compare: Record<SortKey, (a: FsEntry, b: FsEntry) => number> = {
    name: byName,
    date: (a, b) => a.mtime - b.mtime || byName(a, b),
    type: (a, b) => compareNames(typeLabel(a), typeLabel(b)) || byName(a, b),
    size: (a, b) => sizeOf(a) - sizeOf(b) || byName(a, b),
    folder: (a, b) => compareNames(a.path, b.path),
  };
  const cmp = compare[sort.key];
  return entries.slice().sort((a, b) => Number(b.isDir) - Number(a.isDir) || m * cmp(a, b));
}

/** One file pane: its location, history, listing, filter, sort, selection and search. */
export class PaneModel extends Store {
  readonly id = `pane-${++paneSeq}`;
  loc: Location | null = null;
  items: FsEntry[] = [];
  view: FsEntry[] = [];
  index = new Map<string, number>();
  sel = new Set<string>();
  cursor = -1;
  anchor = -1;
  filter = "";
  sort: Sort;
  mode: ViewMode;
  iconSize: number;
  busy = false;
  search: SearchState | null = null;
  /** The entry being renamed inline, if any. */
  renaming: string | null = null;
  /** Set by the view; restored when coming back through history. */
  scrollTop = 0;
  /** Bumped when the view should scroll the cursor into view. */
  revealSeq = 0;
  /** A scroll position the view should apply once (history navigation). */
  pendingScroll: number | null = null;

  private history: HistoryEntry[] = [];
  private hIndex = -1;
  private navSeq = 0;

  constructor(
    private host: PaneHost,
    opts: { sort: Sort; mode: ViewMode; iconSize: number },
  ) {
    super();
    this.sort = { ...opts.sort };
    this.mode = opts.mode;
    this.iconSize = opts.iconSize;
  }

  get path(): string | null {
    return this.loc?.kind === "dir" ? this.loc.path : null;
  }

  /** The folder new files and pastes go to (a search's root too). */
  get workDir(): string | null {
    if (this.loc?.kind === "dir") return this.loc.path;
    if (this.loc?.kind === "search") return this.loc.root;
    return null;
  }

  get canBack() {
    return this.hIndex > 0;
  }
  get canForward() {
    return this.hIndex < this.history.length - 1;
  }

  /** Changes whenever the pane shows another place (a folder, This PC or another search). */
  locationKey(): string {
    const l = this.loc;
    if (!l) return "";
    if (l.kind === "dir") return `dir:${l.path}`;
    if (l.kind === "search") return `search:${l.root}:${l.query}`;
    return l.kind;
  }

  title(): string {
    if (!this.loc || this.loc.kind === "this-pc") return "This PC";
    if (this.loc.kind === "search") return `Search: ${this.loc.query}`;
    return this.host.displayName(this.loc.path);
  }

  // ------------------------------------------------------------ navigation

  async go(
    target: Location | string,
    { push = true, select }: { push?: boolean; select?: string } = {},
  ): Promise<boolean> {
    const loc: Location =
      typeof target === "string" ? { kind: "dir", path: normalize(target) } : target;
    const seq = ++this.navSeq;
    let items: FsEntry[] = [];
    if (loc.kind === "dir") {
      this.busy = true;
      this.changed();
      try {
        items = await this.host.bridge.list(loc.path);
      } catch (e) {
        if (seq !== this.navSeq) return false;
        this.busy = false;
        const err = e as Error & { code?: string };
        if (err.code === "ENOTDIR") {
          const parent = dirname(loc.path);
          if (parent) return this.go(parent, { push, select: loc.path });
        }
        const reason =
          err.code === "EPERM" || err.code === "EACCES" ? "Access denied." : err.message;
        this.host.reportError(`Can't open the folder: ${reason}`);
        this.changed();
        return false;
      }
      if (seq !== this.navSeq) return false;
    }
    this.busy = false;
    this.stopSearch();
    let entry: HistoryEntry;
    if (push) {
      this.saveViewState();
      this.history = this.history.slice(0, this.hIndex + 1);
      entry = { loc };
      this.history.push(entry);
      if (this.history.length > 200) this.history.shift();
      this.hIndex = this.history.length - 1;
    } else {
      entry = this.history[this.hIndex] ?? { loc };
    }
    this.loc = entry.loc;
    this.items = items;
    this.sel.clear();
    this.cursor = -1;
    this.anchor = -1;
    this.filter = "";
    this.renaming = null;
    this.pendingScroll = push ? 0 : (entry.scrollTop ?? 0);
    if (this.loc.kind === "search") this.runSearch();
    this.refreshView();
    const focus = select ?? entry.focusPath;
    if (focus && this.index.has(focus)) {
      this.selectOnly(this.index.get(focus) ?? 0);
    }
    void this.host.bridge
      .watch(this.id, this.loc.kind === "dir" ? this.loc.path : null)
      .catch(() => {});
    this.host.onNavigate(this);
    this.changed();
    return true;
  }

  private saveViewState() {
    const cur = this.history[this.hIndex];
    if (!cur) return;
    cur.scrollTop = this.scrollTop;
    cur.focusPath = this.view[this.cursor]?.path;
  }

  back() {
    if (!this.canBack) return;
    this.saveViewState();
    this.hIndex--;
    void this.go(this.history[this.hIndex].loc, { push: false });
  }

  forward() {
    if (!this.canForward) return;
    this.saveViewState();
    this.hIndex++;
    void this.go(this.history[this.hIndex].loc, { push: false });
  }

  /** The parent folder (selecting the folder we came from); from a root, "This PC". */
  up() {
    if (this.loc?.kind === "search") {
      void this.go(this.loc.root);
      return;
    }
    const p = this.path;
    if (!p) return;
    const parent = dirname(p);
    void this.go(parent ?? { kind: "this-pc" }, { select: parent ? p : undefined });
  }

  /** Reads the folder again, keeping the selection and the cursor. */
  async reload(): Promise<void> {
    if (this.loc?.kind === "search") {
      this.runSearch();
      return;
    }
    const path = this.path;
    if (!path) {
      // This PC: its content is the drives.
      void this.host.refreshDrives();
      this.changed();
      return;
    }
    const seq = this.navSeq;
    let items: FsEntry[];
    try {
      items = await this.host.bridge.list(path);
    } catch {
      if (seq !== this.navSeq) return;
      // The folder is gone: go to the closest parent that still exists.
      let parent = dirname(path);
      while (parent && !(await this.host.bridge.isDir(parent))) parent = dirname(parent);
      void this.go(parent ?? { kind: "this-pc" });
      return;
    }
    if (seq !== this.navSeq) return;
    const cursorPath = this.view[this.cursor]?.path;
    this.items = items;
    this.refreshView(cursorPath);
    this.changed();
  }

  // ------------------------------------------------------------ view

  /** Applies hidden files, the filter and the sort to `items`. */
  refreshView(keepCursor?: string) {
    let items = this.items;
    if (!this.host.showHidden) items = items.filter((e) => !e.hidden);
    if (this.loc?.kind !== "search") items = filterEntries(items, this.filter);
    const types = this.host.pickerExtensions();
    if (types) items = items.filter((e) => e.isDir || types.includes(e.ext));
    this.view = sortEntries(items, this.sort, this.host.folderSizes);
    this.index = new Map(this.view.map((e, i) => [e.path, i]));
    for (const p of [...this.sel]) if (!this.index.has(p)) this.sel.delete(p);
    if (keepCursor && this.index.has(keepCursor)) this.cursor = this.index.get(keepCursor) ?? -1;
    else if (this.cursor >= this.view.length) this.cursor = this.view.length - 1;
    this.host.onSelection(this);
  }

  setFilter(filter: string) {
    this.filter = filter;
    this.refreshView(this.view[this.cursor]?.path);
    this.changed();
  }

  setSort(sort: Sort) {
    this.sort = { ...sort };
    this.refreshView(this.view[this.cursor]?.path);
    this.changed();
  }

  /** Clicking a column: same column flips the direction, a new one starts ascending (date/size: newest/largest first). */
  toggleSort(key: SortKey) {
    if (this.sort.key === key) this.setSort({ key, dir: this.sort.dir === "asc" ? "desc" : "asc" });
    else this.setSort({ key, dir: key === "date" || key === "size" ? "desc" : "asc" });
  }

  setMode(mode: ViewMode) {
    this.mode = mode;
    this.revealSeq++;
    this.changed();
  }

  setIconSize(size: number) {
    this.iconSize = size;
    this.changed();
  }

  /** The scroll position the view should restore once (after back / forward), or null. */
  takePendingScroll(): number | null {
    const s = this.pendingScroll;
    this.pendingScroll = null;
    return s;
  }

  /** The view reports its scroll position, so history can restore it. */
  rememberScroll(top: number) {
    this.scrollTop = top;
  }

  /** Re-renders after something outside changed (folder sizes, clipboard, settings). */
  touch() {
    this.changed();
  }

  // ------------------------------------------------------------ selection

  selected(): FsEntry[] {
    return this.view.filter((e) => this.sel.has(e.path));
  }

  private selectionChanged(reveal = false) {
    if (reveal) this.revealSeq++;
    this.host.onSelection(this);
    this.changed();
  }

  selectOnly(i: number, reveal = true) {
    const e = this.view[i];
    this.sel = new Set(e ? [e.path] : []);
    this.cursor = e ? i : -1;
    this.anchor = this.cursor;
    this.selectionChanged(reveal);
  }

  toggle(i: number) {
    const e = this.view[i];
    if (!e) return;
    if (this.sel.has(e.path)) this.sel.delete(e.path);
    else this.sel.add(e.path);
    this.cursor = i;
    this.anchor = i;
    this.selectionChanged();
  }

  /** Shift+click: everything between the anchor and `i`. */
  extendTo(i: number, additive = false) {
    const from = this.anchor >= 0 ? this.anchor : i;
    const [lo, hi] = from <= i ? [from, i] : [i, from];
    if (!additive) this.sel.clear();
    for (let k = lo; k <= hi; k++) this.sel.add(this.view[k].path);
    this.cursor = i;
    this.selectionChanged();
  }

  setSelection(paths: Iterable<string>, cursor?: number) {
    this.sel = new Set([...paths].filter((p) => this.index.has(p)));
    if (cursor !== undefined) this.cursor = cursor;
    this.selectionChanged();
  }

  selectPaths(paths: string[]) {
    this.sel = new Set(paths.filter((p) => this.index.has(p)));
    const first = Math.min(...paths.map((p) => this.index.get(p) ?? Infinity));
    if (Number.isFinite(first)) {
      this.cursor = first;
      this.anchor = first;
    }
    this.selectionChanged(true);
  }

  selectAll() {
    this.sel = new Set(this.view.map((e) => e.path));
    this.selectionChanged();
  }

  invertSelection() {
    this.sel = new Set(this.view.filter((e) => !this.sel.has(e.path)).map((e) => e.path));
    this.selectionChanged();
  }

  clearSelection() {
    this.sel.clear();
    this.selectionChanged();
  }

  /** Keyboard movement: plain moves the selection, Shift extends it, Ctrl only moves the cursor. */
  moveCursor(to: number, shift = false, ctrl = false) {
    if (!this.view.length) return;
    const i = Math.max(0, Math.min(this.view.length - 1, to));
    if (shift) {
      if (this.anchor < 0) this.anchor = Math.max(0, this.cursor);
      this.extendTo(i, ctrl);
      this.revealSeq++;
      return;
    }
    if (ctrl) {
      this.cursor = i;
      this.selectionChanged(true);
      return;
    }
    this.selectOnly(i);
  }

  /** Type-to-select: the next entry whose name starts with `prefix`. */
  jumpTo(prefix: string) {
    const p = prefix.toLowerCase();
    const n = this.view.length;
    const start = p.length === 1 ? this.cursor + 1 : Math.max(0, this.cursor);
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (this.view[i].name.toLowerCase().startsWith(p)) {
        this.selectOnly(i);
        return;
      }
    }
  }

  setRenaming(path: string | null) {
    this.renaming = path;
    this.changed();
  }

  // ------------------------------------------------------------ search

  /** Searches every subfolder of the current folder (or `root`). */
  startSearch(query: string, root = this.workDir) {
    const q = query.trim();
    if (!q || !root) return;
    const content = this.loc?.kind === "search" ? this.loc.content : false;
    void this.go({ kind: "search", root, query: q, content });
  }

  setSearchContent(content: boolean) {
    if (this.loc?.kind !== "search") return;
    this.loc = { ...this.loc, content };
    this.runSearch();
    this.changed();
  }

  private runSearch() {
    if (this.loc?.kind !== "search") return;
    this.stopSearch();
    this.items = [];
    const id = `search-${++searchSeq}`;
    this.search = { id, running: true, scanned: 0, ms: 0, started: Date.now(), limited: false };
    this.host.registerSearch(id, this);
    const { root, query, content } = this.loc;
    this.host.bridge.search({ id, root, query, content }).catch((e: Error) => {
      this.host.reportError(e.message);
    });
    this.refreshView();
  }

  stopSearch() {
    const s = this.search;
    if (!s) return;
    if (s.running) {
      void this.host.bridge.cancelSearch(s.id).catch(() => {});
      s.running = false;
      s.ms = Date.now() - s.started;
    }
    this.host.registerSearch(s.id, null);
    this.changed();
  }

  onSearchResults(items: FsEntry[], scanned: number) {
    if (!this.search) return;
    this.search.scanned = scanned;
    if (items.length) {
      this.items = this.items.concat(items);
      this.refreshView(this.view[this.cursor]?.path);
    }
    this.changed();
  }

  onSearchDone(scanned: number, limited: boolean) {
    if (!this.search) return;
    this.search.running = false;
    this.search.scanned = scanned;
    this.search.limited = limited;
    this.search.ms = Date.now() - this.search.started;
    this.host.registerSearch(this.search.id, null);
    this.changed();
  }

  /** The folder an entry of the search results lives in, relative to the search root. */
  relativeFolder(entry: FsEntry): string {
    const parent = dirname(entry.path) ?? "";
    if (this.loc?.kind !== "search") return parent;
    const root = normalize(this.loc.root);
    if (parent.toLowerCase() === root.toLowerCase()) return ".";
    const prefix = isRoot(root) ? root : `${root}\\`;
    return parent.toLowerCase().startsWith(prefix.toLowerCase())
      ? parent.slice(prefix.length)
      : basename(parent);
  }

  dispose() {
    this.stopSearch();
    void this.host.bridge.watch(this.id, null).catch(() => {});
  }
}
