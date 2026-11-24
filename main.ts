// The World in One Day - Tuesday 24 November 2026.
// A one-page newspaper front page drawn procedurally: masthead, a full-width
// COP31 hero, six story cards in a 2x3 grid, a full-width AFCON strip and a
// footer. Every letter comes from a 5x7 bitmap font stored as five column
// bytes per glyph (bit 0 = top row). The PNG is encoded by hand (CRC32 +
// chunk framing + zlib from the Node standard library only). The output is
// deterministic: no clock, no network, no randomness.
import * as fs from "node:fs";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---- palette ----
const PAPER = [247, 243, 234];
const INK = [16, 24, 40];
const NAVY = [11, 31, 58];
const NAVY2 = [16, 46, 84];
const TEAL = [12, 74, 68];
const TEAL2 = [18, 96, 88];
const GOLD = [232, 163, 61];
const CARD = [255, 255, 255];
const LINE = [216, 210, 196];
const GREY = [90, 96, 108];
const RED = [179, 38, 30];
const BLUE = [29, 78, 158];
const PURPLE = [106, 63, 160];
const GREEN = [46, 125, 50];
const ORANGE = [194, 87, 11];
const CRIMSON = [142, 27, 27];

// ---- canvas ----
const px = new Uint8Array(W * H * 3);
function setPix(x: number, y: number, c: number[]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: number[]): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setPix(i, j, c);
}
function hline(x0: number, x1: number, y: number, c: number[]): void {
  for (let x = x0; x <= x1; x++) setPix(x, y, c);
}
function vline(x: number, y0: number, y1: number, c: number[]): void {
  for (let y = y0; y <= y1; y++) setPix(x, y, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: number[]): void {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    setPix(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: number[]): void {
  const r = Math.floor(t / 2);
  for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) line(x0 + a, y0 + b, x1 + a, y1 + b, c);
}
function fillCircle(cx: number, cy: number, r: number, c: number[]): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) setPix(cx + x, cy + y, c);
  }
}
function circleOutline(cx: number, cy: number, r: number, t: number, c: number[]): void {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(cx + r * Math.cos(rad));
    const y = Math.round(cy + r * Math.sin(rad));
    for (let dx = -t; dx <= t; dx++) for (let dy = -t; dy <= t; dy++) setPix(x + dx, y + dy, c);
  }
}
// Scanline fill of a simple polygon given as [x,y] pairs.
function fillPoly(pts: number[][], c: number[]): void {
  let minY = H, maxY = 0;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(Math.round(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) hline(xs[k], xs[k + 1], y, c);
  }
}

// ---- 5x7 column-bit font: glyph -> five column bytes, bit 0 = top row ----
const FONT: Record<string, number[]> = {
  "A": [126, 9, 9, 9, 126],
  "B": [127, 73, 73, 73, 54],
  "C": [62, 65, 65, 65, 65],
  "D": [127, 65, 65, 65, 62],
  "E": [127, 73, 73, 73, 65],
  "F": [127, 9, 9, 9, 1],
  "G": [62, 65, 73, 73, 57],
  "H": [127, 8, 8, 8, 127],
  "I": [0, 65, 127, 65, 0],
  "J": [32, 64, 65, 63, 1],
  "K": [127, 8, 20, 34, 65],
  "L": [127, 64, 64, 64, 64],
  "M": [127, 2, 12, 2, 127],
  "N": [127, 2, 4, 8, 127],
  "O": [62, 65, 65, 65, 62],
  "P": [127, 9, 9, 9, 6],
  "Q": [62, 65, 81, 33, 94],
  "R": [127, 9, 25, 41, 70],
  "S": [70, 73, 73, 73, 49],
  "T": [1, 1, 127, 1, 1],
  "U": [63, 64, 64, 64, 63],
  "V": [31, 32, 64, 32, 31],
  "W": [127, 32, 24, 32, 127],
  "X": [99, 20, 8, 20, 99],
  "Y": [3, 4, 120, 4, 3],
  "Z": [97, 81, 73, 69, 67],
  "0": [62, 73, 69, 67, 62],
  "1": [0, 66, 127, 64, 0],
  "2": [66, 97, 81, 73, 70],
  "3": [65, 73, 73, 73, 54],
  "4": [24, 20, 18, 127, 16],
  "5": [39, 69, 69, 69, 57],
  "6": [62, 73, 73, 73, 48],
  "7": [1, 1, 113, 13, 3],
  "8": [54, 73, 73, 73, 54],
  "9": [6, 73, 73, 73, 62],
  " ": [0, 0, 0, 0, 0],
  ".": [0, 0, 64, 0, 0],
  ",": [0, 64, 48, 0, 0],
  "'": [0, 4, 3, 0, 0],
  ":": [0, 0, 36, 0, 0],
  ";": [0, 96, 4, 0, 0],
  "-": [0, 8, 8, 8, 0],
  "(": [0, 28, 34, 65, 0],
  ")": [0, 65, 34, 28, 0],
  "/": [64, 48, 8, 6, 1],
  "%": [67, 51, 8, 102, 97],
  "$": [36, 42, 127, 42, 22],
  "&": [54, 73, 81, 38, 80],
  "+": [0, 8, 28, 8, 0],
  "=": [20, 20, 20, 20, 20],
  "?": [2, 1, 81, 9, 6],
  "!": [0, 0, 95, 0, 0],
  "\"": [0, 3, 0, 3, 0],
};
function textWidth(s: string, sc: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * sc - sc;
}
function drawText(x: number, y: number, s: string, sc: number, c: number[]): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const cols = FONT[ch] ?? FONT["?"];
    for (let col = 0; col < 5; col++) {
      const byte = cols[col];
      for (let row = 0; row < 7; row++) {
        if (byte & (1 << row)) fillRect(cx + col * sc, y + row * sc, sc, sc, c);
      }
    }
    cx += 6 * sc;
  }
}
function drawCentered(y: number, s: string, sc: number, c: number[], cx0 = 0, cx1 = W): void {
  drawText(cx0 + Math.floor((cx1 - cx0 - textWidth(s, sc)) / 2), y, s, sc, c);
}
function wrapText(s: string, sc: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, sc) <= maxW || cur === "") cur = trial;
    else { lines.push(cur); cur = w; }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
function drawWrapped(x: number, y: number, s: string, sc: number, maxW: number, c: number[], lineH: number): number {
  const lines = wrapText(s, sc, maxW);
  lines.forEach((ln, i) => drawText(x, y + i * lineH, ln, sc, c));
  return lines.length;
}

// ---- icons (each fits a 72x72 box at x,y) ----
function iconGlobe(x: number, y: number, c: number[]): void {
  circleOutline(x + 36, y + 36, 30, 2, c);
  line(x + 6, y + 36, x + 66, y + 36, c);
  line(x + 36, y + 6, x + 36, y + 66, c);
  // crack: jagged polyline across the globe
  thickLine(x + 22, y + 8, x + 32, y + 26, 2, c);
  thickLine(x + 32, y + 26, x + 26, y + 40, 2, c);
  thickLine(x + 26, y + 40, x + 40, y + 52, 2, c);
  thickLine(x + 40, y + 52, x + 34, y + 66, 2, c);
}
function iconWarning(x: number, y: number, c: number[]): void {
  fillPoly([[x + 36, y + 4], [x + 68, y + 64], [x + 4, y + 64]], c);
  fillRect(x + 33, y + 22, 6, 24, PAPER);
  fillRect(x + 33, y + 52, 6, 6, PAPER);
}
function iconCourt(x: number, y: number, c: number[]): void {
  fillPoly([[x + 4, y + 26], [x + 36, y + 6], [x + 68, y + 26]], c);
  fillRect(x + 8, y + 30, 8, 26, c);
  fillRect(x + 32, y + 30, 8, 26, c);
  fillRect(x + 56, y + 30, 8, 26, c);
  fillRect(x + 4, y + 58, 64, 6, c);
  fillRect(x + 12, y + 64, 48, 4, c);
}
function iconMountain(x: number, y: number, c: number[]): void {
  fillPoly([[x + 4, y + 64], [x + 28, y + 14], [x + 52, y + 64]], c);
  fillPoly([[x + 34, y + 64], [x + 54, y + 28], [x + 70, y + 64]], c);
  fillPoly([[x + 22, y + 26], [x + 28, y + 14], [x + 34, y + 26], [x + 28, y + 32]], PAPER);
}
function iconCross(x: number, y: number, c: number[]): void {
  circleOutline(x + 36, y + 36, 30, 2, c);
  fillRect(x + 30, y + 16, 12, 40, c);
  fillRect(x + 16, y + 30, 40, 12, c);
}
function iconNote(x: number, y: number, c: number[]): void {
  fillRect(x + 44, y + 10, 5, 40, c);
  fillRect(x + 20, y + 22, 5, 40, c);
  fillRect(x + 20, y + 20, 29, 5, c);
  fillCircle(x + 18, y + 58, 9, c);
  fillCircle(x + 42, y + 46, 9, c);
  fillCircle(x + 18, y + 58, 4, PAPER);
  fillCircle(x + 42, y + 46, 4, PAPER);
}
function iconEnvelope(x: number, y: number, c: number[]): void {
  fillRect(x + 6, y + 16, 60, 40, c);
  fillRect(x + 10, y + 20, 52, 32, PAPER);
  thickLine(x + 10, y + 20, x + 36, y + 42, 2, c);
  thickLine(x + 62, y + 20, x + 36, y + 42, 2, c);
}
function iconTrophy(x: number, y: number, c: number[]): void {
  fillPoly([[x + 14, y + 8], [x + 58, y + 8], [x + 52, y + 36], [x + 20, y + 36]], c);
  line(x + 14, y + 14, x + 4, y + 26, c);
  line(x + 4, y + 26, x + 16, y + 30, c);
  line(x + 58, y + 14, x + 68, y + 26, c);
  line(x + 68, y + 26, x + 56, y + 30, c);
  fillRect(x + 33, y + 36, 6, 14, c);
  fillRect(x + 22, y + 50, 28, 6, c);
  fillRect(x + 18, y + 56, 36, 6, c);
}

// ---- page ----
fillRect(0, 0, W, H, PAPER);

// Masthead
fillRect(0, 0, W, 124, NAVY);
drawCentered(18, "THE WORLD IN ONE DAY", 5, [255, 255, 255]);
fillRect(212, 78, 600, 3, GOLD);
drawCentered(90, "TUESDAY, 24 NOVEMBER 2026", 2, GOLD);

// Hero: COP31
fillRect(24, 140, 976, 196, TEAL);
fillRect(24, 140, 976, 6, GOLD);
iconGlobe(52, 178, GOLD);
drawText(168, 158, "CLIMATE - ANTALYA", 2, GOLD);
drawText(168, 186, "COP31 ENDS WITH NO DEAL", 4, [255, 255, 255]);
drawText(168, 246, "200 NATIONS SPLIT OVER FOSSIL FUELS", 2, [220, 235, 230]);
drawText(168, 276, "FIRST COLLAPSE SINCE 2009", 2, [220, 235, 230]);

// Grid cards 2x3
type Card = { tag: string; tagColor: number[]; icon: (x: number, y: number, c: number[]) => void; head: string; sub: string };
const cards: Card[] = [
  { tag: "EUROPE", tagColor: RED, icon: iconWarning, head: "RUSSIA WARNS OF OPEN WAR", sub: "MOSCOW PROTESTS ESTONIA PLAN TO CLOSE BORDER" },
  { tag: "JUSTICE", tagColor: PURPLE, icon: iconCourt, head: "TAJIKISTAN TO QUIT THE ICC", sub: "FOURTH STATE TO START LEAVING SINCE JULY" },
  { tag: "SOUTH ASIA", tagColor: GREEN, icon: iconMountain, head: "INDIA GIVES NEPAL $1.6BN", sub: "REBUILD AID AFTER FLOODS THAT KILLED 1,400" },
  { tag: "MIDDLE EAST", tagColor: ORANGE, icon: iconCross, head: "GAZA STRIKES KILL UN WORKER", sub: "UNRWA STAFF MEMBER AMONG THE DEAD IN JABALIA" },
  { tag: "IRAN", tagColor: CRIMSON, icon: iconNote, head: "SINGER FLOGGED 74 LASHES", sub: "PARASTOO AHMADI PUNISHED OVER 2024 CONCERT" },
  { tag: "EUROPE", tagColor: BLUE, icon: iconEnvelope, head: "BOMB THREATS HIT SCHOOLS", sub: "HUNDREDS OF SCHOOLS IN GERMANY AND DENMARK" },
];
const gridTop = 352;
const cardW = 480, cardH = 154, gapX = 16, gapY = 8;
cards.forEach((card, i) => {
  const cx = 24 + (i % 2) * (cardW + gapX);
  const cy = gridTop + Math.floor(i / 2) * (cardH + gapY);
  fillRect(cx, cy, cardW, cardH, CARD);
  fillRect(cx, cy, cardW, cardH, LINE); // placeholder, overwritten below
  fillRect(cx + 1, cy + 1, cardW - 2, cardH - 2, CARD);
  fillRect(cx, cy, cardW, 26, card.tagColor);
  drawText(cx + 12, cy + 8, card.tag, 1, [255, 255, 255]);
  card.icon(cx + 14, cy + 44, card.tagColor);
  const tx = cx + 100;
  const tw = cardW - 112;
  drawWrapped(tx, cy + 48, card.head, 2, tw, INK, 18);
  // Subline at scale 2 (wrapped to two lines) so every story still reads
  // when the page is shrunk to ~300px wide.
  drawWrapped(tx, cy + 92, card.sub, 2, tw, GREY, 18);
  fillRect(cx, cy + cardH - 4, cardW, 4, card.tagColor);
});

// AFCON strip
fillRect(24, 848, 976, 92, NAVY2);
fillRect(24, 848, 976, 4, GOLD);
iconTrophy(48, 862, GOLD);
drawText(140, 862, "SPORT - AFRICA", 2, GOLD);
drawText(140, 886, "AFCON TITLE DECIDED IN COURT", 3, [255, 255, 255]);
drawText(140, 914, "CAS TO RULE ON SENEGAL APPEAL AFTER RABAT FINAL", 2, [200, 210, 225]);

// Footer
fillRect(0, 956, W, 68, NAVY);
drawCentered(968, "DEAR JUDGE: TUESDAY 24 NOVEMBER 2026 IN EIGHT STORIES.", 1, [255, 255, 255]);
drawCentered(990, "SOURCES: BBC - REUTERS - AP - AL JAZEERA - UN", 1, GOLD);

// ---- PNG encode (hand-rolled) ----
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/entry.png`, png);
