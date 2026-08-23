import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import PrintButton from '@/components/teacher/print-button';
import { PAYMENT_METHODS } from '@/lib/payments/config';

interface TaxDocPayment {
  id: string;
  paidAtMs: number;
  paidDate: Date;
  studentName: string;
  courseTitle: string;
  methodLabel: string;
  amount: number;
  netAmount: number;
  fee: number;
}

export default async function TaxDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;
  const params = await searchParams;

  // ── โหลด payment ที่จ่ายแล้วทั้งหมดของครู ──
  const paymentsSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('teacherId', '==', teacherId)
    .where('status', '==', 'paid')
    .limit(500)
    .get();

  const allPayments: TaxDocPayment[] = paymentsSnap.docs.map((doc: any) => {
    const d = doc.data();
    const paidDate: Date = d.paidAt?.toDate?.() ?? new Date(d.paidAt ?? Date.now());
    const amount = Number(d.amount) || 0;
    const netAmount = Number(d.netAmount) || 0;
    return {
      id: doc.id,
      paidAtMs: paidDate.getTime(),
      paidDate,
      studentName: d.studentName || '-',
      courseTitle: d.courseTitle || 'คอร์สเรียน',
      methodLabel: PAYMENT_METHODS.find((m) => m.id === d.method)?.label || d.method || '-',
      amount,
      netAmount,
      fee: Math.max(amount - netAmount, 0),
    };
  });

  // ── รายการปีที่มีรายได้ (สำหรับตัวเลือกปีภาษี) ──
  const years = Array.from(new Set(allPayments.map((p) => p.paidDate.getFullYear()))).sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) years.push(currentYear);
  years.sort((a, b) => b - a);

  const selectedYear = Number(params.year) || years[0] || currentYear;

  // ── กรองเฉพาะปีที่เลือก + เรียงตามวันที่ ──
  const yearPayments = allPayments
    .filter((p) => p.paidDate.getFullYear() === selectedYear)
    .sort((a, b) => a.paidAtMs - b.paidAtMs);

  const totalGross = yearPayments.reduce((s, p) => s + p.amount, 0);
  const totalFee = yearPayments.reduce((s, p) => s + p.fee, 0);
  const totalNet = yearPayments.reduce((s, p) => s + p.netAmount, 0);

  const generatedAt = formatDate(new Date(), 'd MMMM yyyy');
  const teacherName = session.displayName || 'คุณครู';

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Toolbar — ซ่อนตอนพิมพ์ */}
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Link href="/earnings" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-pink-700">
          <ArrowLeft className="h-4 w-4" /> กลับไปหน้ารายได้
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">ปีภาษี:</span>
          {years.map((y) => (
            <Link
              key={y}
              href={`/earnings/tax-document?year=${y}`}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                y === selectedYear
                  ? 'border-pink-300 bg-pink-50 text-pink-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-pink-200'
              }`}
            >
              {y + 543}
            </Link>
          ))}
          <PrintButton />
        </div>
      </div>

      {/* ลิงก์ไป 50 ทวิ */}
      <div className="mx-auto mb-4 max-w-4xl print:hidden">
        <Link
          href="/earnings/tax-certificate"
          className="block rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
        >
          🧾 ดู/พิมพ์หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)
        </Link>
      </div>

      {/* ── เอกสาร ── */}
      <div className="mx-auto max-w-4xl px-4 pb-10 print:max-w-none print:p-0">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          {/* Header */}
          <div className="flex flex-col gap-1 border-b-2 border-slate-800 pb-4 text-center">
            <h1 className="text-xl font-bold tracking-wide text-slate-900">TUTORFINDER</h1>
            <p className="text-xs text-slate-500">แพลตฟอร์มเรียนเสริมพิเศษ — tutorfinder.pilotai.space</p>
            <h2 className="mt-3 text-lg font-bold text-slate-900">
              หนังสือรับรองรายได้ / สรุปรายได้เพื่อประกอบการยื่นภาษี
            </h2>
            <p className="text-sm text-slate-600">ปีภาษี {selectedYear + 543} (พ.ศ.)</p>
          </div>

          {/* Teacher info */}
          <div className="mt-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">ชื่อผู้สอน:</span> <span className="font-semibold">{teacherName}</span></p>
            <p><span className="text-slate-500">รหัสผู้ใช้แพลตฟอร์ม:</span> <span className="font-mono text-xs">{teacherId}</span></p>
            <p><span className="text-slate-500">จำนวนรายการ:</span> {yearPayments.length} รายการ</p>
            <p><span className="text-slate-500">ออกเอกสารเมื่อ:</span> {generatedAt}</p>
          </div>

          {/* Table */}
          {yearPayments.length === 0 ? (
            <p className="mt-8 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              ไม่พบรายการรายได้ในปีภาษี {selectedYear + 543}
            </p>
          ) : (
            <table className="mt-6 w-full border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-left text-slate-700 print:bg-slate-100">
                  <th className="border border-slate-300 px-2 py-2 text-center">#</th>
                  <th className="border border-slate-300 px-2 py-2">วันที่ชำระ</th>
                  <th className="border border-slate-300 px-2 py-2">คอร์สเรียน</th>
                  <th className="border border-slate-300 px-2 py-2 hidden sm:table-cell">ผู้ชำระ</th>
                  <th className="border border-slate-300 px-2 py-2 hidden md:table-cell">ช่องทาง</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">ยอดชำระ</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">ค่าบริการ</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">รับสุทธิ</th>
                </tr>
              </thead>
              <tbody>
                {yearPayments.map((p, i) => (
                  <tr key={p.id} className="odd:bg-white even:bg-slate-50/60">
                    <td className="border border-slate-300 px-2 py-1.5 text-center">{i + 1}</td>
                    <td className="border border-slate-300 px-2 py-1.5 whitespace-nowrap">{formatDate(p.paidDate, 'd/MM/yyyy')}</td>
                    <td className="border border-slate-300 px-2 py-1.5">{p.courseTitle}</td>
                    <td className="border border-slate-300 px-2 py-1.5 hidden sm:table-cell">{p.studentName}</td>
                    <td className="border border-slate-300 px-2 py-1.5 hidden md:table-cell">{p.methodLabel}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right whitespace-nowrap">{formatCurrency(p.amount)}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right whitespace-nowrap text-slate-500">-{formatCurrency(p.fee)}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-semibold whitespace-nowrap">{formatCurrency(p.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-pink-50 font-bold text-slate-900 print:bg-slate-100">
                  <td colSpan={5} className="border border-slate-300 px-2 py-2 text-right">รวมทั้งสิ้น</td>
                  <td className="border border-slate-300 px-2 py-2 text-right whitespace-nowrap">{formatCurrency(totalGross)}</td>
                  <td className="border border-slate-300 px-2 py-2 text-right whitespace-nowrap">-{formatCurrency(totalFee)}</td>
                  <td className="border border-slate-300 px-2 py-2 text-right whitespace-nowrap">{formatCurrency(totalNet)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          {/* Summary box */}
          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">รายได้รวม (ก่อนหัก)</p>
              <p className="mt-1 font-bold">{formatCurrency(totalGross)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">ค่าบริการแพลตฟอร์ม 20%</p>
              <p className="mt-1 font-bold text-slate-500">-{formatCurrency(totalFee)}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 print:bg-white">
              <p className="text-xs text-emerald-700">รายได้สุทธิที่ได้รับ</p>
              <p className="mt-1 font-bold text-emerald-700">{formatCurrency(totalNet)}</p>
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-8 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-400">
            <p>
              เอกสารนี้จัดทำขึ้นโดยระบบ TutorFinder เพื่อสรุปรายได้ที่ได้รับผ่านแพลตฟอร์มในปีภาษี {selectedYear + 543}
              เท่านั้น มิใช่ใบกำกับภาษีหรือใบเสร็จรับเงินตามกฎหมาย โปรดใช้ประกอบการยื่นแบบภาษี
              ร่วมกับเอกสารหลักฐานอื่นที่เกี่ยวข้อง และปรึกษาผู้มีความรู้ทางภาษีหากจำเป็น
            </p>
            <p className="mt-1">ออกเอกสารเมื่อ {generatedAt} • เอกสารฉบับนี้สร้างโดยระบบอัตโนมัติ</p>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A4; margin: 12mm; }
              body { background: white !important; }
            }
          `,
        }}
      />
    </div>
  );
}

export const dynamic = 'force-dynamic';
