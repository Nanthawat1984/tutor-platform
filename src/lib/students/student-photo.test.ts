import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
import { canTeacherViewStudentPhoto, isValidStudentPhotoPath } from './student-photo.ts';

test('accepts a private photo path for the same student and an allowed image type', () => {
  assert.equal(
    isValidStudentPhotoPath('student-photos/student-123/student-photo-1710000000000.jpg', 'student-123'),
    true,
  );
  assert.equal(
    isValidStudentPhotoPath('student-photos/student-123/student-photo-1710000000000.webp', 'student-123'),
    true,
  );
});

test('rejects another student path, traversal-like names, and non-image files', () => {
  assert.equal(
    isValidStudentPhotoPath('student-photos/student-999/student-photo-1710000000000.jpg', 'student-123'),
    false,
  );
  assert.equal(
    isValidStudentPhotoPath('student-photos/student-123/../student-999.jpg', 'student-123'),
    false,
  );
  assert.equal(
    isValidStudentPhotoPath('student-photos/student-123/student-photo-1710000000000.pdf', 'student-123'),
    false,
  );
});

test('allows a teacher to view a student photo only for their confirmed or completed booking', () => {
  const bookings = [
    { teacherId: 'teacher-1', studentId: 'student-123', status: 'pending' },
    { teacherId: 'teacher-1', studentId: 'student-123', status: 'confirmed' },
    { teacherId: 'teacher-2', studentId: 'student-123', status: 'completed' },
  ];

  assert.equal(canTeacherViewStudentPhoto(bookings, 'teacher-1', 'student-123'), true);
  assert.equal(canTeacherViewStudentPhoto(bookings, 'teacher-2', 'student-123'), true);
  assert.equal(canTeacherViewStudentPhoto(bookings, 'teacher-3', 'student-123'), false);
  assert.equal(canTeacherViewStudentPhoto(bookings, 'teacher-1', 'student-999'), false);
});

test('does not treat cancelled or unknown booking states as teacher access', () => {
  const bookings = [
    { teacherId: 'teacher-1', studentId: 'student-123', status: 'cancelled' },
    { teacherId: 'teacher-1', studentId: 'student-123', status: 'pending' },
  ];

  assert.equal(canTeacherViewStudentPhoto(bookings, 'teacher-1', 'student-123'), false);
});
