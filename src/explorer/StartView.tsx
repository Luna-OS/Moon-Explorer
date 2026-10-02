import type { MouseEvent } from "react";
import type { FsDrive } from "@/fs/types";
import { FolderIcon, StarIcon } from "@/theme/icons";
import type { PaneModel } from "./model/pane";
import type { Workspace } from "./model/workspace";
import { ThisPcView } from "./ThisPcView";

function FolderCard({
  label,
  path,
  pinned,
  onOpen,
}: {
  label: string;
  path: string;
  pinned?: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        title={path}
        className="flex w-full items-center gap-3 rounded-(--radius-md) border border-(--me-border) bg-(--me-inset) px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-(--me-hover)"
      >
        <span className="text-(--me-kind-folder)">
          {pinned ? <StarIcon size={22} /> : <FolderIcon size={22} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{label}</span>
          <span className="block truncate text-[0.6875rem] text-(--me-text-muted)">{path}</span>
        </span>
      </button>
    </li>
  );
}

/** "This PC": quick access, pinned folders, every drive and the folders visited last. */
export function StartView({
  ws,
  pane,
  onDriveMenu,
}: {
  ws: Workspace;
  pane: PaneModel;
  onDriveMenu: (drive: FsDrive, e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const places = Object.entries(ws.places).filter((e): e is [string, string] => !!e[1]);
  const recent = ws.settings.recent.slice(0, 8);
  return (
    <div className="flex flex-col gap-1">
      <section aria-labelledby="start-quick" className="px-4 pt-4">
        <h3 id="start-quick" className="me-eyebrow mb-3 px-1">
          Quick access
        </h3>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2.5 p-0">
          {places.map(([id, path]) => (
            <FolderCard
              key={id}
              label={ws.placeLabel(id)}
              path={path}
              onOpen={() => void pane.go(path)}
            />
          ))}
          {ws.settings.favorites.map((path) => (
            <FolderCard
              key={path}
              pinned
              label={ws.displayName(path)}
              path={path}
              onOpen={() => void pane.go(path)}
            />
          ))}
        </ul>
      </section>
      <ThisPcView
        drives={ws.drives}
        onOpen={(d) => void pane.go((d as FsDrive).path)}
        onContextMenu={(d, e) => onDriveMenu(d as FsDrive, e)}
      />
      {recent.length > 0 && (
        <section aria-labelledby="start-recent" className="px-4 pb-4">
          <h3 id="start-recent" className="me-eyebrow mb-3 px-1">
            Recent folders
          </h3>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2.5 p-0">
            {recent.map((path) => (
              <FolderCard
                key={path}
                label={ws.displayName(path)}
                path={path}
                onOpen={() => void pane.go(path)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
