import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { DriveIcon } from "@/drive-icons/DriveIcon";
import { compareNames } from "@/fs/format";
import { ancestors, basename, expandPath, isRoot, join, normalize } from "@/fs/paths";
import { ChevronRightIcon, ComputerIcon, FolderIcon, SearchIcon } from "@/theme/icons";
import { ContextMenu } from "@/ui/ContextMenu";
import type { MenuAnchor } from "@/ui/menu";
import type { PaneModel } from "./model/pane";
import type { Workspace } from "./model/workspace";

/**
 * The path as clickable segments. The arrow after a segment lists its
 * subfolders; clicking the empty space (or Ctrl+L) turns it into a text
 * field with folder completion that understands %VARS%, ~ and shell: names.
 */
export function PathBar({ ws, pane }: { ws: Workspace; pane: PaneModel }) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<{
    anchor: MenuAnchor;
    dir: string | null;
    names: string[];
  } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(600);

  const loc = pane.loc;
  const base = loc?.kind === "dir" ? loc.path : loc?.kind === "search" ? loc.root : null;
  const segments = base ? ancestors(base) : [];
  const drive = base ? ws.driveFor(base) : undefined;

  useEffect(() => {
    const onEdit = (e: Event) => {
      if ((e as CustomEvent<string>).detail === pane.id) setEditing(true);
    };
    window.addEventListener("moon:edit-path", onEdit);
    return () => window.removeEventListener("moon:edit-path", onEdit);
  }, [pane.id]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const ro = new ResizeObserver(() => setWidth(nav.clientWidth));
    ro.observe(nav);
    return () => ro.disconnect();
  }, [editing]);

  async function openSubfolders(anchorEl: HTMLElement, dir: string) {
    const names = await ws.bridge.subdirs(dir).catch(() => []);
    const r = anchorEl.getBoundingClientRect();
    setMenu({
      anchor: { x: r.left, y: r.bottom + 4, returnFocusTo: anchorEl },
      dir,
      names: names.sort(compareNames),
    });
  }

  if (editing) return <PathInput ws={ws} pane={pane} onDone={() => setEditing(false)} />;

  const label = (seg: string) => (isRoot(seg) && drive ? ws.driveLabel(drive) : basename(seg));
  // Long paths: fold the leading segments into "…" until the rest fits (widths are estimated from the text).
  const available = width - 90 - (loc?.kind === "search" ? 140 : 0);
  let hidden = 0;
  let used = segments.reduce((sum, seg) => sum + label(seg).length * 7.4 + 34, 0);
  while (used > available && hidden < segments.length - 1) {
    used -= label(segments[hidden]).length * 7.4 + 34;
    hidden++;
  }
  return (
    <nav
      ref={navRef}
      aria-label="Path"
      className="me-inset flex h-8 min-w-0 flex-1 items-center gap-0.5 overflow-hidden px-1.5 text-[0.8125rem]"
    >
      <button
        type="button"
        className="me-crumb flex shrink-0 items-center gap-1.5 text-(--me-text-faint)"
        aria-label="Go to This PC"
        onClick={() => void pane.go({ kind: "this-pc" })}
      >
        {drive ? <DriveIcon drive={drive} size={14} /> : <ComputerIcon size={14} />}
        {!base && <span className="text-(--me-text)">This PC</span>}
      </button>
      {hidden > 0 && (
        <button
          type="button"
          className="me-crumb shrink-0"
          aria-label="Earlier folders"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({
              anchor: { x: r.left, y: r.bottom + 4, returnFocusTo: e.currentTarget },
              dir: null,
              names: segments.slice(0, hidden).reverse(),
            });
          }}
        >
          …
        </button>
      )}
      {segments.map((seg, i) =>
        i < hidden ? null : (
          <span key={seg} className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className="me-crumb !px-1 text-(--me-text-faint)"
              aria-label={`Folders in ${label(seg)}`}
              onClick={(e) => void openSubfolders(e.currentTarget, seg)}
            >
              <ChevronRightIcon size={12} />
            </button>
            <button
              type="button"
              className="me-crumb max-w-56 truncate"
              title={seg}
              aria-current={i === segments.length - 1 && loc?.kind === "dir" ? "page" : undefined}
              onClick={() => void pane.go(seg)}
              onAuxClick={(e) => {
                if (e.button === 1) void ws.newTab(seg, { background: true });
              }}
            >
              {label(seg)}
            </button>
          </span>
        ),
      )}
      {loc?.kind === "search" && (
        <span className="flex shrink-0 items-center gap-1 pl-1 text-(--me-text)">
          <ChevronRightIcon size={12} />
          <SearchIcon size={13} />“{loc.query}”
        </span>
      )}
      <button
        type="button"
        aria-label="Edit path"
        title="Edit path (Ctrl+L)"
        className="h-full min-w-4 flex-1 cursor-text"
        onClick={() => setEditing(true)}
      />
      {menu && (
        <ContextMenu
          label={menu.dir ? `Folders in ${basename(menu.dir)}` : "Earlier folders"}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          items={
            menu.names.length
              ? menu.names.slice(0, 300).map((name) => ({
                  label: menu.dir ? name : label(name),
                  icon: <FolderIcon size={15} />,
                  onSelect: () => void pane.go(menu.dir ? join(menu.dir, name) : name),
                }))
              : [{ label: "No subfolders", disabled: true, onSelect: () => {} }]
          }
        />
      )}
    </nav>
  );
}

function PathInput({ ws, pane, onDone }: { ws: Workspace; pane: PaneModel; onDone: () => void }) {
  const [value, setValue] = useState(pane.workDir ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [hot, setHot] = useState(-1);
  const ref = useRef<HTMLInputElement>(null);
  const cache = useRef<{ dir: string; names: string[] } | null>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  async function suggest(raw: string) {
    const full = expandPath(raw, ws.env, ws.places);
    const cut = full.lastIndexOf("\\");
    if (cut < 0) {
      setSuggestions([]);
      return;
    }
    const parent = full.slice(0, cut + 1);
    const prefix = full.slice(cut + 1).toLowerCase();
    if (cache.current?.dir !== parent) {
      const names = await ws.bridge.subdirs(parent).catch(() => []);
      cache.current = { dir: parent, names: names.sort(compareNames) };
    }
    const names = cache.current.names;
    const starts = names.filter((n) => n.toLowerCase().startsWith(prefix));
    const contains = prefix
      ? names.filter((n) => !n.toLowerCase().startsWith(prefix) && n.toLowerCase().includes(prefix))
      : [];
    setSuggestions([...starts, ...contains].slice(0, 10).map((n) => parent + n));
    setHot(-1);
  }

  async function commit(raw: string) {
    onDone();
    const text = raw.trim();
    if (!text) return;
    if (/^(this pc|computer)$/i.test(text)) {
      void pane.go({ kind: "this-pc" });
      return;
    }
    const p = normalize(expandPath(text, ws.env, ws.places));
    if (await ws.bridge.isDir(p)) {
      void pane.go(p);
      return;
    }
    if (await ws.bridge.exists(p)) {
      const parent = p.slice(0, p.lastIndexOf("\\")) || p;
      if (await pane.go(parent, { select: p })) void ws.bridge.open(p);
      return;
    }
    ws.toast(`"${text}" was not found.`, { error: true });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (e.key === "Escape") onDone();
    else if (e.key === "Enter") void commit(hot >= 0 ? suggestions[hot] : value);
    else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && suggestions.length) {
      e.preventDefault();
      const next =
        (hot + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length;
      setHot(next);
      setValue(suggestions[next]);
    } else if (e.key === "Tab" && suggestions.length) {
      e.preventDefault();
      const next = `${suggestions[Math.max(0, hot)]}\\`;
      setValue(next);
      void suggest(next);
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={ref}
        className="me-input w-full"
        aria-label="Path"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          void suggest(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(onDone, 120)}
      />
      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Folder suggestions"
          className="me-popover absolute top-9 right-0 left-0 z-40 p-1.5"
        >
          {suggestions.map((s, i) => (
            <li key={s} role="option" aria-selected={i === hot}>
              <button
                type="button"
                tabIndex={-1}
                className={`me-menu-item w-full ${i === hot ? "bg-(--me-selected)" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void commit(s);
                }}
              >
                <FolderIcon size={15} />
                <span className="truncate">{basename(s)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
