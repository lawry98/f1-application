'use client';

import { ActCompoundLab } from './act-compound-lab';
import { ActStage } from './act-stage';
import { useCompoundSelection } from './use-compound-selection';

/**
 * Acts 1 and 2, which are one interaction split across two environments.
 *
 * The selection lives here rather than in either act because both read it: choosing a compound on
 * the stage has to change what the lab is explaining, and a reader who scrolls past the lab and
 * back expects it to still be describing the tyre they picked. Two hooks would give two answers.
 *
 * This is also the page's only client boundary above the fold — acts 3 and 4 own their own, and
 * everything else is server-rendered.
 */
export function TyreLab() {
  const selection = useCompoundSelection();

  return (
    <>
      <ActStage {...selection} />
      <ActCompoundLab {...selection} />
    </>
  );
}
