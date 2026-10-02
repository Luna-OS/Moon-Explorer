"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDefaultFileManager } = require("../manager.cjs");
const { MemoryRegistry } = require("../registry.cjs");
const L = require("../layout.cjs");

const EXE = "C:\\Program Files\\Moon Explorer\\Moon Explorer.exe";
const NEW_EXE = "D:\\Apps\\Moon Explorer\\Moon Explorer.exe";
const C = "Software\\Classes";
const FOLDER_SHELL = `${C}\\Folder\\shell`;
const DIR_SHELL = `${C}\\Directory\\shell`;
const DRIVE_SHELL = `${C}\\Drive\\shell`;
const WIN_E_CMD = `${C}\\CLSID\\${L.FILE_EXPLORER_CLSID}\\shell\\opennewwindow\\command`;

// A typical HKCU: another tool already has a verb under Directory\shell (NordVPN does), and unrelated keys exist.
const typicalSeed = () => ({
  [`${DIR_SHELL}\\NordVPN-file-share`]: { "": "Send with NordVPN Meshnet", Position: "Top" },
  [`${DIR_SHELL}\\NordVPN-file-share\\command`]: { "": 'nordvpn.exe -m --send "%1"' },
  [`${C}\\.txt`]: { "": "txtfile" },
  "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer": { ShellState: "x" },
});

function setup(seed = typicalSeed(), { exe = EXE, exists = [EXE, NEW_EXE] } = {}) {
  const reg = new MemoryRegistry(seed);
  const make = (exePath = exe) =>
    createDefaultFileManager({
      registry: reg,
      exePath,
      fileExists: (p) => exists.includes(p),
      now: () => new Date("2026-10-02T00:00:00Z"),
    });
  return { reg, dfm: make(), make, before: reg.dump() };
}

test("enable registers folders, drives, This PC and Win+E under HKCU", async () => {
  const { reg, dfm } = setup();
  const s = await dfm.enable();
  assert.equal(s.state, "on");
  const d = reg.dump();
  const cmd = `"${EXE}" "%1"`;
  assert.equal(d[FOLDER_SHELL][""], "MoonExplorer");
  assert.equal(d[`${FOLDER_SHELL}\\MoonExplorer\\command`][""], cmd);
  assert.equal(d[`${FOLDER_SHELL}\\MoonExplorer`][""], L.VERB_LABEL);
  assert.equal(d[`${FOLDER_SHELL}\\MoonExplorer`].Icon, `${EXE},0`);
  assert.equal(d[`${FOLDER_SHELL}\\MoonExplorer`].AppliesTo, "System.FileAttributes:>0");
  assert.equal(d[DRIVE_SHELL][""], "MoonExplorer");
  assert.equal(d[`${DRIVE_SHELL}\\MoonExplorer\\command`][""], cmd);
  assert.equal(d[`${C}\\CLSID\\${L.THIS_PC_CLSID}\\shell`][""], "MoonExplorer");
  assert.equal(
    d[`${C}\\CLSID\\${L.THIS_PC_CLSID}\\shell\\MoonExplorer\\command`][""],
    `"${EXE}" "--this-pc"`,
  );
  assert.equal(d[WIN_E_CMD][""], `"${EXE}"`);
  assert.equal(d[WIN_E_CMD].DelegateExecute, "");
  // Directory\shell gets no default verb (a Position=Top verb there would steal the double-click, see layout.js).
  assert.deepEqual(d[DIR_SHELL], {});
  assert.deepEqual(
    Object.keys(d).filter((k) => k.startsWith(`${DIR_SHELL}\\`)),
    [`${DIR_SHELL}\\NordVPN-file-share`, `${DIR_SHELL}\\NordVPN-file-share\\command`],
  );
});

test("every write goes to an allowed HKCU path, never HKLM or anything outside Classes / Luna-OS", async () => {
  const seed = typicalSeed();
  seed[DIR_SHELL] = { "": "openinfiles" };
  const { reg, dfm } = setup(seed);
  await dfm.enable();
  await dfm.disable();
  assert.ok(reg.log.length > 0);
  for (const op of reg.log) {
    assert.ok(L.isAllowedKey(op.key), op.key);
    assert.ok(!/^HK/i.test(op.key) && !/^SYSTEM|^Software\\Microsoft/i.test(op.key), op.key);
  }
});

test("the backup is written before anything else and records the previous values", async () => {
  const seed = typicalSeed();
  seed[FOLDER_SHELL] = { "": "open" };
  const { reg, dfm } = setup(seed);
  await dfm.enable();
  const first = reg.log[0];
  assert.deepEqual([first.op, first.key, first.name], ["setValue", L.STATE_KEY, L.BACKUP_VALUE]);
  const backup = JSON.parse(first.data);
  const folderDefault = backup.values.find((v) => v.key === FOLDER_SHELL && v.name === "");
  assert.equal(folderDefault.previous, "open");
  assert.equal(folderDefault.written, "MoonExplorer");
  assert.ok(backup.createdKeys.includes(`${C}\\Drive`));
  assert.ok(!backup.createdKeys.includes(FOLDER_SHELL), "Folder\\shell existed before");
});

test("disable restores the registry exactly as it was", async () => {
  const { reg, dfm, before } = setup();
  await dfm.enable();
  const s = await dfm.disable();
  assert.equal(s.state, "off");
  assert.deepEqual(reg.dump(), before);
  assert.deepEqual(s.skipped, []);
});

test("restores another file manager that was the default before (e.g. Files)", async () => {
  const seed = typicalSeed();
  seed[DIR_SHELL] = { "": "openinfiles" };
  seed[`${DIR_SHELL}\\openinfiles\\command`] = { "": '"files.exe" "%1"' };
  seed[DRIVE_SHELL] = { "": "openinfiles" };
  seed[`${DRIVE_SHELL}\\openinfiles\\command`] = { "": '"files.exe" "%1"' };
  seed[WIN_E_CMD] = { "": "files.exe", DelegateExecute: "" };
  const { reg, dfm, before } = setup(seed);
  assert.equal((await dfm.enable()).state, "on");
  const d = reg.dump();
  assert.equal(
    d[DIR_SHELL][""],
    "none",
    "Files' Directory default would win over Folder, so it is set to Windows' own value",
  );
  assert.equal(d[`${DIR_SHELL}\\openinfiles\\command`][""], '"files.exe" "%1"', "its verb stays");
  assert.equal(d[WIN_E_CMD][""], `"${EXE}"`);
  await dfm.enable(); // repair keeps the original values in the backup
  await dfm.disable();
  assert.deepEqual(reg.dump(), before);
});

test("keeps pre-existing keys even if they end up empty", async () => {
  const seed = typicalSeed();
  seed[DRIVE_SHELL] = {}; // existed, empty, not ours
  const { reg, dfm, before } = setup(seed);
  await dfm.enable();
  await dfm.disable();
  assert.ok(DRIVE_SHELL in reg.dump());
  assert.deepEqual(reg.dump(), before);
});

test("does not delete a key it created once someone else put something into it", async () => {
  const { reg, dfm } = setup();
  await dfm.enable();
  await reg.apply([
    { op: "setValue", key: `${DRIVE_SHELL}\\othertool\\command`, name: "", data: "other.exe" },
  ]);
  const s = await dfm.disable();
  const d = reg.dump();
  assert.equal(d[`${DRIVE_SHELL}\\othertool\\command`][""], "other.exe");
  assert.equal(d[`${DRIVE_SHELL}\\MoonExplorer`], undefined);
  assert.equal(d[DRIVE_SHELL][""], undefined, "our default verb is gone");
  assert.equal(d[DRIVE_SHELL][L.MARKER], undefined);
  assert.ok(s.keptKeys.includes(DRIVE_SHELL));
});

test("leaves a value alone that another program changed after enabling", async () => {
  const seed = typicalSeed();
  seed[FOLDER_SHELL] = { "": "open" };
  const { reg, dfm } = setup(seed);
  await dfm.enable();
  await reg.apply([{ op: "setValue", key: FOLDER_SHELL, name: "", data: "openinfiles" }]);
  assert.equal((await dfm.status()).state, "partial");
  const s = await dfm.disable();
  assert.equal(reg.dump()[FOLDER_SHELL][""], "openinfiles");
  assert.deepEqual(s.skipped, [{ key: FOLDER_SHELL, name: "", current: "openinfiles" }]);
});

test("status reports folders as overridden when another program takes Directory\\shell later", async () => {
  const { reg, dfm } = setup();
  await dfm.enable();
  await reg.apply([{ op: "setValue", key: DIR_SHELL, name: "", data: "openinfiles" }]);
  const s = await dfm.status();
  assert.equal(s.state, "partial");
  assert.equal(s.needsAttention, true);
  assert.equal(s.targets.find((t) => t.id === "folder").state, "overridden");
  assert.equal((await dfm.repair()).state, "on");
  await dfm.disable();
  assert.equal(reg.dump()[DIR_SHELL][""], "openinfiles", "what the other program set is restored");
});

test("status reports a moved exe as stale; repair re-registers and keeps the original backup", async () => {
  const { reg, make, before } = setup(undefined, { exists: [NEW_EXE] });
  // Enabled from the old location (which existed back then) …
  await createDefaultFileManager({ registry: reg, exePath: EXE, fileExists: () => true }).enable();
  // … then the app was moved.
  const moved = make(NEW_EXE);
  const s = await moved.status();
  assert.equal(s.state, "stale");
  assert.equal(s.needsAttention, true);
  assert.equal(s.registeredExe, EXE);
  assert.equal(s.registeredExeExists, false);
  assert.equal((await moved.repair()).state, "on");
  assert.equal(reg.dump()[`${FOLDER_SHELL}\\MoonExplorer\\command`][""], `"${NEW_EXE}" "%1"`);
  await moved.disable();
  assert.deepEqual(reg.dump(), before);
});

test("enable twice, disable once: still back to the original", async () => {
  const seed = typicalSeed();
  seed[FOLDER_SHELL] = { "": "open" };
  const { reg, dfm, before } = setup(seed);
  await dfm.enable();
  await dfm.enable();
  await dfm.disable();
  assert.deepEqual(reg.dump(), before);
});

test("disable when nothing is registered changes nothing", async () => {
  const { reg, dfm, before } = setup();
  const s = await dfm.disable();
  assert.equal(s.state, "off");
  assert.deepEqual(reg.dump(), before);
  assert.equal(reg.log.length, 0);
});

test("without the backup, disable still removes exactly its own keys (via the markers)", async () => {
  const { reg, dfm, before } = setup();
  await dfm.enable();
  await reg.apply([{ op: "deleteValue", key: L.STATE_KEY, name: L.BACKUP_VALUE }]);
  assert.equal((await dfm.status()).enabled, true);
  await dfm.disable();
  assert.deepEqual(reg.dump(), before);
});

test("an interrupted enable can be undone completely", async () => {
  const seed = typicalSeed();
  seed[FOLDER_SHELL] = { "": "open" };
  seed[DIR_SHELL] = { "": "openinfiles" };
  const reg = new MemoryRegistry(seed);
  const before = reg.dump();
  const realApply = reg.apply.bind(reg);
  for (const cut of [1, 3, 8, 15]) {
    // Crash after `cut` operations (the backup is always the first one).
    reg.apply = async (ops) => {
      await realApply(ops.slice(0, cut));
      throw new Error("power cut");
    };
    const dfm = createDefaultFileManager({ registry: reg, exePath: EXE });
    await assert.rejects(dfm.enable(), /power cut/);
    reg.apply = realApply;
    assert.equal((await dfm.status()).enabled, true, `cut ${cut}`);
    await dfm.disable();
    assert.deepEqual(reg.dump(), before, `cut ${cut}`);
  }
});

test("enable refuses a missing exe and changes nothing", async () => {
  const { reg, before } = setup();
  const dfm = createDefaultFileManager({
    registry: reg,
    exePath: "C:\\gone\\Moon Explorer.exe",
    fileExists: () => false,
  });
  await assert.rejects(dfm.enable(), /not found/);
  assert.deepEqual(reg.dump(), before);
});

test("development launch passes the app folder before the path", async () => {
  const reg = new MemoryRegistry();
  const dfm = createDefaultFileManager({
    registry: reg,
    exePath: "C:\\dev\\electron.exe",
    launchArgs: ["C:\\src\\moon"],
  });
  await dfm.enable();
  assert.equal(
    reg.dump()[`${FOLDER_SHELL}\\MoonExplorer\\command`][""],
    '"C:\\dev\\electron.exe" "C:\\src\\moon" "%1"',
  );
  assert.equal((await dfm.status()).state, "on");
});

test("status is off on a clean machine, and with another file manager installed", async () => {
  const seed = typicalSeed();
  seed[DIR_SHELL] = { "": "openinfiles" };
  for (const s of [setup().dfm, setup(seed).dfm].map((d) => d.status())) {
    const r = await s;
    assert.equal(r.state, "off");
    assert.equal(r.enabled, false);
    assert.ok(r.targets.every((t) => t.state === "off"));
  }
});
