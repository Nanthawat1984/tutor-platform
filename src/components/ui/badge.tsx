import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  outline: 'border border-gray-300 text-gray-600',
};

export function Badge({ variant = 'default', children, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
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
