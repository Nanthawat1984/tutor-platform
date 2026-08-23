const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const input = path.join(root, 'public/line/rich-menu-background.png');
const outputDir = path.join(root, 'public/line');
const width = 2500;
const height = 1686;
const labels = {
  default: ['เริ่มเชื่อมบัญชี', 'ช่วยเหลือ', 'เว็บไซต์', 'การจอง', 'ตารางเรียน', 'ติดต่อทีมงาน'],
  parent: ['การจองของฉัน', 'ตารางเรียน', 'ผลการเข้าเรียน', 'ค่าเรียน/ชำระเงิน', 'เชื่อมบัญชี', 'ติดต่อทีมงาน'],
  teacher: ['รายการจองใหม่', 'ตารางสอน', 'เช็คชื่อวันนี้', 'สถานที่เรียน', 'รายได้/ผลตอบแทน', 'ติดต่อทีมงาน'],
};

function escapeXml(value) {
  return value.replace(/[<&>'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  }[character]));
}

function overlay(role) {
  const tileWidth = width / 3;
  const tileHeight = height / 2;
  const colors = ['#fff7fb', '#f6f2ff', '#effaff', '#fffaf0', '#f3fff8', '#fff3f7'];
  const tiles = labels[role].map((label, index) => {
    const x = (index % 3) * tileWidth + 18;
    const y = Math.floor(index / 3) * tileHeight + 18;
    const centerX = x + (tileWidth - 36) / 2;
    const centerY = y + (tileHeight - 36) / 2 + 18;
    return `<g><rect x="${x}" y="${y}" width="${tileWidth - 36}" height="${tileHeight - 36}" rx="42" fill="${colors[index]}" fill-opacity="0.92" stroke="#ffffff" stroke-width="8"/><circle cx="${centerX}" cy="${centerY - 42}" r="25" fill="#f45a96" fill-opacity="0.9"/><text x="${centerX}" y="${centerY + 42}" text-anchor="middle" font-family="Arial, Noto Sans Thai, sans-serif" font-size="54" font-weight="700" fill="#4b3159">${escapeXml(label)}</text></g>`;
  }).join('');
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${tiles}</svg>`;
}

async function build() {
  if (!fs.existsSync(input)) throw new Error(`Missing source image: ${input}`);
  for (const role of Object.keys(labels)) {
    await sharp(input)
      .resize(width, height, { fit: 'cover', position: 'top' })
      .composite([{ input: Buffer.from(overlay(role)), top: 0, left: 0 }])
      .png()
      .toFile(path.join(outputDir, `rich-menu-${role}.png`));
  }
  console.log('Built Rich Menu assets:', Object.keys(labels).join(', '));
}

build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
