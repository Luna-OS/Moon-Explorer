/*
 * Turning a file the user picked into a custom drive icon. The result is a
 * data URL that is only ever shown through <img>, so an SVG can't run
 * scripts or load anything.
 */

/** Largest file the picker accepts. */
export const MAX_ICON_FILE_BYTES = 1024 * 1024;
/** Raster images bigger than this (in px) are scaled down before saving. */
export const MAX_ICON_PIXELS = 256;
/** Smallest image that still makes a usable icon. */
export const MIN_ICON_PIXELS = 16;

const FORMATS = [
  { mime: ["image/png"], ext: ["png"], raster: true },
  { mime: ["image/jpeg"], ext: ["jpg", "jpeg"], raster: true },
  { mime: ["image/webp"], ext: ["webp"], raster: true },
  { mime: ["image/svg+xml"], ext: ["svg"], raster: false },
  // ICO files hold several sizes; the browser picks the best one, so keep them as they are.
  { mime: ["image/x-icon", "image/vnd.microsoft.icon"], ext: ["ico"], raster: false },
] as const;

/** For the file input's `accept` attribute. */
export const ICON_FILE_ACCEPT = FORMATS.flatMap((f) => [
  ...f.mime,
  ...f.ext.map((e) => `.${e}`),
]).join(",");

export const ICON_FORMATS_LABEL = "PNG, SVG, ICO, JPG or WebP";

export class IconImageError extends Error {}

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${Number((bytes / 1024 / 1024).toFixed(1))} MB`;
}

function formatOf(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  // Windows often reports no type (or a wrong one) for .ico, so fall back to the extension.
  return (
    FORMATS.find((f) => (f.mime as readonly string[]).includes(file.type)) ??
    FORMATS.find((f) => (f.ext as readonly string[]).includes(ext))
  );
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new IconImageError("That image couldn't be read."));
    reader.onerror = () => reject(new IconImageError("That image couldn't be read."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new IconImageError("That file isn't an image the app can show. Try another one."));
    img.src = src;
  });
}

/** Scales a raster image down to fit `MAX_ICON_PIXELS`, or returns null if it can't. */
function downscale(img: HTMLImageElement): string | null {
  const scale = MAX_ICON_PIXELS / Math.max(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    return null;
  }
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Checks a picked file and returns the data URL to save as the icon. */
export async function prepareIconImage(file: File): Promise<string> {
  const format = formatOf(file);
  if (!format) {
    throw new IconImageError(`That file type isn't supported. Use ${ICON_FORMATS_LABEL}.`);
  }
  if (file.size > MAX_ICON_FILE_BYTES) {
    throw new IconImageError(
      `That image is too large (${formatFileSize(file.size)}). Choose one under ${formatFileSize(MAX_ICON_FILE_BYTES)}.`,
    );
  }
  if (file.size === 0) throw new IconImageError("That file is empty.");

  // Re-label the data with the format we checked, so it always renders as an image.
  const blob = new Blob([file], { type: format.mime[0] });
  const dataUrl = await readAsDataUrl(blob);
  const img = await loadImage(dataUrl);

  const { naturalWidth: w, naturalHeight: h } = img;
  // An SVG without width/height reports 0×0; it scales freely, so that's fine.
  if (format.raster && (w < MIN_ICON_PIXELS || h < MIN_ICON_PIXELS)) {
    throw new IconImageError(
      `That image is too small (${w}×${h} px). Use one at least ${MIN_ICON_PIXELS}×${MIN_ICON_PIXELS} px.`,
    );
  }
  if (format.raster && Math.max(w, h) > MAX_ICON_PIXELS) {
    return downscale(img) ?? dataUrl;
  }
  return dataUrl;
}
