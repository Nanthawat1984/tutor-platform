import { cn } from '@/lib/utils';

interface TableProps {
  headers: string[];
  children: React.ReactNode;
  emptyMessage?: string;
}

export function Table({ headers, children, emptyMessage = 'ไม่มีข้อมูล' }: TableProps) {
  return (
    <div className="scrollbar-hidden -mx-1 overflow-x-auto rounded-2xl border border-blue-100 bg-white/85 shadow-sm sm:mx-0">
      <table className="min-w-[640px] w-full">
        <thead>
          <tr className="border-b border-blue-100 bg-blue-50/80">
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 sm:px-4"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-blue-50 bg-white/70">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function TableRow({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr
      className={cn(
        'transition-colors',
        onClick && 'cursor-pointer hover:bg-blue-50/70',
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn('px-3 py-3 text-sm text-slate-700 sm:px-4', className)}>
      {children}
    </td>
  );
}

export function TableEmpty({ colSpan, message }: { colSpan: number; message?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-slate-500">
        {message || 'ไม่มีข้อมูล'}
      </td>
    </tr>
  );
}
