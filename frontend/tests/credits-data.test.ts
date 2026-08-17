import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseCreditRows,
  parseLicenceTerms,
  parseMarqueNotes,
  readDriverCredits,
  readLicenceTerms,
  readLogoCredits,
  readMarqueNotes,
  tableRows,
} from '@/lib/credits';

// Resolved from the cwd, not `import.meta.url`: under the jsdom environment `import.meta.url`
// is not a file: URL, so fileURLToPath throws at import time. Vitest runs from `frontend/`.
function assets(dir: string, ext: string): string[] {
  return readdirSync(join(process.cwd(), 'public', dir))
    .filter((f) => f.endsWith(ext))
    .sort();
}

const DRIVER_HEADER = ['File', 'Driver', 'Commons source', 'Author', 'Licence'];

describe('credit table parsing', () => {
  // THE regression guard for this module. `logos/CREDITS.md` has a second table whose four rows
  // also lead with a backticked filename, so a naive `\`*.svg\`` scan finds 14 rows for 10 files.
  it('reads ten logo credits, not the fourteen a filename scan would find', () => {
    const rows = readLogoCredits();
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.file).sort()).toEqual(assets('logos', '.svg'));
  });

  it('credits every committed headshot exactly once', () => {
    const rows = readDriverCredits();
    expect(rows.map((r) => r.file).sort()).toEqual(assets('drivers', '.png'));
  });

  it('gives every row an author, a licence, a subject and a Commons source', () => {
    for (const row of [...readDriverCredits(), ...readLogoCredits()]) {
      expect(row.author, `${row.file} author`).not.toBe('');
      expect(row.licence, `${row.file} licence`).not.toBe('');
      expect(row.subject, `${row.file} subject`).not.toBe('');
      expect(row.sourceTitle, `${row.file} source title`).not.toBe('');
      expect(row.sourceUrl, `${row.file} source url`).toMatch(
        /^https:\/\/commons\.wikimedia\.org\//,
      );
    }
  });

  // The Commons titles carry literal parentheses, so a `[^)]+` URL pattern silently truncates
  // the href. This row is the shortest one that proves the greedy match is right.
  it('keeps parentheses inside a source URL', () => {
    const alonso = readDriverCredits().find((r) => r.file === 'fernando-alonso.png');
    expect(alonso?.sourceUrl).toBe(
      'https://commons.wikimedia.org/wiki/File:Alonso-68_(24710447098).jpg',
    );
  });

  it('reads the four marque notes, each naming a committed logo', () => {
    const notes = readMarqueNotes();
    expect(notes).toHaveLength(4);
    const logos = new Set(assets('logos', '.svg'));
    for (const note of notes) {
      expect(logos.has(note.file), note.file).toBe(true);
      expect(note.whatItIs).not.toBe('');
      expect(note.whatItIsMissing).not.toBe('');
    }
    expect(notes.find((n) => n.file === 'ferrari.svg')?.whatItIs).toBe('the Ferrari wordmark');
  });

  it('maps licence names to their terms URLs, stripping the autolink brackets', () => {
    const terms = readLicenceTerms();
    expect(terms.get('CC BY-SA 4.0')).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(terms.get('OGL 3')).toBe(
      'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    );
  });

  // The source data disagrees with itself: driver rows say `CC0`, the terms table says `CC0 1.0`.
  // That is left alone on purpose — an unlinked licence name is fine, a rewritten source file is
  // not — so exactly one licence in use has no terms entry, and the table renders it as text.
  it('leaves CC0 without a terms entry and every other licence in use with one', () => {
    const terms = readLicenceTerms();
    const used = new Set(readDriverCredits().map((r) => r.licence));
    const unlinked = Array.from(used).filter((licence) => !terms.has(licence));
    expect(unlinked).toEqual(['CC0']);
  });
});

describe('credit table parsing failures', () => {
  const header = ['File', 'Driver', 'Commons source', 'Author', 'Licence'];
  const good =
    '| `a.png` | A | [t](https://commons.wikimedia.org/wiki/File:t.jpg) | Author | CC BY 4.0 |';

  function md(...rows: string[]): string {
    return ['# doc', '', `| ${header.join(' | ')} |`, '|---|---|---|---|---|', ...rows, ''].join(
      '\n',
    );
  }

  it('throws when the header row is absent', () => {
    expect(() => parseCreditRows('# doc\n\nno tables here\n', header, 'x.md')).toThrow(
      /no table with header/,
    );
  });

  it('throws when the header is not followed by a separator', () => {
    const noSeparator = ['# doc', '', `| ${header.join(' | ')} |`, good, ''].join('\n');
    expect(() => parseCreditRows(noSeparator, header, 'x.md')).toThrow(/separator/);
  });

  it('throws when the table has no rows', () => {
    expect(() => parseCreditRows(md(), header, 'x.md')).toThrow(/has no rows/);
  });

  it('throws on a row with too few cells', () => {
    expect(() => parseCreditRows(md('| `a.png` | A | CC BY 4.0 |'), header, 'x.md')).toThrow(
      /has 3 cells, expected 5/,
    );
  });

  it('throws on an empty subject', () => {
    const empty =
      '| `a.png` |  | [t](https://commons.wikimedia.org/wiki/File:t.jpg) | Author | CC BY 4.0 |';
    expect(() => parseCreditRows(md(empty), header, 'x.md')).toThrow(/empty subject/);
  });

  it('throws on an empty author', () => {
    const empty =
      '| `a.png` | A | [t](https://commons.wikimedia.org/wiki/File:t.jpg) |  | CC BY 4.0 |';
    expect(() => parseCreditRows(md(empty), header, 'x.md')).toThrow(/empty author/);
  });

  it('throws on an empty licence', () => {
    const empty =
      '| `a.png` | A | [t](https://commons.wikimedia.org/wiki/File:t.jpg) | Author |  |';
    expect(() => parseCreditRows(md(empty), header, 'x.md')).toThrow(/empty licence/);
  });

  it('throws when the source cell is not a markdown link', () => {
    const bare = '| `a.png` | A | commons.wikimedia.org/wiki/File:t.jpg | Author | CC BY 4.0 |';
    expect(() => parseCreditRows(md(bare), header, 'x.md')).toThrow(/not a \[title\]/);
  });

  it('throws when the file cell is not a backticked asset name', () => {
    const bad =
      '| a.png | A | [t](https://commons.wikimedia.org/wiki/File:t.jpg) | Author | CC BY 4.0 |';
    expect(() => parseCreditRows(md(bad), header, 'x.md')).toThrow(/backticked/);
  });

  it('stops at the first line that is not a table row', () => {
    const twoTables = [
      '| File | Driver | Commons source | Author | Licence |',
      '|---|---|---|---|---|',
      good,
      '',
      '## Another table',
      '',
      '| File | What it is | What it is missing |',
      '|---|---|---|',
      '| `a.png` | a thing | another thing |',
    ].join('\n');
    expect(tableRows(twoTables, DRIVER_HEADER, 'x.md')).toHaveLength(1);
  });
});

describe('marque note parsing failures', () => {
  const header = ['File', 'What it is', 'What it is missing'];

  function md(...rows: string[]): string {
    return ['# doc', '', `| ${header.join(' | ')} |`, '|---|---|---|', ...rows, ''].join('\n');
  }

  it('throws when the file cell is not a backticked name', () => {
    const bad = '| a.svg | a thing | another thing |';
    expect(() => parseMarqueNotes(md(bad), 'x.md')).toThrow(/backticked name/);
  });

  it('throws on an empty cell', () => {
    const empty = '| `a.svg` | a thing |  |';
    expect(() => parseMarqueNotes(md(empty), 'x.md')).toThrow(/empty cell/);
  });
});

describe('licence terms parsing failures', () => {
  const header = ['Licence', 'Terms'];

  function md(...rows: string[]): string {
    return ['# doc', '', `| ${header.join(' | ')} |`, '|---|---|', ...rows, ''].join('\n');
  }

  it('throws on an empty licence name', () => {
    const empty = '|  | <https://creativecommons.org/licenses/by/4.0/> |';
    expect(() => parseLicenceTerms(md(empty), 'x.md')).toThrow(/empty licence name/);
  });

  it('throws when the terms URL is not https', () => {
    const bad = '| CC BY 4.0 | <http://creativecommons.org/licenses/by/4.0/> |';
    expect(() => parseLicenceTerms(md(bad), 'x.md')).toThrow(/no https terms URL/);
  });
});
