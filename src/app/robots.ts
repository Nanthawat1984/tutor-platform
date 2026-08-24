import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/','/tutors'],
        disallow: [
          '/api/',
          '/login',
          '/register',
          '/auth-handler',
          '/explore',
          '/teachers/',
          '/dashboard',
          '/courses',
          '/schedule',
          '/attendance',
          '/earnings',
          '/students',
          '/profile',
          '/bookings',
          '/progress',
          '/my-',
          '/admin/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
