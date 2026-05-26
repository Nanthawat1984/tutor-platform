import Link from 'next/link';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  navItems: NavItem[];
  role: 'teacher' | 'parent' | 'admin';
}

export function DashboardLayout({ children, title, navItems, role }: DashboardLayoutProps) {
  return (
    <div className="app-shell">
      <header className="sticky top-0 z-40 border-b border-blue-100/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 overflow-hidden px-4 sm:px-6 lg:px-8">
          <Link href="/" className="shrink-0 whitespace-nowrap text-lg font-bold text-blue-700 sm:text-xl">TutorFinder</Link>
          <nav className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden shrink-0 items-center gap-3 sm:flex">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
              {role === 'teacher' ? 'ครู' : role === 'admin' ? 'แอดมิน' : 'ผู้ปกครอง'}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {title && <h1 className="mb-6 text-2xl font-bold leading-tight text-slate-900">{title}</h1>}
        {children}
      </main>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: string;
  subtext?: string;
  trend?: { value: number; isPositive: boolean };
}

export function StatCard({ label, value, icon, subtext, trend }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-blue-100/80 bg-white/85 p-4 shadow-[0_18px_45px_rgba(37,99,235,0.08)] backdrop-blur sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {subtext && <p className="mt-1 text-xs text-slate-400">{subtext}</p>}
          {trend && (
            <p className={cn('mt-1 text-xs font-medium', trend.isPositive ? 'text-green-600' : 'text-red-600')}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        {icon && <span className="text-3xl text-blue-500">{icon}</span>}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-white/55 px-4 py-10 text-center sm:py-12">
      {icon && <span className="text-4xl text-blue-500">{icon}</span>}
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-2 text-sm text-slate-500">{description}</p>}
      {action && (
        <div className="mt-6">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
