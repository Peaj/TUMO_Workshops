// Generates the PWA icons as PNG without dependencies: node icons/make-icons.mjs
// The mark: a progress ring (most of it in the accent colour) around a small dot,
// i.e. "a session clock", on the app's charcoal background.

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = dirname(fileURLToPath(import.meta.url));
const BG = [18, 19, 22];
const TRACK = [52, 55, 63];
const ACCENT = [255, 122, 69];
const LIGHT = [236, 237, 239];
const SAMPLES = 4; // supersampling per axis for anti-aliasing

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * shade(x, y) in unit coordinates (0..1) returns [r, g, b, a] or null (transparent).
 */
function render(size, shade) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = shade((x + (sx + 0.5) / SAMPLES) / size, (y + (sy + 0.5) / SAMPLES) / size);
          if (!c) continue;
          const alpha = c[3] ?? 1;
          r += c[0] * alpha; g += c[1] * alpha; b += c[2] * alpha; a += alpha;
        }
      }
      const n = SAMPLES * SAMPLES;
      const i = (y * size + x) * 4;
      out[i] = a ? Math.round(r / a) : 0;
      out[i + 1] = a ? Math.round(g / a) : 0;
      out[i + 2] = a ? Math.round(b / a) : 0;
      out[i + 3] = Math.round((255 * a) / n);
    }
  }
  return out;
}

function roundedRect(x, y, radius) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - radius), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - radius), 0);
  return dx * dx + dy * dy <= radius * radius;
}

/** The ring mark centred in the unit square; scale = ring radius. Returns a colour or null. */
function mark(x, y, ringRadius, mono) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const dist = Math.hypot(dx, dy);
  const width = ringRadius * 0.34;
  if (dist <= ringRadius * 0.24) return mono ? [255, 255, 255] : LIGHT;
  if (Math.abs(dist - ringRadius) <= width / 2) {
    if (mono) return [255, 255, 255];
    const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI); // 0 at top, clockwise
    return angle <= Math.PI * 1.5 ? ACCENT : TRACK;
  }
  return null;
}

const icons = [
  { file: "icon-192.png", size: 192, shade: (x, y) => (roundedRect(x, y, 0.22) ? mark(x, y, 0.27) || BG : null) },
  { file: "icon-512.png", size: 512, shade: (x, y) => (roundedRect(x, y, 0.22) ? mark(x, y, 0.27) || BG : null) },
  // Maskable: full-bleed background, mark inside the 40 % safe zone.
  { file: "icon-maskable-512.png", size: 512, shade: (x, y) => mark(x, y, 0.22) || BG },
  // Android status bar badge: white on transparent.
  { file: "badge-96.png", size: 96, shade: (x, y) => mark(x, y, 0.34, true) },
];

for (const { file, size, shade } of icons) {
  writeFileSync(join(OUT, file), png(size, render(size, shade)));
  console.log(`wrote icons/${file}`);
}
