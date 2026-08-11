import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Build-time reader for the two asset credit files.
 *
 * `public/drivers/CREDITS.md` and `public/logos/CREDITS.md` are the canonical record of who
 * made each committed photograph and logo and under what licence; `/credits` renders them so
 * the CC BY / CC BY-SA obligation on the headshots is discharged by a page a reader can
 * actually use rather than by a raw `.md` URL.
 *
 * Tables are matched by their **header row**, never by scanning for filenames. `logos/CREDITS.md`
 * carries a second table — `| File | What it is | What it is missing |` — whose rows also lead
 * with a backticked filename, so a naive scan finds 14 rows for 10 files.
 *
 * Nothing here is forgiving. A row that has drifted out of shape throws and fails the build,
 * because the failure mode that matters on an attribution page is silently rendering an empty
 * author. This is the opposite of the backend's "tools never raise" rule, which is about keeping
 * a degrading LLM pipeline alive and does not apply to reading a file we ship.
 */

export interface CreditRow {
  /** Bare filename as the markdown cites it, e.g. `george-russell.png`. */
  file: string;
  /** The "Driver" or "Team" column. */
  subject: string;
  /** Link text of the Commons source cell: the Commons file title. */
  sourceTitle: string;
  /** Link target of the Commons source cell. */
  sourceUrl: string;
  /** "Author" for photographs, "Attributed to" for public-domain logos. */
  author: string;
  licence: string;
}

export interface MarqueNote {
  file: string;
  whatItIs: string;
  whatItIsMissing: string;
}

const DRIVERS_CREDITS = join(process.cwd(), 'public', 'drivers', 'CREDITS.md');
const LOGOS_CREDITS = join(process.cwd(), 'public', 'logos', 'CREDITS.md');

const DRIVER_HEADER = ['File', 'Driver', 'Commons source', 'Author', 'Licence'];
const LOGO_HEADER = ['File', 'Team', 'Commons source', 'Attributed to', 'Licence'];
const MARQUE_HEADER = ['File', 'What it is', 'What it is missing'];
const TERMS_HEADER = ['Licence', 'Terms'];

const FILE_CELL = /^`([a-z0-9-]+\.(?:png|svg))`$/;
/**
 * `.+` for the URL, anchored on the final `)`, because Commons titles carry literal
 * parentheses — `…_(cropped).jpg` — and `[^)]+` would truncate the href mid-URL.
 */
const LINK_CELL = /^\[(.+)\]\((https:\/\/.+)\)$/;
const SEPARATOR_CELL = /^:?-{3,}:?$/;

function isRow(line: string): boolean {
  return line.trimStart().startsWith('|');
}

/** A markdown row is `| a | b |`, so the split yields an empty first and last cell. */
function cells(line: string): string[] {
  const parts = line.split('|').map((cell) => cell.trim());
  return parts.slice(1, Math.max(parts.length - 1, 1));
}

/**
 * The rows of the one table in `markdown` whose header cells equal `header`, as trimmed cell
 * arrays. `where` names the file in error messages.
 */
export function tableRows(markdown: string, header: string[], where: string): string[][] {
  const lines = markdown.split('\n');
  const label = `| ${header.join(' | ')} |`;

  const headerIndex = lines.findIndex((line) => {
    if (!isRow(line)) return false;
    const found = cells(line);
    return found.length === header.length && found.every((cell, i) => cell === header[i]);
  });
  if (headerIndex === -1) throw new Error(`${where}: no table with header ${label}`);

  const separator = lines[headerIndex + 1] ?? '';
  if (!isRow(separator) || !cells(separator).every((cell) => SEPARATOR_CELL.test(cell))) {
    throw new Error(`${where}: header ${label} is not followed by a |---| separator`);
  }

  const rows: string[][] = [];
  for (let i = headerIndex + 2; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!isRow(line)) break;
    const row = cells(line);
    if (row.length !== header.length) {
      throw new Error(
        `${where}: ${label} row ${rows.length + 1} has ${row.length} cells, expected ${header.length}: ${line}`,
      );
    }
    rows.push(row);
  }
  if (rows.length === 0) throw new Error(`${where}: table ${label} has no rows`);
  return rows;
}

/** `| file | subject | source | author | licence |` rows, validated. */
export function parseCreditRows(markdown: string, header: string[], where: string): CreditRow[] {
  return tableRows(markdown, header, where).map((row) => {
    const fileCell = row[0]!;
    const subject = row[1]!;
    const sourceCell = row[2]!;
    const author = row[3]!;
    const licence = row[4]!;

    const file = FILE_CELL.exec(fileCell);
    if (!file) {
      throw new Error(`${where}: file cell is not a backticked .png or .svg name: ${fileCell}`);
    }
    const link = LINK_CELL.exec(sourceCell);
    if (!link) {
      throw new Error(
        `${where}: ${fileCell} source is not a [title](https://…) link: ${sourceCell}`,
      );
    }
    if (!subject) throw new Error(`${where}: ${fileCell} has an empty subject`);
    if (!author) throw new Error(`${where}: ${fileCell} has an empty author`);
    if (!licence) throw new Error(`${where}: ${fileCell} has an empty licence`);

    return {
      file: file[1]!,
      subject,
      sourceTitle: link[1]!,
      sourceUrl: link[2]!,
      author,
      licence,
    };
  });
}

export function readDriverCredits(): CreditRow[] {
  return parseCreditRows(
    readFileSync(DRIVERS_CREDITS, 'utf8'),
    DRIVER_HEADER,
    'public/drivers/CREDITS.md',
  );
}

export function readLogoCredits(): CreditRow[] {
  return parseCreditRows(
    readFileSync(LOGOS_CREDITS, 'utf8'),
    LOGO_HEADER,
    'public/logos/CREDITS.md',
  );
}

export function readMarqueNotes(): MarqueNote[] {
  const where = 'public/logos/CREDITS.md';
  return tableRows(readFileSync(LOGOS_CREDITS, 'utf8'), MARQUE_HEADER, where).map((row) => {
    const fileCell = row[0]!;
    const whatItIs = row[1]!;
    const whatItIsMissing = row[2]!;

    const file = FILE_CELL.exec(fileCell);
    if (!file) {
      throw new Error(`${where}: marque note file cell is not a backticked name: ${fileCell}`);
    }
    if (!whatItIs || !whatItIsMissing) {
      throw new Error(`${where}: ${fileCell} marque note has an empty cell`);
    }
    return { file: file[1]!, whatItIs, whatItIsMissing };
  });
}

/**
 * Licence name → terms URL, from the "Licence texts" table.
 *
 * The cells are markdown autolinks (`<https://…>`), so the brackets come off. Not every licence
 * a row uses is in here: the driver rows say `CC0` where this table says `CC0 1.0`. That
 * disagreement lives in the source data and is left there — a licence with no entry renders as
 * plain text rather than a link.
 */
export function readLicenceTerms(): Map<string, string> {
  const where = 'public/drivers/CREDITS.md';
  const terms = new Map<string, string>();
  for (const row of tableRows(readFileSync(DRIVERS_CREDITS, 'utf8'), TERMS_HEADER, where)) {
    const name = row[0]!;
    const url = row[1]!.replace(/^</, '').replace(/>$/, '');
    if (!name) throw new Error(`${where}: licence terms row has an empty licence name`);
    if (!/^https:\/\//.test(url)) {
      throw new Error(`${where}: licence "${name}" has no https terms URL: ${row[1]}`);
    }
    terms.set(name, url);
  }
  return terms;
}
