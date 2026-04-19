import { useRef, useEffect } from "react";

/**
 * Mutable ref whose `.current` is kept in sync with `value` after each commit.
 * Read from effects/callbacks that deliberately narrow their deps but must see
 * the latest value — e.g. long-lived effects that would otherwise tear down
 * expensive imperative widgets on every keystroke.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);
  return ref;
}
