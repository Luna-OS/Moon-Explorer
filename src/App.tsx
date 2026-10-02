import { useMemo, useState, type ReactNode } from "react";
import { Sky } from "@/theme/Sky";
import { MoonPhase } from "@/theme/MoonPhase";
import { useDocumentTheme, type ThemeChoice } from "@/theme/useTheme";
import {
  BackIcon,
  ChevronRightIcon,
  DiskIcon,
  DownloadIcon,
  FolderIcon,
  ForwardIcon,
  GridIcon,
  HomeIcon,
  ImageIcon,
  ListIcon,
  MediaIcon,
  MoonIcon,
  PlusIcon,
  ReloadIcon,
  SearchIcon,
  StarIcon,
  UpIcon,
} from "@/theme/icons";
import { KindIcon } from "@/explorer/KindIcon";
import { DRIVES, ENTRIES, PLACES, formatBytes, type Drive } from "@/explorer/sample";

const PLACE_ICONS: Record<string, ReactNode> = {
  home: <HomeIcon />,
  desktop: <StarIcon />,
  documents: <FolderIcon />,
  downloads: <DownloadIcon />,
  pictures: <ImageIcon />,
  music: <MediaIcon />,
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

type ViewMode = "list" | "grid";

export default function App() {
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(loadThemeChoice);
  useDocumentTheme(themeChoice);

  const [placeId, setPlaceId] = useState("documents");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>("tokens.css");

  const place = PLACES.find((p) => p.id === placeId) ?? PLACES[0];
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ENTRIES.filter((e) => e.name.toLowerCase().includes(q)) : ENTRIES;
  }, [query]);
  const selectedEntry = entries.find((e) => e.name === selected);
  const system = DRIVES[0];

  function chooseTheme(choice: ThemeChoice) {
    setThemeChoice(choice);
    saveThemeChoice(choice);
  }

  return (
    <div className="relative flex h-full flex-col">
      <Sky />

      {/* Custom title bar: navigation + path + search. The right edge stays
       * free for the native window buttons (see theme/frame-colors.ts). */}
      <header className="me-titlebar relative z-10 flex h-10 shrink-0 items-center gap-1 pr-[138px] pl-3">
        <img src="/moon-explorer-logo.svg" alt="" className="mr-2 size-5" />
        <button type="button" className="me-icon-btn" aria-label="Back" title="Back (Alt+Left)">
          <BackIcon />
        </button>
        <button
          type="button"
          className="me-icon-btn"
          aria-label="Forward"
          title="Forward (Alt+Right)"
          disabled
        >
          <ForwardIcon />
        </button>
        <button type="button" className="me-icon-btn" aria-label="Up" title="Up (Alt+Up)">
          <UpIcon />
        </button>
        <button type="button" className="me-icon-btn" aria-label="Refresh" title="Refresh (F5)">
          <ReloadIcon />
        </button>

        <nav
          aria-label="Path"
          className="me-inset mx-2 flex h-8 min-w-0 flex-1 items-center gap-0.5 px-1.5 text-[0.8125rem]"
        >
          <span className="px-1 text-(--me-text-faint)">
            <DiskIcon size={14} />
          </span>
          {[system.letter, "Users", ...place.path].map((part, i, all) => (
            <span key={`${part}-${i}`} className="flex items-center gap-0.5">
              {i > 0 && (
                <span className="text-(--me-text-faint)">
                  <ChevronRightIcon size={12} />
                </span>
              )}
              <button
                type="button"
                className="me-crumb"
                aria-current={i === all.length - 1 ? "page" : undefined}
              >
                {part}
              </button>
            </span>
          ))}
        </nav>

        <label className="relative flex items-center">
          <span className="pointer-events-none absolute left-2.5 text-(--me-text-faint)">
            <SearchIcon size={14} />
          </span>
          <input
            type="search"
            className="me-input w-56 pl-8"
            placeholder={`Search ${place.label}`}
            aria-label={`Search ${place.label}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[14.5rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-6 overflow-y-auto border-r border-(--me-border) bg-(--me-glass-bottom) px-3 py-5 backdrop-blur-md">
          <div className="flex items-center gap-3 px-2">
            <img
              src="/moon-explorer-logo.svg"
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
            {PLACES.map((p) => {
              const current = p.id === placeId;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-current={current ? "page" : undefined}
                  onClick={() => setPlaceId(p.id)}
                  className={`flex h-9 items-center gap-3 rounded-[0.7rem] px-3 text-sm font-medium transition-colors duration-150 ${
                    current
                      ? "bg-(--me-selected) text-(--me-accent) shadow-[inset_0_0_0_1px_rgb(185_174_251/0.3)]"
                      : "text-(--me-text-muted) hover:bg-(--me-hover) hover:text-(--me-text)"
                  }`}
                >
                  {PLACE_ICONS[p.id]}
                  <span className="flex-1 text-left">{p.label}</span>
                </button>
              );
            })}
          </nav>

          <section aria-label="Drives" className="flex flex-col gap-2">
            <div className="me-eyebrow px-3">Drives</div>
            {DRIVES.map((d) => (
              <DriveGauge key={d.id} drive={d} />
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
          </fieldset>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight">{place.label}</h2>
              <p className="text-sm text-(--me-text-muted)">
                {entries.length} items{query && ` matching “${query}”`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1" role="group" aria-label="View">
                <button
                  type="button"
                  className="me-btn me-btn-ghost me-btn-icon"
                  aria-pressed={viewMode === "list"}
                  aria-label="Details view"
                  onClick={() => setViewMode("list")}
                >
                  <ListIcon />
                </button>
                <button
                  type="button"
                  className="me-btn me-btn-ghost me-btn-icon"
                  aria-pressed={viewMode === "grid"}
                  aria-label="Icon view"
                  onClick={() => setViewMode("grid")}
                >
                  <GridIcon />
                </button>
              </div>
              <button type="button" className="me-btn me-btn-primary">
                <PlusIcon />
                New folder
              </button>
            </div>
          </div>

          <main className="min-h-0 flex-1 px-6 pb-4">
            <div className="me-glass h-full overflow-auto">
              {viewMode === "list" ? (
                <table className="me-table" aria-label={`Contents of ${place.label}`}>
                  <thead>
                    <tr>
                      <th className="w-[46%] rounded-tl-[var(--radius-lg)] pl-4">Name</th>
                      <th>Date modified</th>
                      <th>Type</th>
                      <th className="rounded-tr-[var(--radius-lg)] pr-4 text-right">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr
                        key={e.name}
                        aria-selected={selected === e.name}
                        onClick={() => setSelected(e.name)}
                        className="cursor-default"
                      >
                        <td className="pl-4">
                          <span className="flex items-center gap-2.5">
                            <KindIcon kind={e.kind} />
                            <span className="truncate">{e.name}</span>
                          </span>
                        </td>
                        <td className="text-(--me-text-muted)">{e.modified}</td>
                        <td className="text-(--me-text-muted)">{e.type}</td>
                        <td className="pr-4 text-right text-(--me-text-muted)">
                          {e.size === undefined ? "" : formatBytes(e.size)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <ul
                  className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 p-3"
                  aria-label={`Contents of ${place.label}`}
                >
                  {entries.map((e) => (
                    <li key={e.name}>
                      <button
                        type="button"
                        onClick={() => setSelected(e.name)}
                        aria-pressed={selected === e.name}
                        className={`flex w-full flex-col items-center gap-2 rounded-(--radius-md) px-2 py-3 text-xs transition-colors duration-150 ${
                          selected === e.name
                            ? "bg-(--me-selected) shadow-[inset_0_0_0_1px_rgb(185_174_251/0.3)]"
                            : "hover:bg-(--me-hover)"
                        }`}
                      >
                        <KindIcon kind={e.kind} size={36} />
                        <span className="line-clamp-2 text-center break-all">{e.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </main>

          <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-(--me-border) bg-(--me-glass-bottom) px-6 py-2 text-xs text-(--me-text-muted) tabular-nums backdrop-blur-md">
            <span>{entries.length} items</span>
            {selectedEntry && (
              <span>
                1 selected
                {selectedEntry.size !== undefined && ` · ${formatBytes(selectedEntry.size)}`}
              </span>
            )}
            <span className="ml-auto">
              {formatBytes(system.total - system.used, 0)} free on {system.label} ({system.letter})
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}

/** A drive in the sidebar: its fill as a moon phase plus a meter. */
function DriveGauge({ drive }: { drive: Drive }) {
  const fraction = drive.used / drive.total;
  return (
    <button type="button" className="me-inset flex items-center gap-3 px-3 py-2 text-left">
      <MoonPhase fraction={fraction} size={30} />
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
          {formatBytes(drive.total - drive.used, 0)} free of {formatBytes(drive.total, 0)}
        </div>
      </div>
    </button>
  );
}
