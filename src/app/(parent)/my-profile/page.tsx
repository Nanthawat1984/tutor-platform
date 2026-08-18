import Link from 'next/link';
import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { ProfilePhotoUploader } from '@/components/teacher/profile-photo-uploader';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { Mail, ShieldCheck, UserRound } from 'lucide-react';

export default async function MyProfilePage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const parentId = 'temp-parent-id'; // TODO: from session

  const userSnap = await db.collection(COLLECTIONS.USERS).doc(parentId).get();
  const user = userSnap.exists ? { id: userSnap.id, ...userSnap.data() } as any : null;

  async function updateProfileAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;

    const displayName = (formData.get('display_name') as string || '').trim();
    const phone = (formData.get('phone') as string || '').trim();
    const photoUrl = (formData.get('photo_url') as string || '').trim();

    await dbRef.collection(COLLECTIONS.USERS).doc(parentId).update({
      displayName,
      phone: phone || null,
      photoURL: photoUrl || null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    redirect('/my-profile?updated=1');
  }

  return (
    <DashboardLayout
      title="โปรไฟล์ของฉัน"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={user?.displayName || 'ผู้ปกครอง'}
    >
      <p className="mb-6 text-sm text-slate-500">
        จัดการข้อมูลส่วนตัวของคุณ — ใช้สำหรับการติดต่อและการจองเรียน
      </p>

      <form action={updateProfileAction} className="max-w-2xl space-y-6">
        <div className="form-card p-6 sm:p-8 space-y-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
              <UserRound className="h-4 w-4" />
            </span>
            ข้อมูลส่วนตัว
          </h2>

          <ProfilePhotoUploader userId={parentId} currentPhotoURL={user?.photoURL} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="ชื่อ-นามสกุล"
              name="display_name"
              defaultValue={user?.displayName || ''}
              required
              placeholder="ชื่อ นามสกุล"
            />
            <Input
              label="เบอร์โทรศัพท์"
              name="phone"
              type="tel"
              defaultValue={user?.phone || ''}
              placeholder="08X-XXX-XXXX"
            />
          </div>

          {/* Email — อ่านอย่างเดียว (ผูกกับบัญชี) */}
          <div>
            <p className="mb-1.5 text-sm font-semibold text-slate-700">อีเมล</p>
            <div className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border border-pink-100 bg-slate-50/70 px-4 py-2.5 text-sm text-slate-400">
              <Mail className="h-4 w-4" />
              {user?.email || '—'}
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              อีเมลใช้สำหรับเข้าสู่ระบบ ไม่สามารถเปลี่ยนได้
            </p>
          </div>
        </div>

        <div className="responsive-actions">
          <Button type="submit" className="w-full sm:w-auto">บันทึกโปรไฟล์</Button>
          <Link href="/my-bookings" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full sm:w-auto">ยกเลิก</Button>
          </Link>
        </div>
      </form>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
