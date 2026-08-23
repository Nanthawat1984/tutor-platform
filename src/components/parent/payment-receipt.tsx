import Link from 'next/link';
import { Receipt, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PrintButton from '@/components/teacher/print-button';
import { formatCurrency } from '@/lib/utils';

export interface PaymentReceiptProps {
  reference: string;
  courseTitle: string;
  studentName: string;
  methodLabel: string;
  amount: number;
  paidDateLabel?: string;
  lessonDateLabel?: string;
  status: 'paid' | 'refunded' | 'awaiting_review' | 'pending';
  receiptHref?: string;
  sellerName?: string;
  sellerTaxId?: string;
  sellerAddress?: string;
  sellerBranch?: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerAddress?: string;
  vatRegistered?: boolean;
  vatAmount?: number;
}

const STATUS_LABEL: Record<PaymentReceiptProps['status'], string> = {
  paid: 'ชำระแล้ว',
  refunded: 'คืนเงินแล้ว',
  awaiting_review: 'รอตรวจสอบสลิป',
  pending: 'รอชำระเงิน',
};

export default function PaymentReceipt({
  reference,
  courseTitle,
  studentName,
  methodLabel,
  amount,
  paidDateLabel,
  lessonDateLabel,
  status,
  receiptHref,
  sellerName = process.env.COMPANY_NAME || 'บริษัท TutorFinder จำกัด',
  sellerTaxId = process.env.COMPANY_TAX_ID || '',
  sellerAddress = process.env.COMPANY_ADDRESS || '',
  sellerBranch = process.env.COMPANY_BRANCH || 'สำนักงานใหญ่',
  buyerName,
  buyerEmail,
  buyerAddress,
  vatRegistered = process.env.COMPANY_VAT_REGISTERED === 'true',
  vatAmount,
}: PaymentReceiptProps) {
  const printable = status === 'paid' || status === 'refunded';
  const taxInvoiceReady = vatRegistered && Boolean(sellerTaxId) && typeof vatAmount === 'number';
  const title = taxInvoiceReady ? 'ใบกำกับภาษี / ใบเสร็จรับเงิน' : 'ใบเสร็จรับเงิน';
  const subtotal = typeof vatAmount === 'number' ? amount - vatAmount : amount;

  return (
    <section className="receipt-a4-document receipt-print-area rounded-2xl border-2 border-pink-100 bg-white p-5 shadow-sm sm:p-7">
      <div className="border-b-2 border-slate-900 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-pink-600 print:bg-transparent">
                <Receipt className="h-5 w-5" />
              </span>
              <h1 className="text-xl font-extrabold text-slate-900">{sellerName}</h1>
            </div>
            <p className="mt-2 max-w-xl text-xs leading-5 text-slate-600">ที่อยู่: {sellerAddress || 'ยังไม่ได้ตั้งค่าที่อยู่ผู้ขาย'}</p>
            <p className="text-xs text-slate-600">เลขประจำตัวผู้เสียภาษีอากร: {sellerTaxId || 'ยังไม่ได้ตั้งค่า'} • สาขา: {sellerBranch}</p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
            <p className="mt-1 text-xs text-slate-600">เลขที่เอกสาร: <span className="font-mono font-bold">{reference}</span></p>
            {paidDateLabel && <p className="text-xs text-slate-600">วันที่ออกเอกสาร: {paidDateLabel}</p>}
            <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-bold ${status === 'paid' ? 'bg-emerald-50 text-emerald-700' : status === 'refunded' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
              {STATUS_LABEL[status]}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-lg border border-slate-300 p-3 text-xs sm:grid-cols-2">
        <div>
          <p className="font-bold text-slate-800">ผู้ซื้อ / ผู้รับบริการ</p>
          <p className="mt-1 text-slate-600">ชื่อ: {buyerName || studentName || 'ไม่ได้ระบุ'}</p>
          {buyerEmail && <p className="text-slate-600">อีเมล: {buyerEmail}</p>}
          <p className="text-slate-600">ที่อยู่: {buyerAddress || 'ไม่ได้แจ้งที่อยู่'}</p>
        </div>
        <div className="sm:border-l sm:border-slate-200 sm:pl-3">
          <p className="font-bold text-slate-800">ข้อมูลการชำระเงิน</p>
          <p className="mt-1 text-slate-600">วิธีชำระ: {methodLabel}</p>
          {lessonDateLabel && <p className="text-slate-600">วันที่ให้บริการ: {lessonDateLabel}</p>}
          <p className="text-slate-600">นักเรียน: {studentName || '-'}</p>
        </div>
      </div>

      <table className="mt-5 w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100 text-slate-800 print:bg-slate-100">
            <th className="w-12 border border-slate-300 px-2 py-2 text-center">ลำดับ</th>
            <th className="border border-slate-300 px-2 py-2 text-left">รายการบริการ</th>
            <th className="w-24 border border-slate-300 px-2 py-2 text-center">จำนวน</th>
            <th className="w-32 border border-slate-300 px-2 py-2 text-right">ราคาต่อหน่วย</th>
            <th className="w-32 border border-slate-300 px-2 py-2 text-right">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-slate-300 px-2 py-5 text-center">1</td>
            <td className="border border-slate-300 px-2 py-5 font-semibold text-slate-800">
              ค่าบริการเรียนเสริม: {courseTitle || 'คอร์สเรียน'}
              <span className="mt-1 block font-normal text-slate-500">นักเรียน: {studentName || '-'}</span>
            </td>
            <td className="border border-slate-300 px-2 py-5 text-center">1</td>
            <td className="border border-slate-300 px-2 py-5 text-right">{formatCurrency(amount)}</td>
            <td className="border border-slate-300 px-2 py-5 text-right font-semibold">{formatCurrency(amount)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-sm space-y-2 text-xs">
          <div className="flex justify-between"><span>รวมก่อนภาษีมูลค่าเพิ่ม</span><span>{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between"><span>ภาษีมูลค่าเพิ่ม</span><span>{typeof vatAmount === 'number' ? formatCurrency(vatAmount) : vatRegistered ? 'รอตั้งค่าอัตรา VAT' : 'ไม่คำนวณ VAT'}</span></div>
          <div className="flex justify-between border-t-2 border-slate-800 pt-2 text-base font-extrabold"><span>ยอดรวมทั้งสิ้น</span><span>{formatCurrency(amount)}</span></div>
        </div>
      </div>

      {!vatRegistered && (
        <p className="mt-5 rounded border border-amber-200 bg-amber-50 p-2 text-[10px] leading-4 text-amber-800 print:border-slate-300 print:bg-white print:text-slate-600">
          เอกสารนี้เป็นใบเสร็จรับเงิน/หลักฐานการชำระเงิน ไม่ใช่ใบกำกับภาษีมูลค่าเพิ่ม เนื่องจากยังไม่ได้ตั้งค่าข้อมูลการจด VAT ของผู้ขาย
        </p>
      )}

      <div className="mt-10 flex justify-between gap-8 text-center text-xs text-slate-600">
        <div className="w-48 border-t border-slate-400 pt-2">ผู้รับเงิน / ผู้จัดทำเอกสาร</div>
        <div className="w-48 border-t border-slate-400 pt-2">ผู้ซื้อ / ผู้รับบริการ</div>
      </div>

      {printable && (
        <div className="mt-6 flex flex-col gap-2 border-t border-pink-100 pt-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            เอกสารนี้แสดงเฉพาะข้อมูลการชำระเงินของคุณ
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <PrintButton label="พิมพ์ / บันทึก PDF" />
            {receiptHref && (
              <Link href={receiptHref}>
                <Button variant="outline" className="w-full sm:w-auto">เปิดหน้าใบเสร็จ</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
