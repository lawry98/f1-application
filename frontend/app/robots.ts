import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/site';

/** `/robots.txt`: everything is crawlable except the `/candy` styleguide. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/candy' },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
