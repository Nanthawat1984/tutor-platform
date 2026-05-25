import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  async function login(formData: FormData) {
    'use server';
    // TODO: Implement Firebase Auth login
    // const auth = getFirebaseAuth();
    // await signInWithEmailAndPassword(auth, email, password);
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-3xl font-bold text-blue-600">TutorFinder</Link>
          <p className="mt-2 text-gray-600">เข้าสู่ระบบ</p>
        </div>

        <form action={login} className="space-y-4 rounded-xl bg-white p-8 shadow-sm">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">อีเมล</label>
            <Input type="email" name="email" id="email" required placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">รหัสผ่าน</label>
            <Input type="password" name="password" id="password" required placeholder="••••••••" />
          </div>
          <Button type="submit" className="w-full">เข้าสู่ระบบ</Button>
          <p className="text-center text-sm text-gray-600">
            ยังไม่มีบัญชี?{' '}
            <Link href="/register" className="font-medium text-blue-600 hover:underline">สมัครใช้งาน</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
