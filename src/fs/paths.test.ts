import { describe, expect, it } from "vitest";
import {
  ancestors,
  basename,
  dirname,
  expandPath,
  extname,
  invalidNameReason,
  isInside,
  normalize,
  samePath,
  stem,
} from "./paths";
import { formatDate, fuzzyScore, kindOf, typeLabel } from "./format";

describe("paths", () => {
  it("normalizes slashes, drive letters and trailing separators", () => {
    expect(normalize("c:/Users/Luna/")).toBe("C:\\Users\\Luna");
    expect(normalize("d:")).toBe("D:\\");
    expect(normalize("C:\\")).toBe("C:\\");
  });

  it("splits paths like Windows does", () => {
    expect(basename("C:\\Users\\Luna\\notes.txt")).toBe("notes.txt");
    expect(basename("C:\\")).toBe("C:");
    expect(dirname("C:\\Users")).toBe("C:\\");
    expect(dirname("C:\\")).toBeNull();
    expect(ancestors("C:\\Users\\Luna")).toEqual(["C:\\", "C:\\Users", "C:\\Users\\Luna"]);
    expect(extname("Photo.JPG")).toBe("jpg");
    expect(extname(".gitignore")).toBe("");
    expect(stem("archive.tar.gz")).toBe("archive.tar");
  });

  it("compares case-insensitively", () => {
    expect(samePath("c:\\users", "C:\\Users\\")).toBe(true);
    expect(isInside("C:\\Users\\Luna\\Music", "c:\\users")).toBe(true);
    expect(isInside("C:\\Users2", "C:\\Users")).toBe(false);
  });

  it("rejects names Windows can't store", () => {
    expect(invalidNameReason("ok name.txt")).toBeNull();
    expect(invalidNameReason("a:b")).toMatch(/can't contain/);
    expect(invalidNameReason("trailing.")).toMatch(/dot or a space/);
    expect(invalidNameReason("CON.txt")).toMatch(/reserved/);
  });

  it("expands variables, ~ and shell folders", () => {
    const env = { APPDATA: "C:\\Users\\Luna\\AppData\\Roaming" };
    const places = { home: "C:\\Users\\Luna", downloads: "C:\\Users\\Luna\\Downloads" };
    expect(expandPath("%appdata%\\Code", env, places)).toBe(
      "C:\\Users\\Luna\\AppData\\Roaming\\Code",
    );
    expect(expandPath("~/Music", env, places)).toBe("C:\\Users\\Luna\\Music");
    expect(expandPath("shell:Downloads", env, places)).toBe("C:\\Users\\Luna\\Downloads");
    expect(expandPath("d:", env, places)).toBe("d:\\");
  });
});

describe("format", () => {
  it("names file types", () => {
    expect(typeLabel({ isDir: true, ext: "" })).toBe("File folder");
    expect(typeLabel({ isDir: false, ext: "png" })).toBe("PNG image");
    expect(typeLabel({ isDir: false, ext: "flac" })).toBe("FLAC audio");
    expect(typeLabel({ isDir: false, ext: "md" })).toBe("Markdown document");
    expect(typeLabel({ isDir: false, ext: "xyz" })).toBe("XYZ file");
    expect(kindOf({ isDir: false, ext: "zip" })).toBe("archive");
  });

  it("shows recent dates relative to today", () => {
    const now = new Date(2026, 9, 2, 12, 0);
    expect(formatDate(new Date(2026, 9, 2, 9, 5).getTime(), true, now)).toBe("Today, 09:05");
    expect(formatDate(new Date(2026, 9, 1, 23, 0).getTime(), true, now)).toBe("Yesterday, 23:00");
  });

  it("ranks fuzzy matches", () => {
    expect(fuzzyScore("dl", "Downloads")).toBeGreaterThan(0);
    expect(fuzzyScore("down", "Downloads")).toBeGreaterThan(
      fuzzyScore("down", "Open in Windows Explorer"),
    );
    expect(fuzzyScore("xyz", "Downloads")).toBe(-1);
  });
});
