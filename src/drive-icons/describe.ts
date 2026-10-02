import { TINTS, findBuiltinIcon } from "./builtins";
import type { DriveIconChoice } from "./store";

/** A short description of an icon choice, for labels and screen readers. */
export function describeChoice(choice: DriveIconChoice | null): string {
  if (!choice) return "Default icon";
  if (choice.type === "image") return choice.name ? `Your image (${choice.name})` : "Your image";
  const icon = findBuiltinIcon(choice.id)?.label ?? choice.id;
  const tint = TINTS.find((t) => t.id === choice.tint);
  return tint ? `${icon}, ${tint.label.toLowerCase()}` : icon;
}
