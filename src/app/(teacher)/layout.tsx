import { requireRole } from '@/lib/auth/guards';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['teacher']);
  return <>{children}</>;
}
