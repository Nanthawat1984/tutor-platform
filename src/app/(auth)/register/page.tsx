import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function RegisterPage() {
  async function register(formData: FormData) {
    'use server';
    // TODO: Implement Firebase Auth register
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-3xl font-bold text-blue-700">TutorFinder</Link>
          <p className="mt-2 text-slate-600">สมัครใช้งาน</p>
        </div>

        <form action={register} className="space-y-5 rounded-3xl border border-blue-100/80 bg-white/85 p-5 shadow-[0_24px_70px_rgba(37,99,235,0.12)] backdrop-blur sm:p-8">
          <div>
            <label className="block text-sm font-semibold text-slate-700">สมัครในฐานะ</label>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-blue-200 bg-white/70 p-3 text-center transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                <input type="radio" name="role" value="parent" defaultChecked className="sr-only" />
                <div className="font-medium">ผู้ปกครอง</div>
              </label>
              <label className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-blue-200 bg-white/70 p-3 text-center transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                <input type="radio" name="role" value="teacher" className="sr-only" />
                <div className="font-medium">ครู</div>
              </label>
            </div>
          </div>
          <Input label="ชื่อ-นามสกุล" name="full_name" required />
          <Input label="เบอร์โทรศัพท์" name="phone" type="tel" placeholder="08X-XXX-XXXX" />
          <Input label="อีเมล" name="email" type="email" required />
          <Input label="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)" name="password" type="password" required minLength={8} />
          <Button type="submit" className="w-full">สมัครใช้งาน</Button>
          <p className="text-center text-sm text-slate-600">
            มีบัญชีอยู่แล้ว?{' '}
            <Link href="/login" className="font-semibold text-blue-700 hover:underline">เข้าสู่ระบบ</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
