import type { Drive } from "@/explorer/sample";
import { findBuiltinIcon, isTintId } from "./builtins";

/** A custom drive icon: one from the built-in gallery or the user's own image. */
export type DriveIconChoice =
  | { type: "builtin"; id: string; tint?: string }
  | {
      type: "image";
      /** A `data:image/...` URL, so the icon needs no file on disk. */
      dataUrl: string;
      /** The original file name, shown in the picker. */
      name: string;
    };

/**
 * Where custom drive icons are kept. The app talks only to this interface,
 * so the desktop shell can swap the localStorage version below for a native
 * store (for example a settings file next to the app's other settings).
 *
 * `get` must return the same object until that key changes, because React
 * reads it through `useSyncExternalStore`. A store that loads asynchronously
 * can return `null` at first and call its listeners once it has loaded.
 */
export interface DriveIconStore {
  get(key: string): DriveIconChoice | null;
  /** Throws if the choice can't be saved (for example, storage is full). */
  set(key: string, choice: DriveIconChoice): void;
  reset(key: string): void;
  subscribe(listener: () => void): () => void;
}

/**
 * The key a drive's settings are saved under. The volume serial / ID keeps
 * working when a USB stick comes back under a different letter; until the
 * file-system layer reports one, the drive letter is the fallback.
 */
export function driveKey(drive: Pick<Drive, "letter" | "volumeId">): string {
  return drive.volumeId ? `volume:${drive.volumeId}` : `letter:${drive.letter.toUpperCase()}`;
}

export const DRIVE_ICONS_STORAGE_KEY = "moonexplorer.driveIcons";

/** Image data URLs that the picker may produce and the app will render. */
const IMAGE_DATA_URL = /^data:image\/(png|svg\+xml|x-icon|vnd\.microsoft\.icon|jpeg|webp);/;

/** Checks a stored value, so a hand-edited or outdated entry is ignored. */
export function parseDriveIconChoice(value: unknown): DriveIconChoice | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.type === "builtin" && typeof v.id === "string" && findBuiltinIcon(v.id)) {
    return isTintId(v.tint)
      ? { type: "builtin", id: v.id, tint: v.tint }
      : { type: "builtin", id: v.id };
  }
  if (v.type === "image" && typeof v.dataUrl === "string" && IMAGE_DATA_URL.test(v.dataUrl)) {
    return { type: "image", dataUrl: v.dataUrl, name: typeof v.name === "string" ? v.name : "" };
  }
  return null;
}

type IconMap = Readonly<Record<string, DriveIconChoice>>;

interface StoredIcons {
  version: 1;
  icons: Record<string, DriveIconChoice>;
}

/** The part of the Web Storage API the store needs. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    // localStorage can be missing or blocked; icons then last for the session.
    return null;
  }
}

/**
 * A `DriveIconStore` on top of localStorage (or any `KeyValueStorage`). All
 * icons live in one JSON entry. Without storage it keeps them in memory.
 */
export function createLocalDriveIconStore(
  storage: KeyValueStorage | null = defaultStorage(),
  storageKey = DRIVE_ICONS_STORAGE_KEY,
): DriveIconStore {
  const listeners = new Set<() => void>();
  let icons: IconMap = read();

  function read(): IconMap {
    let raw: string | null = null;
    try {
      raw = storage?.getItem(storageKey) ?? null;
    } catch {
      return {};
    }
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Partial<StoredIcons>;
      const result: Record<string, DriveIconChoice> = {};
      for (const [key, value] of Object.entries(parsed.icons ?? {})) {
        const choice = parseDriveIconChoice(value);
        if (choice) result[key] = choice;
      }
      return result;
    } catch {
      return {};
    }
  }

  function write(next: IconMap) {
    if (storage) {
      if (Object.keys(next).length === 0) {
        storage.removeItem(storageKey);
      } else {
        const stored: StoredIcons = { version: 1, icons: { ...next } };
        storage.setItem(storageKey, JSON.stringify(stored));
      }
    }
    icons = next;
    listeners.forEach((listener) => listener());
  }

  // Another window of the app changed the icons.
  function onStorage(event: StorageEvent) {
    if (event.key !== storageKey && event.key !== null) return;
    icons = read();
    listeners.forEach((listener) => listener());
  }

  return {
    get: (key) => icons[key] ?? null,
    set(key, choice) {
      const valid = parseDriveIconChoice(choice);
      if (!valid) throw new Error("Not a valid drive icon.");
      write({ ...icons, [key]: valid });
    },
    reset(key) {
      if (!(key in icons)) return;
      const next = { ...icons };
      delete next[key];
      write(next);
    },
    subscribe(listener) {
      if (listeners.size === 0 && typeof window !== "undefined") {
        window.addEventListener("storage", onStorage);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") {
          window.removeEventListener("storage", onStorage);
        }
      };
    },
  };
}
