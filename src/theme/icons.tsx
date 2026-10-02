import type { ReactNode } from "react";

/*
 * Line icons in the Moon style: 24px grid, 2px round strokes, currentColor
 * (same helper and paths as Moon Browser's and MoonTask's icons.tsx).
 */
function Svg({
  children,
  size = 16,
  stroke = 2,
}: {
  children: ReactNode;
  size?: number;
  stroke?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const BackIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Svg>
);

export const ForwardIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M5 12h14M13 18l6-6-6-6" />
  </Svg>
);

export const UpIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const ReloadIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </Svg>
);

export const CloseIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const MinusIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <path d="M5 12h14" />
  </Svg>
);

export const MaximizeIcon = ({ size = 13 }: P) => (
  <Svg size={size}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </Svg>
);

export const PlusIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const HomeIcon = ({ size }: P) => (
  <Svg size={size}>
    <path d="m3 11 9-7 9 7" />
    <path d="M5 10v10h14V10" />
  </Svg>
);

export const SearchIcon = ({ size = 15 }: P) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);

export const MoonIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
  </Svg>
);

export const StarIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
  </Svg>
);

export const SettingsIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </Svg>
);

export const DiskIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <ellipse cx="12" cy="5.5" rx="8" ry="3" />
    <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </Svg>
);

export const ListIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Svg>
);

export const GridIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);

export const ChevronRightIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

/* ---- File kinds ---- */

export const FolderIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Svg>
);

export const FileIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
  </Svg>
);

export const ImageIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m21 16-5-5-9 9" />
  </Svg>
);

export const MediaIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Svg>
);

export const CodeIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
  </Svg>
);

export const ArchiveIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
  </Svg>
);

export const DownloadIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Svg>
);

export const ComputerIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Svg>
);

export const EditIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);

export const UploadIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 15V4M7 9l5-5 5 5M5 20h14" />
  </Svg>
);

export const CheckIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

/* ---- Drive icon gallery (see drive-icons/builtins.ts) ---- */

export const HardDriveIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M6 4.5h12l3 7.5v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z" />
    <path d="M3 12h18M7 16h.01M10.5 16h.01" />
  </Svg>
);

export const SsdIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h6M7 14h3M17 14h.01" />
  </Svg>
);

export const UsbIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="7" y="9" width="10" height="13" rx="2" />
    <path d="M9 9V3h6v6M11 6h.01M13 6h.01" />
  </Svg>
);

export const CloudIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M7 19a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.9 9.6 4.75 4.75 0 0 1 17 19Z" />
  </Svg>
);

export const NetworkIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="9" y="2.5" width="6" height="5.5" rx="1" />
    <rect x="2.5" y="16" width="6" height="5.5" rx="1" />
    <rect x="15.5" y="16" width="6" height="5.5" rx="1" />
    <path d="M12 8v4M5.5 16v-2a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v2" />
  </Svg>
);

export const NewMoonIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.22" />
  </Svg>
);

export const HalfMoonIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
  </Svg>
);

export const FullMoonIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="9.5" cy="9" r="1.5" />
    <circle cx="15" cy="14" r="2" />
    <path d="M9 16h.01" />
  </Svg>
);

export const PlanetIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="6" />
    <path d="M6.6 14.6C3.6 16.3 2 18 2.6 19c1 1.7 7-.2 13.4-4.2S25.4 6.6 21.4 5c-.8-.3-2 0-3.6.6" />
  </Svg>
);

export const SparklesIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="m10 4 1.8 4.7L16.5 10.5l-4.7 1.8L10 17l-1.8-4.7-4.7-1.8 4.7-1.8Z" />
    <path d="M18.5 15v5M16 17.5h5" />
  </Svg>
);

export const ConstellationIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="m5.5 18 3.5-7 6 2.5 3.5-7.5" />
    <circle cx="5.5" cy="18" r="1.5" fill="currentColor" />
    <circle cx="9" cy="11" r="1.5" fill="currentColor" />
    <circle cx="15" cy="13.5" r="1.5" fill="currentColor" />
    <circle cx="18.5" cy="6" r="1.5" fill="currentColor" />
  </Svg>
);

export const RocketIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 2.5c2.9 2.4 4.5 5.8 4.5 9.8V17h-9v-4.7c0-4 1.6-7.4 4.5-9.8Z" />
    <path d="M7.5 12.5 5 15.5V19l2.5-2M16.5 12.5l2.5 3V19l-2.5-2M10.5 20l1.5 2 1.5-2" />
    <circle cx="12" cy="9.5" r="1.75" />
  </Svg>
);

export const GamepadIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M6.5 7h11a4.5 4.5 0 0 1 4.4 5.4l-.9 4.6a2.6 2.6 0 0 1-4.6 1.1L14.5 16h-5l-1.9 2.1a2.6 2.6 0 0 1-4.6-1.1l-.9-4.6A4.5 4.5 0 0 1 6.5 7Z" />
    <path d="M7.5 10v3.5M5.75 11.75h3.5M15.5 11h.01M18 13h.01" />
  </Svg>
);

export const FilmIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7.5 4v16M16.5 4v16M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21" />
  </Svg>
);

export const BookIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M5 19V5a2 2 0 0 1 2-2h12v14H7a2 2 0 0 0-2 2 2 2 0 0 0 2 2h12" />
  </Svg>
);

export const BriefcaseIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M3 13h18" />
  </Svg>
);

export const LockIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <rect x="4.5" y="11" width="15" height="10" rx="2" />
    <path d="M8 11V7.5a4 4 0 0 1 8 0V11M12 15v2" />
  </Svg>
);

export const HeartIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 20s-7.4-4.5-9-9.1C2 7.6 4 4.5 7.2 4.5c2 0 3.4 1 4.8 3 1.4-2 2.8-3 4.8-3C20 4.5 22 7.6 21 10.9 19.4 15.5 12 20 12 20Z" />
  </Svg>
);
