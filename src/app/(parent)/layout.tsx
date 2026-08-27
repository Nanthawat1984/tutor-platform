import { requireRole } from '@/lib/auth/guards';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['parent']);
  return <>{children}</>;
}
