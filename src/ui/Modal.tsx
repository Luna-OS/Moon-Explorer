import { useEffect, useRef, type ReactNode } from "react";
import { tabbables } from "./roving";

/**
 * A modal dialog: focus moves in (to the first `[data-autofocus]` element,
 * else the first control), Tab stays inside, Escape closes, and focus goes
 * back to where it was when the dialog closes.
 */
export function Modal({
  labelledBy,
  describedBy,
  onClose,
  className = "",
  children,
}: {
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    if (dialog) {
      const target =
        dialog.querySelector<HTMLElement>("[data-autofocus]") ?? tabbables(dialog)[0] ?? dialog;
      target.focus();
    }
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = tabbables(dialog);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgb(5_4_18/0.5)] p-6">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`me-popover w-full outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
