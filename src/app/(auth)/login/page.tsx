import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-3xl font-bold text-blue-700">TutorFinder</Link>
          <p className="mt-2 text-slate-600">เข้าสู่ระบบ</p>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
