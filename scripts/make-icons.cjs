"use strict";
// npm run icons – renders public/moon-explorer-logo.svg into the app icons in build/
// (icon.png 256 px, icon.ico with 16–256 px, drag.png 48 px for dragging files out),
// and build/installer/*.svg into the installer's pictures (installerSidebar.bmp,
// uninstallerSidebar.bmp, installerHeader.bmp; NSIS only takes 24-bit BMPs).
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

/** Draws an SVG with a fixed size onto an opaque canvas and returns its RGBA pixels. */
async function pixels(win, svg, width, height) {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const base64 = await win.webContents.executeJavaScript(`new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = ${width};
      c.height = ${height};
      const g = c.getContext('2d');
      g.fillStyle = '#0b0920';
      g.fillRect(0, 0, ${width}, ${height});
      g.drawImage(img, 0, 0, ${width}, ${height});
      const data = g.getImageData(0, 0, ${width}, ${height}).data;
      let s = '';
      for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
      resolve(btoa(s));
    };
    img.src = '${src}';
  })`);
  return Buffer.from(base64, "base64");
}

/** A 24-bit BMP (bottom-up rows of BGR, each padded to 4 bytes) from RGBA pixels. */
function bmp(rgba, width, height) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const out = Buffer.alloc(54 + row * height);
  out.write("BM", 0);
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(row * height, 34);
  out.writeInt32LE(2835, 38); // 72 dpi
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const o = 54 + (height - 1 - y) * row;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      out[o + x * 3] = rgba[i + 2];
      out[o + x * 3 + 1] = rgba[i + 1];
      out[o + x * 3 + 2] = rgba[i];
    }
  }
  return out;
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

  const logo = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const pictures = [
    {
      src: "sidebar.svg",
      width: 164,
      height: 314,
      names: ["installerSidebar.bmp", "uninstallerSidebar.bmp"],
    },
    { src: "header.svg", width: 150, height: 57, names: ["installerHeader.bmp"] },
  ];
  for (const { src, width, height, names } of pictures) {
    const picture = fs
      .readFileSync(path.join(out, "installer", src), "utf8")
      .replace('href="LOGO"', `href="${logo}"`);
    const file = bmp(await pixels(win, picture, width, height), width, height);
    for (const name of names) fs.writeFileSync(path.join(out, name), file);
  }
  console.log(`Wrote icons and installer pictures to ${out}`);
  app.quit();
});
