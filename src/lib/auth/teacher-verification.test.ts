import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { buildTeacherReviewUpdate, buildNewTeacherVerificationState, canApproveTeacher, deriveAdminReviewStatus, isTeacherAdminApproved, storagePathFromDownloadUrl } from './teacher-verification.ts';

test('email-verified basic teacher remains pending until Admin approval', () => {
  const teacher = {
    role: 'teacher',
    emailVerified: true,
    isVerified: true,
    verificationLevel: 'basic',
  };

  assert.equal(deriveAdminReviewStatus(teacher), 'pending');
  assert.equal(isTeacherAdminApproved(teacher), false);
});

test('full verification is the only legacy state treated as approved', () => {
  const teacher = {
    role: 'teacher',
    emailVerified: true,
    isVerified: true,
    verificationLevel: 'full',
  };

  assert.equal(deriveAdminReviewStatus(teacher), 'approved');
  assert.equal(isTeacherAdminApproved(teacher), true);
});

test('rejected teacher is never treated as approved even if stale fields remain', () => {
  const teacher = {
    role: 'teacher',
    emailVerified: true,
    isVerified: true,
    verificationLevel: 'basic',
    adminReviewStatus: 'rejected',
  };

  assert.equal(deriveAdminReviewStatus(teacher), 'rejected');
  assert.equal(isTeacherAdminApproved(teacher), false);
});

test('approved status cannot override missing full verification fields', () => {
  assert.equal(deriveAdminReviewStatus({
    role: 'teacher',
    adminReviewStatus: 'approved',
    isVerified: false,
    verificationLevel: 'basic',
  }), 'pending');
});

test('new teacher state separates email verification from Admin approval', () => {
  assert.deepEqual(buildNewTeacherVerificationState(true), {
    emailVerified: true,
    isVerified: false,
    verificationLevel: 'basic',
    adminReviewStatus: 'pending',
  });
  assert.deepEqual(buildNewTeacherVerificationState(false), {
    emailVerified: false,
    isVerified: false,
    verificationLevel: 'none',
    adminReviewStatus: 'pending',
  });
});

test('document viewer only accepts a KYC storage path for the requested teacher', () => {
  const downloadUrl = 'https://firebasestorage.googleapis.com/v0/b/example/o/kyc%2Fteacher-1%2FidCardURL-123.pdf?alt=media&token=secret';

  assert.equal(storagePathFromDownloadUrl(downloadUrl, 'teacher-1'), 'kyc/teacher-1/idCardURL-123.pdf');
  assert.equal(storagePathFromDownloadUrl(downloadUrl, 'teacher-2'), null);
  assert.equal(storagePathFromDownloadUrl('https://example.com/private.pdf', 'teacher-1'), null);
});

test('approval requires both KYC documents', () => {
  assert.equal(canApproveTeacher({ idCardURL: 'id-card-url', bookBankURL: 'book-bank-url' }), true);
  assert.equal(canApproveTeacher({ idCardURL: 'id-card-url' }), false);
  assert.equal(canApproveTeacher({ bookBankURL: 'book-bank-url' }), false);
});

test('review update clears public verification when rejecting a teacher', () => {
  assert.deepEqual(buildTeacherReviewUpdate('rejected', true, 'เอกสารไม่ตรงกัน'), {
    emailVerified: true,
    adminReviewStatus: 'rejected',
    adminReviewNote: 'เอกสารไม่ตรงกัน',
    isVerified: false,
    verificationLevel: 'basic',
    kycStatus: 'rejected',
  });
});
