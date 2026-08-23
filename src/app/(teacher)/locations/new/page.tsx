import Link from 'next/link';
import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { ArrowLeft, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashboardLayout } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import LocationPicker from '@/components/teacher/location-picker';

export default async function NewLocationPage() {
  const session = await requireSessionUser();
  const teacherId = session.uid;

  async function createCenterAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['teacher'])).session;
    if (current.uid !== teacherId) return;

    const parseNum = (v: FormDataEntryValue | null) => {
      const n = parseFloat(String(v || ''));
      return Number.isFinite(n) ? n : null;
    };

    await dbRef.collection(COLLECTIONS.CENTERS).add({
      teacherId,
      name: (formData.get('location_name') as string) || 'สถานที่สอน',
      address: (formData.get('location_address') as string) || '',
      subdistrict: (formData.get('location_subdistrict') as string) || '',
      district: (formData.get('location_district') as string) || '',
      province: (formData.get('location_province') as string) || '',
      postalCode: (formData.get('location_postal_code') as string) || '',
      latitude: parseNum(formData.get('location_latitude')),
      longitude: parseNum(formData.get('location_longitude')),
      isOnline: false,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    redirect('/locations?added=1');
  }

  return (
    <DashboardLayout
      title="เพิ่มสถานที่สอน"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <Link href="/locations" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-pink-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> กลับไปสถานที่สอน
      </Link>

      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-100 text-pink-600">
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">ข้อมูลสถานที่สอน</h2>
            <p className="text-sm text-slate-500">ค้นหาที่อยู่จากแผนที่ หรือกรอกด้วยตนเอง</p>
          </div>
        </div>

        <form action={createCenterAction} className="space-y-6">
          <LocationPicker namePrefix="location" />
          <div className="flex flex-col gap-2 border-t border-pink-100/70 pt-4 sm:flex-row sm:justify-end">
            <Link href="/locations" className="w-full sm:w-auto">
              <Button type="button" variant="outline" className="w-full sm:w-auto">ยกเลิก</Button>
            </Link>
            <Button type="submit" className="w-full sm:w-auto">บันทึกสถานที่สอน</Button>
          </div>
        </form>
      </Card>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
