'use client';

// ตาข่ายนิรภัยสำหรับส่งผู้ใช้จาก primary redirect ของ LIFF ไปหน้าเมนูที่กดจริง
//
// กรณีปกติ `middleware` จัดการไปแล้วที่ฝั่ง server — component นี้เหลือหน้าที่สองอย่าง:
//   1) เผื่อ URL หลุดจาก matcher ของ middleware ยังไปหน้าเป้าหมายได้
//   2) เคสเดียวที่ server ห้ามแตะ: LIFF ส่ง auth code กลับมาพร้อม `liff.state`
//      ซึ่งต้องให้ `liff.init()` แลกก่อนแล้วจึงย้ายหน้า
//
// สำคัญ: ห้ามปล่อยให้ LIFF SDK เป็นคนย้ายหน้า เพราะ SDK ต่อ path เข้ากับ
// Endpoint URL ใน Console (เช่น endpoint `/my-profile` + `/payments`
// = `/my-profile/payments` ที่ไม่มีหน้านี้) — ค่าใน `liff.state` คือ path จริงที่กด

import { useEffect } from 'react';
import { getLiffStatePath, hasLineAuthResponse } from '@/lib/line/liff-state';

// กันไม่ให้ทำงานซ้ำเมื่อ effect รันหลายครั้ง (เช่น React strict mode)
let started = false;

export function LiffStateRedirect() {
  useEffect(() => {
    const { search, hash } = window.location;
    const target = getLiffStatePath(search);
    if (!target || started) return;
    started = true;

    if (!hasLineAuthResponse(search, hash)) {
      window.location.replace(target);
      return;
    }

    // มี auth code ของ LINE ใน URL — ลบ `liff.state` ก่อน init เพื่อกันไม่ให้
    // LIFF SDK ย้ายหน้าไป URL ที่ต่อ path กับ Endpoint แล้วค่อยไปหน้าเป้าหมายเอง
    const params = new URLSearchParams(search);
    params.delete('liff.state');
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${hash}`,
    );

    void (async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID?.trim() || '';
        if (liffId) {
          const { default: liff } = await import('@line/liff');
          await liff.init({ liffId });
        }
      } catch {
        // แลก token ไม่สำเร็จ — ยังไงก็ไปหน้าที่ผู้ใช้กดดีกว่าค้างไว้
      }
      window.location.replace(target);
    })();
  }, []);

  return null;
}
