import type { FileKind } from "@/explorer/sample";
import type { FsEntry } from "./types";

export { formatBytes } from "@/explorer/sample";

const KIND_EXTS: Record<Exclude<FileKind, "folder" | "file">, string> = {
  image: "png jpg jpeg jfif gif webp bmp svg ico avif tif tiff heic heif psd raw",
  media: "mp4 mkv webm mov avi wmv m4v flv mpg mpeg mp3 wav flac ogg oga m4a aac wma opus mid midi",
  code: "js mjs cjs ts tsx jsx json jsonc html htm css scss sass less py rb php java kt c h cpp hpp cc cs go rs swift lua sh bash ps1 psm1 bat cmd sql vue svelte astro yml yaml xml toml ini cfg conf env reg",
  archive: "zip rar 7z tar gz tgz bz2 xz zst iso cab",
};

const EXT_KIND = new Map<string, FileKind>();
for (const [kind, exts] of Object.entries(KIND_EXTS)) {
  for (const ext of exts.split(" ")) EXT_KIND.set(ext, kind as FileKind);
}

/** The icon family of an entry (the UI's FileKind). */
export function kindOf(entry: Pick<FsEntry, "isDir" | "ext">): FileKind {
  if (entry.isDir) return "folder";
  return EXT_KIND.get(entry.ext) ?? "file";
}

const TYPE_NAMES: Record<string, string> = {
  txt: "Text document",
  md: "Markdown document",
  pdf: "PDF document",
  doc: "Word document",
  docx: "Word document",
  xls: "Excel spreadsheet",
  xlsx: "Excel spreadsheet",
  csv: "CSV file",
  ppt: "PowerPoint presentation",
  pptx: "PowerPoint presentation",
  exe: "Application",
  msi: "Windows installer",
  lnk: "Shortcut",
  url: "Internet shortcut",
  dll: "Application extension",
  ttf: "TrueType font",
  otf: "OpenType font",
  woff: "Web font",
  woff2: "Web font",
};

const KIND_NOUN: Partial<Record<FileKind, string>> = {
  image: "image",
  code: "source file",
  archive: "archive",
};

const AUDIO = new Set("mp3 wav flac ogg oga m4a aac wma opus mid midi".split(" "));

/** "PNG image", "Text document", "File folder" … */
export function typeLabel(entry: Pick<FsEntry, "isDir" | "ext">): string {
  if (entry.isDir) return "File folder";
  const named = TYPE_NAMES[entry.ext];
  if (named) return named;
  const ext = entry.ext.toUpperCase();
  const kind = kindOf(entry);
  if (kind === "media") return `${ext} ${AUDIO.has(entry.ext) ? "audio" : "video"}`;
  const noun = KIND_NOUN[kind];
  if (noun) return `${ext} ${noun}`;
  return ext ? `${ext} file` : "File";
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "Today, 14:02", "Yesterday, 09:10" or "28/09/2026, 22:10". */
export function formatDate(ms: number, relative = true, now = new Date()): string {
  if (!ms) return "";
  const d = new Date(ms);
  if (relative) {
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ms >= startToday) return `Today, ${TIME.format(d)}`;
    if (ms >= startToday - 86_400_000) return `Yesterday, ${TIME.format(d)}`;
  }
  return DATE.format(d);
}

/** "1 item", "3 items". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** "3:07" for a duration in seconds. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Subsequence fuzzy score; -1 when there is no match. Rewards consecutive and word-start hits. */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct - (t.length - q.length) * 0.5 + (direct === 0 ? 200 : 0);
  let score = 0;
  let from = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, from);
    if (found < 0) return -1;
    streak = found === from ? streak + 1 : 0;
    score += 10 + streak * 5 + (found === 0 || /[\s\\/_\-.]/.test(t[found - 1]) ? 15 : 0);
    from = found + 1;
  }
  return score - t.length * 0.3;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export const compareNames = (a: string, b: string) => collator.compare(a, b);
