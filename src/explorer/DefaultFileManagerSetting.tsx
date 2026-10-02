import { useEffect, useId, useState } from "react";
import type { DefaultFileManagerStatus, MoonBridge } from "@/fs/types";

function describe(s: DefaultFileManagerStatus): string {
  switch (s.state) {
    case "unsupported":
      return "Only available in the desktop app on Windows.";
    case "stale":
      return "The registration points to another copy of Moon Explorer. Register again to use this one.";
    case "partial":
      return "Another program has taken over part of it since. Register again to take it back.";
    case "on":
      return "On: folders, drives, This PC and Win+E open in Moon Explorer.";
    default:
      return "Off: Windows Explorer is the default.";
  }
}

/** The "Use as default file manager" switch in the settings (see docs/default-file-manager.md). */
export function DefaultFileManagerSetting({ bridge }: { bridge: MoonBridge }) {
  const id = useId();
  const [status, setStatus] = useState<DefaultFileManagerStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<DefaultFileManagerStatus>) => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let live = true;
    bridge
      .defaultFileManager()
      .then((s) => live && setStatus(s))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [bridge]);

  const unsupported = status?.state === "unsupported";
  const skipped = status?.skipped?.length ?? 0;
  return (
    <div className="mt-2 border-t border-(--me-border) pt-2">
      <div className="flex items-start gap-3 py-1.5">
        <input
          id={`${id}-switch`}
          type="checkbox"
          role="switch"
          className="me-switch mt-0.5"
          checked={Boolean(status?.enabled)}
          disabled={busy || !status || unsupported}
          aria-describedby={`${id}-hint ${id}-state`}
          onChange={(e) => {
            const on = e.target.checked;
            void run(() => bridge.setDefaultFileManager(on));
          }}
        />
        <div>
          <label htmlFor={`${id}-switch`} className="block text-(--me-text)">
            Use as default file manager
          </label>
          <span id={`${id}-hint`} className="block text-xs">
            Folders, drives, This PC and Win+E open Moon Explorer instead of Windows Explorer. Only
            for your user account, no administrator rights needed.
          </span>
        </div>
      </div>
      <p
        id={`${id}-state`}
        className="m-0 pl-12 text-xs"
        role="status"
        data-state={error ? "error" : (status?.state ?? "loading")}
        style={error ? { color: "var(--me-danger)" } : undefined}
      >
        {error
          ? `Couldn't change it: ${error}`
          : busy
            ? "One moment…"
            : status
              ? describe(status) +
                (skipped
                  ? ` ${skipped} ${skipped === 1 ? "entry was" : "entries were"} changed by another program and left as is.`
                  : "")
              : ""}
      </p>
      {status?.needsAttention && (
        <div className="pl-12 pt-2">
          <button
            type="button"
            className="me-btn"
            disabled={busy}
            onClick={() => void run(() => bridge.setDefaultFileManager(true))}
          >
            Register again
          </button>
        </div>
      )}
    </div>
  );
}
