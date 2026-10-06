import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { decideLiffSignInAction } from './liff-auth.ts';

test('uses the LIFF ID token directly when already logged in inside LINE', () => {
  assert.deepEqual(decideLiffSignInAction({ inLineWebview: true, liffLoggedIn: true }), {
    action: 'direct',
  });
});

test('redirects to LINE login first when the webview has no LIFF session', () => {
  assert.deepEqual(decideLiffSignInAction({ inLineWebview: true, liffLoggedIn: false }), {
    action: 'login',
  });
});

test('never uses LIFF outside the LINE webview', () => {
  assert.deepEqual(decideLiffSignInAction({ inLineWebview: false, liffLoggedIn: true }), {
    action: 'not-liff',
  });
  assert.deepEqual(decideLiffSignInAction({ inLineWebview: false, liffLoggedIn: false }), {
    action: 'not-liff',
  });
});
