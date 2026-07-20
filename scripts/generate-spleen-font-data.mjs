import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const sourceDirectory = process.argv[2];
if (!sourceDirectory) {
  throw new Error(
    "Usage: node scripts/generate-spleen-font-data.mjs <spleen-source-directory>",
  );
}

const sizes = [
  [5, 8],
  [6, 12],
  [8, 16],
  [12, 24],
  [16, 32],
  [32, 64],
];

function parseAsciiGlyphs(filePath, width, height) {
  const source = fs.readFileSync(filePath, "utf8");
  const glyphs = new Map();
  let encoding = null;
  let bitmap = null;

  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith("ENCODING ")) {
      encoding = Number(line.slice(9));
    } else if (line === "BITMAP") {
      bitmap = [];
    } else if (line === "ENDCHAR") {
      if (encoding >= 32 && encoding <= 126 && bitmap) {
        glyphs.set(encoding, bitmap);
      }
      encoding = null;
      bitmap = null;
    } else if (bitmap && /^[0-9A-F]+$/.test(line)) {
      bitmap.push(line);
    }
  }

  const bytesPerRow = Math.ceil(width / 8);
  const bytes = [];
  for (let codePoint = 32; codePoint <= 126; codePoint += 1) {
    const rows = glyphs.get(codePoint);
    if (!rows || rows.length !== height) {
      throw new Error(`Missing or invalid glyph ${codePoint} in ${filePath}`);
    }
    for (const row of rows) {
      const value = Number.parseInt(row, 16);
      const sourceBits = row.length * 4;
      const aligned = value >>> Math.max(0, sourceBits - bytesPerRow * 8);
      for (let byte = bytesPerRow - 1; byte >= 0; byte -= 1) {
        bytes.push((aligned >>> (byte * 8)) & 0xff);
      }
    }
  }

  return { bytesPerRow, data: Buffer.from(bytes).toString("base64") };
}

const records = sizes.map(([width, height]) => {
  const parsed = parseAsciiGlyphs(
    path.join(sourceDirectory, `spleen-${width}x${height}.bdf`),
    width,
    height,
  );
  return { id: `${width}x${height}`, width, height, ...parsed };
});

const output =
  `// Generated from Spleen 2.2.0 BDF files. Do not edit by hand.\n` +
  `// Source: https://github.com/fcambus/spleen/releases/tag/2.2.0\n` +
  `export type SpleenBitmapRecord = { width: number; height: number; bytesPerRow: number; data: string };\n\n` +
  `export const SPLEEN_BITMAPS: Record<string, SpleenBitmapRecord> = ${JSON.stringify(
    Object.fromEntries(records.map(({ id, ...record }) => [id, record])),
    null,
    2,
  )};\n`;

const outputPath = path.resolve(
  "src/features/epaper-designer/spleen-font-data.ts",
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);
