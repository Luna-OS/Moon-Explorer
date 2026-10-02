import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { DemoBridge } from "@/fs/demo";
import { resolveTheme } from "@/theme/useTheme";

const DOCS = "C:\\Users\\Luna\\Documents";

async function renderApp(bridge = new DemoBridge()) {
  const view = render(<App bridge={bridge} />);
  const list = await screen.findByRole("grid", { name: "Contents of Documents" });
  return { ...view, bridge, list };
}

/** The list row of an entry in Documents (paths contain backslashes, so no CSS selector). */
function findRow(name: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>("[data-path]")].find(
    (el) => el.dataset.path === `${DOCS}\\${name}`,
  );
}

function row(name: string) {
  const el = findRow(name);
  if (!el) throw new Error(`No row ${name}`);
  return el;
}

beforeEach(() => {
  localStorage.clear();
});

describe("App", () => {
  it("renders the themed explorer on the start folder", async () => {
    await renderApp();
    expect(screen.getByRole("heading", { level: 1, name: "Moon Explorer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Documents" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
    // Folders come first, then files, both by name.
    const names = screen
      .getAllByRole("row")
      .map((r) => r.getAttribute("data-path")?.split("\\").pop());
    expect(names.slice(0, 4)).toEqual([
      "Moon-Browser",
      "Moon-Task",
      "MoonDisk",
      "Night sky photos",
    ]);
  });

  it("switches between the night and day theme", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "Night" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("filters the folder while typing and searches subfolders on Enter", async () => {
    await renderApp();
    const box = screen.getByRole("searchbox", { name: "Search Documents" });
    fireEvent.change(box, { target: { value: "moon" } });
    expect(screen.getAllByRole("row")).toHaveLength(4);

    fireEvent.change(box, { target: { value: "moonrise" } });
    fireEvent.keyDown(box, { key: "Enter" });
    const results = await screen.findByRole("grid", { name: "Contents of Search: moonrise" });
    await waitFor(() => expect(within(results).getAllByRole("row")).toHaveLength(1));
    expect(within(results).getByText("Night sky photos")).toBeInTheDocument();
  });

  it("opens a folder on double-click and goes back", async () => {
    await renderApp();
    fireEvent.doubleClick(row("Night sky photos"));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Night sky photos" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Documents" })).toBeInTheDocument();
  });

  it("creates a folder and renames it in place", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    const input = await screen.findByRole("textbox", { name: "New name" });
    expect(input).toHaveValue("New folder");
    fireEvent.change(input, { target: { value: "Telescope" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(row("Telescope")).toHaveAttribute("aria-selected", "true"));
  });

  it("copies and pastes with the keyboard, then undoes it", async () => {
    const { list } = await renderApp();
    fireEvent.mouseDown(row("Orbit notes.txt"), { button: 0 });
    fireEvent.keyDown(list, { key: "c", ctrlKey: true });
    fireEvent.keyDown(list, { key: "v", ctrlKey: true });
    await waitFor(() => expect(row("Orbit notes - Copy.txt")).toBeInTheDocument());

    fireEvent.keyDown(list, { key: "z", ctrlKey: true });
    await waitFor(() => expect(findRow("Orbit notes - Copy.txt")).toBeUndefined());
  });

  it("asks before deleting permanently", async () => {
    const { list } = await renderApp();
    fireEvent.mouseDown(row("README.md"), { button: 0 });
    fireEvent.keyDown(list, { key: "Delete", shiftKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Delete permanently?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(findRow("README.md")).toBeUndefined());
  });

  it("opens a second pane with F9", async () => {
    await renderApp();
    act(() => {
      fireEvent.keyDown(window, { key: "F9" });
    });
    await waitFor(() =>
      expect(screen.getAllByRole("grid", { name: "Contents of Documents" })).toHaveLength(2),
    );
  });

  it("runs commands from the palette", async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox", { name: "Command palette" });
    fireEvent.change(input, { target: { value: "this pc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("heading", { level: 2, name: "This PC" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Devices and drives" })).toBeInTheDocument();
  });

  it("renames several files with a pattern", async () => {
    const { list } = await renderApp();
    fireEvent.mouseDown(row("crescent.png"), { button: 0 });
    fireEvent.mouseDown(row("lunar-eclipse.jpg"), { button: 0, ctrlKey: true });
    fireEvent.keyDown(list, { key: "F2" });
    const dialog = await screen.findByRole("dialog", { name: "Rename 2 items" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Pattern" }), {
      target: { value: "Sky {n}" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(row("Sky 01.png")).toBeInTheDocument());
    expect(row("Sky 02.jpg")).toBeInTheDocument();
  });
});

describe("resolveTheme", () => {
  it("follows the OS only for the system choice", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });
});

describe("drive space", () => {
  it("refreshes the drives' free space from the sidebar", async () => {
    const bridge = new DemoBridge();
    const GB = 1024 ** 3;
    bridge.refreshDrives = async () =>
      (await bridge.drives()).map((d) => (d.id === "c" ? { ...d, used: d.total - 145 * GB } : d));
    await renderApp(bridge);
    const drives = screen.getByRole("region", { name: "Drives" });
    expect(within(drives).queryByText(/^145 GB free of/)).not.toBeInTheDocument();
    fireEvent.click(within(drives).getByRole("button", { name: "Refresh drives" }));
    expect(await within(drives).findByText("145 GB free of 931 GB")).toBeInTheDocument();
  });
});
