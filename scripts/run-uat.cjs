// One-command UAT runner: emulator + seed + dev server + E2E verify
// (พร้อม cleanup ทุก process เมื่อจบ ไม่ว่า verify จะผ่านหรือพลาด)
//
// Run:
//   pnpm uat
//
// Env (optional):
//   UAT_PROJECT_ID   ปกติดีฟอลต์เป็น project ตาม .firebaserc (tutor-platform-4e38f)
//   UAT_API          ปกติดีฟอลต์เป็น http://localhost:3000
//   KEEP_EMULATOR=1  ไม่ปิด emulator เมื่อจบ (เอาไว้ดู UI ที่ http://127.0.0.1:4000)
//
// Safety: สคริปต์ลูก (seed/verify) มี guard ของตัวเอง — ต้องมี FIRESTORE_EMULATOR_HOST
// เท่านั้นจึงจะทำงาน ไม่มีทางยิงโปรดักชัน
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const WIN = process.platform === 'win32';

const EMU_PORTS = [9099, 8080, 9199];
const DEV_PORT = 3000;
const UI_PORT = 4000;

const children = [];
let shuttingDown = false;

// ── port helpers ─────────────────────────────────────────────
// เช็คสถานะ LISTEN จาก netstat เท่านั้น — การ connect ตรง ๆ หลอกได้บน Windows
// (socket สถานะ TIME_WAIT จากรอบก่อนทำให้ connect สำเร็จโดยไม่มี process จริง)
function portInUse(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | grep ":${port} " | grep -i listen`, { encoding: 'utf8', shell: true });
    return out.trim().length > 0;
  } catch {
    return false; // grep ไม่เจอ = port ว่าง
  }
}

async function waitPort(port, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portInUse(port)) return;
    await sleep(500);
  }
  throw new Error(`timeout: ${label} did not open port ${port}`);
}

async function waitPortClosed(port, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await portInUse(port))) return;
    await sleep(300);
  }
  throw new Error(`timeout: ${label} still holding port ${port} (kill it manually)`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Poll HTTP จนกว่าได้ response ปกติ (dev server เปิด port ก่อน compile เสร็จ —
// request แรกช่วง cold compile อาจได้ 404)
async function waitHttpOk(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = '-';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      last = `${res.status}`;
      if (res.ok) return;
    } catch {
      last = 'unreachable';
    }
    await sleep(1000);
  }
  throw new Error(`timeout: ${label} not ready at ${url} (last: ${last})`);
}

// ── process management ───────────────────────────────────────
function spawnDetached(name, command, args, opts = {}) {
  const child = spawn(command, args, {
    // Windows: pnpm/npx เป็น .cmd — spawn ตรง ๆ จะ EINVAL ต้องผ่าน shell
    shell: WIN || undefined,
    stdio: opts.logFile ? ['ignore', opts.logFile, opts.logFile] : 'inherit',
    env: process.env,
    windowsHide: true,
  });
  child._name = name;
  children.push(child);
  return child;
}

// Kill ทั้ง process tree เฉพาะตัวที่เรา spawn เอง (ห้าม kill node ทั้งเครื่อง)
function killTree(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  try {
    if (WIN) {
      execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGKILL'); // ต้อง spawn ด้วย detached จริงถ้าใช้ group kill
    }
  } catch {
    /* already dead */
  }
}

// Fallback: ถ้า process หลุดจาก children (เช่น emulator spawn java แยก)
// ให้หา PID จาก port แล้ว kill เฉพาะรายตัว
function killByPort(port) {
  try {
    const out = execSync(`netstat -ano | grep ":${port} " | grep -i listen || true`, { encoding: 'utf8', shell: true });
    const pids = [...new Set(out.split('\n').map((l) => l.trim().split(/\s+/).pop()).filter((p) => /^\d+$/.test(p)))];
    for (const pid of pids) {
      try {
        if (WIN) execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        else process.kill(Number(pid), 'SIGKILL');
      } catch { /* raced with exit */ }
    }
  } catch { /* port already free */ }
}

async function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n=== Cleaning up ===');
  for (const child of children.reverse()) killTree(child);
  // ให้ OS เวลาปล่อย socket — ปิดทันทีทำให้ node บน Windows crash (0xC0000409)
  await sleep(1000);
  // รอ port ปิดจริง (firebase emulator บน Windows spawn java แยก อาจรอดจาก taskkill /T)
  const portsToFree = [...EMU_PORTS, UI_PORT, DEV_PORT];
  await Promise.race([
    Promise.all(portsToFree.map((p) => waitPortClosed(p, 8000, 'process').catch(() => killByPort(p)))),
    sleep(9000),
  ]);
  for (const p of portsToFree) killByPort(p);
  console.log('Done. Ports 9099/8080/9199/4000/3000 freed.');
}

// ── main ─────────────────────────────────────────────────────
async function main() {
  // ตรวจว่า port ว่างก่อนเริ่ม — retry สั้น ๆ กับ process ชั่วคราวที่กำลังปิดตัว
  // ถ้ายังไม่ว่าง ลอง kill รายพอร์ตก่อน (self-heal — บางที teardown รอบก่อนค้าง)
  // แล้วจึง fail ถ้ายังไม่ว่างจริง
  for (const p of [...EMU_PORTS, UI_PORT, DEV_PORT]) {
    let free = false;
    for (let i = 0; i < 10 && !free; i++) {
      free = !(await portInUse(p));
      if (!free) await sleep(500);
    }
    if (!free) {
      console.warn(`⚠ Port ${p} busy — กำลังลอง force-free...`);
      killByPort(p);
      await sleep(1000);
      free = !(await portInUse(p));
    }
    if (!free) {
      throw new Error(`Port ${p} is already in use — ปิด process เดิมก่อน (หรือรัน UAT ใหม่เมื่อ port ว่าง)`);
    }
  }

  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
  // dev server ต้องเห็น flag emulator (ค่าใน .env.development เป็น false โดยจงใจ)
  process.env.FIREBASE_EMULATOR = 'true';
  process.env.NEXT_PUBLIC_FIREBASE_EMULATOR = 'true';
  // UAT ใช้ mock gateway เสมอ — ถ้า .env มี Stripe keys, confirm จะไปรอ webhook
  // ที่หาไม่ได้ในเครื่อง (override ที่ process นี้เท่านั้น ไม่แก้ไฟล์ .env)
  process.env.PAYMENT_PROVIDER = 'mock';

  // Admin SDK ต้องมี credential ถึงจะคุยกับ Storage emulator ได้ (Firestore/Auth
  // ไม่ต้อง) — ไม่มี ADC ในเครื่อง และ .env เก็บแค่ client_email ไม่มี private key
  // จึงชี้ไปที่ service account ที่สร้างไว้ในเครื่อง (.firebase-sa.json ไม่ track ใน git)
  // ปลอดภัยเพราะ server.ts ปฏิเสธการต่อ emulator ทันทีเมื่อ NODE_ENV=production
  // ถ้าไฟล์ไม่อยู่จะข้ามไป — verify ที่ต้องใช้ Storage จะรายงานว่าข้ามเอง
  const localSaPath = path.join(__dirname, '..', '.firebase-sa.json');
  if (fs.existsSync(localSaPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = localSaPath;
    console.log('   (ใช้ .firebase-sa.json เป็น credential ของ Admin SDK)');
  } else {
    console.warn('⚠ ไม่พบ .firebase-sa.json — Admin SDK จะเขียน Storage emulator ไม่ได้');
  }

  // 1) Firebase emulators (auth, firestore, storage — ห้ามใส่ --project ตามบทเรียนเดิม)
  console.log('=== 1/8 Starting Firebase emulators (auth:9099, firestore:8080, storage:9199, UI:4000) ===');
  const emuLog = fs.openSync('uat-emulator.log', 'w');
  spawnDetached('emulators', 'npx', ['-y', 'firebase-tools@latest', 'emulators:start', '--only', 'auth,firestore,storage'], {
    logFile: emuLog,
  });
  await waitPort(9099, 120000, 'auth emulator');
  await waitPort(8080, 30000, 'firestore emulator');

  // 2) Seed ข้อมูล UAT (idempotent — รันซ้ำได้)
  console.log('=== 2/8 Seeding UAT data ===');
  execSync('node scripts/seed-emulator-uat.cjs', { stdio: 'inherit' });

  // 3) Dev server (Next.js)
  console.log('=== 3/8 Starting dev server on :3000 ===');
  const devLog = fs.openSync('uat-dev.log', 'w');
  spawnDetached('dev server', 'pnpm', ['dev'], { logFile: devLog });
  await waitPort(DEV_PORT, 120000, 'dev server');
  // รอ compile จริง — ไม่งั้น request แรกของ verify จะโดน 404
  await waitHttpOk(`http://localhost:${DEV_PORT}/`, 120000, 'dev server');

  // 4) E2E verify — flow แพ็กเกจ (เครดิต)
  console.log('=== 4/8 Running package E2E verify ===');
  const failures = [];
  try {
    execSync('node scripts/verify-package-e2e.cjs', { stdio: 'inherit' });
  } catch (err) {
    failures.push(`package: exit ${err.status}`);
    console.error('\nPACKAGE UAT FAILED — ดู log เพิ่มเติมที่ uat-emulator.log / uat-dev.log');
  }

  // 5) E2E verify — flow จองปกติ (จ่าย mock gateway)
  console.log('\n=== 5/8 Running session booking E2E verify ===');
  try {
    execSync('node scripts/verify-session-e2e.cjs', { stdio: 'inherit' });
  } catch (err) {
    failures.push(`session: exit ${err.status}`);
    console.error('\nSESSION UAT FAILED — ดู log เพิ่มเติมที่ uat-emulator.log / uat-dev.log');
  }

  // 6) E2E verify — หลักฐานการโอนให้ครู (แอดมินอัปโหลดสลิป → ครูเปิดดู)
  console.log('\n=== 6/8 Running admin payout slip E2E verify ===');
  try {
    execSync('node scripts/verify-admin-payout-slip-e2e.cjs', { stdio: 'inherit' });
  } catch (err) {
    failures.push(`payout-slip: exit ${err.status}`);
    console.error('\nPAYOUT SLIP UAT FAILED — ดู log เพิ่มเติมที่ uat-emulator.log / uat-dev.log');
  }

  // 7) E2E verify — เลื่อนคาบ + ข้อพิพาท (เลื่อนฟรี/สาย/เกินโควตา → dispute → resolve)
  console.log('\n=== 7/8 Running reschedule + dispute E2E verify ===');
  try {
    execSync('node scripts/verify-reschedule-dispute-e2e.cjs', { stdio: 'inherit' });
  } catch (err) {
    failures.push(`reschedule-dispute: exit ${err.status}`);
    console.error('\nRESCHEDULE/DISPUTE UAT FAILED — ดู log เพิ่มเติมที่ uat-emulator.log / uat-dev.log');
  }
  // 8) E2E verify — วอลเล็ตผู้ปกครอง (ยกเลิก→คืนเต็ม/50%→ใช้เครดิตจ่าย)
  console.log('\n=== 8/8 Running parent wallet E2E verify ===');
  try {
    execSync('node scripts/verify-wallet-e2e.cjs', { stdio: 'inherit' });
  } catch (err) {
    failures.push(`wallet: exit ${err.status}`);
    console.error('\nWALLET UAT FAILED — ดู log เพิ่มเติมที่ uat-emulator.log / uat-dev.log');
  }
  if (failures.length > 0) {
    process.exitCode = 1;
    throw new Error(`UAT failed: ${failures.join(', ')}`);
  }

  if (process.env.KEEP_EMULATOR === '1') {
    console.log('\nKEEP_EMULATOR=1 — ปล่อย emulator และ dev server รันต่อ (UI: http://127.0.0.1:4000)');
    children.length = 0; // ไม่ kill ตอน exit
  }
  console.log('\n✅ UAT PASSED — package + session + payout-slip + reschedule/dispute + wallet flows');
}

process.on('SIGINT', async () => {
  console.log('\nInterrupted — cleaning up...');
  await cleanup();
  process.exit(130);
});

main()
  .catch(async (err) => {
    console.error('\n❌ UAT error:', err.message);
    process.exitCode = 1;
    await cleanup();
    // ไม่เรียก process.exit ตรง ๆ — บน Windows จะ crash libuv ถ้า socket ยังปิดไม่หมด
  })
  .then(async () => {
    await cleanup();
  });
