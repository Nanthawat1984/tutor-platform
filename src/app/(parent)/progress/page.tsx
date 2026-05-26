import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { COLLECTIONS } from '@/types/firestore';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
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
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ผลการเรียน</h1>
        <p className="text-sm text-gray-500">ติดตามความก้าวหน้าของลูกคุณ</p>
      </div>

      {reports.length === 0 ? (
        <Card className="py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <BarChart3 className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">ยังไม่มีรายงานผลการเรียน</h3>
        </Card>
      ) : (
        Object.entries(byStudent).map(([studentName, studentReports]: [string, any]) => (
          <div key={studentName}>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <GraduationCap className="h-5 w-5 text-blue-600" /> {studentName}
            </h2>
            <div className="space-y-3">
              {studentReports.map((r: any) => (
                <Card key={r.id}>
                  <div className="responsive-card-row sm:items-start">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-medium">{r.courseTitle}</span>
                        <span className="text-sm text-gray-400">{formatDate(r.sessionDate, 'd MMM yyyy')}</span>
                      </div>
                      {r.topicsCovered && <p className="mt-2 text-sm text-gray-600"><span className="font-medium">เรื่องที่สอน:</span> {r.topicsCovered}</p>}
                      {r.homework && <p className="mt-1 text-sm text-gray-600"><span className="font-medium">การบ้าน:</span> {r.homework}</p>}
                      {r.notes && <p className="mt-1 text-sm text-gray-500 italic">"{r.notes}"</p>}
                    </div>
                    {r.score !== null && r.score !== undefined && (
                      <div className="w-full text-left sm:ml-4 sm:w-auto sm:text-center">
                        <div className={`text-2xl font-bold ${r.score >= 80 ? 'text-green-600' : r.score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{r.score}</div>
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
    </div>
  );
}


export const dynamic = 'force-dynamic';
