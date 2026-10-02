/**
 * Arrow-key movement for a roving focus (a grid of radios, a menu). Returns
 * the index to move to, or null when the key isn't a navigation key.
 * `columns` is 1 for a vertical list and the item count for a single row.
 */
export function nextRovingIndex(
  key: string,
  index: number,
  count: number,
  columns: number,
): number | null {
  if (count === 0) return null;
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i));
  switch (key) {
    case "ArrowRight":
      return columns === 1 ? null : (index + 1) % count;
    case "ArrowLeft":
      return columns === 1 ? null : (index - 1 + count) % count;
    case "ArrowDown":
      if (columns === count) return null;
      return columns === 1 ? (index + 1) % count : clamp(index + columns);
    case "ArrowUp":
      if (columns === count) return null;
      return columns === 1 ? (index - 1 + count) % count : clamp(index - columns);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** Every element inside `root` that Tab can reach, in order. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex >= 0);
}
