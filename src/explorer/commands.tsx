import type { ReactNode } from "react";
import { stem } from "@/fs/paths";
import type { FsEntry } from "@/fs/types";
import {
  ArchiveIcon,
  ComputerIcon,
  DiskIcon,
  EditIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  ListIcon,
  PlusIcon,
  ReloadIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
  UpIcon,
} from "@/theme/icons";
import { cleanMenu, type MenuEntry } from "@/ui/menu";
import { ICON_SIZES, type Workspace } from "./model/workspace";
import type { PaneModel } from "./model/pane";

/** Asks the pane's path bar to switch to its text field. */
export function editPath(pane: PaneModel) {
  window.dispatchEvent(new CustomEvent("moon:edit-path", { detail: pane.id }));
}

export function focusSearch(pane: PaneModel) {
  document.querySelector<HTMLInputElement>(`[data-pane-search="${pane.id}"]`)?.focus();
}

export function focusList(pane: PaneModel) {
  document.querySelector<HTMLElement>(`[data-pane-list="${pane.id}"]`)?.focus();
}

export function openSettings(ws: Workspace) {
  void ws.ask<boolean>({ type: "settings" });
}

export function bulkRename(ws: Workspace, pane: PaneModel, entries = pane.selected()) {
  if (entries.length) void ws.ask<boolean>({ type: "bulk-rename", pane, entries });
}

/** F2: rename one in place, several with the bulk-rename dialog. */
export function rename(ws: Workspace, pane: PaneModel) {
  const entries = pane.selected();
  if (entries.length === 1) pane.setRenaming(entries[0].path);
  else bulkRename(ws, pane, entries);
}

export async function newFileWithName(ws: Workspace, pane: PaneModel) {
  const name = await ws.prompt("New file", "File name with extension", "New file.txt", "Create");
  if (name) await ws.newFile(pane, name, false);
}

export function zoom(ws: Workspace, pane: PaneModel, step: number) {
  if (pane.mode === "list") {
    if (step > 0) {
      pane.setMode("grid");
      pane.setIconSize(ICON_SIZES[0]);
      ws.updateSettings({ viewMode: "grid", iconSize: ICON_SIZES[0] });
    }
    return;
  }
  const i = ICON_SIZES.indexOf(pane.iconSize as (typeof ICON_SIZES)[number]);
  const next = (i < 0 ? 3 : i) + step;
  if (next < 0) {
    pane.setMode("list");
    ws.updateSettings({ viewMode: "list" });
    return;
  }
  const size = ICON_SIZES[Math.min(ICON_SIZES.length - 1, next)];
  pane.setIconSize(size);
  ws.updateSettings({ iconSize: size });
}

export function setView(ws: Workspace, pane: PaneModel, mode: "list" | "grid") {
  pane.setMode(mode);
  ws.updateSettings({ viewMode: mode });
}

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ReactNode;
  run: () => void;
}

/** Every command that makes sense right now; the palette lists these. */
export function commands(ws: Workspace, onQuickLook: () => void): Command[] {
  const pane = ws.pane;
  if (!pane) return [];
  const sel = pane.selected();
  const dir = pane.path;
  const work = pane.workDir;
  const all: (Command | false)[] = [
    {
      id: "new-tab",
      label: "New tab",
      shortcut: "Ctrl+T",
      icon: <PlusIcon size={15} />,
      run: () => void ws.newTab(work ?? { kind: "this-pc" }),
    },
    { id: "close-tab", label: "Close tab", shortcut: "Ctrl+W", run: () => ws.closeTab() },
    ws.canReopenTab && {
      id: "reopen-tab",
      label: "Reopen closed tab",
      shortcut: "Ctrl+Shift+T",
      run: () => void ws.reopenTab(),
    },
    {
      id: "split",
      label: ws.activeTab?.split ? "Close the second pane" : "Two panes side by side",
      shortcut: "F9",
      run: () => ws.toggleSplit(),
    },
    {
      id: "this-pc",
      label: "Go to This PC",
      icon: <ComputerIcon size={15} />,
      run: () => void pane.go({ kind: "this-pc" }),
    },
    {
      id: "up",
      label: "Go up",
      shortcut: "Alt+Up",
      icon: <UpIcon size={15} />,
      run: () => pane.up(),
    },
    {
      id: "refresh",
      label: "Refresh",
      shortcut: "F5",
      icon: <ReloadIcon size={15} />,
      run: () => void pane.reload(),
    },
    !!dir && {
      id: "new-folder",
      label: "New folder",
      shortcut: "Ctrl+Shift+N",
      icon: <FolderIcon size={15} />,
      run: () => void ws.newFolder(pane),
    },
    !!dir && {
      id: "new-text",
      label: "New text document",
      icon: <FileIcon size={15} />,
      run: () => void ws.newFile(pane, "New text document.txt"),
    },
    !!dir && {
      id: "new-file",
      label: "New file…",
      icon: <FileIcon size={15} />,
      run: () => void newFileWithName(ws, pane),
    },
    sel.length > 0 && {
      id: "cut",
      label: "Cut",
      shortcut: "Ctrl+X",
      run: () => ws.setClipboard("cut", sel),
    },
    sel.length > 0 && {
      id: "copy",
      label: "Copy",
      shortcut: "Ctrl+C",
      run: () => ws.setClipboard("copy", sel),
    },
    !!work && { id: "paste", label: "Paste", shortcut: "Ctrl+V", run: () => void ws.paste(work) },
    sel.length > 0 && {
      id: "rename",
      label: sel.length > 1 ? "Rename…" : "Rename",
      shortcut: "F2",
      icon: <EditIcon size={15} />,
      run: () => rename(ws, pane),
    },
    sel.length > 0 && {
      id: "zip",
      label: "Compress to ZIP",
      icon: <ArchiveIcon size={15} />,
      run: () => void ws.zip(pane),
    },
    sel.length > 0 && {
      id: "trash",
      label: "Move to Recycle Bin",
      shortcut: "Del",
      run: () => void ws.trash(pane),
    },
    sel.length > 0 && {
      id: "delete",
      label: "Delete permanently",
      shortcut: "Shift+Del",
      run: () => void ws.trash(pane, true),
    },
    (sel.length > 0 || !!work) && {
      id: "copy-path",
      label: sel.length > 1 ? "Copy paths" : "Copy path",
      shortcut: "Ctrl+Shift+C",
      run: () => ws.copyPaths(sel.length ? sel.map((e) => e.path) : [work ?? ""]),
    },
    sel.length > 0 && {
      id: "copy-name",
      label: sel.length > 1 ? "Copy names" : "Copy name",
      run: () => ws.copyNames(sel),
    },
    sel.length > 0 &&
      pane.loc?.kind === "dir" && {
        id: "new-folder-with-selection",
        label: "New folder with selection…",
        icon: <FolderIcon size={15} />,
        run: () => void ws.newFolderWithSelection(pane, sel),
      },
    sel.length === 1 &&
      !sel[0].isDir && {
        id: "checksums",
        label: "Checksums (SHA-256, SHA-1, MD5)",
        run: () => ws.showChecksums(sel[0]),
      },
    { id: "select-all", label: "Select all", shortcut: "Ctrl+A", run: () => pane.selectAll() },
    {
      id: "select-pattern",
      label: "Select by pattern…",
      run: () => void ws.selectByPattern(pane),
    },
    {
      id: "invert",
      label: "Invert selection",
      shortcut: "Ctrl+I",
      run: () => pane.invertSelection(),
    },
    ws.undoStack.length > 0 && {
      id: "undo",
      label: `Undo ${ws.undoStack[ws.undoStack.length - 1].label.toLowerCase()}`,
      shortcut: "Ctrl+Z",
      run: () => void ws.undo(),
    },
    {
      id: "search",
      label: "Filter or search",
      shortcut: "Ctrl+F",
      icon: <SearchIcon size={15} />,
      run: () => focusSearch(pane),
    },
    { id: "path", label: "Edit the path", shortcut: "Ctrl+L", run: () => editPath(pane) },
    sel.length > 0 && {
      id: "quick-look",
      label: "Quick Look",
      shortcut: "Space",
      run: onQuickLook,
    },
    {
      id: "list",
      label: "Details view",
      shortcut: "Ctrl+Shift+1",
      icon: <ListIcon size={15} />,
      run: () => setView(ws, pane, "list"),
    },
    {
      id: "grid",
      label: "Icon view",
      shortcut: "Ctrl+Shift+2",
      icon: <GridIcon size={15} />,
      run: () => setView(ws, pane, "grid"),
    },
    { id: "zoom-in", label: "Larger icons", shortcut: "Ctrl+Plus", run: () => zoom(ws, pane, 1) },
    {
      id: "zoom-out",
      label: "Smaller icons",
      shortcut: "Ctrl+Minus",
      run: () => zoom(ws, pane, -1),
    },
    {
      id: "hidden",
      label: ws.settings.showHidden ? "Hide hidden files" : "Show hidden files",
      shortcut: "Ctrl+H",
      run: () => ws.updateSettings({ showHidden: !ws.settings.showHidden }),
    },
    {
      id: "folder-sizes",
      label: ws.settings.folderSizes ? "Hide folder sizes" : "Show folder sizes",
      run: () => ws.updateSettings({ folderSizes: !ws.settings.folderSizes }),
    },
    {
      id: "preview",
      label: ws.settings.preview ? "Hide the preview panel" : "Show the preview panel",
      shortcut: "Alt+P",
      run: () => ws.updateSettings({ preview: !ws.settings.preview }),
    },
    sel.some((e) => e.isDir) && {
      id: "sizes",
      label: "Calculate folder size",
      run: () => void ws.calcSizes(sel),
    },
    !!dir &&
      !ws.isFavorite(dir) && {
        id: "pin",
        label: "Pin this folder",
        icon: <StarIcon size={15} />,
        run: () => ws.addFavorite(dir),
      },
    !!work && {
      id: "terminal",
      label: "Open in Terminal",
      run: () => void ws.bridge.terminal(work),
    },
    !!work && {
      id: "windows-explorer",
      label: "Open in Windows Explorer",
      run: () => void ws.bridge.openInWindowsExplorer(work),
    },
    (sel.length === 1 || !!work) && {
      id: "properties",
      label: "Properties",
      shortcut: "Alt+Enter",
      icon: <DiskIcon size={15} />,
      run: () => void ws.bridge.properties(sel[0]?.path ?? work ?? ""),
    },
    {
      id: "settings",
      label: "Settings",
      icon: <SettingsIcon size={15} />,
      run: () => openSettings(ws),
    },
    ws.bridge.kind === "electron" && {
      id: "devtools",
      label: "Developer tools",
      shortcut: "Ctrl+Shift+I",
      run: () => void ws.bridge.devtools(),
    },
  ];
  return all.filter((c): c is Command => !!c);
}

const ARCHIVES = new Set(["zip", "tar", "gz", "tgz", "7z", "rar", "xz", "bz2"]);

/** The right-click menu of one or more entries. */
export function entryMenu(ws: Workspace, pane: PaneModel, entries: FsEntry[]): MenuEntry[] {
  const one = entries.length === 1 ? entries[0] : null;
  const other = ws.otherPane(pane);
  const otherDir = other?.workDir ?? null;
  const paths = entries.map((e) => e.path);
  return cleanMenu([
    {
      label: "Open",
      icon: <FolderIcon size={15} />,
      shortcut: "Enter",
      onSelect: () => void ws.openEntries(pane, entries),
    },
    one?.isDir && {
      label: "Open in new tab",
      shortcut: "Ctrl+Enter",
      onSelect: () => void ws.newTab(one.path),
    },
    one?.isDir &&
      !!other && { label: "Open in the other pane", onSelect: () => void other.go(one.path) },
    one && !one.isDir && { label: "Open with…", onSelect: () => void ws.bridge.openWith(one.path) },
    pane.loc?.kind === "search" &&
      one && {
        label: "Open file location",
        onSelect: () =>
          void pane.go(one.path.slice(0, one.path.lastIndexOf("\\")), { select: one.path }),
      },
    one &&
      ARCHIVES.has(one.ext) && {
        label: "Extract here",
        icon: <ArchiveIcon size={15} />,
        onSelect: () => void ws.extract(pane, one, false),
      },
    one &&
      ARCHIVES.has(one.ext) && {
        label: `Extract to “${stem(one.name)}”`,
        icon: <ArchiveIcon size={15} />,
        onSelect: () => void ws.extract(pane, one, true),
      },
    "separator",
    { label: "Cut", shortcut: "Ctrl+X", onSelect: () => ws.setClipboard("cut", entries) },
    { label: "Copy", shortcut: "Ctrl+C", onSelect: () => ws.setClipboard("copy", entries) },
    one?.isDir && { label: "Paste into folder", onSelect: () => void ws.paste(one.path) },
    !!otherDir && {
      label: "Copy to the other pane",
      onSelect: () => void ws.transfer("copy", paths, otherDir),
    },
    !!otherDir && {
      label: "Move to the other pane",
      onSelect: () => void ws.transfer("move", paths, otherDir),
    },
    "separator",
    {
      label: one ? "Rename" : "Rename…",
      icon: <EditIcon size={15} />,
      shortcut: "F2",
      onSelect: () => rename(ws, pane),
    },
    {
      label: "Compress to ZIP",
      icon: <ArchiveIcon size={15} />,
      onSelect: () => void ws.zip(pane, entries),
    },
    {
      label: one ? "Copy path" : "Copy paths",
      shortcut: "Ctrl+Shift+C",
      onSelect: () => ws.copyPaths(paths),
    },
    { label: one ? "Copy name" : "Copy names", onSelect: () => ws.copyNames(entries) },
    pane.loc?.kind === "dir" && {
      label: "New folder with selection…",
      icon: <FolderIcon size={15} />,
      onSelect: () => void ws.newFolderWithSelection(pane, entries),
    },
    one &&
      !one.isDir && {
        label: "Checksums…",
        onSelect: () => ws.showChecksums(one),
      },
    "separator",
    one?.isDir &&
      (ws.isFavorite(one.path)
        ? {
            label: "Unpin",
            icon: <StarIcon size={15} />,
            onSelect: () => ws.removeFavorite(one.path),
          }
        : {
            label: "Pin to sidebar",
            icon: <StarIcon size={15} />,
            onSelect: () => ws.addFavorite(one.path),
          }),
    one?.isDir && { label: "Open in Terminal", onSelect: () => void ws.bridge.terminal(one.path) },
    entries.some((e) => e.isDir) && {
      label: "Calculate folder size",
      onSelect: () => void ws.calcSizes(entries),
    },
    { label: "Show in Windows Explorer", onSelect: () => void ws.bridge.reveal(entries[0].path) },
    "separator",
    {
      label: "Move to Recycle Bin",
      shortcut: "Del",
      danger: true,
      onSelect: () => void ws.trash(pane),
    },
    {
      label: "Delete permanently",
      shortcut: "Shift+Del",
      danger: true,
      onSelect: () => void ws.trash(pane, true),
    },
    "separator",
    one && {
      label: "Properties",
      icon: <DiskIcon size={15} />,
      shortcut: "Alt+Enter",
      onSelect: () => void ws.bridge.properties(one.path),
    },
  ]);
}

/** The right-click menu of a pane's empty space. */
export function backgroundMenu(ws: Workspace, pane: PaneModel): MenuEntry[] {
  const dir = pane.path;
  const work = pane.workDir;
  return cleanMenu([
    {
      label: "Details view",
      icon: <ListIcon size={15} />,
      onSelect: () => setView(ws, pane, "list"),
    },
    { label: "Icon view", icon: <GridIcon size={15} />, onSelect: () => setView(ws, pane, "grid") },
    {
      label: "Refresh",
      icon: <ReloadIcon size={15} />,
      shortcut: "F5",
      onSelect: () => void pane.reload(),
    },
    "separator",
    !!work && { label: "Paste", shortcut: "Ctrl+V", onSelect: () => void ws.paste(work) },
    !!dir && {
      label: "New folder",
      icon: <FolderIcon size={15} />,
      shortcut: "Ctrl+Shift+N",
      onSelect: () => void ws.newFolder(pane),
    },
    !!dir && {
      label: "New text document",
      icon: <FileIcon size={15} />,
      onSelect: () => void ws.newFile(pane, "New text document.txt"),
    },
    !!dir && {
      label: "New file…",
      icon: <FileIcon size={15} />,
      onSelect: () => void newFileWithName(ws, pane),
    },
    { label: "Select all", shortcut: "Ctrl+A", onSelect: () => pane.selectAll() },
    { label: "Select by pattern…", onSelect: () => void ws.selectByPattern(pane) },
    "separator",
    !!work && { label: "Open in Terminal", onSelect: () => void ws.bridge.terminal(work) },
    !!work && {
      label: "Open in Windows Explorer",
      onSelect: () => void ws.bridge.openInWindowsExplorer(work),
    },
    !!dir &&
      (ws.isFavorite(dir)
        ? {
            label: "Unpin this folder",
            icon: <StarIcon size={15} />,
            onSelect: () => ws.removeFavorite(dir),
          }
        : {
            label: "Pin this folder",
            icon: <StarIcon size={15} />,
            onSelect: () => ws.addFavorite(dir),
          }),
    !!work && { label: "Copy path", onSelect: () => ws.copyPaths([work]) },
    "separator",
    !!work && {
      label: "Properties",
      icon: <DiskIcon size={15} />,
      onSelect: () => void ws.bridge.properties(work),
    },
  ]);
}

/** Global keyboard shortcuts. Returns true when the key was handled. */
export function handleShortcut(
  ws: Workspace,
  e: KeyboardEvent,
  onPalette: () => void,
  onQuickLook: () => void,
): boolean {
  const pane = ws.pane;
  if (!pane) return false;
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  const target = e.target as HTMLElement | null;
  const typing =
    !!target &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
  const work = pane.workDir;
  const run = (fn: () => unknown) => {
    fn();
    return true;
  };

  // Work everywhere, also while typing.
  if (ctrl && !e.shiftKey && key === "t")
    return run(() => void ws.newTab(work ?? { kind: "this-pc" }));
  if (ctrl && e.shiftKey && key === "t") return run(() => void ws.reopenTab());
  if (ctrl && key === "w") return run(() => ws.closeTab());
  if (ctrl && key === "tab") return run(() => ws.cycleTab(e.shiftKey ? -1 : 1));
  if ((ctrl && key === "k") || (ctrl && e.shiftKey && key === "p") || key === "f1")
    return run(() => onPalette());
  if ((ctrl && key === "l") || (e.altKey && key === "d") || key === "f4")
    return run(() => editPath(pane));
  if ((ctrl && key === "f") || key === "f3") return run(() => focusSearch(pane));
  if (key === "f5" || (ctrl && key === "r")) return run(() => void pane.reload());
  if (key === "f9") return run(() => ws.toggleSplit());
  if (ctrl && e.shiftKey && key === "i") return run(() => void ws.bridge.devtools());
  if (e.altKey && key === "arrowleft") return run(() => pane.back());
  if (e.altKey && key === "arrowright") return run(() => pane.forward());
  if (e.altKey && key === "arrowup") return run(() => pane.up());
  if (key === "browserback") return run(() => pane.back());
  if (key === "browserforward") return run(() => pane.forward());
  if (ctrl && !e.shiftKey && /^[1-8]$/.test(key))
    return run(() => ws.activateTab(ws.tabs[Number(key) - 1] ?? null));
  if (ctrl && key === "9") return run(() => ws.activateTab(ws.tabs[ws.tabs.length - 1] ?? null));
  if (ctrl && e.shiftKey && e.code === "Digit1") return run(() => setView(ws, pane, "list"));
  if (ctrl && e.shiftKey && e.code === "Digit2") return run(() => setView(ws, pane, "grid"));
  if (ctrl && e.shiftKey && key === "n") return run(() => void ws.newFolder(pane));
  if (ctrl && key === "h")
    return run(() => ws.updateSettings({ showHidden: !ws.settings.showHidden }));
  if (e.altKey && key === "p")
    return run(() => ws.updateSettings({ preview: !ws.settings.preview }));
  if (ctrl && (key === "+" || key === "=")) return run(() => zoom(ws, pane, 1));
  if (ctrl && key === "-") return run(() => zoom(ws, pane, -1));
  if (typing) return false;

  if (key === "tab" && ws.activeTab?.split) {
    const other = ws.otherPane(pane);
    if (other) {
      ws.setActivePane(other);
      focusList(other);
    }
    return true;
  }
  const sel = pane.selected();
  if (ctrl && key === "z") return run(() => void ws.undo());
  if (ctrl && e.shiftKey && key === "c")
    return run(() => ws.copyPaths(sel.length ? sel.map((x) => x.path) : work ? [work] : []));
  if (ctrl && key === "c") return run(() => ws.setClipboard("copy", sel));
  if (ctrl && key === "x") return run(() => ws.setClipboard("cut", sel));
  if (ctrl && key === "v") return run(() => void ws.paste(work));
  if (ctrl && key === "a") return run(() => pane.selectAll());
  if (ctrl && key === "i") return run(() => pane.invertSelection());
  if (key === "f2" && sel.length) return run(() => rename(ws, pane));
  if (key === "delete" && sel.length) return run(() => void ws.trash(pane, e.shiftKey));
  if (e.altKey && key === "enter") {
    const target = sel[0]?.path ?? work;
    if (target) void ws.bridge.properties(target);
    return true;
  }
  if (key === " " && !ctrl && sel.length) return run(() => onQuickLook());
  return false;
}
