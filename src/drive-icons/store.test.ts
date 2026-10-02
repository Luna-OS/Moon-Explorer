import { describe, expect, it, vi } from "vitest";
import {
  DRIVE_ICONS_STORAGE_KEY,
  createLocalDriveIconStore,
  driveKey,
  parseDriveIconChoice,
  type KeyValueStorage,
} from "./store";

/** An in-memory Web Storage stand-in, so each test starts empty. */
function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const IMAGE = {
  type: "image",
  dataUrl: "data:image/png;base64,iVBORw0KGgo=",
  name: "moon.png",
} as const;

describe("driveKey", () => {
  it("uses the volume ID when there is one, else the drive letter", () => {
    expect(driveKey({ letter: "e:", volumeId: "4A2F-19C3" })).toBe("volume:4A2F-19C3");
    expect(driveKey({ letter: "e:" })).toBe("letter:E:");
  });

  it("keeps a USB stick's key when it comes back under another letter", () => {
    const store = createLocalDriveIconStore(memoryStorage());
    store.set(driveKey({ letter: "E:", volumeId: "4A2F-19C3" }), { type: "builtin", id: "usb" });
    expect(store.get(driveKey({ letter: "F:", volumeId: "4A2F-19C3" }))).toEqual({
      type: "builtin",
      id: "usb",
    });
  });
});

describe("createLocalDriveIconStore", () => {
  it("sets, gets and resets a drive's icon", () => {
    const store = createLocalDriveIconStore(memoryStorage());
    expect(store.get("letter:D:")).toBeNull();

    store.set("letter:D:", { type: "builtin", id: "rocket", tint: "mint" });
    expect(store.get("letter:D:")).toEqual({ type: "builtin", id: "rocket", tint: "mint" });
    expect(store.get("letter:C:")).toBeNull();

    store.reset("letter:D:");
    expect(store.get("letter:D:")).toBeNull();
  });

  it("survives a reload", () => {
    const storage = memoryStorage();
    const before = createLocalDriveIconStore(storage);
    before.set("letter:D:", { type: "builtin", id: "planet", tint: "sky" });
    before.set("letter:E:", IMAGE);

    // A new store on the same storage is what the app sees after a restart.
    const after = createLocalDriveIconStore(storage);
    expect(after.get("letter:D:")).toEqual({ type: "builtin", id: "planet", tint: "sky" });
    expect(after.get("letter:E:")).toEqual(IMAGE);

    after.reset("letter:D:");
    after.reset("letter:E:");
    expect(createLocalDriveIconStore(storage).get("letter:D:")).toBeNull();
    // Nothing is left behind once every icon is back to the default.
    expect(storage.data.has(DRIVE_ICONS_STORAGE_KEY)).toBe(false);
  });

  it("works with the browser's localStorage", () => {
    createLocalDriveIconStore(localStorage).set("letter:C:", { type: "builtin", id: "ssd" });
    expect(createLocalDriveIconStore(localStorage).get("letter:C:")).toEqual({
      type: "builtin",
      id: "ssd",
    });
  });

  it("returns the same object until the key changes", () => {
    const store = createLocalDriveIconStore(memoryStorage());
    store.set("letter:D:", { type: "builtin", id: "rocket" });
    const first = store.get("letter:D:");
    store.set("letter:C:", { type: "builtin", id: "ssd" });
    expect(store.get("letter:D:")).toBe(first);
  });

  it("tells subscribers about changes", () => {
    const store = createLocalDriveIconStore(memoryStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set("letter:D:", { type: "builtin", id: "rocket" });
    store.reset("letter:D:");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.set("letter:D:", { type: "builtin", id: "rocket" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("picks up changes made by another window", () => {
    const store = createLocalDriveIconStore(localStorage);
    const listener = vi.fn();
    store.subscribe(listener);
    createLocalDriveIconStore(localStorage).set("letter:Z:", { type: "builtin", id: "cloud" });
    window.dispatchEvent(new StorageEvent("storage", { key: DRIVE_ICONS_STORAGE_KEY }));
    expect(listener).toHaveBeenCalled();
    expect(store.get("letter:Z:")).toEqual({ type: "builtin", id: "cloud" });
  });

  it("ignores broken or unknown stored data", () => {
    const storage = memoryStorage();
    storage.setItem(DRIVE_ICONS_STORAGE_KEY, "{not json");
    expect(createLocalDriveIconStore(storage).get("letter:C:")).toBeNull();

    storage.setItem(
      DRIVE_ICONS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        icons: {
          "letter:C:": { type: "builtin", id: "no-such-icon" },
          "letter:D:": { type: "image", dataUrl: "javascript:alert(1)" },
          "letter:E:": { type: "builtin", id: "usb", tint: "neon" },
        },
      }),
    );
    const store = createLocalDriveIconStore(storage);
    expect(store.get("letter:C:")).toBeNull();
    expect(store.get("letter:D:")).toBeNull();
    // A known icon with an unknown tint keeps the icon and drops the tint.
    expect(store.get("letter:E:")).toEqual({ type: "builtin", id: "usb" });
  });

  it("refuses to save an invalid icon", () => {
    const store = createLocalDriveIconStore(memoryStorage());
    expect(() =>
      store.set("letter:C:", { type: "image", dataUrl: "https://example.com/x.png", name: "x" }),
    ).toThrow();
    expect(store.get("letter:C:")).toBeNull();
  });

  it("keeps the old icon when storage is full", () => {
    const storage = memoryStorage();
    const store = createLocalDriveIconStore(storage);
    store.set("letter:C:", { type: "builtin", id: "ssd" });
    storage.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
    expect(() => store.set("letter:C:", IMAGE)).toThrow();
    expect(store.get("letter:C:")).toEqual({ type: "builtin", id: "ssd" });
  });

  it("keeps icons in memory when there is no storage", () => {
    const store = createLocalDriveIconStore(null);
    store.set("letter:C:", { type: "builtin", id: "ssd" });
    expect(store.get("letter:C:")).toEqual({ type: "builtin", id: "ssd" });
  });
});

describe("parseDriveIconChoice", () => {
  it("only accepts image data URLs in the supported formats", () => {
    for (const mime of ["png", "svg+xml", "x-icon", "vnd.microsoft.icon", "jpeg", "webp"]) {
      expect(
        parseDriveIconChoice({
          type: "image",
          dataUrl: `data:image/${mime};base64,AA==`,
          name: "",
        }),
      ).not.toBeNull();
    }
    expect(
      parseDriveIconChoice({ type: "image", dataUrl: "data:text/html;base64,AA==", name: "" }),
    ).toBeNull();
  });
});
