import type { SourceRef } from '@/data/tyres-data';

export interface SourceListProps {
  sources: SourceRef[];
  /** Accessible name for the list, since several appear on one page. */
  label: string;
}

/**
 * A citation list, de-duplicated by URL.
 *
 * The de-duplication matters because callers routinely concatenate a scenario's source onto a
 * compound's — and those overlap often — which would otherwise render the same Pirelli page twice
 * in a row and read as a mistake. Keyed by URL for the same reason: two entries can share a title.
 */
export function SourceList({ sources, label }: SourceListProps) {
  const seen = new Map<string, SourceRef>();
  for (const s of sources) if (!seen.has(s.url)) seen.set(s.url, s);

  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
        {label}
      </h4>
      <ul className="mt-2 space-y-1.5" role="list">
        {Array.from(seen.values()).map((s) => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs leading-relaxed text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-f1-red focus-visible:ring-offset-2 focus-visible:ring-offset-base-warm"
            >
              {`${s.publisher} — ${s.title}`}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
