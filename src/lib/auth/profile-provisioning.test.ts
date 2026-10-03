import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProfileAction, needsProfileSetup } from './profile-provisioning';

test('มีโปรไฟล์อยู่แล้ว — ใช้ตัวเดิมเสมอ ไม่ว่าจะมี consent หรือไม่', () => {
  const profile = { uid: 'u1', role: 'teacher' };
  assert.equal(resolveProfileAction({ existingProfile: profile, hasConsent: true }), 'reuse');
  assert.equal(resolveProfileAction({ existingProfile: profile, hasConsent: false }), 'reuse');
});

test('ไม่มีโปรไฟล์ + มี consent — สร้างใหม่ได้ (ทางเดินสมัครสมาชิก)', () => {
  assert.equal(resolveProfileAction({ existingProfile: null, hasConsent: true }), 'create');
});

test('ไม่มีโปรไฟล์ + ไม่มี consent — ต้องรอผู้ใช้ยอมรับ ไม่ใช่สร้างอัตโนมัติ', () => {
  // เคสนี้เคยทำให้ผู้ใช้ล็อกอินไม่ได้: โค้ดเรียก ensureUserProfile โดยไม่ส่ง consent
  // เซิร์ฟเวอร์ตอบ 400 consent_required แล้วไม่สร้าง doc → ผู้ใช้ติดล็อกอินถาวร
  assert.equal(resolveProfileAction({ existingProfile: null, hasConsent: false }), 'await-consent');
  assert.equal(resolveProfileAction({ existingProfile: undefined, hasConsent: false }), 'await-consent');
});

test('ต้องแสดงขั้นตอนกรอกโปรไฟล์เมื่อล็อกอินแล้วแต่ยังไม่มีโปรไฟล์', () => {
  assert.equal(needsProfileSetup({ signedIn: true, loading: false, profile: null }), true);
});

test('ไม่ต้องกรอกโปรไฟล์ซ้ำถ้ามีโปรไฟล์อยู่แล้ว', () => {
  assert.equal(
    needsProfileSetup({ signedIn: true, loading: false, profile: { uid: 'u1', role: 'parent' } }),
    false
  );
});

test('ยังไม่โหลดเสร็จหรือยังไม่ล็อกอิน — ยังไม่ต้องกรอกโปรไฟล์', () => {
  // กันหน้าจอกรอกโปรไฟล์กะพริบขึ้นมาตอนยังตรวจสอบอยู่
  assert.equal(needsProfileSetup({ signedIn: true, loading: true, profile: null }), false);
  assert.equal(needsProfileSetup({ signedIn: false, loading: false, profile: null }), false);
});