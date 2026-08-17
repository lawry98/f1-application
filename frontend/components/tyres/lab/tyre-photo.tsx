import Image from 'next/image';

import type { RaceCompound } from '@/data/tyres-data';
import { cn } from '@/lib/utils';

/**
 * The official product render for a compound.
 *
 * The filenames in `public/tyres/` are the `RaceCompound` ids, so the mapping is the id itself
 * and there is no lookup table to fall out of sync. See `public/tyres/CREDITS.md` for where these
 * came from and the rights position — they are **not** openly licensed.
 *
 * All five renders are 1200x1200 with alpha and identical framing, which is what lets a
 * compound swap be a straight crossfade with no reflow: the box is square everywhere and the
 * intrinsic size is passed so Next reserves it before the bytes land.
 */
export interface TyrePhotoProps {
  compound: RaceCompound;
  /** Rendered width in px at the largest breakpoint, for `sizes`. */
  sizes?: string;
  priority?: boolean;
  className?: string;
}

export function TyrePhoto({ compound, sizes = '(max-width: 768px) 90vw, 44vw', priority = false, className }: TyrePhotoProps) {
  return (
    <Image
      src={`/tyres/${compound.id}.webp`}
      alt={`${compound.name} compound tyre`}
      width={1200}
      height={1200}
      sizes={sizes}
      priority={priority}
      className={cn('h-auto w-full select-none', className)}
      draggable={false}
    />
  );
}
