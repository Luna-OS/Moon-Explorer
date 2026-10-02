import { useId } from "react";
import { DriveIcon } from "@/drive-icons/DriveIcon";
import { useDriveIconChoice, useDriveIconStore } from "@/drive-icons/context";
import { describeChoice } from "@/drive-icons/describe";
import { driveKey } from "@/drive-icons/store";
import { CloseIcon, EditIcon } from "@/theme/icons";
import { Modal } from "@/ui/Modal";
import { DRIVE_KIND_LABELS, formatBytes, type Drive } from "./sample";

/** A drive's properties, with the button to change its icon. */
export function DriveProperties({
  drive,
  onChangeIcon,
  onClose,
}: {
  drive: Drive;
  onChangeIcon: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const store = useDriveIconStore();
  const choice = useDriveIconChoice(drive);
  const fraction = drive.used / drive.total;
  const name = `${drive.label} (${drive.letter})`;

  const rows: [string, string][] = [
    ["Type", DRIVE_KIND_LABELS[drive.kind]],
    ["Used space", formatBytes(drive.used)],
    ["Free space", formatBytes(drive.total - drive.used)],
    ["Capacity", formatBytes(drive.total)],
  ];

  return (
    <Modal labelledBy={`${id}-title`} onClose={onClose} className="max-w-[26rem]">
      <div className="flex items-center gap-3 border-b border-(--me-border) px-5 py-3.5">
        <h2 id={`${id}-title`} className="flex-1 text-base font-semibold tracking-tight">
          {name} properties
        </h2>
        <button type="button" className="me-icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex items-center gap-4">
          <span className="me-inset grid size-16 place-items-center text-(--me-text)">
            <DriveIcon
              drive={drive}
              size={40}
              label={`Icon of ${name}: ${describeChoice(choice)}`}
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold">{name}</div>
            <div className="text-xs text-(--me-text-muted)">Icon: {describeChoice(choice)}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="me-btn me-btn-ghost me-btn-sm"
                onClick={onChangeIcon}
              >
                <EditIcon size={13} />
                Change icon…
              </button>
              {choice && (
                <button
                  type="button"
                  className="me-btn me-btn-ghost me-btn-sm"
                  onClick={() => store.reset(driveKey(drive))}
                >
                  Reset to default
                </button>
              )}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm tabular-nums">
          {rows.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-(--me-text-muted)">{term}</dt>
              <dd className="m-0 text-right">{value}</dd>
            </div>
          ))}
        </dl>
        <div
          className="me-meter"
          data-tone={fraction > 0.9 ? "warning" : undefined}
          role="meter"
          aria-label={`${drive.label} used`}
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${fraction * 100}%` }} />
        </div>
      </div>

      <div className="flex justify-end border-t border-(--me-border) px-5 py-3.5">
        <button type="button" className="me-btn me-btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
