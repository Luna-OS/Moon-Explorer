import type { MouseEvent } from "react";
import { DriveIcon } from "@/drive-icons/DriveIcon";
import { formatCapacity } from "@/fs/format";
import { ReloadIcon } from "@/theme/icons";
import { DRIVE_KIND_LABELS, type Drive } from "./sample";

/** Asks Windows again for the drives' size and free space; spins while it does. */
export function RefreshDrivesButton({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <button
      type="button"
      className="me-icon-btn h-6 w-6"
      aria-label="Refresh drives"
      title="Refresh drives"
      aria-busy={refreshing}
      disabled={refreshing}
      onClick={onRefresh}
    >
      <span className={refreshing ? "inline-flex motion-safe:animate-spin" : "inline-flex"}>
        <ReloadIcon size={13} />
      </span>
    </button>
  );
}

/** "This PC": every drive as a card with its icon and how full it is. */
export function ThisPcView({
  drives,
  onOpen,
  onContextMenu,
  refreshing = false,
  onRefresh,
}: {
  drives: Drive[];
  onOpen: (drive: Drive) => void;
  onContextMenu: (drive: Drive, e: MouseEvent<HTMLButtonElement>) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <section aria-labelledby="this-pc-drives" className="p-4">
      <div className="mb-3 flex items-center gap-2 px-1">
        <h3 id="this-pc-drives" className="me-eyebrow m-0">
          Devices and drives
        </h3>
        {onRefresh && <RefreshDrivesButton refreshing={refreshing} onRefresh={onRefresh} />}
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
        {drives.map((drive) => {
          const fraction = drive.total ? drive.used / drive.total : 0;
          return (
            <li key={drive.id}>
              <button
                type="button"
                data-drive-card={drive.id}
                onClick={() => onOpen(drive)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContextMenu(drive, e);
                }}
                className="flex w-full items-center gap-3.5 rounded-(--radius-md) border border-(--me-border) bg-(--me-inset) px-3.5 py-3 text-left transition-colors duration-150 hover:bg-(--me-hover)"
              >
                <DriveIcon drive={drive} size={44} gauge />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {drive.label} <span className="text-(--me-text-faint)">({drive.letter})</span>
                  </span>
                  <span className="block text-[0.6875rem] text-(--me-text-muted)">
                    {DRIVE_KIND_LABELS[drive.kind]}
                  </span>
                  <span
                    className="me-meter mt-1.5 block"
                    data-tone={fraction > 0.9 ? "warning" : undefined}
                    role="meter"
                    aria-label={`${drive.label} used`}
                    aria-valuenow={Math.round(fraction * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${fraction * 100}%` }} />
                  </span>
                  <span className="mt-1 block text-[0.6875rem] text-(--me-text-muted) tabular-nums">
                    {drive.total
                      ? `${formatCapacity(drive.total - drive.used)} free of ${formatCapacity(drive.total)}`
                      : "Not ready"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
