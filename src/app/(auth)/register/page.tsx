'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { GraduationCap, Users, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthProvider, useAuth } from '@/hooks/useFirebase';
import { getPreferredGoogleSignInMethod, shouldFallbackToGoogleRedirect } from '@/lib/auth/google';
import { getPostLoginPath } from '@/lib/auth/redirects';
import { ConsentGate } from '@/components/legal/consent-gate';
import { PRIVACY_VERSION, TERMS_VERSION, type RegistrationConsent } from '@/lib/legal/consent';

type RegisterRole = 'parent' | 'teacher';

const ROLES = [
  {
    value: 'parent',
    icon: Users,
    emoji: '👨‍👩‍👧',
    title: 'ผู้ปกครอง',
    desc: 'ค้นหาครูให้ลูกหลาน ติดตามผลการเรียน',
    gradient: 'from-pink-500 to-rose-500',
    ring: 'peer-checked:ring-pink-500 peer-checked:border-pink-500',
    bg: 'peer-checked:bg-pink-50',
  },
  {
    value: 'teacher',
    icon: GraduationCap,
    emoji: '📚',
    title: 'ครูพิเศษ',
    desc: 'เปิดสอน จัดการตาราง รับรายได้',
    gradient: 'from-pink-500 to-rose-500',
    ring: 'peer-checked:ring-pink-500 peer-checked:border-pink-500',
    bg: 'peer-checked:bg-pink-50',
  },
];

function getAuthErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === 'auth/email-already-in-use') return 'อีเมลนี้ถูกใช้สมัครแล้ว กรุณาเข้าสู่ระบบ';
    if (error.code === 'auth/weak-password') return 'รหัสผ่านไม่ปลอดภัยพอ กรุณาใช้อย่างน้อย 8 ตัวอักษร';
    if (error.code === 'auth/popup-closed-by-user') return 'คุณปิดหน้าต่าง Google ก่อนสมัครสำเร็จ';
    if (error.code === 'auth/popup-blocked') return 'เบราว์เซอร์บล็อกหน้าต่าง Google กรุณาอนุญาต popup แล้วลองอีกครั้ง';
    if (error.code === 'auth/account-exists-with-different-credential') return 'อีเมลนี้เคยสมัครด้วยวิธีอื่นแล้ว กรุณาเข้าสู่ระบบด้วยวิธีเดิม';
  }
  if (error instanceof Error) {
    if (error.message === 'consent_required') return 'กรุณาอ่านและยอมรับข้อตกลงผู้ใช้บริการและนโยบายความเป็นส่วนตัวก่อนสมัคร';
    if (error.message === 'profile-create-failed') return 'สร้างโปรไฟล์ผู้ใช้ไม่สำเร็จ กรุณาลองเข้าสู่ระบบด้วยบัญชีเดิมอีกครั้ง';
    if (error.message === 'profile-read-failed') return 'อ่านข้อมูลโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    if (error.name === 'GooglePopupTimeoutError') return error.message;
  }
  return 'สมัครไม่สำเร็จ กรุณาลองอีกครั้ง';
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function RegisterFields() {
  const router = useRouter();
  const { signUp, signInWithGoogle, signInWithGoogleRedirect, userProfile } = useAuth();
  const [role, setRole] = useState<RegisterRole>('parent');
  const [error, setError] = useState<string | null>(null);
  const [pendingMethod, setPendingMethod] = useState<'email' | 'google' | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const registrationConsent: RegistrationConsent | null = consentAccepted
    ? { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION }
    : null;

  useEffect(() => {
    if (!userProfile || pendingMethod) return;
    router.replace(getPostLoginPath(userProfile.role));
  }, [pendingMethod, router, userProfile]);

  async function handleEmailRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!registrationConsent) {
      setError('กรุณาอ่านและยอมรับข้อตกลงก่อนสมัคร');
      return;
    }
    setError(null);
    setPendingMethod('email');

    try {
      const formData = new FormData(event.currentTarget);
      const fullName = String(formData.get('full_name') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');
      await signUp(email, password, fullName, role, registrationConsent);
      router.push(getPostLoginPath(role));
      router.refresh();
    } catch (registerError) {
      setError(getAuthErrorMessage(registerError));
    } finally {
      setPendingMethod(null);
    }
  }

  async function handleGoogleRegister() {
    if (!registrationConsent) {
      setError('กรุณาอ่านและยอมรับข้อตกลงก่อนสมัคร');
      return;
    }
    setError(null);
    setPendingMethod('google');

    try {
      if (getPreferredGoogleSignInMethod() === 'redirect') {
        await signInWithGoogleRedirect(role, registrationConsent);
        return;
      }

      const profile = await signInWithGoogle(role, registrationConsent);
      router.push(getPostLoginPath(profile.role));
      router.refresh();
    } catch (registerError) {
      // ถ้าใช้ redirect อยู่แล้ว (มือถือ) ไม่ต้อง fallback ไป redirect ซ้ำ
      // (จะ fail ซ้ำและกลายเป็น unhandled rejection → หน้าค้าง)
      if (getPreferredGoogleSignInMethod() !== 'redirect' && shouldFallbackToGoogleRedirect(registerError)) {
        try {
          await signInWithGoogleRedirect(role, registrationConsent);
        } catch (redirectError) {
          setError(getAuthErrorMessage(redirectError));
        }
        return;
      }
      setError(getAuthErrorMessage(registerError));
    } finally {
      setPendingMethod(null);
    }
  }

  const isPending = pendingMethod !== null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      {/* Background decorations */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-pink-200/40 blur-3xl" />
        <div className="absolute bottom-0 -left-20 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg animate-scaleIn">
        {/* Header */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="animate-bounce-soft flex h-12 w-12 items-center justify-center rounded-2xl bg-edu-gradient shadow-button">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <span className="font-display text-2xl font-extrabold text-pink-600 tracking-tight">TutorFinder</span>
          </Link>
          <h1 className="mt-5 font-display text-2xl font-extrabold text-slate-900">สร้างบัญชีใหม่ <span className="inline-block animate-wiggle">🎉</span></h1>
          <p className="mt-2 text-sm text-slate-500">เริ่มใช้งานฟรี ไม่มีค่าสมัคร</p>
        </div>

        <form onSubmit={handleEmailRegister} className="form-card p-6 sm:p-8 space-y-5">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              ⚠ {error}
            </div>
          )}

          {/* Role Selector */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3">
              <Sparkles className="inline h-4 w-4 text-pink-500 mr-1.5" />
              สมัครในฐานะ
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLES.map((role, idx) => {
                const Icon = role.icon;
                return (
                  <label
                    key={role.value}
                    className="relative flex cursor-pointer flex-col gap-2 overflow-hidden rounded-3xl border-2 border-pink-100 bg-white/80 p-4 text-left transition-all has-[:checked]:border-pink-500 has-[:checked]:bg-pink-50 hover:border-pink-300 hover:bg-pink-50/60"
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role.value}
                      defaultChecked={idx === 0}
                      onChange={() => setRole(role.value as RegisterRole)}
                      className="sr-only"
                    />
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${role.gradient} shadow-sm`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{role.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{role.desc}</p>
                    </div>
                    {/* Check indicator */}
                    <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 border-pink-200 bg-white transition-all has-checked:border-pink-500">
                      <div className="h-2.5 w-2.5 rounded-full bg-pink-500 opacity-0 [label:has(:checked)_&]:opacity-100" />
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <p className="-mt-2 text-xs leading-relaxed text-slate-400">
            💡 มีบัญชีอยู่แล้ว? บทบาทของคุณจะใช้จากบัญชีเดิมโดยอัตโนมัติ (เช่น ผู้ดูแลระบบ) — เลือกบทบาทนี้สำหรับบัญชีใหม่เท่านั้น
          </p>

          <ConsentGate
            accepted={consentAccepted}
            onAcceptedChange={setConsentAccepted}
            disabled={isPending}
          />

          <button
            type="button"
            disabled={isPending || !consentAccepted}
            onClick={handleGoogleRegister}
            className="relative flex min-h-[48px] w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-card disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingMethod === 'google' ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <GoogleIcon />
            )}
            สมัครด้วย Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-pink-200 to-transparent" />
            <span className="text-xs font-bold text-slate-400">หรือ</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-pink-200 to-transparent" />
          </div>

          {/* Form Fields */}
          <Input label="ชื่อ-นามสกุล" name="full_name" required placeholder="ชื่อ นามสกุล" />
          <Input label="เบอร์โทรศัพท์" name="phone" type="tel" placeholder="08X-XXX-XXXX" />
          <Input label="อีเมล" name="email" type="email" required placeholder="you@example.com" />
          <Input
            label="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)"
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="••••••••"
            helperText="ควรมีตัวอักษรพิมพ์ใหญ่ ตัวเลข และอักขระพิเศษ"
          />

          <Button type="submit" size="lg" className="w-full" isLoading={pendingMethod === 'email'} disabled={isPending || !consentAccepted}>
            <Sparkles className="h-4 w-4" />
            สร้างบัญชีฟรี
          </Button>

          <p className="text-center text-sm text-slate-600">
            มีบัญชีอยู่แล้ว?{' '}
            <Link href="/login" className="font-bold text-pink-600 hover:underline">
              เข้าสู่ระบบ
            </Link>
          </p>

          <p className="text-center text-xs text-slate-400 leading-relaxed">
            สมัครสมาชิกได้เมื่ออ่านและยอมรับข้อตกลงครบถ้วนแล้วเท่านั้น
          </p>
        </form>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <AuthProvider>
      <RegisterFields />
    </AuthProvider>
  );
}
