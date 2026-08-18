"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, LogIn, Sparkles, GraduationCap } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'คอร์สเรียน', href: '/explore' },
  { label: 'ครูพิเศษ', href: '/explore' },
  { label: 'ราคา', href: '#pricing' },
  { label: 'เกี่ยวกับเรา', href: '#features' },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <>
      {/* ── Hamburger button (shown below md) ── */}
      <button
        onClick={() => setOpen(true)}
        aria-label="เปิดเมนู"
        aria-expanded={open}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 border-pink-200 bg-white/80 text-pink-600 shadow-card transition-all hover:bg-pink-50 active:scale-95 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* ── Overlay ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={close}
        />
      )}

      {/* ── Slide-in drawer (like dashboard) ── */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r-2 border-pink-100 bg-white/95 shadow-elevated backdrop-blur-xl transition-transform duration-300 md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!open}
      >
        {/* Drawer header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b-2 border-pink-100 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-edu-gradient shadow-button">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-lg font-extrabold tracking-tight text-pink-600">
              Tutor<span className="text-rose-400">Finder</span>
            </span>
          </div>
          <button
            onClick={close}
            aria-label="ปิดเมนู"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-pink-50 hover:text-pink-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={close}
                  className="block w-full rounded-2xl px-4 py-3 text-left text-base font-semibold text-slate-600 transition-colors hover:bg-pink-50 hover:text-pink-600"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Actions */}
        <div className="shrink-0 border-t-2 border-dashed border-pink-100 p-4">
          <div className="flex flex-col gap-2">
            <Link
              href="/login"
              onClick={close}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border-2 border-pink-200 bg-white px-4 py-2.5 text-sm font-semibold text-pink-600 shadow-card transition-colors hover:bg-pink-50"
            >
              <LogIn className="h-4 w-4" />
              เข้าสู่ระบบ
            </Link>
            <Link
              href="/register"
              onClick={close}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-edu-gradient px-4 py-2.5 text-sm font-bold text-white shadow-button transition-all hover:scale-[1.02] active:translate-y-1"
            >
              <Sparkles className="h-4 w-4" />
              เริ่มใช้งานฟรี
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
