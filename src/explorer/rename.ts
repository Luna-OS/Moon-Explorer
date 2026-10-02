import { basename, dirname, extname, invalidNameReason, stem } from "@/fs/paths";
import type { FsEntry } from "@/fs/types";

export type CaseMode = "keep" | "lower" | "upper" | "title";

export interface RenameRules {
  pattern: string;
  find: string;
  replace: string;
  regex: boolean;
  caseMode: CaseMode;
  start: number;
  digits: number;
}

export interface RenamePlanRow {
  entry: FsEntry;
  newName: string;
  error: string | null;
}

/** Applies the bulk-rename rules to every entry; the extension always stays. */
export function planRenames(entries: FsEntry[], rules: RenameRules): RenamePlanRow[] {
  let re: RegExp | null = null;
  if (rules.find) {
    try {
      re = rules.regex
        ? new RegExp(rules.find, "g")
        : new RegExp(rules.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    } catch {
      re = null;
    }
  }
  const seen = new Set<string>();
  return entries.map((entry, i) => {
    const ext = entry.isDir ? "" : extname(entry.name);
    const base = entry.isDir ? entry.name : stem(entry.name);
    const number = String(rules.start + i).padStart(rules.digits, "0");
    const d = new Date(entry.mtime);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let name = (rules.pattern || "{name}")
      .replace(/\{name\}/g, base)
      .replace(/\{n\}/g, number)
      .replace(/\{date\}/g, date)
      .replace(/\{folder\}/g, basename(dirname(entry.path) ?? ""));
    if (re) name = name.replace(re, rules.replace);
    if (rules.caseMode === "lower") name = name.toLowerCase();
    else if (rules.caseMode === "upper") name = name.toUpperCase();
    else if (rules.caseMode === "title")
      name = name
        .toLowerCase()
        .replace(/(^|[\s_\-.(])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
    const original = entry.isDir ? "" : entry.name.slice(stem(entry.name).length);
    const newName = ext ? `${name}${original}` : name;
    const key = newName.toLowerCase();
    const error = invalidNameReason(newName) ?? (seen.has(key) ? "Duplicate name" : null);
    seen.add(key);
    return { entry, newName, error };
  });
}
