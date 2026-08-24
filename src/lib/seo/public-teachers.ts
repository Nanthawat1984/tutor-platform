import { COLLECTIONS } from '@/types/firestore';
import { getServerDb } from '@/lib/firebase/server';

export interface PublicTutorCourse {
  id: string;
  title: string;
  description: string | null;
  subjectName: string;
  level: string;
  format: string;
  pricePerSession: number;
  durationMinutes: number;
  locations: string[];
}

export interface PublicTutor {
  id: string;
  name: string;
  bio: string | null;
  education: string | null;
  experienceYears: number;
  teachingStyle: string[];
  photoURL: string | null;
  isVerified: boolean;
  rating: number;
  totalReviews: number;
  courses: PublicTutorCourse[];
  locations: string[];
  updatedAt: Date | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function toDate(value: unknown): Date | null {
  if (!value || typeof value !== 'object') return null;
  const timestamp = value as { toDate?: () => Date };
  return typeof timestamp.toDate === 'function' ? timestamp.toDate() : null;
}

function publicLocations(center: Record<string, unknown>): string[] {
  const district = asString(center.district);
  const province = asString(center.province);
  return [district, province].filter((value): value is string => Boolean(value));
}

function mapCourse(
  id: string,
  data: Record<string, unknown>,
  centers: Map<string, Record<string, unknown>>,
): PublicTutorCourse {
  const centerId = asString(data.centerId);
  const locations = centerId ? publicLocations(centers.get(centerId) || {}) : [];
  return {
    id,
    title: asString(data.title) || 'คอร์สเรียน',
    description: asString(data.description),
    subjectName: asString(data.subjectName) || 'วิชาเรียน',
    level: asString(data.level) || 'ทุกระดับ',
    format: asString(data.format) || 'ไม่ระบุรูปแบบ',
    pricePerSession: asNumber(data.pricePerSession),
    durationMinutes: asNumber(data.durationMinutes),
    locations,
  };
}

async function getPublicTutorCourses(
  db: NonNullable<ReturnType<typeof getServerDb>>,
  teacherId: string,
): Promise<PublicTutorCourse[]> {
  const snapshot = await db
    .collection(COLLECTIONS.COURSES)
    .where('teacherId', '==', teacherId)
    .where('isActive', '==', true)
    .limit(20)
    .get();

  const courseData = snapshot.docs.map((doc) => ({ id: doc.id, data: asRecord(doc.data()) }));
  const centerIds = Array.from(new Set(courseData.map(({ data }) => asString(data.centerId)).filter((id): id is string => Boolean(id))));
  const centerSnapshots = centerIds.length
    ? await db.getAll(...centerIds.map((id) => db.collection(COLLECTIONS.CENTERS).doc(id)))
    : [];
  const centers = new Map(
    centerSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => [snapshot.id, asRecord(snapshot.data())]),
  );

  return courseData.map(({ id, data }) => mapCourse(id, data, centers));
}

async function getPublicCoursesByTeacherIds(
  db: NonNullable<ReturnType<typeof getServerDb>>,
  teacherIds: string[],
): Promise<Map<string, PublicTutorCourse[]>> {
  if (teacherIds.length === 0) return new Map();

  const snapshots = await Promise.all(
    Array.from({ length: Math.ceil(teacherIds.length / 30) }, (_, index) => {
      const ids = teacherIds.slice(index * 30, index * 30 + 30);
      return db
        .collection(COLLECTIONS.COURSES)
        .where('teacherId', 'in', ids)
        .where('isActive', '==', true)
        .limit(200)
        .get();
    }),
  );
  const courseData = snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => ({
    id: doc.id,
    data: asRecord(doc.data()),
  })));
  const centerIds = Array.from(new Set(courseData.map(({ data }) => asString(data.centerId)).filter((id): id is string => Boolean(id))));
  const centerSnapshots = centerIds.length
    ? await db.getAll(...centerIds.map((id) => db.collection(COLLECTIONS.CENTERS).doc(id)))
    : [];
  const centers = new Map(
    centerSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => [snapshot.id, asRecord(snapshot.data())]),
  );
  const coursesByTeacher = new Map<string, PublicTutorCourse[]>();
  for (const { id, data } of courseData) {
    const teacherId = asString(data.teacherId);
    if (!teacherId) continue;
    const courses = coursesByTeacher.get(teacherId) || [];
    courses.push(mapCourse(id, data, centers));
    coursesByTeacher.set(teacherId, courses);
  }
  return coursesByTeacher;
}

function toPublicTutor(
  id: string,
  user: Record<string, unknown>,
  teacher: Record<string, unknown>,
  courses: PublicTutorCourse[],
): PublicTutor {
  const locations = Array.from(new Set(courses.flatMap((course) => course.locations)));
  return {
    id,
    name: asString(user.displayName) || 'ครูพิเศษ',
    bio: asString(teacher.bio),
    education: asString(teacher.education),
    experienceYears: asNumber(teacher.experienceYears),
    teachingStyle: asStringArray(teacher.teachingStyle),
    photoURL: asString(user.photoURL),
    isVerified: user.isVerified === true,
    rating: Math.max(0, Math.min(5, asNumber(teacher.rating))),
    totalReviews: Math.max(0, Math.floor(asNumber(teacher.totalReviews))),
    courses,
    locations,
    updatedAt: toDate(teacher.updatedAt),
  };
}

export async function getPublicTutorById(id: string): Promise<PublicTutor | null> {
  try {
    const db = getServerDb();
    if (!db || !id.trim()) return null;

    const [userSnapshot, teacherSnapshot] = await Promise.all([
      db.collection(COLLECTIONS.USERS).doc(id).get(),
      db.collection(COLLECTIONS.TEACHERS).doc(id).get(),
    ]);
    if (!teacherSnapshot.exists || !userSnapshot.exists) return null;

    const user = asRecord(userSnapshot.data());
    const teacher = asRecord(teacherSnapshot.data());
    if (teacher.isActive !== true || user.role !== 'teacher') return null;

    const courses = await getPublicTutorCourses(db, id);
    if (courses.length === 0) return null;
    return toPublicTutor(id, user, teacher, courses);
  } catch {
    return null;
  }
}

export async function listPublicTutors(): Promise<PublicTutor[]> {
  try {
    const db = getServerDb();
    if (!db) return [];

    const teacherSnapshot = await db
      .collection(COLLECTIONS.TEACHERS)
      .where('isActive', '==', true)
      .limit(50)
      .get();
    if (teacherSnapshot.empty) return [];

    const teacherIds = teacherSnapshot.docs.map((snapshot) => snapshot.id);
    const userSnapshots = await db.getAll(...teacherIds.map((id) => db.collection(COLLECTIONS.USERS).doc(id)));
    const users = new Map(
      userSnapshots
        .filter((snapshot) => snapshot.exists && asRecord(snapshot.data()).role === 'teacher')
        .map((snapshot) => [snapshot.id, asRecord(snapshot.data())]),
    );
    const publicTeacherIds = teacherIds.filter((id) => users.has(id));
    const coursesByTeacher = await getPublicCoursesByTeacherIds(db, publicTeacherIds);

    const tutors = teacherSnapshot.docs
      .filter((snapshot) => users.has(snapshot.id))
      .map((snapshot) =>
        toPublicTutor(
          snapshot.id,
          users.get(snapshot.id) || {},
          asRecord(snapshot.data()),
          coursesByTeacher.get(snapshot.id) || [],
        )
      )
      .filter((tutor) => tutor.courses.length > 0);
    return tutors;
  } catch {
    return [];
  }
}

export async function listPublicTutorIds(): Promise<{ id: string; updatedAt: Date | null }[]> {
  try {
    const tutors = await listPublicTutors();
    return tutors.map((tutor) => ({ id: tutor.id, updatedAt: tutor.updatedAt }));
  } catch {
    return [];
  }
}
