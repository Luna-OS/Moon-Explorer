import type { FileKind } from "./sample";
import { ArchiveIcon, CodeIcon, FileIcon, FolderIcon, ImageIcon, MediaIcon } from "@/theme/icons";

const ICONS = {
  folder: FolderIcon,
  image: ImageIcon,
  media: MediaIcon,
  code: CodeIcon,
  archive: ArchiveIcon,
  file: FileIcon,
} satisfies Record<FileKind, unknown>;

/** A file-kind icon tinted with its `--me-kind-*` color. */
export function KindIcon({ kind, size = 16 }: { kind: FileKind; size?: number }) {
  const Icon = ICONS[kind];
  return (
    <span className="inline-flex" style={{ color: `var(--me-kind-${kind})` }}>
      <Icon size={size} />
    </span>
  );
}
