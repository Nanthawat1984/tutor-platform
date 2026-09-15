import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { requireSessionUser } from '@/lib/auth/session';
import PrintButton from '@/components/teacher/print-button';
import CsvExportButton from '@/components/admin/csv-export-button';
import { getCompanyProfile } from '@/lib/company';

// ข้อมูลผู้หักภาษี (บริษัทแพลตฟอร์ม) — ตั้งใน /admin/company หรือ .env

interface CertRow {
  id: string;
  paidDate: Date;
  withheldDate: Date; // วันที่หักภาษี (taxWithheldAt) — คนละวันกับวันจ่ายได้
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

  // ── โปรไฟล์ครู (เลขผู้เสียภาษี / ที่อยู่) + โปรไฟล์บริษัท ──
  const [userSnap, company] = await Promise.all([
    db.collection(COLLECTIONS.USERS).doc(teacherId).get(),
    getCompanyProfile(),
  ]);
  const user = userSnap.exists ? userSnap.data() as any : null;
  const teacherName = session.displayName || user?.displayName || 'คุณครู';
  const teacherTaxId: string = user?.taxId || '';
  // ที่อยู่แยกส่วน (ใหม่) — fallback ไปบรรทัดเดียว (เก่า) ถ้ายังไม่กรอกแยก
  const teacherAddrParts = [
    user?.taxAddrNo || '',
    user?.taxSubdistrict ? `แขวง/ตำบล${user.taxSubdistrict}` : '',
    user?.taxDistrict ? `เขต/อำเภอ${user.taxDistrict}` : '',
    user?.taxProvince || '',
    user?.taxPostcode || '',
  ].filter(Boolean);
  const teacherAddress: string = teacherAddrParts.length > 0 ? teacherAddrParts.join(' ') : (user?.taxAddress || '');
  const isDraft = !teacherTaxId || !company.taxId;

  // ── payment ที่หักภาษีแล้วของปีที่เลือก ──
  const paymentsSnap = await db.collection(COLLECTIONS.PAYMENTS)
    .where('teacherId', '==', teacherId)
    .where('status', '==', 'paid')
    .limit(500)
    .get();

  const allRows: CertRow[] = paymentsSnap.docs.map((doc: any) => {
    const d = doc.data();
    const paidDate: Date = d.paidAt?.toDate?.() ?? new Date(d.paidAt ?? Date.now());
    // วันที่หักภาษีคือวัน release escrow (taxWithheldAt) ไม่ใช่วันจ่าย —
    // ตามกฎหมายต้องยึดวันหัก ไม่ใช่วันโอน
    const withheldDate: Date = d.taxWithheldAt?.toDate?.() ?? paidDate;
    return {
      id: doc.id,
      paidDate,
      withheldDate,
      gross: Number(d.netAmount) || 0,
      tax: Number(d.taxWithheld) || 0,
      netPaid: Number(d.payoutAmount ?? d.netAmount) || 0,
    };
  });

  const years = Array.from(new Set(allRows.map((r) => r.withheldDate.getFullYear()))).sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) years.push(currentYear);
  years.sort((a, b) => b - a);

  const selectedYear = Number(params.year) || years[0] || currentYear;
  const rows = allRows
    .filter((r) => r.withheldDate.getFullYear() === selectedYear && r.tax > 0)
    .sort((a, b) => a.withheldDate.getTime() - b.withheldDate.getTime());

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalTax = rows.reduce((s, r) => s + r.tax, 0);
  const totalNet = rows.reduce((s, r) => s + r.netPaid, 0);
  // แบ่งหน้าละ 25 แถว (A4) — เลขที่เอกสารมีเลขแผ่นกำกับ แผ่นที่ X ในจำนวน Y แผ่น
  const ROWS_PER_PAGE = 25;
  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const docNo = (page: number) =>
    `TF50-${selectedYear + 543}-${teacherId.slice(0, 6).toUpperCase()}${pageCount > 1 ? `-${page}/${pageCount}` : ''}`;

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
          {rows.length > 0 && (
            <CsvExportButton
              filename={`50tawi-${selectedYear}.csv`}
              label="ดาวน์โหลด CSV"
              headers={['ลำดับ', 'วันที่จ่าย', 'เงินได้ที่จ่าย (บาท)', 'ภาษีที่หัก 3% (บาท)', 'ยอดจ่ายสุทธิ (บาท)']}
              rows={rows.map((r, i) => [
                i + 1,
                formatDate(r.paidDate, 'd/MM/yyyy'),
                r.gross,
                r.tax,
                r.netPaid,
              ])}
            />
          )}
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

      {/* ── เอกสาร 50 ทวิ (วนตามจำนวนแผ่น) ── */}
      <div className="mx-auto max-w-4xl space-y-8 px-4 pb-10 print:max-w-none print:space-y-0 print:p-0">
        {Array.from({ length: pageCount }, (_, pageIdx) => {
          const page = pageIdx + 1;
          const pageRows = rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
          return (
        <div key={page} className="print-document break-after-page rounded-xl border border-slate-200 bg-white p-6 shadow-sm last:break-after-avoid print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          {/* ประทับฉบับร่าง — เลขภาษีฝ่ายใดว่างเอกสารใช้ยื่นไม่ได้ */}
          {isDraft && (
            <p className="mb-3 rounded-lg border-2 border-dashed border-red-400 bg-red-50 p-3 text-center text-sm font-extrabold tracking-widest text-red-600 print:bg-white">
              ฉบับร่าง — ยังใช้ยื่นภาษีไม่ได้ (กรุณากรอกเลขประจำตัวผู้เสียภาษีให้ครบ)
            </p>
          )}
          <div className="border-b-2 border-slate-800 pb-3">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs text-slate-500">เลขที่/No. {docNo(page)}</p>
              <p className="text-right text-xs text-slate-500">แบบ 50 ทวิ{pageCount > 1 ? ` — แผ่นที่ ${page} ในจำนวน ${pageCount} แผ่น` : ''}</p>
            </div>
            <h1 className="mt-1 text-center text-lg font-bold text-slate-900">
              หนังสือรับรองการหักภาษี ณ ที่จ่าย
            </h1>
            <p className="text-center text-xs text-slate-500">
              ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร — ใช้ประกอบการยื่นแบบภาษีเงินได้บุคคลธรรมดา
            </p>
          </div>

          {/* ผู้หักภาษี */}
          <div className="mt-5 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย:</span> <span className="font-semibold">{company.name}</span></p>
            <p><span className="text-slate-500">เลขประจำตัวผู้เสียภาษีอากร:</span> <span className="font-mono">{company.taxId || '___________'}</span></p>
            <p className="sm:col-span-2"><span className="text-slate-500">ที่อยู่:</span> {company.address || '___________'}</p>
          </div>

          {/* ผู้ถูกหักภาษี */}
          <div className="mt-4 grid gap-x-8 gap-y-1 border-t border-dashed border-slate-300 pt-4 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">ผู้ถูกหักภาษี ณ ที่จ่าย:</span> <span className="font-semibold">{teacherName}</span></p>
            <p>
              <span className="text-slate-500">เลขประจำตัวผู้เสียภาษีอากร:</span>{' '}
              <span className={`font-mono ${teacherTaxId ? '' : 'text-red-500'}`}>{teacherTaxId || '⚠ ยังไม่ได้กรอก'}</span>
            </p>
            <p className="sm:col-span-2"><span className="text-slate-500">ที่อยู่:</span> {teacherAddress || '—'}</p>
          </div>

          {/* แบบที่นำส่ง + วิธีรับภาระภาษี — ระบบหักจากผู้รับเสมอ */}
          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="font-bold text-slate-700">นำส่งภาษีด้วยแบบ</p>
              <p className="mt-1"><span className="mr-1 inline-block h-3 w-3 border border-slate-500 bg-slate-900 align-middle print:bg-black" />☑ <strong>ภ.ง.ด.53</strong> (หักจากค่าบริการ/ค่าจ้างที่จ่ายให้บุคคลธรรมดา)</p>
              <p className="mt-1 text-slate-400">☐ ภ.ง.ด.3 ☐ ภ.ง.ด.1 ☐ อื่นๆ</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="font-bold text-slate-700">ผู้รับภาระภาษีที่หัก</p>
              <p className="mt-1">☑ <strong>หักจากผู้รับเงิน</strong> (ผู้ถูกหักรับสุทธิหลังหักภาษี)</p>
              <p className="mt-1 text-slate-400">☐ ผู้จ่ายออกภาษีให้ตลอดไป ☐ ผู้จ่ายออกภาษีให้ครั้งเดียว</p>
            </div>
          </div>

          {/* ประเภทเงินได้ — ค่าจ้างครูเข้าข่าย 40(2) หัก 3% */}
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 print:bg-slate-50">
            ประเภทเงินได้พึงประเมิน: <strong>มาตรา 40(2)</strong> เงินได้เนื่องจากหน้าที่หรือตำแหน่งงานที่ทำ
            หรือจากการรับทำงานให้ — หักภาษี ณ ที่จ่ายในอัตราร้อยละ <strong>3</strong> ตามข้อ 6 ของคำสั่งกรมสรรพากร
            ที่ ท.ป. 4/2528 (ค่าสอน/ค่าจ้างทำของที่จ่ายให้บุคคลธรรมดา คราวละ 1,000 บาทขึ้นไป)
          </p>

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
                  <th className="border border-slate-300 px-2 py-2">วัน/เดือน/ปี ที่จ่าย (หักภาษี)</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">จำนวนเงินที่จ่าย</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">ภาษีที่หักและนำส่งไว้</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">จำนวนเงินที่จ่ายสุทธิ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => {
                  const seq = (page - 1) * ROWS_PER_PAGE + i + 1;
                  return (
                  <tr key={r.id} className="odd:bg-white even:bg-slate-50/60">
                    <td className="border border-slate-300 px-2 py-1.5 text-center">{seq}</td>
                    <td className="border border-slate-300 px-2 py-1.5 whitespace-nowrap">{formatDate(r.withheldDate, 'd/MM/yyyy')}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right whitespace-nowrap">{formatCurrency(r.gross)}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-semibold whitespace-nowrap">{formatCurrency(r.tax)}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right whitespace-nowrap">{formatCurrency(r.netPaid)}</td>
                  </tr>
                  );
                })}
              </tbody>
              {page === pageCount && (
              <tfoot>
                <tr className="bg-pink-50 font-bold text-slate-900 print:bg-slate-100">
                  <td colSpan={2} className="border border-slate-300 px-2 py-2 text-right">รวมทั้งสิ้น</td>
                  <td className="border border-slate-300 px-2 py-2 text-right whitespace-nowrap">{formatCurrency(totalGross)}</td>
                  <td className="border border-slate-300 px-2 py-2 text-right whitespace-nowrap">{formatCurrency(totalTax)}</td>
                  <td className="border border-slate-300 px-2 py-2 text-right whitespace-nowrap">{formatCurrency(totalNet)}</td>
                </tr>
              </tfoot>
              )}
            </table>
          )}

          {page === pageCount && (
          <>
          {/* เงื่อนไขตามแบบราชการ */}
          <div className="mt-6 rounded-lg border border-slate-200 p-3 text-[11px] leading-relaxed text-slate-500">
            <p className="font-bold text-slate-700">คำเตือน</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>ผู้มีเงินได้ต้องยื่นรายการเงินได้และภาษีที่ถูกหักไว้นี้รวมกับเงินได้อื่น (ถ้ามี) เพื่อเสียภาษีเงินได้บุคคลธรรมดาประจำปี</li>
              <li>หนังสือรับรองฯ ฉบับนี้จัดทำขึ้น 2 ฉบับ มีข้อความตรงกัน ฉบับที่ 1 สำหรับผู้ถูกหักภาษี ฉบับที่ 2 สำหรับผู้หักภาษีเก็บไว้เป็นหลักฐาน</li>
              <li>กรณีเงินได้ที่จ่ายยังไม่ถึงเกณฑ์ต้องหักภาษี (คราวละไม่ถึง 1,000 บาท) จะไม่ปรากฏในเอกสารฉบับนี้ (ดูหนังสือรับรองรายได้ประกอบ)</li>
            </ol>
          </div>

          {/* ลายเซ็น — วันที่ลงนามต้องเป็นวันหักครั้งสุดท้าย ไม่ใช่วันพิมพ์ */}
          <div className="mt-10 flex justify-end">
            <div className="text-center text-sm">
              <p className="mb-1 text-xs text-slate-500">
                ลงชื่อ .......................................................... ผู้จ่ายเงิน
              </p>
              <p className="mb-8 text-xs text-slate-500">
                วันที่ {rows.length > 0 ? formatDate(rows[rows.length - 1].withheldDate, 'd MMMM yyyy') : formatDate(new Date(), 'd MMMM yyyy')}
              </p>
              <p className="border-t border-slate-400 pt-1 font-semibold">{company.name}</p>
              <p className="text-xs text-slate-500">({company.branch})</p>
            </div>
          </div>

          <p className="mt-6 text-[11px] text-slate-400">
            เลขที่เอกสาร {docNo(page)} •
            อ้างอิงรายการหักภาษี {rows.length} รายการ • สร้างโดยระบบ TutorFinder อัตโนมัติ
          </p>
          </>
          )}
        </div>
          );
        })}
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