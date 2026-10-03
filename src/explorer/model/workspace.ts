import { plural } from "@/fs/format";
import {
  basename,
  dirname,
  invalidNameReason,
  isInside,
  isRoot,
  join,
  samePath,
  stem,
} from "@/fs/paths";
import type {
  ConflictChoice,
  FolderSize,
  FsDrive,
  FsEntry,
  MoonBridge,
  PickerRequest,
  Places,
  StartTarget,
  TaskUpdate,
  TransferOp,
} from "@/fs/types";
import {
  filterEntries,
  PaneModel,
  type Location,
  type PaneHost,
  type Sort,
  type ViewMode,
} from "./pane";
import { Store } from "./store";

export const SETTINGS_KEY = "moonexplorer.settings";
export const ICON_SIZES = [48, 64, 80, 96, 128, 160, 200, 256] as const;

type SavedLocation = { kind: "this-pc" } | { kind: "dir"; path: string };

export interface Settings {
  viewMode: ViewMode;
  iconSize: number;
  sort: Sort;
  showHidden: boolean;
  showExtensions: boolean;
  folderSizes: boolean;
  preview: boolean;
  confirmDelete: boolean;
  restoreSession: boolean;
  favorites: string[];
  recent: string[];
  session: {
    active: number;
    tabs: { panes: SavedLocation[]; split: boolean; active: number; ratio: number }[];
  } | null;
}

export const DEFAULT_SETTINGS: Settings = {
  viewMode: "list",
  iconSize: 96,
  sort: { key: "name", dir: "asc" },
  showHidden: false,
  showExtensions: true,
  folderSizes: false,
  preview: true,
  confirmDelete: true,
  restoreSession: true,
  favorites: [],
  recent: [],
  session: null,
};

export function loadSettings(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...structuredClone(DEFAULT_SETTINGS), ...parsed };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export class Tab {
  private static seq = 0;
  readonly id = `tab-${++Tab.seq}`;
  panes: PaneModel[] = [];
  active = 0;
  split = false;
  ratio = 0.5;
  get activePane(): PaneModel {
    return this.panes[this.active] ?? this.panes[0];
  }
}

export type UndoEntry =
  | { type: "rename"; label: string; renames: { from: string; to: string }[] }
  | { type: "move" | "copy"; label: string; results: { from: string; to: string }[] }
  | { type: "create"; label: string; path: string }
  /** Several steps that undo together, last one first. */
  | { type: "group"; label: string; steps: UndoEntry[] };

export interface Toast {
  id: number;
  message: string;
  error?: boolean;
  action?: { label: string; run: () => void };
}

export type DialogRequest =
  | {
      type: "confirm";
      title: string;
      message: string;
      confirmLabel: string;
      danger?: boolean;
      resolve: (ok: boolean) => void;
    }
  | { type: "conflict"; names: string[]; resolve: (choice: ConflictChoice | null) => void }
  | {
      type: "prompt";
      title: string;
      label: string;
      value: string;
      confirmLabel: string;
      resolve: (value: string | null) => void;
    }
  | { type: "bulk-rename"; pane: PaneModel; entries: FsEntry[]; resolve: (ok: boolean) => void }
  | { type: "settings"; resolve: (ok: boolean) => void }
  | { type: "checksums"; entry: FsEntry; resolve: (ok: boolean) => void };

type WithoutResolve<T> = T extends unknown ? Omit<T, "resolve"> : never;
/** A dialog request before the workspace adds its `resolve`. */
export type DialogInput = WithoutResolve<DialogRequest>;

const PLACE_LABELS: Record<string, string> = {
  home: "Home",
  desktop: "Desktop",
  documents: "Documents",
  downloads: "Downloads",
  pictures: "Pictures",
  music: "Music",
  videos: "Videos",
};

/** Everything that spans panes: tabs, clipboard, undo, background tasks, dialogs, toasts and settings. */
export class Workspace extends Store implements PaneHost {
  settings: Settings;
  places: Places = {};
  drives: FsDrive[] = [];
  env: Record<string, string> = {};
  tabs: Tab[] = [];
  activeTab: Tab | null = null;
  clipboard: { mode: "copy" | "cut"; paths: string[] } | null = null;
  undoStack: UndoEntry[] = [];
  tasks = new Map<number, TaskUpdate>();
  folderSizes = new Map<string, FolderSize>();
  toasts: Toast[] = [];
  dialog: DialogRequest | null = null;
  ready = false;
  /** Set when Moon Explorer runs as an Open/Save dialog (electron/picker.cjs); null otherwise. */
  picker: PickerRequest | null = null;
  pickerName = "";
  pickerFilterIndex = 0;
  /** True while the drives' size and free space are being asked for again. */
  drivesRefreshing = false;

  private closedTabs: { panes: SavedLocation[]; split: boolean; active: number; at: number }[] = [];
  private searches = new Map<string, PaneModel>();
  private taskWaiters = new Map<number, (t: TaskUpdate) => void>();
  private sizePending = new Set<string>();
  private toastSeq = 0;
  private drivesRefresh: Promise<void> | null = null;
  private drivesRefreshedAt = 0;
  private lastSelectPattern = "*";
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribers: (() => void)[] = [];

  constructor(
    readonly bridge: MoonBridge,
    private storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage,
  ) {
    super();
    this.settings = loadSettings(storage);
  }

  get pane(): PaneModel | null {
    return this.activeTab?.activePane ?? null;
  }

  get showHidden() {
    return this.settings.showHidden;
  }

  allPanes(): PaneModel[] {
    return this.tabs.flatMap((t) => t.panes);
  }

  // ============================================================ start-up

  async init(): Promise<void> {
    const b = this.bridge;
    const [places, drives, env, start, pick] = await Promise.all([
      b.places(),
      b.drives().catch(() => []),
      b.env().catch(() => ({})),
      b.takeStart().catch(() => null),
      b.picker().catch(() => null),
    ]);
    this.places = places;
    this.drives = drives;
    this.drivesRefreshedAt = Date.now();
    this.env = env;
    this.unsubscribers.push(
      b.on("task:update", (t) => this.onTask(t)),
      b.on("search:results", (d) => this.searches.get(d.id)?.onSearchResults(d.items, d.scanned)),
      b.on("search:done", (d) => this.searches.get(d.id)?.onSearchDone(d.scanned, d.limited)),
      b.on(
        "fs:changed",
        ({ paneId }) =>
          void this.allPanes()
            .find((p) => p.id === paneId)
            ?.reload(),
      ),
      b.on("open-request", (s) => void this.openStart(s)),
    );
    if (pick) {
      // Open/Save dialog: one tab, no saved session, no restored tabs.
      this.picker = pick;
      this.pickerName = pick.suggestedName;
      const startDir = pick.startDir ?? this.places.downloads ?? this.places.home ?? null;
      await this.newTab(startDir ?? { kind: "this-pc" });
      this.ready = true;
      this.changed();
      return;
    }
    const session = this.settings.restoreSession ? this.settings.session : null;
    const explicit = start && start.kind !== "home";
    if (session?.tabs.length) {
      for (const t of session.tabs) await this.restoreTab(t);
      this.activateTab(this.tabs[Math.min(session.active, this.tabs.length - 1)] ?? null);
    }
    if (explicit || !this.tabs.length) await this.openStart(start ?? { kind: "home" });
    this.ready = true;
    this.changed();
  }

  dispose() {
    for (const off of this.unsubscribers) off();
    for (const p of this.allPanes()) p.dispose();
  }

  /** Opens what the command line or a second launch asked for, in a new tab. */
  async openStart(start: StartTarget): Promise<void> {
    switch (start.kind) {
      case "folder":
        await this.newTab(start.path);
        return;
      case "file": {
        const tab = await this.newTab(start.folder);
        tab.activePane.selectPaths([start.path]);
        return;
      }
      case "this-pc":
        await this.newTab({ kind: "this-pc" });
        return;
      case "shell":
        await this.bridge.openInWindowsExplorer(start.target);
        if (!this.tabs.length) await this.newTab({ kind: "this-pc" });
        return;
      case "missing":
        this.toast(`"${start.path}" was not found.`, { error: true });
        if (!this.tabs.length) await this.newTab(this.places.home ?? { kind: "this-pc" });
        return;
      default:
        await this.newTab(this.places.home ?? { kind: "this-pc" });
    }
  }

  // ============================================================ settings

  updateSettings(patch: Partial<Settings>) {
    const before = this.settings;
    this.settings = { ...this.settings, ...patch };
    if (patch.showHidden !== undefined && patch.showHidden !== before.showHidden) {
      for (const p of this.allPanes()) p.refreshView(p.view[p.cursor]?.path);
    }
    for (const p of this.allPanes()) p.touch();
    this.save();
    this.changed();
  }

  private save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 300);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    if (this.picker) return; // a dialog never changes the user's saved session

    const saved = (p: PaneModel): SavedLocation => {
      const l = p.loc;
      if (l?.kind === "dir") return { kind: "dir", path: l.path };
      if (l?.kind === "search") return { kind: "dir", path: l.root };
      return { kind: "this-pc" };
    };
    this.settings.session = {
      active: Math.max(0, this.activeTab ? this.tabs.indexOf(this.activeTab) : 0),
      tabs: this.tabs.map((t) => ({
        split: t.split,
        active: t.active,
        ratio: t.ratio,
        panes: t.panes.map(saved),
      })),
    };
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // A full or unavailable storage only loses preferences.
    }
  }

  // ============================================================ names

  /** The place ("documents", …) a folder is, if any. */
  placeOf(path: string): string | null {
    for (const [id, p] of Object.entries(this.places)) if (p && samePath(p, path)) return id;
    return null;
  }

  placeLabel(id: string): string {
    return PLACE_LABELS[id] ?? id;
  }

  driveFor(path: string): FsDrive | undefined {
    const letter = path.slice(0, 2).toUpperCase();
    return this.drives.find((d) => d.letter.toUpperCase() === letter);
  }

  driveLabel(drive: FsDrive): string {
    return `${drive.label} (${drive.letter})`;
  }

  displayName(path: string): string {
    if (isRoot(path)) {
      const d = this.driveFor(path);
      return d ? this.driveLabel(d) : path;
    }
    return basename(path);
  }

  // ============================================================ picker (Open/Save dialog)

  setPickerName(name: string) {
    this.pickerName = name;
    this.changed();
  }

  setPickerFilterIndex(index: number) {
    this.pickerFilterIndex = index;
    this.changed();
  }

  pickerFilter(): { label: string; extensions: string[] } | null {
    return this.picker?.filters[this.pickerFilterIndex] ?? null;
  }

  /** Adds the filter's default extension to a save name that has none. */
  private applyExtension(name: string): string {
    const ext = this.pickerFilter()?.extensions[0];
    if (!ext || ext === "*") return name;
    return /\.[^\\/.]+$/.test(name) ? name : `${name}.${ext}`;
  }

  pickerCanConfirm(): boolean {
    const pane = this.pane;
    if (!this.picker || !pane) return false;
    if (this.picker.mode === "folder") return !!pane.workDir;
    if (this.picker.mode === "open") {
      const sel = pane.selected();
      return sel.length === 1 && !sel[0].isDir;
    }
    return this.pickerName.trim().length > 0 && !!pane.workDir;
  }

  async confirmPicker(): Promise<void> {
    const pane = this.pane;
    if (!this.picker || !pane) return;
    const dir = pane.workDir;
    if (this.picker.mode === "folder") {
      if (dir) await this.bridge.resolvePicker(dir);
      return;
    }
    if (this.picker.mode === "open") {
      const sel = pane.selected();
      const file = sel.length === 1 && !sel[0].isDir ? sel[0] : null;
      if (file) await this.bridge.resolvePicker(file.path);
      return;
    }
    if (!dir) return;
    const name = this.applyExtension(this.pickerName.trim());
    const bad = invalidNameReason(name);
    if (bad) {
      this.toast(bad, { error: true });
      return;
    }
    const full = join(dir, name);
    if (await this.bridge.exists(full)) {
      const ok = await this.confirm(
        "Replace file?",
        `"${name}" already exists in this folder. Replace it?`,
        "Replace",
        true,
      );
      if (!ok) return;
    }
    await this.bridge.resolvePicker(full);
  }

  cancelPicker() {
    void this.bridge.resolvePicker(null);
  }

  // ============================================================ PaneHost

  private makePane(tab: Tab): PaneModel {
    const s = this.settings;
    const pane = new PaneModel(this, { sort: s.sort, mode: s.viewMode, iconSize: s.iconSize });
    tab.panes.push(pane);
    return pane;
  }

  onNavigate(pane: PaneModel) {
    if (pane.loc?.kind === "dir") {
      const path = pane.loc.path;
      this.settings.recent = [
        path,
        ...this.settings.recent.filter((p) => !samePath(p, path)),
      ].slice(0, 30);
    }
    this.save();
    this.changed();
  }

  onSelection(pane: PaneModel) {
    if (this.picker?.mode === "save" && pane === this.pane) {
      const sel = pane.selected();
      const file = sel.length === 1 && !sel[0].isDir ? sel[0] : null;
      if (file) this.pickerName = file.name;
    }
    if (pane === this.pane) this.changed();
  }

  registerSearch(id: string, pane: PaneModel | null) {
    if (pane) this.searches.set(id, pane);
    else this.searches.delete(id);
  }

  reportError(message: string) {
    this.toast(message, { error: true });
  }

  // ============================================================ tabs and panes

  async newTab(loc: Location | string, { background = false } = {}): Promise<Tab> {
    const tab = new Tab();
    const pane = this.makePane(tab);
    const at = this.activeTab ? this.tabs.indexOf(this.activeTab) + 1 : this.tabs.length;
    this.tabs.splice(at, 0, tab);
    if (!background || !this.activeTab) this.activeTab = tab;
    this.changed();
    if (!(await pane.go(loc))) await pane.go({ kind: "this-pc" });
    return tab;
  }

  private async restoreTab(t: {
    panes: SavedLocation[];
    split: boolean;
    active: number;
    ratio?: number;
  }) {
    const tab = new Tab();
    tab.split = t.split && t.panes.length > 1;
    tab.ratio = t.ratio ?? 0.5;
    this.tabs.push(tab);
    for (const loc of t.panes.slice(0, tab.split ? 2 : 1)) {
      const pane = this.makePane(tab);
      const target: Location =
        loc.kind === "dir" ? { kind: "dir", path: loc.path } : { kind: "this-pc" };
      if (!(await pane.go(target))) await pane.go({ kind: "this-pc" });
    }
    tab.active = Math.min(t.active, tab.panes.length - 1);
    return tab;
  }

  activateTab(tab: Tab | null) {
    if (!tab) return;
    this.activeTab = tab;
    this.save();
    this.changed();
  }

  closeTab(tab: Tab | null = this.activeTab): boolean {
    if (!tab) return false;
    const idx = this.tabs.indexOf(tab);
    if (idx < 0) return false;
    if (this.tabs.length === 1) {
      this.saveNow();
      window.close();
      return false;
    }
    this.closedTabs.push({
      split: tab.split,
      active: tab.active,
      at: idx,
      panes: tab.panes.map((p) =>
        p.loc?.kind === "dir" ? { kind: "dir", path: p.loc.path } : { kind: "this-pc" },
      ),
    });
    for (const p of tab.panes) p.dispose();
    this.tabs.splice(idx, 1);
    if (this.activeTab === tab) this.activeTab = this.tabs[Math.min(idx, this.tabs.length - 1)];
    this.save();
    this.changed();
    return true;
  }

  get canReopenTab() {
    return this.closedTabs.length > 0;
  }

  async reopenTab() {
    const t = this.closedTabs.pop();
    if (!t) return;
    const tab = await this.restoreTab(t);
    this.tabs.splice(this.tabs.indexOf(tab), 1);
    this.tabs.splice(Math.min(t.at, this.tabs.length), 0, tab);
    this.activateTab(tab);
  }

  cycleTab(step: number) {
    if (!this.activeTab || this.tabs.length < 2) return;
    const i = this.tabs.indexOf(this.activeTab);
    this.activateTab(this.tabs[(i + step + this.tabs.length) % this.tabs.length]);
  }

  moveTab(tab: Tab, to: number) {
    const from = this.tabs.indexOf(tab);
    if (from < 0 || from === to) return;
    this.tabs.splice(from, 1);
    this.tabs.splice(Math.max(0, Math.min(this.tabs.length, to)), 0, tab);
    this.save();
    this.changed();
  }

  toggleSplit() {
    const tab = this.activeTab;
    if (!tab) return;
    if (tab.split) {
      const keep = tab.activePane;
      for (const p of tab.panes) if (p !== keep) p.dispose();
      tab.panes = [keep];
      tab.active = 0;
      tab.split = false;
    } else {
      const pane = this.makePane(tab);
      tab.split = true;
      tab.active = 1;
      void pane.go(tab.panes[0].loc ?? { kind: "this-pc" });
    }
    this.save();
    this.changed();
  }

  setActivePane(pane: PaneModel) {
    const tab = this.tabs.find((t) => t.panes.includes(pane));
    if (!tab) return;
    const i = tab.panes.indexOf(pane);
    if (tab.active === i && this.activeTab === tab) return;
    tab.active = i;
    this.activeTab = tab;
    this.changed();
  }

  setSplitRatio(ratio: number) {
    if (!this.activeTab) return;
    this.activeTab.ratio = Math.min(0.8, Math.max(0.2, ratio));
    this.save();
    this.changed();
  }

  otherPane(pane: PaneModel): PaneModel | null {
    const tab = this.tabs.find((t) => t.panes.includes(pane));
    return tab?.split ? (tab.panes.find((p) => p !== pane) ?? null) : null;
  }

  // ============================================================ toasts and dialogs

  toast(
    message: string,
    opts: { error?: boolean; action?: Toast["action"]; timeout?: number } = {},
  ) {
    const t: Toast = { id: ++this.toastSeq, message, error: opts.error, action: opts.action };
    this.toasts = [...this.toasts, t].slice(-3);
    this.changed();
    setTimeout(() => this.dismissToast(t.id), opts.timeout ?? (opts.error ? 6000 : 4000));
  }

  dismissToast(id: number) {
    if (!this.toasts.some((t) => t.id === id)) return;
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.changed();
  }

  /** Shows a dialog and waits for its answer. */
  ask<T>(request: DialogInput): Promise<T> {
    return new Promise<T>((resolve) => {
      this.dialog = {
        ...request,
        resolve: (value: T) => {
          this.dialog = null;
          this.changed();
          resolve(value);
        },
      } as unknown as DialogRequest;
      this.changed();
    });
  }

  confirm(title: string, message: string, confirmLabel: string, danger = false): Promise<boolean> {
    return this.ask<boolean>({ type: "confirm", title, message, confirmLabel, danger });
  }

  prompt(title: string, label: string, value: string, confirmLabel = "OK"): Promise<string | null> {
    return this.ask<string | null>({ type: "prompt", title, label, value, confirmLabel });
  }

  // ============================================================ background tasks

  private onTask(t: TaskUpdate) {
    this.tasks.set(t.id, t);
    if (t.state === "done" || t.state === "error" || t.state === "cancelled") {
      if (t.state === "error") this.toast(t.error ?? "Something went wrong.", { error: true });
      else if (t.state === "cancelled") this.toast("Cancelled.");
      else if (t.error) this.toast(t.error, { error: true });
      // Copying, moving and deleting change how much space is free.
      this.refreshDrivesSoon(2_000);
      const dirs = [
        t.destDir,
        ...(t.results ?? []).flatMap((r) => [dirname(r.from), r.to ? dirname(r.to) : null]),
      ];
      this.reloadPanesShowing(dirs);
      this.taskWaiters.get(t.id)?.(t);
      this.taskWaiters.delete(t.id);
      setTimeout(() => {
        this.tasks.delete(t.id);
        this.changed();
      }, 3000);
    }
    this.changed();
  }

  /** Resolves when the task has finished (also if it already has). */
  waitForTask(id: number): Promise<TaskUpdate> {
    const t = this.tasks.get(id);
    if (t && (t.state === "done" || t.state === "error" || t.state === "cancelled"))
      return Promise.resolve(t);
    return new Promise((resolve) => this.taskWaiters.set(id, resolve));
  }

  activeTasks(): TaskUpdate[] {
    return [...this.tasks.values()].filter((t) => t.state === "running" || t.state === "scanning");
  }

  cancelTask(id: number) {
    void this.bridge.cancelTask(id);
  }

  reloadPanesShowing(dirs: (string | null | undefined)[]) {
    const list = dirs.filter((d): d is string => !!d);
    for (const p of this.allPanes()) {
      if (p.path && list.some((d) => samePath(d, p.path))) void p.reload();
    }
  }

  // ============================================================ opening

  async openEntries(pane: PaneModel, entries: FsEntry[], { newTab = false } = {}) {
    if (this.picker?.mode === "open" && entries.length === 1 && !entries[0].isDir) {
      await this.bridge.resolvePicker(entries[0].path);
      return;
    }
    const dirs = entries.filter((e) => e.isDir);
    const files = entries.filter((e) => !e.isDir);
    if (dirs.length === 1 && !files.length && !newTab) {
      await pane.go(dirs[0].path);
      return;
    }
    for (const d of dirs) await this.newTab(d.path, { background: true });
    if (
      files.length > 12 &&
      !(await this.confirm("Open many files?", `Open ${files.length} files at once?`, "Open"))
    ) {
      return;
    }
    for (const f of files) {
      if (f.ext === "lnk") {
        const target = await this.bridge.resolveLink(f.path).catch(() => null);
        if (target && (await this.bridge.isDir(target))) {
          await pane.go(target);
          continue;
        }
      }
      this.bridge
        .open(f.path)
        .catch((e: Error) => this.toast(`Can't open "${f.name}": ${e.message}`, { error: true }));
    }
  }

  // ============================================================ clipboard

  isCut(path: string): boolean {
    return this.clipboard?.mode === "cut" && this.clipboard.paths.includes(path);
  }

  setClipboard(mode: "copy" | "cut", entries: FsEntry[]) {
    if (!entries.length) return;
    const paths = entries.map((e) => e.path);
    this.clipboard = { mode, paths };
    // Also on the Windows clipboard, so the files can be pasted in other apps.
    void this.bridge.copyFilesToSystem(paths).catch(() => {});
    for (const p of this.allPanes()) p.touch();
    this.toast(`${mode === "cut" ? "Cut" : "Copied"} ${plural(paths.length, "item")}`, {
      timeout: 2000,
    });
    this.changed();
  }

  async paste(destDir: string | null) {
    if (!destDir) return;
    let source = this.clipboard;
    const fromSystem = await this.bridge
      .readSystemFiles(source?.paths[0])
      .catch(() => [] as string[]);
    if (fromSystem?.length) source = { mode: "copy", paths: fromSystem };
    if (!source?.paths.length) {
      this.toast("There are no files on the clipboard.");
      return;
    }
    const task = await this.transfer(
      source.mode === "cut" ? "move" : "copy",
      source.paths,
      destDir,
    );
    if (task && source === this.clipboard && source.mode === "cut") {
      this.clipboard = null;
      for (const p of this.allPanes()) p.touch();
    }
  }

  // ============================================================ file operations

  /** Copies or moves `sources` into `destDir`, asking about name conflicts first. */
  async transfer(op: TransferOp, sources: string[], destDir: string): Promise<TaskUpdate | null> {
    let list = sources.filter((s) => !samePath(s, destDir));
    if (op === "move") list = list.filter((s) => !samePath(dirname(s), destDir));
    if (!list.length) return null;
    const bad = list.find((s) => isInside(destDir, s));
    if (bad) {
      this.toast(`"${basename(bad)}" can't be ${op === "move" ? "moved" : "copied"} into itself.`, {
        error: true,
      });
      return null;
    }
    let conflict: ConflictChoice = "keep";
    const names = await this.bridge.conflicts(list, destDir).catch(() => []);
    if (names.length) {
      const choice = await this.ask<ConflictChoice | null>({ type: "conflict", names });
      if (!choice) return null;
      conflict = choice;
    }
    try {
      const id = await this.bridge.transfer({ op, sources: list, destDir, conflict });
      const t = await this.waitForTask(id);
      const results = (t.results ?? []).filter((r): r is { from: string; to: string } => !!r.to);
      if (t.state === "done" && results.length) {
        this.pushUndo({ type: op, label: op === "move" ? "Move" : "Copy", results });
        const target = this.activeTab?.panes.find((p) => samePath(p.path, destDir));
        if (target) {
          await target.reload();
          target.selectPaths(results.map((r) => r.to));
        } else {
          this.toast(
            `${op === "move" ? "Moved" : "Copied"} ${plural(results.length, "item")} to "${this.displayName(destDir)}"`,
            {
              action: { label: "Undo", run: () => void this.undo() },
            },
          );
        }
      }
      return t;
    } catch (e) {
      this.toast((e as Error).message, { error: true });
      return null;
    }
  }

  async trash(pane: PaneModel, permanent = false) {
    const entries = pane.selected();
    if (!entries.length) return;
    const what = entries.length === 1 ? `"${entries[0].name}"` : `these ${entries.length} items`;
    if (permanent) {
      const ok = await this.confirm(
        "Delete permanently?",
        `Delete ${what} permanently? This can't be undone.`,
        "Delete permanently",
        true,
      );
      if (!ok) return;
    } else if (this.settings.confirmDelete && entries.length > 1) {
      if (
        !(await this.confirm(
          "Move to the Recycle Bin?",
          `Move ${what} to the Recycle Bin?`,
          "Move to Recycle Bin",
          true,
        ))
      )
        return;
    }
    const next = Math.min(...entries.map((e) => pane.index.get(e.path) ?? 0));
    try {
      const id = await this.bridge.remove({ paths: entries.map((e) => e.path), permanent });
      const t = await this.waitForTask(id);
      await pane.reload();
      if (pane.view.length) pane.selectOnly(Math.min(next, pane.view.length - 1));
      const n = t.results?.length ?? 0;
      if (t.state === "done" && n) {
        this.toast(`${permanent ? "Deleted" : "Moved to the Recycle Bin:"} ${plural(n, "item")}`);
      }
    } catch (e) {
      this.toast((e as Error).message, { error: true });
    }
  }

  async renamePath(path: string, newName: string, pane?: PaneModel): Promise<boolean> {
    const reason = invalidNameReason(newName);
    if (reason) {
      this.toast(reason, { error: true });
      return false;
    }
    const parent = dirname(path);
    if (!parent) return false;
    const to = join(parent, newName);
    try {
      await this.bridge.rename(path, to);
      this.pushUndo({ type: "rename", label: "Rename", renames: [{ from: path, to }] });
      const size = this.folderSizes.get(path);
      if (size) this.folderSizes.set(to, size);
      if (pane) {
        await pane.reload();
        pane.selectPaths([to]);
      }
      return true;
    } catch (e) {
      this.toast(`Couldn't rename: ${(e as Error).message}`, { error: true });
      return false;
    }
  }

  /** Renames several entries at once; goes through temporary names so swaps (a→b, b→a) work. */
  async renameMany(pane: PaneModel, renames: { from: string; to: string }[]): Promise<boolean> {
    const done: { from: string; to: string }[] = [];
    try {
      const temps: { from: string; tmp: string; to: string }[] = [];
      for (const r of renames) {
        const tmp = join(dirname(r.from) ?? "", `.moon-rename-${Date.now()}-${temps.length}`);
        await this.bridge.rename(r.from, tmp);
        temps.push({ ...r, tmp });
      }
      for (const t of temps) {
        await this.bridge.rename(t.tmp, t.to);
        done.push({ from: t.from, to: t.to });
      }
    } catch (e) {
      this.toast(`Couldn't rename: ${(e as Error).message}`, { error: true });
    }
    if (done.length) {
      this.pushUndo({
        type: "rename",
        label: `Rename ${plural(done.length, "item")}`,
        renames: done,
      });
      this.toast(`Renamed ${plural(done.length, "item")}`, {
        action: { label: "Undo", run: () => void this.undo() },
      });
    }
    await pane.reload();
    pane.selectPaths(done.map((r) => r.to));
    return done.length === renames.length;
  }

  async newFolder(pane: PaneModel) {
    const dir = pane.path;
    if (!dir) return;
    try {
      const p = await this.bridge.mkdir(dir, "New folder");
      this.pushUndo({ type: "create", label: "New folder", path: p });
      await pane.reload();
      pane.selectPaths([p]);
      pane.setRenaming(p);
    } catch (e) {
      this.toast((e as Error).message, { error: true });
    }
  }

  async newFile(pane: PaneModel, name: string, rename = true) {
    const dir = pane.path;
    if (!dir) return;
    try {
      const p = await this.bridge.createFile(dir, name);
      this.pushUndo({ type: "create", label: "New file", path: p });
      await pane.reload();
      pane.selectPaths([p]);
      if (rename) pane.setRenaming(p);
    } catch (e) {
      this.toast((e as Error).message, { error: true });
    }
  }

  async zip(pane: PaneModel, entries = pane.selected()) {
    if (!entries.length) return;
    const dir = dirname(entries[0].path);
    if (!dir) return;
    const base =
      entries.length === 1
        ? entries[0].isDir
          ? entries[0].name
          : stem(entries[0].name)
        : basename(dir) || "Archive";
    let name = `${base}.zip`;
    for (let n = 2; await this.bridge.exists(join(dir, name)); n++) name = `${base} (${n}).zip`;
    const dest = join(dir, name);
    this.toast(`Compressing to "${name}"…`, { timeout: 2000 });
    try {
      await this.bridge.zip(
        entries.map((e) => e.path),
        dest,
      );
      this.pushUndo({ type: "create", label: "Compress", path: dest });
      await pane.reload();
      pane.selectPaths([dest]);
      this.toast(`Created "${name}"`);
    } catch (e) {
      this.toast(`Couldn't compress: ${(e as Error).message}`, { error: true });
    }
  }

  async extract(pane: PaneModel, entry: FsEntry, intoFolder = true) {
    const dir = dirname(entry.path);
    if (!dir) return;
    let dest = dir;
    if (intoFolder) {
      const base = stem(entry.name).replace(/\.tar$/i, "");
      let name = base;
      for (let n = 2; await this.bridge.exists(join(dir, name)); n++) name = `${base} (${n})`;
      dest = join(dir, name);
    }
    this.toast(`Extracting "${entry.name}"…`, { timeout: 2000 });
    try {
      await this.bridge.unzip(entry.path, dest);
      if (intoFolder) this.pushUndo({ type: "create", label: "Extract", path: dest });
      await pane.reload();
      if (intoFolder) pane.selectPaths([dest]);
      this.toast(`Extracted "${entry.name}"`);
    } catch (e) {
      this.toast(`Couldn't extract: ${(e as Error).message}`, { error: true });
    }
  }

  copyPaths(paths: string[]) {
    if (!paths.length) return;
    void this.bridge.copyText(paths.join("\r\n"));
    this.toast(paths.length === 1 ? "Copied the path" : `Copied ${paths.length} paths`, {
      timeout: 1800,
    });
  }

  copyNames(entries: FsEntry[]) {
    if (!entries.length) return;
    void this.bridge.copyText(entries.map((e) => e.name).join("\r\n"));
    this.toast(entries.length === 1 ? "Copied the name" : `Copied ${entries.length} names`, {
      timeout: 1800,
    });
  }

  /**
   * Selects the entries whose names match a pattern: wildcards like `*.jpg` or `IMG_2026*`, or
   * words like the filter box. Several patterns are separated by `;`.
   */
  async selectByPattern(pane: PaneModel) {
    const input = await this.prompt(
      "Select by pattern",
      "Names like *.jpg or IMG_2026*; separate several patterns with ;",
      this.lastSelectPattern,
      "Select",
    );
    const patterns = (input ?? "")
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    if (!input || !patterns.length) return;
    this.lastSelectPattern = input;
    const hits = new Set(patterns.flatMap((p) => filterEntries(pane.view, p).map((e) => e.path)));
    if (!hits.size) {
      this.toast(`Nothing here matches "${input}".`, { timeout: 2400 });
      return;
    }
    pane.selectPaths([...hits]);
    this.toast(`Selected ${plural(hits.size, "item")}`, { timeout: 1800 });
  }

  /** Makes a new folder next to the selection and moves the selection into it. */
  async newFolderWithSelection(pane: PaneModel, entries = pane.selected()) {
    const dir = pane.path;
    if (!dir || !entries.length) return;
    const suggestion =
      entries.length === 1
        ? entries[0].isDir
          ? `${entries[0].name} folder`
          : stem(entries[0].name)
        : "New folder";
    const name = await this.prompt(
      "New folder with selection",
      `Folder name for ${entries.length === 1 ? `"${entries[0].name}"` : plural(entries.length, "item")}`,
      suggestion,
      "Create and move",
    );
    if (!name?.trim()) return;
    const bad = invalidNameReason(name.trim());
    if (bad) {
      this.toast(bad, { error: true });
      return;
    }
    let folder: string;
    try {
      folder = await this.bridge.mkdir(dir, name.trim());
    } catch (e) {
      this.toast((e as Error).message, { error: true });
      return;
    }
    const before = this.undoStack.length;
    const t = await this.transfer(
      "move",
      entries.map((e) => e.path),
      folder,
    );
    const create: UndoEntry = { type: "create", label: "New folder", path: folder };
    if (t?.state === "done") {
      // One undo step: move everything back, then remove the folder.
      const moved = this.undoStack.length > before ? this.undoStack.splice(before) : [];
      this.pushUndo({
        type: "group",
        label: "New folder with selection",
        steps: [create, ...moved],
      });
    } else {
      this.pushUndo(create);
    }
    await pane.reload();
    pane.selectPaths([folder]);
  }

  /** Shows SHA-256, SHA-1 and MD5 of a file, with a field to compare against a published value. */
  showChecksums(entry: FsEntry) {
    if (!entry.isDir) void this.ask<boolean>({ type: "checksums", entry });
  }

  /** Folder sizes for the size column: computed in the background, two at a time. */
  folderSize(path: string): FolderSize | undefined {
    const known = this.folderSizes.get(path);
    if (known || this.sizePending.has(path)) return known;
    this.sizePending.add(path);
    const run = async () => {
      try {
        this.folderSizes.set(path, await this.bridge.dirSize(path));
      } catch {
        // Unreadable folders just show no size.
      }
      this.sizePending.delete(path);
      for (const p of this.allPanes()) if (p.view.some((e) => e.path === path)) p.touch();
      this.changed();
    };
    this.sizeQueue = this.sizeQueue.then(run, run);
    return undefined;
  }
  private sizeQueue: Promise<void> = Promise.resolve();

  async calcSizes(entries: FsEntry[]) {
    const dirs = entries.filter((e) => e.isDir);
    for (const d of dirs) this.folderSizes.delete(d.path);
    await Promise.all(
      dirs.map(async (d) => {
        const r = await this.bridge.dirSize(d.path).catch(() => null);
        if (r) this.folderSizes.set(d.path, r);
      }),
    );
    for (const p of this.allPanes()) p.touch();
    this.changed();
  }

  // ============================================================ undo

  pushUndo(entry: UndoEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.changed();
  }

  async undo() {
    const e = this.undoStack.pop();
    this.changed();
    if (!e) {
      this.toast("Nothing to undo.", { timeout: 1800 });
      return;
    }
    try {
      await this.undoEntry(e);
      this.toast(`Undone: ${e.label}`, { timeout: 2200 });
    } catch (err) {
      this.toast(`Couldn't undo: ${(err as Error).message}`, { error: true });
    }
  }

  private async undoEntry(e: UndoEntry): Promise<void> {
    if (e.type === "rename") {
      for (const r of e.renames.slice().reverse()) await this.bridge.rename(r.to, r.from);
      this.reloadPanesShowing(e.renames.map((r) => dirname(r.from)));
    } else if (e.type === "move") {
      const failed: { from: string; to: string }[] = [];
      for (const r of e.results.slice().reverse()) {
        try {
          await this.bridge.rename(r.to, r.from);
        } catch {
          failed.push(r);
        }
      }
      // Across drives a rename fails; move those back with a normal task.
      const byDir = new Map<string, string[]>();
      for (const r of failed) {
        const d = dirname(r.from) ?? "";
        byDir.set(d, [...(byDir.get(d) ?? []), r.to]);
      }
      for (const [d, list] of byDir) {
        await this.waitForTask(
          await this.bridge.transfer({ op: "move", sources: list, destDir: d, conflict: "keep" }),
        );
      }
      this.reloadPanesShowing(e.results.flatMap((r) => [dirname(r.from), dirname(r.to)]));
    } else if (e.type === "copy") {
      await this.waitForTask(
        await this.bridge.remove({ paths: e.results.map((r) => r.to), permanent: false }),
      );
    } else if (e.type === "group") {
      for (const step of e.steps.slice().reverse()) await this.undoEntry(step);
    } else if (e.type === "create") {
      await this.waitForTask(await this.bridge.remove({ paths: [e.path], permanent: false }));
    }
  }

  // ============================================================ drag and drop

  private dragSource: { paths: string[]; at: number } | null = null;

  startDrag(paths: string[]) {
    this.dragSource = { paths, at: Date.now() };
    this.bridge.startDrag(paths);
  }

  /**
   * Like Windows Explorer: Ctrl copies, Shift moves; otherwise our own drags move on the same
   * drive. Drags from other apps copy, because their paths are only known on drop.
   */
  dropEffect(e: { ctrlKey: boolean; shiftKey: boolean }, destDir: string): "copy" | "move" {
    if (e.ctrlKey) return "copy";
    if (e.shiftKey) return "move";
    const src =
      this.dragSource && Date.now() - this.dragSource.at < 60_000 ? this.dragSource.paths[0] : null;
    if (!src) return "copy";
    return src.slice(0, 2).toLowerCase() === destDir.slice(0, 2).toLowerCase() ? "move" : "copy";
  }

  async drop(files: File[], e: { ctrlKey: boolean; shiftKey: boolean }, destDir: string) {
    const op = this.dropEffect(e, destDir);
    this.dragSource = null;
    const paths = files.map((f) => this.bridge.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    if (op === "move" && paths.every((p) => samePath(dirname(p), destDir))) return;
    await this.transfer(op, paths, destDir);
  }

  // ============================================================ favorites and drives

  isFavorite(path: string) {
    return this.settings.favorites.some((f) => samePath(f, path));
  }

  addFavorite(path: string) {
    if (this.isFavorite(path)) return;
    this.updateSettings({ favorites: [...this.settings.favorites, path] });
    this.toast(`Pinned "${this.displayName(path)}"`);
  }

  removeFavorite(path: string) {
    this.updateSettings({ favorites: this.settings.favorites.filter((f) => !samePath(f, path)) });
  }

  /** Asks for the drives' size and free space again; calls while one is running share it. */
  refreshDrives(): Promise<void> {
    this.drivesRefresh ??= (async () => {
      this.drivesRefreshing = true;
      this.changed();
      try {
        this.drives = await this.bridge.refreshDrives().catch(() => this.drives);
      } finally {
        this.drivesRefreshedAt = Date.now();
        this.drivesRefreshing = false;
        this.drivesRefresh = null;
        this.changed();
      }
    })();
    return this.drivesRefresh;
  }

  /** Refreshes the drives unless that happened less than `minGap` ms ago (focus, timers, tasks). */
  refreshDrivesSoon(minGap = 15_000) {
    if (Date.now() - this.drivesRefreshedAt >= minGap) void this.refreshDrives();
  }
}
