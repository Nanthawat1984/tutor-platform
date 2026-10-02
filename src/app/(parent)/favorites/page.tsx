import { getServerDb } from '@/lib/firebase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Heart, Star } from 'lucide-react';
import { COLLECTIONS } from '@/types/firestore';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RatingStars } from '@/components/ui/rating';
import { DashboardLayout, EmptyState } from '@/components/layout/dashboard';
import { PARENT_NAV_ITEMS } from '@/components/layout/nav';
import { requireSessionUser } from '@/lib/auth/session';
import FavoriteTeacherButton from '@/components/parent/favorite-teacher-button';

// /favorites — ครูที่ผู้ปกครองกดหัวใจเก็บไว้ (ข้อมูลส่วนตัว ดูได้คนเดียว)
export default async function FavoritesPage() {
  const db = getServerDb();
  if (!db) return redirect('/login');
  const session = await requireSessionUser();
  const parentId = session.uid;

  const favSnap = await db.collection(COLLECTIONS.PARENT_FAVORITES)
    .where('parentId', '==', parentId)
    .limit(100)
    .get();
  const favorites = favSnap.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

  // เติมข้อมูลครู + คอร์สที่เปิดอยู่ (ครูอาจถูกลบ/ปิดเครื่องหมายไว้)
  const teacherIds = favorites.map((f: any) => f.teacherId).filter(Boolean);
  const teacherNames = new Map<string, string>();
  let teachers: any[] = [];
  if (teacherIds.length) {
    const [userSnaps, profileSnaps] = await Promise.all([
      db.getAll(...teacherIds.map((id) => db.collection(COLLECTIONS.USERS).doc(id))),
      db.getAll(...teacherIds.map((id) => db.collection(COLLECTIONS.TEACHERS).doc(id))),
    ]);
    userSnaps.forEach((s) => {
      if (s.exists) teacherNames.set(s.id, (s.data() as any)?.displayName || 'ครู');
    });
    const coursesSnap = await db.collection(COLLECTIONS.COURSES)
      .where('teacherId', 'in', teacherIds.slice(0, 30))
      .where('isActive', '==', true)
      .get();
    const coursesByTeacher = new Map<string, any[]>();
    coursesSnap.docs.forEach((d: any) => {
      const data = { id: d.id, ...d.data() };
      const list = coursesByTeacher.get(data.teacherId) || [];
      list.push(data);
      coursesByTeacher.set(data.teacherId, list);
    });
    teachers = favorites.map((f: any) => {
      const profile = profileSnaps.find((s) => s.id === f.teacherId)?.data() as any;
      const courses = coursesByTeacher.get(f.teacherId) || [];
      const cheapest = courses.reduce<number | null>(
        (min, c) => (min === null || Number(c.pricePerSession) < min ? Number(c.pricePerSession) : min),
        null,
      );
      return {
        favoriteId: f.id,
        teacherId: f.teacherId,
        teacherName: teacherNames.get(f.teacherId) || f.teacherName || 'ครู',
        photoURL: profile?.photoURL || null,
        rating: Number(profile?.rating) || 0,
        totalReviews: Number(profile?.totalReviews) || 0,
        courses: courses.slice(0, 3),
        courseCount: courses.length,
        cheapest,
        savedAt: f.createdAt?.toDate?.() || null,
      };
    });
  }

  return (
    <DashboardLayout
      title="ครูที่สนใจ"
      navItems={PARENT_NAV_ITEMS}
      role="parent"
      userName={session.displayName || 'ผู้ปกครอง'}
    >
      <p className="mb-6 text-sm text-slate-500">
        ครูที่คุณกดหัวใจไว้ — ดูได้คนเดียว ใช้เปรียบเทียบก่อนตัดสินใจจอง
      </p>

      {teachers.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-7 w-7" />}
          title="ยังไม่มีครูในรายการโปรด"
          description="กดหัวใจที่การ์ดคอร์สในหน้าค้นหาครู เพื่อเก็บไว้ดูภายหลัง"
          action={{ label: 'ค้นหาครู', href: '/explore' }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teachers.map((t) => (
            <Card key={t.favoriteId} className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/teachers/${t.teacherId}`} className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-pink-100 to-rose-100">
                    {t.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.photoURL} alt={t.teacherName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-pink-700">{getInitials(t.teacherName)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-900">ครู{t.teacherName}</h3>
                    <RatingStars rating={t.rating} showValue reviewCount={t.totalReviews} size="sm" className="mt-0.5" />
                    <p className="mt-0.5 text-xs text-slate-400">
                      {t.courseCount > 0
                        ? `${t.courseCount} คอร์ส${t.cheapest != null ? ` • เริ่ม ${formatCurrency(t.cheapest)}` : ''}`
                        : 'ยังไม่มีคอร์สที่เปิดอยู่'}
                    </p>
                  </div>
                </Link>
                <FavoriteTeacherButton teacherId={t.teacherId} initialFavorite />
              </div>

              {t.courses.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {t.courses.map((c: any) => (
                    <Link
                      key={c.id}
                      href={`/teachers/${t.teacherId}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-pink-100/70 bg-pink-50/40 px-3 py-2 text-sm hover:bg-pink-50"
                    >
                      <span className="truncate font-semibold text-slate-800">{c.title}</span>
                      <Badge variant="info">{formatCurrency(c.pricePerSession)}</Badge>
                    </Link>
                  ))}
                </div>
              )}

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-pink-100/70 pt-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 text-amber-400" />
                  บันทึกเมื่อ {t.savedAt ? formatDate(t.savedAt.toISOString().slice(0, 10), 'd MMM yyyy') : '-'}
                </span>
                <Link href={`/teachers/${t.teacherId}`} className="font-bold text-pink-600 hover:underline">
                  ดูโปรไฟล์ →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';