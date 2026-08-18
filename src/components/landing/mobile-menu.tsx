"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, LogIn, Sparkles } from 'lucide-react';

const NAV_ITEMS = ['คอร์สเรียน', 'ครูพิเศษ', 'ราคา', 'เกี่ยวกับเรา'];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'ปิดเมนู' : 'เปิดเมนู'}
        aria-expanded={open}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 border-pink-200 bg-white/80 text-pink-600 shadow-card transition-all hover:bg-pink-50 active:scale-95 md:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="animate-fadeInUp fixed inset-x-0 top-16 z-40 border-b-2 border-pink-100 bg-white/95 shadow-elevated backdrop-blur-xl md:hidden">
          <nav className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <li key={item}>
                  <button
                    onClick={close}
                    className="w-full rounded-2xl px-4 py-3 text-left text-base font-semibold text-slate-600 transition-colors hover:bg-pink-50 hover:text-pink-600"
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>

            <div className="my-3 border-t-2 border-dashed border-pink-100" />

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
          </nav>
        </div>
      )}
    </>
  );
}
