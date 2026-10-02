import type { MouseEvent, ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  /** Shown on the right, e.g. "Ctrl+C". */
  shortcut?: string;
  disabled?: boolean;
  /** Destructive actions (delete) are tinted. */
  danger?: boolean;
  onSelect: () => void;
}

/** A menu row, or a separator line between groups. */
export type MenuEntry = MenuItem | "separator";

/** Drops falsy entries and doubled, leading or trailing separators. */
export function cleanMenu(entries: (MenuEntry | false | null | undefined)[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const e of entries) {
    if (!e) continue;
    if (e === "separator" && (out.length === 0 || out[out.length - 1] === "separator")) continue;
    out.push(e);
  }
  while (out[out.length - 1] === "separator") out.pop();
  return out;
}

/** Where a context menu opens, and the element that gets focus back. */
export interface MenuAnchor {
  x: number;
  y: number;
  returnFocusTo: HTMLElement;
}

/**
 * The anchor for a `contextmenu` event. A keyboard-triggered one (Shift+F10
 * or the Menu key) has no pointer position, so the menu opens under the
 * element instead.
 */
export function anchorFromEvent(e: MouseEvent<HTMLElement>): MenuAnchor {
  const el = e.currentTarget;
  if (e.clientX === 0 && e.clientY === 0) {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + 8, y: rect.bottom + 4, returnFocusTo: el };
  }
  return { x: e.clientX, y: e.clientY, returnFocusTo: el };
}
