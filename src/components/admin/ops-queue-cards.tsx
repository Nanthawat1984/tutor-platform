import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Eye } from 'lucide-react';
import type { OpsQueueCard, OpsQueueSummary, QueueSeverity } from '@/lib/admin/ops-queues';

/**
 * การ์ดคิวงานค้างของแอดมิน
 *
 * อ่านจาก props ที่เซิร์ฟเวอร์โหลดมาให้แล้ว (ไม่มี fetch ฝั่ง client) เพื่อให้ตัวเลข
 * ตรงกับ /api/admin/ops-snapshot ตลอด และเปิดหน้าแล้วเห็นเลย ไม่ต้องรอโหลด
 */

const SEVERITY_STYLE: Record<QueueSeverity, { card: string; badge: string; dot: string }> = {
  action: {
    card: 'border-red-200 bg-red-50/70',
    badge: 'bg-red-500 text-white',
    dot: 'bg-red-500',
  },
  watch: {
    card: 'border-amber-200 bg-amber-50/60',
    badge: 'bg-amber-500 text-white',
    dot: 'bg-amber-500',
  },
  idle: {
    card: 'border-emerald-200 bg-emerald-50/50',
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
  },
};

const SEVERITY_LABEL: Record<QueueSeverity, string> = {
  action: 'ต้องลงมือ',
  watch: 'เฝ้าระวัง',
  idle: 'ปกติ',
};

function QueueCard({ queue }: { queue: OpsQueueCard }) {
  const style = SEVERITY_STYLE[queue.severity];
  const actionable = queue.count > 0;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{queue.label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{queue.description}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}
        >
          {SEVERITY_LABEL[queue.severity]}
        </span>
      </div>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className={`text-2xl font-extrabold tracking-tight ${queue.severity === 'action' ? 'text-red-600' : 'text-slate-900'}`}>
          {queue.count}
        </span>
        <span className="text-xs text-slate-400">รายการ</span>
        {!actionable && (
          <span className="ml-auto text-emerald-600" aria-label="ไม่มีรายการค้าง">
            <CheckCircle2 className="h-4 w-4" />
          </span>
        )}
      </p>

      {actionable && (
        <p className="mt-1 text-[11px] text-slate-400">
          แจ้งเตือนเมื่อครบ {queue.watchAt} · ต้องลงมือเมื่อครบ {queue.actionAt}
        </p>
      )}

      {actionable && queue.actionHref && (
        <span className="mt-3 flex items-center gap-1 text-xs font-bold text-pink-600">
          ไปจัดการ
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      )}
      {actionable && !queue.actionHref && (
        <span className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-400">
          <Eye className="h-3.5 w-3.5" />
          ระบบแจ้งเตือนอัตโนมัติเมื่อค้างมาก
        </span>
      )}
    </>
  );

  const className = `rounded-2xl border p-4 transition-all ${style.card} ${
    actionable && queue.actionHref ? 'hover:-translate-y-0.5 hover:shadow-card' : ''
  }`;

  if (!actionable || !queue.actionHref) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Link href={queue.actionHref} className={`block ${className}`}>
      {body}
    </Link>
  );
}

export default function OpsQueueCards({
  queues,
  summary,
}: {
  queues: OpsQueueCard[];
  summary: OpsQueueSummary;
}) {
  return (
    <section aria-labelledby="ops-queue-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="ops-queue-heading" className="text-base font-bold text-slate-900">
          คิวงานที่ต้องติดตาม
        </h2>
        {summary.action > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {summary.action} คิวต้องลงมือ ({summary.actionCount} รายการ)
          </span>
        ) : summary.watch > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
            <Clock className="h-3.5 w-3.5" />
            {summary.watch} คิวที่ควรเฝ้าระวัง
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            ไม่มีงานค้าง
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {queues.map((queue) => (
          <QueueCard key={queue.key} queue={queue} />
        ))}
      </div>
    </section>
  );
}