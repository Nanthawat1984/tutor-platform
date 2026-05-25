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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-3xl font-bold text-blue-600">TutorFinder</Link>
          <p className="mt-2 text-gray-600">สมัครใช้งาน</p>
        </div>

        <form action={register} className="space-y-4 rounded-xl bg-white p-8 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700">สมัครในฐานะ</label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="cursor-pointer rounded-lg border border-gray-300 p-3 text-center has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                <input type="radio" name="role" value="parent" defaultChecked className="sr-only" />
                <div className="font-medium">ผู้ปกครอง</div>
              </label>
              <label className="cursor-pointer rounded-lg border border-gray-300 p-3 text-center has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
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
          <p className="text-center text-sm text-gray-600">
            มีบัญชีอยู่แล้ว?{' '}
            <Link href="/login" className="font-medium text-blue-600 hover:underline">เข้าสู่ระบบ</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
