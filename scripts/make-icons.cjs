"use strict";
// npm run icons – renders public/moon-explorer-logo.svg into the app icons in build/
// (icon.png 256 px, icon.ico with 16–256 px, drag.png 48 px for dragging files out).
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "build");

/** Draws the SVG onto a canvas in a hidden page and returns PNG bytes. */
async function render(win, svg, size) {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = ${size};
      c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size});
      resolve(c.toDataURL('image/png'));
    };
    img.src = '${src}';
  })`);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** An .ico file that embeds PNG images (supported since Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(root, "public", "moon-explorer-logo.svg"), "utf8");
  const win = new BrowserWindow({ show: false });
  await win.loadURL("about:blank");
  const images = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256])
    images.push({ size, data: await render(win, svg, size) });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "icon.png"), images.find((i) => i.size === 256).data);
  fs.writeFileSync(path.join(out, "drag.png"), images.find((i) => i.size === 48).data);
  fs.writeFileSync(path.join(out, "icon.ico"), ico(images));
  console.log(`Wrote icons to ${out}`);
  app.quit();
});
