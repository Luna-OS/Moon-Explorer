import type { ComponentType } from "react";
import {
  ArchiveIcon,
  BookIcon,
  BriefcaseIcon,
  CloudIcon,
  CodeIcon,
  ComputerIcon,
  ConstellationIcon,
  DownloadIcon,
  FilmIcon,
  FolderIcon,
  FullMoonIcon,
  GamepadIcon,
  HalfMoonIcon,
  HardDriveIcon,
  HeartIcon,
  HomeIcon,
  ImageIcon,
  LockIcon,
  MediaIcon,
  MoonIcon,
  NetworkIcon,
  NewMoonIcon,
  PlanetIcon,
  RocketIcon,
  SparklesIcon,
  SsdIcon,
  StarIcon,
  UsbIcon,
} from "@/theme/icons";
import type { DriveKind } from "@/explorer/sample";

export interface BuiltinIcon {
  /** Stable ID; it is what gets saved, so never rename one. */
  id: string;
  /** Shown as the tooltip and used as the accessible name in the picker. */
  label: string;
  Icon: ComponentType<{ size?: number }>;
}

/** The gallery in the icon picker, in display order. */
export const BUILTIN_ICONS: readonly BuiltinIcon[] = [
  { id: "hard-drive", label: "Hard drive", Icon: HardDriveIcon },
  { id: "ssd", label: "SSD", Icon: SsdIcon },
  { id: "usb", label: "USB stick", Icon: UsbIcon },
  { id: "cloud", label: "Cloud", Icon: CloudIcon },
  { id: "network", label: "Network", Icon: NetworkIcon },
  { id: "computer", label: "Computer", Icon: ComputerIcon },
  { id: "archive", label: "Archive", Icon: ArchiveIcon },
  { id: "new-moon", label: "New moon", Icon: NewMoonIcon },
  { id: "crescent", label: "Crescent moon", Icon: MoonIcon },
  { id: "half-moon", label: "Half moon", Icon: HalfMoonIcon },
  { id: "full-moon", label: "Full moon", Icon: FullMoonIcon },
  { id: "planet", label: "Planet", Icon: PlanetIcon },
  { id: "star", label: "Star", Icon: StarIcon },
  { id: "sparkles", label: "Sparkles", Icon: SparklesIcon },
  { id: "constellation", label: "Constellation", Icon: ConstellationIcon },
  { id: "rocket", label: "Rocket", Icon: RocketIcon },
  { id: "gamepad", label: "Game controller", Icon: GamepadIcon },
  { id: "music", label: "Music", Icon: MediaIcon },
  { id: "photo", label: "Photo", Icon: ImageIcon },
  { id: "film", label: "Film", Icon: FilmIcon },
  { id: "code", label: "Code", Icon: CodeIcon },
  { id: "book", label: "Book", Icon: BookIcon },
  { id: "work", label: "Work", Icon: BriefcaseIcon },
  { id: "lock", label: "Lock", Icon: LockIcon },
  { id: "heart", label: "Heart", Icon: HeartIcon },
  { id: "folder", label: "Folder", Icon: FolderIcon },
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "downloads", label: "Downloads", Icon: DownloadIcon },
];

const BY_ID = new Map(BUILTIN_ICONS.map((icon) => [icon.id, icon]));

export function findBuiltinIcon(id: string): BuiltinIcon | undefined {
  return BY_ID.get(id);
}

/** The line icon a drive gets when it has no custom icon. */
export const DEFAULT_ICON_BY_KIND: Record<DriveKind, BuiltinIcon> = {
  system: BY_ID.get("hard-drive")!,
  fixed: BY_ID.get("hard-drive")!,
  removable: BY_ID.get("usb")!,
  network: BY_ID.get("network")!,
};

export interface Tint {
  id: string;
  label: string;
}

/**
 * Tints from the Moon palette. Each maps to a `--me-tint-*` token, which has
 * a night and a day value (see theme/tokens.css), so a tinted icon stays
 * readable in both themes.
 */
export const TINTS: readonly Tint[] = [
  { id: "lavender", label: "Lavender" },
  { id: "sky", label: "Sky" },
  { id: "mint", label: "Mint" },
  { id: "peach", label: "Peach" },
  { id: "gold", label: "Gold" },
  { id: "rose", label: "Rose" },
];

export function isTintId(id: unknown): id is string {
  return typeof id === "string" && TINTS.some((t) => t.id === id);
}

/** The CSS color for a tint; without one the icon keeps the text color. */
export function tintColor(tint: string | undefined): string | undefined {
  return tint && isTintId(tint) ? `var(--me-tint-${tint})` : undefined;
}
