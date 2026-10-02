import type { ReactNode } from "react";
import type { Drive } from "@/explorer/sample";
import { MoonPhase } from "@/theme/MoonPhase";
import { DEFAULT_ICON_BY_KIND, findBuiltinIcon, tintColor } from "./builtins";
import { useDriveIconChoice } from "./context";
import type { DriveIconChoice } from "./store";

interface IconProps {
  size?: number;
  /**
   * Accessible name. Leave it out where the drive's name is shown right next
   * to the icon; the icon is then decorative.
   */
  label?: string;
}

/**
 * A drive's icon: the user's custom icon if there is one, otherwise the
 * default. `gauge` picks the default for the big slots (sidebar, This PC):
 * the moon-phase fill gauge instead of the line icon for the drive's kind.
 */
export function DriveIcon({
  drive,
  size = 16,
  gauge = false,
  label,
}: IconProps & { drive: Drive; gauge?: boolean }) {
  const choice = useDriveIconChoice(drive);
  if (!choice && gauge) {
    return (
      <IconFrame size={size} label={label} source="default">
        <MoonPhase fraction={drive.used / drive.total} size={size} />
      </IconFrame>
    );
  }
  return <ChoiceIcon choice={choice} fallback={drive} size={size} label={label} />;
}

/** Renders a custom icon choice, or the kind's default icon for `null`. */
export function ChoiceIcon({
  choice,
  fallback,
  size = 16,
  label,
}: IconProps & { choice: DriveIconChoice | null; fallback: Pick<Drive, "kind"> }) {
  if (choice?.type === "image") {
    return (
      <IconFrame size={size} label={label} source="image">
        <img
          src={choice.dataUrl}
          alt=""
          width={size}
          height={size}
          draggable={false}
          className="size-full object-contain"
        />
      </IconFrame>
    );
  }
  const builtin = choice ? findBuiltinIcon(choice.id) : undefined;
  const { Icon } = builtin ?? DEFAULT_ICON_BY_KIND[fallback.kind];
  return (
    <IconFrame
      size={size}
      label={label}
      source={builtin ? `builtin:${builtin.id}` : "default"}
      color={choice?.type === "builtin" ? tintColor(choice.tint) : undefined}
    >
      <Icon size={size} />
    </IconFrame>
  );
}

function IconFrame({
  size,
  label,
  source,
  color,
  children,
}: {
  size: number;
  label?: string;
  /** What is shown ("default", "builtin:<id>" or "image"); handy for tests and styling. */
  source: string;
  color?: string;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, color }}
      data-drive-icon={source}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </span>
  );
}
