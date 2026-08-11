import Image from 'next/image';

import { cn } from '@/lib/utils';
import { type CreditRow } from '@/lib/credits';

/**
 * The thumbnail-led credit table on `/credits`.
 *
 * Pure presentation over `CreditRow`s: it reads nothing, fetches nothing, and knows nothing about
 * where the rows came from. That split is what makes the credits testable at all — the page above
 * it is a server component doing file I/O, and this is the part with markup worth asserting on.
 *
 * A real `<table>`, not a div grid: five columns of tabular data whose header association is the
 * only thing that makes an author cell mean "author" to a screen reader.
 */

/** Small-caps tracked label, shared with the page. */
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400';
const CELL = 'border-t border-zinc-800 py-2 pr-3 align-middle text-zinc-300';
const SMALL_CELL = cn(CELL, 'text-[10px] sm:text-xs');
/** The link treatment /teams' credits footer already uses. */
const LINK =
  'rounded text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500';

/**
 * Photographs are square crops, so a square box is right. Logos are horizontal lockups running
 * from 0.91:1 to 9.48:1 (the Aston Martin wordmark) — `object-contain` in a 32px square would
 * draw that one ~3.4px tall, so they are sized by height with a wide max-width instead. Same
 * rule, and the same reason, as `components/teams/team-logo.tsx`.
 */
const THUMBNAIL = {
  photo: {
    column: 'w-[44px]',
    width: 32,
    height: 32,
    image: 'h-8 w-8 rounded object-cover',
    tile: '',
  },
  logo: {
    column: 'w-[88px]',
    width: 72,
    height: 20,
    image: 'h-5 w-auto max-w-[72px] object-contain',
    tile: 'rounded bg-zinc-900 px-2 py-1',
  },
} as const;

interface AttributionTableProps {
  rows: CreditRow[];
  /** `/drivers` or `/logos` — prefixed to `row.file` for the thumbnail src. */
  basePath: string;
  variant: 'photo' | 'logo';
  /** Heading over the subject column: "Driver" or "Team". */
  subjectLabel: string;
  /** Heading over the author column: "Author" or "Attributed to". */
  authorLabel: string;
  /** Visually hidden `<caption>`, so the table is announced as what it is. */
  caption: string;
  /**
   * Licence name → terms URL. Passed for the photograph table; omitted for the logo table, whose
   * rows are all `Public domain` with no terms row to point at. A licence that is absent from the
   * map renders as plain text.
   */
  licenceTerms?: Map<string, string>;
}

export function AttributionTable({
  rows,
  basePath,
  variant,
  subjectLabel,
  authorLabel,
  caption,
  licenceTerms,
}: AttributionTableProps) {
  const thumbnail = THUMBNAIL[variant];

  return (
    <table className="w-full table-fixed border-collapse text-left text-xs sm:text-[13px]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(thumbnail.column, LABEL, 'pb-2')}>
            <span className="sr-only">Asset</span>
          </th>
          <th scope="col" className={cn('w-[30%]', LABEL, 'pb-2')}>
            {subjectLabel}
          </th>
          <th scope="col" className={cn('w-[24%]', LABEL, 'pb-2')}>
            {authorLabel}
          </th>
          <th scope="col" className={cn('w-[18%]', LABEL, 'pb-2')}>
            Licence
          </th>
          <th scope="col" className={cn(LABEL, 'pb-2')}>
            Source
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const terms = licenceTerms?.get(row.licence);
          return (
            <tr key={row.file}>
              <td className={CELL}>
                <span className={cn('inline-flex items-center', thumbnail.tile)}>
                  {/* alt="" on purpose: the subject cell beside this is the row's accessible
                      name, and a duplicate would be announced twice. */}
                  <Image
                    src={`${basePath}/${row.file}`}
                    alt=""
                    width={thumbnail.width}
                    height={thumbnail.height}
                    className={thumbnail.image}
                  />
                </span>
              </td>
              <td className={cn(CELL, 'break-words')}>{row.subject}</td>
              <td className={cn(SMALL_CELL, 'break-words')}>{row.author}</td>
              <td className={SMALL_CELL}>
                {terms ? (
                  <a href={terms} target="_blank" rel="noopener noreferrer" className={LINK}>
                    {row.licence}
                  </a>
                ) : (
                  row.licence
                )}
              </td>
              <td className={SMALL_CELL}>
                {/* The Commons titles run past 90 characters, so they are the accessible name
                    rather than the column text — nothing legible fits five columns at 390px. */}
                <a
                  href={row.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={row.sourceTitle}
                  className={LINK}
                >
                  Commons
                  <span aria-hidden="true"> ↗</span>
                </a>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
