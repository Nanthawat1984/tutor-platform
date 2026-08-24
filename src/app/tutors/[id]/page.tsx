import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, GraduationCap, MapPin, Star } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getPublicTutorById } from '@/lib/seo/public-teachers';
import { formatCurrency, getInitials } from '@/lib/utils';
import { SITE_URL } from '@/lib/seo/site';

interface TutorPageProps {
  params: Promise<{ id: string }>;
}

function formatCourseFormat(format: string) {
  const labels: Record<string, string> = {
    one_on_one: 'ตัวต่อตัว',
    small_group: 'กลุ่มเล็ก',
    online: 'ออนไลน์',
    hybrid: 'ออนไลน์และออนไซต์',
  };
  return labels[format] || format;
}

export async function generateMetadata({ params }: TutorPageProps): Promise<Metadata> {
  const { id } = await params;
  const tutor = await getPublicTutorById(id);
  if (!tutor) return { title: 'ไม่พบโปรไฟล์ครู' };

  const subjects = Array.from(new Set(tutor.courses.map((course) => course.subjectName))).slice(0, 3).join(', ');
  return {
    title: `${tutor.name} — ครูพิเศษ${subjects ? ` ${subjects}` : ''}`,
    description: tutor.bio || `ดูโปรไฟล์คอร์สเรียนของ ${tutor.name} บน TutorFinder`,
    alternates: { canonical: `/tutors/${encodeURIComponent(tutor.id)}` },
    openGraph: {
      type: 'profile',
      title: `${tutor.name} — ครูพิเศษบน TutorFinder`,
      description: tutor.bio || `ดูคอร์สเรียนของ ${tutor.name}`,
      url: `${SITE_URL}/tutors/${encodeURIComponent(tutor.id)}`,
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function PublicTutorPage({ params }: TutorPageProps) {
  const { id } = await params;
  const tutor = await getPublicTutorById(id);
  if (!tutor) notFound();

  const subjects = Array.from(new Set(tutor.courses.map((course) => course.subjectName)));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: tutor.name,
    description: tutor.bio || undefined,
    url: `${SITE_URL}/tutors/${encodeURIComponent(tutor.id)}`,
    image: tutor.photoURL || undefined,
    jobTitle: 'ครูพิเศษ',
    knowsAbout: subjects,
    ...(tutor.totalReviews > 0 && tutor.rating > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: tutor.rating,
            reviewCount: tutor.totalReviews,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  return (
    <main className="app-shell min-h-screen">
      <header className="border-b-2 border-pink-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/tutors" className="inline-flex items-center gap-2 text-sm font-bold text-pink-600 hover:text-pink-800">
            <ArrowLeft className="h-4 w-4" /> กลับไปค้นหาครู
          </Link>
          <Link href="/" className="flex items-center gap-2 text-sm font-extrabold text-pink-600">
            <GraduationCap className="h-5 w-5" /> TutorFinder
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <Card className="overflow-hidden p-0">
          <div className="h-28 bg-gradient-to-r from-pink-600 via-rose-600 to-indigo-600" />
          <div className="px-5 pb-7 sm:px-8">
            <div className="-mt-10 flex flex-col gap-5 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-pink-100 to-rose-100 text-2xl font-extrabold text-pink-700 shadow-elevated sm:h-24 sm:w-24">
                  {getInitials(tutor.name)}
                </div>
                <div className="pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">{tutor.name}</h1>
                    {tutor.isVerified && <CheckCircle2 className="h-5 w-5 text-sky-500" aria-label="ยืนยันแล้ว" />}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {tutor.rating > 0 ? tutor.rating.toFixed(1) : 'ใหม่'}</span>
                    {tutor.totalReviews > 0 && <span>{tutor.totalReviews} รีวิว</span>}
                    <span>{tutor.experienceYears} ปีประสบการณ์</span>
                  </div>
                </div>
              </div>
              <Link href="/register?role=parent" className="inline-flex items-center justify-center gap-2 rounded-xl bg-edu-gradient px-5 py-3 text-sm font-bold text-white shadow-button">
                สมัครเพื่อเริ่มจอง <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {subjects.map((subject) => <Badge key={subject} variant="info">{subject}</Badge>)}
              {tutor.locations.map((location) => <Badge key={location} variant="outline"><MapPin className="h-3 w-3" />{location}</Badge>)}
            </div>
          </div>
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900"><GraduationCap className="h-5 w-5 text-pink-500" /> เกี่ยวกับครู</h2>
            <p className="mt-4 whitespace-pre-line leading-relaxed text-slate-600">{tutor.bio || 'ครูพิเศษพร้อมช่วยวางแผนการเรียนให้เหมาะกับผู้เรียน'}</p>
            {tutor.education && <p className="mt-5 text-sm text-slate-600"><span className="font-bold text-slate-800">การศึกษา:</span> {tutor.education}</p>}
            {tutor.teachingStyle.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{tutor.teachingStyle.map((style) => <Badge key={style} variant="primary">{style}</Badge>)}</div>}
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900"><BookOpen className="h-5 w-5 text-pink-500" /> คอร์สเรียน</h2>
            <div className="mt-4 space-y-4">
              {tutor.courses.map((course) => (
                <div key={course.id} className="rounded-2xl border-2 border-pink-100/70 bg-white/70 p-4">
                  <h3 className="font-bold text-slate-900">{course.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-2"><Badge variant="info">{course.subjectName}</Badge><Badge variant="outline">{course.level}</Badge><Badge variant="default">{formatCourseFormat(course.format)}</Badge></div>
                  {course.description && <p className="mt-3 text-sm leading-relaxed text-slate-600">{course.description}</p>}
                  <div className="mt-4 flex items-center justify-between gap-3"><span className="text-sm text-slate-500">{course.durationMinutes} นาที/ครั้ง</span><span className="font-extrabold text-pink-700">{formatCurrency(course.pricePerSession)}</span></div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="mt-8 rounded-3xl border-2 border-pink-100 bg-pink-50/70 p-6 text-center sm:p-8">
          <h2 className="text-2xl font-extrabold text-slate-900">พร้อมเริ่มเรียนกับครูที่ใช่หรือยัง?</h2>
          <p className="mt-2 text-slate-600">สมัครฟรี แล้วจัดการการจอง ตารางเรียน และการชำระเงินได้ในที่เดียว</p>
          <Link href="/register?role=parent" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-edu-gradient px-5 py-3 text-sm font-bold text-white shadow-button">เริ่มใช้งานฟรี <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
