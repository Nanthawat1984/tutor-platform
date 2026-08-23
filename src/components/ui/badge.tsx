import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'ghost';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:  'bg-slate-100 text-slate-700 ring-1 ring-slate-200/50',
  primary:  'bg-pink-100 text-pink-600 ring-1 ring-pink-200',
  success:  'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  warning:  'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  danger:   'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
  info:     'bg-sky-100 text-sky-700 ring-1 ring-sky-200',
  outline:  'border-2 border-pink-200 bg-white/80 text-pink-600',
  ghost:    'bg-transparent text-slate-600 border border-slate-200',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-slate-400',
  primary: 'bg-pink-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-rose-500',
  info:    'bg-sky-500',
  outline: 'bg-pink-500',
  ghost:   'bg-slate-400',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', dotColors[variant])} />
      )}
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────
   HELPER BADGES
───────────────────────────────────────── */
export function BookingStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending:   { label: 'รอยืนยัน',   variant: 'warning' },
    confirmed: { label: 'ยืนยันแล้ว', variant: 'success' },
    cancelled: { label: 'ยกเลิก',     variant: 'danger' },
    completed: { label: 'เสร็จสิ้น',  variant: 'info' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'default' };
  return <Badge variant={variant} dot>{label}</Badge>;
}

export function AttendanceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    present: { label: 'มาเรียน',  variant: 'success' },
    absent:  { label: 'ขาดเรียน', variant: 'danger' },
    late:    { label: 'มาสาย',   variant: 'warning' },
    excused: { label: 'ลา',       variant: 'info' },
    pending: { label: 'รอเช็ค',   variant: 'default' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'default' };
  return <Badge variant={variant} dot>{label}</Badge>;
}

export function VerificationBadge({ level }: { level: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    none:  { label: 'ยังไม่ยืนยัน',   variant: 'default' },
    basic: { label: 'ยืนยันพื้นฐาน', variant: 'warning' },
    full:  { label: 'ยืนยันแล้ว',    variant: 'success' },
  };
  const { label, variant } = map[level] ?? { label: level, variant: 'default' };
  return <Badge variant={variant} dot>{label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending:  { label: 'รอชำระเงิน', variant: 'warning' },
    awaiting_review: { label: 'รอตรวจสอบสลิป', variant: 'info' },
    paid:     { label: 'ชำระแล้ว',   variant: 'success' },
    failed:   { label: 'ชำระไม่สำเร็จ', variant: 'danger' },
    refunded: { label: 'คืนเงินแล้ว', variant: 'info' },
    cancelled:{ label: 'ยกเลิก',     variant: 'default' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'default' };
  return <Badge variant={variant} dot>{label}</Badge>;
}
