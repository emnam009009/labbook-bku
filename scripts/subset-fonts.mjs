// scripts/subset-fonts.mjs
// Subset Noto Sans để chỉ giữ ASCII + Vietnamese + scientific symbols.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import subsetFont from 'subset-font';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, '..', 'public', 'fonts');

function buildText() {
  let text = '';
  // ASCII printable
  for (let cp = 0x20; cp <= 0x7E; cp++) text += String.fromCodePoint(cp);
  // Latin-1 + Latin Extended A & B (Vietnamese base)
  for (let cp = 0xA0; cp <= 0x024F; cp++) text += String.fromCodePoint(cp);
  // Latin Extended Additional (Vietnamese tone combinations)
  for (let cp = 0x1E00; cp <= 0x1EFF; cp++) text += String.fromCodePoint(cp);
  // General Punctuation (em/en dash, ellipsis, quotation marks)
  for (let cp = 0x2010; cp <= 0x205E; cp++) text += String.fromCodePoint(cp);
  // Superscripts/Subscripts
  for (let cp = 0x2070; cp <= 0x209F; cp++) text += String.fromCodePoint(cp);
  // Math operators
  for (let cp = 0x2200; cp <= 0x22FF; cp++) text += String.fromCodePoint(cp);
  // Greek and Coptic
  for (let cp = 0x0370; cp <= 0x03FF; cp++) text += String.fromCodePoint(cp);
  // Specific scientific
  text += '°²³µΩ←→↔↑↓∂∇';
  return text;
}

const text = buildText();
console.log(`[subset] Glyphs: ${text.length} characters`);

const targets = [
  { input: 'NotoSans-Regular.ttf', output: 'NotoSans-Regular.subset.ttf' },
  { input: 'NotoSans-Bold.ttf', output: 'NotoSans-Bold.subset.ttf' },
];

for (const t of targets) {
  const inputPath = path.join(FONTS_DIR, t.input);
  const outputPath = path.join(FONTS_DIR, t.output);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Không có file: ${t.input}`);
    process.exit(1);
  }

  const inputBuf = fs.readFileSync(inputPath);
  console.log(`[subset] ${t.input}: ${(inputBuf.length / 1024).toFixed(0)} KB → ...`);

  const outputBuf = await subsetFont(inputBuf, text, {
    targetFormat: 'truetype',
  });

  fs.writeFileSync(outputPath, outputBuf);
  console.log(`[subset] ${t.output}: ${(outputBuf.length / 1024).toFixed(0)} KB ✅`);
}

console.log('\n✅ Done.');
