import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * The link-preview image, shared by `app/opengraph-image.tsx` and `app/twitter-image.tsx`.
 *
 * Both routes take no params and touch no request-time API, so Next renders the PNG once in
 * `pnpm build` and serves the file (`○` in the build's route list) — no request ever runs this.
 *
 * Satori draws with inline styles and cannot read the theme, so the colours are the theme's hex
 * values written out; `tests/share-image.test.ts` holds them to `tailwind.config.ts`.
 */
export const SHARE_IMAGE_COLORS = {
  base: '#09090B',
  ink: '#F4F4ED',
  red: '#E10600',
  /** `zinc-400`, the site's body-copy grey: 7.76:1 on `base`. */
  muted: '#A1A1AA',
} as const;

export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 };
export const SHARE_IMAGE_ALT =
  'F1 Briefing Agent — AI-powered race weekend briefings for any Grand Prix.';

/**
 * The site's own faces, as WOFF from `@fontsource`. Satori reads TTF, OTF and WOFF but not WOFF2,
 * and `next/font/google` only ever fetches WOFF2, so the files the pages use cannot be reused.
 * Static instances on purpose: Satori draws a variable font at its default instance, which for
 * Archivo is weight 400 — not the `font-black` the site's display headlines are set in.
 */
function font(pkg: string, file: string): Promise<Buffer> {
  return readFile(join(process.cwd(), 'node_modules', '@fontsource', pkg, 'files', file));
}

export async function renderShareImage(): Promise<ImageResponse> {
  const [archivoBlack, interRegular] = await Promise.all([
    font('archivo', 'archivo-latin-900-normal.woff'),
    font('inter', 'inter-latin-400-normal.woff'),
  ]);
  const { base, ink, red, muted } = SHARE_IMAGE_COLORS;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 88px',
        background: base,
      }}
    >
      {/* The wordmark: the nav's red dot, then the name set like the site's display headlines.
            The dot sits on the first line's cap height, as it does beside the nav's one-line
            wordmark; centred on both lines it floated between them. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32 }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: red, marginTop: 38 }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Archivo',
            fontWeight: 900,
            fontSize: 132,
            lineHeight: 0.9,
            letterSpacing: '-0.035em',
            color: ink,
          }}
        >
          <span>F1 BRIEFING</span>
          <span>AGENT</span>
        </div>
      </div>
      <div style={{ width: 96, height: 6, background: red, marginTop: 56, marginLeft: 68 }} />
      <div
        style={{
          marginTop: 32,
          marginLeft: 68,
          fontFamily: 'Inter',
          fontSize: 34,
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          color: muted,
        }}
      >
        AI-powered race weekend briefings for any Grand Prix.
      </div>
    </div>,
    {
      ...SHARE_IMAGE_SIZE,
      fonts: [
        { name: 'Archivo', data: archivoBlack, weight: 900, style: 'normal' },
        { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
      ],
    },
  );
}
