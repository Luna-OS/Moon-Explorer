import { useEffect, useState } from "react";
import { kindOf } from "@/fs/format";
import type { FsEntry, MoonBridge } from "@/fs/types";
import { KindIcon } from "./KindIcon";

/** Programs and shortcuts look best with their own Windows icon. */
const SYSTEM_ICON_EXTS = new Set([
  "exe",
  "lnk",
  "ico",
  "msi",
  "url",
  "appx",
  "msix",
  "scr",
  "com",
  "cpl",
]);
/** Kinds Windows can make a thumbnail of (images, videos, PDFs, Office files, …). */
const THUMB_EXTS = new Set(
  "png jpg jpeg jfif gif webp bmp svg ico avif tif tiff heic heif psd mp4 mkv webm mov avi wmv m4v pdf docx xlsx pptx epub".split(
    " ",
  ),
);

/** At most four Windows shell requests at a time, newest first, so scrolling stays smooth. */
class RequestPool {
  private active = 0;
  private queue: (() => void)[] = [];
  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.unshift(() => {
        this.active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            this.pump();
          });
      });
      this.pump();
    });
  }
  private pump() {
    while (this.active < 4 && this.queue.length) this.queue.shift()?.();
  }
}

const pool = new RequestPool();
const cache = new Map<string, Promise<string | null>>();

function cached(key: string, load: () => Promise<string | null>): Promise<string | null> {
  let p = cache.get(key);
  if (!p) {
    p = pool.run(load).catch(() => null);
    cache.set(key, p);
    if (cache.size > 3000) cache.delete(cache.keys().next().value ?? "");
  }
  return p;
}

function useImage(bridge: MoonBridge, entry: FsEntry, thumbnail: boolean): string | null {
  const [src, setSrc] = useState<string | null>(null);
  const system = !entry.isDir && SYSTEM_ICON_EXTS.has(entry.ext);
  const thumb = thumbnail && !entry.isDir && THUMB_EXTS.has(entry.ext);
  const key = thumb
    ? `thumb:${entry.path}:${entry.mtime}`
    : system
      ? `icon:${["exe", "lnk", "ico", "url"].includes(entry.ext) ? entry.path : entry.ext}`
      : null;
  useEffect(() => {
    if (!key || bridge.kind !== "electron") return;
    let live = true;
    const load = thumb
      ? () => bridge.thumbnail(entry.path, 256)
      : () => bridge.systemIcon(entry.path);
    void cached(key, load).then((url) => {
      if (live) setSrc(url || null);
    });
    return () => {
      live = false;
      setSrc(null);
    };
  }, [bridge, key, thumb, entry.path]);
  return src;
}

/** An entry's icon: a thumbnail (icon view), the program's own icon, or the themed kind icon. */
export function EntryIcon({
  bridge,
  entry,
  size,
  thumbnail = false,
}: {
  bridge: MoonBridge;
  entry: FsEntry;
  size: number;
  thumbnail?: boolean;
}) {
  const src = useImage(bridge, entry, thumbnail);
  if (src) {
    const isThumb = thumbnail && THUMB_EXTS.has(entry.ext);
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        className={
          isThumb
            ? "max-h-full max-w-full rounded-md object-contain shadow-[0_6px_18px_-8px_rgb(0_0_0/0.6)]"
            : ""
        }
        style={isThumb ? undefined : { width: size, height: size }}
      />
    );
  }
  return <KindIcon kind={kindOf(entry)} size={size} />;
}
