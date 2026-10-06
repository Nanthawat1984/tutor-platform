import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { getLiffStatePath, getLiffStateRedirect, hasLineAuthResponse } from './liff-state.ts';

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
  // เป้าหมายที่ยังมี liff.state อยู่จะทำให้ middleware redirect วนซ้ำ
  assert.equal(getLiffStatePath('?liff.state=%2Ffoo%3Fliff.state%3D%2Fbar'), null);
});

test('redirects straight to the tapped menu from any primary redirect URL', () => {
  // ไม่ว่า LIFF จะพาไปลง endpoint อะไร (/ หรือ /my-profile หรืออะไรก็ตาม)
  // คำตอบต้องเป็น path ที่ผู้ใช้กดเสมอ
  assert.equal(getLiffStateRedirect('?liff.state=%2Fpayments'), '/payments');
  assert.equal(getLiffStateRedirect('?liff.state=%2Fmy-bookings&other=1'), '/my-bookings');
  assert.equal(getLiffStateRedirect('?liff.state=%2Fsupport#team'), '/support#team');
});

test('does not redirect when there is no state or LINE auth must be consumed first', () => {
  assert.equal(getLiffStateRedirect(''), null);
  assert.equal(getLiffStateRedirect('?utm_source=line'), null);
  // auth code ต้องให้ liff.init() แลกก่อน ห้าม redirect ทิ้ง
  assert.equal(getLiffStateRedirect('?code=abc&liff.state=%2Fpayments'), null);
  assert.equal(getLiffStateRedirect('?error=access_denied&liff.state=%2Fpayments'), null);
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
