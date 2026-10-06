const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');

// สร้างภาพ LINE Rich Menu ทั้ง 3 ธีม (2500 x 1686) จากแหล่งเดียว:
//   scripts/rich-menu/rich-menu.html?role=default|parent|teacher
// ด้วย Chrome headless (ได้ฟอนต์ไทย/เงา/gradient จริง) แล้วบีบเป็น JPEG
// เพราะ LINE จำกัดรูปเมนูไม่เกิน 1MB — PNG ของดีไซน์นี้หนัก ~1.7MB
//
// ใช้: node scripts/build-line-rich-menu-assets.cjs
// ต้องมี Chrome (หรือตั้ง CHROME_PATH) และเน็ตครั้งแรกที่โหลดฟอนต์ Sarabun

const root = path.resolve(__dirname, '..');
const template = path.join(root, 'scripts/rich-menu/rich-menu.html');
const outputDir = path.join(root, 'public/line');
const workDir = path.join(root, 'tmp/rich-menu');
const roles = ['default', 'parent', 'teacher'];
const WIDTH = 2500;
const HEIGHT = 1686;
// LINE: rich menu image ≤ 1MB — เก็บ margin ไว้ปลอดภัย
const MAX_BYTES = 950_000;

function chromePath() {
  if (process.env.CHROME_PATH?.trim()) return process.env.CHROME_PATH.trim();
  const candidates = process.platform === 'win32'
    ? [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    ]
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) throw new Error('ไม่พบ Chrome — ตั้ง CHROME_PATH ก่อนรัน');
  return found;
}

function toFileUrl(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return process.platform === 'win32' ? `file:///${normalized.replace(/^\//, '')}` : `file://${normalized}`;
}

function chromeArgs(url) {
  return [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--user-data-dir=${path.join(os.tmpdir(), 'tutorfinder-rich-menu-chrome')}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--virtual-time-budget=10000',
    url,
  ];
}

function runChrome(chrome, url, extraArgs) {
  return execFileSync(chrome, [...chromeArgs(url), ...extraArgs], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 90_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

/**
 * ยืนยันว่าฟอนต์ Sarabun (ชุดภาษาไทย) โหลดจริงก่อนถ่ายรูป — ถ้าเน็ต/CDN มีปัญหา
 * ต้อง fail ให้เห็นชัด ๆ ไม่ใช่ได้เมนูที่หลุดเป็นฟอนต์ fallback
 */
function assertFontsLoaded(chrome, url) {
  const dom = runChrome(chrome, url, ['--dump-dom']).toString('utf8');
  if (!dom.includes('data-fonts="ok"')) {
    throw new Error('ฟอนต์ Sarabun (ชุดไทย) โหลดไม่สำเร็จ — ตรวจว่ามีอินเทอร์เน็ตแล้วรันใหม่');
  }
}

function screenshot(chrome, url, outFile) {
  if (fs.existsSync(outFile)) fs.rmSync(outFile);
  runChrome(chrome, url, [`--screenshot=${outFile}`]);
  if (!fs.existsSync(outFile)) throw new Error(`Chrome ไม่สร้างภาพ: ${outFile}`);
}

/** บีบเป็น JPEG ให้ต่ำกว่าเพดาน 1MB ของ LINE โดยเริ่มจากคุณภาพสูงสุด */
async function compressToJpeg(source, outFile) {
  for (const quality of [90, 86, 82, 78, 74, 70]) {
    const buffer = await sharp(source)
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
      .toBuffer();
    if (buffer.length <= MAX_BYTES) {
      fs.writeFileSync(outFile, buffer);
      return { quality, bytes: buffer.length };
    }
  }
  throw new Error('บีบภาพยังเกิน 1MB แม้ลดคุณภาพแล้ว');
}

async function build() {
  if (!fs.existsSync(template)) throw new Error(`ไม่พบเทมเพลต: ${template}`);
  const chrome = chromePath();
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  for (const role of roles) {
    const url = `${toFileUrl(template)}?role=${role}`;
    assertFontsLoaded(chrome, url);

    const source = path.join(workDir, `${role}.png`);
    screenshot(chrome, url, source);

    const metadata = await sharp(source).metadata();
    if (metadata.width !== WIDTH || metadata.height !== HEIGHT) {
      throw new Error(`${role}: ขนาดภาพ ${metadata.width}x${metadata.height} ไม่ตรง ${WIDTH}x${HEIGHT}`);
    }

    const outFile = path.join(outputDir, `rich-menu-${role}.jpg`);
    const { quality, bytes } = await compressToJpeg(source, outFile);
    console.log(`rich-menu-${role}.jpg — ${quality} quality, ${(bytes / 1024).toFixed(0)}KB`);
  }
  console.log('Built Rich Menu assets:', roles.join(', '));
}

build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
