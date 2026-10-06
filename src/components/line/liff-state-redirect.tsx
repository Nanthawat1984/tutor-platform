'use client';

// ส่งผู้ใช้จาก primary redirect ของ LIFF ไปหน้าเมนูที่กดจริง
//
// Rich Menu ทุก tile เปิดผ่าน https://liff.line.me/{liffId}{path} แต่ LIFF จะพามา
// ที่ Endpoint URL (domain root) ก่อนพร้อมค่า path จริงใน `liff.state` แล้วจะย้าย
// ไปหน้าจริงก็ต่อเมื่อมีการเรียก `liff.init()` เท่านั้น (ดูรายละเอียดใน
// src/lib/line/liff-state.ts) — ถ้าไม่มีใครเรียก ผู้ใช้จะค้างอยู่หน้าแรก
// หรือหน้า Endpoint ทุกครั้งที่กดเมนู
//
// mount ไว้ใน root layout (ตัวแรกสุด) เพื่อให้ทำงานก่อนหน้าอื่นแก้ URL

import { useEffect } from 'react';
import {
  getLiffStatePath,
  hasLineAuthResponse,
  isLiffPrimaryRedirect,
} from '@/lib/line/liff-state';

// กันไม่ให้ init ซ้ำเมื่อ effect รันหลายครั้ง (เช่น React strict mode)
let started = false;

/** เผื่อ init ค้างโดยไม่ยอมย้ายหน้า — ถ้าครบเวลายังอยู่ที่เดิมให้ไปเอง */
const FALLBACK_DELAY_MS = 4000;

export function LiffStateRedirect() {
  useEffect(() => {
    const { search, pathname, hash } = window.location;
    if (!isLiffPrimaryRedirect(search, pathname)) return;

    const target = getLiffStatePath(search);
    if (!target || started) return;
    started = true;

    // LINE เพิ่งส่ง code/token กลับมาหลัง liff.login() — ต้องให้ liff.init() แลก
    // token ก่อนเสมอ ห้ามรีบเปลี่ยนหน้าเอง และห้ามตั้ง timeout เด้ง เพราะอาจไป
    // ขัดจังหวะ exchange ที่กำลังทำงานบน network ช้า
    const authPending = hasLineAuthResponse(search, hash);
    const stillPending = () => window.location.search.includes('liff.state');
    const fallback = () => {
      if (stillPending()) window.location.replace(target);
    };

    const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID?.trim() || '';
    if (!liffId) {
      fallback();
      return;
    }

    let timer: number | undefined;
    if (!authPending) {
      timer = window.setTimeout(fallback, FALLBACK_DELAY_MS);
    }
    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };

    void (async () => {
      try {
        const { default: liff } = await import('@line/liff');
        await liff.init({ liffId });
        // init สำเร็จแต่ไม่ย้ายหน้า (ไม่มี context ให้คำนวณ secondary redirect)
        clearTimer();
        fallback();
      } catch {
        // ไม่ได้อยู่ใน LIFF browser / init ล้มเหลว — ไปหน้าเป้าหมายเอง
        // (code ที่แลกไม่ได้ก็ไร้ประโยชน์อยู่แล้ว จึงไม่เสียอะไร)
        clearTimer();
        fallback();
      }
    })();
  }, []);

  return null;
}
