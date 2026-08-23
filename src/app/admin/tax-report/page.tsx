import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import { DashboardLayout } from '@/components/layout/dashboard';
import { ADMIN_NAV_ITEMS } from '@/components/layout/nav';
import CsvExportButton from '@/components/admin/csv-export-button';

const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

interface ReportRow {
  paymentId: string;
  paidDate: Date;
  teacherId: string;
  teacherName: string;
  teacherTaxId: string;
  courseTitle: string;
  gross: number;
  tax: number;
  netPaid: number;
}

export default async function AdminTaxReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const params = await searchParams;

  // Admin guard — อ่าน role จาก Firestore (session token ไม่มี custom claim)
  const callerDoc = await db.collection(COLLECTIONS.USERS).doc(session.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    redirect('/dashboard');
  }

  const now = new Date();
  const selectedYear = Number(params.year) || now.getFullYear();
  const selectedMonth = params.month !== undefined ? Number(params.month) : now.getMonth(); // 0-11

  // ── โหลด payment ที่หักภาษีแล้วทั้งหมด (filter ปี/เดือน in-memory — เลี่ยง index) ──
  const paymentsSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('status', '==', 'paid')
    .limit(1000)
    .get();

  const rows: ReportRow[] = [];
  for (const doc of paymentsSnap.docs) {
    const d = doc.data() as any;
    const wh = Number(d.taxWithheld) || 0;
    if (wh <= 0 || !d.taxWithheldAt) continue;
    const withheldDate: Date = d.taxWithheldAt?.toDate?.() ?? new Date(d.taxWithheldAt);
    if (withheldDate.getFullYear() !== selectedYear || withheldDate.getMonth() !== selectedMonth) continue;
    rows.push({
      paymentId: doc.id,
      paidDate: d.paidAt?.toDate?.() ?? new Date(d.paidAt),
      teacherId: d.teacherId,
      teacherName: '',
      teacherTaxId: '',
      courseTitle: d.courseTitle || '-',
      gross: Number(d.netAmount) || 0,
      tax: wh,
      netPaid: Number(d.payoutAmount ?? (Number(d.netAmount) - wh)) || 0,
    });
  }
  rows.sort((a, b) => a.paidDate.getTime() - b.paidDate.getTime());

  // ── เติมชื่อ + เลขผู้เสียภาษีของครูแต่ละคน ──
  const teacherIds = Array.from(new Set(rows.map((r) => r.teacherId)));
  const teacherInfo = new Map<string, { name: string; taxId: string }>();
  if (teacherIds.length) {
    const snaps = await db.getAll(...teacherIds.map((id) => db.collection(COLLECTIONS.USERS).doc(id)));
    snaps.forEach((s) => {
      if (s.exists) {
        const d = s.data() as any;
        teacherInfo.set(s.id, { name: d.displayName || '-', taxId: d.taxId || '' });
      }
    });
    rows.forEach((r) => {
      const info = teacherInfo.get(r.teacherId);
      r.teacherName = info?.name || '-';
      r.teacherTaxId = info?.taxId || '';
    });
  }

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalTax = rows.reduce((s, r) => s + r.tax, 0);

  // ตัวเลือกเดือน/ปี
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const monthOptions = MONTHS_TH.map((m, i) => ({ value: String(i), label: m }));

  return (
    <DashboardLayout
      title="รายงานภาษีหัก ณ ที่จ่าย (ภ.ง.ด.53)"
      navItems={ADMIN_NAV_ITEMS}
      role="admin"
      userName={session.displayName || 'Admin'}
    >
      <div className="mb-6 flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Link href="/admin/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-pink-700">
          <ArrowLeft className="h-4 w-4" /> กลับไปแดชบอร์ดแอดมิน
        </Link>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <select name="month" defaultValue={String(selectedMonth)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select name="year" defaultValue={String(selectedYear)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y + 543}</option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700">
            ดูรายงาน
          </button>
        </form>
      </div>

      {/* สรุป */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">รายการที่หักภาษี</p>
          <p className="mt-1 text-xl font-bold">{rows.length} รายการ</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">เงินได้ที่จ่ายรวม</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(totalGross)}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-xs text-emerald-700">ภาษีที่ต้องนำส่งรวม</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(totalTax)}</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
        📌 ยื่น <strong>ภ.ง.ด.53</strong> ประจำเดือน{MONTHS_TH[selectedMonth]} {selectedYear + 543} ภายในวันที่ 7 ของเดือนถัดไป
        (หรือวันที่ 15 หากยื่นอิเล็กทรอนิกส์) พร้อมนำส่งภาษีที่หักได้ {formatCurrency(totalTax)}
      </div>

      {/* ตาราง */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          ไม่พบรายการหักภาษีในเดือนนี้
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-left text-slate-700">
                  <th className="border-b border-slate-200 px-3 py-2.5">#</th>
                  <th className="border-b border-slate-200 px-3 py-2.5">วันที่จ่าย</th>
                  <th className="border-b border-slate-200 px-3 py-2.5">ครูผู้ถูกหัก</th>
                  <th className="border-b border-slate-200 px-3 py-2.5">เลขผู้เสียภาษี</th>
                  <th className="border-b border-slate-200 px-3 py-2.5">คอร์ส</th>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-right">เงินได้</th>
                  <th className="border-b border-slate-200 px-3 py-2.5 text-right">ภาษีหัก</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.paymentId} className="odd:bg-white even:bg-slate-50/60">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.paidDate, 'd/MM/yyyy')}</td>
                    <td className="px-3 py-2">
                      <Link href={`/teachers/${r.teacherId}`} className="font-medium text-pink-700 hover:underline">
                        {r.teacherName}
                      </Link>
                      {!r.teacherTaxId && <span className="ml-1 text-[10px] text-red-500">(ไม่มีเลขภาษี)</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.teacherTaxId || '—'}</td>
                    <td className="px-3 py-2">{r.courseTitle}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{formatCurrency(r.gross)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{formatCurrency(r.tax)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-pink-50 font-bold">
                  <td colSpan={5} className="px-3 py-2.5 text-right">รวม</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{formatCurrency(totalGross)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{formatCurrency(totalTax)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4">
            <CsvExportButton
              filename={`phor-ngor-dor-53-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.csv`}
              headers={['ลำดับ', 'วันที่จ่าย', 'ชื่อครู', 'เลขผู้เสียภาษี', 'คอร์ส', 'เงินได้ที่จ่าย (บาท)', 'ภาษีที่หัก (บาท)']}
              rows={rows.map((r, i) => [
                i + 1,
                formatDate(r.paidDate, 'd/MM/yyyy'),
                r.teacherName,
                r.teacherTaxId,
                r.courseTitle,
                r.gross,
                r.tax,
              ])}
            />
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';