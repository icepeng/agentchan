import { useMemo, useRef, useState, useEffect } from "react";
import { segmentSentences } from "@/client/shared/sentenceSegmenter.js";

export interface SentenceAnimationState {
  confirmedSentences: string[];
  animatingIndices: Set<number>;
}

/**
 * Splits streaming text at sentence boundaries and tracks which sentences
 * are newly confirmed so the caller can apply a one-shot entrance animation.
 */
export function useSentenceAnimation(
  streamingText: string,
  isStreaming: boolean,
): SentenceAnimationState {
  const animatedCountRef = useRef(0);
  const [animatingIndices, setAnimatingIndices] = useState<Set<number>>(
    new Set(),
  );

  const { confirmed, pending } = useMemo(
    () => segmentSentences(streamingText),
    [streamingText],
  );

  const confirmedSentences = useMemo(() => {
    if (!isStreaming && pending) {
      return [...confirmed, pending];
    }
    return confirmed;
  }, [confirmed, pending, isStreaming]);

  useEffect(() => {
    const prevCount = animatedCountRef.current;
    const currentCount = confirmedSentences.length;

    if (currentCount > prevCount) {
      const newIndices = new Set<number>();
      for (let i = prevCount; i < currentCount; i++) {
        newIndices.add(i);
      }
      setAnimatingIndices(newIndices);
      animatedCountRef.current = currentCount;

      const timer = setTimeout(() => {
        setAnimatingIndices(new Set());
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [confirmedSentences.length]);

  useEffect(() => {
    if (!streamingText) {
      animatedCountRef.current = 0;
      setAnimatingIndices(new Set());
    }
  }, [streamingText]);

  return { confirmedSentences, animatingIndices };
}
