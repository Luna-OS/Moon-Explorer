import { beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { DemoBridge } from "@/fs/demo";
import { formatCapacity } from "@/fs/format";
import type { FsEntry, PickerRequest } from "@/fs/types";
import { planRenames } from "../rename";
import { filterEntries, sortEntries } from "./pane";
import { Workspace } from "./workspace";
import { entryMenu } from "../commands";

const DOCS = "C:\\Users\\Luna\\Documents";

function entry(name: string, extra: Partial<FsEntry> = {}): FsEntry {
  const isDir = extra.isDir ?? false;
  const dot = name.lastIndexOf(".");
  return {
    name,
    path: `C:\\x\\${name}`,
    isDir,
    isLink: false,
    size: isDir ? null : 1,
    mtime: 0,
    ctime: 0,
    ext: isDir || dot <= 0 ? "" : name.slice(dot + 1).toLowerCase(),
    hidden: false,
    ...extra,
  };
}

describe("sorting and filtering", () => {
  const items = [
    entry("b10.txt", { size: 5 }),
    entry("b9.txt", { size: 50 }),
    entry("Zeta", { isDir: true }),
    entry("a.png", { size: 7 }),
  ];

  it("puts folders first and sorts numbers naturally", () => {
    expect(sortEntries(items, { key: "name", dir: "asc" }).map((e) => e.name)).toEqual([
      "Zeta",
      "a.png",
      "b9.txt",
      "b10.txt",
    ]);
    expect(sortEntries(items, { key: "size", dir: "desc" }).map((e) => e.name)).toEqual([
      "Zeta",
      "b9.txt",
      "a.png",
      "b10.txt",
    ]);
  });

  it("filters by words or wildcards", () => {
    expect(filterEntries(items, "b txt").map((e) => e.name)).toEqual(["b10.txt", "b9.txt"]);
    expect(filterEntries(items, "*.png").map((e) => e.name)).toEqual(["a.png"]);
    expect(filterEntries(items, "b?.txt").map((e) => e.name)).toEqual(["b9.txt"]);
  });
});

describe("bulk rename plan", () => {
  it("applies the pattern, numbers and find / replace, keeping extensions", () => {
    const plan = planRenames([entry("IMG_001.JPG"), entry("IMG_002.jpg")], {
      pattern: "Trip {n} {name}",
      find: "img_",
      replace: "",
      regex: false,
      caseMode: "keep",
      start: 1,
      digits: 2,
    });
    expect(plan.map((p) => p.newName)).toEqual(["Trip 01 001.JPG", "Trip 02 002.jpg"]);
    expect(plan.every((p) => p.error === null)).toBe(true);
  });

  it("flags duplicates and invalid names", () => {
    const plan = planRenames([entry("a.txt"), entry("b.txt")], {
      pattern: "same",
      find: "",
      replace: "",
      regex: false,
      caseMode: "keep",
      start: 1,
      digits: 1,
    });
    expect(plan[1].error).toBe("Duplicate name");
    const bad = planRenames([entry("a.txt")], {
      pattern: "a:b",
      find: "",
      replace: "",
      regex: false,
      caseMode: "keep",
      start: 1,
      digits: 1,
    });
    expect(bad[0].error).toMatch(/can't contain/);
  });
});

describe("workspace", () => {
  let ws: Workspace;
  beforeEach(async () => {
    localStorage.clear();
    ws = new Workspace(new DemoBridge(), localStorage);
    await ws.init();
  });

  it("starts in the requested folder and keeps history", async () => {
    const pane = ws.pane!;
    expect(pane.path).toBe(DOCS);
    await pane.go(`${DOCS}\\Night sky photos`);
    expect(pane.view.map((e) => e.name)).toEqual(["moonrise.jpg"]);
    pane.up();
    await new Promise((r) => setTimeout(r, 0));
    expect(pane.path).toBe(DOCS);
    // Going up selects the folder you came from.
    expect(pane.selected().map((e) => e.name)).toEqual(["Night sky photos"]);
  });

  it("moves files and undoes the move", async () => {
    const pane = ws.pane!;
    const src = `${DOCS}\\Orbit notes.txt`;
    const dest = `${DOCS}\\MoonDisk`;
    await ws.transfer("move", [src], dest);
    expect(await ws.bridge.exists(`${dest}\\Orbit notes.txt`)).toBe(true);
    expect(await ws.bridge.exists(src)).toBe(false);
    await ws.undo();
    expect(await ws.bridge.exists(src)).toBe(true);
    await pane.reload();
    expect(pane.view.some((e) => e.name === "Orbit notes.txt")).toBe(true);
  });

  it("asks about name conflicts and keeps both", async () => {
    await ws.bridge.createFile(`${DOCS}\\MoonDisk`, "README.md");
    const done = ws.transfer("copy", [`${DOCS}\\README.md`], `${DOCS}\\MoonDisk`);
    await new Promise((r) => setTimeout(r, 0));
    expect(ws.dialog?.type).toBe("conflict");
    if (ws.dialog?.type === "conflict") ws.dialog.resolve("keep");
    await done;
    expect(await ws.bridge.exists(`${DOCS}\\MoonDisk\\README (2).md`)).toBe(true);
  });

  it("refuses to copy a folder into itself", async () => {
    const result = await ws.transfer("copy", [`${DOCS}\\MoonDisk`], `${DOCS}\\MoonDisk`);
    expect(result).toBeNull();
  });

  it("restores tabs from the saved session", async () => {
    await ws.newTab(`${DOCS}\\MoonDisk`);
    ws.saveNow();
    const again = new Workspace(new DemoBridge(null), localStorage);
    await again.init();
    expect(again.tabs.map((t) => t.activePane.path)).toEqual([DOCS, `${DOCS}\\MoonDisk`]);
  });
});

describe("start path (electron/start.cjs)", () => {
  const require = createRequire(import.meta.url);
  const { resolveStart } = require("../../../electron/start.cjs") as {
    resolveStart: (
      args: string[],
      opts: { stat: (p: string) => string | null; cwd: string },
    ) => unknown;
  };
  const stat = (p: string) =>
    ({ "C:\\": "dir", "C:\\Users": "dir", "C:\\a.txt": "file" })[p] ?? null;

  it("understands folders, files, drive roots and --this-pc", () => {
    expect(resolveStart(["C:\\Users"], { stat, cwd: "C:\\" })).toEqual({
      kind: "folder",
      path: "C:\\Users",
    });
    expect(resolveStart(['C:"'], { stat, cwd: "C:\\" })).toEqual({ kind: "folder", path: "C:\\" });
    expect(resolveStart(["C:\\a.txt"], { stat, cwd: "C:\\" })).toEqual({
      kind: "file",
      path: "C:\\a.txt",
      folder: "C:\\",
    });
    expect(resolveStart(["--this-pc"], { stat, cwd: "C:\\" })).toEqual({ kind: "this-pc" });
    expect(
      resolveStart(["::{645FF040-5081-101B-9F08-00AA002F954E}"], { stat, cwd: "C:\\" }),
    ).toEqual({
      kind: "shell",
      target: "::{645FF040-5081-101B-9F08-00AA002F954E}",
    });
    expect(resolveStart(["--inspect", "X:\\nope"], { stat, cwd: "C:\\" })).toEqual({
      kind: "missing",
      path: "X:\\nope",
    });
    expect(resolveStart([], { stat, cwd: "C:\\" })).toEqual({ kind: "home" });
  });
});

describe("selection and folder tools", () => {
  let ws: Workspace;
  let bridge: DemoBridge;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  /** Answers the prompt the workspace is waiting on. */
  async function answer(value: string | null) {
    await tick();
    expect(ws.dialog?.type).toBe("prompt");
    if (ws.dialog?.type === "prompt") ws.dialog.resolve(value);
  }

  beforeEach(async () => {
    localStorage.clear();
    bridge = new DemoBridge();
    ws = new Workspace(bridge, localStorage);
    await ws.init();
  });

  it("selects by pattern, with several patterns separated by ;", async () => {
    const pane = ws.pane!;
    const done = ws.selectByPattern(pane);
    await answer("*.png; *.jpg");
    await done;
    expect(pane.selected().map((e) => e.name)).toEqual(["crescent.png", "lunar-eclipse.jpg"]);

    // Nothing matching leaves the selection alone.
    const none = ws.selectByPattern(pane);
    await answer("*.nothing");
    await none;
    expect(pane.selected()).toHaveLength(2);
    expect(ws.toasts.at(-1)?.message).toBe('Nothing here matches "*.nothing".');
  });

  it("copies just the names", () => {
    const pane = ws.pane!;
    pane.selectPaths([`${DOCS}\\crescent.png`, `${DOCS}\\tokens.css`]);
    ws.copyNames(pane.selected());
    expect(bridge.shellCalls.at(-1)).toEqual({
      action: "copyText",
      target: "crescent.png\r\ntokens.css",
    });
  });

  it("moves the selection into a new folder, and undoes it in one step", async () => {
    const pane = ws.pane!;
    const files = [`${DOCS}\\crescent.png`, `${DOCS}\\lunar-eclipse.jpg`];
    pane.selectPaths(files);
    const done = ws.newFolderWithSelection(pane);
    await answer("Eclipse pictures");
    await done;
    const folder = `${DOCS}\\Eclipse pictures`;
    expect(await bridge.list(folder).then((l) => l.map((e) => e.name).sort())).toEqual([
      "crescent.png",
      "lunar-eclipse.jpg",
    ]);
    expect(pane.selected().map((e) => e.path)).toEqual([folder]);
    expect(ws.undoStack.at(-1)?.label).toBe("New folder with selection");

    await ws.undo();
    for (const f of files) expect(await bridge.exists(f)).toBe(true);
    expect(await bridge.exists(folder)).toBe(false);
  });

  it("refuses a folder name Windows doesn't allow", async () => {
    const pane = ws.pane!;
    pane.selectPaths([`${DOCS}\\crescent.png`]);
    const done = ws.newFolderWithSelection(pane);
    await answer("a:b");
    await done;
    expect(await bridge.exists(`${DOCS}\\crescent.png`)).toBe(true);
    expect(ws.toasts.at(-1)?.error).toBe(true);
  });
});

describe("drive sizes", () => {
  const GB = 1024 ** 3;
  const TB = 1024 ** 4;

  it("shows three significant digits like Windows Explorer", () => {
    expect(formatCapacity(145 * GB)).toBe("145 GB");
    expect(formatCapacity(1.81 * TB)).toBe("1.81 TB");
    expect(formatCapacity(12.34 * GB)).toBe("12.3 GB");
    expect(formatCapacity(931.5 * GB)).toBe("932 GB");
    // Just under 1 TB stays readable instead of "1000 GB".
    expect(formatCapacity(1000 * GB)).toBe("0.98 TB");
    expect(formatCapacity(512)).toBe("512 B");
  });

  it("asks for the drives again on F5 in This PC, and only once at a time", async () => {
    localStorage.clear();
    const bridge = new DemoBridge();
    const ws = new Workspace(bridge, localStorage);
    await ws.init();
    let calls = 0;
    bridge.refreshDrives = async () => {
      calls++;
      const drives = await bridge.drives();
      return drives.map((d) => (d.id === "c" ? { ...d, used: d.total - 145 * GB } : d));
    };
    const pane = ws.pane!;
    await pane.go({ kind: "this-pc" });
    void pane.reload();
    await ws.refreshDrives();
    expect(calls).toBe(1);
    const c = ws.drives.find((d) => d.id === "c")!;
    expect(c.total - c.used).toBe(145 * GB);
    expect(ws.drivesRefreshing).toBe(false);
  });
});

describe("Open/Save dialog (picker mode)", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function picker(req: Partial<PickerRequest>) {
    localStorage.clear();
    const bridge = new DemoBridge();
    bridge.pickerRequest = {
      mode: "save",
      title: "Save As",
      suggestedName: "",
      startDir: DOCS,
      filters: [],
      ...req,
    };
    const ws = new Workspace(bridge, localStorage);
    await ws.init();
    return { ws, bridge };
  }

  it("saves to the current folder, adding the filter's extension", async () => {
    const { ws, bridge } = await picker({
      suggestedName: "notes",
      filters: [{ label: "Text", extensions: ["txt", "md"] }],
    });
    expect(ws.pane!.path).toBe(DOCS);
    expect(ws.pickerCanConfirm()).toBe(true);
    await ws.confirmPicker();
    expect(bridge.pickerResult).toBe(`${DOCS}\\notes.txt`);
  });

  it("keeps an extension the name already has", async () => {
    const { ws, bridge } = await picker({
      suggestedName: "cover.png",
      filters: [{ label: "Text", extensions: ["txt"] }],
    });
    await ws.confirmPicker();
    expect(bridge.pickerResult).toBe(`${DOCS}\\cover.png`);
  });

  it("asks before replacing an existing file", async () => {
    const { ws, bridge } = await picker({ suggestedName: "tokens.css" });
    const done = ws.confirmPicker();
    await tick();
    expect(ws.dialog?.type).toBe("confirm");
    if (ws.dialog?.type === "confirm") ws.dialog.resolve(false);
    await done;
    expect(bridge.pickerResult).toBeUndefined();

    const again = ws.confirmPicker();
    await tick();
    if (ws.dialog?.type === "confirm") ws.dialog.resolve(true);
    await again;
    expect(bridge.pickerResult).toBe(`${DOCS}\\tokens.css`);
  });

  it("returns the selected file in open mode, and on activating it", async () => {
    const { ws, bridge } = await picker({ mode: "open", title: "Open" });
    const pane = ws.pane!;
    expect(ws.pickerCanConfirm()).toBe(false);
    pane.selectPaths([`${DOCS}\\tokens.css`]);
    expect(ws.pickerCanConfirm()).toBe(true);
    await ws.confirmPicker();
    expect(bridge.pickerResult).toBe(`${DOCS}\\tokens.css`);

    bridge.pickerResult = undefined;
    await ws.openEntries(pane, [await bridge.stat(`${DOCS}\\explorer.ts`)]);
    expect(bridge.pickerResult).toBe(`${DOCS}\\explorer.ts`);
  });

  it("returns the current folder in folder mode, and cancels with null", async () => {
    const { ws, bridge } = await picker({ mode: "folder", title: "Select Folder" });
    await ws.confirmPicker();
    expect(bridge.pickerResult).toBe(DOCS);
    ws.cancelPicker();
    await tick();
    expect(bridge.pickerResult).toBeNull();
  });

  it("does not save the session while it is a dialog", async () => {
    const { ws } = await picker({ suggestedName: "x" });
    ws.saveNow();
    expect(localStorage.getItem("moonexplorer.settings")).toBeNull();
  });
});

describe("Run as administrator", () => {
  it("offers it for runnable files only, and runs them elevated", async () => {
    localStorage.clear();
    const bridge = new DemoBridge();
    const ws = new Workspace(bridge, localStorage);
    await ws.init();
    const pane = ws.pane!;

    const exePath = await bridge.createFile(DOCS, "setup.exe");
    const exe = await bridge.stat(exePath);
    const labels = (es: FsEntry[]) =>
      entryMenu(ws, pane, es)
        .filter((m): m is Exclude<typeof m, string> => typeof m !== "string")
        .map((m) => m.label);

    expect(labels([exe])).toContain("Run as administrator");
    // A plain document does not get the entry.
    expect(labels([await bridge.stat(`${DOCS}\\tokens.css`)])).not.toContain(
      "Run as administrator",
    );

    const item = entryMenu(ws, pane, [exe])
      .filter((m): m is Exclude<typeof m, string> => typeof m !== "string")
      .find((m) => m.label === "Run as administrator");
    item?.onSelect?.();
    expect(bridge.shellCalls.at(-1)).toEqual({ action: "runAsAdmin", target: exePath });
  });
});
