"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePicker } = require("../picker.cjs");

test("parsePicker reads the mode, name, filters and result path", () => {
  const p = parsePicker([
    "--save-dialog",
    "--name",
    "notes.txt",
    "--filter",
    "Text documents:txt,md",
    "--filter",
    "All files:*",
    "--result",
    "C:\\out.txt",
  ]);
  assert.equal(p.mode, "save");
  assert.equal(p.title, "Save As");
  assert.equal(p.suggestedName, "notes.txt");
  assert.equal(p.resultPath, "C:\\out.txt");
  assert.deepEqual(p.filters, [
    { label: "Text documents", extensions: ["txt", "md"] },
    { label: "All files", extensions: ["*"] },
  ]);
});

test("parsePicker handles open and folder, and a leading '.' or '*' in extensions", () => {
  assert.equal(parsePicker(["--open-dialog"]).mode, "open");
  assert.equal(parsePicker(["--open-dialog"]).title, "Open");
  assert.equal(parsePicker(["--pick-folder"]).mode, "folder");
  assert.deepEqual(parsePicker(["--open-dialog", "--filter", "Images:.png, *.jpg"]).filters, [
    { label: "Images", extensions: ["png", "jpg"] },
  ]);
});

test("parsePicker returns null for a normal launch", () => {
  assert.equal(parsePicker(["C:\\Users\\Luna"]), null);
  assert.equal(parsePicker([]), null);
});
