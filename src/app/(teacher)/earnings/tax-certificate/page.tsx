import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import PrintButton from '@/components/teacher/print-button';

// ข้อมูลผู้หักภาษี (บริษัทแพลตฟอร์ม) — ตั้งค่าจริงใน .env
const COMPANY_NAME = process.env.COMPANY_NAME || 'บริษัท TutorFinder จำกัด';
const COMPANY_TAX_ID = process.env.COMPANY_TAX_ID || '';
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || '';
const COMPANY_BRANCH = process.env.COMPANY_BRANCH || 'สำนักงานใหญ่';

interface CertRow {
  id: string;
  paidDate: Date;
  gross: number;      // เงินได้สุทธิที่จ่ายให้ครู (netAmount)
  tax: number;        // ภาษีที่หัก 3%
  netPaid: number;    // ยอดจ่ายจริง
}

export default async function TaxCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;
  const params = await searchParams;

  // ── โปรไฟล์ครู (เลขผู้เสียภาษี / ที่อยู่) ──
  const userSnap = await db.collection(COLLECTIONS.USERS).doc(teacherId).get();
  const user = userSnap.exists ? userSnap.data() as any : null;
  const teacherName = session.displayName || user?.displayName || 'คุณครู';
  const teacherTaxId: string = user?.taxId || '';
  const teacherAddress: string = user?.taxAddress || '';

  // ── payment ที่หักภาษีแล้วของปีที่เลือก ──
  const paymentsSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('teacherId', '==', teacherId)
    .where('status', '==', 'paid')
    .limit(500)
    .get();

  const allRows: CertRow[] = paymentsSnap.docs.map((doc: any) => {
    const d = doc.data();
    const paidDate: Date = d.paidAt?.toDate?.() ?? new Date(d.paidAt ?? Date.now());
    return {
      id: doc.id,
      paidDate,
      gross: Number(d.netAmount) || 0,
      tax: Number(d.taxWithheld) || 0,
      netPaid: Number(d.payoutAmount ?? d.netAmount) || 0,
    };
  });

  const years = Array.from(new Set(allRows.map((r) => r.paidDate.getFullYear()))).sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) years.push(currentYear);
  years.sort((a, b) => b - a);

  const selectedYear = Number(params.year) || years[0] || currentYear;
  const rows = allRows
    .filter((r) => r.paidDate.getFullYear() === selectedYear && r.tax > 0)
    .sort((a, b) => a.paidDate.getTime() - b.paidDate.getTime());

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalTax = rows.reduce((s, r) => s + r.tax, 0);
  const totalNet = rows.reduce((s, r) => s + r.netPaid, 0);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Toolbar */}
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Link href="/earnings" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-pink-700">
          <ArrowLeft className="h-4 w-4" /> กลับไปหน้ารายได้
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">ปีภาษี:</span>
          {years.map((y) => (
            <Link
              key={y}
              href={`/earnings/tax-certificate?year=${y}`}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                y === selectedYear ? 'border-pink-300 bg-pink-50 text-pink-700' : 'border-slate-200 bg-white text-slate-600 hover:border-pink-200'
              }`}
            >
              {y + 543}
            </Link>
          ))}
          <PrintButton label="พิมพ์ 50 ทวิ / บันทึก PDF" />
        </div>
      </div>

      {!teacherTaxId && (
        <div className="mx-auto mb-4 max-w-4xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 print:hidden">
          ⚠️ ยังไม่ได้กรอก{' '}
          <Link href="/profile/edit" className="font-semibold underline">
            เลขประจำตัวผู้เสียภาษี/ที่อยู่
          </Link>{' '}
          — เอกสาร 50 ทวิ จะไม่สมบูรณ์จนกว่าจะกรอกข้อมูลนี้
        </div>
      )}

      {/* ── เอกสาร 50 ทวิ ── */}
      <div className="mx-auto max-w-4xl px-4 pb-10 print:max-w-none print:p-0">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          <div className="border-b-2 border-slate-800 pb-3">
            <p className="text-right text-xs text-slate-500">แบบ 50 ทวิ</p>
            <h1 className="mt-1 text-center text-lg font-bold text-slate-900">
              หนังสือรับรองการหักภาษี ณ ที่จ่าย
            </h1>
            <p className="text-center text-xs text-slate-500">
              (เอกสารสำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้ประกอบการยื่นแบบภาษีเงินได้บุคคลธรรมดา)
            </p>
          </div>

          {/* ผู้หักภาษี */}
          <div className="mt-5 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">ผู้หักภาษี:</span> <span className="font-semibold">{COMPANY_NAME}</span></p>
            <p><span className="text-slate-500">เลขประจำตัวผู้เสียภาษี:</span> <span className="font-mono">{COMPANY_TAX_ID || '___________'}</span></p>
            <p className="sm:col-span-2"><span className="text-slate-500">ที่อยู่:</span> {COMPANY_ADDRESS || '___________'}</p>
          </div>

          {/* ผู้ถูกหักภาษี */}
          <div className="mt-4 grid gap-x-8 gap-y-1 border-t border-dashed border-slate-300 pt-4 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">ผู้ถูกหักภาษี:</span> <span className="font-semibold">{teacherName}</span></p>
            <p>
              <span className="text-slate-500">เลขประจำตัวผู้เสียภาษี:</span>{' '}
              <span className={`font-mono ${teacherTaxId ? '' : 'text-red-500'}`}>{teacherTaxId || '⚠ ยังไม่ได้กรอก'}</span>
            </p>
            <p className="sm:col-span-2"><span className="text-slate-500">ที่อยู่:</span> {teacherAddress || '—'}</p>
          </div>

          {/* ตาราง */}
          {rows.length === 0 ? (
            <p className="mt-8 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              ไม่พบรายการที่มีการหักภาษี ณ ที่จ่ายในปีภาษี {selectedYear + 543}
            </p>
          ) : (
            <table className="mt-6 w-full border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 text-left text-slate-700 print:bg-slate-100">
                  <th className="border border-slate-300 px-2 py-2 text-center">#</th>
                  <th className="border border-slate-300 px-2 py-2">วันที่จ่าย</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">เงินได้ที่จ่าย</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">ภาษีที่หัก (3%)</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">ยอดจ่ายสุทธิ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="odd:bg-white even:bg-slate-50/60">
                    <td className="border border-slate-300 px-2 py-1.5 text-center">{i + 1}</td>
                    <td className="border border-slate-300 px-2 py-1.5 whitespace-nowrap">{formatDate(r.paidDate, 'd/MM/yyyy')}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right whitespace-nowrap">{formatCurrency(r.gross)}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-semibold whitespace-nowrap">{formatCurrency(r.tax)}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right whitespace-nowrap">{formatCurrency(r.netPaid)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-pink-50 font-bold text-slate-900 print:bg-slate-100">
                  <td colSpan={2} className="border border-slate-300 px-2 py-2 text-right">รวมทั้งสิ้น</td>
                  <td className="border border-slate-300 px-2 py-2 text-right whitespace-nowrap">{formatCurrency(totalGross)}</td>
                  <td className="border border-slate-300 px-2 py-2 text-right whitespace-nowrap">{formatCurrency(totalTax)}</td>
                  <td className="border border-slate-300 px-2 py-2 text-right whitespace-nowrap">{formatCurrency(totalNet)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          {/* ลายเซ็น */}
          <div className="mt-10 flex justify-end">
            <div className="text-center text-sm">
              <p className="mb-12 text-slate-600">ขอแสดงความนับถือ</p>
              <p className="border-t border-slate-400 pt-1 font-semibold">{COMPANY_NAME}</p>
              <p className="text-xs text-slate-500">({COMPANY_BRANCH})</p>
            </div>
          </div>

          <p className="mt-6 text-[11px] text-slate-400">
            เอกสารฉบับนี้สร้างโดยระบบ TutorFinder อัตโนมัติ เมื่อ {formatDate(new Date(), 'd MMMM yyyy')} •
            ปีภาษี {selectedYear + 543} • อ้างอิงรายการชำระ {rows.length} รายการ
          </p>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A4; margin: 15mm; }
              body { background: white !important; }
            }
          `,
        }}
      />
    </div>
  );
}

export const dynamic = 'force-dynamic';