"use strict";
// npm run app:dev – the Vite dev server with hot reload, inside the Electron window.
const { spawn } = require("child_process");
const path = require("path");

async function main() {
  const { createServer } = await import("vite");
  const server = await createServer({ configFile: path.join(__dirname, "..", "vite.config.ts") });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const electron = require("electron");
  const child = spawn(electron, ["."], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, MOON_DEV_URL: url },
  });
  child.on("exit", async (code) => {
    await server.close();
    process.exit(code ?? 0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
