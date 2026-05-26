import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { COLLECTIONS } from '@/types/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ booking_id?: string }>;
}) {
  const db = getServerDb();
  if (!db) return redirect('/login');

  const params = await searchParams;
  const bookingId = params.booking_id;

  if (!bookingId) redirect('/bookings');

  const bookingSnap = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();

  if (!bookingSnap.exists) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">ไม่พบการจอง</p>
      </div>
    );
  }

  const booking = { id: bookingSnap.id, ...bookingSnap.data() } as any;

  async function submitReview(formData: FormData) {
    'use server';
    const dbRef = getServerDb();
    if (!dbRef) return;
    const rating = parseInt(formData.get('rating') as string);
    const comment = formData.get('comment') as string;
    const parentId = 'temp-user-id'; // TODO: from session

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
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-8 lg:px-0">
      <h1 className="text-2xl font-bold leading-tight text-gray-900">รีวิวครู</h1>
      <p className="mt-1 text-sm text-gray-500">
        คอร์ส: {booking.courseTitle} • ครู{booking.teacherName}
      </p>

      <Card className="mt-6">
        <form action={submitReview} className="space-y-6">
          <input type="hidden" name="booking_id" value={bookingId} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ให้คะแนน</label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <label key={star} className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                  <input type="radio" name="rating" value={star} className="sr-only peer" required />
                  <Star
                    className="h-8 w-8 text-gray-300 peer-checked:text-yellow-400 peer-checked:fill-yellow-400 hover:text-yellow-400 transition-colors"
                    fill="currentColor"
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="comment" className="block text-sm font-medium text-gray-700">
              ความคิดเห็น (ไม่บังคับ)
            </label>
            <textarea
              id="comment"
              name="comment"
              rows={4}
              className="mt-1 min-h-[112px] w-full rounded-xl border border-blue-200 px-4 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
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
    </div>
  );
}


export const dynamic = 'force-dynamic';
