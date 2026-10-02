import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { Drive } from "@/explorer/sample";
import { CloseIcon, UploadIcon } from "@/theme/icons";
import { Modal } from "@/ui/Modal";
import { nextRovingIndex } from "@/ui/roving";
import { BUILTIN_ICONS, DEFAULT_ICON_BY_KIND, TINTS, tintColor } from "./builtins";
import { describeChoice } from "./describe";
import { useDriveIconChoice, useDriveIconStore } from "./context";
import { ChoiceIcon } from "./DriveIcon";
import {
  ICON_FILE_ACCEPT,
  ICON_FORMATS_LABEL,
  IconImageError,
  MAX_ICON_FILE_BYTES,
  MAX_ICON_PIXELS,
  formatFileSize,
  prepareIconImage,
} from "./image";
import { driveKey, type DriveIconChoice } from "./store";

/** Columns of the built-in gallery; arrow up/down move by this many. */
const GALLERY_COLUMNS = 7;

/**
 * "Change icon…" for a drive: pick a built-in icon (optionally tinted),
 * upload an image, or go back to the default. Nothing is saved until Save.
 */
export function DriveIconPicker({ drive, onClose }: { drive: Drive; onClose: () => void }) {
  const store = useDriveIconStore();
  const saved = useDriveIconChoice(drive);
  const [draft, setDraft] = useState<DriveIconChoice | null>(saved);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const galleryRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tintRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const driveName = `${drive.label} (${drive.letter})`;

  const selectedIcon = draft?.type === "builtin" ? draft.id : null;
  const selectedTint = draft?.type === "builtin" ? (draft.tint ?? null) : null;
  // The gallery is one tab stop: the selected icon, or the first one.
  const galleryFocusIndex = Math.max(
    0,
    BUILTIN_ICONS.findIndex((icon) => icon.id === selectedIcon),
  );
  const tintOptions = [null, ...TINTS.map((t) => t.id)];
  const tintFocusIndex = Math.max(0, tintOptions.indexOf(selectedTint));
  const canTint = draft?.type !== "image";

  function pickIcon(iconId: string) {
    setError(null);
    setDraft({ type: "builtin", id: iconId, ...(selectedTint ? { tint: selectedTint } : {}) });
  }

  function pickTint(tint: string | null) {
    setError(null);
    // Tinting the default icon turns it into that built-in icon with a tint.
    const iconId = selectedIcon ?? DEFAULT_ICON_BY_KIND[drive.kind].id;
    setDraft({ type: "builtin", id: iconId, ...(tint ? { tint } : {}) });
  }

  function onGalleryKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextRovingIndex(e.key, index, BUILTIN_ICONS.length, GALLERY_COLUMNS);
    if (next === null) return;
    e.preventDefault();
    pickIcon(BUILTIN_ICONS[next].id);
    galleryRefs.current[next]?.focus();
  }

  function onTintKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextRovingIndex(e.key, index, tintOptions.length, tintOptions.length);
    if (next === null) return;
    e.preventDefault();
    pickTint(tintOptions[next]);
    tintRefs.current[next]?.focus();
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Let the same file be picked again after an error.
    e.target.value = "";
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const dataUrl = await prepareIconImage(file);
      setDraft({ type: "image", dataUrl, name: file.name });
    } catch (err) {
      setError(err instanceof IconImageError ? err.message : "That image couldn't be read.");
    } finally {
      setLoading(false);
    }
  }

  function save() {
    try {
      if (draft) store.set(driveKey(drive), draft);
      else store.reset(driveKey(drive));
      onClose();
    } catch {
      setError("The icon couldn't be saved. If it's an image, try a smaller one.");
    }
  }

  return (
    <Modal labelledBy={`${id}-title`} onClose={onClose} className="max-w-[35rem]">
      <div className="flex items-center gap-3 border-b border-(--me-border) px-5 py-3.5">
        <h2 id={`${id}-title`} className="flex-1 text-base font-semibold tracking-tight">
          Change icon for {driveName}
        </h2>
        <button type="button" className="me-icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div className="flex flex-col gap-5 px-5 py-4">
        <section aria-labelledby={`${id}-preview`} className="flex items-center gap-4">
          <div className="me-inset flex items-end gap-4 px-4 py-3 text-(--me-text)">
            <ChoiceIcon
              choice={draft}
              fallback={drive}
              size={56}
              label={`Preview of the new icon for ${driveName}: ${describeChoice(draft)}`}
            />
            <ChoiceIcon choice={draft} fallback={drive} size={30} />
            <ChoiceIcon choice={draft} fallback={drive} size={16} />
          </div>
          <div className="min-w-0">
            <div id={`${id}-preview`} className="me-eyebrow">
              Preview
            </div>
            <p className="mt-1 truncate text-sm font-medium" aria-live="polite">
              {describeChoice(draft)}
            </p>
            <p className="text-xs text-(--me-text-muted)">
              {draft === saved ? "Current icon" : "Not saved yet"}
            </p>
          </div>
        </section>

        <section aria-labelledby={`${id}-gallery`}>
          <h3 id={`${id}-gallery`} className="me-eyebrow mb-2">
            Built-in icons
          </h3>
          <div
            role="radiogroup"
            aria-labelledby={`${id}-gallery`}
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${GALLERY_COLUMNS}, minmax(0, 1fr))` }}
          >
            {BUILTIN_ICONS.map((icon, i) => {
              const checked = icon.id === selectedIcon;
              return (
                <button
                  key={icon.id}
                  ref={(el) => {
                    galleryRefs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={icon.label}
                  title={icon.label}
                  tabIndex={i === galleryFocusIndex ? 0 : -1}
                  data-autofocus={i === galleryFocusIndex ? true : undefined}
                  onClick={() => pickIcon(icon.id)}
                  onKeyDown={(e) => onGalleryKeyDown(e, i)}
                  className="me-icon-choice"
                  style={{ color: checked ? tintColor(selectedTint ?? undefined) : undefined }}
                >
                  <icon.Icon size={22} />
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby={`${id}-tint`}>
          <h3 id={`${id}-tint`} className="me-eyebrow mb-2">
            Tint
          </h3>
          <div
            role="radiogroup"
            aria-labelledby={`${id}-tint`}
            aria-describedby={canTint ? undefined : `${id}-tint-hint`}
            className="flex flex-wrap items-center gap-2"
          >
            {tintOptions.map((tint, i) => {
              const label = tint ? (TINTS.find((t) => t.id === tint)?.label ?? tint) : "No tint";
              return (
                <button
                  key={tint ?? "none"}
                  ref={(el) => {
                    tintRefs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={canTint && tint === selectedTint}
                  aria-label={label}
                  title={label}
                  disabled={!canTint}
                  tabIndex={i === tintFocusIndex ? 0 : -1}
                  onClick={() => pickTint(tint)}
                  onKeyDown={(e) => onTintKeyDown(e, i)}
                  className="me-swatch"
                  data-none={tint ? undefined : true}
                  style={{ color: tint ? `var(--me-tint-${tint})` : undefined }}
                />
              );
            })}
            {!canTint && (
              <span id={`${id}-tint-hint`} className="text-xs text-(--me-text-muted)">
                Tints apply to built-in icons.
              </span>
            )}
          </div>
        </section>

        <section aria-labelledby={`${id}-upload`}>
          <h3 id={`${id}-upload`} className="me-eyebrow mb-2">
            Your own image
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="me-btn me-btn-ghost"
              onClick={() => fileInput.current?.click()}
              disabled={loading}
              aria-describedby={`${id}-upload-hint`}
            >
              <UploadIcon size={15} />
              {loading ? "Reading image…" : "Choose image…"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={ICON_FILE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label="Image file for the drive icon"
              onChange={(e) => void onFileChange(e)}
            />
            <p id={`${id}-upload-hint`} className="text-xs text-(--me-text-muted)">
              {ICON_FORMATS_LABEL}, up to {formatFileSize(MAX_ICON_FILE_BYTES)}. Larger pictures are
              scaled to {MAX_ICON_PIXELS} px.
            </p>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-(--me-danger)">
              {error}
            </p>
          )}
        </section>
      </div>

      <div className="flex items-center gap-2 border-t border-(--me-border) px-5 py-3.5">
        <button
          type="button"
          className="me-btn me-btn-ghost"
          onClick={() => {
            setError(null);
            setDraft(null);
          }}
          disabled={draft === null}
        >
          Reset to default
        </button>
        <span className="flex-1" />
        <button type="button" className="me-btn me-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="me-btn me-btn-primary" onClick={save} disabled={loading}>
          Save
        </button>
      </div>
    </Modal>
  );
}
