import { DemoBridge } from "./demo";
import type { MoonBridge } from "./types";

declare global {
  interface Window {
    /** Set by electron/preload.cjs when the UI runs inside the desktop app. */
    moon?: MoonBridge;
  }
}

/** The desktop shell's bridge, or the in-memory demo in a browser and in tests. */
export function defaultBridge(): MoonBridge {
  return window.moon ?? new DemoBridge();
}
