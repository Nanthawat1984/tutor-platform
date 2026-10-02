import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { getOrCreateParentWallet, creditParentWallet, debitParentWallet } from './parent-wallet.ts';

// ─────────────────────────────────────────────────────────────────
// In-memory Firestore mock — minimal surface used by parent-wallet.ts
// ─────────────────────────────────────────────────────────────────
function isIncrement(v: unknown): v is { operand: number } {
  return !!v && typeof v === 'object' && (v as any).constructor?.name === 'NumericIncrementTransform';
}
function isServerTimestamp(v: unknown): boolean {
  return !!v && typeof v === 'object' && (v as any).constructor?.name === 'ServerTimestampTransform';
}

function applyUpdates(obj: Record<string, any>, updates: Record<string, any>) {
  for (const [key, val] of Object.entries(updates)) {
    if (isIncrement(val)) {
      obj[key] = (Number(obj[key]) || 0) + val.operand;
    } else if (isServerTimestamp(val)) {
      obj[key] = Date.now();
    } else {
      obj[key] = val;
    }
  }
}

function makeMockDb() {
  const store: Record<string, Record<string, any>> = {};
  let nextId = 0;
  function makeDocRef(name: string, id: string) {
    const path = `${name}/${id}`;
    return {
      id,
      path,
      get: async () => ({
        exists: !!store[path],
        data: () => (store[path] ? { ...store[path] } : undefined),
        id,
        ref: makeDocRef(name, id),
      }),
      update: (data: Record<string, any>) => {
        if (!store[path]) store[path] = {};
        applyUpdates(store[path], data);
      },
      set: (data: Record<string, any>, opts?: { merge?: boolean }) => {
        store[path] = opts?.merge ? { ...(store[path] || {}), ...data } : { ...data };
      },
    };
  }
  const mockTx = {
    get: async (ref: any) => {
      const snap = store[ref.path];
      return { exists: !!snap, data: () => (snap ? { ...snap } : undefined), id: ref.id };
    },
    update: (ref: any, data: Record<string, any>) => {
      if (!store[ref.path]) store[ref.path] = {};
      applyUpdates(store[ref.path], data);
    },
    set: (ref: any, data: Record<string, any>) => {
      store[ref.path] = { ...data };
    },
  };
  return {
    collection(name: string) {
      return {
        doc(id?: string) {
          if (!id) id = `auto-${nextId++}`;
          return makeDocRef(name, id);
        },
        where: () => this,
        limit: () => this,
        get: async () => {
          const docs = Object.entries(store)
            .filter(([p]) => p.startsWith(`${name}/`))
            .map(([p, d]) => ({ id: p.split('/')[1], data: () => ({ ...d }), ref: makeDocRef(name, p.split('/')[1]) }));
          return { empty: docs.length === 0, docs, size: docs.length };
        },
      };
    },
    runTransaction: (cb: (tx: any) => Promise<any>) => cb(mockTx),
    _store: store,
  };
}

const WALLET = 'parentWallets/par1';
const txDocs = (db: ReturnType<typeof makeMockDb>) =>
  Object.entries(db._store)
    .filter(([p]) => p.startsWith('parentWalletTxs/'))
    .map(([, d]) => d);

// ledger invariant: balance === totalCredited - totalSpent เสมอ
function assertLedgerInvariant(db: ReturnType<typeof makeMockDb>) {
  const w = db._store[WALLET];
  assert.equal(
    Math.round((Number(w.balance) || 0) * 100) / 100,
    Math.round(((Number(w.totalCredited) || 0) - (Number(w.totalSpent) || 0)) * 100) / 100,
    'balance must equal totalCredited - totalSpent',
  );
}

// ─────────────────────────────────────────────────────────────────
// getOrCreateParentWallet
// ─────────────────────────────────────────────────────────────────
test('getOrCreateParentWallet: สร้างวอลเล็ตใหม่ด้วยยอด 0 เมื่อยังไม่มี', async () => {
  const db = makeMockDb();
  const { data } = await getOrCreateParentWallet(db as any, 'par1');
  assert.equal(data.balance, 0);
  assert.equal(data.totalCredited, 0);
  assert.equal(data.totalSpent, 0);
  assert.equal(db._store[WALLET].parentId, 'par1');
});

test('getOrCreateParentWallet: คืนวอลเล็ตเดิมโดยไม่รีเซ็ตยอด', async () => {
  const db = makeMockDb();
  await creditParentWallet(db as any, { parentId: 'par1', amount: 500 });
  const { data } = await getOrCreateParentWallet(db as any, 'par1');
  assert.equal(data.balance, 500);
  assert.equal(data.totalCredited, 500);
});

// ─────────────────────────────────────────────────────────────────
// creditParentWallet
// ─────────────────────────────────────────────────────────────────
test('creditParentWallet: สร้างวอลเล็ต + ledger ใน transaction เดียวเมื่อยังไม่มีวอลเล็ต', async () => {
  const db = makeMockDb();
  const { balanceAfter } = await creditParentWallet(db as any, {
    parentId: 'par1',
    amount: 500,
    bookingId: 'bk1',
    paymentId: 'pay1',
  });
  assert.equal(balanceAfter, 500);
  const w = db._store[WALLET];
  assert.equal(w.balance, 500);
  assert.equal(w.totalCredited, 500);
  assert.equal(w.totalSpent, 0);
  assertLedgerInvariant(db);

  const txs = txDocs(db);
  assert.equal(txs.length, 1);
  assert.equal(txs[0].kind, 'refund');
  assert.equal(txs[0].amount, 500);
  assert.equal(txs[0].balanceAfter, 500);
  assert.equal(txs[0].bookingId, 'bk1');
  assert.equal(txs[0].paymentId, 'pay1');
});

test('creditParentWallet: เพิ่มยอด + totalCredited ของวอลเล็ตเดิม', async () => {
  const db = makeMockDb();
  await creditParentWallet(db as any, { parentId: 'par1', amount: 500 });
  const { balanceAfter } = await creditParentWallet(db as any, { parentId: 'par1', amount: 250, kind: 'adjust' });
  assert.equal(balanceAfter, 750);
  const w = db._store[WALLET];
  assert.equal(w.balance, 750);
  assert.equal(w.totalCredited, 750);
  assertLedgerInvariant(db);

  const txs = txDocs(db);
  assert.equal(txs.length, 2);
  assert.equal(txs[1].kind, 'adjust');
});

test('creditParentWallet: ปัดเศษเป็น 2 ตำแหน่งเสมอ', async () => {
  const db = makeMockDb();
  const { balanceAfter } = await creditParentWallet(db as any, { parentId: 'par1', amount: 33.333 });
  assert.equal(balanceAfter, 33.33);
  assert.equal(db._store[WALLET].balance, 33.33);
});

test('creditParentWallet: ปฏิเสธจำนวนเงินที่ไม่ถูกต้องโดยไม่แตะ store', async () => {
  for (const amount of [0, -10, NaN]) {
    const db = makeMockDb();
    await assert.rejects(
      () => creditParentWallet(db as any, { parentId: 'par1', amount }),
      /invalid_amount/,
    );
    assert.equal(Object.keys(db._store).length, 0, `store must stay empty for amount=${amount}`);
  }
});

// ─────────────────────────────────────────────────────────────────
// debitParentWallet
// ─────────────────────────────────────────────────────────────────
test('debitParentWallet: หักยอด + totalSpent + บันทึก ledger ติดลบ', async () => {
  const db = makeMockDb();
  await creditParentWallet(db as any, { parentId: 'par1', amount: 500 });
  const res = await debitParentWallet(db as any, { parentId: 'par1', amount: 300, bookingId: 'bk2' });
  assert.equal(res.ok, true);
  assert.equal(res.balanceAfter, 200);
  const w = db._store[WALLET];
  assert.equal(w.balance, 200);
  assert.equal(w.totalSpent, 300);
  assertLedgerInvariant(db);

  const txs = txDocs(db);
  assert.equal(txs.length, 2);
  assert.equal(txs[1].kind, 'spend');
  assert.equal(txs[1].amount, -300);
  assert.equal(txs[1].balanceAfter, 200);
});

test('debitParentWallet: ยอดไม่พอ → insufficient_credit โดยไม่เขียน ledger', async () => {
  const db = makeMockDb();
  await creditParentWallet(db as any, { parentId: 'par1', amount: 100 });
  const res = await debitParentWallet(db as any, { parentId: 'par1', amount: 250 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'insufficient_credit');
  assert.equal(res.balanceAfter, 100);
  assert.equal(db._store[WALLET].balance, 100);
  assert.equal(db._store[WALLET].totalSpent, 0);
  assert.equal(txDocs(db).length, 1); // มีแค่ refund เดิม
});

test('debitParentWallet: วอลเล็ตยังไม่มี → insufficient_credit', async () => {
  const db = makeMockDb();
  const res = await debitParentWallet(db as any, { parentId: 'par1', amount: 100 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'insufficient_credit');
  assert.equal(Object.keys(db._store).length, 0);
});

test('debitParentWallet: allowNegative หักเกินยอดได้แต่ invariant ยังคงอยู่', async () => {
  const db = makeMockDb();
  await creditParentWallet(db as any, { parentId: 'par1', amount: 100 });
  const res = await debitParentWallet(db as any, { parentId: 'par1', amount: 250, allowNegative: true });
  assert.equal(res.ok, true);
  assert.equal(res.balanceAfter, -150);
  assert.equal(db._store[WALLET].totalSpent, 250);
  assertLedgerInvariant(db);
});

test('debitParentWallet: ปฏิเสธจำนวนเงินที่ไม่ถูกต้อง (ไม่ throw)', async () => {
  const db = makeMockDb();
  for (const amount of [0, -5, NaN]) {
    const res = await debitParentWallet(db as any, { parentId: 'par1', amount });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'invalid_amount');
  }
  assert.equal(Object.keys(db._store).length, 0);
});

// ─────────────────────────────────────────────────────────────────
// flow จริง: ยกเลิก → คืนเงิน → ใช้เครดิต
// ─────────────────────────────────────────────────────────────────
test('flow ยกเลิก→คืนเต็ม→ใช้เครดิต: ยอดตรง + ledger ครบ + invariant คงเดิม', async () => {
  const db = makeMockDb();

  // ยกเลิกคลาส ≥24 ชม. → คืนเต็ม 500
  await creditParentWallet(db as any, {
    parentId: 'par1', amount: 500, kind: 'refund', bookingId: 'bk-cancel', paymentId: 'pay-cancel',
    note: 'คืนเต็ม — ยกเลิกล่วงหน้า ≥ 24 ชม.',
  });
  assert.equal(db._store[WALLET].balance, 500);

  // จ่ายคลาสถัดไปด้วยเครดิต 500 เต็มจำนวน
  const spent = await debitParentWallet(db as any, {
    parentId: 'par1', amount: 500, kind: 'spend', bookingId: 'bk-new', paymentId: 'pay-new',
    note: 'ใช้เครดิตชำระค่าคอร์ส',
  });
  assert.equal(spent.ok, true);
  assert.equal(spent.balanceAfter, 0);
  assert.equal(db._store[WALLET].totalSpent, 500);
  assertLedgerInvariant(db);

  const txs = txDocs(db);
  assert.equal(txs.length, 2);
  assert.equal(txs[0].kind, 'refund');
  assert.equal(txs[0].amount, 500);
  assert.equal(txs[1].kind, 'spend');
  assert.equal(txs[1].amount, -500);
  assert.equal(txs[1].balanceAfter, 0);
});
