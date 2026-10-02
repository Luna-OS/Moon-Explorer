import {
  useCallback,
  useEffect,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Sky } from "@/theme/Sky";
import { useDocumentTheme, type ThemeChoice } from "@/theme/useTheme";
import {
  CloseIcon,
  ComputerIcon,
  DiskIcon,
  DownloadIcon,
  EditIcon,
  FilmIcon,
  FolderIcon,
  GridIcon,
  HomeIcon,
  ImageIcon,
  ListIcon,
  MediaIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  StarIcon,
} from "@/theme/icons";
import { DriveProperties } from "@/explorer/DriveProperties";
import { DriveIcon } from "@/drive-icons/DriveIcon";
import { DriveIconPicker } from "@/drive-icons/DriveIconPicker";
import { ContextMenu } from "@/ui/ContextMenu";
import { anchorFromEvent, type MenuAnchor, type MenuEntry } from "@/ui/menu";
import { defaultBridge } from "@/fs/bridge";
import { formatBytes, plural } from "@/fs/format";
import { isRoot, samePath } from "@/fs/paths";
import type { FsDrive, MoonBridge } from "@/fs/types";
import { focusList, handleShortcut, openSettings, setView } from "@/explorer/commands";
import { Dialogs } from "@/explorer/Dialogs";
import { CommandPalette, QuickLook, TaskStatus, Toasts } from "@/explorer/Overlays";
import { PaneView } from "@/explorer/PaneView";
import { PreviewPanel } from "@/explorer/Preview";
import { useStore } from "@/explorer/model/store";
import { Workspace, type Tab } from "@/explorer/model/workspace";

const PLACE_ICONS: Record<string, ReactNode> = {
  home: <HomeIcon />,
  desktop: <StarIcon />,
  documents: <FolderIcon />,
  downloads: <DownloadIcon />,
  pictures: <ImageIcon />,
  music: <MediaIcon />,
  videos: <FilmIcon />,
};

const THEME_KEY = "moonexplorer.theme";

function loadThemeChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === "light" || raw === "system" ? raw : "dark";
  } catch {
    return "dark";
  }
}

function saveThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Not persisting a preference is harmless.
  }
}

/** The open drive dialog. The icon picker can go back to the properties it came from. */
type DriveDialog = { type: "properties" | "icon"; driveId: string; fromProperties?: boolean };

interface OpenMenu {
  label: string;
  anchor: MenuAnchor;
  items: MenuEntry[];
}

export default function App({ bridge }: { bridge?: MoonBridge }) {
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(loadThemeChoice);
  const theme = useDocumentTheme(themeChoice);
  const [ws] = useState(() => new Workspace(bridge ?? defaultBridge()));
  useStore(ws);

  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [driveDialog, setDriveDialog] = useState<DriveDialog | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickLook, setQuickLook] = useState(false);
  const closeMenu = useCallback(() => setMenu(null), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openQuickLook = useCallback(() => setQuickLook(true), []);
  const closeQuickLook = useCallback(() => {
    setQuickLook(false);
    if (ws.pane) focusList(ws.pane);
  }, [ws]);

  useEffect(() => {
    // The screenshot scripts (MOON_SHOT, see electron/main.cjs) drive the UI through this handle.
    if ("moonDev" in window) Object.assign(window, { __moon: ws });
    void ws.init();
    const save = () => ws.saveNow();
    window.addEventListener("beforeunload", save);
    return () => window.removeEventListener("beforeunload", save);
  }, [ws]);

  useEffect(() => {
    void ws.bridge.setTheme(theme).catch(() => {});
  }, [ws, theme]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (menu || paletteOpen || quickLook || ws.dialog) return;
      if (handleShortcut(ws, e, openPalette, openQuickLook)) e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ws, menu, paletteOpen, quickLook, openPalette, openQuickLook]);

  // Dropping files anywhere else must not navigate the window to them.
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  const pane = ws.pane;
  const tab = ws.activeTab;
  const loc = pane?.loc;
  const atDriveRoot = loc?.kind === "dir" && isRoot(loc.path);
  const drive = pane?.workDir ? ws.driveFor(pane.workDir) : undefined;
  const title = pane?.title() ?? "Loading…";
  const dialogDrive = driveDialog && ws.drives.find((d) => d.id === driveDialog.driveId);

  function chooseTheme(choice: ThemeChoice) {
    setThemeChoice(choice);
    saveThemeChoice(choice);
  }

  function openDriveMenu(d: FsDrive, e: MouseEvent<HTMLButtonElement>) {
    setMenu({
      label: ws.driveLabel(d),
      anchor: anchorFromEvent(e),
      items: [
        { label: "Open", icon: <FolderIcon size={15} />, onSelect: () => void pane?.go(d.path) },
        {
          label: "Change icon…",
          icon: <EditIcon size={15} />,
          onSelect: () => setDriveDialog({ type: "icon", driveId: d.id }),
        },
        {
          label: "Properties",
          icon: <DiskIcon size={15} />,
          onSelect: () => setDriveDialog({ type: "properties", driveId: d.id }),
        },
      ],
    });
  }

  function openPlaceMenu(path: string, e: MouseEvent<HTMLButtonElement>) {
    const other = pane ? ws.otherPane(pane) : null;
    setMenu({
      label: ws.displayName(path),
      anchor: anchorFromEvent(e),
      items: [
        { label: "Open", icon: <FolderIcon size={15} />, onSelect: () => void pane?.go(path) },
        {
          label: "Open in new tab",
          icon: <PlusIcon size={15} />,
          onSelect: () => void ws.newTab(path),
        },
        ...(other
          ? [{ label: "Open in the other pane", onSelect: () => void other.go(path) }]
          : []),
        "separator" as const,
        ws.isFavorite(path)
          ? {
              label: "Unpin",
              icon: <StarIcon size={15} />,
              onSelect: () => ws.removeFavorite(path),
            }
          : {
              label: "Pin to sidebar",
              icon: <StarIcon size={15} />,
              onSelect: () => ws.addFavorite(path),
            },
        { label: "Paste", onSelect: () => void ws.paste(path) },
        { label: "Copy path", onSelect: () => ws.copyPaths([path]) },
        { label: "Open in Terminal", onSelect: () => void ws.bridge.terminal(path) },
        "separator" as const,
        {
          label: "Properties",
          icon: <DiskIcon size={15} />,
          onSelect: () => void ws.bridge.properties(path),
        },
      ],
    });
  }

  /** Sidebar entries take dropped files like folders in the list do. */
  function dropProps(dir: string) {
    return {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = ws.dropEffect(e, dir);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        void ws.drop([...e.dataTransfer.files], e, dir);
      },
    };
  }

  const selected = pane?.selected() ?? [];
  const selectedBytes = selected.reduce(
    (a, e) => a + (e.isDir ? (ws.folderSizes.get(e.path)?.size ?? 0) : (e.size ?? 0)),
    0,
  );
  const hiddenCount =
    pane && !ws.settings.showHidden ? pane.items.filter((e) => e.hidden).length : 0;

  return (
    <div className="relative flex h-full flex-col">
      <Sky />

      {/* Custom title bar with the tabs. The right edge stays free for the native
       * window buttons (see theme/frame-colors.ts). */}
      <header className="me-titlebar relative z-10 flex h-10 shrink-0 items-end gap-1 pr-[138px] pl-3">
        <img
          src={`${import.meta.env.BASE_URL}moon-explorer-logo.svg`}
          alt=""
          className="mr-1 mb-2 size-5 self-center"
        />
        <TabStrip ws={ws} />
        <button
          type="button"
          className="me-icon-btn mb-1"
          aria-label="New tab"
          title="New tab (Ctrl+T)"
          onClick={() => void ws.newTab(pane?.workDir ?? { kind: "this-pc" })}
        >
          <PlusIcon />
        </button>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[14.5rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-(--me-border) bg-(--me-glass-bottom) px-3 py-5 backdrop-blur-md">
          <div className="flex items-center gap-3 px-2">
            <img
              src={`${import.meta.env.BASE_URL}moon-explorer-logo.svg`}
              alt=""
              className="size-10 drop-shadow-[0_0_14px_rgb(185_174_251/0.45)]"
            />
            <div>
              <h1 className="me-title text-xl leading-tight font-semibold tracking-tight">
                Moon Explorer
              </h1>
              <p className="text-[0.6875rem] text-(--me-text-muted)">calmly under the moon</p>
            </div>
          </div>

          <nav aria-label="Places" className="flex flex-col gap-0.5">
            <div className="me-eyebrow mb-1 px-3">Places</div>
            {Object.entries(ws.places).map(([id, path]) => {
              if (!path) return null;
              const current = loc?.kind === "dir" && samePath(loc.path, path);
              return (
                <button
                  key={id}
                  type="button"
                  data-place={id}
                  aria-current={current ? "page" : undefined}
                  onClick={() => void pane?.go(path)}
                  onAuxClick={(e) => {
                    if (e.button === 1) void ws.newTab(path, { background: true });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openPlaceMenu(path, e);
                  }}
                  className={navItemClass(current)}
                  {...dropProps(path)}
                >
                  {PLACE_ICONS[id] ?? <FolderIcon />}
                  <span className="flex-1 text-left">{ws.placeLabel(id)}</span>
                </button>
              );
            })}
          </nav>

          <nav aria-label="Pinned" className="flex flex-col gap-0.5">
            <div className="me-eyebrow mb-1 px-3">Pinned</div>
            {ws.settings.favorites.length === 0 && (
              <p className="m-0 px-3 text-[0.6875rem] text-(--me-text-faint)">
                Right-click a folder and choose “Pin to sidebar”.
              </p>
            )}
            {ws.settings.favorites.map((path) => {
              const current = loc?.kind === "dir" && samePath(loc.path, path);
              return (
                <button
                  key={path}
                  type="button"
                  title={path}
                  aria-current={current ? "page" : undefined}
                  onClick={() => void pane?.go(path)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openPlaceMenu(path, e);
                  }}
                  className={navItemClass(current)}
                  {...dropProps(path)}
                >
                  <SparklesIcon />
                  <span className="flex-1 truncate text-left">{ws.displayName(path)}</span>
                </button>
              );
            })}
          </nav>

          <section aria-label="Drives" className="flex flex-col gap-1.5">
            <div className="me-eyebrow px-3">Drives</div>
            <button
              type="button"
              data-place="this-pc"
              aria-current={loc?.kind === "this-pc" ? "page" : undefined}
              onClick={() => void pane?.go({ kind: "this-pc" })}
              className={navItemClass(loc?.kind === "this-pc")}
            >
              <ComputerIcon />
              <span className="flex-1 text-left">This PC</span>
            </button>
            {ws.drives.map((d) => (
              <DriveGauge
                key={d.id}
                drive={d}
                current={loc?.kind === "dir" && samePath(loc.path, d.path)}
                onOpen={() => void pane?.go(d.path)}
                onContextMenu={(e) => openDriveMenu(d, e)}
                drop={dropProps(d.path)}
              />
            ))}
          </section>

          <fieldset className="mt-auto flex flex-col gap-1.5 border-0 p-0 px-1">
            <legend className="me-eyebrow mb-1.5 px-2">Theme</legend>
            <div className="flex gap-1">
              {(
                [
                  ["dark", "Night"],
                  ["light", "Day"],
                  ["system", "System"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="me-btn me-btn-ghost me-btn-sm flex-1"
                  aria-pressed={themeChoice === value}
                  onClick={() => chooseTheme(value)}
                >
                  {value === "dark" && <MoonIcon size={13} />}
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="me-btn me-btn-ghost me-btn-sm mt-1"
              onClick={() => openSettings(ws)}
            >
              <SettingsIcon size={13} />
              Settings
            </button>
          </fieldset>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex items-center justify-between gap-4 px-6 pt-4 pb-3">
            <div className="min-w-0">
              <h2 className="m-0 flex items-center gap-2.5 truncate text-2xl font-semibold tracking-tight">
                {atDriveRoot && drive && <DriveIcon drive={drive} size={26} />}
                {title}
              </h2>
              <p className="m-0 text-sm text-(--me-text-muted)">
                {loc?.kind === "this-pc"
                  ? plural(ws.drives.length, "drive")
                  : `${plural(pane?.view.length ?? 0, "item")}${pane?.filter ? ` matching “${pane.filter}”` : ""}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {atDriveRoot && drive && (
                <button
                  type="button"
                  className="me-btn me-btn-ghost"
                  onClick={() => setDriveDialog({ type: "properties", driveId: drive.id })}
                >
                  <DiskIcon size={15} />
                  Properties
                </button>
              )}
              {pane && loc?.kind !== "this-pc" && (
                <div className="flex gap-1" role="group" aria-label="View">
                  <button
                    type="button"
                    className="me-btn me-btn-ghost me-btn-icon"
                    aria-pressed={pane.mode === "list"}
                    aria-label="Details view"
                    onClick={() => setView(ws, pane, "list")}
                  >
                    <ListIcon />
                  </button>
                  <button
                    type="button"
                    className="me-btn me-btn-ghost me-btn-icon"
                    aria-pressed={pane.mode === "grid"}
                    aria-label="Icon view"
                    onClick={() => setView(ws, pane, "grid")}
                  >
                    <GridIcon />
                  </button>
                </div>
              )}
              <div className="flex gap-1" role="group" aria-label="Layout">
                <button
                  type="button"
                  className="me-btn me-btn-ghost me-btn-sm"
                  aria-pressed={!!tab?.split}
                  title="Two panes side by side (F9)"
                  onClick={() => ws.toggleSplit()}
                >
                  Two panes
                </button>
                <button
                  type="button"
                  className="me-btn me-btn-ghost me-btn-sm"
                  aria-pressed={ws.settings.preview}
                  title="Preview panel (Alt+P)"
                  onClick={() => ws.updateSettings({ preview: !ws.settings.preview })}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className="me-btn me-btn-ghost me-btn-sm"
                  title="Command palette (Ctrl+K)"
                  onClick={openPalette}
                >
                  Ctrl+K
                </button>
              </div>
              {pane?.path && (
                <button
                  type="button"
                  className="me-btn me-btn-primary"
                  onClick={() => void ws.newFolder(pane)}
                >
                  <PlusIcon />
                  New folder
                </button>
              )}
            </div>
          </div>

          <main className="flex min-h-0 flex-1 gap-3 px-6 pb-4">
            <div className="flex min-w-0 flex-1 gap-3">
              {tab?.panes.map((p, i) => (
                <PaneSlot key={p.id} ws={ws} tab={tab} index={i}>
                  <PaneView
                    ws={ws}
                    pane={p}
                    split={tab.split}
                    onMenu={(items, anchor, label) => setMenu({ items, anchor, label })}
                    onDriveMenu={openDriveMenu}
                  />
                </PaneSlot>
              ))}
            </div>
            {pane && ws.settings.preview && <PreviewPanel ws={ws} pane={pane} />}
          </main>

          <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-(--me-border) bg-(--me-glass-bottom) px-6 py-2 text-xs text-(--me-text-muted) tabular-nums backdrop-blur-md">
            <span>
              {loc?.kind === "this-pc"
                ? plural(ws.drives.length, "drive")
                : plural(pane?.view.length ?? 0, "item")}
            </span>
            {selected.length > 0 && (
              <span className="text-(--me-text)">
                {plural(selected.length, "item")} selected
                {selectedBytes ? ` · ${formatBytes(selectedBytes)}` : ""}
              </span>
            )}
            {hiddenCount > 0 && <span>{hiddenCount} hidden</span>}
            <TaskStatus ws={ws} />
            {drive && (
              <span className="ml-auto">
                {formatBytes(drive.total - drive.used, 0)} free on {ws.driveLabel(drive)}
              </span>
            )}
          </footer>
        </div>
      </div>

      {menu && (
        <ContextMenu
          label={menu.label}
          anchor={menu.anchor}
          items={menu.items}
          onClose={closeMenu}
        />
      )}

      {driveDialog?.type === "properties" && dialogDrive && (
        <DriveProperties
          drive={dialogDrive}
          onChangeIcon={() =>
            setDriveDialog({ type: "icon", driveId: dialogDrive.id, fromProperties: true })
          }
          onClose={() => setDriveDialog(null)}
        />
      )}
      {driveDialog?.type === "icon" && dialogDrive && (
        <DriveIconPicker
          drive={dialogDrive}
          onClose={() =>
            setDriveDialog(
              driveDialog.fromProperties ? { type: "properties", driveId: dialogDrive.id } : null,
            )
          }
        />
      )}

      <Dialogs ws={ws} />
      {paletteOpen && (
        <CommandPalette ws={ws} onClose={() => setPaletteOpen(false)} onQuickLook={openQuickLook} />
      )}
      {quickLook && pane && <QuickLook ws={ws} pane={pane} onClose={closeQuickLook} />}
      <Toasts ws={ws} />
    </div>
  );
}

/** A pane's place in the split; the first one carries the divider you can drag. */
function PaneSlot({
  ws,
  tab,
  index,
  children,
}: {
  ws: Workspace;
  tab: Tab;
  index: number;
  children: ReactNode;
}) {
  if (!tab.split) return <div className="flex min-w-0 flex-1">{children}</div>;
  const first = index === 0;
  return (
    <>
      <div
        className="flex min-w-0"
        style={first ? { flex: `0 0 calc(${tab.ratio * 100}% - 6px)` } : { flex: 1 }}
      >
        {children}
      </div>
      {first && (
        <button
          type="button"
          aria-label="Resize panes (Left / Right arrow)"
          className="-mx-1.5 w-1.5 shrink-0 cursor-col-resize rounded-full hover:bg-(--me-border-strong) focus-visible:bg-(--me-border-strong)"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") ws.setSplitRatio(tab.ratio - 0.05);
            if (e.key === "ArrowRight") ws.setSplitRatio(tab.ratio + 0.05);
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            const host = e.currentTarget.parentElement;
            if (!host) return;
            const move = (ev: globalThis.MouseEvent) => {
              const r = host.getBoundingClientRect();
              ws.setSplitRatio((ev.clientX - r.left) / r.width);
            };
            const up = () => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        />
      )}
    </>
  );
}

const TAB_TYPE = "application/x-moon-explorer-tab";

/** The tabs in the title bar: drag to reorder, middle-click to close, drop files to move them in. */
function TabStrip({ ws }: { ws: Workspace }) {
  return (
    <div
      role="tablist"
      aria-label="Tabs"
      className="flex min-w-0 items-end gap-0.5 overflow-hidden"
    >
      {ws.tabs.map((tab, i) => {
        const active = tab === ws.activeTab;
        const p = tab.activePane;
        const label = p.title();
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            title={p.workDir ?? label}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(TAB_TYPE, String(i))}
            onDragOver={(e) => {
              if (
                e.dataTransfer.types.includes(TAB_TYPE) ||
                (e.dataTransfer.types.includes("Files") && p.path)
              )
                e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = e.dataTransfer.getData(TAB_TYPE);
              if (from) ws.moveTab(ws.tabs[Number(from)], i);
              else if (p.path) void ws.drop([...e.dataTransfer.files], e, p.path);
            }}
            onMouseDown={(e) => {
              if (e.button === 0) ws.activateTab(tab);
            }}
            onAuxClick={(e) => {
              if (e.button === 1) ws.closeTab(tab);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") ws.activateTab(tab);
            }}
            className={`group relative flex h-8 w-48 min-w-16 shrink items-center gap-2 rounded-t-[0.7rem] pr-1 pl-3 text-[0.8125rem] transition-colors duration-150 ${
              active
                ? "bg-(--me-toolbar) text-(--me-text) shadow-[inset_0_2px_0_0_var(--me-accent)]"
                : "text-(--me-text-muted) hover:bg-(--me-hover) hover:text-(--me-text)"
            }`}
          >
            <span className="shrink-0 text-(--me-kind-folder)">
              {p.loc?.kind === "this-pc" ? <ComputerIcon size={14} /> : <FolderIcon size={14} />}
            </span>
            <span className="flex-1 truncate">{label}</span>
            {tab.split && <span className="text-[0.625rem] text-(--me-text-faint)">2</span>}
            <button
              type="button"
              className="me-icon-btn size-6 opacity-0 group-hover:opacity-100 group-aria-selected:opacity-80"
              aria-label={`Close ${label}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => ws.closeTab(tab)}
            >
              <CloseIcon size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function navItemClass(current: boolean) {
  return `flex h-9 items-center gap-3 rounded-[0.7rem] px-3 text-sm font-medium transition-colors duration-150 ${
    current
      ? "bg-(--me-selected) text-(--me-accent) shadow-[inset_0_0_0_1px_rgb(185_174_251/0.3)]"
      : "text-(--me-text-muted) hover:bg-(--me-hover) hover:text-(--me-text)"
  }`;
}

/**
 * A drive in the sidebar: its icon (by default its fill as a moon phase)
 * plus a meter. Right-click, Shift+F10 or the Menu key opens its menu.
 */
function DriveGauge({
  drive,
  current,
  onOpen,
  onContextMenu,
  drop,
}: {
  drive: FsDrive;
  current: boolean;
  onOpen: () => void;
  onContextMenu: (e: MouseEvent<HTMLButtonElement>) => void;
  drop: {
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDrop: (e: DragEvent<HTMLElement>) => void;
  };
}) {
  const fraction = drive.total ? drive.used / drive.total : 0;
  return (
    <button
      type="button"
      data-drive={drive.id}
      aria-current={current ? "page" : undefined}
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      {...drop}
      className={`me-inset flex items-center gap-3 px-3 py-1.5 text-left ${
        current ? "shadow-[inset_0_0_0_1px_rgb(185_174_251/0.45)]" : ""
      }`}
    >
      <DriveIcon drive={drive} size={30} gauge />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {drive.label} <span className="text-(--me-text-faint)">({drive.letter})</span>
        </div>
        <div
          className="me-meter mt-1"
          data-tone={fraction > 0.9 ? "warning" : undefined}
          role="meter"
          aria-label={`${drive.label} used`}
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${fraction * 100}%` }} />
        </div>
        <div className="mt-1 text-[0.6875rem] text-(--me-text-muted) tabular-nums">
          {drive.total
            ? `${formatBytes(drive.total - drive.used, 0)} free of ${formatBytes(drive.total, 0)}`
            : "Not ready"}
        </div>
      </div>
    </button>
  );
}
