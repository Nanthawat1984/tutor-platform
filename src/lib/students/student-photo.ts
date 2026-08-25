export const STUDENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const STUDENT_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type StudentPhotoBooking = {
  teacherId?: unknown;
  studentId?: unknown;
  status?: unknown;
};

const STUDENT_PHOTO_FILE_PATTERN = /^student-photo-\d+\.(?:jpg|jpeg|png|webp)$/i;

export function isValidStudentPhotoPath(path: string, studentId: string): boolean {
  if (!path || !studentId) return false;
  const prefix = `student-photos/${studentId}/`;
  if (!path.startsWith(prefix)) return false;
  return STUDENT_PHOTO_FILE_PATTERN.test(path.slice(prefix.length));
}

export function canTeacherViewStudentPhoto(
  bookings: readonly StudentPhotoBooking[],
  teacherId: string,
  studentId: string,
): boolean {
  return bookings.some((booking) => (
    booking.teacherId === teacherId
    && booking.studentId === studentId
    && (booking.status === 'confirmed' || booking.status === 'completed')
  ));
}
