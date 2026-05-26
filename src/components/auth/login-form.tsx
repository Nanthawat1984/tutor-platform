'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthProvider, useAuth } from '@/hooks/useFirebase';
import { getPostLoginPath } from '@/lib/auth/redirects';

function getAuthErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === 'auth/popup-closed-by-user') return 'คุณปิดหน้าต่าง Google ก่อนเข้าสู่ระบบ';
    if (error.code === 'auth/popup-blocked') return 'เบราว์เซอร์บล็อกหน้าต่าง Google กรุณาอนุญาต popup แล้วลองอีกครั้ง';
    if (error.code === 'auth/account-exists-with-different-credential') return 'อีเมลนี้เคยสมัครด้วยวิธีอื่นแล้ว กรุณาเข้าสู่ระบบด้วยวิธีเดิม';
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if (error.code === 'auth/user-not-found') return 'ไม่พบบัญชีผู้ใช้นี้';
  }
  return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง';
}

function LoginFormFields() {
  const router = useRouter();
  const { signIn, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pendingMethod, setPendingMethod] = useState<'email' | 'google' | null>(null);

  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPendingMethod('email');

    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get('email') || '');
      const password = String(formData.get('password') || '');
      const profile = await signIn(email, password);
      router.push(profile ? getPostLoginPath(profile.role) : '/dashboard');
      router.refresh();
    } catch (loginError) {
      setError(getAuthErrorMessage(loginError));
    } finally {
      setPendingMethod(null);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setPendingMethod('google');

    try {
      const profile = await signInWithGoogle();
      router.push(getPostLoginPath(profile.role));
      router.refresh();
    } catch (loginError) {
      setError(getAuthErrorMessage(loginError));
    } finally {
      setPendingMethod(null);
    }
  }

  const isPending = pendingMethod !== null;

  return (
    <form onSubmit={handleEmailLogin} className="space-y-5 rounded-3xl border border-blue-100/80 bg-white/85 p-5 shadow-[0_24px_70px_rgba(37,99,235,0.12)] backdrop-blur sm:p-8">
      {error && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full border-blue-200 bg-white text-slate-700 hover:bg-blue-50"
        isLoading={pendingMethod === 'google'}
        disabled={isPending}
        onClick={handleGoogleLogin}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-blue-600 ring-1 ring-blue-100">G</span>
        เข้าสู่ระบบด้วย Google
      </Button>

      <div className="flex items-center gap-3 text-xs font-semibold text-slate-400">
        <div className="h-px flex-1 bg-blue-100" />
        หรือ
        <div className="h-px flex-1 bg-blue-100" />
      </div>

      <Input type="email" name="email" label="อีเมล" required placeholder="you@example.com" autoComplete="email" />
      <Input type="password" name="password" label="รหัสผ่าน" required placeholder="••••••••" autoComplete="current-password" />

      <Button type="submit" className="w-full" isLoading={pendingMethod === 'email'} disabled={isPending}>
        <Mail className="h-4 w-4" />
        เข้าสู่ระบบ
      </Button>

      <p className="text-center text-sm text-slate-600">
        ยังไม่มีบัญชี?{' '}
        <Link href="/register" className="font-semibold text-blue-700 hover:underline">สมัครใช้งาน</Link>
      </p>
    </form>
  );
}

export function LoginForm() {
  return (
    <AuthProvider>
      <LoginFormFields />
    </AuthProvider>
  );
}
