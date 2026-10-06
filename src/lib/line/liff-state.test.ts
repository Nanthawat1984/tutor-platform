import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { getLiffStatePath, hasLineAuthResponse, isLiffPrimaryRedirect } from './liff-state.ts';

test('reads the target path from the liff.state query parameter', () => {
  assert.equal(getLiffStatePath('?liff.state=%2Fmy-bookings'), '/my-bookings');
  assert.equal(
    getLiffStatePath('?liff.state=%2Fmy-profile%3Fline_link%3D1'),
    '/my-profile?line_link=1',
  );
  assert.equal(getLiffStatePath('?liff.state=%2Fschedule%23today'), '/schedule#today');
});

test('returns null when liff.state is missing or is not a same-site path', () => {
  assert.equal(getLiffStatePath(''), null);
  assert.equal(getLiffStatePath('?other=1'), null);
  // open-redirect attempts must never be followed
  assert.equal(getLiffStatePath('?liff.state=https%3A%2F%2Fevil.example'), null);
  assert.equal(getLiffStatePath('?liff.state=%2F%2Fevil.example'), null);
  assert.equal(getLiffStatePath('?liff.state=%2F%5Cevil.example'), null);
  assert.equal(getLiffStatePath('?liff.state=%2Fmy%0D%0Abookings'), null);
});

test('only treats the domain-root page as the LIFF primary redirect', () => {
  assert.equal(isLiffPrimaryRedirect('?liff.state=%2Fmy-bookings', '/'), true);
  // endpoint ยังตั้งเป็น /my-profile — secondary redirect จะต่อเป็น
  // /my-profile/my-bookings (404) จึงห้ามแตะหน้านี้
  assert.equal(isLiffPrimaryRedirect('?liff.state=%2Fmy-bookings', '/my-profile'), false);
  // หน้าแรกปกติของผู้ใช้ทั่วไปที่ไม่ได้มาจาก LIFF ต้องไม่ถูก redirect
  assert.equal(isLiffPrimaryRedirect('', '/'), false);
  assert.equal(isLiffPrimaryRedirect('?utm_source=line', '/'), false);
});

test('detects a LINE auth response so liff.init can consume it first', () => {
  assert.equal(hasLineAuthResponse('?code=abc&liff.state=%2Fmy-bookings', ''), true);
  assert.equal(hasLineAuthResponse('?error=access_denied', ''), true);
  assert.equal(hasLineAuthResponse('?liff.state=%2Fmy-bookings', '#id_token=xyz'), true);
  assert.equal(hasLineAuthResponse('?liff.state=%2Fmy-bookings', '#access_token=xyz'), true);
  assert.equal(hasLineAuthResponse('?liff.state=%2Fmy-bookings', ''), false);
  assert.equal(hasLineAuthResponse('?liff.state=%2Fmy-bookings&line_link=1', ''), false);
  // query ปกติของแอปที่มีเครื่องหมาย = ไม่ควรถูกตีความเป็น auth response
  assert.equal(hasLineAuthResponse('?liff.state=%2Fa%3Fb%3Dc', ''), false);
});
