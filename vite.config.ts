/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/**
 * The desktop app loads the built page from disk, so the production build
 * gets a strict Content Security Policy. (The dev server needs inline
 * scripts for hot reload, so it stays without one.) moon-file: is the
 * protocol the Electron main process serves local files on.
 */
function contentSecurityPolicy(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: moon-file:",
    "media-src 'self' blob: moon-file:",
    "font-src 'self' data: moon-file:",
    "frame-src moon-file:",
    "object-src moon-file:",
    "connect-src 'self' moon-file:",
  ].join("; ");
  return {
    name: "moon-explorer-csp",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      ),
  };
}

// Moon Explorer frontend build configuration — the same React + Vite +
// Tailwind v4 setup as MoonTask and MoonDisk.
export default defineConfig({
  // Relative asset URLs, so the build also works from file:// in the desktop app.
  base: "./",
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },

  test: {
    environment: "jsdom",
    // electron/ holds the main-process tests; they run under node --test (npm run test:main).
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    reporters: ["default"],
    // The first render of the whole app in jsdom takes ~4s (CSS included),
    // which is too close to the 5s default on a busy machine.
    testTimeout: 20_000,
  },
});
