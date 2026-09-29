import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { Ticket } from 'lucide-react';
import { DashboardLayout, StatCard } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { requireSessionUser } from '@/lib/auth/session';
import { PackageManager } from '@/components/teacher/package-manager';

export const dynamic = 'force-dynamic';

export default async function TeacherPackagesPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;

  const [coursesSnap, packagesSnap, purchasesSnap] = await Promise.all([
    db.collection(COLLECTIONS.COURSES)
      .where('teacherId', '==', teacherId)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get(),
    db.collection(COLLECTIONS.PACKAGES)
      .where('teacherId', '==', teacherId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get(),
    db.collection(COLLECTIONS.PACKAGE_PURCHASES)
      .where('teacherId', '==', teacherId)
      .limit(200)
      .get(),
  ]);

  const courses = coursesSnap.docs.map((doc: any) => {
    const c = doc.data();
    return { id: doc.id, title: String(c.title || ''), pricePerSession: Number(c.pricePerSession) || 0 };
  });

  const packages = packagesSnap.docs.map((doc: any) => {
    const p = doc.data();
    return {
      id: doc.id,
      title: String(p.title || ''),
      courseTitle: String(p.courseTitle || ''),
      sessionsTotal: Number(p.sessionsTotal) || 0,
      priceTotal: Number(p.priceTotal) || 0,
      discountPercent: Number(p.discountPercent) || 0,
      isActive: p.isActive === true,
      soldCount: Number(p.soldCount) || 0,
    };
  });

  const purchases = purchasesSnap.docs.map((doc: any) => doc.data() as any);
  const activeCredits = purchases
    .filter((p) => p.status === 'active')
    .reduce((sum, p) => sum + Math.max(0, Number(p.sessionsRemaining) || 0), 0);
  const revenue = purchases
    .filter((p) => ['active', 'depleted'].includes(String(p.status)))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return (
    <DashboardLayout
      title="แพ็กเกจเรียน"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <p className="mb-6 text-sm text-slate-500">
        ขายคอร์สแบบแพ็กเกจ — ผู้ปกครองจ่ายก้อนเดียว แล้วจองเรียนด้วยเครดิตทีละครั้ง
        (รายได้เข้ากระเป๋าเงินคุณแบบ escrow ทีละครั้งเมื่อเช็คชื่อ "มา")
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="เครดิตที่ผู้เรียนถืออยู่"
          value={activeCredits}
          icon={<Ticket className="h-6 w-6" />}
          iconGradient="from-pink-500 to-rose-600"
        />
        <StatCard
          label="แพ็กเกจที่ขายได้"
          value={packages.reduce((sum, p) => sum + p.soldCount, 0)}
          icon={<Ticket className="h-6 w-6" />}
          iconGradient="from-indigo-500 to-blue-600"
        />
        <StatCard
          label="รายได้จากแพ็กเกจ"
          value={revenue.toLocaleString() + ' บ.'}
          icon={<Ticket className="h-6 w-6" />}
          iconGradient="from-emerald-500 to-teal-600"
        />
      </div>

      <PackageManager courses={courses} packages={packages} />
    </DashboardLayout>
  );
}
