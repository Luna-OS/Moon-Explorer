import { useEffect, useState, type ReactNode } from "react";
import { formatBytes, formatDate, formatDuration, kindOf, plural, typeLabel } from "@/fs/format";
import { dirname } from "@/fs/paths";
import type { FsEntry, MoonBridge } from "@/fs/types";
import { EditIcon, FolderIcon } from "@/theme/icons";
import { KindIcon } from "./KindIcon";
import type { PaneModel } from "./model/pane";
import { useStore } from "./model/store";
import type { Workspace } from "./model/workspace";

const IMAGE = new Set(["png", "jpg", "jpeg", "jfif", "gif", "webp", "bmp", "svg", "ico", "avif"]);
const VIDEO = new Set(["mp4", "webm", "mkv", "mov", "m4v", "ogv"]);
const AUDIO = new Set(["mp3", "wav", "flac", "ogg", "oga", "m4a", "aac", "opus"]);
const FONT = new Set(["ttf", "otf", "woff", "woff2"]);
const TEXT = new Set(
  (
    "txt md markdown log ini cfg conf toml yml yaml json jsonc xml csv tsv js mjs cjs ts tsx jsx html htm css scss sass less " +
    "py rb php java kt c h cpp hpp cc cs go rs swift lua sh bash ps1 psm1 bat cmd sql vue svelte astro gitignore env properties gradle srt vtt nfo reg"
  ).split(" "),
);

export type InfoRow = [label: string, value: string];

let fontSeq = 0;

/**
 * The best preview of one entry: the image, a player, the PDF viewer, a font
 * sample, the text, or Windows' thumbnail. `onInfo` receives facts learned
 * while loading (dimensions, duration, line count).
 */
export function MediaPreview({
  bridge,
  entry,
  large = false,
  onInfo,
}: {
  bridge: MoonBridge;
  entry: FsEntry;
  large?: boolean;
  onInfo?: (row: InfoRow) => void;
}) {
  const [content, setContent] = useState<ReactNode>(null);
  const url = bridge.kind === "electron" ? bridge.fileUrl(entry.path) : "";
  const ext = entry.ext;

  useEffect(() => {
    let live = true;
    const show = (node: ReactNode) => live && setContent(node);
    const thumbnail = async () => {
      const src = await bridge.thumbnail(entry.path, large ? 1024 : 512).catch(() => null);
      if (src) show(<img src={src} alt="" className="max-h-full max-w-full object-contain" />);
    };
    if (entry.isDir) {
      void bridge
        .list(entry.path)
        .then((items) => {
          const dirs = items.filter((i) => i.isDir).length;
          if (live)
            onInfo?.([
              "Contains",
              `${plural(dirs, "folder")}, ${plural(items.length - dirs, "file")}`,
            ]);
        })
        .catch(() => {});
    } else if (url && IMAGE.has(ext)) {
      show(
        <img
          src={url}
          alt=""
          className="max-h-full max-w-full object-contain"
          onLoad={(e) =>
            onInfo?.([
              "Dimensions",
              `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px`,
            ])
          }
          onError={() => void thumbnail()}
        />,
      );
    } else if (url && VIDEO.has(ext)) {
      show(
        <video
          src={url}
          controls
          autoPlay={large}
          preload="metadata"
          className="max-h-full max-w-full"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (Number.isFinite(v.duration)) onInfo?.(["Length", formatDuration(v.duration)]);
            if (v.videoWidth) onInfo?.(["Resolution", `${v.videoWidth} × ${v.videoHeight}`]);
          }}
          onError={() => void thumbnail()}
        >
          <track kind="captions" />
        </video>,
      );
    } else if (url && AUDIO.has(ext)) {
      show(
        <div className="flex w-full flex-col items-center gap-4 p-4">
          <KindIcon kind="media" size={large ? 96 : 56} />
          <audio
            src={url}
            controls
            autoPlay={large}
            preload="metadata"
            className="w-full"
            onLoadedMetadata={(e) => {
              if (Number.isFinite(e.currentTarget.duration))
                onInfo?.(["Length", formatDuration(e.currentTarget.duration)]);
            }}
          >
            <track kind="captions" />
          </audio>
        </div>,
      );
    } else if (url && ext === "pdf") {
      show(
        <iframe
          title={entry.name}
          src={`${url}#toolbar=${large ? 1 : 0}&navpanes=0&view=FitH`}
          className="h-full min-h-[24rem] w-full bg-white"
        />,
      );
    } else if (url && FONT.has(ext)) {
      const family = `moon-preview-${++fontSeq}`;
      const face = new FontFace(family, `url("${url}")`);
      void face
        .load()
        .then(() => {
          document.fonts.add(face);
          show(
            <div
              className="p-5 text-center leading-snug"
              style={{ fontFamily: family, fontSize: large ? 48 : 26 }}
            >
              Moon Explorer
              <br />
              Aa Bb Cc 0123
              <div className="mt-2 text-sm text-(--me-text-muted)">
                The quick brown fox jumps over the lazy dog
              </div>
            </div>,
          );
        })
        .catch(() => void thumbnail());
    } else if (TEXT.has(ext) || (!ext && (entry.size ?? 0) < 512 * 1024)) {
      void bridge
        .readText(entry.path, large ? 1024 * 1024 : 96 * 1024)
        .then((r) => {
          if (r.binary) return thumbnail();
          let text = r.text;
          if (ext === "json") {
            try {
              text = JSON.stringify(JSON.parse(text), null, 2);
            } catch {
              // Keep invalid JSON as it is.
            }
          }
          onInfo?.([
            "Lines",
            `${text.split("\n").length.toLocaleString("en-US")}${r.truncated ? "+" : ""}`,
          ]);
          show(
            <pre className="h-full w-full overflow-auto p-3 font-mono text-[0.75rem] leading-relaxed whitespace-pre select-text">
              {text}
              {r.truncated ? "\n\n… (truncated)" : ""}
            </pre>,
          );
        })
        .catch(() => void thumbnail());
    } else if (bridge.kind === "electron") {
      void thumbnail();
    }
    return () => {
      live = false;
    };
    // onInfo is a fresh callback each render; the preview depends on the entry only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, entry.path, entry.mtime, large]);

  return (
    content ?? (
      <span className="grid place-items-center p-8">
        <KindIcon kind={kindOf(entry)} size={large ? 160 : 72} />
      </span>
    )
  );
}

/** The right-hand panel: a preview and facts about the selection (or the current folder). */
export function PreviewPanel({ ws, pane }: { ws: Workspace; pane: PaneModel }) {
  useStore(pane);
  const selected = pane.selected();
  const one = selected.length === 1 ? selected[0] : null;
  return (
    <aside
      aria-label="Preview"
      className="me-glass flex w-80 shrink-0 flex-col gap-3 overflow-y-auto p-4 text-sm"
    >
      {one ? (
        <SinglePreview key={one.path} ws={ws} pane={pane} entry={one} />
      ) : selected.length > 1 ? (
        <MultiPreview ws={ws} pane={pane} entries={selected} />
      ) : (
        <FolderSummary ws={ws} pane={pane} />
      )}
    </aside>
  );
}

function InfoList({ rows }: { rows: InfoRow[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-(--me-text-faint)">{k}</dt>
          <dd className="m-0 break-all text-(--me-text) select-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SinglePreview({ ws, pane, entry }: { ws: Workspace; pane: PaneModel; entry: FsEntry }) {
  const [extra, setExtra] = useState<InfoRow[]>([]);
  const folderSize = entry.isDir ? ws.folderSizes.get(entry.path) : undefined;
  const rows: InfoRow[] = [
    ...extra,
    [
      "Size",
      entry.isDir
        ? folderSize
          ? `${formatBytes(folderSize.size)} (${plural(folderSize.files, "file")})`
          : "–"
        : `${formatBytes(entry.size ?? 0)}${(entry.size ?? 0) >= 1024 ? ` (${(entry.size ?? 0).toLocaleString("en-US")} bytes)` : ""}`,
    ],
    ["Modified", formatDate(entry.mtime, false)],
    ["Created", formatDate(entry.ctime, false)],
    ["Location", dirname(entry.path) ?? ""],
  ];
  return (
    <>
      <div className="grid h-56 shrink-0 place-items-center overflow-hidden rounded-(--radius-md) border border-(--me-border) bg-(--me-inset)">
        <MediaPreview
          bridge={ws.bridge}
          entry={entry}
          onInfo={(row) => setExtra((rows) => [...rows.filter(([k]) => k !== row[0]), row])}
        />
      </div>
      <div>
        <h3 className="m-0 text-[0.9375rem] font-semibold break-words select-text">{entry.name}</h3>
        <p className="m-0 text-xs text-(--me-text-muted)">{typeLabel(entry)}</p>
      </div>
      <InfoList rows={rows} />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="me-btn me-btn-ghost me-btn-sm"
          onClick={() => void ws.openEntries(pane, [entry])}
        >
          <FolderIcon size={13} /> Open
        </button>
        {!entry.isDir && (
          <button
            type="button"
            className="me-btn me-btn-ghost me-btn-sm"
            onClick={() => void ws.bridge.openWith(entry.path)}
          >
            Open with…
          </button>
        )}
        {entry.isDir && (
          <button
            type="button"
            className="me-btn me-btn-ghost me-btn-sm"
            onClick={() => void ws.calcSizes([entry])}
          >
            Calculate size
          </button>
        )}
        <button
          type="button"
          className="me-btn me-btn-ghost me-btn-sm"
          onClick={() => ws.copyPaths([entry.path])}
        >
          Copy path
        </button>
        <button
          type="button"
          className="me-btn me-btn-ghost me-btn-sm"
          onClick={() => void ws.bridge.properties(entry.path)}
        >
          Properties
        </button>
      </div>
    </>
  );
}

function MultiPreview({
  ws,
  pane,
  entries,
}: {
  ws: Workspace;
  pane: PaneModel;
  entries: FsEntry[];
}) {
  const files = entries.filter((e) => !e.isDir);
  const bytes =
    files.reduce((a, e) => a + (e.size ?? 0), 0) +
    entries.filter((e) => e.isDir).reduce((a, e) => a + (ws.folderSizes.get(e.path)?.size ?? 0), 0);
  return (
    <>
      <div className="flex h-40 shrink-0 items-center justify-center rounded-(--radius-md) border border-(--me-border) bg-(--me-inset)">
        {entries.slice(0, 4).map((e) => (
          <span key={e.path} className="-mx-2">
            <KindIcon kind={kindOf(e)} size={52} />
          </span>
        ))}
      </div>
      <div>
        <h3 className="m-0 text-[0.9375rem] font-semibold">
          {plural(entries.length, "item")} selected
        </h3>
        <p className="m-0 text-xs text-(--me-text-muted)">
          {plural(entries.length - files.length, "folder")} · {plural(files.length, "file")}
        </p>
      </div>
      <InfoList rows={[["Size", formatBytes(bytes)]]} />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="me-btn me-btn-ghost me-btn-sm"
          onClick={() => void ws.zip(pane, entries)}
        >
          Compress to ZIP
        </button>
        <button
          type="button"
          className="me-btn me-btn-ghost me-btn-sm"
          onClick={() => void ws.ask<boolean>({ type: "bulk-rename", pane, entries })}
        >
          <EditIcon size={13} /> Rename…
        </button>
        {entries.some((e) => e.isDir) && (
          <button
            type="button"
            className="me-btn me-btn-ghost me-btn-sm"
            onClick={() => void ws.calcSizes(entries)}
          >
            Calculate size
          </button>
        )}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-(--me-text-muted)">
        {entries.slice(0, 14).map((e) => (
          <li key={e.path} className="flex items-center gap-2 truncate">
            <KindIcon kind={kindOf(e)} size={14} />
            <span className="truncate">{e.name}</span>
          </li>
        ))}
        {entries.length > 14 && <li>… and {entries.length - 14} more</li>}
      </ul>
    </>
  );
}

function FolderSummary({ ws, pane }: { ws: Workspace; pane: PaneModel }) {
  const dir = pane.workDir;
  if (!dir) {
    return (
      <div className="mt-10 flex flex-col items-center gap-2 text-center text-xs text-(--me-text-muted)">
        <KindIcon kind="folder" size={40} />
        <p className="m-0">Select a file to preview it.</p>
        <p className="m-0 leading-relaxed text-(--me-text-faint)">
          Ctrl+K · command palette
          <br />
          Space · Quick Look
          <br />
          F9 · two panes
          <br />
          Ctrl+H · hidden files
        </p>
      </div>
    );
  }
  const files = pane.view.filter((e) => !e.isDir);
  return (
    <>
      <div className="grid h-40 shrink-0 place-items-center rounded-(--radius-md) border border-(--me-border) bg-(--me-inset)">
        <KindIcon kind="folder" size={64} />
      </div>
      <div>
        <h3 className="m-0 text-[0.9375rem] font-semibold">{pane.title()}</h3>
        <p className="m-0 text-xs text-(--me-text-muted)">
          {pane.loc?.kind === "search" ? "Search results" : "Current folder"}
        </p>
      </div>
      <InfoList
        rows={[
          ["Folders", String(pane.view.length - files.length)],
          ["Files", String(files.length)],
          ["File size", formatBytes(files.reduce((a, e) => a + (e.size ?? 0), 0))],
          ["Path", dir],
        ]}
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="me-btn me-btn-ghost me-btn-sm"
          onClick={() => void ws.bridge.terminal(dir)}
        >
          Open in Terminal
        </button>
        <button
          type="button"
          className="me-btn me-btn-ghost me-btn-sm"
          onClick={() => void ws.bridge.openInWindowsExplorer(dir)}
        >
          Open in Windows Explorer
        </button>
      </div>
    </>
  );
}
