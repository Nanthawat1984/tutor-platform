'use client';

import { useCallback, useEffect, useState } from 'react';
import liff from '@line/liff';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { getLineClientConfig } from '@/lib/line/config';
import { Button } from '@/components/ui/button';

interface LineLinkCardProps {
  initialLinked: boolean;
  initialEnabled?: boolean;
  handoffPath?: string;
}

function waitForFirebaseUser(): Promise<User | null> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    let timeoutId: number | null = null;
    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      resolve(user);
    };
    unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) finish(user);
    });
    if (settled) {
      unsubscribe();
    } else {
      timeoutId = window.setTimeout(() => finish(auth.currentUser), 5000);
    }
  });
}

export function LineLinkCard({
  initialLinked,
  initialEnabled = true,
  handoffPath = '/my-profile',
}: LineLinkCardProps) {
  const [linked, setLinked] = useState(initialLinked);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const config = getLineClientConfig();
  const autoLink = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('line_link') === '1';

  const finishAndReturn = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('return_to');
    if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      window.location.assign(returnTo);
      return;
    }

    params.delete('line_link');
    params.delete('return_to');
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, []);

  const linkLine = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (!config.liffId) throw new Error('ยังไม่ได้ตั้งค่า LIFF ID');

      if (!window.location.pathname.startsWith(handoffPath)) {
        const returnTo = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`${handoffPath}?line_link=1&return_to=${encodeURIComponent(returnTo)}`);
        return;
      }

      await liff.init({ liffId: config.liffId });
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }

      const idToken = liff.getIDToken();
      const firebaseUser = await waitForFirebaseUser();
      const firebaseToken = await firebaseUser?.getIdToken();
      if (!firebaseToken) {
        throw new Error('กรุณาเปิด TutorPlatform ใน Chrome หรือ Safari และเข้าสู่ระบบ Google ก่อนเชื่อม LINE');
      }
      if (!idToken) {
        throw new Error('ไม่พบการเข้าสู่ระบบ LINE กรุณาลองกดเชื่อมต่ออีกครั้ง');
      }

      const response = await fetch('/api/line/link', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${firebaseToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error === 'line_account_already_linked'
          ? 'LINE บัญชีนี้ถูกผูกกับผู้ใช้อื่นแล้ว'
          : 'เชื่อมต่อ LINE ไม่สำเร็จ');
      }
      setLinked(true);
      setEnabled(true);
      finishAndReturn();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(message || 'เชื่อมต่อ LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }, [config.liffId, finishAndReturn, handoffPath]);

  useEffect(() => {
    if (autoLink && !initialLinked) void linkLine();
  }, [autoLink, initialLinked, linkLine]);

  async function unlinkLine() {
    setBusy(true);
    setError('');
    try {
      const firebaseToken = await getFirebaseAuth().currentUser?.getIdToken();
      if (!firebaseToken) {
        throw new Error('กรุณาเปิด TutorPlatform ใน Chrome หรือ Safari และเข้าสู่ระบบ Google ก่อนดำเนินการ');
      }
      const response = await fetch('/api/line/unlink', {
        method: 'POST',
        headers: { Authorization: `Bearer ${firebaseToken}` },
      });
      if (!response.ok) throw new Error('ยกเลิกการเชื่อมต่อ LINE ไม่สำเร็จ');
      setLinked(false);
      setEnabled(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ยกเลิกการเชื่อมต่อ LINE ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-violet-50 p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-bold text-slate-900">แจ้งเตือนผ่าน LINE OA 💖</p>
          <p className="mt-1 text-sm text-slate-600">
            {linked && enabled ? 'เชื่อมต่อแล้ว พร้อมรับข่าวสารสำคัญ' : 'เชื่อมต่อเพื่อรับแจ้งเตือนการเรียนและค่าเรียน'}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-pink-600 ring-1 ring-pink-100">
          {linked ? (enabled ? 'เชื่อมแล้ว' : 'ปิดแจ้งเตือน') : 'ยังไม่เชื่อม'}
        </span>
      </div>
      <a
        href="https://line.me/R/ti/p/%40966mqfzj"
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-xs font-semibold text-pink-600 underline"
      >
        เพิ่มเพื่อน OA @966mqfzj ก่อนเชื่อมบัญชี
      </a>
      {error && <p className="mt-3 text-sm font-semibold text-rose-600" role="alert">{error}</p>}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {!linked ? (
          <Button type="button" onClick={linkLine} disabled={busy || !config.enabled}>
            {busy ? 'กำลังเชื่อมต่อ…' : 'เชื่อมต่อ LINE'}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={unlinkLine} disabled={busy}>
            {busy ? 'กำลังดำเนินการ…' : 'ยกเลิกการเชื่อมต่อ'}
          </Button>
        )}
      </div>
    </div>
  );
}
