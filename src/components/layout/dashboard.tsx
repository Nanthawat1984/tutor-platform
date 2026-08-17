'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  CalendarCheck,
  ChevronRight,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  TrendingUp,
  TrendingDown,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useState } from 'react';

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
  userName?: string;
}

const ROLE_CONFIG = {
  teacher: {
    label: 'ครูพิเศษ',
    gradient: 'from-violet-600 to-purple-700',
    color: 'text-violet-700',
    bg: 'bg-violet-100',
  },
  parent: {
    label: 'ผู้ปกครอง',
    gradient: 'from-indigo-600 to-blue-700',
    color: 'text-indigo-700',
    bg: 'bg-indigo-100',
  },
  admin: {
    label: 'แอดมิน',
    gradient: 'from-slate-600 to-slate-800',
    color: 'text-slate-700',
    bg: 'bg-slate-100',
  },
};

export function DashboardLayout({
  children,
  title,
  navItems,
  role,
  userName,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const config = ROLE_CONFIG[role];

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-violet-100/60 px-5">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${config.gradient} shadow-button`}>
          <GraduationCap className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-violet-700 tracking-tight">TutorFinder</p>
          <span className={`rounded-full ${config.bg} ${config.color} px-2 py-0.5 text-[10px] font-bold`}>
            {config.label}
          </span>
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <p className="mb-2 px-4 text-[10px] font-bold uppercase tracking-widest text-violet-400">เมนูหลัก</p>
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'sidebar-nav-item',
                    isActive && 'active'
                  )}
                >
                  {item.icon && (
                    <span className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors',
                      isActive
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-violet-50 text-violet-500 group-hover:bg-violet-100'
                    )}>
                      {item.icon}
                    </span>
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                  {isActive && <ChevronRight className="h-4 w-4 shrink-0 text-violet-500" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User & Logout */}
      <div className="shrink-0 border-t border-violet-100/60 p-4">
        {userName && (
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-violet-50/60 px-3 py-2.5">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${config.gradient} text-sm font-bold text-white shadow-sm`}>
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{userName}</p>
              <p className="text-xs text-slate-500">{config.label}</p>
            </div>
          </div>
        )}
        <Link
          href="/login"
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-4 w-4" />
          ออกจากระบบ
        </Link>
      </div>
    </>
  );

  return (
    <div className="dashboard-shell">
      {/* ── MOBILE OVERLAY ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR (Desktop) ── */}
      <aside className="sidebar hidden lg:flex lg:flex-col">
        <SidebarContent />
      </aside>

      {/* ── SIDEBAR (Mobile Drawer) ── */}
      <aside
        className={cn(
          'sidebar lg:hidden transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <SidebarContent />
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="sidebar-content flex flex-1 flex-col">
          {/* Header */}
          <header className="dashboard-header">
            <button
              onClick={() => setSidebarOpen(true)}
              className="mr-3 flex h-9 w-9 items-center justify-center rounded-xl hover:bg-violet-50 lg:hidden"
            >
              <Menu className="h-5 w-5 text-slate-600" />
            </button>

            <div className="flex flex-1 items-center justify-between gap-4 min-w-0">
              {title && (
                <h1 className="truncate text-xl font-bold text-slate-900">{title}</h1>
              )}
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <span className={`hidden rounded-full ${config.bg} ${config.color} px-3 py-1 text-xs font-bold sm:inline`}>
                  {config.label}
                </span>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="dashboard-main flex-1">
            {children}
          </main>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   STAT CARD
───────────────────────────────────────── */
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  iconGradient?: string;
  subtext?: string;
  trend?: { value: number; isPositive: boolean };
}

export function StatCard({
  label,
  value,
  icon,
  iconGradient = 'from-violet-500 to-purple-600',
  subtext,
  trend,
}: StatCardProps) {
  return (
    <div className="stat-card group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-1.5 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
          {subtext && <p className="mt-1 text-xs text-slate-400">{subtext}</p>}
          {trend && (
            <p className={cn(
              'mt-2 flex items-center gap-1 text-xs font-bold',
              trend.isPositive ? 'text-emerald-600' : 'text-red-500'
            )}>
              {trend.isPositive
                ? <TrendingUp className="h-3.5 w-3.5" />
                : <TrendingDown className="h-3.5 w-3.5" />}
              {Math.abs(trend.value)}% จากเดือนก่อน
            </p>
          )}
        </div>
        {icon && (
          <div className={`shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${iconGradient} shadow-lg transition-transform group-hover:scale-110`}>
            <span className="text-white">{icon}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   EMPTY STATE
───────────────────────────────────────── */
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-violet-200/60 bg-violet-50/30 px-6 py-14 text-center">
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 text-violet-500 shadow-sm animate-float">
          {icon}
        </div>
      )}
      <h3 className="mt-5 text-lg font-bold text-slate-800">{title}</h3>
      {description && (
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">{description}</p>
      )}
      {action && (
        <div className="mt-7">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-edu-gradient px-5 py-2.5 text-sm font-bold text-white shadow-button transition-all hover:scale-[1.03] hover:shadow-elevated"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-edu-gradient px-5 py-2.5 text-sm font-bold text-white shadow-button transition-all hover:scale-[1.03] hover:shadow-elevated"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   SECTION CARD
───────────────────────────────────────── */
export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-violet-100/60 px-5 py-4 sm:px-6">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}
