export type AdminReviewStatus = 'pending' | 'approved' | 'rejected';

export interface TeacherVerificationState {
  emailVerified: boolean;
  isVerified: boolean;
  verificationLevel: 'none' | 'basic' | 'full';
  adminReviewStatus: AdminReviewStatus;
}

export interface TeacherVerificationRecord {
  role?: string;
  emailVerified?: boolean;
  isVerified?: boolean;
  verificationLevel?: string;
  adminReviewStatus?: string;
}

export type TeacherReviewDecision = 'approved' | 'rejected';

export interface TeacherReviewRecord {
  idCardURL?: unknown;
  bookBankURL?: unknown;
}

/**
 * Derives the Admin review state while remaining compatible with legacy records.
 * Legacy `full + isVerified` is the only state that can be considered approved.
 */
export function deriveAdminReviewStatus(record: TeacherVerificationRecord): AdminReviewStatus {
  if (record.adminReviewStatus === 'rejected') return 'rejected';
  if (
    record.role === 'teacher'
    && record.isVerified === true
    && record.verificationLevel === 'full'
    && (record.adminReviewStatus === undefined || record.adminReviewStatus === 'pending' || record.adminReviewStatus === 'approved')
  ) {
    return 'approved';
  }
  if (record.adminReviewStatus === 'pending') return 'pending';
  return 'pending';
}

export function isTeacherAdminApproved(record: TeacherVerificationRecord): boolean {
  return record.role === 'teacher'
    && deriveAdminReviewStatus(record) === 'approved'
    && record.isVerified === true
    && record.verificationLevel === 'full';
}

export function buildNewTeacherVerificationState(emailVerified: boolean): TeacherVerificationState {
  return {
    emailVerified,
    isVerified: false,
    verificationLevel: emailVerified ? 'basic' : 'none',
    adminReviewStatus: 'pending',
  };
}

export function canApproveTeacher(record: TeacherReviewRecord): boolean {
  return Boolean(record.idCardURL && record.bookBankURL);
}

export function buildTeacherReviewUpdate(
  decision: TeacherReviewDecision,
  emailVerified: boolean,
  note: string,
) {
  return {
    emailVerified,
    adminReviewStatus: decision,
    adminReviewNote: note || null,
    isVerified: decision === 'approved',
    verificationLevel: decision === 'approved' ? 'full' as const : (emailVerified ? 'basic' as const : 'none' as const),
    kycStatus: decision === 'approved' ? 'verified' as const : 'rejected' as const,
  };
}

/**
 * Converts a legacy Firebase Storage download URL into a safe KYC object path.
 * The returned path is accepted only when it belongs to the requested teacher.
 */
export function storagePathFromDownloadUrl(value: string | null | undefined, teacherId: string): string | null {
  if (!value || !teacherId) return null;

  let path = value;
  if (!value.startsWith('kyc/')) {
    try {
      const url = new URL(value);
      const marker = '/o/';
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex === -1) return null;
      path = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    } catch {
      return null;
    }
  }

  const expectedPrefix = `kyc/${teacherId}/`;
  if (!path.startsWith(expectedPrefix)) return null;
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  return path;
}
