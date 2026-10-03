import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReferralCode,
  normalizeReferralCode,
  isValidReferralCode,
  maskEmail,
  getReferralSummary,
  claimReferral,
  REFERRAL_REWARD_AMOUNT,
  // @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
} from './referrals.ts';

// ─────────────────────────────────────────────���───────────────────
// In-memory Firestore mock — รองรับ where(field, op, value) จริง
// ─────────────────────────────────────────────────────────────────
function isServerTimestamp(v: unknown): boolean {
  return !!v && typeof v === 'object' && (v as any).constructor?.name === 'ServerTimestampTransform';
}

type Op = '==' | '!=';

interface WhereClause {
  field: string;
  op: Op;
  value: unknown;
}

function makeMockDb(seed: Record<string, Record<string, any>> = {}) {
  const store: Record<string, Record<string, any>> = { ...seed };
  let nextId = 0;

  function matches(doc: Record<string, any>, clauses: WhereClause[]) {
    return clauses.every(({ field, op, value }) => {
      const actual = isServerTimestamp(doc[field]) ? doc[field] : doc[field];
      return op === '==' ? actual === value : actual !== value;
    });
  }

  function makeCollection(name: string, clauses: WhereClause[] = [], limitCount = Infinity) {
    return {
      where(field: string, op: Op, value: unknown) {
        return makeCollection(name, [...clauses, { field, op, value }], limitCount);
      },
      limit(n: number) {
        return makeCollection(name, clauses, n);
      },
      add(data: Record<string, any>) {
        const id = `auto-${nextId++}`;
        const path = `${name}/${id}`;
        store[path] = {
          ...data,
          createdAt: isServerTimestamp(data.createdAt) ? Date.now() : data.createdAt,
        };
        return { id, path };
      },
      async get() {
        const docs = Object.entries(store)
          .filter(([p]) => p.startsWith(`${name}/`) && matches(store[p], clauses))
          .slice(0, limitCount)
          .map(([p, d]) => ({ id: p.split('/')[1], data: () => ({ ...d }) }));
        return { empty: docs.length === 0, docs, size: docs.length };
      },
    };
  }

  return {
    collection(name: string) {
      return makeCollection(name);
    },
    _store: store,
  };
}

// ─────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────
test('buildReferralCode: ใช้ 6 ตัวแรกของ uid เป็นตัวพิมพ์ใหญ่', () => {
  assert.equal(buildReferralCode('abcdef123456'), 'TF-ABCDEF');
  assert.equal(buildReferralCode('ABCdef999999'), 'TF-ABCDEF');
});

test('buildReferralCode: uid ที่มีอักขระพิเศษถูกกรองออก', () => {
  assert.equal(buildReferralCode('a-b_c.d12'), 'TF-ABCD12');
});

test('buildReferralCode: uid ว่างไม่ทำให้พัง', () => {
  assert.equal(buildReferralCode(''), 'TF-');
});

test('normalizeReferralCode: ล้างช่องว่าง/ตัวพิมพ์เล็ก/อักขระแปลก', () => {
  assert.equal(normalizeReferralCode('  tf-abc123  '), 'TF-ABC123');
  assert.equal(normalizeReferralCode('tf-abc#123'), 'TF-ABC123');
  assert.equal(normalizeReferralCode(null), '');
});

test('isValidReferralCode: รับเฉพาะรูปแบบ TF-xxxx', () => {
  assert.equal(isValidReferralCode('TF-ABC123'), true);
  assert.equal(isValidReferralCode('ABC123'), false);
  assert.equal(isValidReferralCode('TF-'), false);
  assert.equal(isValidReferralCode('TF-AB'), false);
});

test('maskEmail: ซ่อนกลางอีเมลแต่คงโดเมน', () => {
  // เก็บตัวแรก + ตัวสุดท้าย ที่เหลือกลายเป็น * (อย่างน้อย 2 ตัว)
  assert.equal(maskEmail('parent@example.com'), 'p****t@example.com');
  assert.equal(maskEmail('ab@example.com'), 'a**@example.com');
  assert.equal(maskEmail('a@x.com'), 'a**@x.com');
  assert.equal(maskEmail('broken'), '***');
});

// ─────────────────────────────────────────────────────────────────
// getReferralSummary
// ─────────────────────────────────────────────────────────────────
test('getReferralSummary: ไม่มีข้อมูล → มีแต่โค้ดของตัวเอง', async () => {
  const db = makeMockDb();
  const s = await getReferralSummary(db as any, 'abcdef123456');
  assert.equal(s.code, 'TF-ABCDEF');
  assert.equal(s.total, 0);
  assert.equal(s.pending, 0);
  assert.equal(s.rewarded, 0);
  assert.equal(s.earnedAmount, 0);
  assert.deepEqual(s.entries, []);
});

test('getReferralSummary: นับเฉพาะ referral ที่ referrerCode ของเรา', async () => {
  const db = makeMockDb({
    'referrals/r1': { referrerCode: 'TF-ABCDEF', referredEmail: 'a@x.com', status: 'rewarded', rewardAmount: 100 },
    'referrals/r2': { referrerCode: 'TF-ABCDEF', referredEmail: 'b@x.com', status: 'pending', rewardAmount: 100 },
    'referrals/r3': { referrerCode: 'TF-ZZZZZZ', referredEmail: 'c@x.com', status: 'rewarded', rewardAmount: 100 },
  });
  const s = await getReferralSummary(db as any, 'abcdef123456');
  assert.equal(s.total, 2);
  assert.equal(s.rewarded, 1);
  assert.equal(s.pending, 1);
  assert.equal(s.earnedAmount, 200);
  // อีเมลของคนที่ถูกชวนถูก mask — ไม่มีอีเมลเต็มหลุดออกจากเซิร์ฟเวอร์
  assert.deepEqual(s.entries.map((e) => e.email).sort(), ['a**@x.com', 'b**@x.com']);
});

test('getReferralSummary: status ที่ไม่รู้จักถือเป็น pending และ rewardAmount ตกเป็นค่าเริ่มต้น', async () => {
  const db = makeMockDb({
    'referrals/r1': { referrerCode: 'TF-ABCDEF', referredEmail: 'a@x.com', status: 'weird' },
  });
  const s = await getReferralSummary(db as any, 'abcdef123456');
  assert.equal(s.entries[0].status, 'pending');
  assert.equal(s.entries[0].rewardAmount, REFERRAL_REWARD_AMOUNT);
  assert.equal(s.entries[0].createdAt, null);
});

// ─────────────────────────────────────────────────────────────────
// claimReferral
// ─────────────────────────────────────────────────────────────────
test('claimReferral: ใช้โค้ดเพื่อนได้ → เก็บ referrerCode (ไม่ใช่ uid)', async () => {
  const db = makeMockDb();
  const res = await claimReferral(db as any, { uid: 'newuser1', email: 'n@x.com', code: ' tf-abcdef ' });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const doc = db._store[`referrals/${res.id}`];
  assert.equal(doc.referrerCode, 'TF-ABCDEF');
  assert.equal(doc.referredUid, 'newuser1');
  assert.equal(doc.referredEmail, 'n@x.com');
  assert.equal(doc.status, 'pending');
  assert.equal(doc.rewardAmount, REFERRAL_REWARD_AMOUNT);
});

test('claimReferral: โค้ดของตัวเอง → self_referral', async () => {
  const db = makeMockDb();
  const res = await claimReferral(db as any, { uid: 'abcdef123456', email: 'a@x.com', code: 'TF-ABCDEF' });
  assert.deepEqual(res, { ok: false, reason: 'self_referral' });
  assert.equal(Object.keys(db._store).length, 0);
});

test('claimReferral: โค้ดผิดรูปแบบ → invalid_code', async () => {
  const db = makeMockDb();
  for (const code of ['', 'ABCDEF', 'TF-', 'tf-abc']) {
    const res = await claimReferral(db as any, { uid: 'newuser1', email: 'n@x.com', code });
    assert.deepEqual(res, { ok: false, reason: 'invalid_code' }, `code=${code}`);
  }
  assert.equal(Object.keys(db._store).length, 0);
});

test('claimReferral: ใช้ซ้ำด้วยอีเมลเดิม → already_claimed', async () => {
  const db = makeMockDb({
    'referrals/r1': { referrerCode: 'TF-OLDONE', referredEmail: 'n@x.com', referredUid: 'uid-old' },
  });
  const res = await claimReferral(db as any, { uid: 'other-uid', email: 'n@x.com', code: 'TF-ABCDEF' });
  assert.deepEqual(res, { ok: false, reason: 'already_claimed' });
  assert.equal(Object.keys(db._store).length, 1);
});

test('claimReferral: เปลี่ยน uid แต่ใช้อีเมลเดิมยังถูกกัน (ไม่ใช้โค้ดซ้ำได้)', async () => {
  const db = makeMockDb({
    'referrals/r1': { referrerCode: 'TF-OLDONE', referredEmail: 'n@x.com', referredUid: 'uid-old' },
  });
  const res = await claimReferral(db as any, { uid: 'uid-new', email: 'n@x.com', code: 'TF-ABCDEF' });
  assert.equal(res.ok, false);
  assert.equal(Object.keys(db._store).length, 1);
});

test('flow จริง: ชวนเพื่อน → เพื่อนใช้โค้ด → เจ้าของโค้ดเห็นสถิติ', async () => {
  const db = makeMockDb();

  // 1) ผู้ใช้เก่าชวนเพื่อน
  const owner = await getReferralSummary(db as any, 'owner001');
  assert.equal(owner.total, 0);

  // 2) เพื่อนใช้โค้ด
  const claim = await claimReferral(db as any, { uid: 'friend99', email: 'f@x.com', code: owner.code });
  assert.equal(claim.ok, true);

  // 3) เจ้าของโค้ดเห็น 1 รายการ เงินที่รอได้ = 100
  const after = await getReferralSummary(db as any, 'owner001');
  assert.equal(after.total, 1);
  assert.equal(after.pending, 1);
  assert.equal(after.rewarded, 0);
  assert.equal(after.earnedAmount, 100);
  assert.equal(after.entries[0].email, 'f**@x.com'); // ไม่เห็นอีเมลเต็ม

  // 4) เพื่อนคนเดิมใช้ซ้ำไม่ได้
  const again = await claimReferral(db as any, { uid: 'friend99', email: 'f@x.com', code: owner.code });
  assert.deepEqual(again, { ok: false, reason: 'already_claimed' });

  // 5) admin mark rewarded → สถิติย้ายจาก pending เป็น rewarded (ยอดเงินเท่าเดิม)
  db._store[`referrals/${(claim as any).id}`].status = 'rewarded';
  const rewarded = await getReferralSummary(db as any, 'owner001');
  assert.equal(rewarded.pending, 0);
  assert.equal(rewarded.rewarded, 1);
  assert.equal(rewarded.total, 1);
  assert.equal(rewarded.earnedAmount, 100);
});