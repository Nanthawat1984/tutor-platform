import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

/* ─────────────────────────────────────────
   INPUT
───────────────────────────────────────── */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Input({
  label,
  error,
  helperText,
  id,
  className,
  leftIcon,
  rightIcon,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={cn(
            'min-h-[44px] w-full rounded-xl border bg-white/90 px-4 py-2.5',
            'text-base text-slate-900 shadow-inner-lg transition-all duration-200 sm:text-sm',
            'placeholder:text-slate-400/80',
            'focus:outline-none focus:ring-2 focus:ring-offset-1',
            error
              ? 'border-rose-300 bg-rose-50/30 focus:border-rose-400 focus:ring-rose-100'
              : 'border-pink-100 focus:border-pink-400 focus:ring-pink-100/60',
            'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            className
          )}
          {...props}
        />
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400">
            {rightIcon}
          </div>
        )}
      </div>
      {helperText && !error && (
        <p className="mt-1.5 text-xs text-slate-500">{helperText}</p>
      )}
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-rose-600">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   TEXTAREA
───────────────────────────────────────── */
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Textarea({ label, error, helperText, id, className, ...props }: TextareaProps) {
  const textareaId = id || label?.toLowerCase().replace(/\s/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="mb-1.5 block text-sm font-semibold text-slate-700">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          'min-h-[96px] w-full rounded-xl border bg-white/90 px-4 py-3',
          'text-base text-slate-900 shadow-inner-lg transition-all duration-200 sm:text-sm',
          'placeholder:text-slate-400/80',
          'focus:outline-none focus:ring-2 focus:ring-offset-1',
          'resize-y',
          error
            ? 'border-rose-300 bg-rose-50/30 focus:border-rose-400 focus:ring-rose-100'
            : 'border-pink-100 focus:border-pink-400 focus:ring-pink-100/60',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
          className
        )}
        rows={3}
        {...props}
      />
      {helperText && !error && (
        <p className="mt-1.5 text-xs text-slate-500">{helperText}</p>
      )}
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-rose-600">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   SELECT
───────────────────────────────────────── */
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, error, helperText, id, options, className, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-semibold text-slate-700">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'min-h-[44px] w-full rounded-xl border bg-white/90 px-4 py-2.5',
          'text-base text-slate-900 shadow-inner-lg transition-all duration-200 sm:text-sm',
          'cursor-pointer appearance-none',
          'focus:outline-none focus:ring-2 focus:ring-offset-1',
          error
            ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
            : 'border-pink-100 focus:border-pink-400 focus:ring-pink-100/60',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {helperText && !error && (
        <p className="mt-1.5 text-xs text-slate-500">{helperText}</p>
      )}
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-rose-600">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}
