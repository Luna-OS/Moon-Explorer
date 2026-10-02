import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { nextRovingIndex } from "./roving";
import type { MenuAnchor, MenuEntry, MenuItem } from "./menu";

/** A right-click menu with arrow-key navigation (WAI-ARIA menu pattern). */
export function ContextMenu({
  label,
  anchor,
  items,
  onClose,
}: {
  label: string;
  anchor: MenuAnchor;
  items: MenuEntry[];
  onClose: () => void;
}) {
  const actionable = items.filter((i): i is MenuItem => i !== "separator" && !i.disabled);
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(anchor.x, window.innerWidth - width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(anchor.y, window.innerHeight - height - 4))}px`;
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    itemRefs.current[0]?.focus();
    const returnTo = anchor.returnFocusTo;
    const menu = ref.current;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onDismiss() {
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", onDismiss);
    window.addEventListener("resize", onDismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", onDismiss);
      window.removeEventListener("resize", onDismiss);
      // Give focus back unless something else (like a dialog) has taken it.
      const active = document.activeElement;
      if (!active || active === document.body || menu?.contains(active)) returnTo.focus();
    };
  }, [anchor.returnFocusTo, onClose]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onClose();
      return;
    }
    const index = itemRefs.current.findIndex((el) => el === document.activeElement);
    const next = nextRovingIndex(e.key, Math.max(0, index), actionable.length, 1);
    if (next !== null) {
      e.preventDefault();
      itemRefs.current[next]?.focus();
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="me-popover fixed z-50 flex max-h-[85vh] min-w-48 flex-col gap-0.5 overflow-y-auto p-1.5 outline-none"
      style={{ left: anchor.x, top: anchor.y }}
    >
      {items.map((item, i) => {
        if (item === "separator") {
          return <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-(--me-border)" />;
        }
        const k = actionable.indexOf(item);
        return (
          <button
            key={item.label}
            ref={(el) => {
              if (k >= 0) itemRefs.current[k] = el;
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            className="me-menu-item disabled:cursor-default disabled:opacity-40"
            style={item.danger ? { color: "var(--me-danger)" } : undefined}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <span className="text-(--me-text-muted)">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="pl-6 text-[0.6875rem] text-(--me-text-faint)">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
