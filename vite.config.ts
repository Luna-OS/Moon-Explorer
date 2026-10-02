/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Moon Explorer frontend build configuration — the same React + Vite +
// Tailwind v4 setup as MoonTask and MoonDisk.
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    reporters: ["default"],
    // The first render of the whole app in jsdom takes ~4s (CSS included),
    // which is too close to the 5s default on a busy machine.
    testTimeout: 20_000,
  },
});
