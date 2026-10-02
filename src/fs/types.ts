import type { Drive } from "@/explorer/sample";

/** A file or folder as the file-system layer reports it. */
export interface FsEntry {
  name: string;
  /** Absolute Windows path. */
  path: string;
  isDir: boolean;
  isLink: boolean;
  /** Bytes; `null` for folders. */
  size: number | null;
  /** Modified / created time in ms since the epoch. */
  mtime: number;
  ctime: number;
  /** Lower-case extension without the dot; "" for folders. */
  ext: string;
  /** Carries Windows' "hidden" attribute. */
  hidden: boolean;
}

/** A drive with the root path to open it. */
export interface FsDrive extends Drive {
  path: string;
}

export type PlaceId =
  "home" | "desktop" | "documents" | "downloads" | "pictures" | "music" | "videos";
export type Places = Partial<Record<PlaceId, string | null>>;

/** What to open at start; the same shape as the default-file-manager module's start path. */
export type StartTarget =
  | { kind: "home" }
  | { kind: "this-pc" }
  | { kind: "folder"; path: string }
  | { kind: "file"; path: string; folder: string }
  | { kind: "shell"; target: string }
  | { kind: "missing"; path: string };

/**
 * Whether Moon Explorer opens folders, drives, This PC and Win+E instead of Windows Explorer
 * (electron/default-file-manager, docs/default-file-manager.md).
 * - `stale`: registered, but for another copy of the app (moved, updated to another folder or deleted).
 * - `partial`: another program has taken over some of it since.
 */
export interface DefaultFileManagerStatus {
  state: "on" | "off" | "stale" | "partial" | "unsupported";
  enabled: boolean;
  needsAttention: boolean;
  registeredExe?: string | null;
  currentExe?: string;
  targets: { id: string; label: string; state: "on" | "off" | "stale" | "overridden" }[];
  /** After switching off: values another program changed since, which were left alone. */
  skipped?: { key: string; name: string }[];
}

export type TransferOp = "copy" | "move";
export type ConflictChoice = "replace" | "keep" | "skip";

export interface TaskUpdate {
  id: number;
  label: string;
  op: TransferOp | "delete";
  state: "scanning" | "running" | "done" | "error" | "cancelled";
  destDir?: string;
  doneBytes: number;
  totalBytes: number;
  doneFiles: number;
  totalFiles: number;
  current: string;
  error?: string;
  results?: { from: string; to?: string }[];
}

export interface TextPreview {
  text: string;
  truncated: boolean;
  binary: boolean;
  size: number;
}

export interface Checksums {
  sha256: string;
  sha1: string;
  md5: string;
}

export interface FolderSize {
  size: number;
  files: number;
  dirs: number;
}

export interface SearchRequest {
  id: string;
  root: string;
  query: string;
  /** Also look inside text files. */
  content: boolean;
}

export interface BridgeEvents {
  "task:update": TaskUpdate;
  "search:results": { id: string; items: FsEntry[]; scanned: number };
  "search:done": { id: string; count: number; scanned: number; limited: boolean };
  "fs:changed": { paneId: string; dir: string };
  "open-request": StartTarget;
}

/**
 * Everything the UI may ask of the desktop shell. electron/preload.cjs
 * implements it; src/fs/demo.ts is an in-memory stand-in for the browser
 * dev server and the tests.
 */
export interface MoonBridge {
  kind: "electron" | "demo";
  places(): Promise<Places>;
  drives(): Promise<FsDrive[]>;
  refreshDrives(): Promise<FsDrive[]>;
  env(): Promise<Record<string, string>>;
  takeStart(): Promise<StartTarget | null>;
  defaultFileManager(): Promise<DefaultFileManagerStatus>;
  /** Registers Moon Explorer (or repairs the registration), or gives everything back to Windows Explorer. */
  setDefaultFileManager(enabled: boolean): Promise<DefaultFileManagerStatus>;

  list(dir: string): Promise<FsEntry[]>;
  stat(path: string): Promise<FsEntry>;
  exists(path: string): Promise<boolean>;
  isDir(path: string): Promise<boolean>;
  subdirs(dir: string): Promise<string[]>;
  readText(path: string, max?: number): Promise<TextPreview>;
  thumbnail(path: string, size?: number): Promise<string | null>;
  systemIcon(path: string): Promise<string>;
  /** A URL the UI can load the file from (images, media, PDFs, fonts). */
  fileUrl(path: string): string;
  mkdir(dir: string, name: string): Promise<string>;
  createFile(dir: string, name: string): Promise<string>;
  rename(from: string, to: string): Promise<string>;
  conflicts(sources: string[], destDir: string): Promise<string[]>;
  transfer(opts: {
    op: TransferOp;
    sources: string[];
    destDir: string;
    conflict: ConflictChoice;
  }): Promise<number>;
  remove(opts: { paths: string[]; permanent: boolean }): Promise<number>;
  cancelTask(id: number): Promise<void>;
  dirSize(path: string): Promise<FolderSize>;
  /** Lower-case hex digests of a file's content, read once. */
  checksums(path: string): Promise<Checksums>;
  zip(sources: string[], dest: string): Promise<string>;
  unzip(archive: string, dest: string): Promise<string>;
  search(req: SearchRequest): Promise<void>;
  cancelSearch(id: string): Promise<void>;
  watch(paneId: string, dir: string | null): Promise<void>;

  open(path: string): Promise<void>;
  openWith(path: string): Promise<void>;
  reveal(path: string): Promise<void>;
  openInWindowsExplorer(target: string): Promise<void>;
  resolveLink(path: string): Promise<string | null>;
  terminal(dir: string): Promise<void>;
  properties(path: string): Promise<void>;

  copyText(text: string): Promise<void>;
  copyFilesToSystem(paths: string[]): Promise<void>;
  /** Files another app put on the clipboard; `null` when it still holds `knownFirst`'s set. */
  readSystemFiles(knownFirst?: string): Promise<string[] | null>;

  setTheme(theme: "dark" | "light"): Promise<void>;
  devtools(): Promise<void>;
  startDrag(paths: string[]): void;
  pathForFile(file: File): string;

  on<K extends keyof BridgeEvents>(event: K, fn: (data: BridgeEvents[K]) => void): () => void;
}
