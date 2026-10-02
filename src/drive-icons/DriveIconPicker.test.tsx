import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Drive } from "@/explorer/sample";
import { DriveIconStoreContext } from "./context";
import { DriveIconPicker } from "./DriveIconPicker";
import { MAX_ICON_FILE_BYTES } from "./image";
import { createLocalDriveIconStore, driveKey, type DriveIconStore } from "./store";

const USB: Drive = {
  id: "e",
  label: "USB stick",
  letter: "E:",
  kind: "removable",
  used: 1,
  total: 4,
};

/** jsdom doesn't decode images, so stand in for one that loads at the given size. */
function stubImage(width: number, height: number) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    set src(_value: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

let store: DriveIconStore;
let onClose: ReturnType<typeof vi.fn<() => void>>;

function renderPicker(drive: Drive = USB) {
  return render(
    <DriveIconStoreContext.Provider value={store}>
      <DriveIconPicker drive={drive} onClose={onClose} />
    </DriveIconStoreContext.Provider>,
  );
}

function fileInput() {
  return screen.getByLabelText<HTMLInputElement>("Image file for the drive icon");
}

beforeEach(() => {
  store = createLocalDriveIconStore(null);
  onClose = vi.fn<() => void>();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DriveIconPicker", () => {
  it("is a labelled dialog that starts on the gallery", () => {
    renderPicker();
    const dialog = screen.getByRole("dialog", { name: "Change icon for USB stick (E:)" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const gallery = screen.getByRole("radiogroup", { name: "Built-in icons" });
    expect(within(gallery).getByRole("radio", { name: "Rocket" })).toBeInTheDocument();
    // Nothing is selected yet, so the first icon is the gallery's tab stop and has focus.
    expect(within(gallery).getAllByRole("radio")[0]).toHaveFocus();
    expect(screen.getByRole("img", { name: /Preview .*: Default icon/ })).toBeInTheDocument();
  });

  it("picks a built-in icon with a tint and saves it", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("radio", { name: "Rocket" }));
    fireEvent.click(screen.getByRole("radio", { name: "Mint" }));
    expect(screen.getByRole("radio", { name: "Rocket" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("img", { name: /Rocket, mint$/ })).toBeInTheDocument();
    // Nothing is saved before Save.
    expect(store.get(driveKey(USB))).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(store.get(driveKey(USB))).toEqual({ type: "builtin", id: "rocket", tint: "mint" });
    expect(onClose).toHaveBeenCalled();
  });

  it("moves through the gallery with the arrow keys", () => {
    renderPicker();
    const radios = within(screen.getByRole("radiogroup", { name: "Built-in icons" })).getAllByRole(
      "radio",
    );
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    // One tab stop: only the selected radio is reachable with Tab.
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([radios[1]]);

    fireEvent.keyDown(radios[1], { key: "ArrowDown" });
    expect(radios[8]).toHaveFocus();
    fireEvent.keyDown(radios[8], { key: "End" });
    expect(radios[radios.length - 1]).toHaveFocus();
    fireEvent.keyDown(radios[radios.length - 1], { key: "Home" });
    expect(radios[0]).toHaveFocus();
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
  });

  it("uploads an image, shows a preview and saves it", async () => {
    stubImage(64, 64);
    renderPicker();
    const file = new File([new Uint8Array([137, 80, 78, 71])], "moon.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    const preview = await screen.findByRole("img", { name: /Your image \(moon\.png\)/ });
    expect(preview.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/png;base64,/),
    );
    // Tints only apply to built-in icons.
    expect(screen.getByRole("radio", { name: "Mint" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(store.get(driveKey(USB))).toMatchObject({ type: "image", name: "moon.png" });
  });

  it("accepts an .ico file even without a MIME type", async () => {
    stubImage(32, 32);
    renderPicker();
    fireEvent.change(fileInput(), {
      target: { files: [new File([new Uint8Array([0, 0, 1, 0])], "drive.ico")] },
    });
    const preview = await screen.findByRole("img", { name: /Your image \(drive\.ico\)/ });
    expect(preview.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/x-icon;/);
  });

  it("rejects files that are too large, too small or not images", async () => {
    stubImage(8, 8);
    renderPicker();

    fireEvent.change(fileInput(), {
      target: { files: [new File([new Uint8Array(MAX_ICON_FILE_BYTES + 1)], "huge.png")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("too large");

    fireEvent.change(fileInput(), {
      target: { files: [new File(["hello"], "notes.txt", { type: "text/plain" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't supported");

    fireEvent.change(fileInput(), {
      target: { files: [new File([new Uint8Array([1])], "tiny.png", { type: "image/png" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("too small");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(store.get(driveKey(USB))).toBeNull();
  });

  it("resets a custom icon to the default", () => {
    store.set(driveKey(USB), { type: "builtin", id: "gamepad", tint: "peach" });
    renderPicker();
    expect(screen.getByRole("radio", { name: "Game controller" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(screen.getByRole("img", { name: /Default icon$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(store.get(driveKey(USB))).toBeNull();
  });

  it("closes without saving on Cancel and on Escape", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("radio", { name: "Planet" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(store.get(driveKey(USB))).toBeNull();
  });

  it("keeps Tab inside the dialog", () => {
    renderPicker();
    const dialog = screen.getByRole("dialog");
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    fireEvent.keyDown(save, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });
});
