import { getServerDb } from '@/lib/firebase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { COLLECTIONS } from '@/types/firestore';
import { formatDate, formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { DashboardLayout } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { requireSessionUser } from '@/lib/auth/session';
import { upsertSessionReport } from '@/lib/session-report';
import { hasPresentAttendance } from '@/lib/session-report';
import { ClipboardList, FileCheck2 } from 'lucide-react';

// หน้าครูเขียน/แก้รายงานผลการเรียนรายเซสชัน — เข้าจากปุ่มในหน้าเช็คชื่อ
// เงื่อนไข: ต้องเป็นครูเจ้าของ booking + เช็คชื่อ "มา" แล้วเท่านั้น
// บันทึกผ่าน upsertSessionReport (กันซ้ำ + แจ้งผู้ปกครอง in-app + LINE)

export default async function SessionReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const { bookingId } = await params;
  const { error } = await searchParams;

  const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
  if (!bookingSnap.exists) notFound();
  const booking = { id: bookingSnap.id, ...bookingSnap.data() } as any;
  if (booking.teacherId !== session.uid) redirect('/attendance');

  const attended = await hasPresentAttendance(db, bookingId);
  if (!attended) {
    return (
      <DashboardLayout
        title="รายงานผลการเรียน"
        navItems={TEACHER_NAV_ITEMS}
        role="teacher"
        userName={session.displayName || 'คุณครู'}
      >
        <div className="mx-auto max-w-2xl">
          <Link href="/attendance" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-pink-700">
            ← กลับหน้าเช็คชื่อ
          </Link>
          <Card className="py-10 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 font-bold text-slate-900">ยังเช็คชื่อ "มา" ไม่ได้</p>
            <p className="mt-1 text-sm text-slate-500">เขียนรายงานได้หลังกดเช็คชื่อนักเรียน "มา" ในหน้าเช็คชื่อก่อน</p>
            <Link href="/attendance" className="mt-4 inline-block">
              <Button size="sm" variant="outline">ไปหน้าเช็คชื่อ</Button>
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // โหลดรายงานเดิม (ถ้ามี) เพื่อแสดงในฟอร์มสำหรับแก้ไข
  const existingSnap = await db.collection(COLLECTIONS.SESSION_REPORTS)
    .where('bookingId', '==', bookingId)
    .limit(1)
    .get();
  const existing = existingSnap.docs[0]?.data() as any | undefined;

  async function saveReport(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireSessionUser()).uid;

    const result = await upsertSessionReport(dbRef, {
      bookingId,
      teacherId: current,
      report: {
        topicsCovered: String(formData.get('topicsCovered') || ''),
        homework: String(formData.get('homework') || ''),
        notes: String(formData.get('notes') || ''),
        score: formData.get('score') ? Number(formData.get('score')) : null,
      },
    });

    if (!result.ok) {
      redirect(`/attendance/report/${bookingId}?error=${encodeURIComponent(result.error)}`);
    }
    redirect(`/attendance?date=${encodeURIComponent(booking.bookingDate)}&reported=1`);
  }

  const errorTh: Record<string, string> = {
    attendance_missing: 'ต้องเช็คชื่อ "มา" ก่อนเขียนรายงาน',
    invalid_input: 'กรุณากรอกอย่างน้อยหนึ่งฟิลด์ (หรือคะแนนต้องอยู่ระหว่าง 0-100)',
    forbidden: 'คุณไม่มีสิทธิ์เขียนรายงานการจองนี้',
    not_found: 'ไม่พบการจองนี้',
  };

  return (
    <DashboardLayout
      title="รายงานผลการเรียน"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <div className="mx-auto max-w-2xl space-y-5">
        <Link href={`/attendance?date=${encodeURIComponent(booking.bookingDate)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-pink-700">
          ← กลับหน้าเช็คชื่อ
        </Link>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pink-100 pb-4">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-pink-600" />
              <h2 className="font-extrabold text-slate-900">
                {existing ? 'แก้ไขรายงาน' : 'เขียนรายงาน'} — {booking.studentName || 'นักเรียน'}
              </h2>
            </div>
            {existing && <span className="text-xs font-semibold text-emerald-600">มีรายงานแล้ว — แก้ไขได้</span>}
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {booking.courseTitle} • {formatDate(booking.bookingDate, 'd MMMM yyyy')} • {formatTime(booking.startTime)} - {formatTime(booking.endTime)} น.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            ผู้ปกครองจะได้รับแจ้งทันทีที่บันทึก — เห็นได้จากหน้า "ผลการเรียน" ของเขา
          </p>
        </Card>

        {error && errorTh[error] && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            ⚠ {errorTh[error]}
          </p>
        )}

        <form action={saveReport} className="space-y-5">
          <Card className="space-y-4">
            <Textarea
              label="เรื่องที่สอนวันนี้"
              name="topicsCovered"
              defaultValue={existing?.topicsCovered || ''}
              placeholder="เช่น เรื่องสมการพหุนิด แบบฝึกหัดหน้า 45-48"
              helperText="สรุปสั้น ๆ ว่าวันนี้สอนอะไร"
            />
            <Textarea
              label="การบ้าน / สิ่งที่ต้องทำต่อ"
              name="homework"
              defaultValue={existing?.homework || ''}
              placeholder="เช่น ทำข้อ 1-10 หน้า 49 ส่งก่อนคาบหน้า"
            />
            <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
              <Input
                label="คะแนนวันนี้ (0-100 ไม่บังคับ)"
                name="score"
                type="number"
                min={0}
                max={100}
                defaultValue={existing?.score ?? ''}
                placeholder="เช่น 85"
              />
              <Textarea
                label="โน้ตถึงผู้ปกครอง (ไม่บังคับ)"
                name="notes"
                defaultValue={existing?.notes || ''}
                placeholder="เช่น วันนี้เข้าใจเร็วมาก แนะนำให้ฝึกทบทวนสูตรก่อนนอน"
              />
            </div>
          </Card>

          <div className="responsive-actions">
            <Button type="submit" className="w-full sm:w-auto">
              {existing ? 'บันทึกการแก้ไข' : 'ส่งรายงานให้ผู้ปกครอง'}
            </Button>
            <Link href={`/attendance?date=${encodeURIComponent(booking.bookingDate)}`} className="w-full sm:w-auto">
              <Button type="button" variant="outline" className="w-full sm:w-auto">ยกเลิก</Button>
            </Link>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
