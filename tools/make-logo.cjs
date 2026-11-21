'use strict';

// Theme-neutral Agent Stage mark. This one vector model generates the docs logo
// and all platform icons; it contains no characters, fonts, or pack artwork.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');

const shapes = [
  { type: 'rect', x: 0, y: 0, w: 128, h: 128, fill: '#171A27' },
  { type: 'poly', points: [[64, 19], [31, 88], [97, 88]], fill: '#F1B53D', opacity: 0.22 },
  { type: 'rect', x: 58, y: 9, w: 12, h: 3, fill: '#F1B53D' },
  { type: 'rect', x: 60, y: 12, w: 8, h: 5, fill: '#FAF8F4' },
  { type: 'rect', x: 40, y: 49, w: 48, h: 35, fill: '#FAF8F4' },
  { type: 'rect', x: 43, y: 52, w: 42, h: 27, fill: '#145E66' },
  { type: 'rect', x: 47, y: 56, w: 14, h: 2, fill: '#36B5AD' },
  { type: 'poly', points: [[51, 61], [57, 65], [51, 69], [53, 72], [62, 65], [53, 58]], fill: '#FAF8F4' },
  { type: 'rect', x: 65, y: 69, w: 11, h: 3, fill: '#F1B53D' },
  { type: 'poly', points: [[58, 84], [70, 84], [74, 94], [54, 94]], fill: '#262B3B' },
  { type: 'poly', points: [[35, 95], [93, 95], [101, 103], [27, 103]], fill: '#F1B53D' },
  { type: 'poly', points: [[27, 103], [101, 103], [108, 113], [20, 113]], fill: '#E8872F' },
  { type: 'poly', points: [[20, 113], [108, 113], [116, 123], [12, 123]], fill: '#A94F32' }
];

function svg(size) {
  const body = shapes.map((s) => {
    if (s.type === 'rect') return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.fill}"/>`;
    const points = s.points.map((p) => p.join(',')).join(' ');
    return `<polygon points="${points}" fill="${s.fill}"${s.opacity ? ` opacity="${s.opacity}"` : ''}/>`;
  }).join('\n  ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128" shape-rendering="crispEdges">\n  <title>Agent Stage</title>\n  ${body}\n</svg>\n`;
}
function color(hex, opacity = 1) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round(opacity * 255)];
}
function contains(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function raster(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 128;
  for (const s of shapes) {
    const c = color(s.fill, s.opacity ?? 1);
    const bounds = s.type === 'rect'
      ? [s.x, s.y, s.x + s.w, s.y + s.h]
      : [Math.min(...s.points.map((p) => p[0])), Math.min(...s.points.map((p) => p[1])), Math.max(...s.points.map((p) => p[0])), Math.max(...s.points.map((p) => p[1]))];
    const x0 = Math.max(0, Math.floor(bounds[0] * scale)); const y0 = Math.max(0, Math.floor(bounds[1] * scale));
    const x1 = Math.min(size, Math.ceil(bounds[2] * scale)); const y1 = Math.min(size, Math.ceil(bounds[3] * scale));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      const ux = (px + 0.5) / scale; const uy = (py + 0.5) / scale;
      if (s.type === 'rect' ? !(ux >= bounds[0] && ux < bounds[2] && uy >= bounds[1] && uy < bounds[3]) : !contains(s.points, ux, uy)) continue;
      const at = (py * size + px) * 4; const a = c[3] / 255; const oldA = pixels[at + 3] / 255; const outA = a + oldA * (1 - a);
      for (let k = 0; k < 3; k++) pixels[at + k] = Math.round((c[k] * a + pixels[at + k] * oldA * (1 - a)) / outA);
      pixels[at + 3] = Math.round(outA * 255);
    }
  }
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return png(size, rows);
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const tag = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const check = Buffer.alloc(4); check.writeUInt32BE(crc32(Buffer.concat([tag, data]))); return Buffer.concat([len, tag, data, check]); }
function png(size, raw) {
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function writeIco(entries) {
  const head = Buffer.alloc(6 + entries.length * 16); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ size, data }, i) => { const p = 6 + i * 16; head[p] = size === 256 ? 0 : size; head[p + 1] = size === 256 ? 0 : size; head.writeUInt16LE(1, p + 4); head.writeUInt16LE(32, p + 6); head.writeUInt32LE(data.length, p + 8); head.writeUInt32LE(offset, p + 12); offset += data.length; });
  return Buffer.concat([head, ...entries.map((e) => e.data)]);
}
function writeIcns(entries) {
  const chunks = entries.map(({ type, data }) => { const h = Buffer.alloc(8); h.write(type, 0, 4, 'ascii'); h.writeUInt32BE(data.length + 8, 4); return Buffer.concat([h, data]); });
  const header = Buffer.alloc(8); header.write('icns', 0, 4, 'ascii'); header.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}
function write(rel, data) { const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }

const master = svg(1024);
write('build/icon.svg', master);
write('docs/logo.svg', svg(512));
write('build/icon.png', raster(1024));
write('docs/logo.png', raster(512));
const icoSizes = [16, 32, 48, 64, 128, 256].map((size) => ({ size, data: raster(size) }));
write('build/icon.ico', writeIco(icoSizes));
const icns = [{ type: 'icp4', size: 16 }, { type: 'icp5', size: 32 }, { type: 'icp6', size: 64 }, { type: 'ic07', size: 128 }, { type: 'ic08', size: 256 }, { type: 'ic09', size: 512 }, { type: 'ic10', size: 1024 }].map((e) => ({ type: e.type, data: raster(e.size) }));
write('build/icon.icns', writeIcns(icns));
console.log('Generated Agent Stage vector logo and PNG/ICO/ICNS assets.');
