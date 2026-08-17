'use client';

import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-button ' +
    'hover:from-violet-700 hover:to-purple-700 hover:shadow-elevated hover:-translate-y-0.5 ' +
    'active:translate-y-0 focus:ring-violet-500',
  secondary:
    'bg-violet-100 text-violet-800 ' +
    'hover:bg-violet-200 hover:-translate-y-0.5 focus:ring-violet-400',
  outline:
    'border border-violet-200 bg-white/85 text-violet-700 shadow-card backdrop-blur ' +
    'hover:border-violet-300 hover:bg-violet-50 hover:-translate-y-0.5 hover:shadow-elevated focus:ring-violet-400',
  ghost:
    'text-slate-600 hover:bg-violet-50 hover:text-violet-700 focus:ring-violet-400',
  danger:
    'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-sm ' +
    'hover:from-rose-700 hover:to-red-700 hover:-translate-y-0.5 focus:ring-rose-500',
  success:
    'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm ' +
    'hover:from-emerald-700 hover:to-teal-700 hover:-translate-y-0.5 focus:ring-emerald-500',
  warning:
    'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm ' +
    'hover:from-amber-600 hover:to-orange-600 hover:-translate-y-0.5 focus:ring-amber-400',
};

const sizeStyles: Record<string, string> = {
  sm: 'h-9 px-3.5 text-xs rounded-lg',
  md: 'h-11 px-5 text-sm rounded-xl',
  lg: 'h-12 px-7 text-base rounded-xl',
  xl: 'h-14 px-8 text-base rounded-2xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2',
        'font-semibold transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
        'whitespace-nowrap select-none',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
