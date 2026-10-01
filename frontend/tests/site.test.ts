import { describe, expect, it, vi } from 'vitest';

import { absoluteUrl, resolveSiteUrl } from '@/lib/site';

describe('resolveSiteUrl', () => {
  it('defaults to the local dev server when the variable is unset', () => {
    expect(resolveSiteUrl(undefined, 'development', vi.fn()).href).toBe('http://localhost:3000/');
  });

  it('treats an empty value as unset, the way a blank line in .env leaves it', () => {
    expect(resolveSiteUrl('', 'development', vi.fn()).href).toBe('http://localhost:3000/');
  });

  it('uses the deployed origin when one is given, with or without a trailing slash', () => {
    expect(resolveSiteUrl('https://f1.example.com', 'production', vi.fn()).href).toBe(
      'https://f1.example.com/',
    );
    expect(resolveSiteUrl('https://f1.example.com/', 'production', vi.fn()).href).toBe(
      'https://f1.example.com/',
    );
  });

  /*
   * The failure this exists to make loud: a production build with no site URL ships every
   * og:image, the sitemap and robots.txt pointing at localhost, and every page still renders, so
   * nothing else would ever notice.
   */
  it('warns, naming the variable, when a production build has no site URL', () => {
    const warn = vi.fn();
    resolveSiteUrl(undefined, 'production', warn);

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_SITE_URL'));
  });

  it('stays quiet outside a production build', () => {
    const warn = vi.fn();
    resolveSiteUrl(undefined, 'development', warn);
    resolveSiteUrl(undefined, 'test', warn);

    expect(warn).not.toHaveBeenCalled();
  });

  it('stays quiet in production once the variable is set', () => {
    const warn = vi.fn();
    resolveSiteUrl('https://f1.example.com', 'production', warn);

    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['not a URL', 'f1.example.com'],
    ['not http(s)', 'ftp://f1.example.com'],
    // `absoluteUrl('/briefing')` resolves against the origin, so a path here would be dropped
    // from every URL without a word.
    ['carrying a path', 'https://example.com/f1'],
  ])('refuses a value %s rather than shipping a broken origin', (_label, raw) => {
    expect(() => resolveSiteUrl(raw, 'production', vi.fn())).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});

describe('absoluteUrl', () => {
  it('resolves a route against the site origin', () => {
    // The suite runs with the variable unset, so the origin is the default.
    expect(absoluteUrl('/briefing')).toBe('http://localhost:3000/briefing');
    expect(absoluteUrl('/')).toBe('http://localhost:3000/');
  });
});
