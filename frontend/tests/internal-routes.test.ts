import { afterEach, describe, expect, it, vi } from 'vitest';

import { internalRoutesEnabled } from '@/lib/internal-routes';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('internalRoutesEnabled', () => {
  it('is off when ENABLE_INTERNAL_ROUTES is unset, which is production', () => {
    vi.stubEnv('ENABLE_INTERNAL_ROUTES', undefined);

    expect(internalRoutesEnabled()).toBe(false);
  });

  it('is on when ENABLE_INTERNAL_ROUTES is 1', () => {
    vi.stubEnv('ENABLE_INTERNAL_ROUTES', '1');

    expect(internalRoutesEnabled()).toBe(true);
  });

  it.each(['0', '', 'true', 'yes', ' 1'])('fails closed on %j', (raw) => {
    vi.stubEnv('ENABLE_INTERNAL_ROUTES', raw);

    expect(internalRoutesEnabled()).toBe(false);
  });

  it('reads the environment on every call, not once at import', () => {
    vi.stubEnv('ENABLE_INTERNAL_ROUTES', '1');
    expect(internalRoutesEnabled()).toBe(true);

    vi.stubEnv('ENABLE_INTERNAL_ROUTES', '0');
    expect(internalRoutesEnabled()).toBe(false);
  });
});
