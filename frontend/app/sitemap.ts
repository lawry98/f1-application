import type { MetadataRoute } from 'next';

import { NAV_LINKS } from '@/components/landing/links';
import { CIRCUIT_CATALOG } from '@/lib/circuit-geometry';
import { absoluteUrl } from '@/lib/site';

/**
 * `/sitemap.xml`: the home page, every primary nav destination, and one page per circuit.
 *
 * Circuits are listed under their canonical slug only. An alias (`/circuits/bahrain`) redirects to
 * the canonical page, so listing it would hand a crawler a redirect to a URL it already has.
 * `/candy` is an internal styleguide, served only with `ENABLE_INTERNAL_ROUTES=1`, so it is absent
 * here and disallowed in robots.txt.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '/',
    ...NAV_LINKS.map(({ href }) => href),
    ...CIRCUIT_CATALOG.map(({ slug }) => `/circuits/${slug}`),
  ];
  return paths.map((path) => ({ url: absoluteUrl(path) }));
}
