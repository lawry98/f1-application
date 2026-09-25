import { test as base, expect } from '@playwright/test';

import { mockApi } from './api-mocks';

/** `test` with the API mocked on every page, and a failure if any `/api/` call went unmocked. */
export const test = base.extend<{ apiMocks: string[] }>({
  apiMocks: [
    async ({ page }, use) => {
      const unmocked = await mockApi(page);
      await use(unmocked);
      expect(unmocked, 'an /api/ request had no fixture in tests/fixtures').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
