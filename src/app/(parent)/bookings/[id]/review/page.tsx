import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DashboardLayout } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { requireSessionUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/guards';

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();

  const routeParams = await params;
  const bookingId = routeParams.id;

  const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();

  if (!bookingSnap.exists) {
    return (
      <DashboardLayout title="รีวิวครู" navItems={PARENT_NAV_ITEMS} role="parent" userName={session.displayName || 'ผู้ปกครอง'}>
        <div className="text-center py-12">
          <p className="text-gray-500">ไม่พบการจอง</p>
        </div>
      </DashboardLayout>
    );
  }

  const booking = { id: bookingSnap.id, ...bookingSnap.data() } as any;
  if (booking.parentId !== session.uid || booking.status !== 'completed') redirect('/bookings');

  async function submitReview(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const current = (await requireRole(['parent'])).session;
    const currentBookingSnap = await dbRef.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
    const currentBooking = currentBookingSnap.data() as any;
    if (!currentBookingSnap.exists || currentBooking?.parentId !== current.uid || currentBooking?.status !== 'completed') {
      redirect('/bookings');
      return;
    }
    const rating = parseInt(formData.get('rating') as string);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
    const comment = formData.get('comment') as string;
    const parentId = current.uid;

    const existingReview = await dbRef.collection(COLLECTIONS.REVIEWS)
      .where('bookingId', '==', bookingId)
      .where('parentId', '==', parentId)
      .limit(1)
      .get();
    if (!existingReview.empty) {
      redirect('/bookings?reviewed=1');
      return;
    }

    await dbRef.collection(COLLECTIONS.REVIEWS).add({
      bookingId,
      parentId,
      teacherId: booking.teacherId,
      rating,
      comment: comment || null,
      isVerified: true,
      isVisible: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    redirect('/bookings?reviewed=1');
  }

  return (
    <DashboardLayout title="รีวิวครู" navItems={PARENT_NAV_ITEMS} role="parent" userName={session.displayName || 'ผู้ปกครอง'}>
      <p className="mb-6 text-sm text-slate-500">
        คอร์ส: {booking.courseTitle} • ครู{booking.teacherName}
      </p>

      <Card className="max-w-lg">
        <form action={submitReview} className="space-y-6">
          <input type="hidden" name="booking_id" value={bookingId} />

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">ให้คะแนน</label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <label key={star} className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                  <input type="radio" name="rating" value={star} className="sr-only peer" required />
                  <Star
                    className="h-8 w-8 text-slate-300 peer-checked:text-amber-400 peer-checked:fill-amber-400 hover:text-amber-400 transition-colors"
                    fill="currentColor"
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="comment" className="block text-sm font-semibold text-slate-700">
              ความคิดเห็น (ไม่บังคับ)
            </label>
            <textarea
              id="comment"
              name="comment"
              rows={4}
              className="mt-1 min-h-[112px] w-full rounded-xl border border-pink-100 bg-white/90 px-4 py-2.5 text-base shadow-inner-lg transition-all focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100/60 sm:text-sm"
              placeholder="บอกถึงความประทับใจของคุณ..."
            />
          </div>

          <div className="responsive-actions">
            <Button type="submit" className="w-full sm:w-auto">ส่งรีวิว</Button>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => history.back()}>
              ยกเลิก
            </Button>
          </div>
        </form>
      </Card>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
