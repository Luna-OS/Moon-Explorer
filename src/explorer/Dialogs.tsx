import { useId, useMemo, useState, type ReactNode } from "react";
import { dirname, join, stem } from "@/fs/paths";
import type { ConflictChoice } from "@/fs/types";
import { CloseIcon } from "@/theme/icons";
import { Modal } from "@/ui/Modal";
import { DefaultFileManagerSetting } from "./DefaultFileManagerSetting";
import { useStore } from "./model/store";
import type { DialogRequest, Settings, Workspace } from "./model/workspace";
import { planRenames, type CaseMode, type RenameRules } from "./rename";

function DialogFrame({
  title,
  onClose,
  footer,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  footer: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Modal
      labelledBy={`${id}-title`}
      onClose={onClose}
      className={wide ? "max-w-[46rem]" : "max-w-[28rem]"}
    >
      <div className="flex items-center gap-3 border-b border-(--me-border) px-5 py-3.5">
        <h2 id={`${id}-title`} className="m-0 flex-1 text-base font-semibold tracking-tight">
          {title}
        </h2>
        <button type="button" className="me-icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="px-5 py-4 text-sm text-(--me-text-muted)">{children}</div>
      <div className="flex justify-end gap-2 border-t border-(--me-border) px-5 py-3">{footer}</div>
    </Modal>
  );
}

/** Renders the dialog the workspace is waiting on, if any. */
export function Dialogs({ ws }: { ws: Workspace }) {
  useStore(ws);
  const d = ws.dialog;
  if (!d) return null;
  switch (d.type) {
    case "confirm":
      return <ConfirmDialog request={d} />;
    case "conflict":
      return <ConflictDialog request={d} />;
    case "prompt":
      return <PromptDialog request={d} />;
    case "bulk-rename":
      return <BulkRenameDialog ws={ws} request={d} />;
    case "settings":
      return <SettingsDialog ws={ws} request={d} />;
  }
}

function ConfirmDialog({ request }: { request: Extract<DialogRequest, { type: "confirm" }> }) {
  return (
    <DialogFrame
      title={request.title}
      onClose={() => request.resolve(false)}
      footer={
        <>
          <button
            type="button"
            className="me-btn me-btn-ghost"
            onClick={() => request.resolve(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            data-autofocus
            className={`me-btn ${request.danger ? "me-btn-danger" : "me-btn-primary"}`}
            onClick={() => request.resolve(true)}
          >
            {request.confirmLabel}
          </button>
        </>
      }
    >
      <p className="m-0">{request.message}</p>
    </DialogFrame>
  );
}

function ConflictDialog({ request }: { request: Extract<DialogRequest, { type: "conflict" }> }) {
  const choose = (c: ConflictChoice | null) => request.resolve(c);
  const shown = request.names.slice(0, 6);
  return (
    <DialogFrame
      title="Some items already exist"
      onClose={() => choose(null)}
      footer={
        <>
          <button type="button" className="me-btn me-btn-ghost" onClick={() => choose(null)}>
            Cancel
          </button>
          <button type="button" className="me-btn me-btn-ghost" onClick={() => choose("skip")}>
            Skip
          </button>
          <button
            type="button"
            data-autofocus
            className="me-btn me-btn-ghost"
            onClick={() => choose("keep")}
          >
            Keep both
          </button>
          <button type="button" className="me-btn me-btn-primary" onClick={() => choose("replace")}>
            Replace
          </button>
        </>
      }
    >
      <p className="m-0 mb-2">The destination already has:</p>
      <ul className="m-0 mb-2 list-disc pl-5 text-(--me-text)">
        {shown.map((n) => (
          <li key={n}>{n}</li>
        ))}
        {request.names.length > shown.length && (
          <li>and {request.names.length - shown.length} more</li>
        )}
      </ul>
      <p className="m-0">
        “Keep both” adds a number to the new copies; “Replace” moves the old ones to the Recycle
        Bin.
      </p>
    </DialogFrame>
  );
}

function PromptDialog({ request }: { request: Extract<DialogRequest, { type: "prompt" }> }) {
  const [value, setValue] = useState(request.value);
  const id = useId();
  return (
    <DialogFrame
      title={request.title}
      onClose={() => request.resolve(null)}
      footer={
        <>
          <button
            type="button"
            className="me-btn me-btn-ghost"
            onClick={() => request.resolve(null)}
          >
            Cancel
          </button>
          <button type="submit" form={id} className="me-btn me-btn-primary">
            {request.confirmLabel}
          </button>
        </>
      }
    >
      <form
        id={id}
        onSubmit={(e) => {
          e.preventDefault();
          request.resolve(value.trim());
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span>{request.label}</span>
          <input
            data-autofocus
            className="me-input"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) =>
              e.currentTarget.setSelectionRange(0, stem(e.currentTarget.value).length)
            }
          />
        </label>
      </form>
    </DialogFrame>
  );
}

function BulkRenameDialog({
  ws,
  request,
}: {
  ws: Workspace;
  request: Extract<DialogRequest, { type: "bulk-rename" }>;
}) {
  const [rules, setRules] = useState<RenameRules>({
    pattern: "{name}",
    find: "",
    replace: "",
    regex: false,
    caseMode: "keep",
    start: 1,
    digits: 2,
  });
  const plan = useMemo(() => planRenames(request.entries, rules), [request.entries, rules]);
  const changes = plan.filter((p) => p.newName !== p.entry.name);
  const blocked = changes.some((p) => p.error);
  const set = (patch: Partial<RenameRules>) => setRules((r) => ({ ...r, ...patch }));

  async function apply() {
    request.resolve(true);
    if (!changes.length) return;
    await ws.renameMany(
      request.pane,
      changes.map((p) => ({
        from: p.entry.path,
        to: join(dirname(p.entry.path) ?? "", p.newName),
      })),
    );
  }

  return (
    <DialogFrame
      wide
      title={`Rename ${request.entries.length} items`}
      onClose={() => request.resolve(false)}
      footer={
        <>
          <button
            type="button"
            className="me-btn me-btn-ghost"
            onClick={() => request.resolve(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="me-btn me-btn-primary"
            disabled={blocked || !changes.length}
            onClick={() => void apply()}
          >
            Rename
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span>Pattern</span>
          <input
            data-autofocus
            className="me-input"
            spellCheck={false}
            value={rules.pattern}
            onChange={(e) => set({ pattern: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Letter case</span>
          <select
            className="me-input"
            value={rules.caseMode}
            onChange={(e) => set({ caseMode: e.target.value as CaseMode })}
          >
            <option value="keep">Keep</option>
            <option value="lower">lower case</option>
            <option value="upper">UPPER CASE</option>
            <option value="title">Title Case</option>
          </select>
        </label>
      </div>
      <p className="mt-1.5 mb-3 text-xs">
        Placeholders: <code>{"{name}"}</code> original name, <code>{"{n}"}</code> number,{" "}
        <code>{"{date}"}</code> date modified, <code>{"{folder}"}</code> folder name. The extension
        stays.
      </p>
      <div className="grid grid-cols-[1fr_1fr_5rem_5rem] gap-3">
        <label className="flex flex-col gap-1">
          <span>Find</span>
          <input
            className="me-input"
            spellCheck={false}
            value={rules.find}
            onChange={(e) => set({ find: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Replace with</span>
          <input
            className="me-input"
            spellCheck={false}
            value={rules.replace}
            onChange={(e) => set({ replace: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Start at</span>
          <input
            type="number"
            min={0}
            className="me-input"
            value={rules.start}
            onChange={(e) => set({ start: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Digits</span>
          <input
            type="number"
            min={1}
            max={8}
            className="me-input"
            value={rules.digits}
            onChange={(e) => set({ digits: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2">
        <input
          type="checkbox"
          className="me-switch"
          checked={rules.regex}
          onChange={(e) => set({ regex: e.target.checked })}
        />
        Regular expressions
      </label>
      <div className="mt-3 max-h-64 overflow-auto rounded-(--radius-md) border border-(--me-border)">
        <table className="me-table" aria-label="Rename preview">
          <thead>
            <tr>
              <th className="pl-3">Current name</th>
              <th className="pr-3">New name</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((p) => (
              <tr key={p.entry.path}>
                <td className="pl-3">{p.entry.name}</td>
                <td
                  className="pr-3"
                  style={{
                    color: p.error
                      ? "var(--me-danger)"
                      : p.newName !== p.entry.name
                        ? "var(--me-accent)"
                        : undefined,
                  }}
                >
                  {p.newName}
                  {p.error ? ` — ${p.error}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DialogFrame>
  );
}

function SettingsDialog({
  ws,
  request,
}: {
  ws: Workspace;
  request: Extract<DialogRequest, { type: "settings" }>;
}) {
  const s = ws.settings;
  const toggle = (key: keyof Settings, label: string, hint?: string) => (
    <label className="flex items-start gap-3 py-1.5">
      <input
        type="checkbox"
        className="me-switch mt-0.5"
        checked={Boolean(s[key])}
        onChange={(e) => ws.updateSettings({ [key]: e.target.checked })}
      />
      <span>
        <span className="block text-(--me-text)">{label}</span>
        {hint && <span className="block text-xs">{hint}</span>}
      </span>
    </label>
  );
  return (
    <DialogFrame
      title="Settings"
      onClose={() => request.resolve(true)}
      footer={
        <button
          type="button"
          className="me-btn me-btn-primary"
          onClick={() => request.resolve(true)}
        >
          Done
        </button>
      }
    >
      {toggle("showExtensions", "Always show file name extensions")}
      {toggle("showHidden", "Show hidden files", "Ctrl+H")}
      {toggle("folderSizes", "Show folder sizes in the list", "Calculated in the background")}
      {toggle("preview", "Show the preview panel", "Alt+P")}
      {toggle("confirmDelete", "Ask before moving several items to the Recycle Bin")}
      {toggle("restoreSession", "Reopen my tabs at start")}
      <DefaultFileManagerSetting bridge={ws.bridge} />
    </DialogFrame>
  );
}
