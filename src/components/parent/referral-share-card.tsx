'use client';

// ReferralShareCard — แสดงโค้ดของฉัน + ปุ่มคัดลอก/แชร์
// โค้ดมาจาก server (buildReferralCode) → ส่งลงมาเป็น prop เพื่อไม่กระพริบตอนโหลด

import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';

export default function ReferralShareCard({
  code,
  rewardAmount,
}: {
  code: string;
  rewardAmount: number;
}) {
  const [copied, setCopied] = useState(false);
  const shareText = `เรียนส่วนตัวกับ TutorFinder ผ่านโค้ด ${code} ของฉันได้เลย (รับส่วนลด ${rewardAmount} บาท)`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard ใช้ไม่ได้ (เช่น http หรือเบราว์เซอร์เก่า) — ให้ผู้ใช้เลือก/คัดลอกเอง
      setCopied(false);
    }
  }

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TutorFinder', text: shareText, url });
        return;
      } catch {
        // ผู้ใช้กดยกเลิก → ไม่ต้องทำอะไร
        return;
      }
    }
    await copy();
  }

  return (
    <div className="rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50 to-rose-50/60 p-5">
      <p className="text-xs font-semibold text-slate-500">โค้ดแนะนำของคุณ</p>
      <p className="mt-2 font-mono text-3xl font-extrabold tracking-widest text-pink-600">{code}</p>
      <p className="mt-2 text-xs text-slate-500">
        ส่งให้เพื่อนสมัคร — เพื่อนได้ส่วนลด คุณได้รางวัล {rewardAmount} บาทเมื่อเขาชำระเงินสำเร็จครั้งแรก
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-pink-200 bg-white px-4 text-sm font-bold text-pink-600 transition-colors hover:bg-pink-50"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}
        </button>
        <button
          type="button"
          onClick={share}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-edu-gradient px-4 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-0.5"
        >
          <Share2 className="h-4 w-4" />
          แชร์ให้เพื่อน
        </button>
      </div>
    </div>
  );
}