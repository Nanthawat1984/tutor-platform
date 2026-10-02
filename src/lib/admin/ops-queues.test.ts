import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { buildOpsQueueCards, classifyQueue, countOpsQueues, EMPTY_OPS_QUEUE_COUNTS, OPS_QUEUE_DEFINITIONS, summarizeOpsQueues } from './ops-queues.ts';

test('every queue definition is complete and has ordered thresholds', () => {
  for (const definition of OPS_QUEUE_DEFINITIONS) {
    assert.ok(definition.label, `${definition.key} ต้องมี label`);
    assert.ok(definition.description, `${definition.key} ต้องมี description`);
    assert.ok(
      definition.watchAt < definition.actionAt,
      `${definition.key} ต้องมี watchAt ต่ำกว่า actionAt`,
    );
  }
});

test('an empty queue is idle even when watchAt is zero', () => {
  assert.equal(classifyQueue(0, { watchAt: 0, actionAt: 5 }), 'idle');
});

test('classifies a queue by watch and action thresholds', () => {
  const thresholds = { watchAt: 5, actionAt: 10 };
  assert.equal(classifyQueue(1, thresholds), 'idle');
  assert.equal(classifyQueue(5, thresholds), 'watch');
  assert.equal(classifyQueue(9, thresholds), 'watch');
  assert.equal(classifyQueue(10, thresholds), 'action');
  assert.equal(classifyQueue(999, thresholds), 'action');
});

test('treats negative, NaN and fractional counts safely', () => {
  const thresholds = { watchAt: 5, actionAt: 10 };
  assert.equal(classifyQueue(-3, thresholds), 'idle');
  assert.equal(classifyQueue(NaN, thresholds), 'idle');
  assert.equal(classifyQueue(Infinity, thresholds), 'idle');
  assert.equal(classifyQueue(10.9, thresholds), 'action');
});

test('missing or partial counts fall back to zero instead of NaN', () => {
  const cards = buildOpsQueueCards({ paymentsAwaitingReview: 25 });
  const byKey = Object.fromEntries(cards.map((card) => [card.key, card]));

  assert.equal(cards.length, OPS_QUEUE_DEFINITIONS.length);
  assert.equal(byKey.paymentsAwaitingReview.count, 25);
  assert.equal(byKey.paymentsPaid.count, 0);
  assert.ok(cards.every((card) => Number.isFinite(card.count)));
});

test('buildOpsQueueCards tolerates null and undefined input', () => {
  for (const input of [null, undefined]) {
    const cards = buildOpsQueueCards(input);
    assert.equal(cards.length, OPS_QUEUE_DEFINITIONS.length);
    assert.ok(cards.every((card) => card.count === 0 && card.severity === 'idle'));
  }
});

test('sorts queues needing action first, then watch, then idle', () => {
  const cards = buildOpsQueueCards({
    paymentsPaid: 60,
    lineOutboxFailed: 1,
    payoutsRequested: 20,
    stripeEventsProcessing: 3,
  });

  assert.deepEqual(cards.map((card) => card.severity), [
    'action', 'action', 'watch', 'idle', 'idle', 'idle',
  ]);
  // คิวที่ต้องลงมือทำมากที่สุดต้องมาก่อน
  assert.equal(cards[0].key, 'paymentsPaid');
  assert.equal(cards[1].key, 'payoutsRequested');
  assert.equal(cards[2].key, 'stripeEventsProcessing');
  // คิวว่างอยู่ท้ายสุด
  assert.equal(cards[cards.length - 1].count, 0);
});

test('summarizeOpsQueues counts queues per severity and totals only action items', () => {
  const summary = summarizeOpsQueues(buildOpsQueueCards({
    paymentsAwaitingReview: 25,
    stripeEventsProcessing: 3,
    payoutsRequested: 2,
  }));

  assert.equal(summary.action, 1);
  assert.equal(summary.watch, 1);
  assert.equal(summary.idle, 4);
  assert.equal(summary.actionCount, 25);
});

test('summary reports a clean system when every queue is empty', () => {
  assert.deepEqual(summarizeOpsQueues(buildOpsQueueCards(EMPTY_OPS_QUEUE_COUNTS)), {
    action: 0,
    watch: 0,
    idle: 6,
    actionCount: 0,
  });
});

test('every queue that needs manual work links to a real admin page', () => {
  for (const card of buildOpsQueueCards(EMPTY_OPS_QUEUE_COUNTS)) {
    if (!card.actionHref) continue;
    assert.match(card.actionHref, /^\/admin\/[a-z-]+$/, `${card.key} ต้องชี้ไปหน้าแอดมินที่มีอยู่จริง`);
  }
});

test('countOpsQueues reads six count aggregations without fetching documents', async () => {
  const collections: string[] = [];
  const db = {
    collection(name: string) {
      collections.push(name);
      return {
        where(_field: string, _op: string, value: string) {
          return {
            count() {
              return { get: async () => ({ data: () => ({ count: value.length }) }) };
            },
          };
        },
      };
    },
  } as any;

  const counts = await countOpsQueues(db);

  assert.equal(collections.length, 6);
  assert.deepEqual(counts, {
    // ใน mock ค่า value คือความยาวของสตริงสถานะ
    paymentsAwaitingReview: 'awaiting_review'.length,
    paymentsPaid: 'paid'.length,
    payoutsRequested: 'requested'.length,
    payoutsProcessing: 'processing'.length,
    stripeEventsProcessing: 'processing'.length,
    lineOutboxFailed: 'failed'.length,
  });
});