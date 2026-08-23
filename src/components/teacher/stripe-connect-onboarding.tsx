'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, ShieldCheck, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StripeConnectOnboardingProps {
  mode: 'disabled' | 'locked' | 'test' | 'live';
  accountId?: string;
  transfersStatus?: string | null;
  connectMessage?: string;
}

export default function StripeConnectOnboarding({
  mode,
  accountId,
  transfersStatus,
  connectMessage,
}: StripeConnectOnboardingProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentTransfersStatus, setCurrentTransfersStatus] = useState(transfersStatus || null);
  const enabled = mode === 'test' || mode === 'live';
  const ready = currentTransfersStatus === 'active';

  useEffect(() => {
    if (!accountId || !enabled) return;
    let cancelled = false;
    fetch('/api/payments/connect/status')
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!cancelled && typeof body?.status?.transfersStatus === 'string') {
          setCurrentTransfersStatus(body.status.transfersStatus);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [accountId, enabled]);

  async function startOnboarding() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/payments/connect/onboarding', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.onboardingUrl !== 'string') {
        setError(body.error === 'connect_locked'
          ? 'ระบบล็อกการเชื่อมต่อไว้เพื่อป้องกันการโอนเงินจริง'
          : 'ยังเริ่มการเชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง');
        return;
      }
      window.location.assign(body.onboardingUrl);
    } catch {
      setError('เชื่อมต่อ Stripe ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-sky-100 bg-sky-50/70 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm">
          {ready ? <ShieldCheck className="h-5 w-5" /> : <WalletCards className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-900">บัญชีรับเงินผ่าน Stripe Connect</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            ใช้สำหรับรับค่าตอบแทนหลังเรียนเสร็จและผ่านการตรวจสอบ โดยยังคงให้แอดมินเป็นผู้อนุมัติการจ่ายเงิน
          </p>
          {accountId && <p className="mt-2 break-all font-mono text-[10px] text-slate-400">Account: {accountId}</p>}
          {connectMessage && <p className="mt-2 text-xs font-semibold text-sky-700">{connectMessage}</p>}
          {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
          {!enabled && (
            <p className="mt-3 rounded-lg bg-white/80 p-3 text-xs text-slate-600">
              {mode === 'locked' ? 'เตรียมระบบไว้แล้ว แต่ยังล็อกการโอนเงินจริงอยู่' : 'ยังไม่เปิด Connect ในระบบใช้งานจริง'}
            </p>
          )}
          {enabled && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" onClick={startOnboarding} isLoading={loading}>
                {ready ? 'ตรวจสอบข้อมูล Stripe อีกครั้ง' : 'เริ่มเชื่อมบัญชี Stripe'}
                <ExternalLink className="h-4 w-4" />
              </Button>
              <span className="text-[11px] text-slate-500">โหมด: {mode === 'test' ? 'ทดสอบ' : 'ใช้งานจริง'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
