import type { MetadataRoute } from 'next';
import { listPublicTutorIds } from '@/lib/seo/public-teachers';
import { SITE_URL } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/tutors`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const tutors = await listPublicTutorIds();
  return [
    ...staticPages,
    ...tutors.map((tutor) => ({
      url: `${SITE_URL}/tutors/${encodeURIComponent(tutor.id)}`,
      lastModified: tutor.updatedAt || undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
