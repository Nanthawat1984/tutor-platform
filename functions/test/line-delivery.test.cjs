const test = require('node:test');
const assert = require('node:assert/strict');

// ตั้งค่าก่อน require — pushLineMessages จะ throw ถ้า enabled แล้วไม่มี credential
process.env.LINE_NOTIFICATIONS_ENABLED = 'true';
process.env.LINE_CHANNEL_ID = 'test-channel';
process.env.LINE_CHANNEL_SECRET = 'test-secret';
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';

const { dispatchLineOutbox, computeRetryDelayMs, OUTBOX_COLLECTION } = require('../lib/line/outbox.js');
const { isPermanentLineFailure } = require('../lib/line/client.js');

// Firestore จำลองขั้นต่ำที่ dispatchLineOutbox ใช้ — คือ transaction get/update
// กับ doc get/update
function makeFakeDb(seed = {}) {
  const store = new Map(Object.entries(seed).map(([id, data]) => [id, { ...data }]));

  const refFor = (id) => ({
    id,
    async get() {
      return { exists: store.has(id), data: () => (store.has(id) ? { ...store.get(id) } : undefined) };
    },
    async update(payload) {
      store.set(id, { ...store.get(id), ...payload });
    },
  });

  return {
    store,
    collection(name) {
      assert.equal(name, OUTBOX_COLLECTION);
      return { doc: (id) => refFor(id) };
    },
    async runTransaction(fn) {
      return fn({
        get: (ref) => ref.get(),
        update: (ref, payload) => store.set(ref.id, { ...store.get(ref.id), ...payload }),
      });
    },
  };
}

// stub fetch เพื่อบังคับผลของ LINE API
function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

const PENDING = {
  recipientUid: 'user-1',
  lineUserId: 'U0000000000000000',
  eventType: 'booking.created',
  entityId: 'booking-1',
  messages: [{ type: 'text', text: 'สวัสดี' }],
  status: 'pending',
  attempts: 0,
};

test('marks a delivered notification as sent', async () => {
  const db = makeFakeDb({ n1: { ...PENDING } });
  const restore = stubFetch(async () => ({ ok: true }));

  try {
    assert.equal(await dispatchLineOutbox(db, 'n1'), 'sent');
  } finally {
    restore();
  }

  assert.equal(db.store.get('n1').status, 'sent');
  assert.ok(db.store.get('n1').sentAt, 'must stamp sentAt');
});

test('skips a user error permanently instead of burning retries', async () => {
  const db = makeFakeDb({ n1: { ...PENDING } });
  const restore = stubFetch(async () => ({
    ok: false,
    status: 404,
    json: async () => ({ message: 'The user does not exist' }),
  }));

  try {
    assert.equal(await dispatchLineOutbox(db, 'n1'), 'skipped');
  } finally {
    restore();
  }

  const record = db.store.get('n1');
  assert.equal(record.status, 'skipped');
  assert.equal(record.attempts, 1, 'a permanent failure must not be retried');
});

test('schedules a retry with backoff when LINE is temporarily unavailable', async () => {
  const db = makeFakeDb({ n1: { ...PENDING } });
  const restore = stubFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));

  try {
    assert.equal(await dispatchLineOutbox(db, 'n1'), 'retry');
  } finally {
    restore();
  }

  const record = db.store.get('n1');
  assert.equal(record.status, 'failed');
  assert.equal(record.attempts, 1);
  const delay = record.nextAttemptAt.toMillis() - Date.now();
  assert.ok(delay > 25_000 && delay <= 30_000, `first retry should be ~30s, got ${delay}ms`);
});

test('stops retrying after the attempt cap', async () => {
  const db = makeFakeDb({ n1: { ...PENDING, status: 'failed', attempts: 5 } });
  const restore = stubFetch(async () => {
    throw new Error('push must not be attempted once the cap is reached');
  });

  try {
    assert.equal(await dispatchLineOutbox(db, 'n1'), 'skipped');
  } finally {
    restore();
  }

  assert.equal(db.store.get('n1').lastError, 'retry_limit_reached');
});

test('treats a missing outbox document as nothing to do', async () => {
  const db = makeFakeDb({});
  const restore = stubFetch(async () => {
    throw new Error('push must not be attempted for a missing document');
  });

  try {
    assert.equal(await dispatchLineOutbox(db, 'nope'), 'skipped');
  } finally {
    restore();
  }
});

test('does not resend a notification that is already sent', async () => {
  const db = makeFakeDb({ n1: { ...PENDING, status: 'sent', attempts: 1 } });
  const restore = stubFetch(async () => {
    throw new Error('push must not be attempted twice');
  });

  try {
    assert.equal(await dispatchLineOutbox(db, 'n1'), 'sent');
  } finally {
    restore();
  }
});

test('classifies LINE failures as permanent only for user-level errors', () => {
  for (const status of [400, 404, 410]) {
    assert.equal(isPermanentLineFailure(status), true, `${status} must be permanent`);
  }
  for (const status of [429, 500, 502, 503]) {
    assert.equal(isPermanentLineFailure(status), false, `${status} must stay retryable`);
  }
});

test('backs off exponentially and caps at one hour', () => {
  assert.equal(computeRetryDelayMs(1), 30_000);
  assert.equal(computeRetryDelayMs(2), 60_000);
  assert.equal(computeRetryDelayMs(3), 120_000);
  assert.equal(computeRetryDelayMs(10), 3_600_000);
  assert.equal(computeRetryDelayMs(50), 3_600_000, 'must never exceed the one hour cap');
});