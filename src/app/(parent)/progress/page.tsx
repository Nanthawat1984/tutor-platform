import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { COLLECTIONS } from '@/types/firestore';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { BarChart3, GraduationCap } from 'lucide-react';

export default async function ProgressPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const parentId = 'temp-parent-id';

  const reportsSnap = await db.collection(COLLECTIONS.SESSION_REPORTS)
    .where('parentId', '==', parentId)
    .orderBy('sessionDate', 'desc')
    .limit(50)
    .get();

  const reports = reportsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  const byStudent: Record<string, any[]> = {};
  reports.forEach((r: any) => {
    const name = r.studentName || 'ไม่ระบุ';
    if (!byStudent[name]) byStudent[name] = [];
    byStudent[name].push(r);
  });

  return (
    <DashboardLayout
      title="ผลการเรียน"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName="ผู้ปกครอง"
    >
      {reports.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-7 w-7" />}
          title="ยังไม่มีรายงานผลการเรียน"
          description="รายงานจากครูจะแสดงที่นี่หลังแต่ละเซสชันเรียน"
        />
      ) : (
        Object.entries(byStudent).map(([studentName, studentReports]: [string, any]) => (
          <div key={studentName} className="mb-8 last:mb-0">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-pink-700">
                <GraduationCap className="h-4.5 w-4.5" />
              </span>
              {studentName}
            </h2>
            <div className="space-y-3">
              {studentReports.map((r: any) => (
                <Card key={r.id} hoverable>
                  <div className="responsive-card-row sm:items-start">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-semibold text-slate-900">{r.courseTitle}</span>
                        <span className="text-sm text-gray-400">{formatDate(r.sessionDate, 'd MMM yyyy')}</span>
                      </div>
                      {r.topicsCovered && <p className="mt-2 text-sm text-gray-600"><span className="font-medium">เรื่องที่สอน:</span> {r.topicsCovered}</p>}
                      {r.homework && <p className="mt-1 text-sm text-gray-600"><span className="font-medium">การบ้าน:</span> {r.homework}</p>}
                      {r.notes && <p className="mt-1 text-sm text-gray-500 italic">"{r.notes}"</p>}
                    </div>
                    {r.score !== null && r.score !== undefined && (
                      <div className="w-full text-left sm:ml-4 sm:w-auto sm:text-center">
                        <div className={`text-2xl font-bold ${r.score >= 80 ? 'text-emerald-600' : r.score >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{r.score}</div>
                        <div className="text-xs text-gray-400">คะแนน</div>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
