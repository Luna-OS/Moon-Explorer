"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveStart, normalizeArg } = require("../../start.cjs");
const { parseCliAction, runCliAction } = require("../cli.cjs");
const { createDefaultFileManager } = require("../manager.cjs");
const { MemoryRegistry } = require("../registry.cjs");

const fsFake = {
  "C:\\": "dir",
  "D:\\": "dir",
  "C:\\Users\\Luna\\Desktop\\Photos": "dir",
  "C:\\Users\\Luna\\Desktop\\Photos\\moon.png": "file",
  "\\\\nas\\share\\": "dir",
};
const stat = (p) => fsFake[p] || null;
const resolve = (args) => resolveStart(args, { stat, cwd: "C:\\Users\\Luna\\Desktop" });

test("no argument opens the home view", () => {
  assert.deepEqual(resolve([]), { kind: "home" });
  assert.deepEqual(resolve(undefined), { kind: "home" });
});

test("a folder path opens that folder", () => {
  assert.deepEqual(resolve(["C:\\Users\\Luna\\Desktop\\Photos"]), {
    kind: "folder",
    path: "C:\\Users\\Luna\\Desktop\\Photos",
  });
});

test('a drive root survives the "C:\\" quoting bug', () => {
  // `"C:\"` on a command line is parsed as `C:"`.
  assert.equal(normalizeArg('C:"'), "C:\\");
  assert.deepEqual(resolve(['C:"']), { kind: "folder", path: "C:\\" });
  assert.deepEqual(resolve(["D:\\"]), { kind: "folder", path: "D:\\" });
  assert.deepEqual(resolve(["d:"]), { kind: "folder", path: "D:\\" });
});

test("UNC share roots work", () => {
  assert.deepEqual(resolve(["\\\\nas\\share\\"]), { kind: "folder", path: "\\\\nas\\share\\" });
});

test("This PC, shell items, files and missing paths", () => {
  assert.deepEqual(resolve(["--this-pc"]), { kind: "this-pc" });
  assert.deepEqual(resolve(["::{645FF040-5081-101B-9F08-00AA002F954E}"]), {
    kind: "shell",
    target: "::{645FF040-5081-101B-9F08-00AA002F954E}",
  });
  assert.deepEqual(resolve(["shell:Downloads"]), { kind: "shell", target: "shell:Downloads" });
  assert.deepEqual(resolve(["C:\\Users\\Luna\\Desktop\\Photos\\moon.png"]), {
    kind: "file",
    path: "C:\\Users\\Luna\\Desktop\\Photos\\moon.png",
    folder: "C:\\Users\\Luna\\Desktop\\Photos",
  });
  assert.deepEqual(resolve(["X:\\gone"]), { kind: "missing", path: "X:\\gone" });
});

test("Electron switches are skipped and relative paths resolve against the working folder", () => {
  assert.deepEqual(resolve(["--allow-file-access-from-files", "Photos"]), {
    kind: "folder",
    path: "C:\\Users\\Luna\\Desktop\\Photos",
  });
});

test("CLI flags", async () => {
  assert.equal(parseCliAction(["Moon Explorer.exe", "--set-default"]), "set");
  assert.equal(parseCliAction(["electron.exe", ".", "--unset-default"]), "unset");
  assert.equal(parseCliAction(["x", "--default-status"]), "status");
  assert.equal(parseCliAction(["x", "C:\\"]), null);

  const reg = new MemoryRegistry();
  const before = reg.dump();
  const dfm = createDefaultFileManager({ registry: reg, exePath: "C:\\m.exe" });
  const lines = [];
  const out = { log: (l) => lines.push(l), error: (l) => lines.push(l) };
  assert.equal(await runCliAction(dfm, "set", out), 0);
  assert.equal((await dfm.status()).state, "on");
  assert.equal(await runCliAction(dfm, "status", out), 0);
  assert.equal(await runCliAction(dfm, "unset", out), 0);
  assert.deepEqual(reg.dump(), before);

  const broken = {
    enable: async () => {
      throw new Error("boom");
    },
  };
  assert.equal(await runCliAction(broken, "set", out), 1);
  assert.match(lines.at(-1), /boom/);
});
