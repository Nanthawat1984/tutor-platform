import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { releasePackageSessionEscrow, consumePackageCredit, refundPackageCredit, packagePriceBreakdown, computePackageTotals, perSessionNetOf } from './packages.ts';

// ─────────────────────────────────────────────────────────────────
// In-memory Firestore mock — minimal surface used by packages.ts
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

interface MockDb {
  collection(name: string): any;
  runTransaction<T>(cb: (tx: any) => Promise<T>): Promise<T>;
  _store: Record<string, Record<string, any>>;
}

function makeMockDb(): MockDb {
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
        if (opts?.merge) {
          store[path] = { ...(store[path] || {}), ...data };
        } else {
          store[path] = { ...data };
        }
      },
    };
  }
  const mockTx = {
    get: async (ref: any) => {
      const snap = store[ref.path];
      return {
        exists: !!snap,
        data: () => (snap ? { ...snap } : undefined),
        id: ref.id,
      };
    },
    update: (ref: any, data: Record<string, any>) => {
      if (!store[ref.path]) store[ref.path] = {};
      applyUpdates(store[ref.path], data);
    },
    set: (ref: any, data: Record<string, any>) => {
      store[ref.path] = { ...data };
    },
  };
  const db: MockDb = {
    collection(name: string) {
      return {
        doc(id?: string) {
          if (!id) id = `auto-${nextId++}`;
          return makeDocRef(name, id);
        },
        add: (data: Record<string, any>) => {
          const id = `auto-${nextId++}`;
          const path = `${name}/${id}`;
          store[path] = { ...data };
          return { id, ref: makeDocRef(name, id) };
        },
        where: () => this,
        limit: () => this,
        get: async () => {
          const docs = Object.entries(store)
            .filter(([p]) => p.startsWith(`${name}/`))
            .map(([p, d]) => ({
              id: p.split('/')[1],
              data: () => ({ ...d }),
              ref: makeDocRef(name, p.split('/')[1]),
            }));
          return { empty: docs.length === 0, docs, size: docs.length };
        },
      };
    },
    runTransaction: (cb: (tx: any) => Promise<any>) => cb(mockTx),
    _store: store,
  };
  return db;
}

// ─────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────
test('packagePriceBreakdown computes list price', () => {
  const r = packagePriceBreakdown(500, 10);
  assert.equal(r.list, 5000);
});
test('packagePriceBreakdown clamps bad inputs', () => {
  assert.equal(packagePriceBreakdown(0, 5).list, 0);
  assert.equal(packagePriceBreakdown(500, 0).list, 500); // sessionsTotal < 1 → clamps to 1
  assert.equal(packagePriceBreakdown(-10, 3).list, 0);
});

test('computePackageTotals returns gross, fees, net', () => {
  const { amount, fees, netAmount } = computePackageTotals(5000);
  assert.equal(amount, 5000);
  assert.equal(fees, 1000); // 20%
  assert.equal(netAmount, 4000);
});

test('perSessionNetOf distributes net evenly (floor to cents)', () => {
  assert.equal(perSessionNetOf(4000, 10), 400);
  assert.equal(perSessionNetOf(4001, 10), 400.1); // 400.1 floored to cents
  assert.equal(perSessionNetOf(100, 3), 33.33);
});

// ─────────────────────────────────────────────────────────────────
// releasePackageSessionEscrow
// ─────────────────────────────────────────────────────────────────
test('escrow release: mid-package session below tax threshold', async () => {
  const db = makeMockDb();
  const bookingId = 'b1', purchaseId = 'p1', teacherId = 't1';
  db._store[`bookings/${bookingId}`] = {
    id: bookingId, packagePurchaseId: purchaseId, paidWithCredit: true,
    creditReleased: false, teacherId, status: 'completed',
  };
  db._store[`packagePurchases/${purchaseId}`] = {
    id: purchaseId, teacherId, sessionsTotal: 10, sessionsUsed: 5,
    sessionsRemaining: 5, netAmount: 4000, releasedSessions: 5,
    releasedNetTotal: 2000, perSessionNet: 400, taxWithheldTotal: 60,
    status: 'active',
  };
  db._store[`wallets/${teacherId}`] = {
    teacherId, pendingBalance: 4000, availableBalance: 3940, totalEarned: 3940,
  };

  const result = await releasePackageSessionEscrow(db as any, bookingId);
  assert.deepEqual(result, { ok: true });

  const p = db._store[`packagePurchases/${purchaseId}`];
  assert.equal(p.releasedSessions, 6);
  assert.equal(p.releasedNetTotal, 2400); // 2000 + 400

  const w = db._store[`wallets/${teacherId}`];
  assert.equal(w.pendingBalance, 3600); // 4000 - 400
  assert.equal(w.availableBalance, 4340); // 3940 + 400
  assert.equal(w.totalEarned, 4340);

  assert.equal(db._store[`bookings/${bookingId}`].creditReleased, true);
});

test('escrow release: last session absorbs remainder', async () => {
  const db = makeMockDb();
  const bookingId = 'b2', purchaseId = 'p2', teacherId = 't2';
  db._store[`bookings/${bookingId}`] = {
    id: bookingId, packagePurchaseId: purchaseId, paidWithCredit: true,
    creditReleased: false, teacherId,
  };
  db._store[`packagePurchases/${purchaseId}`] = {
    id: purchaseId, teacherId, sessionsTotal: 5, releasedSessions: 4,
    releasedNetTotal: 3200.05, perSessionNet: 800, netAmount: 4000.05,
    status: 'active',
  };
  db._store[`wallets/${teacherId}`] = {
    teacherId, pendingBalance: 4000.05, availableBalance: 0, totalEarned: 0,
  };

  const result = await releasePackageSessionEscrow(db as any, bookingId);
  assert.deepEqual(result, { ok: true });

  const p = db._store[`packagePurchases/${purchaseId}`];
  assert.equal(p.releasedSessions, 5);
  const w = db._store[`wallets/${teacherId}`];
  // isLast=true → sessionNet = round((4000.05 - 3200.05) * 100)/100 = 800
  // 800 >= 1000? No → belowThreshold → taxWithheld = 0, payoutAmount = 800
  assert.equal(w.pendingBalance, 3200.05); // 4000.05 - 800
  assert.equal(w.availableBalance, 800);
});

test('escrow release: session above tax threshold withholds 3%', async () => {
  const db = makeMockDb();
  const bookingId = 'b3', purchaseId = 'p3', teacherId = 't3';
  db._store[`bookings/${bookingId}`] = {
    id: bookingId, packagePurchaseId: purchaseId, paidWithCredit: true,
    creditReleased: false, teacherId,
  };
  db._store[`packagePurchases/${purchaseId}`] = {
    id: purchaseId, teacherId, sessionsTotal: 10, releasedSessions: 5,
    releasedNetTotal: 5000, perSessionNet: 1100, netAmount: 10000,
    status: 'active',
  };
  db._store[`wallets/${teacherId}`] = {
    teacherId, pendingBalance: 10000, availableBalance: 4970, totalEarned: 4970,
  };

  const result = await releasePackageSessionEscrow(db as any, bookingId);
  assert.deepEqual(result, { ok: true });

  const p = db._store[`packagePurchases/${purchaseId}`];
  assert.equal(p.releasedSessions, 6);
  assert.equal(p.releasedNetTotal, 6100); // 5000 + 1100
  // sessionNet=1100, taxWithheld=round(1100*0.03*100)/100=33, payoutAmount=1067
  assert.equal(p.taxWithheldTotal, 33);
  const w = db._store[`wallets/${teacherId}`];
  assert.equal(w.pendingBalance, 8900); // 10000 - 1100
  assert.equal(w.availableBalance, 6037); // 4970 + 1067
  assert.equal(w.totalEarned, 6037);
});

test('escrow release: idempotent when already released', async () => {
  const db = makeMockDb();
  const bookingId = 'b4', purchaseId = 'p4', teacherId = 't4';
  db._store[`bookings/${bookingId}`] = {
    id: bookingId, packagePurchaseId: purchaseId, paidWithCredit: true,
    creditReleased: true, teacherId,
  };
  db._store[`packagePurchases/${purchaseId}`] = {
    id: purchaseId, teacherId, sessionsTotal: 10, status: 'active',
  };
  db._store[`wallets/${teacherId}`] = { teacherId, pendingBalance: 3000, availableBalance: 0, totalEarned: 0 };

  const result = await releasePackageSessionEscrow(db as any, bookingId);
  assert.deepEqual(result, { ok: true, reason: 'already_released' });
});

test('escrow release: rejects non-credit booking', async () => {
  const db = makeMockDb();
  db._store['bookings/nb1'] = { id: 'nb1', paidWithCredit: false, packagePurchaseId: 'p', creditReleased: false };
  const result = await releasePackageSessionEscrow(db as any, 'nb1');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_credit_booking');
});

test('escrow release: rejects missing purchase', async () => {
  const db = makeMockDb();
  db._store['bookings/b5'] = { id: 'b5', paidWithCredit: true, packagePurchaseId: 'p5', creditReleased: false };
  const result = await releasePackageSessionEscrow(db as any, 'b5');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'purchase_not_found');
});

// ─────────────────────────────────────────────────────────────────
// consumePackageCredit (transactional)
// ─────────────────────────────────────────────────────────────────
test('consumePackageCredit: consumes one session atomically', async () => {
  const db = makeMockDb();
  db._store['packagePurchases/pc1'] = {
    id: 'pc1', parentId: 'par1', teacherId: 'tch1', status: 'active',
    sessionsTotal: 10, sessionsUsed: 3, sessionsRemaining: 7,
    lowCreditNotified: false, depletedNotified: false,
  };
  const result = await consumePackageCredit(db as any, 'pc1', 'bk1');
  assert.equal(result.ok, true);
  assert.equal(result.remaining, 6);

  const creditTxKeys = Object.keys(db._store).filter((k) => k.startsWith('creditTransactions/'));
  assert.equal(creditTxKeys.length, 1);
  const ledgerEntry = db._store[creditTxKeys[0]];
  assert.equal(ledgerEntry.kind, 'consume');
  assert.equal(ledgerEntry.bookingId, 'bk1');
  assert.equal(ledgerEntry.sessionsDelta, -1);
  assert.equal(ledgerEntry.balanceAfter, 6);
});

test('consumePackageCredit: insufficient credit throws', async () => {
  const db = makeMockDb();
  db._store['packagePurchases/pc2'] = {
    id: 'pc2', parentId: 'par2', teacherId: 'tch2', status: 'active',
    sessionsTotal: 5, sessionsUsed: 5, sessionsRemaining: 0,
    lowCreditNotified: false, depletedNotified: false,
  };
  const result = await consumePackageCredit(db as any, 'pc2', 'bk2');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient_credit');
});

test('consumePackageCredit: consuming last credit depletes purchase', async () => {
  const db = makeMockDb();
  db._store['packagePurchases/pc5'] = {
    id: 'pc5', parentId: 'par1', teacherId: 'tch1', status: 'active',
    sessionsTotal: 2, sessionsUsed: 1, sessionsRemaining: 1,
    lowCreditNotified: false, depletedNotified: false,
  };
  const result = await consumePackageCredit(db as any, 'pc5', 'bk5');
  assert.equal(result.ok, true);
  assert.equal(result.remaining, 0);
  assert.equal(db._store['packagePurchases/pc5'].status, 'depleted');
});

test('consumePackageCredit: rejects non-active purchase', async () => {
  const db = makeMockDb();
  db._store['packagePurchases/pc3'] = {
    id: 'pc3', status: 'depleted', sessionsTotal: 5, sessionsUsed: 5, sessionsRemaining: 0,
  };
  const result = await consumePackageCredit(db as any, 'pc3', 'bk3');
  assert.equal(result.ok, false);
  assert.match(result.reason || '', /depleted/);
});

// ─────────────────────────────────────────────────────────────────
// refundPackageCredit
// ─────────────────────────────────────────────────────────────────
test('refundPackageCredit: returns one session', async () => {
  const db = makeMockDb();
  db._store['packagePurchases/pr1'] = {
    id: 'pr1', parentId: 'par1', teacherId: 'tch1', status: 'active',
    sessionsTotal: 10, sessionsUsed: 3, sessionsRemaining: 7,
  };
  const result = await refundPackageCredit(db as any, 'pr1', 'bk1');
  assert.equal(result.ok, true);
  assert.equal(result.remaining, 8);
  assert.equal(db._store['packagePurchases/pr1'].sessionsUsed, 2);
});

test('refundPackageCredit: reactivates depleted purchase', async () => {
  const db = makeMockDb();
  db._store['packagePurchases/pr2'] = {
    id: 'pr2', parentId: 'par2', teacherId: 'tch2', status: 'depleted',
    sessionsTotal: 5, sessionsUsed: 5, sessionsRemaining: 0,
  };
  const result = await refundPackageCredit(db as any, 'pr2', null);
  assert.equal(result.ok, true);
  assert.equal(db._store['packagePurchases/pr2'].status, 'active');
});
