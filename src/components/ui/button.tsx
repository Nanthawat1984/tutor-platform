'use client';

import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  primary: 'bg-blue-600 text-white shadow-sm shadow-blue-200 hover:bg-blue-700 focus:ring-blue-500',
  secondary: 'bg-sky-100 text-sky-800 hover:bg-sky-200 focus:ring-sky-500',
  outline: 'border border-blue-200 bg-white/85 text-slate-700 hover:border-blue-300 hover:bg-blue-50 focus:ring-blue-500',
  ghost: 'text-slate-600 hover:bg-blue-50 hover:text-blue-700 focus:ring-blue-500',
  danger: 'bg-rose-600 text-white shadow-sm shadow-rose-100 hover:bg-rose-700 focus:ring-rose-500',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
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
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200',
        'min-h-[44px] whitespace-nowrap',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white',
        'disabled:cursor-not-allowed disabled:opacity-50',
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
