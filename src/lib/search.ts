// Thai-tolerant course search (P3 big bet, no external service).
// Normalizes Thai vowels/tone marks away so สะกดผิด/ไม่ครบก็เจอ, then scores
// title > teacher > subject matches. Runs in memory over the current page of
// courses — a stepping stone to trigram/Algolia when tutors reach hundreds.
export function normalizeThaiSearch(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[่-๋็]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SearchableCourse {
  id: string;
  title?: string;
  teacherName?: string;
  subjectName?: string;
}

export function scoreCourseSearch(course: SearchableCourse, query: string): number {
  const q = normalizeThaiSearch(query);
  if (!q) return 0;
  const terms = q.split(' ').filter(Boolean);
  const title = normalizeThaiSearch(course.title || '');
  const teacher = normalizeThaiSearch(course.teacherName || '');
  const subject = normalizeThaiSearch(course.subjectName || '');
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += term.length >= 3 ? 3 : 2;
    if (teacher.includes(term)) score += 2;
    if (subject.includes(term)) score += 1;
  }
  return score;
}

export function rankCourseSearch<T extends SearchableCourse>(courses: T[], query: string): T[] {
  if (!normalizeThaiSearch(query)) return courses;
  return courses
    .map((c) => ({ c, score: scoreCourseSearch(c, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.c);
}
