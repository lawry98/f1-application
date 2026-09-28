import { circuitBySlug, type CircuitEntry } from '@/lib/circuit-geometry';

export type CircuitRoute =
  | { kind: 'render'; entry: CircuitEntry }
  | { kind: 'redirect'; to: string; entry: CircuitEntry }
  | { kind: 'notFound' };

/**
 * What `/circuits/[slug]` does with a request, as a pure function so it is testable — the page
 * itself is an async server component, which RTL cannot render.
 *
 * An alias (`bahrain`, `monte-carlo`) or a mis-cased slug redirects to the canonical one so a
 * circuit has exactly one URL. A single four-digit `?year=` survives the redirect; anything else
 * is dropped rather than forwarded, since the client would ignore it anyway.
 */
export function resolveCircuitRoute(
  slug: string,
  year: string | string[] | undefined,
): CircuitRoute {
  const found = circuitBySlug(slug);
  if (!found) return { kind: 'notFound' };
  if (found.canonical) return { kind: 'render', entry: found.entry };

  const path = `/circuits/${found.entry.slug}`;
  return {
    kind: 'redirect',
    entry: found.entry,
    to: typeof year === 'string' && /^\d{4}$/.test(year) ? `${path}?year=${year}` : path,
  };
}
