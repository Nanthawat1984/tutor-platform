import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, GraduationCap, MapPin, Search, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getInitials } from '@/lib/utils';
import { listPublicTutors } from '@/lib/seo/public-teachers';
import { serializeJsonLd, SITE_URL } from '@/lib/seo/site';

export const metadata: Metadata = {
  title: 'ค้นหาครูพิเศษและติวเตอร์',
  description: 'ค้นหาครูพิเศษและคอร์สเรียนที่เหมาะกับวิชา ระดับชั้น และพื้นที่ของคุณบน TutorFinder',
  alternates: { canonical: '/tutors' },
  openGraph: {
    type: 'website',
    title: 'ค้นหาครูพิเศษและติวเตอร์ | TutorFinder',
    description: 'ค้นหาครูพิเศษและคอร์สเรียนที่เหมาะกับวิชา ระดับชั้น และพื้นที่ของคุณบน TutorFinder',
    url: `${SITE_URL}/tutors`,
  },
};

export const dynamic = 'force-dynamic';

function formatCourseCount(count: number) {
  return `${count} คอร์ส`;
}

export default async function PublicTutorsPage() {
  const tutors = await listPublicTutors();
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'ครูพิเศษและติวเตอร์บน TutorFinder',
    itemListElement: tutors.map((tutor, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: tutor.name,
      url: `${SITE_URL}/tutors/${encodeURIComponent(tutor.id)}`,
    })),
  };

  return (
    <main className="app-shell min-h-screen">
      <header className="border-b-2 border-pink-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="TutorFinder หน้าหลัก">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-edu-gradient shadow-button">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl font-extrabold tracking-tight text-pink-600">
              Tutor<span className="text-rose-400">Finder</span>
            </span>
          </Link>
          <Link href="/register?role=parent" className="rounded-2xl bg-edu-gradient px-4 py-2 text-sm font-bold text-white shadow-button">
            เริ่มใช้งานฟรี
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <span className="pill-badge-primary">ค้นหาครูที่ใช่สำหรับคุณ</span>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
            ครูพิเศษและติวเตอร์คุณภาพ
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            สำรวจครูพิเศษ วิชาเรียน และคอร์สที่เปิดรับบน TutorFinder เพื่อวางแผนการเรียนที่เหมาะกับผู้เรียนแต่ละคน
          </p>
        </div>

        <div className="mt-10 flex items-center gap-3 rounded-2xl border-2 border-pink-100 bg-white/75 px-5 py-4 text-sm text-slate-600 shadow-card">
          <Search className="h-5 w-5 text-pink-500" />
          <span>เลือกดูโปรไฟล์ครูและคอร์สเรียน แล้วสมัครสมาชิกเพื่อเริ่มจองเรียน</span>
        </div>

        {tutors.length === 0 ? (
          <Card className="mt-8 text-center">
            <h2 className="text-xl font-bold text-slate-900">กำลังเตรียมรายชื่อครูพิเศษ</h2>
            <p className="mt-2 text-sm text-slate-500">สมัครสมาชิกเพื่อรับการแจ้งเตือนเมื่อมีคอร์สใหม่</p>
            <Link href="/register?role=parent" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-edu-gradient px-5 py-3 text-sm font-bold text-white">
              สมัครผู้ปกครอง <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tutors.map((tutor) => (
              <Card key={tutor.id} hoverable className="flex flex-col">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-100 to-rose-100 text-lg font-extrabold text-pink-700">
                    {getInitials(tutor.name)}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-extrabold text-slate-900">{tutor.name}</h2>
                    <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      {tutor.rating > 0 ? tutor.rating.toFixed(1) : 'ใหม่'}
                      {tutor.totalReviews > 0 && <span>({tutor.totalReviews} รีวิว)</span>}
                    </div>
                  </div>
                </div>

                <p className="mt-4 line-clamp-3 min-h-[4.5rem] text-sm leading-relaxed text-slate-600">
                  {tutor.bio || 'ครูพิเศษพร้อมช่วยวางแผนการเรียนให้เหมาะกับผู้เรียน'}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {tutor.courses.slice(0, 3).map((course) => <Badge key={course.id} variant="info">{course.subjectName}</Badge>)}
                  {tutor.locations.slice(0, 2).map((location) => (
                    <Badge key={location} variant="outline"><MapPin className="h-3 w-3" />{location}</Badge>
                  ))}
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 border-t-2 border-pink-100/70 pt-5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <BookOpen className="h-4 w-4 text-pink-500" /> {formatCourseCount(tutor.courses.length)}
                  </span>
                  <Link href={`/tutors/${encodeURIComponent(tutor.id)}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-pink-600 hover:text-pink-800">
                    ดูโปรไฟล์ <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemList) }} />
    </main>
  );
}
