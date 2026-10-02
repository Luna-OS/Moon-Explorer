import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { DriveIcon } from "@/drive-icons/DriveIcon";
import { formatBytes, formatDate, fuzzyScore, kindOf, plural, typeLabel } from "@/fs/format";
import { expandPath } from "@/fs/paths";
import { BackIcon, CloseIcon, FolderIcon, ForwardIcon, SearchIcon, StarIcon } from "@/theme/icons";
import { Modal } from "@/ui/Modal";
import { commands } from "./commands";
import { KindIcon } from "./KindIcon";
import type { PaneModel } from "./model/pane";
import { useStore } from "./model/store";
import type { Workspace } from "./model/workspace";
import { MediaPreview } from "./Preview";

interface PaletteItem {
  key: string;
  label: string;
  detail?: string;
  group: string;
  shortcut?: string;
  icon?: ReactNode;
  score: number;
  run: () => void;
}

/** Ctrl+K: fuzzy search over commands, places, drives, recent folders and the current folder. */
export function CommandPalette({
  ws,
  onClose,
  onQuickLook,
}: {
  ws: Workspace;
  onClose: () => void;
  onQuickLook: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hot, setHot] = useState(0);
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const pane = ws.pane;

  const items = useMemo(() => {
    const q = query.trim();
    const out: PaletteItem[] = [];
    const score = (...texts: string[]) => (q ? Math.max(...texts.map((t) => fuzzyScore(q, t))) : 0);
    if (q && /^([a-z]:|\\\\|%|~|shell:)/i.test(q)) {
      const p = expandPath(q, ws.env, ws.places);
      out.push({
        key: `path:${p}`,
        label: `Go to ${p}`,
        group: "Path",
        icon: <FolderIcon size={15} />,
        score: 1e6,
        run: () => void pane?.go(p),
      });
    }
    commands(ws, onQuickLook).forEach((c, i) => {
      const s = q ? score(c.label) : 500 - i;
      if (s >= 0)
        out.push({
          key: `cmd:${c.id}`,
          label: c.label,
          group: "Commands",
          shortcut: c.shortcut,
          icon: c.icon,
          score: s + 50,
          run: c.run,
        });
    });
    const seen = new Set<string>();
    const place = (
      path: string | null | undefined,
      label: string,
      group: string,
      icon: ReactNode,
    ) => {
      if (!path || seen.has(path.toLowerCase())) return;
      seen.add(path.toLowerCase());
      const s = q ? score(label, path) : -1;
      if (s >= 0)
        out.push({
          key: `place:${path}`,
          label,
          detail: path,
          group,
          icon,
          score: s,
          run: () => void pane?.go(path),
        });
    };
    ws.settings.favorites.forEach((f) =>
      place(f, ws.displayName(f), "Pinned", <StarIcon size={15} />),
    );
    Object.entries(ws.places).forEach(([k, p]) =>
      place(p, ws.placeLabel(k), "Places", <FolderIcon size={15} />),
    );
    ws.drives.forEach((d) =>
      place(d.path, ws.driveLabel(d), "Drives", <DriveIcon drive={d} size={15} />),
    );
    ws.settings.recent.forEach((r) =>
      place(r, ws.displayName(r), "Recent", <FolderIcon size={15} />),
    );
    if (q && pane) {
      let n = 0;
      for (const e of pane.view) {
        const s = fuzzyScore(q, e.name);
        if (s < 0) continue;
        out.push({
          key: `entry:${e.path}`,
          label: e.name,
          group: "In this folder",
          icon: <KindIcon kind={kindOf(e)} size={15} />,
          score: s - 20,
          run: () => pane.selectPaths([e.path]),
        });
        if (++n > 200) break;
      }
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, q ? 40 : 60);
  }, [query, ws, pane, onQuickLook]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-hot="true"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [hot]);

  function run(i: number) {
    const item = items[i];
    onClose();
    item?.run();
  }

  let lastGroup = "";
  return (
    <Modal labelledBy={`${id}-label`} onClose={onClose} className="max-w-[40rem] self-start">
      <div className="flex items-center gap-3 border-b border-(--me-border) px-4 py-3">
        <SearchIcon size={16} />
        <input
          id={`${id}-label`}
          data-autofocus
          aria-label="Command palette"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          className="flex-1 border-0 bg-transparent text-[0.9375rem] text-(--me-text) outline-none"
          placeholder="Type a command, folder, file or path…"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHot(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setHot(
                (h) =>
                  (h + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length),
              );
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(hot);
            }
          }}
        />
      </div>
      <div
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        aria-label="Results"
        className="max-h-[55vh] overflow-y-auto p-1.5"
      >
        {items.map((item, i) => {
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <div key={item.key}>
              {header && <div className="me-eyebrow px-3 pt-2 pb-1">{header}</div>}
              <div
                role="option"
                tabIndex={-1}
                aria-selected={i === hot}
                data-hot={i === hot}
                className={`me-menu-item w-full ${i === hot ? "bg-(--me-selected)" : ""}`}
                onMouseMove={() => setHot(i)}
                onClick={() => run(i)}
                onKeyDown={() => {}}
              >
                <span className="text-(--me-text-muted)">{item.icon}</span>
                <span className="flex-1 truncate">
                  {item.label}
                  {item.detail && (
                    <span className="ml-2 text-xs text-(--me-text-faint)">{item.detail}</span>
                  )}
                </span>
                {item.shortcut && (
                  <span className="text-[0.6875rem] text-(--me-text-faint)">{item.shortcut}</span>
                )}
              </div>
            </div>
          );
        })}
        {!items.length && <p className="m-0 p-4 text-sm text-(--me-text-muted)">Nothing found.</p>}
      </div>
    </Modal>
  );
}

/** Space: a big preview of the selected entry; arrows move through the folder. */
export function QuickLook({
  ws,
  pane,
  onClose,
}: {
  ws: Workspace;
  pane: PaneModel;
  onClose: () => void;
}) {
  useStore(pane);
  const id = useId();
  const entry = pane.view[pane.cursor] ?? pane.selected()[0];
  const step = (d: number) => pane.moveCursor(pane.cursor + d);
  useEffect(() => {
    if (!entry) {
      onClose();
      return;
    }
    // Capture phase, so the list underneath doesn't also react to the arrows.
    function onKeyDown(e: KeyboardEvent) {
      if (!entry) return;
      e.stopPropagation();
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        pane.moveCursor(pane.cursor + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        pane.moveCursor(pane.cursor - 1);
      } else if (e.key === "Enter") {
        onClose();
        void ws.openEntries(pane, [entry]);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [entry, onClose, pane, ws]);
  if (!entry) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      className="fixed inset-0 z-50 flex flex-col bg-[rgb(5_4_18/0.82)] backdrop-blur-md"
    >
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="m-0 truncate text-sm font-semibold">
            {entry.name}
          </h2>
          <p className="m-0 text-xs text-(--me-text-muted)">
            {typeLabel(entry)}
            {!entry.isDir && ` · ${formatBytes(entry.size ?? 0)}`} ·{" "}
            {formatDate(entry.mtime, false)}
          </p>
        </div>
        <button
          type="button"
          className="me-btn me-btn-ghost"
          onClick={() => {
            onClose();
            void ws.openEntries(pane, [entry]);
          }}
        >
          Open
        </button>
        <button type="button" className="me-icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-8">
        <MediaPreview key={entry.path} bridge={ws.bridge} entry={entry} large />
        <button
          type="button"
          className="me-icon-btn absolute top-1/2 left-3"
          aria-label="Previous"
          onClick={() => step(-1)}
        >
          <BackIcon />
        </button>
        <button
          type="button"
          className="me-icon-btn absolute top-1/2 right-3"
          aria-label="Next"
          onClick={() => step(1)}
        >
          <ForwardIcon />
        </button>
      </div>
    </div>
  );
}

/** Toasts at the bottom right. */
export function Toasts({ ws }: { ws: Workspace }) {
  useStore(ws);
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-12 z-[60] flex flex-col items-end gap-2"
      role="status"
      aria-live="polite"
    >
      {ws.toasts.map((t) => (
        <div
          key={t.id}
          className="me-popover pointer-events-auto flex max-w-md items-center gap-3 px-4 py-2.5 text-sm"
          style={t.error ? { borderColor: "var(--me-danger)" } : undefined}
        >
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="me-btn me-btn-ghost me-btn-sm"
              onClick={() => {
                ws.dismissToast(t.id);
                t.action?.run();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Progress of copy / move / delete tasks in the status bar, with a cancel button. */
export function TaskStatus({ ws }: { ws: Workspace }) {
  const tasks = ws.activeTasks();
  if (!tasks.length) return null;
  const done = tasks.reduce((a, t) => a + (t.totalBytes ? t.doneBytes : t.doneFiles), 0);
  const total = tasks.reduce((a, t) => a + (t.totalBytes || t.totalFiles), 0);
  const fraction = total ? done / total : 0;
  const t = tasks[0];
  return (
    <span className="flex items-center gap-2">
      <span className="max-w-72 truncate">
        {tasks.length === 1 ? t.label : plural(tasks.length, "task")}
      </span>
      <span
        className="me-meter w-28"
        role="progressbar"
        aria-label="Progress"
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${fraction * 100}%` }} />
      </span>
      <span>{Math.round(fraction * 100)}%</span>
      <button
        type="button"
        className="me-btn me-btn-ghost me-btn-sm"
        onClick={() => tasks.forEach((x) => ws.cancelTask(x.id))}
      >
        Cancel
      </button>
    </span>
  );
}
