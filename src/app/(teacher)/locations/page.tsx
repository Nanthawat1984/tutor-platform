import Link from 'next/link';
import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { MapPin, Plus, Trash2, ExternalLink, School } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { TEACHER_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';
import { isValidLatLng } from '@/lib/geo';

export default async function LocationsPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const teacherId = session.uid;

  const centersSnap = await db
    .collection(COLLECTIONS.CENTERS)
    .where('teacherId', '==', teacherId)
    .get();

  const centers = centersSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort(
      (a: any, b: any) =>
        (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    );

  async function deleteCenterAction(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['teacher'])).session;
    if (current.uid !== teacherId) return;
    const centerId = formData.get('center_id') as string;
    if (!centerId) return;
    const ref = dbRef.collection(COLLECTIONS.CENTERS).doc(centerId);
    const snap = await ref.get();
    if (snap.exists && snap.data()?.teacherId === teacherId) {
      await ref.delete();
    }
    redirect('/locations');
  }

  return (
    <DashboardLayout
      title="สถานที่สอน"
      navItems={TEACHER_NAV_ITEMS}
      role="teacher"
      userName={session.displayName || 'คุณครู'}
    >
      <div className="responsive-page-header mb-6">
        <p className="text-sm text-slate-500">
          จัดการสถานที่ที่คุณเปิดสอน — ผู้ปกครองจะค้นหาคอร์สของคุณจากแผนที่ได้
        </p>
        <Link href="/locations/new" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto"><Plus className="h-4 w-4" /> เพิ่มสถานที่สอน</Button>
        </Link>
      </div>

      {centers.length === 0 ? (
        <EmptyState
          icon={<School className="h-7 w-7" />}
          title="ยังไม่มีสถานที่สอน"
          description="เพิ่มสถานที่สอนเพื่อให้ผู้ปกครองค้นหาคอร์สของคุณจากแผนที่ได้"
          action={{ label: 'เพิ่มสถานที่สอน', href: '/locations/new' }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {centers.map((center: any) => {
            const hasPos = isValidLatLng(center.latitude, center.longitude);
            const mapUrl = hasPos
              ? `https://www.google.com/maps/search/?api=1&query=${center.latitude},${center.longitude}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [center.address, center.subdistrict, center.district, center.province].filter(Boolean).join(' ')
                )}`;
            return (
              <Card key={center.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-100 to-rose-100 text-pink-600">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900">{center.name || 'สถานที่สอน'}</h3>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {[center.address, center.subdistrict, center.district, center.province, center.postalCode]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {center.isOnline && <Badge variant="info">ออนไลน์</Badge>}
                        {hasPos ? (
                          <Badge variant="success">มีพิกัดบนแผนที่</Badge>
                        ) : (
                          <Badge variant="warning">ยังไม่มีพิกัด</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-pink-100/70 pt-3">
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm font-semibold text-pink-700 transition-colors hover:bg-pink-100"
                  >
                    <ExternalLink className="h-4 w-4" /> ดูใน Google Maps
                  </a>
                  <form action={deleteCenterAction}>
                    <input type="hidden" name="center_id" value={center.id} />
                    <Button type="submit" variant="outline" size="sm" className="text-red-500 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" /> ลบ
                    </Button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
