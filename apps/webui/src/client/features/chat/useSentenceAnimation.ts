import { useRef, useState, useEffect, useLayoutEffect } from "react";
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
  text: string,
  isStreaming: boolean,
): SentenceAnimationState {
  const animatedCountRef = useRef(0);
  const [animatingIndices, setAnimatingIndices] = useState<Set<number>>(
    new Set(),
  );

  const { confirmed, pending } = segmentSentences(text);

  const confirmedSentences =
    !isStreaming && pending ? [...confirmed, pending] : confirmed;

  useLayoutEffect(() => {
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
    if (!text) {
      animatedCountRef.current = 0;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 텍스트가 비었을 때 애니메이션 상태를 즉시 리셋한다.
      setAnimatingIndices(new Set());
    }
  }, [text]);

  return { confirmedSentences, animatingIndices };
}
