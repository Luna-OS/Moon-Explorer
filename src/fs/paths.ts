/** Windows path helpers for the UI (the main process uses Node's `path.win32`). */

const SEP = "\\";
const DRIVE_ONLY = /^[a-z]:$/i;
const DRIVE_ROOT = /^[a-z]:\\?$/i;
const UNC_ROOT = /^\\\\[^\\]+\\[^\\]+\\?$/;

/** Backslashes, an upper-case drive letter, a trailing backslash only on roots. */
export function normalize(p: string): string {
  let s = p.replace(/\//g, SEP);
  if (DRIVE_ONLY.test(s)) s += SEP;
  if (s.length > 3 && s.endsWith(SEP) && !UNC_ROOT.test(s)) s = s.replace(/\\+$/, "");
  if (/^[a-z]:\\/i.test(s)) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

export function isRoot(p: string): boolean {
  return DRIVE_ROOT.test(p) || UNC_ROOT.test(p);
}

export function join(dir: string, name: string): string {
  return dir.endsWith(SEP) ? dir + name : dir + SEP + name;
}

/** The last segment; a drive root gives "C:". */
export function basename(p: string): string {
  const s = normalize(p);
  if (isRoot(s)) return s.replace(/\\$/, "");
  return s.slice(s.lastIndexOf(SEP) + 1);
}

/** The parent folder, or `null` for a root. */
export function dirname(p: string): string | null {
  const s = normalize(p);
  if (isRoot(s)) return null;
  const i = s.lastIndexOf(SEP);
  if (i < 0) return null;
  const d = s.slice(0, i);
  if (DRIVE_ONLY.test(d)) return d + SEP;
  if (/^\\\\[^\\]*$/.test(d)) return null;
  return d || null;
}

/** "photo.JPG" → "jpg"; dot files and folders have none. */
export function extname(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** The name without its extension. */
export function stem(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

/** Windows paths compare case-insensitively. */
export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && normalize(a).toLowerCase() === normalize(b).toLowerCase();
}

/** True when `child` is `parent` or lies inside it. */
export function isInside(child: string, parent: string): boolean {
  const c = normalize(child).toLowerCase();
  const p = normalize(parent).toLowerCase();
  return c === p || c.startsWith(p.endsWith(SEP) ? p : p + SEP);
}

/** Every ancestor from the root down to `p` itself. */
export function ancestors(p: string): string[] {
  const out: string[] = [];
  let cur: string | null = normalize(p);
  while (cur) {
    out.unshift(cur);
    cur = dirname(cur);
  }
  return out;
}

// Windows forbids these characters and the control characters in file names.
// eslint-disable-next-line no-control-regex
const INVALID_NAME = /[<>:"/\\|?*\u0000-\u001f]/;

/** Why a file name can't be used on Windows, or `null` if it's fine. */
export function invalidNameReason(name: string): string | null {
  if (!name || name === "." || name === "..") return "The name can't be empty.";
  if (INVALID_NAME.test(name))
    return "A name can't contain any of these characters: \\ / : * ? \" < > |";
  if (/[. ]$/.test(name)) return "A name can't end with a dot or a space.";
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(name))
    return `"${name}" is reserved by Windows.`;
  return null;
}

/**
 * Expands what someone types into the path bar: `%VAR%`, `~` and the
 * common `shell:` folders.
 */
export function expandPath(
  raw: string,
  env: Record<string, string>,
  places: Partial<Record<string, string | null>>,
): string {
  let s = raw
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/\//g, SEP);
  s = s.replace(/%([^%]+)%/g, (match, name: string) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? env[key] : match;
  });
  if ((s === "~" || s.startsWith("~\\")) && places.home) s = places.home + s.slice(1);
  const shellFolders: Record<string, string> = {
    "shell:desktop": "desktop",
    "shell:downloads": "downloads",
    "shell:personal": "documents",
    "shell:documents": "documents",
    "shell:my pictures": "pictures",
    "shell:pictures": "pictures",
    "shell:my music": "music",
    "shell:music": "music",
    "shell:my video": "videos",
    "shell:videos": "videos",
    "shell:profile": "home",
  };
  const m = /^shell:[^\\]+/i.exec(s);
  const place = m && places[shellFolders[m[0].toLowerCase()]];
  if (m && place) s = place + s.slice(m[0].length);
  if (DRIVE_ONLY.test(s)) s += SEP;
  return s;
}
