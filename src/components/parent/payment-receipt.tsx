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
}: PaymentReceiptProps) {
  const printable = status === 'paid' || status === 'refunded';

  return (
    <section className="receipt-print-area rounded-2xl border-2 border-pink-100 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-pink-100 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
            <Receipt className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-extrabold text-slate-900">ใบเสร็จรับเงิน</h2>
            <p className="text-xs text-slate-500">TutorFinder</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${status === 'paid' ? 'bg-emerald-50 text-emerald-700' : status === 'refunded' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">เลขที่อ้างอิง</span>
          <span className="break-all text-right font-mono text-xs font-bold text-slate-700">{reference}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">รายการ</span>
          <span className="text-right font-semibold text-slate-800">{courseTitle || 'คอร์สเรียน'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">นักเรียน</span>
          <span className="text-right font-semibold text-slate-800">{studentName || '-'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">วิธีชำระ</span>
          <span className="text-right font-semibold text-slate-800">{methodLabel}</span>
        </div>
        {lessonDateLabel && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">วันที่เรียน</span>
            <span className="text-right font-semibold text-slate-800">{lessonDateLabel}</span>
          </div>
        )}
        {paidDateLabel && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">วันที่ชำระ</span>
            <span className="text-right font-semibold text-slate-800">{paidDateLabel}</span>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t border-pink-100 pt-3">
          <span className="font-bold text-slate-900">ยอดชำระ</span>
          <span className="text-lg font-extrabold text-pink-700">{formatCurrency(amount)}</span>
        </div>
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
