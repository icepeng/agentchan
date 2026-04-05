/**
 * Generate .ico file from favicon.svg for Windows exe icon.
 * Usage: bun run scripts/generate-ico.ts
 * Requires: sharp (devDependency)
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const WEBUI_ROOT = join(import.meta.dir, "..");
const SVG_PATH = join(WEBUI_ROOT, "public/favicon.svg");
const ICO_PATH = join(WEBUI_ROOT, "assets/icon.ico");

const SIZES = [16, 32, 48, 256];

async function svgToPngs(svgPath: string, sizes: number[]): Promise<Buffer[]> {
  const svg = readFileSync(svgPath);
  const pngs: Buffer[] = [];
  for (const size of sizes) {
    const png = await sharp(svg, { density: Math.round((size / 64) * 72) })
      .resize(size, size)
      .png()
      .toBuffer();
    pngs.push(png);
  }
  return pngs;
}

function createIco(pngs: Buffer[], sizes: number[]): Buffer {
  const HEADER_SIZE = 6;
  const DIR_ENTRY_SIZE = 16;
  const dataStart = HEADER_SIZE + DIR_ENTRY_SIZE * pngs.length;

  // Calculate offsets
  const offsets: number[] = [];
  let offset = dataStart;
  for (const png of pngs) {
    offsets.push(offset);
    offset += png.length;
  }

  const buf = Buffer.alloc(offset);

  // ICONDIR header
  buf.writeUInt16LE(0, 0); // reserved
  buf.writeUInt16LE(1, 2); // type = icon
  buf.writeUInt16LE(pngs.length, 4); // count

  // ICONDIRENTRY for each image
  for (let i = 0; i < pngs.length; i++) {
    const pos = HEADER_SIZE + i * DIR_ENTRY_SIZE;
    const size = sizes[i];
    buf.writeUInt8(size >= 256 ? 0 : size, pos); // width (0 = 256)
    buf.writeUInt8(size >= 256 ? 0 : size, pos + 1); // height
    buf.writeUInt8(0, pos + 2); // color count
    buf.writeUInt8(0, pos + 3); // reserved
    buf.writeUInt16LE(1, pos + 4); // color planes
    buf.writeUInt16LE(32, pos + 6); // bits per pixel
    buf.writeUInt32LE(pngs[i].length, pos + 8); // image data size
    buf.writeUInt32LE(offsets[i], pos + 12); // image data offset
  }

  // Write PNG data
  for (let i = 0; i < pngs.length; i++) {
    pngs[i].copy(buf, offsets[i]);
  }

  return buf;
}

mkdirSync(join(WEBUI_ROOT, "assets"), { recursive: true });

const pngs = await svgToPngs(SVG_PATH, SIZES);
const ico = createIco(pngs, SIZES);
writeFileSync(ICO_PATH, ico);
console.log(`Generated: ${ICO_PATH} (${SIZES.join(", ")}px, ${ico.length} bytes)`);
