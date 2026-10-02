import type { MouseEvent, ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
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
