import { useState, type MouseEvent } from "react";
import { plural } from "@/fs/format";
import type { FsDrive, FsEntry } from "@/fs/types";
import { BackIcon, ForwardIcon, ReloadIcon, SearchIcon, UpIcon } from "@/theme/icons";
import { anchorFromEvent, type MenuAnchor, type MenuEntry } from "@/ui/menu";
import { backgroundMenu, entryMenu } from "./commands";
import { FileView } from "./FileView";
import type { PaneModel } from "./model/pane";
import { useStore } from "./model/store";
import type { Workspace } from "./model/workspace";
import { PathBar } from "./PathBar";
import { StartView } from "./StartView";

/** One pane: navigation buttons, path, filter/search box, search banner and the file list (or This PC). */
export function PaneView({
  ws,
  pane,
  split,
  onMenu,
  onDriveMenu,
}: {
  ws: Workspace;
  pane: PaneModel;
  split: boolean;
  onMenu: (items: MenuEntry[], anchor: MenuAnchor, label: string) => void;
  onDriveMenu: (drive: FsDrive, e: MouseEvent<HTMLButtonElement>) => void;
}) {
  useStore(pane);
  const active = ws.pane === pane;
  const loc = pane.loc;
  const title = pane.title();

  function onContextMenu(entry: FsEntry | null, e: MouseEvent<HTMLElement>) {
    const anchor = anchorFromEvent(e);
    if (entry) {
      if (!pane.sel.has(entry.path)) pane.selectOnly(pane.index.get(entry.path) ?? 0, false);
      const sel = pane.selected();
      onMenu(
        entryMenu(ws, pane, sel),
        anchor,
        sel.length === 1 ? sel[0].name : plural(sel.length, "item"),
      );
    } else {
      pane.clearSelection();
      onMenu(backgroundMenu(ws, pane), anchor, title);
    }
  }

  return (
    <section
      aria-label={split ? `${active ? "Active pane" : "Pane"}: ${title}` : undefined}
      className={`me-glass relative flex min-w-0 flex-1 flex-col overflow-hidden ${split && active ? "shadow-[inset_0_2px_0_0_var(--me-accent)]" : ""}`}
      onFocusCapture={() => ws.setActivePane(pane)}
    >
      <div className="flex items-center gap-1 border-b border-(--me-border) px-2 py-2">
        <button
          type="button"
          className="me-icon-btn"
          aria-label="Back"
          title="Back (Alt+Left)"
          disabled={!pane.canBack}
          onClick={() => pane.back()}
        >
          <BackIcon />
        </button>
        <button
          type="button"
          className={`me-icon-btn ${split ? "hidden" : ""}`}
          aria-label="Forward"
          title="Forward (Alt+Right)"
          disabled={!pane.canForward}
          onClick={() => pane.forward()}
        >
          <ForwardIcon />
        </button>
        <button
          type="button"
          className="me-icon-btn"
          aria-label="Up"
          title="Up (Alt+Up)"
          disabled={loc?.kind === "this-pc"}
          onClick={() => pane.up()}
        >
          <UpIcon />
        </button>
        <button
          type="button"
          className={`me-icon-btn ${split ? "hidden" : ""}`}
          aria-label="Refresh"
          title="Refresh (F5)"
          onClick={() => void pane.reload()}
        >
          <ReloadIcon />
        </button>
        <PathBar ws={ws} pane={pane} />
        {/* Keyed by location, so the box starts over with the new folder's filter or query. */}
        <SearchBox key={pane.locationKey()} ws={ws} pane={pane} split={split} title={title} />
      </div>

      {loc?.kind === "search" && pane.search && (
        <div className="mx-3 mt-2 flex items-center gap-3 rounded-(--radius-md) border border-(--me-border-strong) bg-(--me-selected) px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate">
            {pane.search.running ? "Searching" : `${plural(pane.items.length, "result")} for`} “
            {loc.query}” in {ws.displayName(loc.root)}
            {pane.search.running
              ? ` … ${plural(pane.items.length, "result")} so far`
              : ` · ${pane.search.ms < 1000 ? `${pane.search.ms} ms` : `${(pane.search.ms / 1000).toFixed(1)} s`} · ${plural(pane.search.scanned, "item")} checked${pane.search.limited ? " · stopped at 10,000 results" : ""}`}
          </span>
          <label className="flex items-center gap-2 text-(--me-text-muted)">
            <input
              type="checkbox"
              className="me-switch"
              checked={loc.content}
              onChange={(e) => pane.setSearchContent(e.target.checked)}
            />
            Search file contents
          </label>
          <button
            type="button"
            className="me-btn me-btn-ghost me-btn-sm"
            onClick={() => (pane.search?.running ? pane.stopSearch() : pane.back())}
          >
            {pane.search.running ? "Stop" : "Close"}
          </button>
        </div>
      )}

      {loc?.kind === "this-pc" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <StartView ws={ws} pane={pane} onDriveMenu={onDriveMenu} />
        </div>
      ) : (
        <FileView
          ws={ws}
          pane={pane}
          label={`Contents of ${title}`}
          onContextMenu={onContextMenu}
        />
      )}
    </section>
  );
}

/** Typing filters the folder; Enter searches all subfolders (from This PC: the home folder). */
function SearchBox({
  ws,
  pane,
  split,
  title,
}: {
  ws: Workspace;
  pane: PaneModel;
  split: boolean;
  title: string;
}) {
  const loc = pane.loc;
  const [query, setQuery] = useState(loc?.kind === "search" ? loc.query : pane.filter);
  const focusList = () =>
    document.querySelector<HTMLElement>(`[data-pane-list="${pane.id}"]`)?.focus();
  return (
    <label className="relative ml-1 flex items-center">
      <span className="pointer-events-none absolute left-2.5 text-(--me-text-faint)">
        <SearchIcon size={14} />
      </span>
      <input
        type="search"
        data-pane-search={pane.id}
        className={`me-input pl-8 ${split ? "w-32 focus:w-44" : "w-56 focus:w-72"} transition-[width]`}
        placeholder={
          loc?.kind === "this-pc" ? "Search your home folder" : "Filter, Enter searches subfolders"
        }
        aria-label={`Search ${title}`}
        title="Typing filters this folder. Enter searches all subfolders."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (loc?.kind === "dir") pane.setFilter(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            pane.startSearch(
              query,
              loc?.kind === "this-pc" ? (ws.places.home ?? undefined) : undefined,
            );
          } else if (e.key === "Escape") {
            if (query) {
              setQuery("");
              if (loc?.kind === "dir") pane.setFilter("");
            } else focusList();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            focusList();
            if (pane.cursor < 0 && pane.view.length) pane.selectOnly(0);
          }
        }}
      />
    </label>
  );
}
