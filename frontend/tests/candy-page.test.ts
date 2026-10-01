import { afterEach, describe, expect, it, vi } from 'vitest';

import CandyPage, { dynamic, metadata } from '@/app/candy/page';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** What `notFound()` throws; Next turns it into the not-found page. */
const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';

describe('/candy', () => {
  it('is not found without ENABLE_INTERNAL_ROUTES', () => {
    vi.stubEnv('ENABLE_INTERNAL_ROUTES', undefined);

    expect(() => CandyPage()).toThrow(NOT_FOUND);
  });

  it('renders with ENABLE_INTERNAL_ROUTES=1', () => {
    vi.stubEnv('ENABLE_INTERNAL_ROUTES', '1');

    expect(() => CandyPage()).not.toThrow();
  });

  // A static page would read the flag once, at `pnpm build`, and serve that answer forever.
  it('renders per request, so the flag is read when the page is served', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('asks search engines not to index it, flag or no flag', () => {
    expect(metadata.robots).toEqual({ index: false });
  });
});
