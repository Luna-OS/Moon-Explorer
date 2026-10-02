import { useEffect, useState } from "react";

/** What the user picked; "system" follows the OS (as in MoonTask). */
export type ThemeChoice = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export function resolveTheme(choice: ThemeChoice, prefersLight: boolean): ResolvedTheme {
  if (choice === "system") return prefersLight ? "light" : "dark";
  return choice;
}

/**
 * Resolves the theme choice against the OS preference and applies it as
 * `<html data-theme="…">`, which tokens.css switches on.
 */
export function useDocumentTheme(choice: ThemeChoice): ResolvedTheme {
  const [prefersLight, setPrefersLight] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false,
  );

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!media) return;
    const onChange = (e: MediaQueryListEvent) => setPrefersLight(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const theme = resolveTheme(choice, prefersLight);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return theme;
}
