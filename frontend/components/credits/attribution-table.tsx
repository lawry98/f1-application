import Image from 'next/image';

import { cn } from '@/lib/utils';
import { focusRing } from '@/lib/focus';
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
/**
 * `pr-2`, not `pr-3`: at 390px every one of Subject/Author/Licence/Source is fighting for room
 * (see the width comments below), and the 4px this gives back to each body cell's content box is
 * the difference between "Mercedes-" fitting on one line and forcing a break inside "Mercedes"
 * itself.
 */
const CELL = 'border-t border-zinc-800 py-2 pr-2 align-middle text-zinc-300';
const SMALL_CELL = cn(CELL, 'text-[10px] sm:text-xs');
/**
 * The link treatment /teams' credits footer already uses.
 *
 * The ring comes from `lib/focus.ts` rather than being restated, and it is red rather than the
 * `ring-zinc-500` this shipped with: red measures 4.01:1 on `/credits`' bare `bg-zinc-950`, over
 * WCAG 2.4.11's 3:1 non-text bar. Flush — a table cell link is not a filled control, so there is
 * nothing for an offset band to hold the ring off.
 */
const LINK = cn(
  'rounded text-zinc-300 underline decoration-zinc-700 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-zinc-400',
  focusRing,
);

/**
 * Photographs are square crops, so a square box is right. Logos are horizontal lockups running
 * from 0.91:1 to 9.48:1 (the Aston Martin wordmark) — `object-contain` in a 32px square would
 * draw that one ~3.4px tall, so they are sized by height with a wide max-width instead. Same
 * rule, and the same reason, as `components/teams/team-logo.tsx`.
 */
/**
 * `column` is a percentage, not the pixel widths the thumbnails themselves render at, and it's
 * the same percentage for both variants on purpose. `table-fixed` doesn't actually honour a `px`
 * width on this column: it hands the Asset column whatever the four percentage columns
 * (Subject/Author/Licence/Source) don't use, regardless of what's written here — proved by both
 * variants rendering at an identical width even though the old `w-[44px]`/`w-[88px]` values
 * differ by 2x. The one exception is when the *sum* of the four percentages happens to leave
 * this column short of its own literal `px` spec: Chromium then honours that spec instead of the
 * remainder, which silently gave the logo table a wider Asset column than the driver table's at
 * this rebalance's percentages, even though every other column matched. Writing both as the same
 * percentage removes that asymmetry: both tables now get an identical, remainder-sized Asset
 * column, 21% at 390px (75px) — a few px clear of the 88px-thumbnail tile now that dropping the
 * tile's own padding (below) trimmed that tile to 72px.
 */
const THUMBNAIL = {
  photo: {
    column: 'w-[21%]',
    width: 32,
    height: 32,
    image: 'h-8 w-8 rounded object-cover',
    tile: '',
  },
  logo: {
    column: 'w-[21%]',
    width: 72,
    height: 20,
    // `max-w-[72px]` alone paints Aston Martin's 9.48:1 wordmark at ~7.6px and McLaren's 6.78:1
    // at ~10.6px — both under the 16px legibility floor, because `object-contain` letterboxes a
    // wide mark inside a fixed-height box once the width clamp wins. `sm:max-w-[160px]` widens
    // the cap where the Asset column has room (~181px at 1440px, ~150px at 1152px), which clears
    // 16px for every logo at `sm` and up (Aston Martin: 160 / 9.48 ≈ 16.9px). Below `sm` the
    // Asset column is only ~75px wide with five columns and no scroll container allowed, so the
    // 16px floor is genuinely unreachable there — Aston Martin paints 72 / 9.48 ≈ 7.6px at 390px.
    // That is a documented limit, not an oversight: widening the base cap reopens the horizontal
    // overflow this table was rebalanced to close (see the `THUMBNAIL` comment above).
    image: 'h-5 w-auto max-w-[72px] sm:max-w-[160px] object-contain',
    // No horizontal padding: freeing the tile's 16px of `px-2` for the column's own margin
    // against it is what lets Subject/Author/Licence/Source grow below. See their comments.
    tile: 'rounded bg-zinc-900 py-1',
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
          {/* Fix round 1: 15% (54px at 390px) fit "George"/"Russell" but forced a break inside
              "Mercedes" itself before it ever reached the hyphen — the worst unbroken run
              anywhere in either table's Subject column is "Mercedes-" (62px, driven by the row
              whose Team name is "Mercedes-AMG Petronas F1 Team"). 20.5% (73px, 65px of content
              after `pr-2`) clears that with a few px to spare, so the break lands on the hyphen —
              "Mercedes-" / "AMG …" — not inside a letter. */}
          <th scope="col" className={cn('w-[20.5%]', LABEL, 'pb-2')}>
            {subjectLabel}
          </th>
          {/* Sized for "Attributed to" (the logo table's authorLabel), not "Author" — "Attributed"
              alone measures 84px at the 10px mobile size and doesn't have a wrap point, so a
              column sized for the shorter "Author" overflowed into Licence's. 24.5% clears it
              with a few px of margin; it can't give up more than that without reopening the same
              collision this rebalance exists to close. */}
          <th scope="col" className={cn('w-[24.5%]', LABEL, 'pb-2')}>
            {authorLabel}
          </th>
          {/* th labels don't get pr-2 like body cells do, so each column also has to fit its own
              uppercase, tracking-[0.2em] header word with no wrap point: "Licence" alone measures
              57px at the 10px mobile size. The first pass at this rebalance gave it 17% (61px),
              a 3px margin over "Licence" that was the tightest of every header on the page —
              exactly one dropped-word away from repeating the "Source" overlap this column had
              before. 17.5% (63px) doubles that margin; real headroom came from Subject/Author's
              width below and the logo tile's now-unpadded Asset column, not from padding this
              `<th>` — padding a `<th>` whose text already fits doesn't move the text, since it
              renders at its natural width regardless of how much of the column is padding. */}
          <th scope="col" className={cn('w-[17.5%]', LABEL, 'pb-2')}>
            Licence
          </th>
          {/* Explicit, not the table-fixed remainder: at the 88px-wide logo thumbnail column
              and a 390px viewport, the old remainder shrank to ~12px and the un-breakable word
              "Commons" overflowed the cell (and the page) by ~20-26px. Below `sm` the visible
              body text is an arrow only (see the body cell below), so this column's floor is now
              its own "Source" header label (54px), not the body text — 16.5% (59px) leaves a
              real margin over that without taking more than its share from Subject/Author. */}
          <th scope="col" className={cn('w-[16.5%]', LABEL, 'pb-2')}>
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
                    rather than the column text — nothing legible fits five columns at 390px.
                    Below `sm` the visible word is dropped to an arrow only: at 390px this cell
                    was the reason Subject/Author had to stay narrow enough to break driver and
                    team names mid-word. The accessible name is prefixed with the visible word
                    ("Commons: …") so the visible label is contained in the accessible name —
                    WCAG 2.5.3 Label in Name — and `title` surfaces the same title to a sighted
                    reader on hover, which several of the CC BY/BY-SA 2.0 rows' licence terms ask
                    for. The `href` is unchanged either way. */}
                <a
                  href={row.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Commons: ${row.sourceTitle}`}
                  title={row.sourceTitle}
                  className={LINK}
                >
                  <span className="hidden sm:inline">Commons </span>
                  <span aria-hidden="true">↗</span>
                </a>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
