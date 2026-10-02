/*
 * Placeholder content so the themed shell renders on its own. The real
 * file-system layer replaces this; nothing here touches the disk.
 */

export type FileKind = "folder" | "image" | "media" | "code" | "archive" | "file";

export interface Entry {
  name: string;
  kind: FileKind;
  type: string;
  modified: string;
  /** Size in bytes; folders have none. */
  size?: number;
}

export interface Place {
  id: string;
  label: string;
  path: string[];
}

/** What kind of volume a drive is; picks its default icon. */
export type DriveKind = "system" | "fixed" | "removable" | "network";

export const DRIVE_KIND_LABELS: Record<DriveKind, string> = {
  system: "System drive",
  fixed: "Local disk",
  removable: "Removable drive",
  network: "Network drive",
};

export interface Drive {
  id: string;
  label: string;
  letter: string;
  kind: DriveKind;
  /**
   * The volume serial / ID from the OS, when known. It stays the same when a
   * USB stick comes back under another letter, so per-drive settings (like a
   * custom icon) are keyed on it. See `driveKey` in drive-icons/store.ts.
   */
  volumeId?: string;
  used: number;
  total: number;
}

export const PLACES: Place[] = [
  { id: "home", label: "Home", path: ["Luna"] },
  { id: "desktop", label: "Desktop", path: ["Luna", "Desktop"] },
  { id: "documents", label: "Documents", path: ["Luna", "Documents"] },
  { id: "downloads", label: "Downloads", path: ["Luna", "Downloads"] },
  { id: "pictures", label: "Pictures", path: ["Luna", "Pictures"] },
  { id: "music", label: "Music", path: ["Luna", "Music"] },
];

const GB = 1024 ** 3;
const TB = 1024 ** 4;

export const DRIVES: Drive[] = [
  { id: "c", label: "System", letter: "C:", kind: "system", used: 688 * GB, total: 931 * GB },
  { id: "d", label: "Moonlight", letter: "D:", kind: "fixed", used: 412 * GB, total: 1863 * GB },
  {
    id: "e",
    label: "USB stick",
    letter: "E:",
    kind: "removable",
    used: 27.4 * GB,
    total: 29.8 * GB,
  },
  { id: "z", label: "Starbase", letter: "Z:", kind: "network", used: 2.1 * TB, total: 3.6 * TB },
];

export const ENTRIES: Entry[] = [
  { name: "Moon-Browser", kind: "folder", type: "File folder", modified: "2026-09-30 14:46" },
  { name: "Moon-Task", kind: "folder", type: "File folder", modified: "2026-09-26 07:16" },
  { name: "MoonDisk", kind: "folder", type: "File folder", modified: "2026-09-25 16:42" },
  { name: "Night sky photos", kind: "folder", type: "File folder", modified: "2026-08-12 21:03" },
  {
    name: "crescent.png",
    kind: "image",
    type: "PNG image",
    modified: "2026-09-28 22:10",
    size: 2_481_664,
  },
  {
    name: "lunar-eclipse.jpg",
    kind: "image",
    type: "JPEG image",
    modified: "2026-09-07 23:58",
    size: 5_903_360,
  },
  {
    name: "Clair de lune.flac",
    kind: "media",
    type: "FLAC audio",
    modified: "2026-07-19 10:22",
    size: 31_457_280,
  },
  {
    name: "tokens.css",
    kind: "code",
    type: "CSS source",
    modified: "2026-10-02 09:14",
    size: 18_944,
  },
  {
    name: "explorer.ts",
    kind: "code",
    type: "TypeScript source",
    modified: "2026-10-01 18:30",
    size: 7_210,
  },
  {
    name: "moon-explorer-0.1.0.zip",
    kind: "archive",
    type: "ZIP archive",
    modified: "2026-10-01 20:05",
    size: 84_934_656,
  },
  {
    name: "Orbit notes.txt",
    kind: "file",
    type: "Text document",
    modified: "2026-09-15 08:41",
    size: 3_120,
  },
  {
    name: "README.md",
    kind: "file",
    type: "Markdown document",
    modified: "2026-09-26 07:16",
    size: 1_536,
  },
];

export function formatBytes(bytes: number, digits = 1): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(digits)} ${units[unit]}`;
}
