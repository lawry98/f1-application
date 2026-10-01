import { describe, expect, it } from 'vitest';

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { NAV_LINKS } from '@/components/landing/links';
import index from '@/data/circuits/index.json';
import catalog from '@/data/circuits/catalog.json';

/** The suite runs with `NEXT_PUBLIC_SITE_URL` unset, so every URL is on the default origin. */
const ORIGIN = 'http://localhost:3000';

function sitemapPaths(): string[] {
  return sitemap().map(({ url }) => {
    expect(url.startsWith(`${ORIGIN}/`), url).toBe(true);
    return url.slice(ORIGIN.length);
  });
}

describe('sitemap', () => {
  it('lists the home page and every primary nav destination', () => {
    const paths = sitemapPaths();

    expect(paths).toContain('/');
    for (const { href } of NAV_LINKS) expect(paths).toContain(href);
  });

  it('lists each circuit page under its canonical slug', () => {
    const paths = sitemapPaths();

    for (const path of ['/circuits/monaco', '/circuits/spa-francorchamps', '/circuits/sakhir']) {
      expect(paths).toContain(path);
    }
    expect(paths.filter((p) => p.startsWith('/circuits/'))).toHaveLength(catalog.length);
  });

  /*
   * An alias slug (`bahrain`, `monte-carlo`, `spa`) redirects to its canonical page, so listing
   * one hands a crawler a redirect and a duplicate of a URL it already has. The aliases are the
   * index keys that are no circuit's own slug.
   */
  it('leaves out every alias slug', () => {
    const paths = sitemapPaths();
    const canonical = new Set(catalog.map((c) => c.slug));
    const aliases = Object.keys(index).filter((slug) => !canonical.has(slug));

    expect(aliases).toEqual(expect.arrayContaining(['bahrain', 'monte-carlo', 'spa']));
    for (const alias of aliases) expect(paths).not.toContain(`/circuits/${alias}`);
  });

  it('never lists /candy', () => {
    expect(sitemapPaths().filter((p) => p.startsWith('/candy'))).toEqual([]);
  });

  it('lists each URL once', () => {
    const paths = sitemapPaths();

    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('robots', () => {
  it('lets every crawler in except to /candy', () => {
    const { rules } = robots();

    expect(rules).toEqual({ userAgent: '*', allow: '/', disallow: '/candy' });
  });

  it('points crawlers at the absolute sitemap URL', () => {
    expect(robots().sitemap).toBe(`${ORIGIN}/sitemap.xml`);
  });
});
