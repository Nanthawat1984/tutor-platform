import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { isLineWebview } from './liff-client.ts';

test('detects LINE in-app browser UA (iOS)', () => {
  const ua =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 Line/13.2.0';
  assert.equal(isLineWebview(ua), true);
});

test('detects LINE in-app browser UA (Android)', () => {
  const ua =
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Line/14.8.0';
  assert.equal(isLineWebview(ua), true);
});

test('does not flag ordinary mobile Safari or Chrome', () => {
  const iosSafari =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const androidChrome =
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  assert.equal(isLineWebview(iosSafari), false);
  assert.equal(isLineWebview(androidChrome), false);
});

test('returns false for empty or server-side (no navigator) input', () => {
  assert.equal(isLineWebview(''), false);
});
