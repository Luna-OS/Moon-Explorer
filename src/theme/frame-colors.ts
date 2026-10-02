import type { ResolvedTheme } from "./useTheme";

/**
 * Colors the native window needs before / outside the web UI: the
 * background shown while the UI loads and the window buttons drawn over
 * the custom title bar. They match `--me-frame` in tokens.css and Moon
 * Browser's FRAME_COLORS, so the shell (Electron's titleBarOverlay or
 * Tauri's window background) can use them directly.
 */
export const FRAME_COLORS: Record<ResolvedTheme, { frame: string; symbols: string }> = {
  dark: { frame: "#0b0920", symbols: "#f4f1ff" },
  light: { frame: "#ece7f7", symbols: "#1c1733" },
};

/** Height of the custom title bar in CSS pixels. */
export const TITLE_BAR_HEIGHT = 40;
