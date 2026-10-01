/**
 * The site's own identity: where it is served from, who built it, where its source lives.
 *
 * **This is the only module that reads `NEXT_PUBLIC_SITE_URL`.** Every absolute URL the site emits
 * about itself — `metadataBase` (and so every `og:image` and `twitter:image`), the sitemap's
 * `<loc>`s and robots.txt's `Sitemap:` line — is resolved against `SITE_URL`, so a crawler or a
 * link-preview bot is handed the deployed origin and never a relative path it cannot fetch.
 *
 * It is a `NEXT_PUBLIC_` variable, so Next inlines it **at build time**: it has to be set when
 * `pnpm build` runs, not only when `pnpm start` does.
 */

export const DEFAULT_SITE_URL = 'http://localhost:3000';

export const AUTHOR_NAME = 'Lawrence Crasto';
export const REPO_URL = 'https://github.com/lawry98/f1-application';

/**
 * The site's origin, from the raw variable.
 *
 * Unset (or blank) falls back to the dev server, and a production build says so out loud: every
 * page still renders with a localhost origin, so nothing else would ever notice that every shared
 * link's preview image points at a machine nobody else can reach. A value that is set but wrong
 * throws instead — that is a typo, and a build is the cheapest place to find it.
 */
export function resolveSiteUrl(
  raw: string | undefined,
  nodeEnv: string | undefined,
  warn: (message: string) => void = console.warn,
): URL {
  if (!raw) {
    if (nodeEnv === 'production') {
      warn(
        `NEXT_PUBLIC_SITE_URL is not set, so og:image, sitemap.xml and robots.txt point at ` +
          `${DEFAULT_SITE_URL}. Set it to the deployed origin (e.g. https://f1.example.com) ` +
          `before \`pnpm build\` — see README, "Deploying it".`,
      );
    }
    return new URL(DEFAULT_SITE_URL);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_SITE_URL is not an absolute URL: "${raw}"`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`NEXT_PUBLIC_SITE_URL must be http(s), got "${raw}"`);
  }
  // Routes resolve against the origin, so a path here would vanish from every URL silently.
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`NEXT_PUBLIC_SITE_URL must be an origin with no path, got "${raw}"`);
  }
  return url;
}

export const SITE_URL: URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV);

/** A route on this site as an absolute URL: `/briefing` → `https://…/briefing`. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}
