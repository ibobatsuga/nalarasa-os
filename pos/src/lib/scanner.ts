import { useEffect, useRef } from 'react';

/**
 * USB barcode scanners are keyboards: they type the code very fast and finish
 * with Enter. We detect that timing signature so no driver, no permission
 * prompt and no extra hardware integration is needed.
 *
 * Typing by hand is slower than MAX_GAP_MS per character, so a cashier using
 * the search box never triggers a scan by accident.
 */
const MAX_GAP_MS = 45;
const MIN_LENGTH = 4;

export function useBarcodeScanner(onScan: (code: string) => void, enabled = true): void {
  const buffer = useRef('');
  const lastAt = useRef(0);
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const gap = now - lastAt.current;
      lastAt.current = now;

      if (e.key === 'Enter') {
        const code = buffer.current;
        buffer.current = '';
        if (code.length >= MIN_LENGTH) {
          e.preventDefault();
          handler.current(code);
        }
        return;
      }

      // A slow keystroke means a human — start the buffer over.
      if (gap > MAX_GAP_MS) buffer.current = '';
      if (e.key.length === 1) buffer.current += e.key;
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
