import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { formatBytes, formatDate, typeLabel } from "@/fs/format";
import { stem } from "@/fs/paths";
import type { FsEntry } from "@/fs/types";
import { ChevronRightIcon } from "@/theme/icons";
import { EntryIcon } from "./EntryIcon";
import type { PaneModel, SortKey } from "./model/pane";
import { useStore } from "./model/store";
import type { Workspace } from "./model/workspace";

const ROW_H = 32;
const PAD = 4;

interface Column {
  key: SortKey;
  label: string;
  width: string;
  align?: "right";
}

/** The columns that fit: narrow panes (split view) drop Type, then Folder and Date. */
function columnsFor(width: number, search: boolean): Column[] {
  const cols: Column[] = [{ key: "name", label: "Name", width: "minmax(10rem, 1fr)" }];
  if (search && width > 760)
    cols.push({ key: "folder", label: "Folder", width: "minmax(8rem, 0.8fr)" });
  if (width > 480) cols.push({ key: "date", label: "Date modified", width: "9.5rem" });
  if (width > (search ? 980 : 660)) cols.push({ key: "type", label: "Type", width: "10rem" });
  cols.push({ key: "size", label: "Size", width: "6.5rem", align: "right" });
  return cols;
}

interface Layout {
  cols: number;
  itemW: number;
  itemH: number;
  height: number;
}

function layoutFor(mode: "list" | "grid", count: number, width: number, iconSize: number): Layout {
  if (mode === "list")
    return { cols: 1, itemW: width, itemH: ROW_H, height: PAD * 2 + count * ROW_H };
  const avail = Math.max(100, width - 16);
  const cols = Math.max(1, Math.floor(avail / Math.max(iconSize + 28, 96)));
  const itemW = Math.floor(avail / cols);
  const itemH = iconSize + 60;
  return { cols, itemW, itemH, height: PAD * 2 + Math.ceil(count / cols) * itemH };
}

function positionOf(i: number, mode: "list" | "grid", l: Layout) {
  if (mode === "list") return { x: 0, y: PAD + i * ROW_H };
  return { x: 8 + (i % l.cols) * l.itemW, y: PAD + Math.floor(i / l.cols) * l.itemH };
}

/** The file list of one pane: a virtualized details list or icon grid. */
export function FileView({
  ws,
  pane,
  label,
  onContextMenu,
}: {
  ws: Workspace;
  pane: PaneModel;
  label: string;
  onContextMenu: (entry: FsEntry | null, e: MouseEvent<HTMLElement>) => void;
}) {
  useStore(pane);
  useStore(ws);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const typeAhead = useRef({ text: "", at: 0 });
  const dragged = useRef(false);

  const { view, mode, iconSize } = pane;
  const search = pane.loc?.kind === "search";
  const columns = columnsFor(size.width, search);
  const template = columns.map((c) => c.width).join(" ");
  const layout = layoutFor(mode, view.length, size.width, iconSize);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Back / forward restore the scroll position; a new folder starts at the top.
  useLayoutEffect(() => {
    const top = pane.takePendingScroll();
    // Setting scrollTop fires a scroll event, which updates the rendered range.
    if (scroller.current && top !== null) scroller.current.scrollTop = top;
  });

  // Keep the cursor in view after keyboard moves and selections from elsewhere.
  useEffect(() => {
    const el = scroller.current;
    if (!el || pane.cursor < 0) return;
    const { y } = positionOf(pane.cursor, mode, layout);
    if (y < el.scrollTop + PAD) el.scrollTop = y - PAD;
    else if (y + layout.itemH > el.scrollTop + el.clientHeight)
      el.scrollTop = y + layout.itemH - el.clientHeight + PAD;
    // Only on explicit reveal requests, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.revealSeq]);

  // Visible range (plus a margin) — only these rows exist in the DOM.
  const first =
    mode === "list"
      ? Math.max(0, Math.floor((scrollTop - PAD) / ROW_H) - 8)
      : Math.max(0, (Math.floor((scrollTop - PAD) / layout.itemH) - 1) * layout.cols);
  const last =
    mode === "list"
      ? Math.min(view.length - 1, Math.ceil((scrollTop + size.height) / ROW_H) + 8)
      : Math.min(
          view.length - 1,
          (Math.ceil((scrollTop + size.height) / layout.itemH) + 1) * layout.cols - 1,
        );
  const visible = view.slice(first, last + 1);

  function indexFromEvent(target: EventTarget | null): number | null {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-index]");
    if (!el || !scroller.current?.contains(el)) return null;
    return Number(el.dataset.index);
  }

  // ------------------------------------------------------------ mouse

  function onMouseDown(e: MouseEvent<HTMLDivElement>) {
    ws.setActivePane(pane);
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const i = indexFromEvent(e.target);
    if (e.button === 2) {
      if (i !== null && !pane.sel.has(view[i].path)) pane.selectOnly(i, false);
      return;
    }
    if (e.button !== 0) return;
    if (i !== null) {
      if (e.ctrlKey) pane.toggle(i);
      else if (e.shiftKey) pane.extendTo(i);
      else if (!pane.sel.has(view[i].path)) pane.selectOnly(i, false);
      else {
        // Keep a multi-selection for dragging; a plain click without drag selects just this one.
        dragged.current = false;
        const up = () => {
          window.removeEventListener("mouseup", up);
          if (!dragged.current) pane.selectOnly(i, false);
        };
        window.addEventListener("mouseup", up);
      }
      return;
    }
    startMarquee(e);
  }

  function startMarquee(e: MouseEvent<HTMLDivElement>) {
    const el = scroller.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (e.clientX - rect.left > el.clientWidth) return; // the scroll bar
    const toContent = (cx: number, cy: number) => ({
      x: cx - rect.left,
      y: cy - rect.top + el.scrollTop,
    });
    const start = toContent(e.clientX, e.clientY);
    const additive = e.ctrlKey || e.shiftKey;
    const base = additive ? new Set(pane.sel) : new Set<string>();
    if (!additive) pane.clearSelection();
    let last = { x: e.clientX, y: e.clientY };
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      const cur = toContent(last.x, last.y);
      const x1 = Math.min(start.x, cur.x);
      const x2 = Math.max(start.x, cur.x);
      const y1 = Math.min(start.y, cur.y);
      const y2 = Math.max(start.y, cur.y);
      if (Math.abs(x2 - x1) < 4 && Math.abs(y2 - y1) < 4) return;
      setMarquee({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      const hits = hitTest(x1, y1, x2, y2);
      const sel = new Set(base);
      for (const i of hits) {
        const p = view[i].path;
        if (e.ctrlKey && base.has(p)) sel.delete(p);
        else sel.add(p);
      }
      pane.setSelection(sel, hits.length ? hits[hits.length - 1] : pane.cursor);
    };
    const move = (ev: globalThis.MouseEvent) => {
      last = { x: ev.clientX, y: ev.clientY };
      update();
      clearInterval(timer);
      const r = el.getBoundingClientRect();
      const dir = ev.clientY < r.top + 20 ? -1 : ev.clientY > r.bottom - 20 ? 1 : 0;
      if (dir) {
        timer = setInterval(() => {
          el.scrollTop += dir * 18;
          update();
        }, 16);
      }
    };
    const up = () => {
      clearInterval(timer);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setMarquee(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function hitTest(x1: number, y1: number, x2: number, y2: number): number[] {
    const out: number[] = [];
    const n = view.length;
    if (mode === "list") {
      const from = Math.max(0, Math.floor((y1 - PAD) / ROW_H));
      const to = Math.min(n - 1, Math.floor((y2 - PAD) / ROW_H));
      for (let i = from; i <= to; i++) out.push(i);
      return out;
    }
    const c1 = Math.max(0, Math.floor((x1 - 8) / layout.itemW));
    const c2 = Math.min(layout.cols - 1, Math.floor((x2 - 8) / layout.itemW));
    const r1 = Math.max(0, Math.floor((y1 - PAD) / layout.itemH));
    const r2 = Math.floor((y2 - PAD) / layout.itemH);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const i = r * layout.cols + c;
        if (i < n) out.push(i);
      }
    }
    return out;
  }

  function onDoubleClick(e: MouseEvent<HTMLDivElement>) {
    const i = indexFromEvent(e.target);
    if (i !== null) void ws.openEntries(pane, [view[i]]);
  }

  function onAuxClick(e: MouseEvent<HTMLDivElement>) {
    const i = indexFromEvent(e.target);
    if (e.button === 1 && i !== null && view[i].isDir) {
      e.preventDefault();
      void ws.newTab(view[i].path, { background: true });
    }
  }

  // ------------------------------------------------------------ keyboard

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const n = view.length;
    const cur = pane.cursor;
    const step = mode === "grid" ? layout.cols : 1;
    const page = Math.max(1, Math.floor(size.height / layout.itemH)) * step;
    const ctrl = e.ctrlKey || e.metaKey;
    const go = (to: number) => pane.moveCursor(cur < 0 ? 0 : to, e.shiftKey, ctrl);
    let handled = true;
    switch (e.key) {
      case "ArrowDown":
        go(cur + step);
        break;
      case "ArrowUp":
        go(cur - step);
        break;
      case "ArrowRight":
        if (mode === "grid" && !e.altKey) go(cur + 1);
        else handled = false;
        break;
      case "ArrowLeft":
        if (mode === "grid" && !e.altKey) go(cur - 1);
        else handled = false;
        break;
      case "Home":
        pane.moveCursor(0, e.shiftKey, ctrl);
        break;
      case "End":
        pane.moveCursor(n - 1, e.shiftKey, ctrl);
        break;
      case "PageDown":
        go(cur + page);
        break;
      case "PageUp":
        go(cur - page);
        break;
      case "Enter":
        if (e.altKey) handled = false;
        else if (pane.selected().length)
          void ws.openEntries(pane, pane.selected(), { newTab: ctrl });
        break;
      case "Backspace":
        pane.back();
        break;
      case "Escape":
        if (pane.filter) pane.setFilter("");
        else pane.clearSelection();
        break;
      default:
        handled = false;
    }
    if (!handled && e.key.length === 1 && !ctrl && !e.altKey) {
      const now = Date.now();
      const ta = typeAhead.current;
      if (e.key === " " && (!ta.text || now - ta.at > 900)) return; // Space is Quick Look (App handles it).
      ta.text = now - ta.at > 900 ? e.key : ta.text + e.key;
      ta.at = now;
      pane.jumpTo(ta.text);
      handled = true;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ------------------------------------------------------------ drag and drop

  function onDragStart(e: DragEvent<HTMLDivElement>) {
    const i = indexFromEvent(e.target);
    e.preventDefault();
    if (i === null) return;
    if (!pane.sel.has(view[i].path)) pane.selectOnly(i, false);
    dragged.current = true;
    ws.startDrag(pane.selected().map((x) => x.path));
  }

  function dropDir(target: EventTarget | null): string | null {
    const i = indexFromEvent(target);
    if (i !== null && view[i].isDir && !pane.sel.has(view[i].path)) return view[i].path;
    return pane.path;
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    const dir = dropDir(e.target);
    if (!dir) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = ws.dropEffect(e, dir);
    setDropTarget(dir);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    const dir = dropDir(e.target);
    setDropTarget(null);
    if (!dir) return;
    e.preventDefault();
    void ws.drop([...e.dataTransfer.files], e, dir);
  }

  // ------------------------------------------------------------ render

  const showSizes = ws.settings.folderSizes;
  const sizeText = (entry: FsEntry) => {
    if (!entry.isDir) return formatBytes(entry.size ?? 0);
    if (!showSizes) return "";
    const s = ws.folderSize(entry.path);
    return s ? formatBytes(s.size) : "…";
  };

  const nameNode = (entry: FsEntry) => {
    if (pane.renaming === entry.path) return <RenameInput ws={ws} pane={pane} entry={entry} />;
    const showExt = ws.settings.showExtensions;
    if (entry.isDir || !entry.ext) return <span className="truncate">{entry.name}</span>;
    if (!showExt) return <span className="truncate">{stem(entry.name)}</span>;
    return (
      <span className="truncate">
        {stem(entry.name)}
        <span className="text-(--me-text-faint)">{entry.name.slice(stem(entry.name).length)}</span>
      </span>
    );
  };

  const isList = mode === "list";
  const empty = !view.length && !pane.busy && !(search && pane.search?.running);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isList && (
        <div
          role="presentation"
          className="grid shrink-0 border-b border-(--me-border) px-2 text-[0.6875rem] font-semibold tracking-[0.06em] text-(--me-text-muted) uppercase"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => pane.toggleSort(c.key)}
              className={`flex h-8 items-center gap-1 px-2.5 uppercase hover:text-(--me-text) ${c.align === "right" ? "justify-end" : ""} ${pane.sort.key === c.key ? "text-(--me-text)" : ""}`}
              aria-label={`Sort by ${c.label}`}
            >
              {c.label}
              {pane.sort.key === c.key && (
                <span className={pane.sort.dir === "asc" ? "-rotate-90" : "rotate-90"}>
                  <ChevronRightIcon size={10} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <div
        ref={scroller}
        role="grid"
        aria-label={label}
        aria-multiselectable="true"
        aria-rowcount={view.length}
        tabIndex={0}
        data-pane-list={pane.id}
        className={`relative min-h-0 flex-1 overflow-auto outline-none ${dropTarget && dropTarget === pane.path ? "shadow-[inset_0_0_0_2px_var(--me-accent)]" : ""}`}
        onScroll={(e) => {
          setScrollTop(e.currentTarget.scrollTop);
          pane.rememberScroll(e.currentTarget.scrollTop);
        }}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onAuxClick={onAuxClick}
        onMouseUp={(e) => {
          if (e.button === 3) pane.back();
          if (e.button === 4) pane.forward();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const i = indexFromEvent(e.target);
          onContextMenu(i === null ? null : view[i], e);
        }}
        onKeyDown={onKeyDown}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!scroller.current?.contains(e.relatedTarget as Node)) setDropTarget(null);
        }}
        onDrop={onDrop}
      >
        <div style={{ height: layout.height, position: "relative" }}>
          {visible.map((entry, k) => {
            const i = first + k;
            const { x, y } = positionOf(i, mode, layout);
            const selected = pane.sel.has(entry.path);
            const classes = [
              "absolute flex rounded-[0.6rem] transition-colors duration-100",
              selected
                ? "bg-(--me-selected) shadow-[inset_0_0_0_1px_rgb(185_174_251/0.35)]"
                : "hover:bg-(--me-hover)",
              i === pane.cursor && !selected
                ? "shadow-[inset_0_0_0_1px_var(--me-border-strong)]"
                : "",
              dropTarget === entry.path ? "shadow-[inset_0_0_0_2px_var(--me-accent)]" : "",
              ws.isCut(entry.path) ? "opacity-45" : entry.hidden ? "opacity-60" : "",
            ].join(" ");
            if (isList) {
              return (
                <div
                  key={entry.path}
                  role="row"
                  aria-rowindex={i + 1}
                  aria-selected={selected}
                  data-index={i}
                  data-path={entry.path}
                  draggable={pane.renaming !== entry.path}
                  className={`${classes} grid items-center text-[0.8125rem] tabular-nums`}
                  style={{
                    top: y,
                    left: 8,
                    right: 8,
                    height: ROW_H,
                    gridTemplateColumns: template,
                  }}
                >
                  {columns.map((c) => (
                    <div
                      key={c.key}
                      role="gridcell"
                      className={`min-w-0 truncate px-2.5 ${c.key === "name" ? "flex items-center gap-2.5" : "text-(--me-text-muted)"} ${c.align === "right" ? "text-right" : ""}`}
                    >
                      {c.key === "name" && (
                        <>
                          <span className="inline-flex size-[18px] shrink-0 items-center justify-center">
                            <EntryIcon bridge={ws.bridge} entry={entry} size={17} />
                          </span>
                          {nameNode(entry)}
                        </>
                      )}
                      {c.key === "folder" && (
                        <span title={entry.path}>{pane.relativeFolder(entry)}</span>
                      )}
                      {c.key === "date" && formatDate(entry.mtime)}
                      {c.key === "type" && typeLabel(entry)}
                      {c.key === "size" && sizeText(entry)}
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div
                key={entry.path}
                role="row"
                aria-rowindex={i + 1}
                aria-selected={selected}
                data-index={i}
                data-path={entry.path}
                draggable={pane.renaming !== entry.path}
                title={entry.name}
                className={`${classes} flex-col items-center gap-1.5 px-1.5 pt-2 pb-1 text-center text-xs`}
                style={{ top: y, left: x, width: layout.itemW - 6, height: layout.itemH - 6 }}
              >
                <span
                  role="gridcell"
                  className="flex shrink-0 items-center justify-center"
                  style={{ width: iconSize, height: iconSize }}
                >
                  <EntryIcon
                    bridge={ws.bridge}
                    entry={entry}
                    size={Math.round(iconSize * 0.62)}
                    thumbnail
                  />
                </span>
                <span className="line-clamp-2 w-full break-words">{nameNode(entry)}</span>
              </div>
            );
          })}
          {marquee && (
            <div
              className="pointer-events-none absolute rounded-[3px] border border-(--me-accent) bg-[rgb(185_174_251/0.14)]"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
            />
          )}
        </div>
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 p-6 text-center text-sm text-(--me-text-muted)">
            {pane.filter ? (
              <>
                <strong className="font-semibold text-(--me-text)">
                  Nothing matches “{pane.filter}”
                </strong>
                <span>Press Enter to search all subfolders.</span>
              </>
            ) : search ? (
              <>
                <strong className="font-semibold text-(--me-text)">No results</strong>
                <span>
                  Try fewer words, a pattern like *.pdf, or turn on “Search file contents”.
                </span>
              </>
            ) : (
              <>
                <strong className="font-semibold text-(--me-text)">This folder is empty</strong>
                <span>Drop files here or press Ctrl+Shift+N for a new folder.</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The inline name editor; selects the name without its extension. */
function RenameInput({ ws, pane, entry }: { ws: Workspace; pane: PaneModel; entry: FsEntry }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    const dot = entry.isDir ? -1 : entry.name.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : entry.name.length);
  }, [entry]);

  function finish(commit: boolean) {
    if (done.current) return;
    done.current = true;
    const value = ref.current?.value.trim() ?? "";
    pane.setRenaming(null);
    document.querySelector<HTMLElement>(`[data-pane-list="${pane.id}"]`)?.focus();
    if (commit && value && value !== entry.name) void ws.renamePath(entry.path, value, pane);
  }

  return (
    <input
      ref={ref}
      aria-label="New name"
      defaultValue={entry.name}
      spellCheck={false}
      className="me-input h-6 w-full min-w-0 px-1.5"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => finish(true)}
    />
  );
}
