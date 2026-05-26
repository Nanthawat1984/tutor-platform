import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, id, className, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full rounded-xl border border-blue-100 bg-white/90 px-4 py-2.5 text-slate-900 shadow-sm transition-colors',
          'placeholder:text-slate-400',
          'focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100',
          'disabled:bg-slate-50 disabled:text-slate-500',
          error && 'border-rose-400 focus:border-rose-400 focus:ring-rose-100',
          className
        )}
        {...props}
      />
      {helperText && !error && <p className="mt-1 text-xs text-gray-500">{helperText}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, id, className, ...props }: TextareaProps) {
  const textareaId = id || label?.toLowerCase().replace(/\s/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          'w-full rounded-xl border border-blue-100 bg-white/90 px-4 py-2.5 text-slate-900 shadow-sm transition-colors',
          'placeholder:text-slate-400',
          'focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100',
          'disabled:bg-slate-50 disabled:text-slate-500',
          error && 'border-rose-400 focus:border-rose-400 focus:ring-rose-100',
          className
        )}
        rows={3}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, error, id, options, className, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'w-full rounded-xl border border-blue-100 bg-white/90 px-4 py-2.5 text-slate-900 shadow-sm transition-colors',
          'focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100',
          'disabled:bg-slate-50 disabled:text-slate-500',
          error && 'border-rose-400 focus:border-rose-400 focus:ring-rose-100',
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
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
