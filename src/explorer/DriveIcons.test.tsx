import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "@/App";
import { DriveIconStoreContext } from "@/drive-icons/context";
import { createLocalDriveIconStore } from "@/drive-icons/store";

/** Renders the app the way it starts: with a store read fresh from localStorage. */
function renderApp() {
  return render(
    <DriveIconStoreContext.Provider value={createLocalDriveIconStore(localStorage)}>
      <App />
    </DriveIconStoreContext.Provider>,
  );
}

function sidebarDrive(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-drive="${id}"]`);
  if (!el) throw new Error(`No sidebar drive ${id}`);
  return el;
}

function iconOf(el: HTMLElement) {
  return el.querySelector("[data-drive-icon]")?.getAttribute("data-drive-icon");
}

/** Right-click a drive and choose "Change icon…", then pick an icon and save. */
function changeIcon(target: HTMLElement, iconName: string) {
  fireEvent.contextMenu(target);
  const menu = screen.getByRole("menu");
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Change icon…" }));
  fireEvent.click(screen.getByRole("radio", { name: iconName }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

beforeEach(() => {
  localStorage.clear();
});

describe("custom drive icons in the explorer", () => {
  it("shows the default icons until one is changed", () => {
    renderApp();
    // In the sidebar the default is the moon-phase fill gauge.
    expect(iconOf(sidebarDrive("d"))).toBe("default");
    expect(sidebarDrive("d").querySelector("svg")).toBeInTheDocument();
  });

  it("changes a drive's icon from the sidebar's context menu", () => {
    renderApp();
    changeIcon(sidebarDrive("d"), "Rocket");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(iconOf(sidebarDrive("d"))).toBe("builtin:rocket");
    // Other drives keep theirs.
    expect(iconOf(sidebarDrive("c"))).toBe("default");
    // Focus goes back to the drive.
    expect(sidebarDrive("d")).toHaveFocus();
  });

  it("shows the custom icon in the This PC view, the heading and the path bar", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "This PC" }));
    const card = document.querySelector<HTMLElement>('[data-drive-card="e"]')!;
    expect(iconOf(card)).toBe("default");

    changeIcon(card, "Game controller");
    expect(iconOf(card)).toBe("builtin:gamepad");
    expect(iconOf(sidebarDrive("e"))).toBe("builtin:gamepad");

    fireEvent.click(card);
    expect(screen.getByRole("heading", { level: 2, name: "USB stick (E:)" })).toBeInTheDocument();
    expect(iconOf(screen.getByRole("heading", { level: 2 }))).toBe("builtin:gamepad");
    expect(iconOf(screen.getByRole("navigation", { name: "Path" }))).toBe("builtin:gamepad");
  });

  it("keeps the icon after a restart", () => {
    const first = renderApp();
    changeIcon(sidebarDrive("d"), "Planet");
    first.unmount();

    renderApp();
    expect(iconOf(sidebarDrive("d"))).toBe("builtin:planet");
  });

  it("changes and resets the icon from the drive's properties", () => {
    renderApp();
    fireEvent.click(sidebarDrive("z"));
    fireEvent.click(screen.getByRole("button", { name: "Properties" }));
    const properties = screen.getByRole("dialog", { name: "Starbase (Z:) properties" });
    expect(within(properties).getByText("Icon: Default icon")).toBeInTheDocument();

    fireEvent.click(within(properties).getByRole("button", { name: "Change icon…" }));
    fireEvent.click(screen.getByRole("radio", { name: "Cloud" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Saving returns to the properties, which show the new icon.
    const back = screen.getByRole("dialog", { name: "Starbase (Z:) properties" });
    expect(within(back).getByText("Icon: Cloud")).toBeInTheDocument();
    expect(iconOf(sidebarDrive("z"))).toBe("builtin:cloud");

    fireEvent.click(within(back).getByRole("button", { name: "Reset to default" }));
    expect(within(back).getByText("Icon: Default icon")).toBeInTheDocument();
    expect(iconOf(sidebarDrive("z"))).toBe("default");
  });

  it("opens the drive menu from the keyboard and moves through it with arrows", () => {
    renderApp();
    const drive = sidebarDrive("c");
    drive.focus();
    // Shift+F10 / the Menu key fire a contextmenu event without a pointer position.
    fireEvent.contextMenu(drive, { clientX: 0, clientY: 0 });
    const items = within(screen.getByRole("menu", { name: "System (C:)" })).getAllByRole(
      "menuitem",
    );
    expect(items.map((i) => i.textContent)).toEqual(["Open", "Change icon…", "Properties"]);
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(drive).toHaveFocus();
  });
});
