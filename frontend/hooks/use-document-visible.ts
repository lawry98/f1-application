'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the document is currently visible.
 *
 * Starts `true` — on the server and on the first client render — and corrects itself in an effect.
 * The asymmetry is the opposite of `useMediaQuery`'s and deliberately so: this gates an animation
 * rather than a mount, and a scene that starts frozen and unfreezes one effect later is a visible
 * stutter every time the inspector opens. Being briefly wrong in a backgrounded tab costs a single
 * frame nobody is looking at.
 */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}
