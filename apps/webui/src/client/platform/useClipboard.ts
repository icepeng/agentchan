import { useCallback, useEffect, useRef, useState } from "react";

export interface UseClipboardOptions {
  resetMs?: number;
}

export interface UseClipboardResult {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
}

export function useClipboard({ resetMs = 1500 }: UseClipboardOptions = {}): UseClipboardResult {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          setCopied(false);
          timerRef.current = null;
        }, resetMs);
        return true;
      } catch {
        return false;
      }
    },
    [resetMs],
  );

  return { copied, copy };
}
