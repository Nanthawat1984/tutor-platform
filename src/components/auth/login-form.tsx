'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthProvider, useAuth } from '@/hooks/useFirebase';
import { getPreferredGoogleSignInMethod, isMobile, shouldFallbackToGoogleRedirect } from '@/lib/auth/google';
import { getPostLoginPath } from '@/lib/auth/redirects';

function getAuthErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code.startsWith('auth/requests-from-referer-')) {
      return 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase API Key กรุณาเพิ่ม tutorfinder.pilotai.space ใน HTTP referrers แล้วลองใหม่';
    }
    if (error.code === 'auth/popup-closed-by-user') return 'คุณปิดหน้าต่าง Google ก่อนเข้าสู่ระบบ';
    if (error.code === 'auth/popup-blocked') return 'เบราว์เซอร์บล็อกหน้าต่าง Google กรุณาอนุญาต popup แล้วลองอีกครั้ง';
    if (error.code === 'auth/account-exists-with-different-credential') return 'อีเมลนี้เคยสมัครด้วยวิธีอื่นแล้ว กรุณาเข้าสู่ระบบด้วยวิธีเดิม';
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if (error.code === 'auth/user-not-found') return 'ไม่พบบัญชีผู้ใช้นี้';
  }
  if (error instanceof Error) {
    if (error.name === 'GooglePopupTimeoutError') return error.message;
  }
  return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง';
}

/* Google SVG Icon */
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

function LoginFormFields() {
  const router = useRouter();
  const { user, signIn, signInWithGoogle, signInWithGoogleRedirect, userProfile, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pendingMethod, setPendingMethod] = useState<'email' | 'google' | null>(null);

  // Get redirect parameter from URL (set by middleware when accessing protected routes)
  const searchParams = useSearchParams();
  const redirectTo = searchParams?.get('redirect');

  useEffect(() => {
    if (pendingMethod) return;
    // Once we have a profile, go to the role-based destination.
    if (userProfile) {
      const destination = redirectTo || getPostLoginPath(userProfile.role);
      router.replace(destination);
      return;
    }
    // Signed in (e.g. after Google redirect) but profile not loaded yet —
    // wait briefly for the profile to arrive, then fall back to a safe path
    // so the user is never stuck on /login.
    if (user && !loading) {
      const t = setTimeout(() => {
        router.replace(redirectTo || '/my-bookings');
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [pendingMethod, redirectTo, router, user, userProfile, loading]);

  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPendingMethod('email');

    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get('email') || '');
      const password = String(formData.get('password') || '');
      const profile = await signIn(email, password);
      // signIn already calls setSessionCookie inside useFirebase
      // fallback = /my-bookings (ปลอดภัยทุก role — /dashboard เป็นหน้าเฉพาะครู)
      const destination = redirectTo || (profile ? getPostLoginPath(profile.role) : '/my-bookings');
      router.push(destination);
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
      if (getPreferredGoogleSignInMethod() === 'redirect') {
        await signInWithGoogleRedirect();
        return;
      }

      const profile = await signInWithGoogle();
      // signInWithGoogle already calls setSessionCookie inside useFirebase
      const destination = redirectTo || getPostLoginPath(profile.role);
      router.push(destination);
      router.refresh();
    } catch (loginError) {
      // บนมือถือไม่ fallback เป็น redirect เพราะ App Hosting ไม่มี reserved
      // /__/auth callback; ให้แสดง popup-blocked message แทนการวนกลับ Login
      if (!isMobile() && getPreferredGoogleSignInMethod() !== 'redirect' && shouldFallbackToGoogleRedirect(loginError)) {
        try {
          await signInWithGoogleRedirect();
        } catch (redirectError) {
          setError(getAuthErrorMessage(redirectError));
        }
        return;
      }
      setError(getAuthErrorMessage(loginError));
    } finally {
      setPendingMethod(null);
    }
  }

  const isPending = pendingMethod !== null;

  return (
    <form onSubmit={handleEmailLogin} className="form-card p-7 space-y-5">
      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          ⚠ {error}
        </div>
      )}

      {/* Google Button */}
      <button
        type="button"
        disabled={isPending}
        onClick={handleGoogleLogin}
        className="relative flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:-translate-y-0.5 hover:shadow-card disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pendingMethod === 'google' ? (
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : (
          <GoogleIcon />
        )}
        เข้าสู่ระบบด้วย Google
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-pink-200 to-transparent" />
        <span className="text-xs font-bold text-slate-400">หรือ</span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-pink-200 to-transparent" />
      </div>

      {/* Email + Password */}
      <Input
        type="email"
        name="email"
        label="อีเมล"
        required
        placeholder="you@example.com"
        autoComplete="email"
      />
      <Input
        type="password"
        name="password"
        label="รหัสผ่าน"
        required
        placeholder="••••••••"
        autoComplete="current-password"
      />

      {/* Forgot password */}
      <div className="text-right">
        <button type="button" className="text-xs font-semibold text-pink-500 hover:underline">
          ลืมรหัสผ่าน?
        </button>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        isLoading={pendingMethod === 'email'}
        disabled={isPending}
      >
        <Mail className="h-4 w-4" />
        เข้าสู่ระบบ
      </Button>

      {/* Register link */}
      <p className="text-center text-sm text-slate-600">
        ยังไม่มีบัญชี?{' '}
        <Link href="/register" className="font-bold text-pink-600 hover:underline">
          สมัครใช้งาน
        </Link>
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
