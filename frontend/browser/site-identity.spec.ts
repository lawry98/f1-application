import { AA_SMALL_TEXT, expectContrast } from './support/contrast';
import { waitForMotionToSettle } from './support/motion';
import { waitForMain } from './support/page-content';
import { expect, test } from './support/test';

/**
 * What a link preview sees. Next streams metadata after the first paint for a browser on a
 * dynamic route but blocks for a known bot, so asking as one reads the `<head>` a preview reads.
 */
const CRAWLER = 'facebookexternalhit/1.1';

function metaContent(html: string, key: string): string | undefined {
  return new RegExp(`<meta (?:property|name)="${key}" content="([^"]+)"`).exec(html)?.[1];
}

/*
 * Swept from the sitemap rather than listed, because the defect is per route and silent: a
 * segment whose `metadata` sets its own `openGraph` replaces the inherited object whole, so the
 * root `opengraph-image` vanishes from that one page while every other page keeps it. `/tyres`
 * shipped exactly that. Every route has to be asked.
 */
test('every sitemap route names an absolute og:image and twitter:image that resolve', async ({
  request,
}) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!));
  expect(locs.length, 'sitemap lists no routes').toBeGreaterThan(1);
  // The build's NEXT_PUBLIC_SITE_URL, or its default. The sitemap and the images must agree.
  const origin = locs[0]!.origin;

  const images = new Set<string>();
  for (const { pathname } of locs) {
    const html = await (await request.get(pathname, { headers: { 'user-agent': CRAWLER } })).text();
    const head = html.slice(0, html.indexOf('</head>'));
    for (const key of ['og:image', 'twitter:image']) {
      const content = metaContent(head, key);
      expect.soft(content, `${pathname} has no ${key} in <head>`).toBeDefined();
      if (!content) continue;
      const url = new URL(content);
      expect.soft(url.origin, `${pathname}'s ${key} is not on the site origin`).toBe(origin);
      images.add(url.pathname + url.search);
    }
  }

  for (const image of images) {
    const response = await request.get(image);
    expect.soft(response.status(), image).toBe(200);
    expect.soft(response.headers()['content-type'], image).toBe('image/png');
  }
});

test('the home page links its icons and names its author', async ({ request }) => {
  const html = await (await request.get('/', { headers: { 'user-agent': CRAWLER } })).text();
  const head = html.slice(0, html.indexOf('</head>'));

  expect(head).toMatch(/<link rel="icon" href="\/favicon\.ico[^"]*"/);
  expect(head).toMatch(/<link rel="icon" href="\/icon\.svg[^"]*"[^>]* type="image\/svg\+xml"/);
  expect(head).toMatch(/<link rel="apple-touch-icon" href="\/apple-icon\.png[^"]*"/);
  expect(metaContent(head, 'author')).toBe('Lawrence Crasto');
  expect(metaContent(head, 'creator')).toBe('Lawrence Crasto');
});

for (const [path, type] of [
  ['/favicon.ico', 'image/x-icon'],
  ['/icon.svg', 'image/svg+xml'],
  ['/apple-icon.png', 'image/png'],
  ['/robots.txt', 'text/plain'],
  ['/sitemap.xml', 'application/xml'],
] as const) {
  test(`${path} is served as ${type}`, async ({ request }) => {
    const response = await request.get(path);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain(type);
  });
}

/*
 * The byline sits on two different backdrops: the footer's warm card, under the topo texture,
 * and /credits' bare `zinc-950`. Each is measured where it is painted.
 */
for (const { route, width, site } of [
  { route: '/', width: 1440, site: 'footer byline on base-warm under the topo texture' },
  { route: '/', width: 390, site: 'footer byline on base-warm under the topo texture, phone' },
  { route: '/credits', width: 1440, site: '/credits licence byline on zinc-950' },
]) {
  test(`the byline on ${route} at ${width}px clears AA`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    await waitForMain(page);
    const link = page.getByRole('link', { name: 'Source on GitHub' });
    await link.scrollIntoViewIfNeeded();
    await waitForMotionToSettle(page);

    // The link first: measuring the paragraph hides and restores the link's glyphs too, and the
    // link's `transition-colors` then animates back from transparent.
    await expectContrast(link, { atLeast: AA_SMALL_TEXT, site: `${site}, the repo link` });
    await expectContrast(page.locator('p', { has: link }), { atLeast: AA_SMALL_TEXT, site });
  });
}
