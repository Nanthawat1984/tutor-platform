import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

type CardVariant = 'default' | 'gradient' | 'glass' | 'bordered';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: CardVariant;
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantStyles: Record<CardVariant, string> = {
  default:
    'bg-white/85 backdrop-blur border border-violet-100/70 shadow-card',
  gradient:
    'bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200/60 shadow-card',
  glass:
    'bg-white/60 backdrop-blur-xl border border-white/60 shadow-elevated',
  bordered:
    'bg-white border-2 border-violet-200 shadow-sm',
};

const paddingStyles = {
  none: '',
  sm:   'p-4',
  md:   'p-5 sm:p-6',
  lg:   'p-7 sm:p-8',
};

export function Card({
  children,
  className,
  variant = 'default',
  hoverable = false,
  padding = 'md',
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl transition-all duration-250',
        variantStyles[variant],
        paddingStyles[padding],
        hoverable && 'cursor-pointer hover:-translate-y-1 hover:shadow-elevated',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5', className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3 className={cn('text-lg font-bold text-slate-900', className)}>
      {children}
    </h3>
  );
}

export function CardDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn('mt-1 text-sm leading-relaxed text-slate-500', className)}>
      {children}
    </p>
  );
}

export function CardFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mt-5 flex items-center gap-3 border-t border-violet-100/60 pt-5', className)}>
      {children}
    </div>
  );
}

export function CardBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700',
        className
      )}
    >
      {children}
    </span>
  );
}
