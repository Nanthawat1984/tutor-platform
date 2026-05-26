import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  info: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  outline: 'border border-blue-200 bg-white/70 text-slate-600',
};

export function Badge({ variant = 'default', children, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

// Helper: map booking status → badge variant
export function BookingStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    pending: { label: 'รอยืนยัน', variant: 'warning' },
    confirmed: { label: 'ยืนยันแล้ว', variant: 'success' },
    cancelled: { label: 'ยกเลิก', variant: 'danger' },
    completed: { label: 'เสร็จสิ้น', variant: 'info' },
  };
  const { label, variant } = map[status] || { label: status, variant: 'default' };
  return <Badge variant={variant}>{label}</Badge>;
}

export function AttendanceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    present: { label: 'มาเรียน', variant: 'success' },
    absent: { label: 'ขาดเรียน', variant: 'danger' },
    late: { label: 'มาสาย', variant: 'warning' },
    excused: { label: 'ลา', variant: 'info' },
    pending: { label: 'รอเช็ค', variant: 'default' },
  };
  const { label, variant } = map[status] || { label: status, variant: 'default' };
  return <Badge variant={variant}>{label}</Badge>;
}

export function VerificationBadge({ level }: { level: string }) {
  const map: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    none: { label: 'ยังไม่ยืนยัน', variant: 'default' },
    basic: { label: 'ยืนยันพื้นฐาน', variant: 'warning' },
    full: { label: 'ยืนยันแล้ว', variant: 'success' },
  };
  const { label, variant } = map[level] || { label: level, variant: 'default' };
  return <Badge variant={variant}>{label}</Badge>;
}
